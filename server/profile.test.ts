import { describe, expect, it } from 'vitest';
import { buildInput, parseInventory, parseProfile, scenarioOverlay } from './profile.js';
import { buildProfilesetInput, planOptimization, previewOptimization, withEnhancementVariants } from './optimizer.js';
import { profileResults } from './runner.js';

const profile = `# SimC export\nwarrior=FuryTest\nspec=fury\nhead=test_helm,id=1\nfinger1=test_ring,id=2\nmain_hand=test_weapon,id=3`;

describe('SimulationCraft profile support', () => {
  it('parses a valid addon export and equipped slots', () => {
    const parsed = parseProfile(profile);
    expect(parsed.name).toBe('FuryTest');
    expect(parsed.spec).toBe('fury');
    expect(parsed.inventory.candidates).toHaveLength(3);
  });
  it('rejects input that is not an addon profile', () => {
    expect(() => parseProfile('hello world')).toThrow(/SimulationCraft addon export/);
  });
  it('generates guided scenario options and preserves raw override', () => {
    const scenario = { name:'Cleave',fightStyle:'Patchwerk',duration:180,variation:20,targets:3,bloodlust:'time' as const,bloodlustValue:20,raidBuffs:true,consumables:true,rawOverride:'iterations=5000' };
    expect(scenarioOverlay(scenario)).toContain('desired_targets=3');
    expect(scenarioOverlay(scenario)).toContain('vary_combat_length=0.2');
    expect(scenarioOverlay(scenario)).toContain('bloodlust_time=20');
    expect(buildInput(profile,scenario,8)).toContain('iterations=5000');
    expect(buildInput(profile,scenario,8)).toContain('threads=8');
  });
  it('uses supported streamlined scenario options', () => {
    const input=buildInput(profile,{name:'Patchwerk',fightStyle:'Patchwerk',duration:300,variation:20,targets:4,bloodlust:'pull',raidBuffs:true,consumables:true,powerInfusion:false,rawOverride:''},8);
    expect(input).toContain('desired_targets=4');
    expect(input).not.toContain('default_flask=');
    expect(input).not.toContain('default_food=');
    expect(input).not.toContain('override.power_infusion=');
  });
  it('expands selected gem and enchant alternatives into exact SimC item variants', () => {
    const candidate={id:'head',slot:'head',name:'Helm',rawLine:'head=helm,id=1,gem_id=10',source:'equipped' as const,selected:true,locked:true};
    const variants=withEnhancementVariants([candidate],[{id:'gem-20',type:'gem' as const,name:'Gem',slots:['head'],simcFragment:'gem_id=20'},{id:'ench-30',type:'enchant' as const,name:'Enchant',slots:['head'],simcFragment:'enchant_id=30'}],['gem-20','ench-30'],true);
    expect(variants).toHaveLength(2);
    expect(variants.some(x=>x.rawLine.includes('gem_id=20')&&x.rawLine.includes('enchant_id=30'))).toBe(true);
    expect(variants.every(x=>x.locked)).toBe(true);
  });
  it('preserves existing enhancements unless replacement is explicitly enabled', () => {
    const candidate={id:'head',slot:'head',name:'Helm',rawLine:'head=helm,id=1,gem_id=10/11,enchant_id=30',source:'equipped' as const,selected:true,locked:false};
    const enhancements=[
      {id:'gem-20',type:'gem' as const,name:'Gem',slots:['head'],simcFragment:'gem_id=20'},
      {id:'gem-21',type:'gem' as const,name:'Gem',slots:['head'],simcFragment:'gem_id=21'},
      {id:'ench-40',type:'enchant' as const,name:'Enchant',slots:['head'],simcFragment:'enchant_id=40'},
    ];
    expect(withEnhancementVariants([candidate],enhancements,enhancements.map(x=>x.id))).toHaveLength(1);
    const replaced=withEnhancementVariants([candidate],enhancements,enhancements.map(x=>x.id),true);
    // Two selected gems across two interchangeable socket positions gives
    // three non-duplicate gem loadouts; each pairs with the selected enchant.
    expect(replaced).toHaveLength(3);
    expect(replaced.every(x=>x.rawLine.includes('enchant_id=40'))).toBe(true);
  });
});

