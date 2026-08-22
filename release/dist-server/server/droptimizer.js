import { getRun, saveDroptimizerJob, saveDroptimizerProgress, saveDroptimizerResults, saveRunResult, updateRun } from './db.js';
import { buildInput } from './profile.js';
import { execute } from './runner.js';
import { parseSimcResult } from './results.js';
import { getCappedUpgradeLevel } from './tracks.js';
import { openCatalog } from './catalog.js';
const supportedSlots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'main_hand', 'off_hand'];
const paired = (slot) => slot.startsWith('finger') ? ['finger1', 'finger2'] : slot.startsWith('trinket') ? ['trinket1', 'trinket2'] : [slot];
function entryLine(entry) { return `profileset."${entry.name}"+=${entry.slot}=,${entry.drop.simcFragment}`; }
function inputFor(raw, entries) { return `${raw.trim()}\n\n# Local Droptimizer candidates\n${entries.map(entryLine).join('\n')}`; }
export async function runDroptimizer(runId, rawProfile, drops, scenario, threads, upgradeTarget, upgradeEquipped) {
    const entries = drops.filter(d => supportedSlots.includes(d.slot)).flatMap(drop => paired(drop.slot).map(slot => ({ drop, slot, name: `drop_${drop.id}_${slot}` })));
    if (upgradeTarget) {
        for (const entry of entries) {
            if (entry.drop.track) {
                const cappedLevel = getCappedUpgradeLevel(entry.drop.track, upgradeTarget);
                if (cappedLevel)
                    entry.drop.simcFragment += `,ilevel=${cappedLevel}`;
            }
        }
    }
    saveDroptimizerJob(runId, { scenario, threads, drops, upgradeTarget, upgradeEquipped }, entries);
    let finalRawProfile = rawProfile;
    if (upgradeEquipped && upgradeTarget) {
        const db = openCatalog();
        try {
            const getTrack = db.prepare('SELECT track FROM item_variants WHERE item_id = ? AND track != "" LIMIT 1');
            const upgradedLines = rawProfile.split('\n').map(line => {
                const idMatch = line.match(/^([a-z_0-9]+)=.*,id=(\d+)/i);
                if (!idMatch)
                    return line;
                const slot = idMatch[1];
                if (!supportedSlots.includes(slot) && slot !== 'finger2' && slot !== 'trinket2')
                    return line;
                const itemId = parseInt(idMatch[2], 10);
                const trackRow = getTrack.get(itemId);
                if (trackRow?.track) {
                    const cappedLevel = getCappedUpgradeLevel(trackRow.track, upgradeTarget);
                    if (cappedLevel)
                        return `${line},ilevel=${cappedLevel}`;
                }
                return line;
            });
            finalRawProfile = upgradedLines.join('\n');
        }
        finally {
            db.close();
        }
    }
    updateRun(runId, { status: 'running' });
    const started = Date.now();
    let baseline = 0;
    let currentBatch = 0;
    let batchSize = 10;
    const scores = new Map(), failures = new Map();
    const reports = [];
    const rows = () => drops.map(drop => { const candidates = paired(drop.slot).map(slot => ({ slot, dps: scores.get(`drop_${drop.id}_${slot}`) || 0, error: failures.get(`drop_${drop.id}_${slot}`) })).filter(x => x.dps); const best = candidates.sort((a, b) => b.dps - a.dps)[0]; const failure = paired(drop.slot).map(slot => failures.get(`drop_${drop.id}_${slot}`)).find(Boolean); return { itemId: drop.id, name: drop.name, boss: drop.boss, difficulty: drop.difficulty, slot: best?.slot || drop.slot, itemLevel: drop.itemLevel, dps: best?.dps || 0, delta: (best?.dps || 0) - baseline, relative: baseline ? ((best?.dps || 0) - baseline) / baseline : 0, enhancement: 'Preserved equipped-slot enhancement when available', error: best ? undefined : failure }; }).sort((a, b) => b.delta - a.delta);
    const save = (patch = {}) => {
        const completedProfiles = patch.completedProfiles ?? (scores.size + failures.size);
        const elapsedMs = Date.now() - started, remaining = Math.max(0, entries.length - completedProfiles);
        const msPerProfile = completedProfiles ? elapsedMs / completedProfiles : undefined;
        const plannedRemainingBatches = Math.ceil(remaining / Math.max(1, batchSize));
        const progress = { stage: 'simulating', totalProfiles: entries.length, completedProfiles, currentBatch, totalBatches: currentBatch + plannedRemainingBatches, elapsedMs, estimatedRemainingMs: msPerProfile ? Math.round(remaining * msPerProfile) : undefined, partialResults: rows().filter(x => x.dps).slice(0, 8).map(x => ({ name: x.name, dps: x.dps, boss: x.boss, delta: x.delta })), reports, failedProfiles: failures.size, threads, ...patch };
        saveDroptimizerProgress(runId, progress);
        saveDroptimizerResults(runId, rows());
        return progress;
    };
    const cancelled = () => getRun(runId)?.status === 'cancelled';
    const runBatch = async (batch) => {
        if (!batch.length || cancelled())
            return;
        const batchStarted = Date.now();
        try {
            const result = await execute(runId, buildInput(inputFor(finalRawProfile, batch), scenario, threads), { suffix: `batch-${currentBatch}-${Date.now()}`, finalize: false, onProgress: c => save({ completedProfiles: scores.size + failures.size + c }) });
            reports.push(result.reportPath);
            const resultScores = new Map(result.profilesets.map(x => [x.name, x.dps || 0]));
            for (const entry of batch) {
                const score = resultScores.get(entry.name);
                if (score)
                    scores.set(entry.name, score);
                else
                    failures.set(entry.name, 'Simulation returned no DPS result.');
            }
            const perProfile = (Date.now() - batchStarted) / Math.max(1, batch.length);
            batchSize = Math.max(5, Math.min(100, Math.round(20000 / Math.max(1, perProfile))));
        }
        catch (error) {
            if (cancelled())
                return;
            if (batch.length > 1) {
                const halfway = Math.ceil(batch.length / 2);
                await runBatch(batch.slice(0, halfway));
                await runBatch(batch.slice(halfway));
                return;
            }
            failures.set(batch[0].name, (error instanceof Error ? error.message : String(error)).slice(-500));
        }
    };
    save({ stage: 'queued', currentBatch: 0, totalBatches: Math.ceil(entries.length / batchSize) });
    try {
        save({ stage: 'baseline' });
        const base = await execute(runId, buildInput(finalRawProfile, scenario, threads), { suffix: 'baseline', finalize: false });
        baseline = parseSimcResult(base.jsonPath)?.dps || 0;
        reports.push(base.reportPath);
        if (!baseline)
            throw new Error('Baseline simulation returned no DPS result.');
        save({ stage: 'simulating' });
        let cursor = 0;
        while (cursor < entries.length && !cancelled()) {
            currentBatch++;
            const batch = entries.slice(cursor, cursor + batchSize);
            await runBatch(batch);
            cursor += batch.length;
            save();
        }
        const finalRows = rows();
        const state = cancelled() ? 'cancelled' : 'completed';
        save({ stage: state, currentBatch, estimatedRemainingMs: state === 'completed' ? 0 : undefined, totalBatches: currentBatch });
        saveRunResult(runId, { version: 1, kind: 'droptimizer', dps: finalRows[0]?.dps || baseline, error: 0, iterations: 0, elapsedSeconds: (Date.now() - started) / 1000, warnings: [], gear: [], damage: [], buffs: [], comparisons: finalRows, baselineDps: baseline });
        updateRun(runId, { status: state, reportPath: reports[0], summary: `${finalRows.filter(x => x.dps).length}/${finalRows.length} drops ranked against equipped gear${state === 'cancelled' ? ' (partial)' : ''}`, completedAt: new Date().toISOString() });
        return finalRows;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (cancelled()) {
            const partial = rows();
            save({ stage: 'cancelled', estimatedRemainingMs: undefined });
            saveRunResult(runId, { version: 1, kind: 'droptimizer', dps: partial[0]?.dps || baseline, error: 0, iterations: 0, elapsedSeconds: (Date.now() - started) / 1000, warnings: [], gear: [], damage: [], buffs: [], comparisons: partial, baselineDps: baseline });
            updateRun(runId, { status: 'cancelled', summary: `${partial.filter(x => x.dps).length}/${partial.length} drops ranked before cancellation`, completedAt: new Date().toISOString() });
            return partial;
        }
        save({ stage: 'failed', error: message });
        updateRun(runId, { status: 'failed', summary: message.slice(-2000), completedAt: new Date().toISOString() });
        throw error;
    }
}
