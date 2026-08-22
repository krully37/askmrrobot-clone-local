import { runDroptimizer } from './server/droptimizer.js';
import { Drop } from './server/droptimizer.js';

const rawProfile = `hunter="Test Profile"
level=80
race=orc
role=attack
spec=beast_mastery
talents=123
main_hand=hunting_bow,id=1000,ilevel=295,enchant_id=123,bonus_id=456/789
legs=mail_legs,id=1001,ilevel=295,enchant_id=456
`;

const drops: Drop[] = [
  { id: 2000, name: 'New Bow', slot: 'main_hand', boss: 'Boss', difficulty: 'Mythic+', simcFragment: 'id=2000,ilevel=311', status: 'verified', variantId: '1' },
  { id: 2001, name: 'New Legs', slot: 'legs', boss: 'Boss', difficulty: 'Mythic+', simcFragment: 'id=2001,ilevel=311', status: 'verified', variantId: '2' }
];

// We can just call runDroptimizer with a mock runId and see what happens?
// Wait, runDroptimizer hits the DB and executes the runner. 
// We just want to see the inputFor output. Let's write a simple script that mocks the entryLine logic directly.
const supportedSlots=['head','neck','shoulder','back','chest','wrist','hands','waist','legs','feet','finger1','finger2','trinket1','trinket2','main_hand','off_hand'];
const paired=(slot:string)=>slot.startsWith('finger')?['finger1','finger2']:slot.startsWith('trinket')?['trinket1','trinket2']:[slot];

let entries = drops.filter(d=>supportedSlots.includes(d.slot)).flatMap(drop=>paired(drop.slot).map(slot=>({drop,slot,name:`drop_${drop.id}_${slot}`})));

function entryLine(entry: any){return `profileset."${entry.name}"+=${entry.slot}=,${entry.drop.simcFragment}`;}
function inputFor(raw:string, entries: any[]){return `${raw.trim()}\n\n# Local Droptimizer candidates\n${entries.map(entryLine).join('\n')}`;}

console.log("=== BUGGY OUTPUT ===");
console.log(inputFor(rawProfile, entries));

// The fix involves parsing the inventory to grab enchants/gems from equipped gear
// and appending them to the new fragment, then doing a FULL replacement.
import { parseInventory } from './server/profile.js';
const inventory = parseInventory(rawProfile);

function fixedEntryLine(entry: any){
  let fragment = entry.drop.simcFragment;
  const replaced = inventory.candidates.find(c => c.source === 'equipped' && c.slot === entry.slot);
  if (replaced) {
    if (replaced.enchant) fragment += `,enchant_id=${replaced.enchant}`;
    if (replaced.gems && replaced.gems.length > 0) fragment += `,gem_id=${replaced.gems.join('/')}`;
  }
  // Remove the comma so it fully replaces the item!
  return `profileset."${entry.name}"+=${entry.slot}=${fragment}`;
}

function fixedInputFor(raw:string, entries: any[]){
  return `${raw.trim()}\n\n# Local Droptimizer candidates\n${entries.map(fixedEntryLine).join('\n')}`;
}

console.log("\n=== FIXED OUTPUT ===");
console.log(fixedInputFor(rawProfile, entries));
