import seed from '../data/midnight-tier-set-bonuses.json' with { type: 'json' };
const normalized = (value) => String(value || '').trim().toLocaleLowerCase().replace(/[ _-]+/g, '');
/** Midnight Season 1 tier item IDs begin at 250000; Season 2 items use the
 * later item-ID range. This is a display-only fallback until catalog set
 * season metadata is available. */
export function tierSeasonForItem(itemId) { return itemId >= 260000 ? 'season2' : 'season1'; }
export function tierBonusFor(className, spec, itemId) {
    const entries = (seed.sets[tierSeasonForItem(itemId)] || []);
    return entries.find(entry => normalized(entry.className) === normalized(className) && normalized(entry.spec) === normalized(spec));
}
export const tierBonusVersion = seed.version;
