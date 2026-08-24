import { watch } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { RESTART_AFTER_RUNTIME_UPDATE } from './runtime.js';

const root=process.cwd(); const tsx=resolve(root,'node_modules','tsx','dist','cli.mjs'); const vite=resolve(root,'node_modules','vite','bin','vite.js');
let api:ChildProcess|undefined; let stopping=false; let timer:NodeJS.Timeout|undefined;
function startApi() { api=spawn(process.execPath,[tsx,'server/index.ts'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,SIMC_RUNTIME_SUPERVISED:'1'}}); api.on('exit',code=>{ if(stopping)return; if(code===RESTART_AFTER_RUNTIME_UPDATE){ console.log('SimC nightly installed; restarting dashboard API.'); setTimeout(startApi,250); } else if(code&&code!==0) console.error(`Dashboard API exited with code ${code}. Edit a server file or restart npm run dev after resolving it.`); }); }
function restartForSourceChange() { if(timer)clearTimeout(timer); timer=setTimeout(()=>{ if(api&&!api.killed){api.once('exit',()=>startApi());api.kill();}else startApi(); },150); }
const viteProcess=spawn(process.execPath,[vite],{cwd:root,stdio:'inherit',windowsHide:true}); startApi();
for(const target of ['server']) { try { watch(resolve(root,target),{recursive:true},restartForSourceChange); } catch { /* Vite remains available if a platform cannot watch recursively. */ } }
function stop() { stopping=true; api?.kill(); viteProcess.kill(); }
process.on('SIGINT',stop);process.on('SIGTERM',stop);viteProcess.on('exit',code=>{stop();process.exitCode=code||0;});
