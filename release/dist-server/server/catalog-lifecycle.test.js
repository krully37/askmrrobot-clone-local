import { describe, expect, it } from 'vitest';
import { catalogHealth } from './catalog-lifecycle.js';
describe('catalog freshness health', () => {
    const coverage = [{ source: 'Fixture', difficulty: 'Normal', verified: 4, total: 4 }];
    it('marks a recent complete seasonal catalog fresh', () => {
        const health = catalogHealth({ season: 'fixture', checksum: 'abc', generatedAt: new Date().toISOString() }, coverage);
        expect(health.health).toBe('fresh');
    });
    it('marks a seven-day-old catalog stale', () => {
        const health = catalogHealth({ season: 'fixture', checksum: 'abc', generatedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }, coverage);
        expect(health.health).toBe('stale');
    });
    it('marks incomplete verified coverage partial', () => {
        const health = catalogHealth({ season: 'fixture', checksum: 'abc', generatedAt: new Date().toISOString() }, [{ source: 'Fixture', difficulty: 'Normal', verified: 2, total: 4 }]);
        expect(health.health).toBe('partial');
    });
    it('identifies the starter manifest', () => {
        const health = catalogHealth({ checksum: 'local-starter' }, []);
        expect(health.health).toBe('starter');
    });
});
