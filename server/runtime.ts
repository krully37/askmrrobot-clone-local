import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, type Dirent } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { path7za } from '7zip-bin';
import { paths, readSettings } from './db.js';

const DOWNLOAD_PAGE = 'https://www.simulationcraft.org/download.html';
const RESTART_AFTER_RUNTIME_UPDATE = 75;
const UPDATE_CHECK_INTERVAL_HOURS = Number(process.env.SIMC_UPDATE_INTERVAL_HOURS) > 0 ? Number(process.env.SIMC_UPDATE_INTERVAL_HOURS) : 24;
const UPDATE_CHECK_INTERVAL_MS = UPDATE_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
const runtimeRoot = join(paths.root, 'runtime');
const buildsRoot = join(runtimeRoot, 'builds');
const stagingRoot = join(runtimeRoot, 'staging');
const statePath = join(runtimeRoot, 'runtime-state.json');

export { RESTART_AFTER_RUNTIME_UPDATE };

type Build = { id:string; url:string; version:string; hash?:string };
type BuildManifest = Build & { installedAt:string; executableVersion:string; archiveSha256:string; executableRelativePath:string };
type RuntimeState = {
  activeBuildId?:string; previousBuildId?:string;
  /** Installed and smoke-tested, but not yet active. Activating a build while
   * sims are running would swap the executable underneath them, so a build
   * found by the periodic check waits here until the next start. */
  pendingBuildId?:string;
  lastCheckedAt?:string;
  lastCheckResult?:'current'|'updated'|'fallback'|'error'|'pinned'|'staged'; lastError?:string;
};
export type RuntimeStatus = {
  path?:string; available:boolean; version:string; source:'managed'|'SIMC_PATH'|'legacy'|'none';
  buildId?:string; pendingBuildId?:string; lastCheckedAt?:string; lastCheckResult?:RuntimeState['lastCheckResult']; warning?:string;
};

function readJson<T>(path:string, fallback:T):T { try { return JSON.parse(readFileSync(path,'utf8')) as T; } catch { return fallback; } }
function state():RuntimeState { return readJson(statePath,{}); }
function saveState(next:RuntimeState) { mkdirSync(runtimeRoot,{recursive:true}); const temp=`${statePath}.tmp`; writeFileSync(temp,JSON.stringify(next,null,2)); renameSync(temp,statePath); }
function manifestPath(id:string) { return join(buildsRoot,id,'manifest.json'); }
function manifest(id?:string) { return id ? readJson<BuildManifest|undefined>(manifestPath(id),undefined) : undefined; }
function versionOutput(path:string) { const result=spawnSync(path,['version'],{windowsHide:true,encoding:'utf8',timeout:15000}); return `${result.stdout||''}${result.stderr||''}`.trim(); }
function firstVersionLine(output:string) { return output.split(/\r?\n/).find(line=>/SimulationCraft/i.test(line)) || output.split(/\r?\n/)[0] || 'unknown version'; }
function managedRuntime():RuntimeStatus|undefined {
  const s=state(), m=manifest(s.activeBuildId); if(!m) return undefined;
  const path=join(buildsRoot,m.id,m.executableRelativePath);
  if(!existsSync(path)) return undefined;
  return {path,available:true,version:m.executableVersion,source:'managed',buildId:m.id,pendingBuildId:s.pendingBuildId,lastCheckedAt:s.lastCheckedAt,lastCheckResult:s.lastCheckResult,
    warning:s.lastCheckResult==='fallback'?s.lastError:s.pendingBuildId?`SimC ${s.pendingBuildId} is installed and will activate when the dashboard restarts.`:undefined};
}
/** An explicitly chosen simc.exe, from settings or the environment. */
export function explicitSimcPath():string|undefined {
  const configured = readSettings().simcPath || process.env.SIMC_PATH;
  return configured && existsSync(configured) ? configured : undefined;
}
function configuredRuntime():RuntimeStatus|undefined {
  const configured = explicitSimcPath();
  if (!configured) return undefined;
  const s=state();
  // An explicit path wins over the managed build, so the dashboard is pinned to
  // whatever that executable is. Say so, because the alternative is a user who
  // believes nightly updates are running while their simc.exe never changes.
  return {path:configured,available:true,version:firstVersionLine(versionOutput(configured)),source:'SIMC_PATH',lastCheckedAt:s.lastCheckedAt,lastCheckResult:s.lastCheckResult,
    warning:s.lastCheckResult==='fallback'?s.lastError:'Automatic nightly updates are disabled because a SimC path is configured. Clear it to return to the managed runtime.'};
}
function fallbackRuntime():RuntimeStatus {
  const candidates=[join(process.cwd(),'runtime','simc.exe'),join(paths.root,'runtime','simc.exe')];
  const path=candidates.find(existsSync); const s=state();
  if(!path) return {available:false,version:'not installed',source:'none',lastCheckedAt:s.lastCheckedAt,lastCheckResult:s.lastCheckResult,warning:s.lastError};
  return {path,available:true,version:firstVersionLine(versionOutput(path)),source:'legacy',lastCheckedAt:s.lastCheckedAt,lastCheckResult:s.lastCheckResult,warning:s.lastCheckResult==='fallback'?s.lastError:undefined};
}
export function runtime():RuntimeStatus { return configuredRuntime() || managedRuntime() || fallbackRuntime(); }
export function runtimeStatus():RuntimeStatus { return runtime(); }

