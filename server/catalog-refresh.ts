import { configured } from './blizzard.js';
import { buildCatalog, type BuildProgress } from './catalog-builder.js';
import { installDerivedCatalog } from './derived-catalog.js';
import { reapplyCaptureOverlay } from './captures.js';
import { beginCatalogRefresh, completeCatalogRefresh, failCatalogRefresh, restoreCatalogLifecycle, updateCatalogProgress } from './catalog-lifecycle.js';

type RefreshState={status:'idle'|'running'|'completed'|'failed';progress?:BuildProgress;startedAt?:string;completedAt?:string;error?:string;version?:string};
let state:RefreshState=(()=>{const saved=restoreCatalogLifecycle();return {status:saved.status,startedAt:saved.lastAttemptAt,completedAt:saved.completedAt,error:saved.error,version:saved.version,progress:saved.progress};})();
export function refreshStatus(){return {configured:configured(),...state};}
export function refreshCatalog(){if(state.status==='running')throw new Error('A catalog refresh is already running.');const saved=beginCatalogRefresh();state={status:'running',startedAt:saved.lastAttemptAt,progress:saved.progress};buildCatalog(progress=>{state={...state,progress};updateCatalogProgress(progress);}).then(result=>{const captures=reapplyCaptureOverlay(),derived=installDerivedCatalog(),progress={phase:'local-overlays',completed:1,total:1,detail:`Reapplied ${captures.verified} local captures; ${derived.installed?'DB2 metadata installed':derived.reason||'DB2 metadata unavailable'}`};const done=completeCatalogRefresh({version:result.version,checksum:String(result.manifest.checksum||''),progress});state={status:'completed',startedAt:done.lastAttemptAt,completedAt:done.completedAt,version:result.version,progress};}).catch(error=>{const failed=failCatalogRefresh(error instanceof Error?error.message:String(error));state={status:'failed',startedAt:failed.lastAttemptAt,completedAt:failed.completedAt,error:failed.error};});return refreshStatus();}
