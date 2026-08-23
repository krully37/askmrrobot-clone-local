import { loadoutLegalityWarnings } from './gear-legality.js';
const pairedSlots = new Map([['finger1', ['finger1', 'finger2']], ['finger2', ['finger1', 'finger2']], ['trinket1', ['trinket1', 'trinket2']], ['trinket2', ['trinket1', 'trinket2']]]);
const canonicalSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'main_hand', 'off_hand'];
const emptyOffHand = { id: 'virtual-empty-off-hand', slot: 'off_hand', rawLine: 'off_hand=none', name: 'Empty off hand', source: 'custom', selected: true, locked: false, handedness: 'unknown' };
export function calibratePreview(preview, throughput) { if (!throughput)
    return preview; const estimatedSeconds = Math.max(1, Math.ceil(preview.profilesets * preview.iterations / throughput)); const intensity = estimatedSeconds <= 30 ? 'green' : estimatedSeconds <= 300 ? 'amber' : estimatedSeconds <= 1800 ? 'orange' : 'red'; return { ...preview, estimatedSeconds, intensity, calibration: 'learned' }; }
function replaceOption(line, key, value) { const re = new RegExp(`(,?${key}=)[^,]+`); return re.test(line) ? line.replace(re, `$1${value}`) : `${line},${key}=${value}`; }
function applicableEnhancements(candidate, enhancements, selectedIds) { return enhancements.filter(enhancement => { if (!selectedIds.includes(enhancement.id))
    return false; const slotMatches = enhancement.slots.includes(candidate.slot) || (candidate.slot.startsWith('finger') && enhancement.slots.includes('finger1')); if (!slotMatches)
    return false; if (enhancement.type === 'gem')
    return Boolean(candidate.gems?.length || /gem_id=/.test(candidate.rawLine)); if (enhancement.weaponHands?.length)
    return ['main_hand', 'off_hand'].includes(candidate.slot) && Boolean(candidate.handedness && enhancement.weaponHands.includes(candidate.handedness)); return true; }); }
function parsedGemSlots(candidate) { const raw = candidate.rawLine.match(/(?:^|,)gem_id=([^,]+)/)?.[1]; if (raw)
    return raw.split('/').filter(Boolean); return candidate.gems?.map(String) || []; }
/**
 * Socket positions are interchangeable for the purpose of a DPS search.  This
 * returns combinations with repetition, avoiding duplicate permutations such
 * as crit/haste and haste/crit on otherwise equivalent socket positions.
 */
function gemMatrices(values, count, start = 0, prefix = []) { if (!count)
    return [prefix]; const output = []; for (let i = start; i < values.length; i++)
    output.push(...gemMatrices(values, count - 1, i, [...prefix, values[i]])); return output; }
function enhancementChoices(candidate, enhancements, selectedIds, replaceExisting) {
    const applicable = applicableEnhancements(candidate, enhancements, selectedIds);
    const gems = applicable.filter(x => x.type === 'gem');
    const enchants = applicable.filter(x => x.type !== 'gem');
    const existingGems = parsedGemSlots(candidate);
    const socketCount = existingGems.length;
    const gemValues = gems.map(x => x.simcFragment.replace(/^gem_id=/, ''));
    // In normal mode, existing gems stay untouched.  An explicit zero in a
    // SimC line is an empty, known socket and can be filled without replacement.
    const emptySockets = existingGems.reduce((output, value, index) => value === '0' ? [...output, index] : output, []);
    let gemOptions = [existingGems];
    if (gemValues.length && replaceExisting && socketCount)
        gemOptions = gemMatrices(gemValues, socketCount);
    else if (gemValues.length && emptySockets.length) {
        gemOptions = gemMatrices(gemValues, emptySockets.length).map(matrix => {
            const next = [...existingGems];
            emptySockets.forEach((position, index) => next[position] = matrix[index]);
            return next;
        });
    }
    const existingEnchant = candidate.rawLine.match(/(?:^|,)enchant_id=([^,]+)/)?.[1] || candidate.enchant;
    const enchantValues = enchants.map(x => x.simcFragment.replace(/^enchant_id=/, ''));
    // Normal mode preserves an existing enchant. Empty eligible slots keep an
    // unenchanted baseline plus each selected alternative. Replace mode tests
    // only the explicitly selected choices for every eligible existing enchant.
    const enchantOptions = replaceExisting && existingEnchant && enchantValues.length
        ? enchantValues
        : existingEnchant ? [existingEnchant] : ['', ...enchantValues];
    return gemOptions.flatMap(gem => enchantOptions.map(enchant => ({ gem, enchant })));
}
export function withEnhancementVariants(candidates, enhancements = [], selectedIds = [], replaceExisting = false) {
    return candidates.flatMap(candidate => {
        const choices = enhancementChoices(candidate, enhancements, selectedIds, replaceExisting);
        return choices.map(({ gem, enchant }, index) => {
            let raw = candidate.rawLine;
            if (gem.length)
                raw = replaceOption(raw, 'gem_id', gem.join('/'));
            if (enchant)
                raw = replaceOption(raw, 'enchant_id', enchant);
            const unchanged = raw === candidate.rawLine;
            return unchanged ? candidate : { ...candidate, id: `${candidate.id}~enh-${index}`, rawLine: raw };
        });
    });
}
function candidateFitsSlot(candidate, slot, dualWield) { if (candidate.slot === slot)
    return true; if (pairedSlots.get(candidate.slot)?.includes(slot))
    return candidate.source !== 'equipped'; return dualWield && candidate.handedness === 'one-hand' && ['main_hand', 'off_hand'].includes(slot); }
