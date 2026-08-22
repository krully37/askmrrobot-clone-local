const DB=require('better-sqlite3');
const db=new DB('.localsimdash/catalog/catalog.db');
console.log("derived_item_metadata schema:", db.prepare("PRAGMA table_info(derived_item_metadata)").all());
console.log("item_sets schema:", db.prepare("PRAGMA table_info(item_sets)").all());
console.log("item_sets count:", db.prepare("SELECT count(*) FROM item_sets").get());
console.log("items schema:", db.prepare("PRAGMA table_info(items)").all());
