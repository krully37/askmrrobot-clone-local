export const OMNIUM_FOLIO_ROWS = [
    [{ talentId: 136825, spellId: 1279596, name: 'Void-Touched Orbs' }, { talentId: 136822, spellId: 1279599, name: 'Unleashed Fire' }],
    [{ talentId: 136819, spellId: 1279603, name: 'Self-Mending' }, { talentId: 136815, spellId: 1279604, name: 'Void-Tainted Shell' }, { talentId: 136821, spellId: 1279605, name: 'Lynxlike Reflexes' }],
    [{ talentId: 136817, spellId: 1287555, name: 'Lingering' }],
    [{ talentId: 136816, spellId: 1279609, name: 'Critical Power' }, { talentId: 136823, spellId: 1279610, name: 'Burning Haste' }, { talentId: 136818, spellId: 1279612, name: 'Masterful Cunning' }, { talentId: 136820, spellId: 1279613, name: 'The Versatile Warrior' }],
    [{ talentId: 136814, spellId: 1279614, name: 'Overload' }, { talentId: 136824, spellId: 1279615, name: 'Residual Energy' }, { talentId: 136826, spellId: 1279616, name: 'Echoes' }],
];
/** Rows whose alternatives materially affect DPS and may be compared together. */
export const OMNIUM_FOLIO_DPS_ROWS = new Set([0, 3, 4]);
export function omniumFolioVariants(selected) {
    const choices = OMNIUM_FOLIO_ROWS.map((row) => row.filter((rune) => selected.includes(rune.talentId)));
    if (choices.some((row) => row.length === 0))
        return [];
    return choices.reduce((variants, row) => variants.flatMap((variant) => row.map((rune) => [...variant, rune.talentId])), [[]]);
}
