import { describe, expect, it } from 'vitest';
import { buildInput, parseProfile, scenarioOverlay } from './profile.js';

const profile = `# SimC export\nwarrior=FuryTest\nspec=fury\nhead=test_helm,id=1\nfinger1=test_ring,id=2\nmain_hand=test_weapon,id=3`;

describe('SimulationCraft profile support', () => {
  it('parses a valid addon export and equipped slots', () => {
    const parsed = parseProfile(profile);
    expect(parsed.name).toBe('FuryTest');
    expect(parsed.spec).toBe('fury');
    expect(parsed.items).toHaveLength(3);
  });
  it('rejects input that is not an addon profile', () => {
    expect(() => parseProfile('hello world')).toThrow(/SimulationCraft addon export/);
  });
  it('generates guided scenario options and preserves raw override', () => {
    const scenario = { name:'Cleave',fightStyle:'Patchwerk',duration:180,variation:20,targets:3,bloodlust:'time' as const,bloodlustValue:20,raidBuffs:true,consumables:true,rawOverride:'iterations=5000' };
    expect(scenarioOverlay(scenario)).toContain('desired_targets=3');
    expect(scenarioOverlay(scenario)).toContain('bloodlust_time=20');
    expect(buildInput(profile,scenario,8)).toContain('iterations=5000');
    expect(buildInput(profile,scenario,8)).toContain('threads=8');
  });
});
