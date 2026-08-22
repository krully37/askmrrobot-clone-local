import { describe, expect, it } from 'vitest';
import { buildDroptimizerGearsetInput, buildDroptimizerGearsets, type DroptimizerDrop } from './droptimizer-gearsets.js';

const ring: DroptimizerDrop = { id: 100, name: 'Upgrade Ring', slot: 'finger1', itemLevel: 305, boss: 'Boss', difficulty: 'Mythic+', track: 'Hero 1/6', variantId: 'ring', simcFragment: 'id=100,ilevel=305', status: 'verified' };

describe('Droptimizer gearsets', () => {
  it('creates independent final-item variants for both interchangeable ring slots', () => {
    const entries = buildDroptimizerGearsets([ring], 311);
    expect(entries.map(entry => entry.slot)).toEqual(['finger1', 'finger2']);
    expect(entries.every(entry => entry.drop.itemLevel === 311)).toBe(true);
    expect(entries[0].drop).not.toBe(entries[1].drop);
    expect(ring.itemLevel).toBe(305);
    expect(ring.simcFragment).toBe('id=100,ilevel=305');
  });

  it('writes a complete replacement item and preserves the replaced slot enhancements', () => {
    const profile = 'rogue=Test\nspec=subtlety\nfinger1=old_ring,id=1,ilevel=321,enchant_id=55,gem_id=66';
    const [entry] = buildDroptimizerGearsets([ring]);
    const input = buildDroptimizerGearsetInput(profile, [entry]);
    expect(input).toContain('profileset."drop_100_finger1"+=finger1=id=100,ilevel=305,enchant_id=55,gem_id=66');
    expect(input).not.toContain('finger1=,id=100');
  });

  it('caps an upgrade target at the item track maximum', () => {
    const [entry] = buildDroptimizerGearsets([ring], 334);
    expect(entry.drop.itemLevel).toBe(321);
    expect(entry.drop.simcFragment).toBe('id=100,ilevel=321');
  });
});
