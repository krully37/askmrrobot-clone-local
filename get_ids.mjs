import Database from 'better-sqlite3';

const db = new Database('.localsimdash/catalog/catalog.db');
const e = db.prepare("SELECT id,type,name FROM enhancements WHERE current_season=1 AND review_status='reviewed' AND db2_status='matched' AND simc_validation='syntax-valid'").all();
const items = db.prepare('SELECT item_id,icon_file_data_id FROM derived_item_metadata').all();
const enchants = db.prepare('SELECT enchant_id,icon_file_data_id FROM derived_enhancements').all();
const iMap = new Map(items.map(x=>[x.item_id,x.icon_file_data_id]));
const eMap = new Map(enchants.map(x=>[x.enchant_id,x.icon_file_data_id]));

const res = new Map(); // fileDataId -> name(s)
for(const r of e) {
  const p = Number(r.id.split('-')[1]);
  let i;
  if (r.type === 'gem') i = iMap.get(p);
  else i = eMap.get(p);
  
  if (i) {
    if (!res.has(i)) res.set(i, new Set());
    res.get(i).add(r.name);
  }
}

for (const [id, names] of res.entries()) {
  console.log(`${id} - ${[...names].join(', ')}`);
}
