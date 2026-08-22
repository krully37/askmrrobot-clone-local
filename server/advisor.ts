import { getUpgradeCost, parseTrackString, getTrackMaxLevel } from './tracks.js';
import type { ParsedInventory, GearCandidate } from './types.js';

export interface AdvisorRequest {
  profileId: number;
  crests: {
    adventurer: number;
    veteran: number;
    champion: number;
    hero: number;
    myth: number;
  };
  sparks: number;
  discounts: Record<string, boolean>; // slot -> hasDiscount
  tuning: 'raw-ilvl' | 'power' | 'crest-efficiency';
  threads: number;
}

export interface UpgradeAction {
  slot: string;
  type: 'upgrade' | 'craft';
  costType: string;
  costAmount: number;
  sparkCost: number;
  newItemLevel: number;
  description: string;
  simcLineModifier: (baseLine: string) => string;
}

const ROGUE_CRAFT_SLOTS = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'main_hand', 'off_hand'];

function generateActionsForSlot(candidate: GearCandidate, crests: Record<string, number>, sparks: number, discount: boolean): UpgradeAction[] {
  const actions: UpgradeAction[] = [];
  
  // 1. Upgrades on current track
  if (candidate.track) {
    const parsed = parseTrackString(candidate.track);
    if (parsed) {
      const maxLvl = getTrackMaxLevel(parsed.track);
      if (maxLvl && parsed.step < parsed.maxStep) {
        // Can upgrade multiple steps
        for (let targetStep = parsed.step + 1; targetStep <= parsed.maxStep; targetStep++) {
          const steps = targetStep - parsed.step;
          const cost = getUpgradeCost(steps, discount);
          const ilvlGain = steps * 3; // roughly 3 ilvl per step in Midnight
          
          if (cost <= (crests[parsed.track.toLowerCase()] || 0)) {
            actions.push({
              slot: candidate.slot,
              type: 'upgrade',
              costType: parsed.track.toLowerCase(),
              costAmount: cost,
              sparkCost: 0,
              newItemLevel: (candidate.itemLevel || 0) + ilvlGain,
              description: `Upgrade to ${parsed.track} ${targetStep}/${parsed.maxStep}`,
              simcLineModifier: (line: string) => {
                if (line.includes('ilevel=')) {
                  return line.replace(/ilevel=\d+/, `ilevel=${(candidate.itemLevel || 0) + ilvlGain}`);
                }
                return `${line},ilevel=${(candidate.itemLevel || 0) + ilvlGain}`;
              }
            });
          }
        }
      }
    }
  }
  
  // 2. Crafts (Rogue subset)
  if (ROGUE_CRAFT_SLOTS.includes(candidate.slot) && sparks >= 1) {
    // Base craft 305
    actions.push({
      slot: candidate.slot,
      type: 'craft',
      costType: 'none',
      costAmount: 0,
      sparkCost: 1,
      newItemLevel: 305,
      description: `Craft Base (305)`,
      simcLineModifier: () => `${candidate.slot}=crafted_item,id=12345,ilevel=305`
    });
    
    // Hero craft 60 Hero Crests
    if (crests.hero >= 60) {
      actions.push({
        slot: candidate.slot,
        type: 'craft',
        costType: 'hero',
        costAmount: 60,
        sparkCost: 1,
        newItemLevel: 321,
        description: `Craft Hero (321)`,
        simcLineModifier: () => `${candidate.slot}=crafted_item,id=12345,ilevel=321`
      });
    }
    
    // Myth craft 80 Myth Crests
    if (crests.myth >= 80) {
      actions.push({
        slot: candidate.slot,
        type: 'craft',
        costType: 'myth',
        costAmount: 80,
        sparkCost: 1,
        newItemLevel: 334,
        description: `Craft Myth (334)`,
        simcLineModifier: () => `${candidate.slot}=crafted_item,id=12345,ilevel=334`
      });
    }
  }
  
  return actions;
}

