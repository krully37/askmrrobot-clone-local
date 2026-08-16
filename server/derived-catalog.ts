import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathsForCatalog } from './catalog.js';

interface DerivedItem { itemId:number; name?:string; iconFileDataId?:number; inventoryType?:number; classId?:number; subclassId?:number; handedness?:string; }
interface DerivedEnhancement { enchantId:number; name:string; iconFileDataId?:number; type:'enchant'; slots:string[]; status:'derived'; }
interface DerivedPackage { schema:number; status:'derived'; clientBuild:string; mapping:string; generatedAt:string; items:DerivedItem[]; journalDrops:{journalEncounterId:number;itemId:number;difficultyMask:number}[]; enhancements:DerivedEnhancement[]; tables:{name:string;checksum?:string;rows?:number;error?:string}[]; diagnostics?:string[]; }
interface SourceSeed { season:string; categories:{id:string;name:string;captureMode:string;tracks:string[]}[]; }

const defaultPackage=join(process.cwd(),'.localsimdash','catalog','db2-derived-variants.json');
const sourceSeedPath=join(process.cwd(),'data','current-season-source-categories.json');
const sourceSeed=():SourceSeed=>JSON.parse(readFileSync(sourceSeedPath,'utf8')) as SourceSeed;

function setup(db:Database.Database){
  db.exec(`CREATE TABLE IF NOT EXISTS source_categories (id TEXT PRIMARY KEY, season TEXT NOT NULL, name TEXT NOT NULL, capture_mode TEXT NOT NULL, tracks TEXT NOT NULL); CREATE TABLE IF NOT EXISTS derived_item_metadata (item_id INTEGER PRIMARY KEY, name TEXT, icon_file_data_id INTEGER, inventory_type INTEGER, class_id INTEGER, subclass_id INTEGER, handedness TEXT, client_build TEXT NOT NULL, generated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS derived_drop_presence (encounter_id INTEGER NOT NULL, item_id INTEGER NOT NULL, client_build TEXT NOT NULL, generated_at TEXT NOT NULL, PRIMARY KEY(encounter_id,item_id)); CREATE TABLE IF NOT EXISTS derived_enhancements (enchant_id INTEGER PRIMARY KEY, name TEXT NOT NULL, icon_file_data_id INTEGER, type TEXT NOT NULL, slots TEXT NOT NULL, client_build TEXT NOT NULL, generated_at TEXT NOT NULL, status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS catalog_build_diagnostics (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);`);
}

