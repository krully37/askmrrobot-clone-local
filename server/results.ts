import { existsSync, readFileSync } from 'node:fs';
import type { PlannedLoadout } from './optimizer.js';

const list=(value:any)=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
const number=(value:any)=>Number.isFinite(Number(value))?Number(value):0;
const label=(value:any)=>String(value?.spell_name||value?.name||value?.id||'Unknown').replace(/_/g,' ');

export interface LocalResult { version:1; kind:'quick'|'topgear'|'droptimizer'; dps:number; error:number; iterations:number; elapsedSeconds:number; warnings:string[]; character?:any; scenario?:any; gear:any[]; damage:any[]; buffs:any[]; comparisons?:any[]; }

export function parseSimcResult(jsonPath:string, kind:LocalResult['kind']='quick'):LocalResult|undefined {
  if(!existsSync(jsonPath)) return;
  const root=JSON.parse(readFileSync(jsonPath,'utf8')); const sim=root?.sim||{}; const player=list(sim.players)[0]||{};
  const data=player.collected_data||{}; const dps=data.dps||{};
  const actions=list(player.stats).map((x:any)=>({name:label(x),amount:number(x?.actual_amount?.mean??x?.compound_amount?.mean??x?.total_amount??x?.amount),count:number(x?.num_executes??x?.executions),school:String(x?.school||'')})).filter((x:any)=>x.amount>0).sort((a:any,b:any)=>b.amount-a.amount);
  const buffs=list(player.buffs).map((x:any)=>({name:label(x),uptime:number(x?.uptime),count:number(x?.start_count??x?.trigger),school:String(x?.spell_school||'')})).filter((x:any)=>x.uptime>0).sort((a:any,b:any)=>b.uptime-a.uptime);
  const gear=Object.entries(player.gear||{}).filter(([,x]:any)=>x?.name).map(([slot,x]:any)=>({slot,name:String(x.name).replace(/_/g,' '),itemId:Number(String(x.encoded_item||'').match(/(?:^|,)id=(\d+)/)?.[1])||undefined,itemLevel:number(x.ilevel),encodedItem:x.encoded_item}));
  const warnings=list(root.logs).map((x:any)=>typeof x==='string'?x:String(x?.message||'')).filter(Boolean);
  return {version:1,kind,dps:number(dps.mean),error:number(dps.mean_std_dev),iterations:number(dps.count),elapsedSeconds:number(sim.statistics?.elapsed_time_seconds),warnings,character:{name:player.name,race:player.race,level:player.level,specialization:player.specialization,talents:player.talents,potion:player.potion,flask:player.flask,food:player.food},gear,damage:actions,buffs};
}

export function topGearResult(results:{name:string;dps?:number}[], plans:PlannedLoadout[]):LocalResult {
  const byName=new Map(plans.map(p=>[p.name,p])); const rows=results.map(row=>{const plan=byName.get(row.name);return {name:row.name,dps:number(row.dps),talent:plan?.talent.name,source:plan?.source,vaultCandidateId:plan?.vaultCandidateId,gear:plan?.candidates.map(c=>({slot:c.slot,name:c.name,itemId:c.itemId,itemLevel:c.itemLevel,source:c.source,rawLine:c.rawLine}))||[]};});
  const grouped=new Map<string, typeof rows>();
  for(const row of rows){
    const sig=row.talent+'|'+row.gear.map(g=>g.rawLine.replace(/^\s*[a-z_0-9]+=/i,'')).sort().join(';');
    if(!grouped.has(sig))grouped.set(sig,[]);
    grouped.get(sig)!.push(row);
  }
  const deduped=Array.from(grouped.values()).map(group=>{
    const avgDps=group.reduce((sum,r)=>sum+r.dps,0)/group.length;
    return {...group[0],dps:avgDps};
  }).sort((a,b)=>b.dps-a.dps);
  const baseline=deduped.find(x=>x.source==='bags')?.dps||deduped[0]?.dps||0;
  return {version:1,kind:'topgear',dps:deduped[0]?.dps||0,error:0,iterations:0,elapsedSeconds:0,warnings:[],gear:deduped[0]?.gear||[],damage:[],buffs:[],comparisons:deduped.map(x=>({...x,delta:x.dps-baseline,relative:baseline?(x.dps-baseline)/baseline:0}))};
}
