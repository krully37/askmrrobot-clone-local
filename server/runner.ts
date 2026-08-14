import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { paths, updateRun } from './db.js';
import { runtime, ensureReports } from './runtime.js';

const running = new Map<number, ReturnType<typeof spawn>>();
export async function execute(id:number, input:string) {
  const rt=runtime(); if (!rt.path) throw new Error('SimulationCraft was not found. Set SIMC_PATH to simc.exe or put it in runtime/simc.exe.');
  ensureReports(); const prefix=join(paths.reports, `run-${id}`); const inputPath=`${prefix}.simc`; const reportPath=`${prefix}.html`;
  writeFileSync(inputPath,input); updateRun(id,{status:'running'});
  await new Promise<void>((resolve,reject)=> { const p=spawn(rt.path!, [inputPath, `html=${reportPath}`], {windowsHide:true}); running.set(id,p); let out=''; let err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d); p.on('error',reject); p.on('close',code=> { running.delete(id); if(code===0 && existsSync(reportPath)) { const dps=out.match(/(?:DPS|Raid DPS)\s*=\s*([\d,.]+)/i)?.[1]; updateRun(id,{status:'completed',reportPath,summary:dps ? `DPS ${dps}` : 'Completed',completedAt:new Date().toISOString()}); resolve(); } else { updateRun(id,{status:'failed',summary:(err||out||`SimC exited ${code}`).slice(-2000),completedAt:new Date().toISOString()}); reject(new Error(err||out||`SimC exited ${code}`)); } }); });
}
export function cancel(id:number) { const p=running.get(id); if (!p) return false; p.kill(); updateRun(id,{status:'cancelled',completedAt:new Date().toISOString()}); return true; }
