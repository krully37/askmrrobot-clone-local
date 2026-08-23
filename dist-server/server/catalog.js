import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './db.js';
import { catalogHealth } from './catalog-lifecycle.js';
import { BlizzardClient, configured } from './blizzard.js';
import { evaluateEquipment, resolveSimulationSlot } from './equipment-policy.js';
const catalogDir = join(paths.root, 'catalog'), catalogPath = join(catalogDir, 'catalog.db'), manifestPath = join(catalogDir, 'manifest.json'), stagingDir = join(paths.root, '.catalog-staging');
const seedManifest = { version: 'retail-starter-2026.08.14', game: 'Retail', generatedAt: '2026-08-14T00:00:00.000Z', checksum: 'local-starter', notes: 'Starter local catalog. Imported and custom items are indexed immediately; replace with a signed seasonal package for full browsing.' };
function ensureVariantTracks(db) { const columns = db.prepare('PRAGMA table_info(item_variants)').all(); if (!columns.length || columns.some(x => x.name === 'track'))
    return; db.exec(`ALTER TABLE item_variants RENAME TO item_variants_legacy; CREATE TABLE item_variants (id TEXT PRIMARY KEY,item_id INTEGER NOT NULL,encounter_id INTEGER NOT NULL,season TEXT NOT NULL,difficulty TEXT NOT NULL,track TEXT NOT NULL DEFAULT '',item_level INTEGER NOT NULL,bonus_ids TEXT NOT NULL,simc_fragment TEXT NOT NULL,provenance TEXT NOT NULL,captured_at TEXT NOT NULL,client_build TEXT NOT NULL,status TEXT NOT NULL,UNIQUE(item_id,encounter_id,difficulty,track)); INSERT INTO item_variants (id,item_id,encounter_id,season,difficulty,track,item_level,bonus_ids,simc_fragment,provenance,captured_at,client_build,status) SELECT id,item_id,encounter_id,season,difficulty,'',item_level,bonus_ids,simc_fragment,provenance,captured_at,client_build,status FROM item_variants_legacy; DROP TABLE item_variants_legacy;`); }
function ensureCatalogColumns(db) { const itemColumns = db.prepare('PRAGMA table_info(items)').all(); if (itemColumns.length && !itemColumns.some(x => x.name === 'handedness'))
    db.exec("ALTER TABLE items ADD COLUMN handedness TEXT NOT NULL DEFAULT 'unknown'"); if (itemColumns.length && !itemColumns.some(x => x.name === 'item_set_id'))
    db.exec("ALTER TABLE items ADD COLUMN item_set_id INTEGER"); const enhancementColumns = db.prepare('PRAGMA table_info(enhancements)').all(); for (const [name, sql] of [['effect', "TEXT"], ['weapon_hands', "TEXT NOT NULL DEFAULT '[]'"], ['provenance', "TEXT NOT NULL DEFAULT 'imported'"], ['client_build', "TEXT"], ['current_season', "INTEGER NOT NULL DEFAULT 0"], ['review_status', "TEXT NOT NULL DEFAULT 'unreviewed'"], ['db2_status', "TEXT NOT NULL DEFAULT 'unavailable'"], ['simc_validation', "TEXT NOT NULL DEFAULT 'unvalidated'"]])
    if (enhancementColumns.length && !enhancementColumns.some(x => x.name === name))
        db.exec(`ALTER TABLE enhancements ADD COLUMN ${name} ${sql}`); }
