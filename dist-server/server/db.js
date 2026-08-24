import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { storageRoot } from './storage.js';
const root = storageRoot();
mkdirSync(root, { recursive: true });
const settingsPath = join(root, 'settings.json');
export function readSettings() { try {
    return JSON.parse(readFileSync(settingsPath, 'utf8'));
}
catch {
    return {};
} }
export function saveSettings(settings) { writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }
const db = new Database(join(root, 'dashboard.db'));
db.pragma('journal_mode = WAL');
const add = (sql) => { try {
    db.exec(sql);
}
catch { /* already migrated */ } };
db.exec(`CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, realm TEXT NOT NULL DEFAULT 'Unknown realm', class_name TEXT NOT NULL, spec TEXT NOT NULL, raw_profile TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, mode TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, scenario_json TEXT NOT NULL, input TEXT NOT NULL, report_path TEXT, summary TEXT, simc_version TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT, result_json TEXT);`);
add('ALTER TABLE profiles ADD COLUMN realm TEXT NOT NULL DEFAULT \'Unknown realm\'');
add('ALTER TABLE profiles ADD COLUMN character_id INTEGER');
add("ALTER TABLE profiles ADD COLUMN persistence TEXT NOT NULL DEFAULT 'reusable'");
add('ALTER TABLE profiles ADD COLUMN updated_at TEXT');
add('ALTER TABLE runs ADD COLUMN result_json TEXT');
add('ALTER TABLE runs ADD COLUMN profile_id INTEGER');
add('ALTER TABLE runs ADD COLUMN character_id INTEGER');
add('ALTER TABLE runs ADD COLUMN character_json TEXT');
db.exec(`CREATE TABLE IF NOT EXISTS characters (id INTEGER PRIMARY KEY, name TEXT NOT NULL, realm TEXT NOT NULL, name_key TEXT NOT NULL, realm_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(name_key,realm_key));
CREATE TABLE IF NOT EXISTS topgear_jobs (run_id INTEGER PRIMARY KEY, catalog_version TEXT NOT NULL, preview_json TEXT NOT NULL, plans_json TEXT NOT NULL, request_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS droptimizer_jobs (run_id INTEGER PRIMARY KEY, request_json TEXT NOT NULL, entries_json TEXT NOT NULL, results_json TEXT, progress_json TEXT, diagnostics_path TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sim_calibrations (cache_key TEXT PRIMARY KEY, throughput REAL NOT NULL, samples INTEGER NOT NULL, updated_at TEXT NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS character_consumables (character_id INTEGER NOT NULL, spec TEXT NOT NULL, selections_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(character_id,spec));`);
add('ALTER TABLE topgear_jobs ADD COLUMN results_json TEXT');
add('ALTER TABLE topgear_jobs ADD COLUMN progress_json TEXT');
add('ALTER TABLE droptimizer_jobs ADD COLUMN diagnostics_path TEXT');
const norm = (value) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const unknown = (realm) => !realm || /^unknown realm$/i.test(realm.trim());
function backfill() { const old = db.prepare('SELECT id,name,COALESCE(realm,\'Unknown realm\') realm,created_at FROM profiles WHERE character_id IS NULL').all(); const now = new Date().toISOString(); const insert = db.prepare('INSERT OR IGNORE INTO characters (name,realm,name_key,realm_key,created_at,updated_at) VALUES (?,?,?,?,?,?)'); const find = db.prepare('SELECT id FROM characters WHERE name_key=? AND realm_key=?'); const link = db.prepare('UPDATE profiles SET character_id=?,persistence=COALESCE(persistence,\'reusable\'),updated_at=COALESCE(updated_at,created_at) WHERE id=?'); for (const p of old) {
    insert.run(p.name, p.realm, norm(p.name), norm(p.realm), p.created_at || now, now);
    const character = find.get(norm(p.name), norm(p.realm));
    link.run(character.id, p.id);
} }
backfill();
export const paths = { root, reports: join(root, 'reports') };
function rowProfile(r) { return { id: r.id, characterId: r.character_id ?? undefined, name: r.name, realm: r.realm, className: r.class_name, spec: r.spec, rawProfile: r.raw_profile, persistence: r.persistence || 'reusable', createdAt: r.created_at, updatedAt: r.updated_at || r.created_at }; }
function characterFor(name, realm) { return db.prepare('SELECT * FROM characters WHERE name_key=? AND realm_key=?').get(norm(name), norm(realm)); }
function ensureCharacter(name, realm) { const now = new Date().toISOString(); db.prepare('INSERT OR IGNORE INTO characters (name,realm,name_key,realm_key,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(name, realm, norm(name), norm(realm), now, now); return characterFor(name, realm); }
export function importCandidates(name, realm) { const exact = characterFor(name, realm); const sameName = db.prepare('SELECT * FROM characters WHERE name_key=? ORDER BY updated_at DESC').all(norm(name)); return { exact: exact ? characterSummary(exact.id) : undefined, candidates: sameName.map(x => characterSummary(x.id)), ambiguous: !exact && sameName.length > 0 }; }
export function saveProfile(p) { const now = new Date().toISOString(), characterId = p.characterId || ensureCharacter(p.name, p.realm).id; const existing = db.prepare('SELECT * FROM profiles WHERE character_id=? AND lower(spec)=lower(?) AND persistence=\'reusable\' ORDER BY id DESC LIMIT 1').get(characterId, p.spec); if (existing) {
    db.prepare('UPDATE profiles SET name=?,realm=?,class_name=?,spec=?,raw_profile=?,updated_at=?,persistence=\'reusable\' WHERE id=?').run(p.name, p.realm, p.className, p.spec, p.rawProfile, now, existing.id);
    db.prepare('UPDATE characters SET name=?,realm=?,updated_at=? WHERE id=?').run(p.name, p.realm, now, characterId);
    return { ...getProfile(existing.id), updated: true };
} const r = db.prepare('INSERT INTO profiles (character_id,name,realm,class_name,spec,raw_profile,persistence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(characterId, p.name, p.realm, p.className, p.spec, p.rawProfile, 'reusable', now, now); return { ...getProfile(Number(r.lastInsertRowid)), updated: false }; }
export function createDisposableProfile(p) { const now = new Date().toISOString(); const r = db.prepare('INSERT INTO profiles (name,realm,class_name,spec,raw_profile,persistence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(p.name, p.realm, p.className, p.spec, p.rawProfile, 'disposable', now, now); return getProfile(Number(r.lastInsertRowid)); }
export function profiles() { return db.prepare("SELECT * FROM profiles WHERE persistence='reusable' ORDER BY updated_at DESC").all().map(rowProfile); }
export function getProfile(id) { const row = db.prepare('SELECT * FROM profiles WHERE id=?').get(id); return row ? rowProfile(row) : undefined; }
export function characterSummary(id) { const c = db.prepare('SELECT * FROM characters WHERE id=?').get(id); if (!c)
    throw new Error('Character not found'); const specs = db.prepare("SELECT id,spec,class_name,created_at,updated_at FROM profiles WHERE character_id=? AND persistence='reusable' ORDER BY updated_at DESC").all(id).map((p) => ({ id: p.id, spec: p.spec, className: p.class_name, createdAt: p.created_at, updatedAt: p.updated_at || p.created_at })); const last = db.prepare('SELECT status,COALESCE(completed_at,created_at) at FROM runs WHERE character_id=? ORDER BY created_at DESC LIMIT 1').get(id); const count = db.prepare('SELECT count(*) count FROM runs WHERE character_id=?').get(id).count; return { id: c.id, name: c.name, realm: c.realm, specs, runCount: count, lastRunAt: last?.at, lastRunStatus: last?.status }; }
export function characters() { return db.prepare('SELECT id FROM characters ORDER BY updated_at DESC').all().map(x => characterSummary(x.id)); }
export function deleteCharacter(id) { const active = db.prepare("SELECT count(*) count FROM runs WHERE character_id=? AND status IN ('queued','running')").get(id).count; if (active)
    throw new Error('Cancel or wait for active simulations before deleting this character.'); db.prepare('DELETE FROM profiles WHERE character_id=?').run(id); db.prepare('DELETE FROM characters WHERE id=?').run(id); }
export function updateProfileRaw(id, rawProfile) { db.prepare('UPDATE profiles SET raw_profile=?,updated_at=? WHERE id=?').run(rawProfile, new Date().toISOString(), id); return getProfile(id); }
export function characterConsumables(profileId) { const profile = getProfile(profileId); if (!profile?.characterId)
    return { selections: {}, inherited: true }; const row = db.prepare('SELECT selections_json FROM character_consumables WHERE character_id=? AND lower(spec)=lower(?)').get(profile.characterId, profile.spec); return { selections: row?.selections_json ? JSON.parse(row.selections_json) : {}, inherited: !row }; }
export function saveCharacterConsumables(profileId, selections) { const profile = getProfile(profileId); if (!profile?.characterId)
    throw new Error('Save the character before storing consumable defaults.'); db.prepare('INSERT INTO character_consumables (character_id,spec,selections_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(character_id,spec) DO UPDATE SET selections_json=excluded.selections_json,updated_at=excluded.updated_at').run(profile.characterId, profile.spec, JSON.stringify(selections), new Date().toISOString()); return characterConsumables(profileId); }
function snapshot(p) { return { name: p.name, realm: p.realm, className: p.className, spec: p.spec, profileId: p.id, characterId: p.characterId, persistence: p.persistence }; }
export function createRun(run) { const now = new Date().toISOString(); const r = db.prepare('INSERT INTO runs (mode,title,status,scenario_json,input,report_path,summary,simc_version,created_at,completed_at,profile_id,character_id,character_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(run.mode, run.title, run.status, JSON.stringify(run.scenario), run.input, run.reportPath ?? null, run.summary ?? null, run.simcVersion, now, run.completedAt ?? null, run.profileId ?? null, run.characterId ?? null, run.character ? JSON.stringify(run.character) : null); return Number(r.lastInsertRowid); }
function cleanupDisposable(profileId) { if (!profileId)
    return; const p = getProfile(profileId); if (p?.persistence === 'disposable')
    db.prepare('DELETE FROM profiles WHERE id=?').run(profileId); }
export function updateRun(id, patch) { db.prepare('UPDATE runs SET status=COALESCE(?,status),report_path=COALESCE(?,report_path),summary=COALESCE(?,summary),completed_at=COALESCE(?,completed_at) WHERE id=?').run(patch.status ?? null, patch.reportPath ?? null, patch.summary ?? null, patch.completedAt ?? null, id); if (patch.status && ['completed', 'failed', 'cancelled'].includes(patch.status)) {
    const row = db.prepare('SELECT profile_id FROM runs WHERE id=?').get(id);
    cleanupDisposable(row?.profile_id);
} }
export function saveRunResult(id, result) { db.prepare('UPDATE runs SET result_json=? WHERE id=?').run(JSON.stringify(result), id); }
export function runResult(id) { const row = db.prepare('SELECT result_json FROM runs WHERE id=?').get(id); return row?.result_json ? JSON.parse(row.result_json) : undefined; }
function rowToRun(r) { return { id: r.id, mode: r.mode, title: r.title, status: r.status, scenario: JSON.parse(r.scenario_json), input: r.input, reportPath: r.report_path, summary: r.summary, simcVersion: r.simc_version, createdAt: r.created_at, completedAt: r.completed_at, profileId: r.profile_id ?? undefined, characterId: r.character_id ?? undefined, character: r.character_json ? JSON.parse(r.character_json) : undefined }; }
export function runs() { return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 100').all().map(rowToRun); }
export function getRun(id) { const r = db.prepare('SELECT * FROM runs WHERE id=?').get(id); return r ? rowToRun(r) : undefined; }
export function deleteRuns(ids) { const unique = [...new Set(ids)].filter(Number.isInteger); if (!unique.length)
    return 0; const placeholders = unique.map(() => '?').join(','); const active = db.prepare(`SELECT count(*) count FROM runs WHERE id IN (${placeholders}) AND status IN ('queued','running')`).get(...unique).count; if (active)
    throw new Error('Active simulations cannot be deleted. Cancel or wait for them first.'); const rows = db.prepare(`SELECT report_path FROM runs WHERE id IN (${placeholders})`).all(...unique); for (const row of rows)
    if (row.report_path && existsSync(row.report_path))
        rmSync(row.report_path, { force: true }); if (existsSync(paths.reports))
    for (const id of unique)
        for (const file of readdirSync(paths.reports))
            if (file.startsWith(`run-${id}.`) || file.startsWith(`run-${id}-`))
                rmSync(join(paths.reports, file), { force: true }); db.prepare(`DELETE FROM topgear_jobs WHERE run_id IN (${placeholders})`).run(...unique); db.prepare(`DELETE FROM droptimizer_jobs WHERE run_id IN (${placeholders})`).run(...unique); const result = db.prepare(`DELETE FROM runs WHERE id IN (${placeholders})`).run(...unique); return result.changes; }
export function cleanupStaleDisposables() { db.prepare("DELETE FROM profiles WHERE persistence='disposable' AND id NOT IN (SELECT profile_id FROM runs WHERE status IN ('queued','running'))").run(); }
export function saveTopGearJob(runId, catalogVersion, preview, plans, request) { db.prepare('INSERT OR REPLACE INTO topgear_jobs (run_id,catalog_version,preview_json,plans_json,request_json,created_at) VALUES (?,?,?,?,?,?)').run(runId, catalogVersion, JSON.stringify(preview), JSON.stringify(plans), JSON.stringify(request), new Date().toISOString()); }
export function saveTopGearResults(runId, results) { db.prepare('UPDATE topgear_jobs SET results_json=? WHERE run_id=?').run(JSON.stringify(results), runId); }
export function saveTopGearProgress(runId, progress) { db.prepare('UPDATE topgear_jobs SET progress_json=? WHERE run_id=?').run(JSON.stringify(progress), runId); }
export function getTopGearJob(runId) { const row = db.prepare('SELECT * FROM topgear_jobs WHERE run_id=?').get(runId); return row && { runId: row.run_id, catalogVersion: row.catalog_version, preview: JSON.parse(row.preview_json), plans: JSON.parse(row.plans_json), request: JSON.parse(row.request_json), results: row.results_json ? JSON.parse(row.results_json) : [], progress: row.progress_json ? JSON.parse(row.progress_json) : undefined, createdAt: row.created_at }; }
export function saveDroptimizerJob(runId, request, entries) { db.prepare('INSERT OR REPLACE INTO droptimizer_jobs (run_id,request_json,entries_json,created_at) VALUES (?,?,?,?)').run(runId, JSON.stringify(request), JSON.stringify(entries), new Date().toISOString()); }
export function saveDroptimizerProgress(runId, progress) { db.prepare('UPDATE droptimizer_jobs SET progress_json=? WHERE run_id=?').run(JSON.stringify(progress), runId); }
export function saveDroptimizerResults(runId, results) { db.prepare('UPDATE droptimizer_jobs SET results_json=? WHERE run_id=?').run(JSON.stringify(results), runId); }
export function saveDroptimizerDiagnostics(runId, path) { db.prepare('UPDATE droptimizer_jobs SET diagnostics_path=? WHERE run_id=?').run(path, runId); }
export function getDroptimizerJob(runId) { const row = db.prepare('SELECT * FROM droptimizer_jobs WHERE run_id=?').get(runId); return row && { runId: row.run_id, request: JSON.parse(row.request_json), entries: JSON.parse(row.entries_json), results: row.results_json ? JSON.parse(row.results_json) : [], progress: row.progress_json ? JSON.parse(row.progress_json) : undefined, diagnosticsPath: row.diagnostics_path || undefined, createdAt: row.created_at }; }
export function calibration(key) { return db.prepare('SELECT throughput,samples FROM sim_calibrations WHERE cache_key=?').get(key); }
export function saveCalibration(key, throughput) { if (!Number.isFinite(throughput) || throughput <= 0)
    return; const existing = calibration(key), samples = (existing?.samples || 0) + 1, blended = existing ? (existing.throughput * existing.samples + throughput) / samples : throughput; db.prepare('INSERT INTO sim_calibrations (cache_key,throughput,samples,updated_at) VALUES (?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET throughput=excluded.throughput,samples=excluded.samples,updated_at=excluded.updated_at').run(key, blended, samples, new Date().toISOString()); }
