import { getRun, saveDroptimizerJob, saveDroptimizerProgress, saveDroptimizerResults, saveRunResult, updateRun } from './db.js';
import { buildInput, parseInventory } from './profile.js';
import { execute } from './runner.js';
import { parseSimcResult } from './results.js';
import type { Scenario } from './types.js';
import { enrichInventory, openCatalog } from './catalog.js';
import { buildDroptimizerGearsetInput, buildDroptimizerGearsets, DROPTIMIZER_SLOTS, type DroptimizerDrop, type DroptimizerGearset } from './droptimizer-gearsets.js';
import { getCappedUpgradeLevel } from './tracks.js';

const supportedSlots=new Set<string>(DROPTIMIZER_SLOTS);
const paired=(slot:string)=>slot.startsWith('finger')?['finger1','finger2']:slot.startsWith('trinket')?['trinket1','trinket2']:[slot];
export interface Drop extends DroptimizerDrop {}
type Entry = DroptimizerGearset;
interface DropProgress {stage:'queued'|'baseline'|'simulating'|'completed'|'cancelled'|'failed';totalProfiles:number;completedProfiles:number;currentBatch:number;totalBatches:number;elapsedMs:number;estimatedRemainingMs?:number;partialResults:{name:string;dps?:number;boss?:string;delta?:number}[];reports:string[];failedProfiles:number;threads:number;error?:string}

export async function runDroptimizer(runId:number, rawProfile:string, drops:Drop[], scenario:Scenario, threads:number, upgradeTarget?: number, upgradeEquipped?: boolean, minSetBonuses?: Record<string, number>) {
  let entries:Entry[]=buildDroptimizerGearsets(drops, upgradeTarget);
  const displayedItemLevels = new Map(entries.map(entry => [entry.drop.id, entry.drop.itemLevel]));

  const inventory = parseInventory(rawProfile);

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

  saveDroptimizerJob(runId,{scenario,threads,drops,upgradeTarget,upgradeEquipped},entries);

  let finalRawProfile = rawProfile;
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

  updateRun(runId,{status:'running'}); const started=Date.now(); let baseline=0; let currentBatch=0; let batchSize=10;
  const scores=new Map<string,number>(), failures=new Map<string,string>(); const reports:string[]=[];
  const rows=()=>drops.map(drop=>{const candidates=paired(drop.slot).map(slot=>({slot,dps:scores.get(`drop_${drop.id}_${slot}`)||0,error:failures.get(`drop_${drop.id}_${slot}`)})).filter(x=>x.dps);const best=candidates.sort((a,b)=>b.dps-a.dps)[0];const failure=paired(drop.slot).map(slot=>failures.get(`drop_${drop.id}_${slot}`)).find(Boolean);return {itemId:drop.id,name:drop.name,boss:drop.boss,difficulty:drop.difficulty,slot:best?.slot||drop.slot,itemLevel:displayedItemLevels.get(drop.id) ?? drop.itemLevel,dps:best?.dps||0,delta:(best?.dps||0)-baseline,relative:baseline?((best?.dps||0)-baseline)/baseline:0,enhancement:'Preserved equipped-slot enhancement when available',error:best?undefined:failure};}).sort((a,b)=>b.delta-a.delta);
  const save=(patch:Partial<DropProgress>={})=>{
    const completedProfiles=patch.completedProfiles ?? (scores.size+failures.size);
    const elapsedMs=Date.now()-started, remaining=Math.max(0,entries.length-completedProfiles);
    const msPerProfile=completedProfiles?elapsedMs/completedProfiles:undefined;
    const plannedRemainingBatches=Math.ceil(remaining/Math.max(1,batchSize));
    const progress:DropProgress={stage:'simulating',totalProfiles:entries.length,completedProfiles,currentBatch,totalBatches:currentBatch+plannedRemainingBatches,elapsedMs,estimatedRemainingMs:msPerProfile?Math.round(remaining*msPerProfile):undefined,partialResults:rows().filter(x=>x.dps).slice(0,8).map(x=>({name:x.name,dps:x.dps,boss:x.boss,delta:x.delta})),reports,failedProfiles:failures.size,threads,...patch};
    saveDroptimizerProgress(runId,progress); saveDroptimizerResults(runId,rows()); return progress;
  };
  const cancelled=()=>getRun(runId)?.status==='cancelled';
  const runBatch=async(batch:Entry[]):Promise<void>=>{
    if(!batch.length||cancelled())return;
    const batchStarted=Date.now();
    try {
      const result=await execute(runId,buildInput(buildDroptimizerGearsetInput(finalRawProfile,batch,inventory),scenario,threads),{suffix:`batch-${currentBatch}-${Date.now()}`,finalize:false,onProgress:c=>save({completedProfiles:scores.size+failures.size+c})});
      reports.push(result.reportPath);
      const resultScores=new Map(result.profilesets.map(x=>[x.name,x.dps||0]));
      for(const entry of batch){const score=resultScores.get(entry.name);if(score)scores.set(entry.name,score);else failures.set(entry.name,'Simulation returned no DPS result.');}
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
    const base=await execute(runId,buildInput(finalRawProfile,scenario,threads),{suffix:'baseline',finalize:false}); baseline=parseSimcResult(base.jsonPath)?.dps||0; reports.push(base.reportPath);
    if(!baseline)throw new Error('Baseline simulation returned no DPS result.');
    save({stage:'simulating'});
    let cursor=0;
    while(cursor<entries.length&&!cancelled()) { currentBatch++; const batch=entries.slice(cursor,cursor+batchSize); await runBatch(batch); cursor+=batch.length; save(); }
    const finalRows=rows(); const state=cancelled()?'cancelled':'completed';
    save({stage:state,currentBatch,estimatedRemainingMs:state==='completed'?0:undefined,totalBatches:currentBatch});
    saveRunResult(runId,{version:1,kind:'droptimizer',dps:finalRows[0]?.dps||baseline,error:0,iterations:0,elapsedSeconds:(Date.now()-started)/1000,warnings:[],gear:[],damage:[],buffs:[],comparisons:finalRows,baselineDps:baseline});
    updateRun(runId,{status:state,reportPath:reports[0],summary:`${finalRows.filter(x=>x.dps).length}/${finalRows.length} drops ranked against equipped gear${state==='cancelled'?' (partial)':''}`,completedAt:new Date().toISOString()});
    return finalRows;
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    if(cancelled()){const partial=rows();save({stage:'cancelled',estimatedRemainingMs:undefined});saveRunResult(runId,{version:1,kind:'droptimizer',dps:partial[0]?.dps||baseline,error:0,iterations:0,elapsedSeconds:(Date.now()-started)/1000,warnings:[],gear:[],damage:[],buffs:[],comparisons:partial,baselineDps:baseline});updateRun(runId,{status:'cancelled',summary:`${partial.filter(x=>x.dps).length}/${partial.length} drops ranked before cancellation`,completedAt:new Date().toISOString()});return partial;}
    save({stage:'failed',error:message}); updateRun(runId,{status:'failed',summary:message.slice(-2000),completedAt:new Date().toISOString()}); throw error;
  }
}
