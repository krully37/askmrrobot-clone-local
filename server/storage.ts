import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * The dashboard originally kept its local state next to the web application.
 * Electron uses an AppData directory instead, so an empty Electron install must
 * adopt that earlier store rather than silently starting with an empty catalog.
 */
export function hasLocalState(root: string) {
  const files = [
    join(root, 'dashboard.db'),
    join(root, 'catalog', 'catalog.db'),
    join(root, 'settings.json'),
  ];
  return files.some(file => {
    try { return existsSync(file) && statSync(file).size > 0; } catch { return false; }
  });
}

function hasPrimaryData(root: string) {
  const files = [join(root, 'dashboard.db'), join(root, 'catalog', 'catalog.db')];
  return files.some(file => {
    try { return existsSync(file) && statSync(file).size > 0; } catch { return false; }
  });
}

function samePath(left: string, right: string) {
  return resolve(left).toLocaleLowerCase() === resolve(right).toLocaleLowerCase();
}

/** Copies, never moves, an existing store so the old web data remains a backup. */
export function recoverLocalState(target: string, candidates: string[]) {
  // A previously saved setting alone is not a user-data store. Preserve that
  // setting while still recovering the catalog and character database.
  if (hasPrimaryData(target)) return undefined;
  const source = candidates.find(candidate => !samePath(candidate, target) && hasLocalState(candidate));
  if (!source) return undefined;
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
  return source;
}

export function storageRoot(environment: NodeJS.ProcessEnv = process.env, cwd = process.cwd(), home = homedir()) {
  const legacyWebRoot = join(cwd, '.localsimdash');
  const fallbackRoot = join(home, '.localsimdash');
  const configuredRoot = environment.LOCALSIMDASH_ROOT;

  if (configuredRoot) {
    // Electron provides this AppData location. Import the web store once when
    // it is empty, retaining the source directory as a recoverable backup.
    recoverLocalState(configuredRoot, [legacyWebRoot, fallbackRoot]);
    return configuredRoot;
  }

  // Preserve the original web-server convention. If the web folder no longer
  // has a store, a previously written per-user store is still usable.
  if (!hasLocalState(legacyWebRoot) && hasLocalState(fallbackRoot)) return fallbackRoot;
  mkdirSync(legacyWebRoot, { recursive: true });
  return legacyWebRoot;
}
