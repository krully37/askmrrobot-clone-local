export const SEASON_TRACKS = [
    { name: 'Veteran', levels: [272, 275, 278, 282, 285, 288, 292, 295] },
    { name: 'Champion', levels: [292, 295, 298, 302, 305, 308] },
    { name: 'Hero', levels: [305, 308, 311, 315, 318, 321] },
    { name: 'Myth', levels: [318, 321, 324, 328, 331, 334] }
];
export function parseTrackString(trackStr) {
    if (!trackStr)
        return undefined;
    const match = trackStr.match(/^([a-zA-Z]+)\s+(\d+)\/(\d+)$/);
    if (!match)
        return undefined;
    return {
        track: match[1],
        step: parseInt(match[2], 10),
        maxStep: parseInt(match[3], 10)
    };
}
export function getTrackMaxLevel(trackName) {
    const track = SEASON_TRACKS.find(t => t.name.toLowerCase() === trackName.toLowerCase());
    return track ? track.levels[track.levels.length - 1] : undefined;
}
export function getCappedUpgradeLevel(baseTrackStr, targetItemLevel) {
    const parsed = parseTrackString(baseTrackStr);
    if (!parsed)
        return undefined;
    const maxLevel = getTrackMaxLevel(parsed.track);
    if (!maxLevel)
        return undefined;
    return Math.min(targetItemLevel, maxLevel);
}
export function getAllUpgradeTargets() {
    const targets = [];
    // Build a flat list of all possible target levels starting from Highest to Lowest
    const reversedTracks = [...SEASON_TRACKS].reverse();
    for (const track of reversedTracks) {
        for (let i = track.levels.length - 1; i >= 0; i--) {
            // Don't add duplicates if a lower track's max level overlaps
            if (!targets.some(t => t.itemLevel === track.levels[i])) {
                targets.push({ track: track.name, step: i + 1, itemLevel: track.levels[i] });
            }
        }
    }
    return targets;
}
