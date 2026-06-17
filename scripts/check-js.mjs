// Development-only syntax check: discovers package JS files and runs
// `node --check` on each. Zero runtime dependencies (Node standard library
// only). New modules under bin/, src/, test/, or scripts/ are picked up
// automatically.
//
// Excludes dependency dirs, generated/local output, and local caches. Run via
// `npm run check`. Not required by package consumers, so it is not shipped in
// the npm tarball (not listed in package.json `files`).
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';

// <repo>/scripts/check-js.mjs -> <repo>
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const SCAN_DIRS = ['bin', 'src', 'test', 'scripts'];
const EXCLUDE_DIR_NAMES = new Set([
  '.git',
  '.graphq',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  'venv',
  '.venv',
  '__pycache__',
  'target',
  'vendor'
]);

async function walkJsFiles(dir, found) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      await walkJsFiles(entryPath, found);
    } else if (entry.isFile() && /\.(?:cjs|js|mjs)$/.test(entry.name)) {
      found.push(entryPath);
    }
  }
}

async function collectJsFiles() {
  const found = [];
  for (const dir of SCAN_DIRS) {
    await walkJsFiles(join(ROOT, dir), found);
  }
  return found.sort();
}

function checkFile(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', filePath], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node --check failed (exit ${code}) for ${relative(ROOT, filePath)}`));
    });
  });
}

async function main() {
  const files = await collectJsFiles();
  if (!files.length) {
    process.stderr.write('check-js: no JS files found to check\n');
    process.exit(1);
  }
  for (const file of files) {
    await checkFile(file);
  }
  process.stdout.write(`check-js: ${files.length} file(s) OK\n`);
}

main().catch((error) => {
  process.stderr.write(`check-js: ${error.message}\n`);
  process.exit(1);
});
