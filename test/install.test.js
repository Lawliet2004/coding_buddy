import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, listTargets, materialize, normalizeTargets, verifyInstall, USER_TARGETS, escapeRegExp } from '../src/install.js';
import { addTargets } from '../src/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('normalizeTargets expands all and accepts aliases', () => {
  assert.deepEqual(normalizeTargets(['all']), listTargets());
  assert.deepEqual(normalizeTargets(['cloud', 'open-code', 'copilot']), [
    'claude-code',
    'opencode',
    'github-copilot'
  ]);
});

test('normalizeTargets with scope user expands all to user-supported targets only', () => {
  const result = normalizeTargets(['all'], 'user');
  assert.deepEqual(result, USER_TARGETS);
  assert(!result.includes('cursor'), 'cursor must not be in user all expansion');
  assert(!result.includes('commandcode'), 'commandcode must not be in user all expansion');
});

test('normalizeTargets with scope project expands all to every target', () => {
  assert.deepEqual(normalizeTargets(['all'], 'project'), listTargets());
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
  await assertContains(path.join(root, '.claude/skills/simplify/SKILL.md'), '.tokenmaxxing.md');
  await assertContains(path.join(root, '.claude/skills/review/SKILL.md'), 'lite/light, mid/medium, ultra/full');
  await assertContains(path.join(root, '.claude/skills/review-lite/SKILL.md'), 'Run this as /review lite.');
  await assertContains(path.join(root, '.claude/skills/review-mid/SKILL.md'), 'Run this as /review mid.');
  await assertContains(path.join(root, '.claude/skills/review-ultra/SKILL.md'), 'Run this as /review ultra.');
  await assertContains(path.join(root, '.claude/skills/review-lite/references/security_checklist.md'), 'command injection');
  await assertContains(path.join(root, '.claude/skills/review-mid/references/maintainability_checklist.md'), 'Cyclomatic complexity');
  await assertContains(path.join(root, '.claude/skills/review-ultra/references/simplification_signals.md'), 'Abstractions Without Payoff');
  await assertContains(path.join(root, '.agents/skills/review-lite/SKILL.md'), 'Run this as /review lite.');
  await assertContains(path.join(root, '.agents/skills/review-lite/SKILL.md'), 'Adaptive Project Memory');
  await assertContains(path.join(root, '.agents/skills/review-mid/SKILL.md'), 'Run this as /review mid.');
  await assertContains(path.join(root, '.agents/skills/review-ultra/SKILL.md'), 'Run this as /review ultra.');
  await assertContains(path.join(root, '.agents/skills/review-lite/references/security_checklist.md'), 'command injection');
  await assertContains(path.join(root, '.agents/skills/review-mid/references/maintainability_checklist.md'), 'Cyclomatic complexity');
  await assertContains(path.join(root, '.agents/skills/review-ultra/references/simplification_signals.md'), 'Abstractions Without Payoff');
  await assertContains(path.join(root, '.opencode/commands/review.md'), 'lite/light, mid/medium, ultra/full');
  await assertContains(path.join(root, '.kiro/steering/tokenmaxxing-ai.md'), 'inclusion: auto');
  await assertContains(path.join(root, '.github/instructions/tokenmaxxing-ai.instructions.md'), '/review ultra');
  await assertContains(path.join(root, '.github/instructions/tokenmaxxing-ai.instructions.md'), 'Adaptive Memory');
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

  await assertContains(path.join(home, '.agents/skills/simplify/SKILL.md'), 'Tokenmaxxing-AI /simplify');
  await assertContains(path.join(home, '.agents/skills/simplify/SKILL.md'), 'Adaptive Project Memory');
  await assertContains(path.join(home, '.agents/skills/review-lite/SKILL.md'), 'name: review-lite');
  await assertContains(path.join(home, '.agents/skills/review-mid/SKILL.md'), 'Run this as /review mid.');
  await assertContains(path.join(home, '.agents/skills/review-ultra/SKILL.md'), 'Run this as /review ultra.');
  await assertContains(path.join(home, '.agents/skills/review-lite/references/security_checklist.md'), 'command injection');
  await assertContains(path.join(home, '.agents/skills/review-mid/references/maintainability_checklist.md'), 'Cyclomatic complexity');
  await assertContains(path.join(home, '.agents/skills/review-ultra/references/simplification_signals.md'), 'Abstractions Without Payoff');
  await assert.rejects(fs.stat(path.join(home, '.codex/prompts/review-ultra.md')), /ENOENT/);
});

