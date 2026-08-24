import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasLocalState, storageRoot } from './storage.js';

describe('local storage continuity', () => {
  it('keeps the original web store as the default', () => {
    const base = mkdtempSync(join(tmpdir(), 'localsimdash-storage-'));
    const legacy = join(base, '.localsimdash');
    mkdirSync(legacy);
    writeFileSync(join(legacy, 'dashboard.db'), 'saved-character-data');

    expect(storageRoot({}, base, join(base, 'home'))).toBe(legacy);
  });

  it('copies a legacy web store into an empty Electron store without removing it', () => {
    const base = mkdtempSync(join(tmpdir(), 'localsimdash-storage-'));
    const legacy = join(base, '.localsimdash');
    const electron = join(base, 'electron-data');
    mkdirSync(join(legacy, 'catalog'), { recursive: true });
    writeFileSync(join(legacy, 'dashboard.db'), 'saved-character-data');
    writeFileSync(join(legacy, 'catalog', 'catalog.db'), 'saved-catalog-data');
    writeFileSync(join(legacy, 'settings.json'), '{"simcPath":"C:/simc.exe"}');

    expect(storageRoot({ LOCALSIMDASH_ROOT: electron }, base, join(base, 'home'))).toBe(electron);
    expect(hasLocalState(electron)).toBe(true);
    expect(hasLocalState(legacy)).toBe(true);
  });

  it('recovers data even when Electron has already written a setting', () => {
    const base = mkdtempSync(join(tmpdir(), 'localsimdash-storage-'));
    const legacy = join(base, '.localsimdash');
    const electron = join(base, 'electron-data');
    mkdirSync(legacy);
    mkdirSync(electron);
    writeFileSync(join(legacy, 'dashboard.db'), 'saved-character-data');
    writeFileSync(join(electron, 'settings.json'), '{"simcPath":"C:/new-simc.exe"}');

    storageRoot({ LOCALSIMDASH_ROOT: electron }, base, join(base, 'home'));
    expect(hasLocalState(electron)).toBe(true);
  });

  it('uses the per-user fallback when the web folder has no state', () => {
    const base = mkdtempSync(join(tmpdir(), 'localsimdash-storage-'));
    const home = join(base, 'home');
    const fallback = join(home, '.localsimdash');
    mkdirSync(fallback, { recursive: true });
    writeFileSync(join(fallback, 'settings.json'), '{"simcPath":"C:/simc.exe"}');

    expect(storageRoot({}, base, home)).toBe(fallback);
  });
});
