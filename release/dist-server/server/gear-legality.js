/** Rules shared by all generated gear loadouts, independent of their source. */
export function loadoutLegalityWarnings(items) {
    const warnings = [];
    const bySlot = new Map(items.map(item => [item.slot, item]));
    for (const [first, second] of [['finger1', 'finger2'], ['trinket1', 'trinket2']]) {
        const left = bySlot.get(first), right = bySlot.get(second);
        if (left?.itemId && left.itemId === right?.itemId)
            warnings.push(`Duplicate item ${left.itemId} in ${first}/${second}.`);
        if (left?.uniqueKey && left.uniqueKey === right?.uniqueKey)
            warnings.push(`Unique-equipped conflict (${left.uniqueKey}) in ${first}/${second}.`);
    }
    const main = bySlot.get('main_hand'), off = bySlot.get('off_hand');
    if (main?.handedness === 'two-hand' && off?.itemId)
        warnings.push('Two-hand main weapon cannot be paired with an off-hand item.');
    if (main?.handedness === 'off-hand-only')
        warnings.push('Off-hand-only weapon placed in main hand.');
    if (off?.handedness === 'main-hand-only')
        warnings.push('Main-hand-only weapon placed in off hand.');
    return warnings;
}
