import { describe, expect, it } from 'vitest';
import { configured } from './blizzard.js';
import { loadSeasonManifest } from './catalog-builder.js';
describe('catalog pipeline configuration', () => {
    it('loads a pinned Retail season manifest with sources', () => {
        const manifest = loadSeasonManifest();
        expect(manifest.game).toBe('Retail');
        expect(manifest.season).toBe('midnight-season-2');
        expect(manifest.include.length).toBeGreaterThan(0);
        expect(manifest.include.every(source => source.name && source.difficulties.length)).toBe(true);
    });
    it('does not report configured without both credentials', () => {
        const originalId = process.env.BLIZZARD_CLIENT_ID;
        const originalSecret = process.env.BLIZZARD_CLIENT_SECRET;
        delete process.env.BLIZZARD_CLIENT_ID;
        delete process.env.BLIZZARD_CLIENT_SECRET;
        expect(configured()).toBe(false);
        if (originalId)
            process.env.BLIZZARD_CLIENT_ID = originalId;
        if (originalSecret)
            process.env.BLIZZARD_CLIENT_SECRET = originalSecret;
    });
});
