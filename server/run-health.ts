export type RunHealthState='healthy'|'watch'|'stalled'|'orphaned';
export interface RunHealthInput { status:string; stage?:string; createdAt:string; lastProgressAt?:string; activity?:{processKnown:boolean;lastOutputAt:string;lastProgressAt?:string;pid?:number;stdoutBytes:number;stderrBytes:number}; now?:number; development?:boolean; }
const WATCH_AFTER_MS=2*60_000, STALLED_AFTER_MS=5*60_000;
export function assessRunHealth(input:RunHealthInput){
  const now=input.now??Date.now(), active=['queued','running'].includes(input.status);
  const lastProgressAt=input.lastProgressAt||input.createdAt, progressAgeMs=Math.max(0,now-Date.parse(lastProgressAt));
  const lastOutputAt=input.activity?.lastOutputAt, outputAgeMs=lastOutputAt?Math.max(0,now-Date.parse(lastOutputAt)):undefined;
  let state:RunHealthState='healthy',message:string|undefined;
  if(active&&input.status==='running'&&!input.activity&&progressAgeMs>=30_000){state='orphaned';message='The dashboard is no longer connected to the local SimC process for this run. It cannot resume tracking this job.';}
  else if(active&&outputAgeMs!==undefined&&outputAgeMs>=STALLED_AFTER_MS){state='stalled';message='SimC has produced no output for five minutes. This run may be stuck; cancel it and run it again.';}
  else if(active&&((outputAgeMs!==undefined&&outputAgeMs>=WATCH_AFTER_MS)||(!input.activity&&progressAgeMs>=WATCH_AFTER_MS))){state='watch';message='No new simulation activity has been observed for two minutes. The estimate may be unreliable while this batch is quiet.';}
  return {state,message,lastActivityAt:lastOutputAt||lastProgressAt,stalledForMs:state==='healthy'?undefined:(outputAgeMs??progressAgeMs),developer:input.development?{stage:input.stage,processKnown:Boolean(input.activity?.processKnown),pid:input.activity?.pid,lastOutputAt,lastProgressAt,outputAgeMs,progressAgeMs,stdoutBytes:input.activity?.stdoutBytes??0,stderrBytes:input.activity?.stderrBytes??0}:undefined};
}
