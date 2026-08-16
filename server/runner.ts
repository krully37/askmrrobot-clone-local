import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { paths, saveRunResult, updateRun } from './db.js';
import { runtime, ensureReports } from './runtime.js';
import { parseSimcResult } from './results.js';

const running = new Map<number, ReturnType<typeof spawn>>();
export interface SimResult { reportPath: string; jsonPath: string; profilesets: { name:string; dps?:number }[]; elapsedMs:number; }
/**
 * json2 changed profilesets from an array/object of results to an object with a
 * `metric` and `results` property.  Read both layouts because historical runs
 * can use either SimC format.
 */
export function profileResults(json: any): {name:string;dps?:number}[] {
  const root=json?.sim?.profilesets ?? json?.profilesets;
  const values=Array.isArray(root)
    ? root
    : Array.isArray(root?.results)
      ? root.results
      : Object.values(root ?? {});
  return values
    .filter((x:any)=>x && typeof x==='object')
    .map((x:any)=>({name:String(x.name ?? x.profile_name ?? x.id ?? 'profileset'),dps:Number(x?.mean ?? x?.dps?.mean ?? x?.result?.mean ?? x?.result?.dps)}))
    .filter((x:{name:string;dps?:number})=>x.name!=='profileset' && Number.isFinite(x.dps));
}
export async function execute(id:number, input:string, options:{suffix?:string;finalize?:boolean}={}): Promise<SimResult> {
  const rt=runtime(); if (!rt.path) throw new Error('SimulationCraft was not found. Set SIMC_PATH to simc.exe or put it in runtime/simc.exe.');
  ensureReports(); const prefix=join(paths.reports, `run-${id}${options.suffix?`-${options.suffix}`:''}`); const inputPath=`${prefix}.simc`; const reportPath=`${prefix}.html`; const jsonPath=`${prefix}.json`;
  writeFileSync(inputPath,input); updateRun(id,{status:'running'});
  const started=Date.now(); return await new Promise<SimResult>((resolve,reject)=> { const p=spawn(rt.path!, [inputPath, `html=${reportPath}`, `json2=${jsonPath}`], {windowsHide:true}); running.set(id,p); let out=''; let err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d); p.on('error',reject); p.on('close',code=> { running.delete(id); if(code===0 && existsSync(reportPath)) { const dps=out.match(/(?:DPS|Raid DPS)\s*=\s*([\d,.]+)/i)?.[1]; const profilesets=existsSync(jsonPath)?profileResults(JSON.parse(readFileSync(jsonPath,'utf8'))):[]; if(options.finalize!==false) { const result=parseSimcResult(jsonPath);if(result)saveRunResult(id,result);updateRun(id,{status:'completed',reportPath,summary:profilesets.length?`${profilesets.length} Top Gear profiles completed`:dps ? `DPS ${dps}` : 'Completed',completedAt:new Date().toISOString()}); } resolve({reportPath,jsonPath,profilesets,elapsedMs:Date.now()-started}); } else { if(options.finalize!==false) updateRun(id,{status:'failed',summary:(err||out||`SimC exited ${code}`).slice(-2000),completedAt:new Date().toISOString()}); reject(new Error(err||out||`SimC exited ${code}`)); } }); });
}
export function cancel(id:number) { const p=running.get(id); if (!p) return false; p.kill(); updateRun(id,{status:'cancelled',completedAt:new Date().toISOString()}); return true; }
