import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './db.js';
import { enhancementSeed } from './enhancements.js';
import { tierBonusFor, tierSeasonForItem } from './tier-bonuses.js';
import Database from 'better-sqlite3';
const file = join(paths.root, 'catalog', 'tooltip-captures.json');
const read = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const identity = (value) => `${value.itemId}|${value.itemLevel || ''}|${[...(value.bonusIds || [])].sort((a, b) => a - b).join('/')}`;
const hasTierBonus = (lines) => lines.some(line => /^\s*(?:\([24]\)\s*)?Set:/i.test(line.left || ''));
export function withTierBonuses(lines, query) {
    if (!hasTierBonus(lines))
        return lines;
    const bonus = tierBonusFor(query.className, query.spec, query.itemId);
    if (!bonus)
        return lines;
    const normalized = lines.filter(line => !/^\s*(?:\([24]\)\s*)?Set:/i.test(line.left || ''));
    const additions = [
        { left: `${tierSeasonForItem(query.itemId) === 'season1' ? 'Season 1' : 'Season 2'} set · ${bonus.spec}`, kind: 'set-header', leftColor: '#ffd200' },
        { left: `(2) Set: ${bonus.twoPiece}`, kind: 'set', leftColor: '#00ff00' },
        { left: `(4) Set: ${bonus.fourPiece}`, kind: 'set', leftColor: '#00ff00' },
    ];
    const classesAt = normalized.findIndex(line => /^\s*Classes:/i.test(line.left || ''));
    return classesAt < 0 ? [...normalized, ...additions] : [...normalized.slice(0, classesAt), ...additions, ...normalized.slice(classesAt)];
}
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
    let dbName = fallback.name;
    let enchantName;
    const gemNames = new Map();
    const seedName = (fragment) => enhancementSeed().entries.find(entry => entry.simcFragment === fragment)?.name;
    let db;
    try {
        db = new Database(join(paths.root, 'catalog', 'catalog.db'), { readonly: true });
        const meta = db.prepare('SELECT name FROM derived_item_metadata WHERE item_id=?').get(query.itemId);
        if (meta && meta.name)
            dbName = meta.name;
        const enchantId = Number(fallback.enchant?.match(/\d+/)?.[0]);
        if (Number.isInteger(enchantId) && enchantId > 0) {
            const enhancement = db.prepare('SELECT name FROM enhancements WHERE simc_fragment=? LIMIT 1').get(`enchant_id=${enchantId}`);
            enchantName = enhancement?.name || seedName(`enchant_id=${enchantId}`);
        }
        for (const gem of fallback.gems || []) {
            const gemId = Number(gem);
            if (!Number.isInteger(gemId) || gemId <= 0)
                continue;
            const enhancement = db.prepare('SELECT name FROM enhancements WHERE simc_fragment=? LIMIT 1').get(`gem_id=${gemId}`);
            gemNames.set(String(gemId), enhancement?.name || seedName(`gem_id=${gemId}`) || `Gem ${gemId}`);
        }
    }
    catch (e) { }
    finally {
        if (db)
            db.close();
    }
    const gems = (fallback.gems || []).map(value => {
        const id = value.match(/\d+/)?.[0] || value;
        return { id, name: gemNames.get(id) || seedName(`gem_id=${id}`) || `Gem ${id}`, iconUrl: `/api/catalog/items/${encodeURIComponent(id)}/icon` };
    });
    if (found)
        return { status: exact ? 'exact' : 'item-match', capture: found, lines: withTierBonuses(found.lines, query), gems, name: found.name || dbName || `Item ${query.itemId}`, itemLevel: found.itemLevel || query.itemLevel, stale: false };
    const lines = [
        { left: dbName || `Item ${query.itemId}`, kind: 'name' },
        ...(query.itemLevel ? [{ left: `Item Level ${query.itemLevel}`, kind: 'level' }] : []),
        ...(fallback.slot ? [{ left: fallback.slot, kind: 'slot' }] : []),
        ...(fallback.enchant ? [{ left: `Enchanted: ${enchantName || `Enchant ${fallback.enchant.match(/\d+/)?.[0] || fallback.enchant}`}`, kind: 'enchant' }] : []),
        ...gems.map(gem => ({ left: `Socketed: ${gem.name}`, kind: 'gem' })),
        { left: 'Item data is verified and ready for simulations.', kind: 'missing' },
        { left: '(However, its live tooltip display has not been captured)', kind: 'missing' },
        { left: 'Use /lsdtooltips in WoW to capture it.', kind: 'missing' },
    ];
    return { status: 'missing', lines, gems, name: dbName || `Item ${query.itemId}`, itemLevel: query.itemLevel, stale: false };
}
