import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './db.js';
import { BlizzardClient, configured } from './blizzard.js';

export interface ItemIcon { bytes:Buffer; mime:string }

const root=join(paths.root,'catalog-media');
/** The formats the icon sources actually serve, probed in this order on disk. */
const mimes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
const extensionFor=(mime:string)=>Object.keys(mimes).find(extension=>mimes[extension]===mime);
/** An icon is a few kilobytes; anything larger is a wrong answer, not art. */
const MAX_BYTES=2*1024*1024;

/**
 * Icon art for an item id never changes, so a cached file is authoritative and
 * the network is touched at most once per item for the life of the install.
 * The extension is whatever the source sent, because the old code saved JPEG
 * bytes into a .png and then served them as image/png.
 */
function fromDisk(id:number):ItemIcon|undefined {
  for(const [extension,mime] of Object.entries(mimes)){
    const file=join(root,`${id}.${extension}`);
    if(existsSync(file))return {bytes:readFileSync(file),mime};
  }
  return undefined;
}

/**
 * Every outbound call is bounded. A source that accepts the connection and then
 * stalls would otherwise hold the Express response open, and a gear board opens
 * dozens of these at once.
 */
const REQUEST_TIMEOUT_MS=8000;
const request=(url:string)=>fetch(url,{signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),headers:{'user-agent':'local-sim-dashboard'}});

async function download(url:string):Promise<ItemIcon|undefined>{
  const response=await request(url);
  if(!response.ok)return undefined;
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  // A CDN answers a missing icon with an HTML error page, which must not be
  // cached to disk as though it were the item's art.
  if(!extensionFor(mime))return undefined;
  const bytes=Buffer.from(await response.arrayBuffer());
  return bytes.length&&bytes.length<=MAX_BYTES?{bytes,mime}:undefined;
}

/**
 * One shared client, because a gear board asks for dozens of icons at once and
 * the old code built a fresh BlizzardClient per icon, paying a full OAuth round
 * trip every time and inviting rate limiting.
 */
let blizzard:BlizzardClient|undefined;

async function fromBlizzard(id:number):Promise<ItemIcon|undefined>{
  if(!configured())return undefined;
  try {
    blizzard=blizzard||new BlizzardClient();
    const media=await blizzard.itemMedia(id);
    const asset=media.assets?.find((x:any)=>x.key==='icon')||media.assets?.[0];
    return asset?.value?await download(String(asset.value)):undefined;
  } catch {
    // The cached OAuth token expires after a day and a stale one fails every
    // later request, so drop the client and authenticate again next time.
    blizzard=undefined;
    return undefined;
  }
}

/** A slug names a file on the CDN, so reject anything that is not a plain name. */
const slugPattern=/^[a-z0-9_-]+$/;

/**
 * Blizzard's Game Data API needs credentials that most installs never set, and
 * without a second source every gear icon on the board was a 404. Wowhead's
 * tooltip endpoint is public and answers with the icon slug, which names a file
 * on the public icon CDN. Only the item id leaves the machine, and only until
 * the icon lands in the on-disk cache above.
 */
async function fromPublicCdn(id:number):Promise<ItemIcon|undefined>{
  try {
    const response=await request(`https://nether.wowhead.com/tooltip/item/${id}?dataEnv=1&locale=0`);
    if(!response.ok)return undefined;
    const slug=String((await response.json() as {icon?:string}).icon||'').toLowerCase();
    if(!slugPattern.test(slug))return undefined;
    return await download(`https://wow.zamimg.com/images/wow/icons/large/${slug}.jpg`);
  } catch {
    return undefined;
  }
}

/**
 * How long a failed lookup is remembered. Short enough that a dropped
 * connection heals on its own, long enough that one render of the gear board
 * does not retry every missing icon.
 */
const MISS_TTL_MS=10*60*1000;
const misses=new Map<number,number>();
const inFlight=new Map<number,Promise<ItemIcon|undefined>>();

async function resolve(id:number):Promise<ItemIcon|undefined>{
  const icon=await fromBlizzard(id)??await fromPublicCdn(id);
  if(!icon){misses.set(id,Date.now());return undefined;}
  misses.delete(id);
  mkdirSync(root,{recursive:true});
  writeFileSync(join(root,`${id}.${extensionFor(icon.mime)}`),icon.bytes);
  return icon;
}

export async function itemIcon(id:number):Promise<ItemIcon|undefined>{
  if(!Number.isInteger(id)||id<=0)return undefined;
  const cached=fromDisk(id);
  if(cached)return cached;
  const missedAt=misses.get(id);
  if(missedAt!==undefined&&Date.now()-missedAt<MISS_TTL_MS)return undefined;
  // The board requests the same id from several views at once, so collapse
  // duplicates onto one lookup rather than racing writes to the same file.
  const existing=inFlight.get(id);
  if(existing)return existing;
  const pending=resolve(id).finally(()=>inFlight.delete(id));
  inFlight.set(id,pending);
  return pending;
}
