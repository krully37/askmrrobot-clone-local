export type Bloodlust = 'disabled' | 'pull' | 'time' | 'health' | 'end';
export interface Scenario {
  name: string; fightStyle: string; duration: number; variation: number; targets: number;
  bloodlust: Bloodlust; bloodlustValue?: number; raidBuffs: boolean; consumables: boolean; consumableSelections?: Record<string,string>;
  rawOverride: string; powerInfusion?: boolean;
}
export type PersistenceMode = 'reusable' | 'disposable';
export interface CharacterProfile { id: number; characterId?: number; name: string; realm: string; className: string; spec: string; rawProfile: string; persistence: PersistenceMode; createdAt: string; updatedAt: string; }
export interface CharacterSummary { id:number; name:string; realm:string; specs:Pick<CharacterProfile,'id'|'spec'|'className'|'createdAt'|'updatedAt'>[]; runCount:number; lastRunAt?:string; lastRunStatus?:string; }
export interface CharacterSnapshot { name:string; realm:string; className:string; spec:string; profileId?:number; characterId?:number; persistence:PersistenceMode; }
export interface Run { id: number; mode: string; title: string; status: string; scenario: Scenario; input: string; reportPath?: string; summary?: string; simcVersion: string; createdAt: string; completedAt?: string; result?: unknown; profileId?:number; characterId?:number; character?:CharacterSnapshot; }
export type CandidateSource = 'equipped' | 'bags' | 'vault' | 'catalog' | 'custom';
export type WeaponHandedness = 'one-hand' | 'two-hand' | 'main-hand-only' | 'off-hand-only' | 'unknown';
export interface GearCandidate {
  id: string; slot: string; rawLine: string; itemId?: number; name: string; itemLevel?: number;
  source: CandidateSource; selected: boolean; locked: boolean; uniqueKey?: string;
  gems?: string[]; enchant?: string; icon?: string; quality?: string; handedness?: WeaponHandedness;
}
export interface Enhancement { id:string; type:'gem'|'enchant'|'weapon'; name:string; effect?:string; slots:string[]; simcFragment:string; icon?:string; provenance?:string; clientBuild?:string; currentSeason?:boolean; weaponHands?:WeaponHandedness[]; reviewStatus?:'reviewed'|'unreviewed'; db2Status?:'matched'|'unavailable'; simcValidation?:'syntax-valid'|'unvalidated'; }
export interface TalentBuild { id: string; name: string; talents: string; spec?: string; hero_talents?: string; selected: boolean; }
export interface ParsedInventory { candidates: GearCandidate[]; talents: TalentBuild[]; vaultDetected: boolean; dualWieldCapable: boolean; }
export interface OptimizationRequest {
  profileId: number; scenario: Scenario; candidateIds: string[]; lockedSlots: string[];
  talentIds: string[]; threads: number; limit: number; confirmLarge?: boolean; enhancementIds?: string[];
  /** When enabled, selected enhancement choices replace every detected existing
   * gem/enchant on compatible candidates instead of only filling empty values. */
  replaceExistingEnhancements?: boolean;
}
export interface LoadoutResult { name: string; dps?: number; talentName: string; itemIds: string[]; source: 'bags' | 'vault'; vaultCandidateId?: string; }
