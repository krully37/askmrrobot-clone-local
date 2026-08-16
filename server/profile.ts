import type { GearCandidate, ParsedInventory, Scenario, TalentBuild } from './types.js';

const slots = new Set(['head','neck','shoulder','back','chest','wrist','hands','waist','legs','feet','finger1','finger2','trinket1','trinket2','main_hand','off_hand']);
const dualWieldSpecs=new Set(['rogue:assassination','rogue:outlaw','rogue:subtlety','demonhunter:havoc','demonhunter:vengeance','demon_hunter:havoc','demon_hunter:vengeance','shaman:enhancement','monk:windwalker','warrior:fury','deathknight:frost','death_knight:frost']);
export function canDualWield(className:string,spec:string){return dualWieldSpecs.has(`${className.toLowerCase()}:${spec.toLowerCase()}`);}

export function parseProfile(raw: string) {
  const clean = raw.replace(/\r\n/g, '\n').trim();
  const actor = clean.match(/^\s*(deathknight|death_knight|demonhunter|demon_hunter|druid|evoker|hunter|mage|monk|paladin|priest|rogue|shaman|warlock|warrior)=([^\n]+)/mi);
  if (!actor) throw new Error('This does not look like a SimulationCraft addon export. Include the character class line (for example, warrior=Name).');
  const inventory = parseInventory(clean);
  const headerRealm=clean.match(/^\s*#\s*[^\n]*?\s+-\s*[^\n]*?\s+-\s*([A-Za-z]{2}\/[A-Za-z0-9 '\-]+)/m)?.[1]?.trim();
  const configuredRealm=clean.match(/^\s*(?:server|realm)=([^\n]+)/mi)?.[1]?.trim();
  return { name: actor[2].trim().replace(/^"|"$/g, ''), realm:headerRealm || configuredRealm || 'Unknown realm', className: actor[1], spec: clean.match(/^\s*spec=([^\n]+)/mi)?.[1]?.trim() || 'unknown', raw: clean, inventory };
}

const sourceHeader = (line: string) => /great\s+vault|weekly\s+reward(?:s)?(?:\s+choices)?/i.test(line) ? 'vault' : /custom\s+candidates/i.test(line) ? 'custom' : /gear\s+from\s+(bags|bank)|bags/i.test(line) ? 'bags' : undefined;
interface PendingItemComment { name: string; itemLevel?: number; }
function candidateFromLine(line: string, source: GearCandidate['source'], index: number, comment?: PendingItemComment): GearCandidate | undefined {
  const body=line.replace(/^\s*#\s*/, '').trim(); const m=body.match(/^([a-z_0-9]+)=(.+)$/i); if(!m || !slots.has(m[1].toLowerCase())) return;
  const itemId=Number(m[2].match(/(?:^|,)id=(\d+)/)?.[1]) || undefined;
  // Addon exports usually put the displayed level in the preceding comment,
  // including Great Vault choices; only some raw item lines contain ilevel=.
  const itemLevel=Number(m[2].match(/(?:^|,)ilevel=(\d+)/)?.[1]) || comment?.itemLevel;
  const uniqueKey=m[2].match(/(?:^|,)(?:unique|unique_equipped)=([^,]+)/)?.[1];
  const gems=(m[2].match(/(?:^|,)gem_id=([^,]+)/)?.[1] || '').split('/').filter(Boolean);
  const enchant=m[2].match(/(?:^|,)enchant_id=([^,]+)/)?.[1];
  return { id:`${source}-${index}-${m[1]}-${itemId ?? 'unknown'}`,slot:m[1].toLowerCase(),rawLine:`${m[1]}=${m[2]}`,itemId,name:comment?.name || m[2].match(/^([^,]+)/)?.[1].replace(/_/g,' ') || `Unknown item ${index}`,itemLevel,source,selected:true,locked:false,uniqueKey,gems,enchant };
}
export function parseInventory(clean: string): ParsedInventory {
  const lines=clean.split('\n'); const candidates: GearCandidate[]=[]; const talents: TalentBuild[]=[]; let source: GearCandidate['source']='equipped'; let sequence=0;
  let pendingItem: PendingItemComment | undefined;
  for(let i=0;i<lines.length;i++) { const line=lines[i]; const header=sourceHeader(line); if(header) { source=header; pendingItem=undefined; continue; }
    const item=candidateFromLine(line,source,sequence++,pendingItem); if(item) { candidates.push(item); pendingItem=undefined; continue; }
    const comment=line.match(/^\s*#\s*(.+?)\s*$/); if(comment && !/^\s*#\s*(?:Saved Loadout:|talents=)/i.test(line)) { const itemLevel=Number(comment[1].match(/\s+\((\d+)\)\s*$/)?.[1]) || undefined; pendingItem={name:comment[1].replace(/\s+\(\d+\)\s*$/,'').trim(),itemLevel}; }
    const loadout=line.match(/^\s*#\s*Saved Loadout:\s*(.+)$/i); if(loadout) { const talentLine=lines.slice(i+1,i+4).find(x=>/^\s*#?\s*talents=/.test(x)); const talentsValue=talentLine?.replace(/^\s*#\s*/, '').match(/^talents=(.+)$/)?.[1]; if(talentsValue) talents.push({id:`saved-${talents.length}`,name:loadout[1].trim(),talents:talentsValue,selected:false}); }
  }
  const active=clean.match(/^\s*talents=(.+)$/mi)?.[1]; if(active) talents.unshift({id:'active',name:'Active loadout',talents:active,selected:true});
  const className=clean.match(/^\s*(deathknight|death_knight|demonhunter|demon_hunter|druid|evoker|hunter|mage|monk|paladin|priest|rogue|shaman|warlock|warrior)=/mi)?.[1]||'';
  const spec=clean.match(/^\s*spec=([^\n]+)/mi)?.[1]||'';
  return { candidates, talents, vaultDetected:candidates.some(c=>c.source==='vault'), dualWieldCapable:canDualWield(className,spec) };
}

export function scenarioOverlay(s: Scenario) {
  // The UI stores variation as a human-friendly percentage (20 = 20%), while
  // SimulationCraft expects a fractional value between 0 and 1.
  const variation=s.variation > 1 ? s.variation / 100 : s.variation;
  const lines = [
    `fight_style=${s.fightStyle}`,
    `max_time=${s.duration}`,
    `vary_combat_length=${variation}`,
    `desired_targets=${s.targets}`,
    `override.bloodlust=${s.bloodlust === 'disabled' ? 0 : 1}`,
    `threads=0`
  ];
  if (s.bloodlust === 'time') lines.push(`bloodlust_time=${s.bloodlustValue ?? 0}`);
  if (s.bloodlust === 'health') lines.push(`bloodlust_percent=${s.bloodlustValue ?? 25}`);
  if (s.bloodlust === 'end') lines.push('bloodlust_time=0');
  if (!s.raidBuffs) lines.push('optimal_raid=0');
  // Current nightlies do not accept the old global default_* consumable flags.
  // Leave consumables to the imported profile / current SimC defaults instead.
  return lines.join('\n');
}

export function buildInput(profile: string, scenario: Scenario, threads: number) {
  return `${profile.trim()}\n\n# Generated by Local Sim Dashboard\n${scenarioOverlay(scenario)}\nthreads=${threads}\n${scenario.rawOverride.trim()}`.trim() + '\n';
}
