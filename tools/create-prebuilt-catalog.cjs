/* Creates the distributable catalog from a locally refreshed catalog.
   It deliberately excludes imported character items, custom entries, local
   addon captures, local DB2 metadata, and diagnostics before publishing. */
const Database = require('better-sqlite3');
const { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = process.cwd();
const source = join(root, '.localsimdash', 'catalog', 'catalog.db');
const sourceManifest = join(root, '.localsimdash', 'catalog', 'manifest.json');
const target = join(root, 'data', 'catalog.db');
const targetManifest = join(root, 'data', 'catalog.manifest.json');

if (!existsSync(source) || statSync(source).size === 0) {
  throw new Error('Refresh a local catalog before creating the bundled catalog.');
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
const db = new Database(target);
db.exec(`
  PRAGMA foreign_keys = OFF;
  DELETE FROM items WHERE source <> 'Blizzard Game Data API';
  DELETE FROM loot_drops WHERE item_id NOT IN (SELECT id FROM items);
  DELETE FROM item_variants
    WHERE provenance = 'LocalSimDashCatalog addon capture'
       OR item_id NOT IN (SELECT id FROM items);
  DELETE FROM derived_item_metadata WHERE item_id NOT IN (SELECT id FROM items);
  DELETE FROM derived_enhancements;
  DELETE FROM catalog_build_diagnostics;
  DELETE FROM enhancements WHERE provenance = 'imported' OR id LIKE 'imported-%';
  PRAGMA foreign_keys = ON;
  VACUUM;
`);

const count = table => Number(db.prepare(`SELECT count(*) AS value FROM ${table}`).get().value);
const counts = {
  instances: count('instances'),
  encounters: count('encounters'),
  items: count('items'),
  drops: count('loot_drops'),
  variants: count('item_variants'),
};
db.close();

const previous = existsSync(sourceManifest) ? JSON.parse(readFileSync(sourceManifest, 'utf8')) : {};
const manifest = {
  version: `${previous.version || 'retail'}-bundled`,
  schemaVersion: 2,
  season: previous.season || 'Retail',
  displayName: `${previous.displayName || 'Retail'} bundled catalog`,
  game: previous.game || 'Retail',
  generatedAt: previous.generatedAt || new Date().toISOString(),
  checksum: 'bundled-public-catalog',
  counts,
  notes: 'Bundled public catalog. It contains no imported profiles, local addon captures, local DB2 data, or diagnostics.',
};
writeFileSync(targetManifest, JSON.stringify(manifest, null, 2));
console.log(`Bundled catalog created: ${counts.items} items, ${counts.drops} drops, ${counts.variants} variants.`);
