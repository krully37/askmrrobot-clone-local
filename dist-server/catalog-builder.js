import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlizzardClient, blizzardConfig } from './blizzard.js';
import { installCatalogPackage, pathsForCatalog } from './catalog.js';
import { installVariants, loadVariantSeed } from './variants.js';
const dataManifest = join(process.cwd(), 'data', 'season-manifest.json');
const slotMap = { HEAD: 'head', NECK: 'neck', SHOULDER: 'shoulder', CLOAK: 'back', CHEST: 'chest', WRIST: 'wrist', HANDS: 'hands', WAIST: 'waist', LEGS: 'legs', FEET: 'feet', FINGER: 'finger1', TRINKET: 'trinket1', ONE_HANDED: 'main_hand', TWO_HANDED: 'main_hand', MAIN_HAND: 'main_hand', OFF_HAND: 'off_hand', RANGED: 'main_hand' };
const handedness = (type) => type === 'ONE_HANDED' ? 'one-hand' : type === 'TWO_HANDED' ? 'two-hand' : type === 'MAIN_HAND' ? 'main-hand-only' : type === 'OFF_HAND' ? 'off-hand-only' : 'unknown';
export function loadSeasonManifest(path = dataManifest) { if (!existsSync(path))
    throw new Error(`Season manifest not found: ${path}`); const manifest = JSON.parse(readFileSync(path, 'utf8')); if (!manifest.season || !manifest.include?.length)
    throw new Error('Season manifest must include a season and at least one source.'); return manifest; }
