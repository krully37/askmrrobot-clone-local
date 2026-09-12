import { watch } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { RESTART_AFTER_RUNTIME_UPDATE } from './runtime.js';
import { DEFAULT_UI_PORT, findAvailablePort, requestedApiPort } from './ports.js';

const root=process.cwd();
const tsx=resolve(root,'node_modules','tsx','dist','cli.mjs');
const vite=resolve(root,'node_modules','vite','bin','vite.js');

/** Give up after this many crashes with no stable run in between. */
const MAX_CRASH_RESTARTS=5;
/** A process that stayed up this long counts as healthy, so the streak resets. */
const STABLE_RUN_MS=10_000;

let api:ChildProcess|undefined;
let stopping=false;
let timer:NodeJS.Timeout|undefined;
let crashes=0;
let apiStartedAt=0;
let apiPort=requestedApiPort();

function startApi() {
  apiStartedAt=Date.now();
  api=spawn(process.execPath,[tsx,'server/index.ts'],{
    cwd:root,stdio:'inherit',windowsHide:true,
    env:{...process.env,SIMC_RUNTIME_SUPERVISED:'1',LOCALSIMDASH_PORT:String(apiPort)}
  });
  api.on('exit',code=>{
    if(stopping) return;
    if(code===RESTART_AFTER_RUNTIME_UPDATE) {
      console.log('SimC nightly installed; restarting dashboard API.');
      crashes=0;
      setTimeout(startApi,250);
      return;
    }
    if(!code) return;
    // A crash used to leave the API dead while Vite kept serving, so the open
    // dashboard answered every request with a connection error and the only way
    // back was restarting by hand.
    if(Date.now()-apiStartedAt>STABLE_RUN_MS) crashes=0;
    crashes++;
    if(crashes>MAX_CRASH_RESTARTS) {
      console.error(`Dashboard API exited with code ${code} and has now failed ${crashes} times without staying up. Not restarting again; fix the error above and restart npm run dev.`);
      return;
    }
    const delay=Math.min(500*2**(crashes-1),8000);
    console.error(`Dashboard API exited with code ${code}. Restarting in ${delay/1000}s (attempt ${crashes} of ${MAX_CRASH_RESTARTS}).`);
    setTimeout(startApi,delay);
  });
}

function restartForSourceChange() {
  if(timer) clearTimeout(timer);
  timer=setTimeout(()=>{
    crashes=0;
    if(api&&!api.killed){api.once('exit',()=>startApi());api.kill();}
    else startApi();
  },150);
}

let viteProcess:ChildProcess|undefined;
function stop() { stopping=true; api?.kill(); viteProcess?.kill(); }

async function main() {
  // Resolve both ports before anything binds, so the API and the proxy that
  // forwards to it can never end up pointing at different places.
  const requested=requestedApiPort();
  apiPort=await findAvailablePort(requested);
  if(apiPort!==requested) console.log(`Port ${requested} is already in use; the dashboard API will use ${apiPort} instead.`);

  const uiPort=await findAvailablePort(DEFAULT_UI_PORT);
  if(uiPort!==DEFAULT_UI_PORT) console.log(`Port ${DEFAULT_UI_PORT} is already in use; the dashboard UI will use ${uiPort} instead.`);

  viteProcess=spawn(process.execPath,[vite,'--port',String(uiPort),'--strictPort'],{
    cwd:root,stdio:'inherit',windowsHide:true,
    env:{...process.env,LOCALSIMDASH_PORT:String(apiPort)}
  });
  viteProcess.on('exit',code=>{stop();process.exitCode=code||0;});

  startApi();
  console.log(`Open the dashboard at http://localhost:${uiPort}`);

  for(const target of ['server','tsconfig.json']) {
    try { watch(resolve(root,target),{recursive:target==='server'},restartForSourceChange); }
    catch { /* Vite remains available if a platform cannot watch recursively. */ }
  }
}

process.on('SIGINT',stop);
process.on('SIGTERM',stop);
main().catch(error=>{console.error(`Dashboard failed to start: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});
