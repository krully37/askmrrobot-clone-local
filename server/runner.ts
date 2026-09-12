import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { paths, saveRunResult, updateRun } from './db.js';
import { runtime, ensureReports } from './runtime.js';
import { parseSimcResult } from './results.js';

const running = new Map<number, ReturnType<typeof spawn>>();
type ExecutionActivity={startedAt:string;lastOutputAt:string;lastProgressAt?:string;stdoutBytes:number;stderrBytes:number;pid?:number};
const activity = new Map<number, ExecutionActivity>();
export function executionActivity(id:number){const current=activity.get(id),process=running.get(id);return current?{...current,processKnown:Boolean(process),pid:process?.pid??current.pid,killed:process?.killed??false,exitCode:process?.exitCode??null}:undefined;}
export interface SimResult { reportPath: string; jsonPath: string; profilesets: { name:string; dps?:number; iterations?:number; error?:number }[]; elapsedMs:number; }
/**
 * json2 changed profilesets from an array/object of results to an object with a
 * `metric` and `results` property.  Read both layouts because historical runs
 * can use either SimC format.
 */
export function profileResults(json: any): {name:string;dps?:number;iterations?:number;error?:number}[] {
  const root=json?.sim?.profilesets ?? json?.profilesets;
  const values=Array.isArray(root)
    ? root
    : Array.isArray(root?.results)
      ? root.results
      : Object.values(root ?? {});
  return values
    .filter((x:any)=>x && typeof x==='object')
    .map((x:any)=>({
      name:String(x.name ?? x.profile_name ?? x.id ?? 'profileset'),
      dps:Number(x?.mean ?? x?.dps?.mean ?? x?.result?.mean ?? x?.result?.dps),
      iterations:Number(x?.count ?? x?.dps?.count ?? x?.result?.count ?? 0),
      error:Number(x?.mean_std_dev ?? x?.dps?.mean_std_dev ?? x?.result?.mean_std_dev ?? 0)
    }))
    .filter((x:{name:string;dps?:number})=>x.name!=='profileset' && Number.isFinite(x.dps));
}
export async function execute(id:number, input:string, options:{suffix?:string;finalize?:boolean;onProgress?:(completed:number,total:number)=>void}={}): Promise<SimResult> {
  const rt=runtime(); if (!rt.path) throw new Error('SimulationCraft was not found. Set SIMC_PATH to simc.exe or put it in runtime/simc.exe.');
  ensureReports(); const prefix=join(paths.reports, `run-${id}${options.suffix?`-${options.suffix}`:''}`); const inputPath=`${prefix}.simc`; const reportPath=`${prefix}.html`; const jsonPath=`${prefix}.json`;
  writeFileSync(inputPath,input); updateRun(id,{status:'running'});
  const started=Date.now(); return await new Promise<SimResult>((resolve,reject)=> { const p=spawn(rt.path!, [inputPath, `html=${reportPath}`, `json2=${jsonPath}`], {windowsHide:true}); const now=new Date().toISOString(); activity.set(id,{startedAt:now,lastOutputAt:now,stdoutBytes:0,stderrBytes:0,pid:p.pid}); running.set(id,p); let out=''; let err=''; let lineBuffer=''; let currentProfile=''; let completedInBatch=0; p.stdout.on('data',d=>{ const chunk=d.toString(); out+=chunk; const state=activity.get(id);if(state){state.lastOutputAt=new Date().toISOString();state.stdoutBytes+=Buffer.byteLength(chunk);} if(options.onProgress){ lineBuffer+=chunk; const parts=lineBuffer.split(/[\r\n]+/); lineBuffer=parts.pop()||''; let latestCompleted=-1, latestTotal=-1; for(const part of parts){ const m=part.match(/Generating (Profileset: .*?|Baseline:) (\d+)\/(\d+)/); if(m){ const pName=m[1]; if(pName!==currentProfile){ if(currentProfile!=='')completedInBatch++; currentProfile=pName; } latestCompleted=Number(m[2]); latestTotal=Number(m[3]); } } if(latestCompleted>0 && latestTotal>0){const current=activity.get(id);if(current)current.lastProgressAt=new Date().toISOString();options.onProgress(completedInBatch + (latestCompleted/latestTotal), 0);} } }); p.stderr.on('data',d=>{err+=d;const state=activity.get(id);if(state){state.lastOutputAt=new Date().toISOString();state.stderrBytes+=Buffer.byteLength(String(d));}}); p.on('error',reject); p.on('close',code=> { running.delete(id); if(code===0 && existsSync(reportPath)) { const dps=out.match(/(?:DPS|Raid DPS)\s*=\s*([\d,.]+)/i)?.[1]; const profilesets=existsSync(jsonPath)?profileResults(JSON.parse(readFileSync(jsonPath,'utf8'))):[]; if(options.finalize!==false) { const result=parseSimcResult(jsonPath,'quick',input);if(result)saveRunResult(id,result);updateRun(id,{status:'completed',reportPath,summary:profilesets.length?`${profilesets.length} Top Gear profiles completed`:dps ? `DPS ${dps}` : 'Completed',completedAt:new Date().toISOString()}); } resolve({reportPath,jsonPath,profilesets,elapsedMs:Date.now()-started}); } else { if(options.finalize!==false) updateRun(id,{status:'failed',summary:(err||out||`SimC exited ${code}`).slice(-2000),completedAt:new Date().toISOString()}); reject(new Error(err||out||`SimC exited ${code}`)); } }); });
}
export function cancel(id:number) { const p=running.get(id); if (!p) return false; p.kill(); updateRun(id,{status:'cancelled',completedAt:new Date().toISOString()}); return true; }
