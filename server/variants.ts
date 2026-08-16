import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface VariantSeedRecord {
  source:string; boss:string; difficulty:string; track?:string; itemId:number; itemLevel:number;
  bonusIds?:number[]; simcFragment:string; provenance:string; capturedAt:string; clientBuild:string;
}
export interface VariantSeed { version:string; season:string; clientBuild:string; records:VariantSeedRecord[]; }
const path=join(process.cwd(),'data','midnight-season-2-variants.json');
export function variantSeedPath(){return path;}
export function loadVariantSeed(file=path):VariantSeed {
  if(!existsSync(file))throw new Error(`Variant seed not found: ${file}`);
  const seed=JSON.parse(readFileSync(file,'utf8')) as VariantSeed;
  if(!seed.version||!seed.season||!Array.isArray(seed.records))throw new Error('Variant seed must include version, season, and records.');
  return seed;
}
export function validateVariantSeed(seed:VariantSeed, season:string, resolve:(source:string,boss:string,itemId:number,difficulty:string)=>boolean, requireCoverage=false) {
  if(seed.season!==season)throw new Error(`Variant seed season '${seed.season}' does not match active season '${season}'.`);
  const seen=new Set<string>();
  for(const record of seed.records){
    const key=[record.source,record.boss,record.difficulty,record.itemId].join('|');
    if(seen.has(key))throw new Error(`Variant seed contains duplicate record: ${key}.`); seen.add(key);
    if(!record.source||!record.boss||!record.difficulty||!Number.isInteger(record.itemId)||record.itemId<=0||!Number.isInteger(record.itemLevel)||record.itemLevel<=0)throw new Error(`Variant seed record '${key}' is incomplete.`);
    if(!record.provenance||!record.capturedAt||!record.clientBuild)throw new Error(`Variant seed record '${key}' is missing capture provenance.`);
    if(Number.isNaN(new Date(record.capturedAt).getTime()))throw new Error(`Variant seed record '${key}' has an invalid capture timestamp.`);
    if(record.bonusIds&&(!Array.isArray(record.bonusIds)||record.bonusIds.some(value=>!Number.isInteger(value)||value<0)))throw new Error(`Variant seed record '${key}' has invalid bonus IDs.`);
    if(!new RegExp(`(?:^|,)id=${record.itemId}(?:,|$)`).test(record.simcFragment)||!new RegExp(`(?:^|,)ilevel=${record.itemLevel}(?:,|$)`).test(record.simcFragment))throw new Error(`Variant seed record '${key}' must contain matching id and ilevel SimC fields.`);
    if(!resolve(record.source,record.boss,record.itemId,record.difficulty))throw new Error(`Variant seed record '${key}' does not match a discovered season drop.`);
  }
  if(requireCoverage&&!seed.records.length)throw new Error('Variant seed has no verified records. Capture Encounter Journal links before building a simmable catalog.');
}
export function installVariants(db:Database.Database, seed:VariantSeed, season:string) {
  const findEncounter=db.prepare('SELECT e.id FROM encounters e JOIN instances i ON i.id=e.instance_id WHERE i.name=? AND e.name=?');
  const findDrop=db.prepare('SELECT 1 FROM loot_drops WHERE encounter_id=? AND item_id=? AND difficulty=?');
  validateVariantSeed(seed,season,(source,boss,itemId,difficulty)=>{const row=findEncounter.get(source,boss) as {id:number}|undefined;return Boolean(row&&findDrop.get(row.id,itemId,difficulty));});
  const insert=db.prepare('INSERT OR REPLACE INTO item_variants (id,item_id,encounter_id,season,difficulty,track,item_level,bonus_ids,simc_fragment,provenance,captured_at,client_build,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const record of seed.records){const row=findEncounter.get(record.source,record.boss) as {id:number};const track=record.track||'';insert.run(`${season}:${row.id}:${record.difficulty}:${track}:${record.itemId}`,record.itemId,row.id,season,record.difficulty,track,record.itemLevel,JSON.stringify(record.bonusIds||[]),record.simcFragment,record.provenance,record.capturedAt,record.clientBuild,'verified');}
}
