import { buildCatalog } from './catalog-builder.js';
buildCatalog(progress => console.log(`[${progress.phase}] ${progress.completed}/${progress.total} ${progress.detail}`)).then(result => console.log(`Installed catalog ${result.version}`)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
