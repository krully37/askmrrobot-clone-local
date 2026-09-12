/**
 * better-sqlite3 ships a compiled binary per ABI, and Node and Electron use
 * different ones. Node 22 is NODE_MODULE_VERSION 127 and Node 24 is 137, while
 * Electron 32 is 128, so a single node_modules cannot satisfy both at once:
 * running the desktop app against the Node binary fails with ERR_DLOPEN_FAILED,
 * and vice versa. npm may also block the package install script, in which case
 * no binary is fetched at install time and this is the only thing that gets one.
 *
 * This fetches the published prebuilt binary for whichever runtime is asked for,
 * so switching between `npm run dev` and packaging never needs a C++ toolchain.
 *
 *   node scripts/rebuild-native.mjs node
 *   node scripts/rebuild-native.mjs electron
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] || 'node').toLowerCase();
if (target !== 'node' && target !== 'electron') {
  console.error(`Unknown runtime "${target}". Use "node" or "electron".`);
  process.exit(1);
}

const moduleDir = join(root, 'node_modules', 'better-sqlite3');
const prebuildInstall = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install');

const args = ['--arch', process.arch, '--platform', process.platform];
if (target === 'electron') {
  // Read the version actually installed so this keeps working across upgrades.
  const electronVersion = require(join(root, 'node_modules', 'electron', 'package.json')).version;
  args.push('--runtime', 'electron', '--target', electronVersion);
  console.log(`Fetching the better-sqlite3 binary for Electron ${electronVersion}.`);
} else {
  args.push('--runtime', 'node', '--target', process.versions.node);
  console.log(`Fetching the better-sqlite3 binary for Node ${process.versions.node}.`);
}

const result = spawnSync(prebuildInstall, args, { cwd: moduleDir, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) {
  console.error(`\nNo published prebuilt binary matched this ${target} runtime, and building from source needs a C++ toolchain.`);
  console.error('Check that the better-sqlite3 release publishes an asset for this ABI before falling back to a source build.');
  process.exit(result.status || 1);
}
console.log(`better-sqlite3 is now built for ${target}.`);
