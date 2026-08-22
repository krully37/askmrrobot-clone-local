import { parseInventory } from './profile.js';
import { getCappedUpgradeLevel } from './tracks.js';
import type { GearCandidate, ParsedInventory } from './types.js';
import { loadoutLegalityWarnings } from './gear-legality.js';

export const DROPTIMIZER_SLOTS = ['head','neck','shoulder','back','chest','wrist','hands','waist','legs','feet','finger1','finger2','trinket1','trinket2','main_hand','off_hand'] as const;
const pairedSlots = (slot: string) => slot.startsWith('finger') ? ['finger1', 'finger2'] : slot.startsWith('trinket') ? ['trinket1', 'trinket2'] : [slot];

export interface DroptimizerDrop { id:number; name:string; slot:string; itemLevel?:number; boss:string; difficulty:string; track?:string; variantId:string; bonusIds?:number[]; simcFragment:string; status:'verified'; uniqueKey?:string; handedness?:GearCandidate['handedness']; }
export interface GearLine { slot:string; itemId?:number; itemLevel?:number; rawLine:string; }
export interface DroptimizerGearset { drop:DroptimizerDrop; slot:string; name:string; gear:GearLine[]; profilesetLines:string[]; warnings:string[]; }

function replaceOption(fragment:string,key:string,value:string){const expression=new RegExp(`(^|,)${key}=[^,]*`);return expression.test(fragment)?fragment.replace(expression,(_,prefix)=>`${prefix}${key}=${value}`):`${fragment},${key}=${value}`;}
function variantAtTarget(drop:DroptimizerDrop,target?:number):DroptimizerDrop { const itemLevel=target?(drop.track?getCappedUpgradeLevel(drop.track,target)??target:target):drop.itemLevel;let simcFragment=drop.simcFragment;if(drop.bonusIds?.length)simcFragment=replaceOption(simcFragment,'bonus_id',drop.bonusIds.join('/'));if(itemLevel)simcFragment=replaceOption(simcFragment,'ilevel',String(itemLevel));return {...drop,itemLevel,simcFragment}; }
function lineFor(slot:string, fragment:string){return `${slot}=,${fragment.replace(/^,+/,'')}`;}
function normalizeLine(slot:string, rawLine:string){return rawLine.replace(/^\s*[a-z_0-9]+=/i,`${slot}=`);}
function baselineGear(inventory:ParsedInventory):GearLine[]{return inventory.candidates.filter(candidate=>candidate.source==='equipped'&&(DROPTIMIZER_SLOTS as readonly string[]).includes(candidate.slot)).map(candidate=>({slot:candidate.slot,itemId:candidate.itemId,itemLevel:candidate.itemLevel,rawLine:normalizeLine(candidate.slot,candidate.rawLine)}));}

export function validateGearset(gear:GearLine[], candidates:GearCandidate[]=[]){
  const warnings:string[]=[]; const bySlot=new Map(gear.map(line=>[line.slot,line]));
  const byItem=new Map(candidates.map(candidate=>[candidate.itemId,candidate]));
  for(const [a,b] of [['finger1','finger2'],['trinket1','trinket2']] as const){const left=byItem.get(bySlot.get(a)?.itemId),right=byItem.get(bySlot.get(b)?.itemId);if(left?.uniqueKey&&left.uniqueKey===right?.uniqueKey)warnings.push(`Unique-equipped conflict (${left.uniqueKey}) in ${a}/${b}.`);}
  warnings.push(...loadoutLegalityWarnings(gear.map(line=>({...line,uniqueKey:byItem.get(line.itemId)?.uniqueKey,handedness:byItem.get(line.itemId)?.handedness}))));
  return warnings;
}

/** Build a complete, auditable final loadout for each legal replacement. */
export function buildDroptimizerGearsets(drops:DroptimizerDrop[], rawProfile:string, upgradeTarget?:number, inventory=parseInventory(rawProfile)):DroptimizerGearset[]{
  const baseline=baselineGear(inventory);
  return drops.filter(drop=>(DROPTIMIZER_SLOTS as readonly string[]).includes(drop.slot)).flatMap(drop=>{
    const slots=drop.handedness==='one-hand'&&inventory.dualWieldCapable&&['main_hand','off_hand'].includes(drop.slot)?['main_hand','off_hand']:pairedSlots(drop.slot);
    return slots.flatMap(slot=>{
    const variant=variantAtTarget(drop,upgradeTarget), replaced=baseline.find(line=>line.slot===slot);
    if(replaced?.itemId===variant.id)return [];
    const warnings:string[]=[];
    if(!replaced)warnings.push(`No equipped item was found for ${slot}.`);
    if(!/(?:^|,)id=\d+(?:,|$)/.test(variant.simcFragment))warnings.push('Candidate SimC fragment has no item id.');
    if(!/(?:^|,)ilevel=\d+(?:,|$)/.test(variant.simcFragment))warnings.push('Candidate SimC fragment has no item level.');
    if(!/(?:^|,)bonus_id=/.test(variant.simcFragment))warnings.push('No verified bonus IDs were recorded; SimC is using the item base form at this item level.');
    if((slot.startsWith('finger')||slot.startsWith('trinket'))&&baseline.find(line=>line.slot!==slot&&pairedSlots(slot).includes(line.slot))?.itemId===variant.id)warnings.push(`Candidate duplicates the other ${slot.startsWith('finger')?'ring':'trinket'} slot.`);
    let fragment=variant.simcFragment.replace(/^,+/,'');
    const replacedCandidate=inventory.candidates.find(candidate=>candidate.source==='equipped'&&candidate.slot===slot);
    if(replacedCandidate?.enchant)fragment=replaceOption(fragment,'enchant_id',replacedCandidate.enchant);
    if(replacedCandidate?.gems?.length)fragment=replaceOption(fragment,'gem_id',replacedCandidate.gems.join('/'));
    const candidateRawLine=lineFor(slot,fragment);
    const gear=baseline.map(line=>line.slot===slot?{slot,itemId:variant.id,itemLevel:variant.itemLevel,rawLine:candidateRawLine}:line);
    warnings.push(...validateGearset(gear,[...inventory.candidates,{id:`drop-${variant.id}`,slot,name:variant.name,rawLine:candidateRawLine,itemId:variant.id,source:'catalog',selected:true,locked:false,uniqueKey:variant.uniqueKey,handedness:variant.handedness}]));
    if(warnings.some(warning=>/duplicates|conflict|cannot be paired|only weapon/i.test(warning)))return [];
    const name=`drop_${drop.id}_${slot}`;
    return [{drop:variant,slot,name,gear,profilesetLines:gear.map(line=>`profileset."${name}"+=${line.rawLine}`),warnings}];
    });
  });
}

export function buildDroptimizerGearsetInput(rawProfile:string,entries:DroptimizerGearset[]){return `${rawProfile.trim()}\n\n# Local Droptimizer candidates\n${entries.flatMap(entry=>entry.profilesetLines).join('\n')}`;}
