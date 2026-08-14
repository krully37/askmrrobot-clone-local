import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { paths } from './db.js';

const configured = process.env.SIMC_PATH;
const candidates = [configured, join(process.cwd(),'runtime','simc.exe'), join(paths.root,'runtime','simc.exe')].filter(Boolean) as string[];
export function runtime() { const path=candidates.find(existsSync); return { path, available: Boolean(path), version: path ? 'installed (version read at run time)' : 'not installed' }; }
export async function smokeTest(path:string) { return new Promise<void>((resolve,reject) => { const p=spawn(path,['version'],{windowsHide:true}); let output=''; p.stdout.on('data',d=>output+=d); p.on('error',reject); p.on('close',code=>code===0 || output.length ? resolve() : reject(new Error(`SimC exited ${code}`))); }); }
export function ensureReports() { mkdirSync(paths.reports,{recursive:true}); }