function slotPool(slot, candidates, locked, dualWield) { const acceptable = candidates.filter(candidate => candidateFitsSlot(candidate, slot, dualWield)); if (slot === 'off_hand' && dualWield && candidates.some(c => c.handedness === 'two-hand'))
    acceptable.push(emptyOffHand); const lockedItems = acceptable.filter(candidate => candidate.locked && candidate.slot === slot); if (locked.has(slot) || lockedItems.length)
    return lockedItems.length ? lockedItems : acceptable.filter(candidate => candidate.source === 'equipped' && candidate.slot === slot); return acceptable; }
function validSelection(chosen, minSetBonuses) { const ids = new Set(), unique = new Set(); let twoHand = false, empty = false; const setCounts = {}; for (const candidate of chosen) {
    if (candidate.id === emptyOffHand.id) {
        empty = true;
        continue;
    }
    const baseId = candidate.id.split('~')[0];
    if (ids.has(baseId))
        return false;
    ids.add(baseId);
    if (candidate.uniqueKey) {
        if (unique.has(candidate.uniqueKey))
            return false;
        unique.add(candidate.uniqueKey);
    }
    if (candidate.slot === 'main_hand' && candidate.handedness === 'two-hand')
        twoHand = true;
    if (candidate.setName)
        setCounts[candidate.setName] = (setCounts[candidate.setName] || 0) + 1;
} if (loadoutLegalityWarnings(chosen).length)
    return false; if (twoHand !== empty)
    return false; if (minSetBonuses) {
    for (const [setName, min] of Object.entries(minSetBonuses)) {
        if ((setCounts[setName] || 0) < min)
            return false;
    }
} return true; }
function assignToSlot(candidate, slot) {
    // The candidate's display slot can be corrected by catalog enrichment while
    // its imported raw SimC line still has the original hand.  Always normalize
    // the actual line to the selected final slot; SimC only reads that line.
    return { ...candidate, slot, rawLine: candidate.rawLine.replace(/^\s*[a-z_0-9]+=/i, `${slot}=`) };
}
function enumerate(candidates, locked, dualWield, limit, minSetBonuses) { const slots = canonicalSlots.filter(slot => slotPool(slot, candidates, locked, dualWield).length > 0), output = []; const walk = (i, selected) => { if (output.length >= limit)
    return; if (i === slots.length) {
    if (validSelection(selected, minSetBonuses))
        output.push(selected);
    return;
} for (const candidate of slotPool(slots[i], candidates, locked, dualWield)) {
    if (candidate.id !== emptyOffHand.id && selected.some(x => x.id.split('~')[0] === candidate.id.split('~')[0]))
        continue;
    walk(i + 1, [...selected, assignToSlot(candidate, slots[i])]);
} }; walk(0, []); return output; }
function dedupe(candidates) { const seen = new Set(); return candidates.filter(candidate => { const key = `${candidate.slot}:${candidate.rawLine}`; if (seen.has(key))
    return false; seen.add(key); return true; }); }
