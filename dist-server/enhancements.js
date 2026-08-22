import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { pathsForCatalog, upsertEnhancement } from './catalog.js';
const seedPath = join(process.cwd(), 'data', 'midnight-enhancements.json');
export function enhancementSeed() { if (!existsSync(seedPath))
    throw new Error(`Enhancement seed missing: ${seedPath}`); return JSON.parse(readFileSync(seedPath, 'utf8')); }
function syntaxValid(entry) { return entry.type === 'gem' ? /^gem_id=\d+$/.test(entry.simcFragment) : /^enchant_id=\d+$/.test(entry.simcFragment); }
function cleanDb2Name(value) { return value.replace(/\|A:[^|]+\|a/g, '').replace(/^Enchant (?:Helm|Ring) - /, '').replace(/\s+/g, ' ').trim(); }
function db2Detail(entry) { const { catalogPath } = pathsForCatalog(); if (!existsSync(catalogPath))
    return { matched: false }; const db = new Database(catalogPath, { readonly: true }); try {
    const row = entry.type === 'gem' && entry.itemId ? db.prepare('SELECT name FROM derived_item_metadata WHERE item_id=?').get(entry.itemId) : db.prepare('SELECT name FROM derived_enhancements WHERE enchant_id=?').get(Number(entry.simcFragment.match(/\d+$/)?.[0]));
    const name = row?.name ? cleanDb2Name(row.name) : undefined;
    return { matched: Boolean(row), name: name && !name.includes('$') && !/^Fits in /i.test(name) ? name : undefined };
}
catch {
    return { matched: false };
}
finally {
    db.close();
} }
export function installEnhancementSeed() { const seed = enhancementSeed(); const { catalogPath } = pathsForCatalog(); if (existsSync(catalogPath)) {
    const db = new Database(catalogPath);
    try {
        db.prepare("DELETE FROM enhancements WHERE provenance LIKE 'curated:midnight-12.1%'").run();
    }
    finally {
        db.close();
    }
} let matched = 0, unresolved = 0, valid = 0, named = 0; for (const entry of seed.entries) {
    const detail = db2Detail(entry), isValid = syntaxValid(entry);
    if (detail.matched)
        matched++;
    else
        unresolved++;
    if (detail.name)
        named++;
    if (isValid)
        valid++;
    upsertEnhancement({ ...entry, name: detail.name || entry.name, provenance: `curated:${seed.version}`, clientBuild: seed.clientBuild, currentSeason: true, reviewStatus: 'reviewed', db2Status: detail.matched ? 'matched' : 'unavailable', simcValidation: isValid ? 'syntax-valid' : 'unvalidated' });
} return { version: seed.version, count: seed.entries.length, matched, unresolved, named, syntaxValid: valid, clientBuild: seed.clientBuild }; }