function open() { mkdirSync(catalogDir, { recursive: true }); const db = new Database(catalogPath); db.exec(`CREATE TABLE IF NOT EXISTS instances (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL); CREATE TABLE IF NOT EXISTS encounters (id INTEGER PRIMARY KEY, instance_id INTEGER NOT NULL, name TEXT NOT NULL); CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slot TEXT NOT NULL, item_level INTEGER, source TEXT, unique_key TEXT, simc_line TEXT, handedness TEXT NOT NULL DEFAULT 'unknown'); CREATE TABLE IF NOT EXISTS enhancements (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, slots TEXT NOT NULL, simc_fragment TEXT NOT NULL, weapon_hands TEXT NOT NULL DEFAULT '[]', provenance TEXT NOT NULL DEFAULT 'imported', client_build TEXT, current_season INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS loot_sources (id TEXT PRIMARY KEY, season TEXT, instance_name TEXT, boss TEXT, difficulty TEXT); CREATE TABLE IF NOT EXISTS loot_drops (encounter_id INTEGER NOT NULL, item_id INTEGER NOT NULL, difficulty TEXT NOT NULL, PRIMARY KEY(encounter_id,item_id,difficulty)); CREATE TABLE IF NOT EXISTS item_variants (id TEXT PRIMARY KEY,item_id INTEGER NOT NULL,encounter_id INTEGER NOT NULL,season TEXT NOT NULL,difficulty TEXT NOT NULL,track TEXT NOT NULL DEFAULT '',item_level INTEGER NOT NULL,bonus_ids TEXT NOT NULL,simc_fragment TEXT NOT NULL,provenance TEXT NOT NULL,captured_at TEXT NOT NULL,client_build TEXT NOT NULL,status TEXT NOT NULL,UNIQUE(item_id,encounter_id,difficulty,track)); CREATE INDEX IF NOT EXISTS variants_lookup_idx ON item_variants(encounter_id,difficulty,item_id,track); CREATE TABLE IF NOT EXISTS item_sets (id INTEGER PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE IF NOT EXISTS talent_metadata (id INTEGER PRIMARY KEY, class_name TEXT, spec_name TEXT, name TEXT NOT NULL); CREATE INDEX IF NOT EXISTS items_name_idx ON items(name); CREATE INDEX IF NOT EXISTS drops_item_idx ON loot_drops(item_id); CREATE TABLE IF NOT EXISTS derived_spells (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, icon_url TEXT);`); ensureVariantTracks(db); ensureCatalogColumns(db); if (!existsSync(manifestPath))
    writeFileSync(manifestPath, JSON.stringify(seedManifest, null, 2)); return db; }
