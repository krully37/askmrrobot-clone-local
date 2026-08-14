import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterProfile, Run, Scenario } from './types.js';

const root = join(process.cwd(), '.localsimdash'); mkdirSync(root, { recursive: true });
const db = new Database(join(root, 'dashboard.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, class_name TEXT NOT NULL, spec TEXT NOT NULL, raw_profile TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, mode TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, scenario_json TEXT NOT NULL, input TEXT NOT NULL, report_path TEXT, summary TEXT, simc_version TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT);`);

export const paths = { root, reports: join(root, 'reports') };
export function saveProfile(p: Omit<CharacterProfile, 'id' | 'createdAt'>) {
  const now = new Date().toISOString(); const r = db.prepare('INSERT INTO profiles (name,class_name,spec,raw_profile,created_at) VALUES (?,?,?,?,?)').run(p.name,p.className,p.spec,p.rawProfile,now);
  return { id: Number(r.lastInsertRowid), ...p, createdAt: now };
}
export function profiles() { return db.prepare('SELECT id,name,class_name as className,spec,raw_profile as rawProfile,created_at as createdAt FROM profiles ORDER BY id DESC').all() as CharacterProfile[]; }
export function getProfile(id: number) { return db.prepare('SELECT id,name,class_name as className,spec,raw_profile as rawProfile,created_at as createdAt FROM profiles WHERE id=?').get(id) as CharacterProfile | undefined; }
export function createRun(run: Omit<Run, 'id'|'createdAt'>) { const now=new Date().toISOString(); const r=db.prepare('INSERT INTO runs (mode,title,status,scenario_json,input,report_path,summary,simc_version,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(run.mode,run.title,run.status,JSON.stringify(run.scenario),run.input,run.reportPath ?? null,run.summary ?? null,run.simcVersion,now,run.completedAt ?? null); return Number(r.lastInsertRowid); }
export function updateRun(id:number, patch: Partial<Pick<Run,'status'|'reportPath'|'summary'|'completedAt'>>) { db.prepare('UPDATE runs SET status=COALESCE(?,status), report_path=COALESCE(?,report_path), summary=COALESCE(?,summary), completed_at=COALESCE(?,completed_at) WHERE id=?').run(patch.status ?? null,patch.reportPath ?? null,patch.summary ?? null,patch.completedAt ?? null,id); }
export function runs() { return db.prepare('SELECT id,mode,title,status,scenario_json,input,report_path,summary,simc_version,created_at,completed_at FROM runs ORDER BY id DESC LIMIT 100').all().map(rowToRun); }
export function getRun(id:number) { const r=db.prepare('SELECT id,mode,title,status,scenario_json,input,report_path,summary,simc_version,created_at,completed_at FROM runs WHERE id=?').get(id); return r ? rowToRun(r) : undefined; }
function rowToRun(r:any): Run { return { id:r.id,mode:r.mode,title:r.title,status:r.status,scenario:JSON.parse(r.scenario_json) as Scenario,input:r.input,reportPath:r.report_path,summary:r.summary,simcVersion:r.simc_version,createdAt:r.created_at,completedAt:r.completed_at }; }
