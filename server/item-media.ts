import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './db.js';
import { BlizzardClient } from './blizzard.js';

const root=join(paths.root,'catalog-media');
export async function localItemIcon(id:number) { const file=join(root,`${id}.png`); if(existsSync(file))return {file,mime:'image/png'}; mkdirSync(root,{recursive:true}); const media=await new BlizzardClient().itemMedia(id); const asset=media.assets?.find((x:any)=>x.key==='icon')||media.assets?.[0]; if(!asset?.value)throw new Error('Blizzard did not provide an icon asset for this item.'); const response=await fetch(asset.value);if(!response.ok)throw new Error(`Could not download item icon (${response.status}).`);const mime=response.headers.get('content-type')||'image/png';writeFileSync(file,Buffer.from(await response.arrayBuffer()));return {file,mime}; }
export function readLocalItemIcon(id:number) { const file=join(root,`${id}.png`);return existsSync(file)?readFileSync(file):undefined; }
