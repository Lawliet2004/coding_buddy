import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { install, listTargets, normalizeTargets } from '../src/install.js';

test('normalizeTargets expands all and accepts aliases', () => {
  assert.deepEqual(normalizeTargets(['all']), listTargets());
  assert.deepEqual(normalizeTargets(['cloud', 'open-code', 'copilot']), [
    'claude-code',
    'opencode',
    'github-copilot'
  ]);
});

test('project install writes all target adapters', async () => {
  const { root, home } = await makeTempProject();

  const result = await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['all']),
    scope: 'project',
    dryRun: false,
    force: false
  });

  assert(!result.some((item) => item.action === 'conflict'));
  await assertContains(path.join(root, '.claude/skills/simplify/SKILL.md'), 'Proceed with these edits?');
  await assertContains(path.join(root, '.opencode/commands/review.md'), 'lite/light, mid/medium, ultra/full');
  await assertContains(path.join(root, '.kiro/steering/tokenmaxxing-ai.md'), 'inclusion: auto');
  await assertContains(path.join(root, '.github/instructions/tokenmaxxing-ai.instructions.md'), '/review ultra');
  await assertContains(path.join(root, 'AGENTS.md'), 'tokenmaxxing-ai:agents:start');
});

test('dry run returns a plan without writing files', async () => {
  const { root, home } = await makeTempProject();

  const result = await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['opencode']),
    scope: 'project',
    dryRun: true,
    force: false
  });

  assert.equal(result[0].action, 'create');
  await assert.rejects(fs.stat(path.join(root, '.opencode/commands/simplify.md')), /ENOENT/);
});

test('existing non-generated command files are not overwritten without force', async () => {
  const { root, home } = await makeTempProject();
  const commandPath = path.join(root, '.opencode/commands/simplify.md');
  await fs.mkdir(path.dirname(commandPath), { recursive: true });
  await fs.writeFile(commandPath, 'custom command\n', 'utf8');

  const result = await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['opencode']),
    scope: 'project',
    dryRun: false,
    force: false
  });

  assert(result.some((item) => item.action === 'conflict' && item.path.endsWith('simplify.md')));
  assert.equal(await fs.readFile(commandPath, 'utf8'), 'custom command\n');
});

test('user-scope codex install writes to the supplied home directory', async () => {
  const { root, home } = await makeTempProject();

  await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['codex']),
    scope: 'user',
    dryRun: false,
    force: false
  });

  await assertContains(path.join(home, '.codex/prompts/review.md'), 'argument-hint: [lite|mid|ultra] [scope]');
  await assertContains(path.join(home, '.agents/skills/simplify/SKILL.md'), 'Tokenmaxxing-AI /simplify');
});

async function makeTempProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-project-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-home-'));
  return { root, home };
}

async function assertContains(filePath, expected) {
  const content = await fs.readFile(filePath, 'utf8');
  assert(content.includes(expected), `${filePath} should contain ${expected}`);
}
