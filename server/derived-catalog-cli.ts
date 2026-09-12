import { installDerivedCatalog, installSourceCategories } from './derived-catalog.js';
import { installEnhancementSeed } from './enhancements.js';

try {
  const seeded = installSourceCategories();
  console.log(`Seeded ${seeded.categories} ${seeded.season} source categories.`);
  const result = installDerivedCatalog();
  if (!result.installed) {
    console.error(`DB2 derived catalog was not installed: ${result.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`Installed ${(result.items ?? 0).toLocaleString()} local DB2 items, ${(result.journalDrops ?? 0).toLocaleString()} Journal links, and ${(result.enhancements ?? 0).toLocaleString()} enhancement proposals.`);
    const enhancements=installEnhancementSeed();
    console.log(`Reconciled ${enhancements.matched}/${enhancements.count} reviewed enhancement mappings; ${enhancements.named} now use local DB2 display names.`);
  }
} catch (error) {
  console.error(`DB2 derived catalog install failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
