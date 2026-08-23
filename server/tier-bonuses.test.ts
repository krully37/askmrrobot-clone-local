import { describe, expect, it } from 'vitest';
import { tierBonusFor, tierSeasonForItem } from './tier-bonuses.js';

describe('Midnight tier bonus policy',()=>{
  it('uses the selected specialization rather than a different class spec',()=>{
    const bonus=tierBonusFor('demonhunter','devourer',250036);
    expect(bonus?.twoPiece).toContain('Void Ray');
    expect(bonus?.twoPiece).not.toContain('Blade Dance');
  });
  it('selects the Season 2 data range for later Midnight item IDs',()=>{
    expect(tierSeasonForItem(277805)).toBe('season2');
    expect(tierBonusFor('rogue','subtlety',277805)?.twoPiece).toContain('Backstab');
  });
});