export function generateAdvisorPermutations(inventory: ParsedInventory, req: AdvisorRequest) {
  const equipped = inventory.candidates.filter((c: GearCandidate) => c.source === 'equipped');
  
  const slotActions = equipped.map((c: GearCandidate) => ({
    candidate: c,
    actions: generateActionsForSlot(c, req.crests as Record<string, number>, req.sparks, req.discounts[c.slot] || false)
  }));
  
  const validPermutations: { actions: UpgradeAction[], cost: Record<string, number>, sparks: number, ilvlGain: number }[] = [];
  
  let iterations = 0;
  // Recursive generation
  function recurse(index: number, currentActions: UpgradeAction[], currentCosts: Record<string, number>, currentSparks: number, currentIlvlGain: number) {
    iterations++;
    if (iterations > 100000) throw new Error("Too many upgrade permutations. Reduce crest count or apply discounts to narrow the search space.");
    if (validPermutations.length > 20000) return; // limit to prevent memory/cpu exhaustion
    
    if (index >= slotActions.length) {
      if (currentActions.length > 0) {
        validPermutations.push({
          actions: [...currentActions],
          cost: { ...currentCosts },
          sparks: currentSparks,
          ilvlGain: currentIlvlGain
        });
      }
      return;
    }
    
    // Option 1: Do nothing for this slot
    recurse(index + 1, currentActions, currentCosts, currentSparks, currentIlvlGain);
    
    // Option 2: Apply an action
    const { candidate, actions } = slotActions[index];
    for (const action of actions) {
      const newCosts = { ...currentCosts };
      if (action.costType !== 'none') {
        newCosts[action.costType] = (newCosts[action.costType] || 0) + action.costAmount;
      }
      const newSparks = currentSparks + action.sparkCost;
      
      // Check budget
      let ok = newSparks <= req.sparks;
      if (ok && action.costType !== 'none') {
        ok = newCosts[action.costType] <= ((req.crests as Record<string, number>)[action.costType] || 0);
      }
      
      if (ok) {
        currentActions.push(action);
        const gain = action.newItemLevel - (candidate.itemLevel || 0);
        recurse(index + 1, currentActions, newCosts, newSparks, currentIlvlGain + gain);
        currentActions.pop();
      }
    }
  }
  
  recurse(0, [], { adventurer: 0, veteran: 0, champion: 0, hero: 0, myth: 0 }, 0, 0);
  
  validPermutations.sort((a, b) => b.ilvlGain - a.ilvlGain);
  return validPermutations.slice(0, 100);
}

export function buildAdvisorLoadouts(inventory: ParsedInventory, req: AdvisorRequest) {
  const permutations = generateAdvisorPermutations(inventory, req);
  const equipped = inventory.candidates.filter((c: GearCandidate) => c.source === 'equipped');
  const talent = inventory.talents[0]; // Just use the first talent build for the advisor
  if (!talent) throw new Error('No talent build found in profile');

  const loadouts = permutations.map((perm, index) => {
    // Start with equipped gear
    const candidates = [...equipped];
    // Apply actions
    for (const action of perm.actions) {
      const idx = candidates.findIndex(c => c.slot === action.slot);
      if (idx !== -1) {
        const c = candidates[idx];
        // Must modify BOTH simcLine and rawLine since buildProfilesetInput relies on rawLine
        const modifiedLine = action.simcLineModifier(c.rawLine || c.simcLine || '');
        candidates[idx] = { ...c, simcLine: modifiedLine, rawLine: modifiedLine, itemLevel: action.newItemLevel };
      }
    }
    
    // Create a meaningful name
    const title = perm.actions.map(a => a.type === 'craft' ? `Craft ${a.slot}` : `Up ${a.slot}`).join(', ');
    
    return {
      name: `advisor_${index}_${title.substring(0, 50)}`,
      source: 'advisor' as const,
      talent,
      candidates
    };
  });
  return { permutations, loadouts };
}