function updateCheckIsDue(s:RuntimeState, now=Date.now()) {
  if (!s.lastCheckedAt) return true;
  const lastChecked=Date.parse(s.lastCheckedAt);
  return !Number.isFinite(lastChecked) || now-lastChecked >= UPDATE_CHECK_INTERVAL_MS;
}

export async function smokeTest(path:string) { const output=await new Promise<string>((resolve,reject) => { const p=spawn(path,['version'],{windowsHide:true}); let text=''; p.stdout.on('data',d=>text+=d); p.stderr.on('data',d=>text+=d); p.on('error',reject); p.on('close',code=>code===0 || text.length ? resolve(text) : reject(new Error(`SimC exited ${code}`))); }); if(!/SimulationCraft/i.test(output)) throw new Error('SimC smoke test did not return a SimulationCraft version.'); return firstVersionLine(output); }
export function ensureReports() { mkdirSync(paths.reports,{recursive:true}); }

function discoverLinks(html:string, base=DOWNLOAD_PAGE) {
  const links:string[]=[]; const re=/href\s*=\s*["']([^"']+)["']/gi; let match:RegExpExecArray|null;
  while((match=re.exec(html))) { try { links.push(new URL(match[1],base).toString()); } catch { /* ignore malformed links */ } }
  return links;
}
/**
 * Nightly archives are named `simc-<major>.<minor>.<hash>-win64.7z` today and
 * `simc-<major>-<minor>-win64-<hash>.7z` historically. Both start with the two
 * numeric components, so they sort against each other.
 */
