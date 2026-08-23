import { describe, expect, it } from 'vitest';
import { withTierBonuses } from './tooltips.js';

describe('tier tooltip normalization',()=>{
  it('replaces mismatched captured set text with the selected spec bonus',()=>{
    const lines=withTierBonuses([{left:'Devouring Reaver\'s Sheathe (4/5)'},{left:'Set: Blade Dance damage increased by 15%.'},{left:'Set: Your haste is increased by an additional 6% during Metamorphosis.'},{left:'Classes: Demon Hunter'}],{itemId:250036,className:'demonhunter',spec:'devourer'});
    expect(lines.map(line=>line.left).join('\n')).toContain('Void Ray damage increased by 10%');
    expect(lines.map(line=>line.left).join('\n')).not.toContain('Blade Dance damage increased by 15%');
    expect(lines.find(line=>line.left==='Classes: Demon Hunter')).toBeTruthy();
  });
});
