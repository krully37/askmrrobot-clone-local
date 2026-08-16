import { describe, expect, it } from 'vitest';
import { discoverLatest, parseNightly } from './runtime.js';

describe('managed SimC runtime discovery', () => {
  it('selects and identifies the official Windows nightly archive', () => {
    const build=parseNightly(`<a href="https://download.simulationcraft.org/nightly/simc-1205.01.d5dc343-win64.7z">Windows</a>`);
    expect(build.id).toBe('simc-1205.01.d5dc343-win64');
    expect(build.url).toContain('simc-1205.01.d5dc343-win64.7z');
  });
  it('rejects pages without a Windows nightly package', () => {
    expect(()=>parseNightly('<a href="simc-macos.7z">macOS</a>')).toThrow(/Windows nightly/);
  });
  it('follows the official page to its published nightly index', async () => {
    const requested:string[]=[];
    const fetcher=(async (url:RequestInfo|URL) => { requested.push(String(url)); return requested.length===1
      ? new Response('<a href="http://downloads.simulationcraft.org/nightly/?C=M;O=D">nightly</a>')
      : new Response('<a href="simc-1205.01.d5dc343-win64.7z">nightly</a>'); }) as typeof fetch;
    await expect(discoverLatest(fetcher)).resolves.toMatchObject({id:'simc-1205.01.d5dc343-win64'});
    expect(requested[1]).toMatch(/^http:\/\/downloads\.simulationcraft\.org\/nightly/);
  });
});