function requireText(path) { return existsSync(path) ? readFileSync(path, 'utf8') : JSON.stringify(seedManifest); }
export function catalogStatus() { const db = open(); const coverage = db.prepare(`SELECT ls.instance_name as source,ls.difficulty,count(*) as total,sum(CASE WHEN v.status='verified' THEN 1 ELSE 0 END) as verified FROM loot_sources ls JOIN encounters e ON e.name=ls.boss JOIN loot_drops d ON d.encounter_id=e.id AND d.difficulty=ls.difficulty LEFT JOIN item_variants v ON v.encounter_id=e.id AND v.item_id=d.item_id AND v.difficulty=d.difficulty GROUP BY ls.instance_name,ls.difficulty ORDER BY ls.instance_name,ls.difficulty`).all(), enhancementRows = db.prepare("SELECT count(*) as total,sum(CASE WHEN current_season=1 THEN 1 ELSE 0 END) as currentSeason,sum(CASE WHEN db2_status='matched' THEN 1 ELSE 0 END) as db2Matched,sum(CASE WHEN review_status='reviewed' AND db2_status='matched' AND simc_validation='syntax-valid' THEN 1 ELSE 0 END) as selectable FROM enhancements").get(); db.close(); const manifest = JSON.parse(requireText(manifestPath)); return { ...manifest, variantCoverage: coverage, enhancements: enhancementRows, health: catalogHealth(manifest, coverage, manifest.captures) }; }
export function searchCatalog(query = '', slot = '') { const db = open(); const rows = db.prepare(`SELECT id,name,slot,item_level as itemLevel,source,unique_key as uniqueKey,simc_line as simcLine,handedness FROM items WHERE name LIKE ? AND (?='' OR slot=?) ORDER BY item_level DESC,name LIMIT 100`).all(`%${query}%`, slot, slot); db.close(); return rows; }
export function catalogSources() { const db = open(); try {
    const rows = db.prepare('SELECT DISTINCT season,instance_name as instanceName FROM loot_sources ORDER BY instance_name').all();
    if (rows.length > 0) {
        rows.unshift({ season: rows[0].season, instanceName: 'All Dungeons' });
    }
    ;
    return rows;
}
finally {
    db.close();
} }
export function catalogSourceCategories() { const db = open(); try {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='source_categories'").get();
    if (!exists)
        return [];
    const rows = db.prepare(`SELECT id,name,capture_mode as captureMode,tracks FROM source_categories ORDER BY name`).all();
    const counts = db.prepare(`SELECT CASE WHEN i.kind IN ('raid','lair') THEN 'raid-lair' WHEN i.kind='dungeon' THEN 'mythic-plus' ELSE i.kind END as category,count(DISTINCT ls.id) as sources,sum(CASE WHEN v.status='verified' THEN 1 ELSE 0 END) as verifiedVariants FROM instances i LEFT JOIN encounters e ON e.instance_id=i.id LEFT JOIN loot_sources ls ON ls.boss=e.name LEFT JOIN item_variants v ON v.encounter_id=e.id GROUP BY category`).all();
    const indexed = new Map(counts.map(row => [row.category, row]));
    return rows.map(row => ({ ...row, tracks: JSON.parse(row.tracks), sources: Number(indexed.get(row.id)?.sources || 0), verifiedVariants: Number(indexed.get(row.id)?.verifiedVariants || 0) }));
}
finally {
    db.close();
} }
export function catalogDrops(instanceName, character) { const db = open(); try {
    const derived = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='derived_drop_presence'").get(), metadataTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='derived_item_metadata'").get();
    const metadata = metadataTable ? db.prepare('SELECT class_id as classId,subclass_id as subclassId,inventory_type as inventoryType,handedness FROM derived_item_metadata WHERE item_id=?') : undefined;
    let rows;
    if (instanceName === 'All Dungeons') {
        rows = db.prepare(`SELECT ls.instance_name as instanceName,i.id,i.name,i.slot,ls.boss,ls.difficulty,v.track,v.id as variantId,v.item_level as itemLevel,v.bonus_ids as bonusIds,v.simc_fragment as simcFragment,${derived ? "COALESCE(v.status,CASE WHEN dp.item_id IS NOT NULL THEN 'derived' END,'missing')" : "COALESCE(v.status,'missing')"} as status FROM loot_sources ls JOIN encounters e ON e.name=ls.boss JOIN loot_drops d ON d.encounter_id=e.id AND d.difficulty=ls.difficulty JOIN items i ON i.id=d.item_id LEFT JOIN item_variants v ON v.encounter_id=e.id AND v.item_id=d.item_id AND v.difficulty=d.difficulty ${derived ? 'LEFT JOIN derived_drop_presence dp ON dp.encounter_id=e.id AND dp.item_id=d.item_id' : ''} WHERE ls.instance_name IN (SELECT DISTINCT instance_name FROM loot_sources WHERE difficulty='Mythic+') ORDER BY ls.instance_name,ls.boss,i.name,v.track`).all();
    }
    else {
        rows = db.prepare(`SELECT ls.instance_name as instanceName,i.id,i.name,i.slot,ls.boss,ls.difficulty,v.track,v.id as variantId,v.item_level as itemLevel,v.bonus_ids as bonusIds,v.simc_fragment as simcFragment,${derived ? "COALESCE(v.status,CASE WHEN dp.item_id IS NOT NULL THEN 'derived' END,'missing')" : "COALESCE(v.status,'missing')"} as status FROM loot_sources ls JOIN encounters e ON e.name=ls.boss JOIN loot_drops d ON d.encounter_id=e.id AND d.difficulty=ls.difficulty JOIN items i ON i.id=d.item_id LEFT JOIN item_variants v ON v.encounter_id=e.id AND v.item_id=d.item_id AND v.difficulty=d.difficulty ${derived ? 'LEFT JOIN derived_drop_presence dp ON dp.encounter_id=e.id AND dp.item_id=d.item_id' : ''} WHERE ls.instance_name=? ORDER BY ls.boss,i.name,v.track`).all(instanceName);
    }
    return rows.map((row) => { const itemMetadata = metadata?.get(row.id); const slot = resolveSimulationSlot(row.slot, itemMetadata?.inventoryType); const eligibility = character ? evaluateEquipment(character.className, character.spec, slot, itemMetadata || {}) : undefined; return { ...row, slot, boss: instanceName === 'All Dungeons' ? `${row.instanceName} - ${row.boss}` : row.boss, bonusIds: row.bonusIds ? JSON.parse(row.bonusIds) : undefined, reason: row.status === 'verified' ? undefined : row.status === 'derived' ? 'DB2 confirmed this journal drop; capture its live item link before simming.' : 'Variant data required', metadata: itemMetadata, eligibility }; });
}
finally {
    db.close();
} }
export function catalogHasDiscoveredDrop(source, boss, itemId, difficulty) { const db = open(); try {
    return Boolean(db.prepare(`SELECT 1 FROM instances i JOIN encounters e ON e.instance_id=i.id JOIN loot_drops d ON d.encounter_id=e.id WHERE i.name=? AND e.name=? AND d.item_id=? AND d.difficulty=? LIMIT 1`).get(source, boss, itemId, difficulty));
}
finally {
    db.close();
} }
export function upsertCatalogItem(item) { if (!item.id)
    return; const db = open(); db.prepare(`INSERT INTO items (id,name,slot,item_level,source,unique_key,simc_line,handedness) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slot=excluded.slot,item_level=excluded.item_level,source=COALESCE(excluded.source,items.source),unique_key=COALESCE(excluded.unique_key,items.unique_key),simc_line=COALESCE(excluded.simc_line,items.simc_line),handedness=CASE WHEN excluded.handedness!='unknown' THEN excluded.handedness ELSE items.handedness END`).run(item.id, item.name, item.slot, item.itemLevel ?? null, item.source ?? null, item.uniqueKey ?? null, item.simcLine ?? null, item.handedness ?? 'unknown'); db.close(); }