function collectEncounterIds(instance) { const all = []; const walk = (value) => { if (!value)
    return; if (Array.isArray(value)) {
    value.forEach(walk);
    return;
} if (typeof value === 'object') {
    if (value.id && (value.name || value.creature_display))
        all.push(value);
    for (const [key, child] of Object.entries(value))
        if (key !== 'id')
            walk(child);
} }; walk(instance.encounters || instance); return [...new Map(all.map(x => [x.id, x])).values()]; }
function collectItemIds(encounter) { const ids = new Set(); const walk = (value) => { if (!value)
    return; if (Array.isArray(value)) {
    value.forEach(walk);
    return;
} if (typeof value === 'object') {
    const item = value.item || value;
    if (item.id && (item.name || value.item))
        ids.add(Number(item.id));
    for (const child of Object.values(value))
        walk(child);
} }; walk(encounter.items || encounter); return [...ids]; }
function initialize(db) { db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE instances (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL); CREATE TABLE encounters (id INTEGER PRIMARY KEY, instance_id INTEGER NOT NULL REFERENCES instances(id), name TEXT NOT NULL); CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slot TEXT NOT NULL, item_level INTEGER, source TEXT, unique_key TEXT, simc_line TEXT, handedness TEXT NOT NULL DEFAULT 'unknown'); CREATE TABLE loot_sources (id TEXT PRIMARY KEY, season TEXT NOT NULL, instance_name TEXT NOT NULL, boss TEXT NOT NULL, difficulty TEXT NOT NULL); CREATE TABLE loot_drops (encounter_id INTEGER NOT NULL REFERENCES encounters(id), item_id INTEGER NOT NULL REFERENCES items(id), difficulty TEXT NOT NULL, PRIMARY KEY(encounter_id,item_id,difficulty)); CREATE TABLE item_variants (id TEXT PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id), encounter_id INTEGER NOT NULL REFERENCES encounters(id), season TEXT NOT NULL, difficulty TEXT NOT NULL, track TEXT NOT NULL DEFAULT '', item_level INTEGER NOT NULL, bonus_ids TEXT NOT NULL, simc_fragment TEXT NOT NULL, provenance TEXT NOT NULL, captured_at TEXT NOT NULL, client_build TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(item_id,encounter_id,difficulty,track)); CREATE TABLE item_sets (id INTEGER PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE enhancements (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, slots TEXT NOT NULL, simc_fragment TEXT NOT NULL, weapon_hands TEXT NOT NULL DEFAULT '[]', provenance TEXT NOT NULL DEFAULT 'imported', client_build TEXT, current_season INTEGER NOT NULL DEFAULT 0, review_status TEXT NOT NULL DEFAULT 'unreviewed', db2_status TEXT NOT NULL DEFAULT 'unavailable', simc_validation TEXT NOT NULL DEFAULT 'unvalidated'); CREATE TABLE talent_metadata (id INTEGER PRIMARY KEY, class_name TEXT, spec_name TEXT, name TEXT NOT NULL); CREATE INDEX items_name_idx ON items(name); CREATE INDEX items_slot_idx ON items(slot); CREATE INDEX drops_item_idx ON loot_drops(item_id); CREATE INDEX variants_lookup_idx ON item_variants(encounter_id,difficulty,item_id,track); CREATE INDEX source_instance_idx ON loot_sources(instance_name);`); }
function checksum(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
export async function buildCatalog(onProgress = () => { }) { const config = blizzardConfig(), season = loadSeasonManifest(), client = new BlizzardClient(config), paths = pathsForCatalog(), staging = join(paths.staging, `catalog-${Date.now()}`), dbPath = join(staging, 'catalog.db'); mkdirSync(staging, { recursive: true }); try {
    onProgress({ phase: 'authenticate', completed: 0, total: 1, detail: 'Authenticating with Blizzard' });
    await client.authenticate();
    onProgress({ phase: 'journal-index', completed: 0, total: 1, detail: 'Loading Journal index' });
    const index = await client.journalInstances(), selected = season.include.map(entry => ({ entry, instance: index.find(x => x.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase()) })), missing = selected.filter(x => !x.instance);
    if (missing.length)
        throw new Error(`Pinned season sources were not found in Blizzard's Journal index: ${missing.map(x => x.entry.name).join(', ')}.`);
    const encounters = [];
    for (let i = 0; i < selected.length; i++) {
        const chosen = selected[i];
        onProgress({ phase: 'instances', completed: i, total: selected.length, detail: chosen.entry.name });
        const detail = await client.journalInstance(chosen.instance.id);
        collectEncounterIds(detail).forEach(e => encounters.push({ id: Number(e.id), name: String(e.name || `Encounter ${e.id}`), instance: chosen.instance, entry: chosen.entry }));
    }
    const initial = new Database(dbPath);
    initialize(initial);
    initial.close();
    const db = new Database(dbPath);
    const insertInstance = db.prepare('INSERT OR REPLACE INTO instances (id,name,kind) VALUES (?,?,?)'), insertEncounter = db.prepare('INSERT OR REPLACE INTO encounters (id,instance_id,name) VALUES (?,?,?)'), insertItem = db.prepare('INSERT OR REPLACE INTO items (id,name,slot,item_level,source) VALUES (?,?,?,?,?)'), insertSource = db.prepare('INSERT OR REPLACE INTO loot_sources (id,season,instance_name,boss,difficulty) VALUES (?,?,?,?,?)'), insertDrop = db.prepare('INSERT OR REPLACE INTO loot_drops (encounter_id,item_id,difficulty) VALUES (?,?,?)');
    const itemIds = new Map();
    for (const encounter of encounters) {
        insertInstance.run(encounter.instance.id, encounter.instance.name, encounter.entry.kind);
        insertEncounter.run(encounter.id, encounter.instance.id, encounter.name);
        const detail = await client.journalEncounter(encounter.id);
        for (const id of collectItemIds(detail)) {
            const refs = itemIds.get(id) || [];
            refs.push({ encounter });
            itemIds.set(id, refs);
        }
    }
    let completed = 0;
    for (const [id, refs] of itemIds) {
        onProgress({ phase: 'items', completed, total: itemIds.size, detail: `Item ${id}` });
        const item = await client.item(id), slot = slotMap[item.inventory_type?.type || ''] || 'unknown';
        insertItem.run(id, item.name, slot, item.level ?? item.item_level ?? null, 'Blizzard Game Data API');
        for (const { encounter } of refs)
            for (const difficulty of encounter.entry.difficulties) {
                insertSource.run(`${season.season}:${encounter.id}:${difficulty}`, season.season, encounter.instance.name, encounter.name, difficulty);
                insertDrop.run(encounter.id, id, difficulty);
            }
        completed++;
    }
    onProgress({ phase: 'variants', completed: 0, total: 1, detail: 'Installing verified difficulty variants' });
    const seed = loadVariantSeed();
    installVariants(db, seed, season.season);
    const drops = db.prepare('SELECT count(*) as count FROM loot_drops').get().count, variants = db.prepare("SELECT count(*) as count FROM item_variants WHERE status='verified'").get().count;
    if (!itemIds.size || !encounters.length)
        throw new Error('Catalog validation failed: no encounters or item records were generated.');
    db.close();
    const manifest = { version: `${season.season}-${new Date().toISOString().slice(0, 10)}`, schemaVersion: 2, season: season.season, displayName: season.displayName, game: season.game, region: config.region, locale: config.locale, generatedAt: new Date().toISOString(), checksum: checksum(dbPath), counts: { instances: selected.length, encounters: encounters.length, items: itemIds.size, drops, variants }, variantSeed: { version: seed.version, clientBuild: seed.clientBuild, verified: variants }, notes: season.releaseNotes };
    writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
    installCatalogPackage(dbPath, join(staging, 'manifest.json'));
    return { version: String(manifest.version), manifest };
}
finally {
    if (existsSync(staging))
        rmSync(staging, { recursive: true, force: true });
} }
