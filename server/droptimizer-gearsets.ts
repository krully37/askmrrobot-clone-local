import { parseInventory } from './profile.js';
import { getCappedUpgradeLevel } from './tracks.js';
import type { ParsedInventory } from './types.js';

export const DROPTIMIZER_SLOTS = ['head','neck','shoulder','back','chest','wrist','hands','waist','legs','feet','finger1','finger2','trinket1','trinket2','main_hand','off_hand'] as const;
const pairedSlots = (slot: string) => slot.startsWith('finger') ? ['finger1', 'finger2'] : slot.startsWith('trinket') ? ['trinket1', 'trinket2'] : [slot];

export interface DroptimizerDrop {
  id: number;
  name: string;
  slot: string;
  itemLevel?: number;
  boss: string;
  difficulty: string;
  track?: string;
  variantId: string;
  bonusIds?: number[];
  simcFragment: string;
  status: 'verified';
}

export interface DroptimizerGearset {
  /** The input catalog record is deliberately copied, never edited in place. */
  drop: DroptimizerDrop;
  slot: string;
  name: string;
}

function replaceOption(fragment: string, key: string, value: string) {
  const expression = new RegExp(`(^|,)${key}=[^,]*`);
  return expression.test(fragment)
    ? fragment.replace(expression, (_, prefix) => `${prefix}${key}=${value}`)
    : `${fragment},${key}=${value}`;
}

function variantAtTarget(drop: DroptimizerDrop, target?: number): DroptimizerDrop {
  if (!target) return { ...drop };
  const itemLevel = drop.track ? getCappedUpgradeLevel(drop.track, target) ?? target : target;
  return { ...drop, itemLevel, simcFragment: replaceOption(drop.simcFragment, 'ilevel', String(itemLevel)) };
}

/**
 * Builds one final-item variant for every legal replacement slot.  Rings and
 * trinkets therefore have independent candidates, rather than sharing a
 * mutable drop object whose level or enhancements can leak between profiles.
 */
export function buildDroptimizerGearsets(drops: DroptimizerDrop[], upgradeTarget?: number): DroptimizerGearset[] {
  return drops
    .filter(drop => (DROPTIMIZER_SLOTS as readonly string[]).includes(drop.slot))
    .flatMap(drop => pairedSlots(drop.slot).map(slot => ({
      drop: variantAtTarget(drop, upgradeTarget),
      slot,
      name: `drop_${drop.id}_${slot}`,
    })));
}

function candidateLine(entry: DroptimizerGearset, inventory: ParsedInventory) {
  const replaced = inventory.candidates.find(candidate => candidate.source === 'equipped' && candidate.slot === entry.slot);
  let fragment = entry.drop.simcFragment.replace(/^,+/, '');
  if (replaced?.enchant) fragment = replaceOption(fragment, 'enchant_id', replaced.enchant);
  if (replaced?.gems?.length) fragment = replaceOption(fragment, 'gem_id', replaced.gems.join('/'));

  // Do not add a leading comma here. In SimC that makes this a partial item
  // override, retaining fields from the equipped item; a Droptimizer candidate
  // must be a self-contained replacement.
  return `profileset."${entry.name}"+=${entry.slot}=${fragment}`;
}

export function buildDroptimizerGearsetInput(rawProfile: string, entries: DroptimizerGearset[], inventory = parseInventory(rawProfile)) {
  return `${rawProfile.trim()}\n\n# Local Droptimizer candidates\n${entries.map(entry => candidateLine(entry, inventory)).join('\n')}`;
}
