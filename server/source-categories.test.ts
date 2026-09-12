import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The catalog modules resolve their storage root once at import time, so the
 * temporary root has to be in the environment before the dynamic import below.
 */
let installSourceCategories: typeof import('./derived-catalog.js').installSourceCategories;
let catalogSourceCategories: typeof import('./catalog.js').catalogSourceCategories;
let pathsForCatalog: typeof import('./catalog.js').pathsForCatalog;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'localsimdash-categories-'));
  process.env.LOCALSIMDASH_ROOT = root;
  ({ installSourceCategories } = await import('./derived-catalog.js'));
  ({ catalogSourceCategories, pathsForCatalog } = await import('./catalog.js'));
});

describe('current-season source categories', () => {
  it('reads the temporary root rather than the developer catalog', () => {
    expect(pathsForCatalog().catalogPath.startsWith(root)).toBe(true);
  });

  it('seeds every pinned category without a DB2 package', () => {
    const seeded = installSourceCategories();

    expect(seeded.categories).toBe(7);
    const categories = catalogSourceCategories();
    expect(categories.map(x => x.id).sort()).toEqual(['bonus-roll', 'catalyst', 'crafted', 'delve', 'great-vault', 'mythic-plus', 'raid-lair']);
  });

  it('exposes the capture mode and tracks each category needs', () => {
    installSourceCategories();

    const vault = catalogSourceCategories().find(x => x.id === 'great-vault');
    expect(vault?.captureMode).toBe('link');
    expect(vault?.tracks).toEqual(['Raid', 'Mythic+', 'Delve']);
  });

  it('re-seeding is idempotent rather than additive', () => {
    installSourceCategories();
    installSourceCategories();

    expect(catalogSourceCategories()).toHaveLength(7);
  });
});