function folioVariants(request) { return request.omniumFolioVariants?.length ? request.omniumFolioVariants : [[]]; }
function counted(candidates, locked, dualWield, minSetBonuses) { return enumerate(candidates, locked, dualWield, 10_000_001, minSetBonuses).length; }
export function previewOptimization(inventory, request, enhancements = []) { const initial = dedupe(inventory.candidates.filter(c => request.candidateIds.includes(c.id))), selected = withEnhancementVariants(initial, enhancements, request.enhancementIds, request.replaceExistingEnhancements), talents = inventory.talents.filter(t => request.talentIds.includes(t.id)), locked = new Set(request.lockedSlots), bags = selected.filter(c => c.source !== 'vault'), vault = selected.filter(c => c.source === 'vault'), base = counted(bags, locked, inventory.dualWieldCapable, request.minSetBonuses), perVault = vault.reduce((sum, candidate) => sum + counted([...bags, candidate], locked, inventory.dualWieldCapable, request.minSetBonuses), 0), omniumFolioVariants = folioVariants(request).length, combinations = (base + perVault) * Math.max(talents.length, 1) * omniumFolioVariants, profilesets = Math.min(combinations, 10_000_000), iterations = 10_000, estimatedSeconds = Math.max(3, Math.ceil(profilesets * iterations / 250000)), intensity = estimatedSeconds <= 30 ? 'green' : estimatedSeconds <= 300 ? 'amber' : estimatedSeconds <= 1800 ? 'orange' : 'red', enhancementVariants = Math.max(0, selected.length - initial.length), enhancementCombinations = Math.max(1, Math.ceil(selected.length / Math.max(initial.length, 1))); return { combinations, pruned: Math.max(0, initial.length - selected.length), talentBuilds: talents.length, warnings: [...(vault.length ? [] : ['No Great Vault candidates were detected. Open the Great Vault before /simc, then import again.']), ...(talents.length ? [] : ['Select at least one talent build.']), ...(request.replaceExistingEnhancements ? ['Replace existing gems/enchants is enabled: every selected compatible choice is tested across detected existing enhancements. This can increase compute time dramatically.'] : []), ...(inventory.dualWieldCapable && selected.some(c => ['main_hand', 'off_hand'].includes(c.slot) && (!c.handedness || c.handedness === 'unknown')) ? ['Some weapons are not mirrored because their local hand metadata is unavailable. Refresh the catalog after DB2 metadata is installed.'] : [])], enhancementVariants, enhancementCombinations, replaceExistingEnhancements: Boolean(request.replaceExistingEnhancements), omniumFolioVariants, profilesets, iterations, totalIterations: profilesets * iterations, estimatedSeconds, intensity, calibration: 'estimated' }; }
export function planOptimization(inventory, request, enhancements = []) { const preview = previewOptimization(inventory, request, enhancements); if (!request.confirmLarge && preview.combinations > request.limit)
    throw new Error(`This search has an estimated ${preview.combinations.toLocaleString()} valid profiles, above your ${request.limit.toLocaleString()} limit. Confirm the large search to continue.`); const selected = withEnhancementVariants(dedupe(inventory.candidates.filter(c => request.candidateIds.includes(c.id))), enhancements, request.enhancementIds, request.replaceExistingEnhancements), talents = inventory.talents.filter(t => request.talentIds.includes(t.id)); if (!talents.length)
    throw new Error('Select at least one talent build.'); const locked = new Set(request.lockedSlots), bags = selected.filter(c => c.source !== 'vault'), vault = selected.filter(c => c.source === 'vault'), folios = folioVariants(request), perTalent = Math.max(1, Math.floor(request.limit / (talents.length * folios.length))), basePlans = []; for (const talent of talents) {
    enumerate(bags, locked, inventory.dualWieldCapable, perTalent, request.minSetBonuses).forEach((candidates, i) => basePlans.push({ name: `bags_${talent.id}_${i + 1}`, source: 'bags', talent, candidates }));
    for (const candidate of vault)
        enumerate([...bags, candidate], locked, inventory.dualWieldCapable, perTalent, request.minSetBonuses).filter(candidates => candidates.some(x => x.id === candidate.id)).forEach((candidates, i) => basePlans.push({ name: `vault_${candidate.id}_${talent.id}_${i + 1}`, source: 'vault', vaultCandidateId: candidate.id, talent, candidates }));
} const plans = basePlans.flatMap(plan => folios.map((omniumFolio, index) => ({ ...plan, name: folios.length > 1 ? `${plan.name}_folio_${index + 1}` : plan.name, omniumFolio }))); return { preview, plans }; }
export function buildProfilesetInput(base, plans) {
    const groups = plans.map(plan => {
        const escaped = plan.name.replace(/"/g, '_');
        // A loadout is a final slot assignment.  Defending this boundary prevents
        // a malformed mirrored weapon candidate from producing two lines for one
        // hand, where SimC would silently use the last one.
        const bySlot = new Map();
        for (const candidate of plan.candidates) {
            if (candidate.id === emptyOffHand.id)
                continue;
            if (bySlot.has(candidate.slot))
                throw new Error(`Invalid Top Gear plan '${plan.name}': more than one item was assigned to ${candidate.slot}.`);
            bySlot.set(candidate.slot, candidate);
        }
        const gear = [...bySlot.values()].map(candidate => `profileset."${escaped}"+=${candidate.rawLine.replace(/^\s*[a-z_0-9]+=/i, `${candidate.slot}=`)}`);
        const profileOptions = [`profileset."${escaped}"+=talents=${plan.talent.talents}`];
        if (plan.talent.spec)
            profileOptions.push(`profileset."${escaped}"+=spec=${plan.talent.spec}`);
        if (plan.talent.hero_talents !== undefined)
            profileOptions.push(`profileset."${escaped}"+=hero_talents="${plan.talent.hero_talents}"`);
        else
            profileOptions.push(`profileset."${escaped}"+=hero_talents=""`);
        if (plan.omniumFolio?.length)
            profileOptions.push(`profileset."${escaped}"+=omnium_talents=${plan.omniumFolio.map(id => `${id}:1`).join('/')}`);
        return [...profileOptions, ...gear].join('\n');
    });
    return `${base.trim()}\n\n# Local Sim Dashboard Top Gear profile sets\n${groups.join('\n\n')}\n`;
}
