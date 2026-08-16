import { loadSeasonManifest } from './catalog-builder.js';
import { catalogHasDiscoveredDrop } from './catalog.js';
import { loadVariantSeed, validateVariantSeed, variantSeedPath } from './variants.js';

try {
  const season=loadSeasonManifest(), seed=loadVariantSeed();
  validateVariantSeed(seed,season.season,catalogHasDiscoveredDrop,true);
  console.log(`Variant seed ${seed.version} is valid against the active local catalog: ${seed.records.length} verified records.`);
} catch(error) {
  console.error(`Variant seed validation failed (${variantSeedPath()}): ${error instanceof Error?error.message:String(error)}`);
  process.exitCode=1;
}
