import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable, Readable } from 'node:stream';
import { runCli } from '../src/cli.js';

test('CLI installs repeated targets when approved by --yes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-'));
  const output = captureStream();

  const exitCode = await runCli([
    'install',
    '--dir',
    root,
    '--target',
    'claude-code',
    '--target',
    'opencode',
    '--yes'
  ], {
    cwd: root,
    env: { HOME: root, USERPROFILE: root },
    stdin: Readable.from([]),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /Install result:/);
  await fs.stat(path.join(root, '.claude/skills/review/SKILL.md'));
  await fs.stat(path.join(root, '.opencode/commands/simplify.md'));
});

test('CLI dry-run does not ask for approval or write files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-dry-'));
  const output = captureStream();

  const exitCode = await runCli([
    'install',
    '--dir',
    root,
    '--target',
    'kiro',
    '--dry-run'
  ], {
    cwd: root,
    env: { HOME: root, USERPROFILE: root },
    stdin: Readable.from([]),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /Install plan:/);
  await assert.rejects(fs.stat(path.join(root, '.kiro/steering/review.md')), /ENOENT/);
});

test('CLI uses os.homedir fallback when env home variables are absent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-home-'));
  const output = captureStream();

  const exitCode = await runCli([
    'install',
    '--dir',
    root,
    '--scope',
    'user',
    '--target',
    'codex',
    '--dry-run'
  ], {
    cwd: root,
    env: {},
    stdin: Readable.from([]),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /Install plan:/);
});

test('CLI install --verify reports verification success after writing files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-verify-'));
  const output = captureStream();

  const exitCode = await runCli([
    'install',
    '--dir',
    root,
    '--target',
    'codex',
    '--yes',
    '--verify'
  ], {
    cwd: root,
    env: { HOME: root, USERPROFILE: root },
    stdin: Readable.from([]),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /Verification passed\./);
});

function captureStream() {
  let value = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      value += chunk.toString();
      callback();
    }
  });
  stream.text = () => value;
  return stream;
}