export function upsertEnhancement(enhancement) { const db = open(); try {
    db.prepare('INSERT INTO enhancements (id,type,name,effect,slots,simc_fragment,weapon_hands,provenance,client_build,current_season,review_status,db2_status,simc_validation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,name=excluded.name,effect=excluded.effect,slots=excluded.slots,simc_fragment=excluded.simc_fragment,weapon_hands=excluded.weapon_hands,provenance=excluded.provenance,client_build=excluded.client_build,current_season=excluded.current_season,review_status=excluded.review_status,db2_status=excluded.db2_status,simc_validation=excluded.simc_validation').run(enhancement.id, enhancement.type, enhancement.name, enhancement.effect || null, JSON.stringify(enhancement.slots), enhancement.simcFragment, JSON.stringify(enhancement.weaponHands || []), enhancement.provenance || 'imported', enhancement.clientBuild || null, enhancement.currentSeason ? 1 : 0, enhancement.reviewStatus || 'unreviewed', enhancement.db2Status || 'unavailable', enhancement.simcValidation || 'unvalidated');
}
finally {
    db.close();
} }
export function catalogEnhancements() { const db = open(); try {
    const rows = db.prepare("SELECT id,type,name,effect,slots,simc_fragment as simcFragment,weapon_hands as weaponHands,provenance,client_build as clientBuild,current_season as currentSeason,review_status as reviewStatus,db2_status as db2Status,simc_validation as simcValidation FROM enhancements WHERE current_season=1 AND review_status='reviewed' AND db2_status='matched' AND simc_validation='syntax-valid' ORDER BY type,name").all();
    const items = db.prepare('SELECT item_id, icon_file_data_id FROM derived_item_metadata').all();
    const enchants = db.prepare('SELECT enchant_id, icon_file_data_id FROM derived_enhancements').all();
    const itemsMap = new Map(items.map(x => [x.item_id, x.icon_file_data_id]));
    const enchantsMap = new Map(enchants.map(x => [x.enchant_id, x.icon_file_data_id]));
    return rows.map((x) => { const parsedId = Number(x.id.split('-')[1]); let iconFileDataId; if (x.type === 'gem')
        iconFileDataId = itemsMap.get(parsedId);
    else if (x.type === 'enchant' || x.type === 'weapon')
        iconFileDataId = enchantsMap.get(parsedId); return { ...x, slots: JSON.parse(x.slots), weaponHands: JSON.parse(x.weaponHands || '[]'), currentSeason: Boolean(x.currentSeason), iconFileDataId }; });
}
finally {
    db.close();
} }
export function enrichInventory(inventory) {
    const ids = inventory.candidates.filter(candidate => candidate.itemId).map(candidate => candidate.itemId);
    if (!ids.length)
        return inventory;
    const db = open();
    try {
        const lookup = db.prepare('SELECT i.id,i.handedness,i.item_set_id,s.name as set_name FROM items i LEFT JOIN item_sets s ON i.item_set_id=s.id WHERE i.id=?');
        const enriched = inventory.candidates.map(candidate => {
            if (!candidate.itemId)
                return candidate;
            const row = lookup.get(candidate.itemId);
            let out = { ...candidate };
            if (row?.handedness && row.handedness !== 'unknown' && ['main_hand', 'off_hand'].includes(candidate.slot))
                out.handedness = row.handedness;
            if (row?.item_set_id && row.item_set_id > 0) {
                out.setId = row.item_set_id;
                out.setName = row.set_name;
            }
            return out;
        });
        const candidates = inventory.dualWieldCapable ? enriched.flatMap(candidate => candidate.handedness === 'one-hand' && ['main_hand', 'off_hand'].includes(candidate.slot) ? [candidate, { ...candidate, slot: candidate.slot === 'main_hand' ? 'off_hand' : 'main_hand' }] : [candidate]) : enriched;
        return { ...inventory, candidates };
    }
    finally {
        db.close();
    }
}
export function pathsForCatalog() { return { catalogDir, catalogPath, manifestPath, staging: stagingDir }; }
function userItems() { if (!existsSync(catalogPath))
    return []; const db = new Database(catalogPath, { readonly: true }); try {
    return db.prepare("SELECT id,name,slot,item_level as itemLevel,source,unique_key as uniqueKey,simc_line as simcLine FROM items WHERE source IN ('Imported SimC addon','Custom candidate')").all();
}
finally {
    db.close();
} }
export function installCatalogPackage(packagePath, nextManifestPath) { const next = new Database(packagePath, { readonly: true }); const valid = next.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='item_variants'").get(); next.close(); if (!valid)
    throw new Error('Catalog package is missing the item_variants table.'); const preserved = userItems(); mkdirSync(catalogDir, { recursive: true }); const backup = `${catalogPath}.previous`, manifestBackup = `${manifestPath}.previous`; if (existsSync(backup))
    unlinkSync(backup); if (existsSync(manifestBackup))
    unlinkSync(manifestBackup); if (existsSync(catalogPath))
    renameSync(catalogPath, backup); if (existsSync(manifestPath))
    renameSync(manifestPath, manifestBackup); try {
    renameSync(packagePath, catalogPath);
    if (nextManifestPath)
        copyFileSync(nextManifestPath, manifestPath);
    const db = open();
    for (const item of preserved)
        db.prepare(`INSERT INTO items (id,name,slot,item_level,source,unique_key,simc_line) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slot=excluded.slot,item_level=excluded.item_level,source=excluded.source,unique_key=excluded.unique_key,simc_line=excluded.simc_line`).run(item.id, item.name, item.slot, item.itemLevel ?? null, item.source ?? null, item.uniqueKey ?? null, item.simcLine ?? null);
    db.close();
    return catalogStatus();
}
catch (error) {
    if (existsSync(catalogPath))
        unlinkSync(catalogPath);
    if (existsSync(backup))
        renameSync(backup, catalogPath);
    if (existsSync(manifestPath))
        unlinkSync(manifestPath);
    if (existsSync(manifestBackup))
        renameSync(manifestBackup, manifestPath);
    throw error;
} }
export const openCatalog = open;
const fallbackOmniumSpells = [
    [1279596, 'Void-Touched Orbs'], [1279599, 'Unleashed Fire'],
    [1279603, 'Self-Mending'], [1279604, 'Void-Tainted Shell'], [1279605, 'Lynxlike Reflexes'],
    [1287555, 'Lingering'],
    [1279609, 'Critical Power'], [1279610, 'Burning Haste'], [1279612, 'Masterful Cunning'], [1279613, 'The Versatile Warrior'],
    [1279614, 'Overload'], [1279615, 'Residual Energy'], [1279616, 'Echoes'],
].map(([id, name]) => ({ id: Number(id), name: String(name), description: 'Local Omnium Folio power metadata.', iconUrl: '' }));
export async function catalogOmniumSpells() {
    const db = open();
    let rows = db.prepare('SELECT id, name, description, icon_url as iconUrl FROM derived_spells').all();
    db.close();
    if (rows.length < 13 && configured()) {
        const client = new BlizzardClient();
        const ids = [1279596, 1279599, 1279603, 1279604, 1279605, 1287555, 1279609, 1279610, 1279612, 1279613, 1279614, 1279615, 1279616];
        const fetched = [];
        for (const id of ids) {
            try {
                const [spell, media] = await Promise.all([client.spell(id), client.spellMedia(id)]);
                fetched.push({
                    id,
                    name: typeof spell.name === 'string' ? spell.name : (spell.name?.en_US || ''),
                    description: typeof spell.description === 'string' ? spell.description : (spell.description?.en_US || ''),
                    iconUrl: media.assets?.[0]?.value || ''
                });
            }
            catch (e) { /* ignore 404s for local DB2-only usage */ }
        }
        if (fetched.length > 0) {
            const db2 = open();
            const insert = db2.prepare('INSERT OR REPLACE INTO derived_spells (id, name, description, icon_url) VALUES (?, ?, ?, ?)');
            db2.transaction(() => {
                for (const s of fetched) {
                    insert.run(s.id, s.name, s.description, s.iconUrl);
                }
            })();
            rows = db2.prepare('SELECT id, name, description, icon_url as iconUrl FROM derived_spells').all();
            db2.close();
        }
    }
    const liveById = new Map(rows.map(row => [row.id, row]));
    return fallbackOmniumSpells.map(spell => ({ ...spell, ...liveById.get(spell.id) }));
}
export async function ensureItemSets(itemIds) {
    const uniqueIds = [...new Set(itemIds)].filter(id => id > 0);
    if (!uniqueIds.length)
        return;
    const db = open();
    const missing = [];
    try {
        const query = db.prepare('SELECT id FROM items WHERE id=? AND item_set_id IS NULL');
        for (const id of uniqueIds) {
            if (query.get(id))
                missing.push(id);
        }
    }
    finally {
        db.close();
    }
    if (!missing.length || !configured())
        return;
    const client = new BlizzardClient();
    const sets = new Map();
    const itemSetLinks = new Map();
    for (const id of missing) {
        try {
            const item = await client.item(id);
            if (item.item_set) {
                const rawName = item.item_set.name;
                const setName = typeof rawName === 'object' ? (rawName.en_US || rawName.en_GB) : rawName;
                sets.set(item.item_set.item_set.id, { id: item.item_set.item_set.id, name: setName || `Set ${item.item_set.item_set.id}` });
                itemSetLinks.set(id, item.item_set.item_set.id);
            }
        }
        catch (e) { /* missing or 404 */ }
    }
    const db2 = open();
    try {
        const insertSet = db2.prepare('INSERT OR IGNORE INTO item_sets (id, name) VALUES (?, ?)');
        const updateItem = db2.prepare('UPDATE items SET item_set_id=? WHERE id=?');
        db2.transaction(() => {
            for (const set of sets.values())
                insertSet.run(set.id, set.name);
            for (const id of missing) {
                updateItem.run(itemSetLinks.get(id) || 0, id);
            }
        })();
    }
    finally {
        db2.close();
    }
}
export function synthesizeVariants() {
    const db = open();
    let count = 0;
    try {
        const donors = db.prepare(`SELECT difficulty, track, simc_fragment, bonus_ids, item_level, season, client_build FROM item_variants WHERE status='verified' AND track != ''`).all();
        const unverifiedDrops = db.prepare(`
      SELECT dp.encounter_id, d.difficulty, d.item_id, i.name
      FROM derived_drop_presence dp
      JOIN loot_drops d ON d.item_id = dp.item_id AND d.encounter_id = dp.encounter_id
      JOIN items i ON i.id = d.item_id
    `).all();
        const existing = new Set(db.prepare(`SELECT item_id || '|' || encounter_id || '|' || difficulty || '|' || track FROM item_variants`).all().map((r) => Object.values(r)[0]));
        const insert = db.prepare(`
      INSERT INTO item_variants (id, item_id, encounter_id, season, difficulty, track, item_level, bonus_ids, simc_fragment, provenance, captured_at, client_build, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        db.transaction(() => {
            for (const drop of unverifiedDrops) {
                const relevantDonors = donors.filter(d => d.difficulty === drop.difficulty);
                const seenTracks = new Set();
                for (const donor of relevantDonors) {
                    if (seenTracks.has(donor.track))
                        continue;
                    seenTracks.add(donor.track);
                    const key = `${drop.item_id}|${drop.encounter_id}|${drop.difficulty}|${donor.track}`;
                    if (existing.has(key))
                        continue;
                    const fragment = donor.simc_fragment.replace(/(^|,)id=\d+/, `$1id=${drop.item_id}`);
                    const newId = `synth:${drop.item_id}:${drop.encounter_id}:${drop.difficulty}:${donor.track}`;
                    insert.run(newId, drop.item_id, drop.encounter_id, donor.season, drop.difficulty, donor.track, donor.item_level, donor.bonus_ids, fragment, 'synthesized', new Date().toISOString(), donor.client_build, 'verified');
                    existing.add(key);
                    count++;
                }
            }
        })();
    }
    finally {
        db.close();
    }
    return count;
}