test('verifyInstall reports installed files that drift from generated content', async () => {
  const { root, home } = await makeTempProject();

  await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['codex']),
    scope: 'project',
    dryRun: false,
    force: false
  });

  await fs.writeFile(path.join(root, '.agents/skills/review-lite/SKILL.md'), 'custom\n', 'utf8');

  const result = await verifyInstall({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['codex']),
    scope: 'project'
  });

  assert(result.some((item) =>
    item.action === 'mismatch' && item.path.split(path.sep).join('/').endsWith('review-lite/SKILL.md')
  ));
});

test('user-scope copilot install writes to home copilot directory', async () => {
  const { root, home } = await makeTempProject();

  await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['github-copilot']),
    scope: 'user',
    dryRun: false,
    force: false
  });

  await assertContains(path.join(home, '.copilot/copilot-instructions.md'), '/review ultra');
  await assertContains(path.join(home, '.copilot/instructions/tokenmaxxing-ai.instructions.md'), '/review ultra');
});

test('user-scope antigravity install writes to home gemini skills directory', async () => {
  const { root, home } = await makeTempProject();

  await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['antigravity']),
    scope: 'user',
    dryRun: false,
    force: false
  });

  await assertContains(path.join(home, '.gemini/antigravity/skills/review-lite/SKILL.md'), 'Run this as /review lite.');
  await assertContains(path.join(home, '.gemini/antigravity/skills/review-ultra/references/simplification_signals.md'), 'Abstractions Without Payoff');
  await assert.rejects(fs.stat(path.join(home, '.antigravity/commands/review.md')), /ENOENT/);
});

test('user-scope install fails clearly for targets without global support', async () => {
  const { root, home } = await makeTempProject();

  await assert.rejects(
    install({
      projectRoot: root,
      homeDir: home,
      targets: normalizeTargets(['cursor']),
      scope: 'user',
      dryRun: false,
      force: false
    }),
    /cursor does not support --scope user/
  );

  await assert.rejects(
    install({
      projectRoot: root,
      homeDir: home,
      targets: normalizeTargets(['commandcode']),
      scope: 'user',
      dryRun: false,
      force: false
    }),
    /commandcode does not support --scope user/
  );
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

// Regression: --scope user with default/all installs only user-supported targets and does not throw.
test('user-scope all install succeeds and only writes user-supported targets', async () => {
  const { root, home } = await makeTempProject();

  const result = await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['all'], 'user'),
    scope: 'user',
    dryRun: false,
    force: false
  });

  // No conflicts and no errors.
  assert(!result.some((item) => item.action === 'conflict'), 'user all install should not produce conflicts');

  // At least one user-supported target wrote a file.
  assert(result.some((item) => item.action === 'create'), 'user all install should create files');

  // cursor and commandcode project files must NOT be written.
  await assert.rejects(fs.stat(path.join(root, '.cursor/rules/tokenmaxxing-ai.mdc')), /ENOENT/);
  await assert.rejects(fs.stat(path.join(root, '.commandcode/commands/simplify.md')), /ENOENT/);
});

// Regression: explicit unsupported user targets still throw clearly.
test('user-scope install with explicit cursor or commandcode still throws clearly', async () => {
  const { root, home } = await makeTempProject();

  await assert.rejects(
    install({
      projectRoot: root,
      homeDir: home,
      targets: ['cursor'],
      scope: 'user',
      dryRun: false,
      force: false
    }),
    /cursor does not support --scope user/
  );

  await assert.rejects(
    install({
      projectRoot: root,
      homeDir: home,
      targets: ['commandcode'],
      scope: 'user',
      dryRun: false,
      force: false
    }),
    /commandcode does not support --scope user/
  );
});

// Regression: conflict during install with --force false is atomic; no other files are written.
test('conflict during install without --force does not write any files (atomic)', async () => {
  const { root, home } = await makeTempProject();

  // Pre-create a non-generated file for the first target file opencode/commands/simplify.md.
  const conflictPath = path.join(root, '.opencode/commands/simplify.md');
  await fs.mkdir(path.dirname(conflictPath), { recursive: true });
  await fs.writeFile(conflictPath, 'custom content\n', 'utf8');

  const result = await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['opencode']),
    scope: 'project',
    dryRun: false,
    force: false
  });

  // Result should include the conflict.
  assert(result.some((item) => item.action === 'conflict'), 'should report conflict');

  // The other opencode file (review.md) must NOT have been written because of the conflict.
  await assert.rejects(fs.stat(path.join(root, '.opencode/commands/review.md')), /ENOENT/,
    'review.md should not be written when another file in the same install has a conflict'
  );

  // The conflicting file must remain unchanged.
  assert.equal(await fs.readFile(conflictPath, 'utf8'), 'custom content\n');
});

