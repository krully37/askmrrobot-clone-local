import xlsx from 'xlsx';
import { writeFileSync } from 'fs';

const workbook = xlsx.readFile('rogue-mythic-dungeon-pool-hero-myth-stats.xlsx');
const dump = {};

for (const name of workbook.SheetNames) {
  dump[name] = xlsx.utils.sheet_to_json(workbook.Sheets[name]);
}

writeFileSync('spreadsheet-dump-all.json', JSON.stringify(dump, null, 2));
console.log('Dumped to spreadsheet-dump-all.json');
