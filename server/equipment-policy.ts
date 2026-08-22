export const EQUIPMENT_POLICY_VERSION = 'retail-12.1.0-2';

type Policy = { armor:number; weapons:number[] };
const policy:Record<string,Policy>={
  deathknight:{armor:4,weapons:[0,1,4,5,6,7,8]}, demonhunter:{armor:2,weapons:[0,4,7,9,13,15]}, druid:{armor:2,weapons:[0,4,6,10,13,15]},
  evoker:{armor:3,weapons:[4,10,13,15]}, hunter:{armor:3,weapons:[0,1,2,3,6,7,8,10,18]}, mage:{armor:1,weapons:[7,10,15,19]},
  monk:{armor:2,weapons:[0,4,6,7,10,13]}, paladin:{armor:4,weapons:[0,1,4,5,6,7,8]}, priest:{armor:1,weapons:[4,10,15,19]},
  rogue:{armor:2,weapons:[0,4,7,13,15]}, shaman:{armor:3,weapons:[0,4,7,10,13,15]}, warlock:{armor:1,weapons:[7,10,15,19]}, warrior:{armor:4,weapons:[0,1,4,5,6,7,8,10,13,15]},
};

export interface ItemMetadata { classId?:number|null; subclassId?:number|null; inventoryType?:number|null; handedness?:string|null; }
export interface Eligibility { eligible:boolean; confidence:'confirmed'|'unknown'; reason?:string; policyVersion:string; metadata:ItemMetadata; }
const universalSlots=new Set(['neck','back','finger1','finger2','trinket1','trinket2']);
const normal=(value:string)=>value.toLowerCase().replace(/_/g,'').trim();
const inventorySlots:Record<number,string>={1:'head',2:'neck',3:'shoulder',5:'chest',7:'legs',8:'feet',9:'wrist',10:'hands',11:'finger1',12:'trinket1',13:'main_hand',14:'off_hand',16:'back',17:'main_hand',21:'main_hand',22:'off_hand',23:'off_hand'};

/** DB2 supplies numeric inventory types even when the catalog has no text slot. */
export function resolveSimulationSlot(slot:string,inventoryType?:number|null){return slot!=='unknown'?slot:inventoryType==null?'unknown':inventorySlots[inventoryType]||'unknown';}

export function evaluateEquipment(className:string,spec:string,slot:string,metadata:ItemMetadata):Eligibility {
  const base={policyVersion:EQUIPMENT_POLICY_VERSION,metadata};
  // DB2 only uses item classes 2 (weapons) and 4 (armor) for equippable gear.
  // Recipes, mounts, housing decor, consumables, and cosmetics use other classes.
  if(metadata.classId!=null&&metadata.classId!==2&&metadata.classId!==4)return {eligible:false,confidence:'confirmed',reason:`DB2 item class ${metadata.classId} is not equippable gear.`,...base};
  if(universalSlots.has(slot))return {eligible:true,confidence:'confirmed',...base};
  const rule=policy[normal(className)];
  if(!rule)return {eligible:true,confidence:'unknown',reason:`No equipment policy for ${className}.`,...base};
  if(metadata.classId==null||metadata.subclassId==null)return {eligible:true,confidence:'unknown',reason:'DB2 class/subclass metadata is unavailable.',...base};
  if(metadata.classId===4)return metadata.subclassId===rule.armor
    ? {eligible:true,confidence:'confirmed',...base}
    : {eligible:false,confidence:'confirmed',reason:`Requires armor subclass ${rule.armor}; item is subclass ${metadata.subclassId}.`,...base};
  if(metadata.classId===2)return rule.weapons.includes(metadata.subclassId)
    ? {eligible:true,confidence:'confirmed',...base}
    : {eligible:false,confidence:'confirmed',reason:`${className} ${spec} cannot equip weapon subclass ${metadata.subclassId}.`,...base};
  return {eligible:true,confidence:'unknown',reason:'Item class is not covered by the equipment policy.',...base};
}