// Regression: --force overwrites conflicts and writes all expected files.
test('--force overwrites conflict and writes expected files', async () => {
  const { root, home } = await makeTempProject();

  const conflictPath = path.join(root, '.opencode/commands/simplify.md');
  await fs.mkdir(path.dirname(conflictPath), { recursive: true });
  await fs.writeFile(conflictPath, 'custom content\n', 'utf8');

  const result = await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['opencode']),
    scope: 'project',
    dryRun: false,
    force: true
  });

  assert(!result.some((item) => item.action === 'conflict'), 'force should remove conflicts');
  await fs.stat(path.join(root, '.opencode/commands/simplify.md'));
  await fs.stat(path.join(root, '.opencode/commands/review.md'));
  const updatedContent = await fs.readFile(conflictPath, 'utf8');
  assert(updatedContent !== 'custom content\n', 'file should have been overwritten by --force');
});

// Metadata: plugin.json and openai.yaml contain adaptive project memory wording.
test('plugin.json longDescription mentions adaptive project memory', async () => {
  const pluginPath = path.join(__dirname, '..', '.codex-plugin', 'plugin.json');
  const content = await fs.readFile(pluginPath, 'utf8');
  assert(content.includes('.tokenmaxxing.md'), 'plugin.json longDescription should mention .tokenmaxxing.md');
  assert(content.includes('adaptive'), 'plugin.json longDescription should mention adaptive memory');
});

test('openai.yaml files mention adaptive project memory', async () => {
  for (const skill of ['simplify', 'review', 'review-lite', 'review-mid', 'review-ultra']) {
    const yamlPath = path.join(__dirname, '..', 'skills', skill, 'agents', 'openai.yaml');
    const content = await fs.readFile(yamlPath, 'utf8');
    assert(
      content.includes('.tokenmaxxing.md') || content.includes('adaptive'),
      `${skill}/agents/openai.yaml should mention adaptive project memory`
    );
  }
});

// materialize: non-block branch
test('materialize returns trailing-newline content for non-block files', () => {
  const result = materialize({ merge: undefined, content: 'hello' }, null);
  assert.equal(result, 'hello\n');
});

// materialize: block branch with no existing file
test('materialize creates a block when no existing file is present', () => {
  const result = materialize({ merge: 'block', blockId: 'test', content: 'hello' }, null);
  assert.match(result, /<!-- tokenmaxxing-ai:test:start -->/);
  assert.match(result, /<!-- tokenmaxxing-ai:test:end -->/);
  assert.match(result, /hello/);
});

// materialize: block branch replacing an existing block
test('materialize replaces an existing block in place', () => {
  const existing = [
    'before',
    '',
    '<!-- tokenmaxxing-ai:test:start -->',
    'old content',
    '<!-- tokenmaxxing-ai:test:end -->',
    '',
    'after'
  ].join('\n');
  const result = materialize({ merge: 'block', blockId: 'test', content: 'new content' }, existing);
  assert.match(result, /before/);
  assert.match(result, /after/);
  assert.match(result, /new content/);
  assert.doesNotMatch(result, /old content/);
});

// materialize: block branch appending when existing has no markers
test('materialize appends a block when existing has no matching markers', () => {
  const existing = 'user-written content\n';
  const result = materialize({ merge: 'block', blockId: 'test', content: 'appended' }, existing);
  const userIdx = result.indexOf('user-written content');
  const blockIdx = result.indexOf('<!-- tokenmaxxing-ai:test:start -->');
  assert(userIdx >= 0, 'user content is preserved');
  assert(blockIdx >= 0, 'block is added');
  assert(userIdx < blockIdx, 'user content stays before the appended block');
  assert.match(result, /appended/);
});

