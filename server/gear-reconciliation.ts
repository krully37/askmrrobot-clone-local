/**
 * SimulationCraft does not reject gear it cannot resolve. An item ID that no
 * longer exists in the build's item database is dropped from the actor without
 * a warning, an error, or a non-zero exit code, and the sim still reports a
 * confident DPS figure for the remaining gear.
 *
 * That makes stale catalog data fail silently rather than loudly: the number
 * looks normal, so nothing prompts a re-check after a patch. These helpers
 * compare the gear a run asked for against the gear SimC reported back, so a
 * dropped slot becomes a visible warning on the result.
 */

const equipSlots = new Set([
  'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet',
  'finger1', 'finger2', 'trinket1', 'trinket2', 'main_hand', 'off_hand'
]);

export interface RequestedGear { slot: string; itemId: number; rawLine: string }
export interface ReturnedGear { slot: string; itemId?: number }

/**
 * Collect the gear the actor will actually equip from a SimC input profile.
 *
 * Commented lines are skipped because addon exports list bags, bank and Great
 * Vault contents as comments, and those are offered as candidates rather than
 * equipped. Profileset overrides are skipped too: json2 reports gear only for
 * the base actor, so there is nothing to reconcile them against.
 */
export function requestedGear(input: string): RequestedGear[] {
  const seen = new Map<string, RequestedGear>();
  for (const raw of input.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('profileset.')) continue;
    const match = line.match(/^([a-z_0-9]+)\+?=(.+)$/i);
    if (!match) continue;
    const slot = match[1].toLowerCase();
    if (!equipSlots.has(slot)) continue;
    const itemId = Number(match[2].match(/(?:^|,)id=(\d+)/)?.[1]);
    if (!Number.isInteger(itemId) || itemId <= 0) continue;
    // A later line for the same slot overrides the earlier one, as in SimC.
    seen.set(slot, { slot, itemId, rawLine: line });
  }
  return [...seen.values()];
}

/**
 * Warn about every requested slot SimC did not report back, and about any slot
 * where it resolved a different item than the one asked for.
 */
export function reconcileGear(requested: RequestedGear[], returned: ReturnedGear[]): string[] {
  if (!requested.length) return [];
  const bySlot = new Map(returned.map(entry => [entry.slot.toLowerCase(), entry]));
  const dropped: RequestedGear[] = [];
  const mismatched: { slot: string; wanted: number; got: number }[] = [];
  for (const entry of requested) {
    const actual = bySlot.get(entry.slot);
    if (!actual) { dropped.push(entry); continue; }
    if (actual.itemId && actual.itemId !== entry.itemId) {
      mismatched.push({ slot: entry.slot, wanted: entry.itemId, got: actual.itemId });
    }
  }
  const warnings: string[] = [];
  if (dropped.length) {
    const detail = dropped.map(entry => `${entry.slot} (id=${entry.itemId})`).join(', ');
    warnings.push(
      `SimulationCraft silently ignored ${dropped.length} requested item${dropped.length === 1 ? '' : 's'}: ${detail}. ` +
      'This DPS result was produced with those slots empty. The item IDs are usually absent from the current SimC build, ' +
      'so refresh the catalog or update the SimC runtime before trusting this number.'
    );
  }
  for (const entry of mismatched) {
    warnings.push(`SimulationCraft resolved ${entry.slot} to item ${entry.got} instead of the requested ${entry.wanted}.`);
  }
  return warnings;
}
