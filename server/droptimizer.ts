import { getRun, paths, saveDroptimizerDiagnostics, saveDroptimizerJob, saveDroptimizerProgress, saveDroptimizerResults, saveRunResult, updateRun } from './db.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInput, parseInventory } from './profile.js';
import { execute } from './runner.js';
import { parseSimcResult } from './results.js';
import type { Scenario } from './types.js';
import { enrichInventory, openCatalog } from './catalog.js';
import { buildDroptimizerGearsetInput, buildDroptimizerGearsets, DROPTIMIZER_SLOTS, type DroptimizerDrop, type DroptimizerGearset } from './droptimizer-gearsets.js';
import { getCappedUpgradeLevel } from './tracks.js';
import { EQUIPMENT_POLICY_VERSION, evaluateEquipment, resolveSimulationSlot } from './equipment-policy.js';

const supportedSlots=new Set<string>(DROPTIMIZER_SLOTS);
const paired=(slot:string)=>slot.startsWith('finger')?['finger1','finger2']:slot.startsWith('trinket')?['trinket1','trinket2']:[slot];
export interface Drop extends DroptimizerDrop {}
type Entry = DroptimizerGearset;
interface DropProgress {stage:'queued'|'baseline'|'simulating'|'completed'|'cancelled'|'failed';totalProfiles:number;completedProfiles:number;currentBatch:number;totalBatches:number;elapsedMs:number;estimatedRemainingMs?:number;partialResults:{name:string;dps?:number;boss?:string;delta?:number}[];reports:string[];failedProfiles:number;threads:number;error?:string;lastProgressAt?:string}

