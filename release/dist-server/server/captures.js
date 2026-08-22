import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { paths } from './db.js';
import { openCatalog, pathsForCatalog } from './catalog.js';
import { storeTooltips } from './tooltips.js';
const captureDir = join(paths.root, 'catalog'), overlayPath = join(captureDir, 'variant-captures.json'), configPath = join(captureDir, 'addon-import.json'), statusPath = join(captureDir, 'addon-import-status.json');
let watcher;
const json = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
const save = (path, value) => { mkdirSync(captureDir, { recursive: true }); const tmp = `${path}.${Date.now()}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 2)); renameSync(tmp, path); };
const digest = (body) => createHash('sha256').update(body).digest('hex');
const adler32 = (body) => { let a = 1, b = 0; for (let i = 0; i < body.length; i++) {
    a = (a + body.charCodeAt(i)) % 65521;
    b = (b + a) % 65521;
} return ((b * 65536 + a) >>> 0).toString(16).padStart(8, '0'); };
const key = (record) => [record.category || '', record.source, record.boss || '', record.difficulty, record.track || '', record.itemId].join('|');
export function captureStatus() { return { ...json(configPath, {}), ...json(statusPath, { status: 'idle' }), overlay: json(overlayPath, { schema: 1, season: '', clientBuild: '', records: [] }) }; }
export function captureSeed() { const overlay = json(overlayPath, { schema: 1, season: '', clientBuild: '', records: [] }); return { version: 'local-addon-captures', season: overlay.season, clientBuild: overlay.clientBuild, records: normalized(overlay).map(record => ({ ...record, provenance: 'LocalSimDashCatalog addon capture' })) }; }
export function savedVariableCandidates(wowPath) { const retail = existsSync(join(wowPath, '_retail_')) ? join(wowPath, '_retail_') : wowPath, accountRoot = join(retail, 'WTF', 'Account'); if (!existsSync(accountRoot))
    return []; return readdirSync(accountRoot, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => ({ account: x.name, path: join(accountRoot, x.name, 'SavedVariables', 'LocalSimDashCatalog.lua') })).filter(x => existsSync(x.path)); }
export function configureCaptureImport(wowPath, account) { const absolute = resolve(wowPath), candidates = savedVariableCandidates(absolute); if (!candidates.length)
    throw new Error('No LocalSimDashCatalog SavedVariables file was found. Install the addon, then /reload or log out once.'); const chosen = account ? candidates.find(x => x.account === account) : candidates[0]; if (!chosen)
    throw new Error(`No SavedVariables file was found for account '${account}'.`); const config = { wowPath: absolute, account: chosen.account, savedVariablesPath: chosen.path }; save(configPath, config); startCaptureWatch(); return { config, candidates }; }
export function decodeCapture(text) { const token = (text.match(/LSDC1\.[A-Za-z0-9_-]+\.[a-f0-9]{8,64}/) || [])[0]; if (!token)
    throw new Error('No LocalSimDashCatalog export token was found.'); const [, encoded, checksum] = token.split('.'), body = Buffer.from(encoded, 'base64url').toString('utf8'); if ((checksum.length === 64 ? digest(body) : adler32(body)) !== checksum)
    throw new Error('Addon export checksum does not match; reload the updated addon and copy its complete /lsdexport value.'); const value = JSON.parse(body); if (value.schema !== 1 || !value.season || !Array.isArray(value.records))
    throw new Error('Unsupported addon capture payload.'); return value; }
export function decodeSavedVariables(text) { const token = (text.match(/payload\s*=\s*["'](LSDC1\.[A-Za-z0-9_-]+\.[a-f0-9]{8,64})["']/) || [])[1]; if (!token)
    throw new Error('SavedVariables does not contain a LocalSimDashCatalog payload. Reload the WoW UI after scanning.'); return decodeCapture(token); }
function fragment(record) { if (!Number.isInteger(record.itemId) || record.itemId <= 0 || !Number.isInteger(record.itemLevel) || record.itemLevel <= 0)
    throw new Error('Capture has an invalid item ID or item level.'); if (record.bonusIds && (!Array.isArray(record.bonusIds) || record.bonusIds.some(x => !Number.isInteger(x) || x < 0)))
    throw new Error(`Capture ${record.itemId} has invalid bonus IDs.`); return `id=${record.itemId},ilevel=${record.itemLevel}${record.bonusIds?.length ? `,bonus_id=${record.bonusIds.join('/')}` : ''}`; }
function linkBonusIds(itemLink) { const item = itemLink?.match(/\|Hitem:([^|]+)\|h/)?.[1]; if (!item)
    return undefined; const fields = item.split(':'), count = Number(fields[12]); if (!Number.isInteger(count) || count < 0 || count > 100)
    return undefined; const values = fields.slice(13, 13 + count).map(Number); return values.length === count && values.every(value => Number.isInteger(value) && value >= 0) ? values : undefined; }
export function normalized(payload) { const seen = new Set(); return payload.records.map(record => { const linked = linkBonusIds(record.itemLink), bonusIds = linked || (record.bonusIds || []); const repaired = { ...record, bonusIds }; if (!repaired.source || !repaired.difficulty || !repaired.capturedAt || !repaired.clientBuild)
    throw new Error('Capture is missing source, difficulty, timestamp, or client build.'); if (Number.isNaN(new Date(repaired.capturedAt).getTime()))
    throw new Error(`Capture ${repaired.itemId} has an invalid timestamp.`); if (repaired.category && !repaired.track)
    throw new Error(`Capture ${repaired.itemId} needs a selected ${repaired.category} track.`); if (!repaired.category && repaired.difficulty !== 'Mythic+' && !repaired.boss)
    throw new Error(`Capture ${repaired.itemId} is missing its boss.`); if (!repaired.category && repaired.difficulty === 'Mythic+' && !repaired.track)
    throw new Error(`Mythic+ capture ${repaired.itemId} is missing its track.`); if (seen.has(key(repaired)))
    throw new Error(`Capture payload contains a duplicate ${key(repaired)}.`); seen.add(key(repaired)); return { ...repaired, simcFragment: fragment(repaired), provenance: 'LocalSimDashCatalog addon capture' }; }); }
export function importCapturePayload(text) { return installCaptures(decodeCapture(text)); }
export function importSavedVariables(text) { return installCaptures(decodeSavedVariables(text)); }
export function reapplyCaptureOverlay() { const overlay = json(overlayPath, { schema: 1, season: '', clientBuild: '', records: [] }); return overlay.records.length ? installCaptures(overlay) : { verified: 0, unresolved: [], conflicts: [], records: [] }; }
const stableId = (value) => -Math.max(1, createHash('sha256').update(value).digest().readUInt32BE(0));
function installCaptures(payload) {
    const records = normalized(payload), catalog = pathsForCatalog();
    storeTooltips(records.map(record => ({ itemId: record.itemId, itemLevel: record.itemLevel, bonusIds: record.bonusIds, itemLink: record.itemLink, name: record.tooltip?.name, quality: record.tooltip?.quality, lines: record.tooltip?.lines || [], clientBuild: record.clientBuild, capturedAt: record.capturedAt })));
    if (!existsSync(catalog.catalogPath))
        throw new Error('Refresh the Blizzard catalog before importing addon captures.');
    const db = openCatalog();
    const result = { verified: 0, unresolved: [], conflicts: [], records: [] };
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS derived_item_metadata (item_id INTEGER PRIMARY KEY, name TEXT, icon_file_data_id INTEGER, inventory_type INTEGER, class_id INTEGER, subclass_id INTEGER, handedness TEXT, client_build TEXT NOT NULL, generated_at TEXT NOT NULL);`);
        db.transaction(() => {
            const findStatic = db.prepare(`SELECT e.id,e.name FROM instances i JOIN encounters e ON e.instance_id=i.id JOIN loot_drops d ON d.encounter_id=e.id WHERE i.name=? AND e.name=? AND d.item_id=? AND d.difficulty=?`);
            const findMplus = db.prepare(`SELECT e.id,e.name FROM instances i JOIN encounters e ON e.instance_id=i.id JOIN loot_drops d ON d.encounter_id=e.id WHERE i.name=? AND d.item_id=? AND d.difficulty='Mythic+'`);
            const knownItem = db.prepare(`SELECT 1 FROM items WHERE id=? UNION SELECT 1 FROM derived_item_metadata WHERE item_id=? LIMIT 1`);
            const ensureInstance = db.prepare(`INSERT OR IGNORE INTO instances (id,name,kind) VALUES (?,?,?)`), ensureEncounter = db.prepare(`INSERT OR IGNORE INTO encounters (id,instance_id,name) VALUES (?,?,?)`), ensureItem = db.prepare(`INSERT OR IGNORE INTO items (id,name,slot,source,handedness) VALUES (?,?,?,?,?)`), ensureDrop = db.prepare(`INSERT OR IGNORE INTO loot_drops (encounter_id,item_id,difficulty) VALUES (?,?,?)`), ensureSource = db.prepare(`INSERT OR IGNORE INTO loot_sources (id,season,instance_name,boss,difficulty) VALUES (?,?,?,?,?)`);
            const existing = db.prepare('SELECT simc_fragment,captured_at,status FROM item_variants WHERE encounter_id=? AND item_id=? AND difficulty=? AND track=?'), upsert = db.prepare('INSERT OR REPLACE INTO item_variants (id,item_id,encounter_id,season,difficulty,track,item_level,bonus_ids,simc_fragment,provenance,captured_at,client_build,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
            const genericMatch = (record) => { if (!knownItem.get(record.itemId, record.itemId))
                return []; const instanceId = stableId(`source:${record.category}:${record.source}`), encounterId = stableId(`source:${record.category}:${record.source}:${record.track}`), boss = record.boss || record.category; ensureInstance.run(instanceId, record.source, record.category); ensureEncounter.run(encounterId, instanceId, boss); ensureItem.run(record.itemId, `Captured item ${record.itemId}`, 'unknown', 'Local addon capture', 'unknown'); ensureDrop.run(encounterId, record.itemId, record.difficulty); ensureSource.run(`${payload.season}:${encounterId}:${record.difficulty}`, payload.season, record.source, boss, record.difficulty); return [{ id: encounterId, name: boss }]; };
            for (const record of records) {
                const matches = (record.category ? genericMatch(record) : record.difficulty === 'Mythic+' ? findMplus.all(record.source, record.itemId) : findStatic.all(record.source, record.boss, record.itemId, record.difficulty));
                if (!matches.length) {
                    result.unresolved.push(`${record.source} · ${record.boss || record.track || record.category} · ${record.itemId}`);
                    continue;
                }
                for (const match of matches) {
                    const track = record.track || '', old = existing.get(match.id, record.itemId, record.difficulty, track);
                    if (old && old.status === 'verified' && old.simc_fragment !== record.simcFragment && new Date(old.captured_at) >= new Date(record.capturedAt)) {
                        result.conflicts.push(`${record.itemId} (${record.source} · ${record.track || record.difficulty})`);
                        continue;
                    }
                    upsert.run(`capture:${payload.season}:${match.id}:${record.difficulty}:${track}:${record.itemId}`, record.itemId, match.id, payload.season, record.difficulty, track, record.itemLevel, JSON.stringify(record.bonusIds || []), record.simcFragment, 'LocalSimDashCatalog addon capture', record.capturedAt, record.clientBuild, 'verified');
                    result.verified++;
                    result.records.push({ ...record, boss: record.boss || match.name });
                }
            }
        })();
        db.close();
        const prior = json(overlayPath, { schema: 1, season: payload.season, clientBuild: payload.clientBuild, records: [] }), byKey = new Map(prior.records.map(x => [key(x), x]));
        for (const record of result.records)
            byKey.set(key(record), record);
        save(overlayPath, { schema: 1, season: payload.season, clientBuild: payload.clientBuild, records: [...byKey.values()] });
        const manifest = { ...json(catalog.manifestPath, {}), captures: { verified: result.records.length, lastImportedAt: new Date().toISOString(), clientBuild: payload.clientBuild } };
        save(catalog.manifestPath, manifest);
        save(statusPath, { status: 'imported', at: new Date().toISOString(), verified: result.verified, unresolved: result.unresolved, conflicts: result.conflicts });
        return result;
    }
    catch (error) {
        db.close();
        throw error;
    }
}
export function startCaptureWatch() { watcher?.close(); const config = json(configPath, {}); if (!config.savedVariablesPath || !existsSync(config.savedVariablesPath))
    return; watcher = watch(config.savedVariablesPath, () => { try {
    const result = importSavedVariables(readFileSync(config.savedVariablesPath, 'utf8'));
    save(configPath, { ...config, lastImportedAt: new Date().toISOString(), lastResult: `Imported ${result.verified} variants` });
}
catch (error) {
    save(statusPath, { status: 'error', at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
} }); }
