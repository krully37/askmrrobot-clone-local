import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRun, getTopGearJob, paths, updateRun, saveRunResult, saveTopGearProgress, saveTopGearResults } from './db.js';
import { buildProfilesetInput } from './optimizer.js';
import { buildInput } from './profile.js';
import { execute, profileResults } from './runner.js';
import { topGearResult } from './results.js';
export async function runTopGearBatches(runId, rawProfile, plans, scenario, threads, onComplete) {
    const batchSize = 100;
    const batches = Array.from({ length: Math.ceil(plans.length / batchSize) }, (_, i) => plans.slice(i * batchSize, (i + 1) * batchSize));
    const started = Date.now();
    let results = [];
    let reports = [];
    const save = (patch) => { const elapsedMs = Date.now() - started; const completedProfiles = patch.completedProfiles ?? results.length; const rate = completedProfiles ? elapsedMs / completedProfiles : undefined; const progress = { stage: 'simulating', totalProfiles: plans.length, completedProfiles, currentBatch: Math.min(batches.length, Math.floor(completedProfiles / batchSize) + 1), totalBatches: batches.length, elapsedMs, estimatedRemainingMs: rate ? Math.max(0, (plans.length - completedProfiles) * rate) : undefined, partialResults: [...results].sort((a, b) => (b.dps || 0) - (a.dps || 0)).slice(0, 10), reports, lastProgressAt: new Date().toISOString(), ...patch }; saveTopGearProgress(runId, progress); saveTopGearResults(runId, results); return progress; };
    save({ stage: 'queued', currentBatch: 0 });
    updateRun(runId, { status: 'running' });
    try {
        for (let i = 0; i < batches.length; i++) {
            save({ currentBatch: i + 1 });
            const input = buildInput(buildProfilesetInput(rawProfile, batches[i]), scenario, threads);
            const result = await execute(runId, input, { suffix: `batch-${i + 1}`, finalize: false, onProgress: c => save({ completedProfiles: results.length + c }) });
            results = [...results, ...result.profilesets];
            reports.push(result.reportPath);
            save({ currentBatch: i + 1 });
        }
        const elapsedMs = Date.now() - started;
        save({ stage: 'completed', currentBatch: batches.length, estimatedRemainingMs: 0 });
        saveRunResult(runId, topGearResult(results, plans));
        updateRun(runId, { status: 'completed', reportPath: reports[0], summary: `${results.length}/${plans.length} Top Gear profiles completed`, completedAt: new Date().toISOString() });
        onComplete(results, elapsedMs);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cancelled = /cancel/i.test(message);
        save({ stage: cancelled ? 'cancelled' : 'failed', error: message });
        if (!cancelled)
            updateRun(runId, { status: 'failed', summary: message.slice(-2000), completedAt: new Date().toISOString() });
    }
}
/** Recover a fully written Top Gear batch after a local API restart.
 * SimC writes json2 before it exits, so this is safe even when the dashboard
 * process was restarted by the dev supervisor or a runtime update.
 */
export function recoverTopGearRun(runId) {
    const run = getRun(runId), job = getTopGearJob(runId);
    // Also repair older completed records created before SimC changed json2's
    // profileset layout; those have an empty stored result even though their
    // batch JSON is complete.
    if (!run || !job || !['queued', 'running', 'completed'].includes(run.status))
        return false;
    const prefix = `run-${runId}-batch-`;
    const jsonFiles = readdirSync(paths.reports, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.json'))
        .map(entry => join(paths.reports, entry.name));
    if (!jsonFiles.length)
        return false;
    const results = new Map();
    for (const file of jsonFiles) {
        try {
            for (const result of profileResults(JSON.parse(readFileSync(file, 'utf8'))))
                results.set(result.name, result);
        }
        catch { /* an in-progress json2 is ignored until complete */ }
    }
    if (!results.size)
        return false;
    const recovered = [...results.values()];
    const reports = jsonFiles.map(file => file.replace(/\.json$/i, '.html')).filter(existsSync);
    const completeNames = new Set(recovered.map(result => result.name));
    const complete = job.plans.every((plan) => completeNames.has(plan.name));
    const progress = { stage: complete ? 'completed' : 'failed', totalProfiles: job.plans.length, completedProfiles: recovered.length, currentBatch: Math.ceil(recovered.length / 100), totalBatches: Math.ceil(job.plans.length / 100), elapsedMs: 0, estimatedRemainingMs: complete ? 0 : undefined, partialResults: [...recovered].sort((a, b) => (b.dps || 0) - (a.dps || 0)).slice(0, 10), reports, error: complete ? undefined : 'The dashboard restarted before all Top Gear batches could be scheduled. Completed batches were retained.' };
    saveTopGearResults(runId, recovered);
    saveTopGearProgress(runId, progress);
    saveRunResult(runId, topGearResult(recovered, job.plans));
    updateRun(runId, { status: complete ? 'completed' : 'failed', reportPath: reports[0], summary: complete ? `${recovered.length}/${job.plans.length} Top Gear profiles completed` : `${recovered.length}/${job.plans.length} Top Gear profiles recovered; rerun to finish the remaining batches.`, completedAt: new Date().toISOString() });
    return true;
}