function buildOrder(id:string):[number,number] {
  const match=id.match(/^simc-(\d+)[.-](\d+)/i);
  return match?[Number(match[1]),Number(match[2])]:[-1,-1];
}
export function parseNightly(html:string, base=DOWNLOAD_PAGE):Build {
  const candidates=discoverLinks(html,base).filter(url=>/win64/i.test(url)&&/\.7z(?:$|[?#])/i.test(url));
  if(!candidates.length) throw new Error('The official SimC download page did not contain a Windows nightly .7z link.');
  const parsed=candidates.map((url):Build|undefined=>{
    const filename=decodeURIComponent(new URL(url).pathname.split('/').pop()||'');
    const match=filename.match(/^(simc-[^/]+?-win64(?:-[^./]+)?)(?:\.7z)$/i);
    if(!match) return undefined;
    const hash=filename.match(/(?:win64-|\.)([a-f0-9]{7,40})(?:\.7z)?$/i)?.[1];
    return {id:match[1],url,version:match[1],hash};
  }).filter((build):build is Build=>Boolean(build));
  if(!parsed.length) {
    const filename=decodeURIComponent(new URL(candidates[0]).pathname.split('/').pop()||'');
    throw new Error(`The official SimC nightly filename was not recognized: ${filename}`);
  }
  // The download page currently links the index pre-sorted by date descending,
  // so the first entry is usually newest. Comparing parsed versions removes the
  // dependency on that query string surviving upstream.
  return parsed.reduce((best,build)=>{
    const [bestMajor,bestMinor]=buildOrder(best.id), [major,minor]=buildOrder(build.id);
    return major>bestMajor||(major===bestMajor&&minor>bestMinor)?build:best;
  });
}
export async function discoverLatest(fetcher:typeof fetch=fetch):Promise<Build> {
  const response=await fetcher(DOWNLOAD_PAGE,{headers:{'user-agent':'Local-Sim-Dashboard/0.1'}});
  if(!response.ok) throw new Error(`Official SimC download page returned HTTP ${response.status}.`);
  const page=await response.text(); const nightlyIndex=discoverLinks(page).find(url=>/downloads\.simulationcraft\.org/i.test(url)&&/\/nightly\/?/i.test(new URL(url).pathname));
  if(!nightlyIndex) throw new Error('The official SimC download page did not link to the nightly build index.');
  const listing=await fetcher(nightlyIndex,{headers:{'user-agent':'Local-Sim-Dashboard/0.1'}});
  if(!listing.ok) throw new Error(`Official SimC nightly index returned HTTP ${listing.status}.`);
  return parseNightly(await listing.text(),nightlyIndex);
}
async function download(url:string,target:string,fetcher:typeof fetch) {
  const response=await fetcher(url,{headers:{'user-agent':'Local-Sim-Dashboard/0.1'}});
  if(!response.ok) throw new Error(`SimC nightly download returned HTTP ${response.status}.`);
  const bytes=Buffer.from(await response.arrayBuffer()); if(bytes.length<1024) throw new Error('SimC nightly download was unexpectedly small.');
  writeFileSync(target,bytes); return createHash('sha256').update(bytes).digest('hex');
}
async function extract(archive:string,target:string) { if(!existsSync(path7za))throw new Error(`Bundled 7-Zip executable is missing: ${path7za}`);const result=spawnSync(path7za,['x','-y',`-o${target}`,archive],{windowsHide:true,encoding:'utf8',timeout:120_000});const output=`${result.stdout||''}${result.stderr||''}`.trim();if(result.error){const error=result.error as Error & {code?:string};throw new Error(`7-Zip could not start (${error.code||error.name}): ${error.message}`);}if(result.status!==0)throw new Error(`7-Zip extraction failed (${result.status}): ${output.slice(-500)}`); }
function findSimc(root:string):string|undefined { const stack=[root]; while(stack.length) { const current=stack.pop()!; for(const entry of readdirSync(current,{withFileTypes:true}) as Dirent[]) { const child=join(current,entry.name); if(entry.isDirectory())stack.push(child); else if(entry.isFile()&&entry.name.toLowerCase()==='simc.exe')return child; } } }
async function installBuild(build:Build,fetcher:typeof fetch) {
  mkdirSync(stagingRoot,{recursive:true}); mkdirSync(buildsRoot,{recursive:true});
  const stage=join(stagingRoot,`${build.id}-${Date.now()}`); const archive=join(stage,'nightly.7z'); const extracted=join(stage,'extracted');
  mkdirSync(stage,{recursive:true});
  try {
    const archiveSha256=await download(build.url,archive,fetcher); await extract(archive,extracted);
    const executable=findSimc(extracted); if(!executable) throw new Error('The SimC archive did not contain simc.exe.');
    const executableVersion=await smokeTest(executable); const finalDir=join(buildsRoot,build.id);
    if(existsSync(finalDir)) { const existing=manifest(build.id); if(existing) return existing; throw new Error(`Managed build directory already exists without a manifest: ${finalDir}`); }
    const relativeExecutable=executable.slice(extracted.length+1); const buildManifest:BuildManifest={...build,installedAt:new Date().toISOString(),executableVersion,archiveSha256,executableRelativePath:relativeExecutable};
    writeFileSync(join(extracted,'manifest.json'),JSON.stringify(buildManifest,null,2));
    // Windows can hold a just-smoke-tested executable briefly, making a directory rename fail with EPERM.
    // Copying into a new immutable build directory is safe because activation is the subsequent state-pointer write.
    cpSync(extracted,finalDir,{recursive:true,errorOnExist:true}); return buildManifest;
  } finally { if(existsSync(stage)) rmSync(stage,{recursive:true,force:true}); }
}

function recordFailure(label:string, error:unknown, available:boolean) {
  const message=`${label}: ${error instanceof Error?error.message:String(error)}`;
  saveState({...state(),lastCheckedAt:new Date().toISOString(),lastCheckResult:available?'fallback':'error',lastError:message});
  return message;
}
function activate(buildId:string) {
  const old=state();
  saveState({...old,activeBuildId:buildId,previousBuildId:old.activeBuildId&&old.activeBuildId!==buildId?old.activeBuildId:old.previousBuildId,
    pendingBuildId:undefined,lastCheckedAt:new Date().toISOString(),lastCheckResult:'updated',lastError:undefined});
  pruneBuilds();
}
/**
 * Keep only the active, previous and pending builds. Every other nightly is a
 * few hundred megabytes that nothing can reach again.
 */
export function pruneBuilds() {
  if(!existsSync(buildsRoot)) return;
  const s=state(); const keep=new Set([s.activeBuildId,s.previousBuildId,s.pendingBuildId].filter(Boolean) as string[]);
  for(const entry of readdirSync(buildsRoot,{withFileTypes:true}) as Dirent[]) {
    if(!entry.isDirectory()||keep.has(entry.name)) continue;
    // A build still held open by a running sim is simply retried next time.
    try { rmSync(join(buildsRoot,entry.name),{recursive:true,force:true}); } catch { /* retried on the next update */ }
  }
}
/** Return to the build that was active before the most recent update. */
export function rollbackRuntime():RuntimeStatus {
  const s=state(); const target=s.previousBuildId, previous=target?manifest(target):undefined;
  if(!target||!previous) throw new Error('No previous SimC build is available to roll back to.');
  if(!existsSync(join(buildsRoot,previous.id,previous.executableRelativePath))) throw new Error(`The previous SimC build is no longer on disk: ${target}`);
  saveState({...s,activeBuildId:target,previousBuildId:s.activeBuildId,pendingBuildId:undefined,lastCheckResult:'current',lastError:undefined});
  return runtime();
}
/**
 * Install the newest nightly without activating it. Swapping the executable
 * while sims are running would change the engine underneath them, so a build
 * discovered while the dashboard is up waits for the next start.
 */
export async function stageUpdate(fetcher:typeof fetch=fetch):Promise<string|undefined> {
  if(explicitSimcPath()) return undefined;
  if(!updateCheckIsDue(state())) return undefined;
  let latest:Build;
  try { latest=await discoverLatest(fetcher); } catch(error) { recordFailure('Nightly check failed',error,runtime().available); return undefined; }
  const s=state();
  if(latest.id===s.activeBuildId||latest.id===s.pendingBuildId) {
    saveState({...s,lastCheckedAt:new Date().toISOString(),lastCheckResult:'current',lastError:undefined});
    return undefined;
  }
  try {
    const installed=await installBuild(latest,fetcher);
    saveState({...state(),pendingBuildId:installed.id,lastCheckedAt:new Date().toISOString(),lastCheckResult:'staged',lastError:undefined});
    return installed.id;
  } catch(error) { recordFailure('Nightly update failed',error,runtime().available); return undefined; }
}
/** Keep checking for nightlies while the dashboard stays open. */
export function scheduleRuntimeUpdates(fetcher:typeof fetch=fetch) {
  const timer=setInterval(()=>{ void stageUpdate(fetcher).then(id=>{ if(id) console.log(`Staged SimC ${id}; it activates on the next dashboard start.`); }); }, UPDATE_CHECK_INTERVAL_MS);
  timer.unref();
  return ()=>clearInterval(timer);
}

export async function ensureCurrentRuntime(fetcher:typeof fetch=fetch):Promise<{updated:boolean; status:RuntimeStatus}> {
  // An explicit simc.exe already wins in runtime(), so downloading nightlies
  // that can never be selected only burns bandwidth and disk.
  if (explicitSimcPath()) {
    saveState({...state(),lastCheckedAt:new Date().toISOString(),lastCheckResult:'pinned',lastError:undefined});
    return {updated:false,status:runtime()};
  }
  const pendingId=state().pendingBuildId, pending=pendingId?manifest(pendingId):undefined;
  if (pending && existsSync(join(buildsRoot,pending.id,pending.executableRelativePath))) { activate(pending.id); return {updated:true,status:runtime()}; }
  const before=runtime(), existingState=state();
  if (before.available && !updateCheckIsDue(existingState)) return {updated:false,status:before};
  let latest:Build;
  try { latest=await discoverLatest(fetcher); } catch(error) {
    const message=recordFailure('Nightly check failed',error,before.available);
    if(!before.available) throw new Error(`${message} No usable local SimulationCraft runtime is configured.`);
    return {updated:false,status:runtime()};
  }
  const current=manifest(state().activeBuildId);
  if(current?.id===latest.id) { const s=state(); saveState({...s,lastCheckedAt:new Date().toISOString(),lastCheckResult:'current',lastError:undefined}); return {updated:false,status:runtime()}; }
  try {
    const installed=await installBuild(latest,fetcher); activate(installed.id);
    return {updated:true,status:runtime()};
  } catch(error) {
    const message=recordFailure('Nightly update failed',error,before.available);
    if(!before.available) throw new Error(`${message} No usable local SimulationCraft runtime is configured.`);
    return {updated:false,status:runtime()};
  }
}
