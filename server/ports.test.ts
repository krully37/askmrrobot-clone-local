import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_API_PORT, findAvailablePort, isPortFree, requestedApiPort } from './ports.js';

const open: Server[] = [];
function hold(port: number) {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      open.push(server);
      resolve((server.address() as { port: number }).port);
    });
  });
}

afterEach(async () => {
  await Promise.all(open.splice(0).map(server => new Promise(done => server.close(done))));
  delete process.env.LOCALSIMDASH_PORT;
});

describe('port selection', () => {
  it('reports a port nobody holds as free', async () => {
    const port = await hold(0);
    open.splice(0).forEach(server => server.close());
    expect(await isPortFree(port)).toBe(true);
  });

  it('reports a held port as taken', async () => {
    const port = await hold(0);
    expect(await isPortFree(port)).toBe(false);
  });

  it('keeps the preferred port when it is free', async () => {
    const port = await hold(0);
    open.splice(0).forEach(server => server.close());
    expect(await findAvailablePort(port)).toBe(port);
  });

  it('steps past a port another process already holds', async () => {
    const taken = await hold(0);
    const chosen = await findAvailablePort(taken);
    expect(chosen).toBeGreaterThan(taken);
    expect(await isPortFree(chosen)).toBe(true);
  });

  it('gives up with a clear message rather than scanning forever', async () => {
    const taken = await hold(0);
    await expect(findAvailablePort(taken, '127.0.0.1', 1)).rejects.toThrow(/No free port found/);
  });

  it('falls back to the documented default when the override is unusable', () => {
    process.env.LOCALSIMDASH_PORT = 'not-a-port';
    expect(requestedApiPort()).toBe(DEFAULT_API_PORT);
    process.env.LOCALSIMDASH_PORT = '99999';
    expect(requestedApiPort()).toBe(DEFAULT_API_PORT);
  });

  it('honours a valid override', () => {
    process.env.LOCALSIMDASH_PORT = '4400';
    expect(requestedApiPort()).toBe(4400);
  });
});
