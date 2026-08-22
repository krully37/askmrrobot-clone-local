import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './db.js';
const file = join(paths.root, 'catalog', 'tooltip-captures.json');
const read = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const identity = (value) => `${value.itemId}|${value.itemLevel || ''}|${[...(value.bonusIds || [])].sort((a, b) => a - b).join('/')}`;
export function storeTooltips(values) {
    if (!values.length)
        return;
    const next = new Map(read().map(value => [identity(value), value]));
    for (const value of values) {
        if (!value.itemId || !Array.isArray(value.lines) || !value.lines.length)
            continue;
        next.set(identity(value), value);
    }
    mkdirSync(join(paths.root, 'catalog'), { recursive: true });
    writeFileSync(file, JSON.stringify([...next.values()], null, 2));
}
export function tooltipStatus() {
    const rows = read(), exact = new Set(rows.map(identity));
    return { captured: rows.length, exactVariants: exact.size, lastCapturedAt: rows.map(x => x.capturedAt).sort().at(-1) };
}
export function resolveTooltip(query) {
    const rows = read(), wanted = identity(query);
    const exact = rows.find(value => identity(value) === wanted);
    const sameItem = rows.filter(value => value.itemId === query.itemId).sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
    const found = exact || sameItem;
    const fallback = query.fallback || {};
    if (found)
        return { status: exact ? 'exact' : 'item-match', capture: found, lines: found.lines, name: found.name || fallback.name || `Item ${query.itemId}`, itemLevel: found.itemLevel || query.itemLevel, stale: false };
    const lines = [
        { left: fallback.name || `Item ${query.itemId}`, kind: 'name' },
        ...(query.itemLevel ? [{ left: `Item Level ${query.itemLevel}`, kind: 'level' }] : []),
        ...(fallback.slot ? [{ left: fallback.slot, kind: 'slot' }] : []),
        ...(fallback.enchant ? [{ left: `Enchantment: ${fallback.enchant}`, kind: 'enchant' }] : []),
        ...(fallback.gems?.map(gem => ({ left: `Socketed: ${gem}`, kind: 'gem' })) || []),
        { left: 'Live tooltip has not been captured locally.', kind: 'missing' },
        { left: 'Run /lsdtooltips in WoW, then /reload.', kind: 'missing' },
    ];
    return { status: 'missing', lines, name: fallback.name || `Item ${query.itemId}`, itemLevel: query.itemLevel, stale: false };
}
