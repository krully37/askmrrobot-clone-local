import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = mkdtempSync(join(tmpdir(), 'localsimdash-icons-'));
// A non-empty primary store stops storageRoot() from importing the repository's
// own data directory into this temporary one.
mkdirSync(join(root, 'catalog'), { recursive: true });
writeFileSync(join(root, 'catalog', 'catalog.db'), 'placeholder');
process.env.LOCALSIMDASH_ROOT = root;
delete process.env.BLIZZARD_CLIENT_ID;
delete process.env.BLIZZARD_CLIENT_SECRET;

const { itemIcon } = await import('./item-media.js');

const media = join(root, 'catalog-media');
const png = Buffer.from('89504e470d0a1a0a', 'hex');
const jpeg = Buffer.from('ffd8ffe000104a464946', 'hex');
const image = (mime: string, bytes: Buffer) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': mime } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('item icon media', () => {
  it('serves a cached icon without touching the network', async () => {
    mkdirSync(media, { recursive: true });
    writeFileSync(join(media, '1001.png'), png);

    await expect(itemIcon(1001)).resolves.toEqual({ bytes: png, mime: 'image/png' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the public CDN when Blizzard credentials are absent', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ icon: 'inv_mace_25' }), { status: 200 }))
      .mockResolvedValueOnce(image('image/jpeg', jpeg));

    const icon = await itemIcon(1002);

    expect(icon?.mime).toBe('image/jpeg');
    expect(fetchMock.mock.calls[1][0]).toBe('https://wow.zamimg.com/images/wow/icons/large/inv_mace_25.jpg');
    // The extension follows the served type, so the bytes are not replayed
    // later under the wrong one.
    expect(readFileSync(join(media, '1002.jpg'))).toEqual(jpeg);
  });

  it('refuses an icon slug that is not a plain file name', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ icon: '../../secret' }), { status: 200 }));

    await expect(itemIcon(1003)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('will not cache an error page as though it were art', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ icon: 'inv_gone' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('<html>not found</html>', { status: 200, headers: { 'content-type': 'text/html' } }));

    await expect(itemIcon(1004)).resolves.toBeUndefined();
  });

  it('remembers a miss so one render does not retry every failure', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));

    await expect(itemIcon(1005)).resolves.toBeUndefined();
    await expect(itemIcon(1005)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent requests for the same icon onto one lookup', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ icon: 'inv_sword_1h' }), { status: 200 }))
      .mockResolvedValueOnce(image('image/jpeg', jpeg));

    const [first, second] = await Promise.all([itemIcon(1006), itemIcon(1006)]);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an id that is not a positive integer', async () => {
    await expect(itemIcon(Number('nope'))).resolves.toBeUndefined();
    await expect(itemIcon(-1)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
