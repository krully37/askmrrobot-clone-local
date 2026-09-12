import { describe, expect, it } from 'vitest';
import { reconcileGear, requestedGear } from './gear-reconciliation.js';

const profile = `
mage="ItemCheck"
level=80
spec=fire
head=masterwork_band,id=240949,ilevel=285
main_hand=stale_staff,id=999999,ilevel=700
# Gear from Bags
# finger1=bagged_ring,id=111111,ilevel=300
profileset."drop_1"+=trinket1=,id=222222,ilevel=300
`;

describe('requestedGear', () => {
  it('collects equipped gear lines that carry an item id', () => {
    expect(requestedGear(profile).map(x => x.slot).sort()).toEqual(['head', 'main_hand']);
  });

  it('ignores commented bag lines and profileset overrides', () => {
    const slots = requestedGear(profile).map(x => x.slot);
    expect(slots).not.toContain('finger1');
    expect(slots).not.toContain('trinket1');
  });

  it('ignores non-gear settings and gear lines without an id', () => {
    expect(requestedGear('level=80\nmax_time=300\noff_hand=\nhead=x,id=5')).toEqual([
      { slot: 'head', itemId: 5, rawLine: 'head=x,id=5' }
    ]);
  });

  it('lets a later line for the same slot win, as SimC does', () => {
    expect(requestedGear('head=a,id=1\nhead=b,id=2')).toEqual([
      { slot: 'head', itemId: 2, rawLine: 'head=b,id=2' }
    ]);
  });
});

describe('reconcileGear', () => {
  it('warns about a slot SimC silently dropped', () => {
    const [warning, ...rest] = reconcileGear(requestedGear(profile), [{ slot: 'head', itemId: 240949 }]);
    expect(rest).toEqual([]);
    expect(warning).toContain('silently ignored 1 requested item');
    expect(warning).toContain('main_hand (id=999999)');
  });

  it('stays silent when every requested slot came back', () => {
    const returned = [{ slot: 'head', itemId: 240949 }, { slot: 'main_hand', itemId: 999999 }];
    expect(reconcileGear(requestedGear(profile), returned)).toEqual([]);
  });

  it('warns when SimC resolved a different item than requested', () => {
    const warnings = reconcileGear([{ slot: 'head', itemId: 1, rawLine: 'head=a,id=1' }], [{ slot: 'head', itemId: 2 }]);
    expect(warnings).toEqual(['SimulationCraft resolved head to item 2 instead of the requested 1.']);
  });

  it('returns nothing when the profile requested no gear', () => {
    expect(reconcileGear([], [])).toEqual([]);
  });
});
