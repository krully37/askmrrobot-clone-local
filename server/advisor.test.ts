import { describe, expect, it } from 'vitest';
import { generateAdvisorPermutations, buildAdvisorLoadouts } from './advisor.js';
import type { ParsedInventory } from './types.js';

describe('Advisor Permutations', () => {
  const dummyInventory: ParsedInventory = {
    candidates: [
      { id: '1', slot: 'head', name: 'Head', source: 'equipped', locked: false, itemLevel: 300, track: 'Hero 1/6', rawLine: 'head=head_item,id=1,ilevel=300' },
      { id: '2', slot: 'chest', name: 'Chest', source: 'equipped', locked: false, itemLevel: 305, track: 'Hero 1/6', rawLine: 'chest=chest_item,id=2,ilevel=305' },
    ],
    talents: [{ id: 't1', name: 'Talent 1', selected: true }],
    vaultDetected: false,
    dualWieldCapable: true,
    enhancements: []
  } as any;

  it('generates permutations within crest limits', () => {
    const req = {
      profileId: 1,
      crests: { adventurer: 0, veteran: 0, champion: 0, hero: 20, myth: 0 },
      sparks: 0,
      discounts: { head: false, chest: false },
      tuning: 'raw-ilvl' as const,
      threads: 1
    };

    const perms = generateAdvisorPermutations(dummyInventory, req);
    // With 20 Hero crests, can upgrade either head or chest by 1 step. 
    // It should generate at least two permutations: one upgrading head, one upgrading chest.
    expect(perms.some(p => p.actions.some(a => a.slot === 'head' && a.costAmount === 20))).toBe(true);
    expect(perms.some(p => p.actions.some(a => a.slot === 'chest' && a.costAmount === 20))).toBe(true);
    // It shouldn't generate an action that costs 40 (since we only have 20 crests).
    expect(perms.every(p => p.cost.hero <= 20)).toBe(true);
  });

  it('applies discounts correctly', () => {
    const req = {
      profileId: 1,
      crests: { adventurer: 0, veteran: 0, champion: 0, hero: 0, myth: 0 },
      sparks: 0,
      discounts: { head: true, chest: false },
      tuning: 'raw-ilvl' as const,
      threads: 1
    };

    const perms = generateAdvisorPermutations(dummyInventory, req);
    // With discount on head, cost is 0, so even with 0 crests we can fully upgrade it to 6/6.
    expect(perms.some(p => p.actions.some(a => a.slot === 'head' && a.costAmount === 0 && a.newItemLevel === 315))).toBe(true);
    // But we cannot upgrade chest.
    expect(perms.some(p => p.actions.some(a => a.slot === 'chest'))).toBe(false);
  });

  it('builds loadouts with correctly updated simcLines', () => {
    const req = {
      profileId: 1,
      crests: { adventurer: 0, veteran: 0, champion: 0, hero: 20, myth: 0 },
      sparks: 0,
      discounts: { head: false, chest: false },
      tuning: 'raw-ilvl' as const,
      threads: 1
    };

    const { loadouts } = buildAdvisorLoadouts(dummyInventory, req);
    expect(loadouts.length).toBeGreaterThan(0);
    expect(loadouts[0].source).toBe('advisor');
    expect(loadouts[0].candidates.length).toBe(2);
  });
});