describe('Top Gear inventory planning', () => {
  const raw = `${profile}
# Gear from Bags
# finger1=bag_ring,id=4,ilevel=700
# Great Vault
# head=vault_helm,id=5,ilevel=710
# Saved Loadout: Cleave
# talents=cleaveHash`;
  it('classifies bag and Vault candidates and saved builds', () => {
    const inventory = parseInventory(raw);
    expect(inventory.candidates.filter(c => c.source === 'bags')).toHaveLength(1);
    expect(inventory.candidates.filter(c => c.source === 'vault')).toHaveLength(1);
    expect(inventory.vaultDetected).toBe(true);
    expect(inventory.talents.map(t => t.name)).toContain('Cleave');
  });
  it('keeps Vault rewards mutually exclusive in planned loadouts', () => {
    const inventory = parseInventory(raw);
    const request = { candidateIds: inventory.candidates.map(c=>c.id), lockedSlots: [], talentIds: [inventory.talents[0].id], threads: 1, limit: 100, profileId: 1, scenario: { name:'x',fightStyle:'Patchwerk',duration:60,variation:0,targets:1,bloodlust:'pull' as const,raidBuffs:true,consumables:true,rawOverride:'' }, confirmLarge: true };
    expect(previewOptimization(inventory, request).combinations).toBeGreaterThan(0);
    const planned = planOptimization(inventory, request).plans;
    expect(planned.some(p => p.source === 'bags')).toBe(true);
    expect(planned.filter(p => p.source === 'vault').every(p => p.candidates.filter(c=>c.source==='vault').length === 1)).toBe(true);
  });
  it('reports total iterations and replacement-mode risk in the preview', () => {
    const inventory=parseInventory(profile);
    const request={candidateIds:inventory.candidates.map(c=>c.id),lockedSlots:[],talentIds:['active'],enhancementIds:[],replaceExistingEnhancements:true};
    const preview=previewOptimization(inventory,request);
    expect(preview.totalIterations).toBe(preview.profilesets*preview.iterations);
    expect(preview.warnings.join(' ')).toMatch(/Replace existing gems/);
  });
  it('allows a dual-wield spec to assign distinct one-handed weapons to either hand', () => {
    const inventory=parseInventory(`demonhunter=Dual\nspec=havoc\ntalents=x\n# Main (300)\nmain_hand=,id=1\n# Off (300)\noff_hand=,id=2\n### Gear from Bags\n# Third (300)\n# main_hand=,id=3`);
    inventory.candidates.forEach(candidate=>{if(['main_hand','off_hand'].includes(candidate.slot)){candidate.handedness='one-hand';candidate.locked=false;}});
    const request={candidateIds:inventory.candidates.map(c=>c.id),lockedSlots:[],talentIds:['active'],enhancementIds:[],threads:1,limit:100,profileId:1,scenario:{name:'x',fightStyle:'Patchwerk',duration:60,variation:0,targets:1,bloodlust:'pull' as const,raidBuffs:true,consumables:true,rawOverride:''},confirmLarge:true};
    const plans=planOptimization(inventory,request).plans;
    expect(inventory.dualWieldCapable).toBe(true);
    expect(plans.some(plan=>plan.candidates.some(c=>c.slot==='main_hand'&&c.itemId===2)&&plan.candidates.some(c=>c.slot==='off_hand'&&c.itemId===1))).toBe(true);
  });
  it('writes exactly one profileset item line for each final gear slot', () => {
    const plans=[{name:'hands',source:'bags' as const,talent:{id:'active',name:'Active',talents:'x',active:true,selected:true},candidates:[
      {id:'mh',slot:'main_hand',name:'Main',rawLine:'main_hand=main,id=1',source:'equipped' as const,selected:true,locked:false},
      {id:'oh',slot:'off_hand',name:'Off',rawLine:'main_hand=off,id=2',source:'equipped' as const,selected:true,locked:false},
    ]}];
    const input=buildProfilesetInput(profile,plans);
    expect(input.match(/profileset\."hands"\+=main_hand=/g)).toHaveLength(1);
    expect(input.match(/profileset\."hands"\+=off_hand=/g)).toHaveLength(1);
  });
});

describe('SimC profileset results', () => {
  it('reads the current json2 profilesets.results layout', () => {
    expect(profileResults({sim:{profilesets:{metric:'Damage per Second',results:[{name:'bags_active_1',mean:12345}]}}})).toEqual([{name:'bags_active_1',dps:12345}]);
  });
});

describe('Retail SimC addon exports', () => {
  const retail = `# Shawnzdh - Havoc - US/Illidan
# SimC Addon 12.1.0-02
demonhunter="Shawnzdh"
level=90
spec=havoc
talents=activeHash

# Devouring Reaver's Intake (289)
head=,id=250033,bonus_id=13338/13440

### Gear from Bags
#
# Preyhunter's Sleek Mask (279)
# head=,id=275517,bonus_id=12825/6652

### Weekly Reward Choices
# Vault of Exact Answers (292)
# trinket1=,id=299999,bonus_id=99
### End of Weekly Reward Choices`;
  it('accepts compact Retail class names and preserves preceding item comments', () => {
    const parsed = parseProfile(retail);
    expect(parsed.name).toBe('Shawnzdh');
    expect(parsed.realm).toBe('US/Illidan');
    expect(parsed.className).toBe('demonhunter');
    expect(parsed.inventory.candidates.find(c=>c.itemId===250033)?.name).toBe("Devouring Reaver's Intake");
    expect(parsed.inventory.candidates.find(c=>c.itemId===275517)?.source).toBe('bags');
    expect(parsed.inventory.candidates.find(c=>c.itemId===299999)?.source).toBe('vault');
    expect(parsed.inventory.candidates.find(c=>c.itemId===250033)?.itemLevel).toBe(289);
    expect(parsed.inventory.candidates.find(c=>c.itemId===299999)?.itemLevel).toBe(292);
    expect(parsed.inventory.vaultDetected).toBe(true);
  });
});
