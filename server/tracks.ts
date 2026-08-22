export interface UpgradeTrack {
  name: string;
  levels: number[];
  crestType: string;
}

export const SEASON_TRACKS: UpgradeTrack[] = [
  { name: 'Adventurer', levels: [252, 255, 258, 262, 265, 268, 272, 275], crestType: 'Adventurer' },
  { name: 'Veteran', levels: [272, 275, 278, 282, 285, 288, 292, 295], crestType: 'Veteran' },
  { name: 'Champion', levels: [292, 295, 298, 302, 305, 308], crestType: 'Champion' },
  { name: 'Hero', levels: [305, 308, 311, 315, 318, 321], crestType: 'Hero' },
  { name: 'Myth', levels: [318, 321, 324, 328, 331, 334], crestType: 'Myth' }
];

export function getUpgradeCost(stepCount: number, discountAvailable: boolean) {
  if (discountAvailable) return 0;
  return stepCount * 20;
}

export function parseTrackString(trackStr: string): { track: string, step: number, maxStep: number } | undefined {
  if (!trackStr) return undefined;
  const match = trackStr.match(/^([a-zA-Z]+)\s+(\d+)\/(\d+)$/);
  if (!match) return undefined;
  return {
    track: match[1],
    step: parseInt(match[2], 10),
    maxStep: parseInt(match[3], 10)
  };
}

export function getTrackMaxLevel(trackName: string): number | undefined {
  const track = SEASON_TRACKS.find(t => t.name.toLowerCase() === trackName.toLowerCase());
  return track ? track.levels[track.levels.length - 1] : undefined;
}

export function getCappedUpgradeLevel(baseTrackStr: string, targetItemLevel: number): number | undefined {
  const parsed = parseTrackString(baseTrackStr);
  if (!parsed) return undefined;
  const maxLevel = getTrackMaxLevel(parsed.track);
  if (!maxLevel) return undefined;
  return Math.min(targetItemLevel, maxLevel);
}

export interface UpgradeTarget {
  track: string;
  step: number;
  itemLevel: number;
  label?: string;
}

export function getAllUpgradeTargets(): UpgradeTarget[] {
  const targets: UpgradeTarget[] = [];
  const reversedTracks = [...SEASON_TRACKS].reverse();
  for (const track of reversedTracks) {
    const maxSteps = track.levels.length;
    for (let i = track.levels.length - 1; i >= 0; i--) {
      const existing = targets.find(t => t.itemLevel === track.levels[i]);
      if (existing) {
        existing.label = `${existing.label || `${existing.track} ${existing.step}/${getTrackMaxLevelLength(existing.track)}`} / ${track.name} ${i + 1}/${maxSteps}`;
      } else {
        targets.push({ track: track.name, step: i + 1, itemLevel: track.levels[i], label: `${track.name} ${i + 1}/${maxSteps}` });
      }
    }
  }
  return targets;
}

function getTrackMaxLevelLength(trackName: string): number {
  return SEASON_TRACKS.find(t => t.name === trackName)?.levels.length || 6;
}
