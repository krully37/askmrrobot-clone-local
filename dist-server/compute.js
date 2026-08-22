import { cpus } from 'node:os';
import { execFile } from 'node:child_process';
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
/** Windows does not expose load average. CIM is available on supported desktop Windows builds. */
async function windowsCpuUsage() {
    return await new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'], { windowsHide: true, timeout: 4000 }, (error, stdout) => {
        const value = Number(String(stdout).trim());
        resolve(!error && Number.isFinite(value) ? clamp(value, 0, 100) : undefined);
    }));
}
export async function computeCapacity() {
    const logicalCores = Math.max(1, cpus().length);
    const systemUsage = await windowsCpuUsage() ?? 0;
    const desktopReserve = Math.max(1, Math.ceil(logicalCores * 0.15));
    const normalCeiling = Math.max(1, logicalCores - desktopReserve);
    const pressureCeiling = systemUsage >= 80 ? Math.max(1, Math.floor(logicalCores * .4)) : systemUsage >= 60 ? Math.max(1, Math.floor(logicalCores * .65)) : normalCeiling;
    const maxSafeThreads = Math.min(normalCeiling, pressureCeiling);
    const recommendedThreads = Math.max(1, Math.min(maxSafeThreads, Math.max(1, Math.floor(logicalCores * .6))));
    const warning = systemUsage >= 80
        ? `System CPU use is ${Math.round(systemUsage)}%; SimC is limited to ${maxSafeThreads} threads until other workloads settle.`
        : systemUsage >= 60
            ? `System CPU use is ${Math.round(systemUsage)}%; the safe SimC limit was reduced to ${maxSafeThreads} threads.`
            : `Keeps ${desktopReserve} logical core${desktopReserve === 1 ? '' : 's'} available for Windows and other applications.`;
    return { logicalCores, systemUsage, recommendedThreads, maxSafeThreads, warning };
}
export async function safeThreads(requested) {
    const capacity = await computeCapacity();
    const requestedNumber = Number(requested);
    const desired = Number.isFinite(requestedNumber) && requestedNumber > 0 ? Math.floor(requestedNumber) : capacity.recommendedThreads;
    const threads = clamp(desired, 1, capacity.maxSafeThreads);
    return { threads, capacity, clamped: threads !== desired };
}
