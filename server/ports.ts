import { createServer } from 'node:net';

/**
 * Binding a hardcoded port and hoping it is free is how this app used to fail:
 * an unrelated local service held 4317, the API died with EADDRINUSE, and the
 * dashboard came up with every request refused. Ports are shared machine state,
 * so check before claiming one.
 */
export const DEFAULT_API_PORT = 4317;
export const DEFAULT_UI_PORT = 5173;

export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise(resolve => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    // exclusive stops the probe from sharing a port another process already has.
    probe.listen({ port, host, exclusive: true });
  });
}

/**
 * Return `preferred` when it is free, otherwise the next free port above it.
 * Scans a bounded range so a pathological machine fails with a clear error
 * rather than looping.
 */
export async function findAvailablePort(preferred: number, host = '127.0.0.1', attempts = 50): Promise<number> {
  for (let port = preferred; port < preferred + attempts; port++) {
    if (port > 65535) break;
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`No free port found between ${preferred} and ${preferred + attempts - 1}. Close whatever is holding them and try again.`);
}

/** The port the user asked for, or the documented default. */
export function requestedApiPort(): number {
  const configured = Number(process.env.LOCALSIMDASH_PORT);
  return Number.isInteger(configured) && configured > 0 && configured <= 65535 ? configured : DEFAULT_API_PORT;
}
