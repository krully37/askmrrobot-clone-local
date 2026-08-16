import { describe, expect, it } from 'vitest';
import seed from '../data/midnight-consumables.json';

describe('manual Midnight Season 2 consumables seed', () => {
  it('preserves every maximum-rank consumable in the manual source', () => {
    expect(seed.version).toBe('midnight-12.1-manual-season-2-1');
    expect(seed.entries).toHaveLength(17);
    expect(seed.entries.filter(entry=>entry.type==='Food')).toHaveLength(7);
    expect(seed.entries.filter(entry=>entry.type==='Flask')).toHaveLength(4);
    expect(seed.entries.filter(entry=>entry.type==='Potion')).toHaveLength(6);
    expect(seed.entries.find(entry=>entry.name==='Potion of Recklessness')?.effect).toContain('+1,725 Highest Secondary');
  });
});
