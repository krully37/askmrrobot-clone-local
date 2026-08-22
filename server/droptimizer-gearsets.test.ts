import { describe, expect, it } from 'vitest';
import { buildDroptimizerGearsetInput, buildDroptimizerGearsets, type DroptimizerDrop } from './droptimizer-gearsets.js';

const ring:DroptimizerDrop={id:100,name:'Upgrade Ring',slot:'finger1',itemLevel:305,boss:'Boss',difficulty:'Mythic+',track:'Hero 1/6',variantId:'ring',simcFragment:'id=100,ilevel=305',status:'verified'};
const profile='rogue=Test\nspec=subtlety\nhead=old_head,id=9,ilevel=321\nfinger1=old_ring,id=1,ilevel=321,enchant_id=55,gem_id=66\nfinger2=other_ring,id=2,ilevel=321\ntrinket1=first,id=3,ilevel=321\ntrinket2=second,id=4,ilevel=321\nmain_hand=main,id=5,ilevel=321\noff_hand=off,id=6,ilevel=321';

describe('Droptimizer gearsets',()=>{
  it('creates immutable variants for both ring slots and caps their requested ilvl',()=>{const entries=buildDroptimizerGearsets([ring],profile,311);expect(entries.map(entry=>entry.slot)).toEqual(['finger1','finger2']);expect(entries.every(entry=>entry.drop.itemLevel===311)).toBe(true);expect(entries[0].drop).not.toBe(entries[1].drop);expect(ring.itemLevel).toBe(305);});
  it('writes valid SimC item syntax and a complete final gearset',()=>{const [entry]=buildDroptimizerGearsets([ring],profile);const input=buildDroptimizerGearsetInput(profile,[entry]);expect(input).toContain('profileset."drop_100_finger1"+=finger1=,id=100,ilevel=305,enchant_id=55,gem_id=66');expect(input).toContain('profileset."drop_100_finger1"+=head=old_head,id=9,ilevel=321');expect(input).not.toContain('finger1=id=100');expect(entry.gear.find(line=>line.slot==='finger1')?.itemId).toBe(100);expect(entry.gear.find(line=>line.slot==='head')?.itemId).toBe(9);});
  it('rejects only the paired accessory placement that would duplicate an item and caps track maximum',()=>{expect(buildDroptimizerGearsets([{...ring,id:2,simcFragment:'id=2,ilevel=305'}],profile).map(entry=>entry.slot)).toEqual(['finger2']);const [entry]=buildDroptimizerGearsets([ring],profile,334);expect(entry.drop.itemLevel).toBe(321);});
});