export async function runDroptimizer(runId:number, rawProfile:string, drops:Drop[], scenario:Scenario, threads:number, upgradeTarget?: number, upgradeEquipped?: boolean, minSetBonuses?: Record<string, number>) {
  const characterClass=rawProfile.match(/^\s*([a-z_]+)=/mi)?.[1]||'';
  const characterSpec=rawProfile.match(/^\s*spec=([^\n]+)/mi)?.[1]?.trim()||'';
  let eligibilityAudit:any[]=[];
  const dbForMetadata=openCatalog();
  const dropsWithMetadata=(()=>{try { const derived=dbForMetadata.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='derived_item_metadata'").get();const lookup=dbForMetadata.prepare(derived?'SELECT i.unique_key as uniqueKey,i.handedness,dm.class_id as classId,dm.subclass_id as subclassId,dm.inventory_type as inventoryType FROM items i LEFT JOIN derived_item_metadata dm ON dm.item_id=i.id WHERE i.id=?':'SELECT unique_key as uniqueKey, handedness FROM items WHERE id=?');const evaluated=drops.map(drop=>{const metadata=lookup.get(drop.id) as {uniqueKey?:string;handedness?:Drop['handedness'];classId?:number;subclassId?:number;inventoryType?:number}|undefined;const slot=resolveSimulationSlot(drop.slot,metadata?.inventoryType);return {...drop,slot,...metadata,eligibility:evaluateEquipment(characterClass,characterSpec,slot,metadata||{})};});eligibilityAudit=evaluated.map(drop=>({itemId:drop.id,name:drop.name,slot:drop.slot,metadata:{classId:drop.classId,subclassId:drop.subclassId,inventoryType:drop.inventoryType,handedness:drop.handedness},eligibility:drop.eligibility}));return evaluated.filter(drop=>drop.eligibility.eligible); } finally { dbForMetadata.close(); }})();
  const inventory = parseInventory(rawProfile);
  let entries:Entry[]=buildDroptimizerGearsets(dropsWithMetadata, rawProfile, upgradeTarget, inventory);
  let displayedItemLevels = new Map(entries.map(entry => [entry.drop.id, entry.drop.itemLevel]));

  if (minSetBonuses && Object.keys(minSetBonuses).length > 0) {
    enrichInventory(inventory);
    const equippedSets: Record<string, number> = {};
    for (const c of inventory.candidates) {
      if (c.source === 'equipped' && c.setName) {
        equippedSets[c.setName] = (equippedSets[c.setName] || 0) + 1;
      }
    }
    const db = openCatalog();
    try {
      const getSet = db.prepare(`SELECT items.item_set_id, item_sets.name FROM items LEFT JOIN item_sets ON items.item_set_id = item_sets.id WHERE items.id = ?`);
      entries = entries.filter(entry => {
        const replaced = inventory.candidates.find(c => c.source === 'equipped' && c.slot === entry.slot);
        const dropSetRow = getSet.get(entry.drop.id) as {item_set_id: number, name: string} | undefined;
        const dropSetName = dropSetRow?.name;

        const newSets = { ...equippedSets };
        if (replaced && replaced.setName) newSets[replaced.setName] = (newSets[replaced.setName] || 1) - 1;
        if (dropSetName) newSets[dropSetName] = (newSets[dropSetName] || 0) + 1;

        for (const [setName, minReq] of Object.entries(minSetBonuses)) {
          if ((newSets[setName] || 0) < minReq) return false;
        }
        return true;
      });
    } finally { db.close(); }
  }

  let finalRawProfile = rawProfile;
  saveDroptimizerJob(runId,{scenario,threads,drops,upgradeTarget,upgradeEquipped,rawProfile:finalRawProfile},entries);
  const diagnosticsPath=join(paths.reports,`run-${runId}-droptimizer-diagnostics.json`);
  const writeDiagnostics=(reports:string[]=[])=>{writeFileSync(diagnosticsPath,JSON.stringify({version:2,runId,createdAt:new Date().toISOString(),eligibility:{className:characterClass,spec:characterSpec,policyVersion:EQUIPMENT_POLICY_VERSION,items:eligibilityAudit},baseline:parseInventory(finalRawProfile).candidates.filter(candidate=>candidate.source==='equipped').map(candidate=>({slot:candidate.slot,itemId:candidate.itemId,itemLevel:candidate.itemLevel,rawLine:candidate.rawLine})),candidates:entries.map(entry=>({name:entry.name,drop:entry.drop,replacementSlot:entry.slot,gear:entry.gear,profilesetLines:entry.profilesetLines,warnings:entry.warnings})),artifacts:{diagnosticsPath,reports:reports.map(reportPath=>({htmlPath:reportPath,simcPath:reportPath.replace(/\.html$/,'.simc'),jsonPath:reportPath.replace(/\.html$/,'.json')}))}},null,2));saveDroptimizerDiagnostics(runId,diagnosticsPath);};
  if (upgradeEquipped && upgradeTarget) {
    const db = openCatalog();
    try {
      const getTrack = db.prepare('SELECT track FROM item_variants WHERE item_id = ? AND track != "" LIMIT 1');
      const upgradedLines = rawProfile.split('\n').map(line => {
        const idMatch = line.match(/^([a-z_0-9]+)=.*,id=(\d+)/i);
        if (!idMatch) return line;
        const slot = idMatch[1];
        if (!supportedSlots.has(slot)) return line;
        const itemId = parseInt(idMatch[2], 10);
        const trackRow = getTrack.get(itemId) as {track?:string};
        let cappedLevel = upgradeTarget;
        if (trackRow?.track) {
          cappedLevel = getCappedUpgradeLevel(trackRow.track, upgradeTarget) || upgradeTarget;
        }
        return `${line.replace(/,ilevel=\d+/g, '')},ilevel=${cappedLevel}`;
      });
      finalRawProfile = upgradedLines.join('\n');
    } finally { db.close(); }
  }
  if (finalRawProfile !== rawProfile) {
    const allowedNames = new Set(entries.map(entry => entry.name));
    entries = buildDroptimizerGearsets(dropsWithMetadata, finalRawProfile, upgradeTarget).filter(entry => allowedNames.has(entry.name));
    displayedItemLevels = new Map(entries.map(entry => [entry.drop.id, entry.drop.itemLevel]));
  }
  saveDroptimizerJob(runId,{scenario,threads,drops,upgradeTarget,upgradeEquipped,rawProfile:finalRawProfile},entries);
  writeDiagnostics();

  updateRun(runId,{status:'running'}); const started=Date.now(); let baseline=0,baselineError=0; let currentBatch=0; let batchSize=10;
  const scores=new Map<string,number>(), scoreErrors=new Map<string,number>(), failures=new Map<string,string>(); const reports:string[]=[];
  const rows=()=>Array.from(new Map(entries.map(entry=>[entry.drop.id,entry])).values()).map(drop=>{const candidates=entries.filter(entry=>entry.drop.id===drop.drop.id).map(entry=>({slot:entry.slot,dps:scores.get(entry.name)||0,error:failures.get(entry.name),simulationError:scoreErrors.get(entry.name)||0})).filter(x=>x.dps);const best=candidates.sort((a,b)=>b.dps-a.dps)[0];const entry=entries.find(value=>value.drop.id===drop.drop.id&&value.slot===(best?.slot||drop.slot));const failure=entries.filter(entry=>entry.drop.id===drop.drop.id).map(entry=>failures.get(entry.name)).find(Boolean);const dps=best?.dps||0,delta=dps-baseline,uncertainty=Math.sqrt(baselineError**2+(best?.simulationError||0)**2),replaced=entry?.gear.find(line=>line.slot===(best?.slot||drop.slot));const significant=Math.abs(delta)>1.96*uncertainty,warningReasons=[...(entry?.warnings||[])];const verificationEligible=Boolean(significant&&delta/baseline<=-.02&&(drop.drop.itemLevel||0)>=(replaced?.itemLevel||0)+5||warningReasons.some(warning=>/No verified bonus IDs/i.test(warning)));return {itemId:drop.drop.id,name:drop.drop.name,boss:drop.drop.boss,difficulty:drop.drop.difficulty,slot:best?.slot||drop.slot,itemLevel:displayedItemLevels.get(drop.drop.id) ?? drop.drop.itemLevel,replacedItemLevel:replaced?.itemLevel,dps,delta,relative:baseline?delta/baseline:0,uncertainty,significant,verificationEligible,verificationReasons:warningReasons,error:best?undefined:failure};}).sort((a,b)=>b.delta-a.delta);
  const save=(patch:Partial<DropProgress>={})=>{
    const completedProfiles=patch.completedProfiles ?? (scores.size+failures.size);
    const elapsedMs=Date.now()-started, remaining=Math.max(0,entries.length-completedProfiles);
    const msPerProfile=completedProfiles?elapsedMs/completedProfiles:undefined;
    const plannedRemainingBatches=Math.ceil(remaining/Math.max(1,batchSize));
    const progress:DropProgress={stage:'simulating',totalProfiles:entries.length,completedProfiles,currentBatch,totalBatches:currentBatch+plannedRemainingBatches,elapsedMs,estimatedRemainingMs:msPerProfile?Math.round(remaining*msPerProfile):undefined,partialResults:rows().filter(x=>x.dps).slice(0,8).map(x=>({name:x.name,dps:x.dps,boss:x.boss,delta:x.delta})),reports,failedProfiles:failures.size,threads,lastProgressAt:new Date().toISOString(),...patch};
    saveDroptimizerProgress(runId,progress); saveDroptimizerResults(runId,rows()); return progress;
  };
  const cancelled=()=>getRun(runId)?.status==='cancelled';
  const runBatch=async(batch:Entry[]):Promise<void>=>{
    if(!batch.length||cancelled())return;
    const batchStarted=Date.now();
    try {
      const result=await execute(runId,buildInput(buildDroptimizerGearsetInput(finalRawProfile,batch),scenario,threads),{suffix:`batch-${currentBatch}-${Date.now()}`,finalize:false,onProgress:c=>save({completedProfiles:scores.size+failures.size+c})});
      reports.push(result.reportPath);
      writeDiagnostics(reports);
      const resultScores=new Map(result.profilesets.map(x=>[x.name,x]));
      for(const entry of batch){const score=resultScores.get(entry.name);if(score?.dps){scores.set(entry.name,score.dps);scoreErrors.set(entry.name,score.error||0);}else failures.set(entry.name,'Simulation returned no DPS result.');}
      const perProfile=(Date.now()-batchStarted)/Math.max(1,batch.length);
      batchSize=Math.max(5,Math.min(100,Math.round(20000/Math.max(1,perProfile))));
    } catch(error) {
      if(cancelled())return;
      if(batch.length>1){const halfway=Math.ceil(batch.length/2);await runBatch(batch.slice(0,halfway));await runBatch(batch.slice(halfway));return;}
      failures.set(batch[0].name,(error instanceof Error?error.message:String(error)).slice(-500));
    }
  };
  save({stage:'queued',currentBatch:0,totalBatches:Math.ceil(entries.length/batchSize)});
  try {
    save({stage:'baseline'});
    const base=await execute(runId,buildInput(finalRawProfile,scenario,threads),{suffix:'baseline',finalize:false}); const baselineResult=parseSimcResult(base.jsonPath); baseline=baselineResult?.dps||0;baselineError=baselineResult?.error||0; reports.push(base.reportPath); writeDiagnostics(reports);
    if(!baseline)throw new Error('Baseline simulation returned no DPS result.');
    save({stage:'simulating'});
    let cursor=0;
    while(cursor<entries.length&&!cancelled()) { currentBatch++; const batch=entries.slice(cursor,cursor+batchSize); await runBatch(batch); cursor+=batch.length; save(); }
    const finalRows=rows(); const state=cancelled()?'cancelled':'completed';
    save({stage:state,currentBatch,estimatedRemainingMs:state==='completed'?0:undefined,totalBatches:currentBatch});
    saveRunResult(runId,{version:1,kind:'droptimizer',dps:finalRows[0]?.dps||baseline,error:0,iterations:0,elapsedSeconds:(Date.now()-started)/1000,warnings:[],gear:[],damage:[],buffs:[],comparisons:finalRows,baselineDps:baseline,diagnosticsPath});
    updateRun(runId,{status:state,reportPath:reports[0],summary:`${finalRows.filter(x=>x.dps).length}/${finalRows.length} drops ranked against equipped gear${state==='cancelled'?' (partial)':''}`,completedAt:new Date().toISOString()});
    return finalRows;
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    if(cancelled()){const partial=rows();save({stage:'cancelled',estimatedRemainingMs:undefined});saveRunResult(runId,{version:1,kind:'droptimizer',dps:partial[0]?.dps||baseline,error:0,iterations:0,elapsedSeconds:(Date.now()-started)/1000,warnings:[],gear:[],damage:[],buffs:[],comparisons:partial,baselineDps:baseline});updateRun(runId,{status:'cancelled',summary:`${partial.filter(x=>x.dps).length}/${partial.length} drops ranked before cancellation`,completedAt:new Date().toISOString()});return partial;}
    save({stage:'failed',error:message}); updateRun(runId,{status:'failed',summary:message.slice(-2000),completedAt:new Date().toISOString()}); throw error;
  }
}

/** Run the original baseline and one saved Droptimizer profileset at tighter precision. */
export async function runDroptimizerVerification(runId:number,rawProfile:string,entry:DroptimizerGearset,scenario:Scenario,threads:number){
  const verificationScenario={...scenario,rawOverride:`${scenario.rawOverride||''}\ntarget_error=0.05`.trim()};
  try {
    updateRun(runId,{status:'running'});
    const baselineRun=await execute(runId,buildInput(rawProfile,verificationScenario,threads),{suffix:'verification-baseline',finalize:false});
    const baseline=parseSimcResult(baselineRun.jsonPath);
    if(!baseline?.dps)throw new Error('Verification baseline returned no DPS result.');
    const candidateRun=await execute(runId,buildInput(buildDroptimizerGearsetInput(rawProfile,[entry]),verificationScenario,threads),{suffix:'verification-candidate',finalize:false});
    const candidate=candidateRun.profilesets.find(result=>result.name===entry.name);
    if(!candidate?.dps)throw new Error('Verification candidate returned no DPS result.');
    const delta=candidate.dps-baseline.dps, uncertainty=Math.sqrt((baseline.error||0)**2+(candidate.error||0)**2);
    saveRunResult(runId,{version:1,kind:'droptimizer-verify',dps:candidate.dps,error:candidate.error||0,iterations:candidate.iterations||0,elapsedSeconds:0,warnings:[],gear:entry.gear,damage:[],buffs:[],baselineDps:baseline.dps,comparisons:[{itemId:entry.drop.id,slot:entry.slot,dps:candidate.dps,delta,relative:delta/baseline.dps,uncertainty,significant:Math.abs(delta)>1.96*uncertainty,targeted:true}],diagnosticsPath:undefined});
    updateRun(runId,{status:'completed',reportPath:candidateRun.reportPath,summary:`Targeted verification for ${entry.drop.name}`,completedAt:new Date().toISOString()});
  } catch(error) { updateRun(runId,{status:'failed',summary:error instanceof Error?error.message:String(error),completedAt:new Date().toISOString()}); throw error; }
}
