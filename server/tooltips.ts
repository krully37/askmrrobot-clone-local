import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './db.js';
import Database from 'better-sqlite3';

export interface TooltipLine { left?:string; right?:string; kind?:string; leftColor?:string; rightColor?:string; }
export interface CapturedTooltip { itemId:number; itemLevel?:number; bonusIds?:number[]; itemLink?:string; name?:string; quality?:number; lines:TooltipLine[]; clientBuild:string; capturedAt:string; }
const file=join(paths.root,'catalog','tooltip-captures.json');
const read=():CapturedTooltip[]=>existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
const identity=(value:Pick<CapturedTooltip,'itemId'|'itemLevel'|'bonusIds'>)=>`${value.itemId}|${value.itemLevel||''}|${[...(value.bonusIds||[])].sort((a,b)=>a-b).join('/')}`;

export function storeTooltips(values:CapturedTooltip[]){
  if(!values.length)return;
  const next=new Map(read().map(value=>[identity(value),value]));
  for(const value of values){
    if(!value.itemId||!Array.isArray(value.lines)||!value.lines.length)continue;
    next.set(identity(value),value);
  }
  mkdirSync(join(paths.root,'catalog'),{recursive:true});
  writeFileSync(file,JSON.stringify([...next.values()],null,2));
}

export function tooltipStatus(){
  const rows=read(), exact=new Set(rows.map(identity));
  return {captured:rows.length,exactVariants:exact.size,lastCapturedAt:rows.map(x=>x.capturedAt).sort().at(-1)};
}

export function resolveTooltip(query:{itemId:number;itemLevel?:number;bonusIds?:number[];fallback?:{name?:string;slot?:string;source?:string;enchant?:string;gems?:string[]}}){
  const rows=read(), wanted=identity(query);
  const exact=rows.find(value=>identity(value)===wanted);
  const sameItem=rows.filter(value=>value.itemId===query.itemId).sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
  const found=exact||sameItem;
  const fallback=query.fallback||{};
  let dbName = fallback.name;
  let db;
  try {
    db = new Database(join(paths.root, 'catalog', 'catalog.db'), {readonly: true});
    const meta = db.prepare('SELECT name FROM derived_item_metadata WHERE item_id=?').get(query.itemId) as any;
    if (meta && meta.name) dbName = meta.name;
  } catch (e) {} finally {
    if (db) db.close();
  }

  if(found)return {status:exact?'exact':'item-match',capture:found,lines:found.lines,name:found.name||dbName||`Item ${query.itemId}`,itemLevel:found.itemLevel||query.itemLevel,stale:false};
  const lines:TooltipLine[]=[
    {left:dbName||`Item ${query.itemId}`,kind:'name'},
    ...(query.itemLevel?[{left:`Item Level ${query.itemLevel}`,kind:'level'}]:[]),
    ...(fallback.slot?[{left:fallback.slot,kind:'slot'}]:[]),
    ...(fallback.enchant?[{left:`Enchantment: ${fallback.enchant}`,kind:'enchant'}]:[]),
    ...(fallback.gems?.map(gem=>({left:`Socketed: ${gem}`,kind:'gem'}))||[]),
    {left:'Item data is verified and ready for simulations.',kind:'missing'},
    {left:'(However, its live tooltip display has not been captured)',kind:'missing'},
    {left:'Use /lsdtooltips in WoW to capture it.',kind:'missing'},
  ];
  return {status:'missing',lines,name:dbName||`Item ${query.itemId}`,itemLevel:query.itemLevel,stale:false};
}