// materialize: blockId with regex special characters is escaped, not interpreted
test('materialize escapes regex metacharacters in blockId', () => {
  const result = materialize({ merge: 'block', blockId: 'a.b+c', content: 'x' }, null);
  assert.match(result, /<!-- tokenmaxxing-ai:a\.b\+c:start -->/);
  assert.match(result, /<!-- tokenmaxxing-ai:a\.b\+c:end -->/);
});

// escapeRegExp: covers the characters that would break the materialize regex
test('escapeRegExp escapes regex metacharacters', () => {
  for (const [input, expected] of [
    ['a.b', 'a\\.b'],
    ['a*b', 'a\\*b'],
    ['a+b', 'a\\+b'],
    ['a?b', 'a\\?b'],
    ['a^b', 'a\\^b'],
    ['a$b', 'a\\$b'],
    ['a{b', 'a\\{b'],
    ['a(b', 'a\\(b'],
    ['a)b', 'a\\)b'],
    ['a|b', 'a\\|b'],
    ['a[b', 'a\\[b'],
    ['a]b', 'a\\]b'],
    ['a\\b', 'a\\\\b']
  ]) {
    assert.equal(escapeRegExp(input), expected, `escapeRegExp(${JSON.stringify(input)})`);
  }
});

test('escapeRegExp leaves plain characters alone', () => {
  assert.equal(escapeRegExp('agents'), 'agents');
  assert.equal(escapeRegExp('simplify-2026'), 'simplify-2026');
});

// verifyInstall: missing-files branch
test('verifyInstall reports missing files when nothing was installed', async () => {
  const { root, home } = await makeTempProject();

  const result = await verifyInstall({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['opencode']),
    scope: 'project'
  });

  assert(result.length > 0);
  assert(result.every((item) => item.action === 'missing'));
});

// verifyInstall: block-merge file drift
test('verifyInstall detects drift inside a block-merge file', async () => {
  const { root, home } = await makeTempProject();

  await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['codex']),
    scope: 'project',
    dryRun: false,
    force: false
  });

  const agentsPath = path.join(root, 'AGENTS.md');
  const original = await fs.readFile(agentsPath, 'utf8');
  const tampered = original.replace('tokenmaxxing-ai', 'something-else');
  await fs.writeFile(agentsPath, tampered, 'utf8');

  const result = await verifyInstall({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['codex']),
    scope: 'project'
  });

  const agentsResult = result.find((item) => item.path.split(path.sep).join('/').endsWith('AGENTS.md'));
  assert(agentsResult, 'AGENTS.md should be in verify result');
  assert.equal(agentsResult.action, 'mismatch');
});

// addTargets: semantics
test('addTargets replaces a single "all" with the new list', () => {
  assert.deepEqual(addTargets(['all'], ['claude-code']), ['claude-code']);
  assert.deepEqual(addTargets(['all'], ['all']), ['all']);
  assert.deepEqual(addTargets(['all'], ['a', 'b']), ['a', 'b']);
});

test('addTargets appends to a non-all list', () => {
  assert.deepEqual(addTargets(['codex'], ['claude-code']), ['codex', 'claude-code']);
  assert.deepEqual(addTargets(['codex', 'opencode'], ['kiro']), ['codex', 'opencode', 'kiro']);
});

test('addTargets treats a multi-element list containing "all" as already-expanded', () => {
  // Only the single-element ['all'] form is collapsed; multi-element lists are kept verbatim.
  assert.deepEqual(addTargets(['codex', 'all'], ['claude-code']), ['codex', 'all', 'claude-code']);
});

// normalizeTargets: unknown target throws
test('normalizeTargets throws on unknown target', () => {
  assert.throws(
    () => normalizeTargets(['nonexistent-target']),
    /Unknown target/
  );
});

// path display: home-rooted files are reported relative to the home dir, not the project
test('install plan reports home-rooted files relative to the home directory', async () => {
  const { root, home } = await makeTempProject();

  const result = await install({
    projectRoot: root,
    homeDir: home,
    targets: normalizeTargets(['codex'], 'user'),
    scope: 'user',
    dryRun: true,
    force: false
  });

  // No path should contain '..' (which would indicate project-relative path-joining against home)
  for (const item of result) {
    assert(!item.path.includes('..'), `path ${item.path} should not escape the home dir`);
  }
  // At least one home-rooted file is shown as .agents/...
  const relative = result.map((item) => item.path.split(path.sep).join('/'));
  assert(relative.some((p) => p.startsWith('.agents/')),
    'expected at least one home-rooted file to be shown as a home-relative path');
});
