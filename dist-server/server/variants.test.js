import { describe, expect, it } from 'vitest';
import { validateVariantSeed } from './variants.js';
const base = { version: 'fixture', season: 'midnight-season-2', clientBuild: '12.1.0', records: [{ source: 'The Venomous Abyss', boss: 'Fixture Boss', difficulty: 'Normal', itemId: 123, itemLevel: 700, bonusIds: [1, 2], simcFragment: 'id=123,ilevel=700,bonus_id=1/2', provenance: 'Encounter Journal capture', capturedAt: '2026-08-14T00:00:00.000Z', clientBuild: '12.1.0' }] };
describe('verified difficulty variants', () => {
    it('accepts a complete exact variant', () => expect(() => validateVariantSeed(base, 'midnight-season-2', () => true)).not.toThrow());
    it('keeps distinct difficulty variants for the same item independently exact', () => {
        const records = ['Normal', 'Heroic', 'Mythic'].map((difficulty, index) => ({ ...base.records[0], difficulty, itemLevel: 700 + index * 13, bonusIds: [100 + index], simcFragment: `id=123,ilevel=${700 + index * 13},bonus_id=${100 + index}` }));
        expect(() => validateVariantSeed({ ...base, records }, 'midnight-season-2', () => true)).not.toThrow();
    });
    it('rejects stale seasons, duplicates, incorrect SimC fragments, and unknown drops', () => {
        expect(() => validateVariantSeed({ ...base, season: 'other' }, 'midnight-season-2', () => true)).toThrow(/does not match/);
        expect(() => validateVariantSeed({ ...base, records: [...base.records, ...base.records] }, 'midnight-season-2', () => true)).toThrow(/duplicate/);
        expect(() => validateVariantSeed({ ...base, records: [{ ...base.records[0], simcFragment: 'id=123,ilevel=219' }] }, 'midnight-season-2', () => true)).toThrow(/matching id and ilevel/);
        expect(() => validateVariantSeed(base, 'midnight-season-2', () => false)).toThrow(/does not match a discovered/);
    });
    it('requires at least one verified capture for a simmable seed', () => expect(() => validateVariantSeed({ ...base, records: [] }, 'midnight-season-2', () => true, true)).toThrow(/no verified records/));
});
