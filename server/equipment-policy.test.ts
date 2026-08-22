import { describe, expect, it } from 'vitest';
import { evaluateEquipment, resolveSimulationSlot } from './equipment-policy.js';

describe('equipment eligibility policy',()=>{
  const rogue=(slot:string,classId?:number,subclassId?:number)=>evaluateEquipment('rogue','subtlety',slot,{classId,subclassId});
  it('permits Rogue leather, legal one-hand weapons, and universal accessories',()=>{expect(rogue('shoulder',4,2).eligible).toBe(true);expect(rogue('main_hand',2,15).eligible).toBe(true);expect(rogue('main_hand',2,7).eligible).toBe(true);expect(rogue('trinket1',4).eligible).toBe(true);});
  it('rejects Rogue cloth, mail, plate, and bows',()=>{expect(rogue('head',4,1).eligible).toBe(false);expect(rogue('head',4,3).eligible).toBe(false);expect(rogue('head',4,4).eligible).toBe(false);expect(rogue('main_hand',2,2).eligible).toBe(false);});
  it('applies the expected armor proficiency to every class',()=>{for(const [className,spec,subclass] of [['deathknight','frost',4],['demonhunter','havoc',2],['druid','balance',2],['evoker','devastation',3],['hunter','beast_mastery',3],['mage','fire',1],['monk','windwalker',2],['paladin','retribution',4],['priest','shadow',1],['rogue','outlaw',2],['shaman','elemental',3],['warlock','affliction',1],['warrior','fury',4]] as const){expect(evaluateEquipment(className,spec,'chest',{classId:4,subclassId:subclass}).eligible).toBe(true);}});
  it('rejects two-hand weapons and ranged weapons for Subtlety',()=>{expect(rogue('main_hand',2,8).eligible).toBe(false);expect(rogue('main_hand',2,3).eligible).toBe(false);expect(rogue('main_hand',2,18).eligible).toBe(false);});
  it('rejects known non-equipment DB2 classes',()=>{for(const classId of [0,1,3,5,7,9,15,20])expect(rogue('unknown',classId,1).eligible).toBe(false);});
  it('keeps unknown metadata visible with an explicit warning',()=>{const value=rogue('head');expect(value.eligible).toBe(true);expect(value.confidence).toBe('unknown');});
  it('derives one-hand and off-hand simulation slots from DB2 inventory types',()=>{expect(resolveSimulationSlot('unknown',13)).toBe('main_hand');expect(resolveSimulationSlot('unknown',23)).toBe('off_hand');expect(resolveSimulationSlot('neck',13)).toBe('neck');});
});