export function installDerivedCatalog(packagePath=defaultPackage){
  if(!existsSync(packagePath))return {installed:false,reason:'No DB2 derived package found.'};
  const value=JSON.parse(readFileSync(packagePath,'utf8')) as DerivedPackage;
  if(value.schema!==3||value.status!=='derived'||!Array.isArray(value.items)||!Array.isArray(value.enhancements))throw new Error('Unsupported DB2 derived package. Run catalog:db2:prefill again with the current tool.');
  const catalog=pathsForCatalog();
  if(!existsSync(catalog.catalogPath))return {installed:false,reason:'Refresh the Blizzard catalog before installing DB2 metadata.'};
  mkdirSync(catalog.staging,{recursive:true});
  const staged=join(catalog.staging,`derived-${Date.now()}.db`);
  copyFileSync(catalog.catalogPath,staged);
  const db=new Database(staged);
  try {
    setup(db);
    const item=db.prepare(`INSERT INTO derived_item_metadata (item_id,name,icon_file_data_id,inventory_type,class_id,subclass_id,handedness,client_build,generated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET name=excluded.name,icon_file_data_id=excluded.icon_file_data_id,inventory_type=excluded.inventory_type,class_id=excluded.class_id,subclass_id=excluded.subclass_id,handedness=excluded.handedness,client_build=excluded.client_build,generated_at=excluded.generated_at`);
    const itemHand=db.prepare(`UPDATE items SET handedness=? WHERE id=? AND ? != 'unknown'`);
    const enhancement=db.prepare(`INSERT INTO derived_enhancements (enchant_id,name,icon_file_data_id,type,slots,client_build,generated_at,status) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(enchant_id) DO UPDATE SET name=excluded.name,icon_file_data_id=excluded.icon_file_data_id,slots=excluded.slots,client_build=excluded.client_build,generated_at=excluded.generated_at,status=excluded.status`);
    const dropPresence=db.prepare(`INSERT OR REPLACE INTO derived_drop_presence (encounter_id,item_id,client_build,generated_at) SELECT id,?,?,? FROM encounters WHERE id=?`);
    const category=db.prepare(`INSERT INTO source_categories (id,season,name,capture_mode,tracks) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET season=excluded.season,name=excluded.name,capture_mode=excluded.capture_mode,tracks=excluded.tracks`);
    const saveDiagnostic=db.prepare(`INSERT INTO catalog_build_diagnostics (id,payload,updated_at) VALUES ('db2-derived',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`);
    const seed=sourceSeed();
    db.transaction(()=>{
      for(const row of value.items){
        item.run(row.itemId,row.name||null,row.iconFileDataId||null,row.inventoryType||null,row.classId||null,row.subclassId||null,row.handedness||'unknown',value.clientBuild,value.generatedAt);
        itemHand.run(row.handedness||'unknown',row.itemId,row.handedness||'unknown');
      }
      for(const row of value.journalDrops)dropPresence.run(row.itemId,value.clientBuild,value.generatedAt,row.journalEncounterId);
      for(const row of value.enhancements)enhancement.run(row.enchantId,row.name,row.iconFileDataId||null,row.type,JSON.stringify(row.slots||[]),value.clientBuild,value.generatedAt,row.status);
      for(const row of seed.categories)category.run(row.id,seed.season,row.name,row.captureMode,JSON.stringify(row.tracks));
      saveDiagnostic.run(JSON.stringify({clientBuild:value.clientBuild,mapping:value.mapping,generatedAt:value.generatedAt,tables:value.tables,items:value.items.length,journalDrops:value.journalDrops.length,enhancements:value.enhancements.length,diagnostics:value.diagnostics||[]}),new Date().toISOString());
    })();
    db.close();
    const backup=`${catalog.catalogPath}.previous`;
    if(existsSync(backup))unlinkSync(backup);
    renameSync(catalog.catalogPath,backup);
    renameSync(staged,catalog.catalogPath);
    const manifest=existsSync(catalog.manifestPath)?JSON.parse(readFileSync(catalog.manifestPath,'utf8')) as Record<string,unknown>:{};
    writeFileSync(catalog.manifestPath,JSON.stringify({...manifest,db2Derived:{clientBuild:value.clientBuild,mapping:value.mapping,generatedAt:value.generatedAt,items:value.items.length,journalDrops:value.journalDrops.length,enhancements:value.enhancements.length}},null,2));
    return {installed:true,items:value.items.length,journalDrops:value.journalDrops.length,enhancements:value.enhancements.length};
  } catch(error) {
    db.close();
    if(existsSync(staged))unlinkSync(staged);
    throw error;
  }
}

export function derivedCatalogHealth(){
  const catalog=pathsForCatalog();
  if(!existsSync(catalog.catalogPath))return {installed:false};
  const db=new Database(catalog.catalogPath,{readonly:true});
  try {
    const diagnostic=db.prepare(`SELECT payload FROM catalog_build_diagnostics WHERE id='db2-derived'`).get() as {payload:string}|undefined;
    const categories=db.prepare('SELECT id,name,capture_mode as captureMode,tracks FROM source_categories ORDER BY name').all().map((x:any)=>({...x,tracks:JSON.parse(x.tracks)}));
    const enhancementRows=db.prepare(`SELECT count(*) as total FROM derived_enhancements`).get() as {total:number};
    const dropRows=db.prepare(`SELECT count(*) as total FROM derived_drop_presence`).get() as {total:number};
    return {installed:Boolean(diagnostic),...(diagnostic?JSON.parse(diagnostic.payload):{}),categories,derivedEnhancements:enhancementRows.total,derivedDropMatches:dropRows.total};
  } finally { db.close(); }
}
