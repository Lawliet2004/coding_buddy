import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runCheckJs() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/check-js.mjs'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

// F-5: check script auto-discovers package JS files instead of a manual list.
test('npm run check validates JS MJS and CJS files including taskText and check-js', async () => {
  const result = await runCheckJs();
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const match = result.stdout.match(/check-js: (?<count>\d+) file\(s\) OK/);
  assert(match, result.stdout);
  assert(Number(match.groups.count) >= 24, result.stdout);
});
