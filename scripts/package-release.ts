import { cpSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const releaseDir = join(process.cwd(), 'release');
if (existsSync(releaseDir)) {
  rmSync(releaseDir, { recursive: true, force: true });
}
mkdirSync(releaseDir);

console.log('Packaging release...');

// 1. Copy dist and dist-server
cpSync(join(process.cwd(), 'dist'), join(releaseDir, 'dist'), { recursive: true });
cpSync(join(process.cwd(), 'dist-server'), join(releaseDir, 'dist-server'), { recursive: true });

// 2. Copy data folder
cpSync(join(process.cwd(), 'data'), join(releaseDir, 'data'), { recursive: true });

// 3. Copy .localsimdash but exclude large logs/reports
const localDashSrc = join(process.cwd(), '.localsimdash');
const localDashDest = join(releaseDir, '.localsimdash');
mkdirSync(localDashDest);
const itemsToCopy = ['catalog', 'runtime', 'settings.json'];
for (const item of itemsToCopy) {
  const src = join(localDashSrc, item);
  if (existsSync(src)) {
    cpSync(src, join(localDashDest, item), { recursive: true });
  }
}

// 4. Clean package.json for production
const pkgRaw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
const pkg = JSON.parse(pkgRaw);
delete pkg.devDependencies;
delete pkg.scripts.dev;
delete pkg.scripts.test;
delete pkg.scripts['build:server'];
delete pkg.scripts['build:prod'];
writeFileSync(join(releaseDir, 'package.json'), JSON.stringify(pkg, null, 2));

// 5. Create start scripts
const startBat = `@echo off
echo Installing production dependencies...
call npm install --omit=dev
echo Starting Local Sim Dashboard...
node dist-server/index.js
pause
`;
writeFileSync(join(releaseDir, 'start.bat'), startBat);

const startSh = `#!/bin/bash
echo "Installing production dependencies..."
npm install --omit=dev
echo "Starting Local Sim Dashboard..."
node dist-server/index.js
`;
writeFileSync(join(releaseDir, 'start.sh'), startSh);

console.log('Release package created in ./release');
