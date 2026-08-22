import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadVariantSeed, variantSeedPath } from '../server/variants.js';

const db = new Database(join(process.cwd(), '.localsimdash', 'catalog', 'catalog.db'));
const csvFiles = [
  'caster-leather-mythic-dungeon-pool-hero-myth-stats - Untitled.csv',
  'cloth-mythic-dungeon-pool-hero-myth-stats - Untitled.csv',
  'mail-mythic-dungeon-pool-hero-myth-stats - Untitled.csv',
  'plate-mythic-dungeon-pool-hero-myth-stats - Untitled.csv'
];

const itemIds = new Set<number>();
for (const file of csvFiles) {
  try {
    const text = readFileSync(join(process.cwd(), file), 'utf8');
    const matches = [...text.matchAll(/(?:^|\n)[^,\n]+,(\d{5,7}),/g)];
    for (const match of matches) {
      const id = parseInt(match[1], 10);
      if (!isNaN(id) && id > 0) {
        itemIds.add(id);
      }
    }
  } catch (e) {
    console.error(`Skipping ${file}: ${e}`);
  }
}

const seed = loadVariantSeed();
const seedPath = variantSeedPath();
const existingKeys = new Set(seed.records.map(r => `${r.source}|${r.boss}|${r.difficulty}|${r.itemId}`));

const query = db.prepare(`
  SELECT v.item_id, e.name AS boss, i.name AS source, v.difficulty, v.track, v.item_level, v.client_build
  FROM item_variants v
  JOIN encounters e ON v.encounter_id = e.id
  JOIN instances i ON e.instance_id = i.id
  WHERE v.item_id = ? AND v.difficulty = 'Mythic+'
`);

let added = 0;
for (const itemId of itemIds) {
  const rows = query.all(itemId) as any[];
  for (const row of rows) {
    const key = `${row.source}|${row.boss}|${row.difficulty}|${row.item_id}`;
    if (!existingKeys.has(key)) {
      seed.records.push({
        source: row.source,
        boss: row.boss,
        difficulty: row.difficulty,
        track: row.track,
        itemId: row.item_id,
        itemLevel: row.item_level,
        simcFragment: `id=${row.item_id},ilevel=${row.item_level}`,
        provenance: 'Spreadsheet import',
        capturedAt: new Date().toISOString(),
        clientBuild: row.client_build
      });
      existingKeys.add(key);
      added++;
    }
  }
}

writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
console.log(`Added ${added} new Mythic+ variant records to the seed.`);
