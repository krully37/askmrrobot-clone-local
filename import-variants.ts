import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dump = JSON.parse(readFileSync('spreadsheet-dump-all.json', 'utf8'));
const db = new Database('.localsimdash/catalog/catalog.db');
const findEncounter = db.prepare('SELECT i.name as source, e.name as boss FROM loot_drops d JOIN encounters e ON d.encounter_id = e.id JOIN instances i ON e.instance_id = i.id WHERE d.item_id = ? LIMIT 1');

const records = [];
const seenKeys = new Set();

for (const sheetName of Object.keys(dump)) {
  if (sheetName === 'Notes') continue;
  
  const sheetData = dump[sheetName];
  if (sheetData.length < 2) continue;
  
  // Find the header row (it contains "Item ID" usually)
  let headerRowIndex = 0;
  for (let i = 0; i < sheetData.length; i++) {
    if (Object.values(sheetData[i]).includes('Item ID')) {
      headerRowIndex = i;
      break;
    }
  }
  
  const headers = sheetData[headerRowIndex];
  
  // Map internal keys to actual headers
  const keyToHeader = {};
  for (const key of Object.keys(headers)) {
    keyToHeader[key] = headers[key];
  }
  
  const trackNameBase = sheetName.split(' ')[0]; // 'Hero' or 'Myth'
  
  for (let i = headerRowIndex + 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    let itemId = null;
    let itemName = null;
    
    // Find Item ID and Name
    for (const key of Object.keys(row)) {
      const header = keyToHeader[key];
      if (header === 'Item ID') itemId = Number(row[key]);
      if (header === 'Item Name') itemName = row[key];
    }
    
    if (!itemId) continue;
    
    // Lookup source/boss
    const encounter = findEncounter.get(itemId);
    if (!encounter) {
      console.warn(`Could not find source/boss for item ID ${itemId} (${itemName})`);
      continue;
    }
    
    // Process each track column
    for (const key of Object.keys(row)) {
      const header = keyToHeader[key];
      if (!header) continue;
      
      const match = header.match(/(Hero|Myth) (\d\/\d)\s*\n*\(ilvl (\d+)\)/i);
      if (match) {
        const track = `${match[1]} ${match[2]}`; // e.g. "Hero 1/6"
        const itemLevel = Number(match[3]);
        
        const key = `${encounter.source}|${encounter.boss}|Mythic+|${itemId}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          records.push({
            source: encounter.source,
            boss: encounter.boss,
            difficulty: 'Mythic+',
            track: track,
            itemId: itemId,
            itemLevel: itemLevel,
            bonusIds: [],
            simcFragment: `id=${itemId},ilevel=${itemLevel}`,
            provenance: 'Spreadsheet import',
            capturedAt: new Date().toISOString(),
            clientBuild: '11.1.0'
          });
        }
      }
    }
  }
}

const seed = {
  version: "midnight-season-2-capture-2",
  season: "midnight-season-2",
  clientBuild: "11.1.0",
  records: records
};

writeFileSync('data/midnight-season-2-variants.json', JSON.stringify(seed, null, 2));
console.log(`Successfully generated ${records.length} variant records.`);
