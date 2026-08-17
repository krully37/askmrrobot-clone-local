import { BlizzardClient } from './server/blizzard.js';
import { readFileSync, existsSync } from 'fs';
if(existsSync('.env')){
  readFileSync('.env','utf8').split('\n').forEach(line=>{
    const m=line.match(/^([^=]+)=(.*)$/);
    if(m)process.env[m[1].trim()]=m[2].trim();
  });
}

const client = new BlizzardClient();
const powers = [
  "Void-Touched Orbs", "Unleashed Fire",
  "Self-Mending", "Void-Tainted Shell", "Lynxlike Reflexes",
  "Lingering",
  "Critical Power", "Burning Haste", "Masterful Cunning", "The Versatile Warrior",
  "Overload", "Residual Energy", "Echoes"
];

async function run() {
  for(let id=1279600; id<=1279620; id++){
    try { const s = await client.spell(id); console.log(id, s.name.en_US); } catch(e){}
  }
  for(let id=1287400; id<=1287430; id++){
    try { const s = await client.spell(id); console.log(id, s.name.en_US); } catch(e){}
  }
  for(let id=1286960; id<=1286980; id++){
    try { const s = await client.spell(id); console.log(id, s.name.en_US); } catch(e){}
  }
}

run();
