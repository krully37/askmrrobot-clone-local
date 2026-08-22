import { BlizzardClient, blizzardConfig } from './server/blizzard.js';
async function test() {
  const client = new BlizzardClient(blizzardConfig());
  await client.authenticate();
  const item = await client.item(225575);
  console.log("Item Set:", item.item_set);
}
test().catch(console.error);
