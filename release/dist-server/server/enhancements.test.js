import { describe, expect, it } from 'vitest';
import { enhancementSeed } from './enhancements.js';
describe('manual Midnight Season 2 enhancement seed', () => {
    it('contains every applicable maximum-quality gem and enchant from the manual source', () => {
        const seed = enhancementSeed();
        expect(seed.version).toBe('midnight-12.1-manual-season-2-1');
        expect(seed.entries).toHaveLength(60);
        expect(seed.entries.filter(entry => entry.type === 'gem')).toHaveLength(23);
        expect(seed.entries.filter(entry => entry.type === 'enchant')).toHaveLength(37);
        expect(seed.entries.every(entry => Boolean(entry.effect))).toBe(true);
        expect(seed.entries.find(entry => entry.id === 'gem-240983')?.name).toBe('Indecipherable Eversong Diamond');
        expect(seed.entries.find(entry => entry.id === 'enchant-8027')?.effect).toBe('+29 Versatility');
    });
});
