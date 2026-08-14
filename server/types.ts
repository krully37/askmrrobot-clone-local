export type Bloodlust = 'disabled' | 'pull' | 'time' | 'health' | 'end';
export interface Scenario {
  name: string; fightStyle: string; duration: number; variation: number; targets: number;
  bloodlust: Bloodlust; bloodlustValue?: number; raidBuffs: boolean; consumables: boolean;
  rawOverride: string;
}
export interface CharacterProfile { id: number; name: string; className: string; spec: string; rawProfile: string; createdAt: string; }
export interface Run { id: number; mode: string; title: string; status: string; scenario: Scenario; input: string; reportPath?: string; summary?: string; simcVersion: string; createdAt: string; completedAt?: string; }
