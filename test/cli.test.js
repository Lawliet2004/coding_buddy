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

test('CLI resolves relative --dir against injected cwd', async () => {
  const originalCwd = process.cwd();
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-cwd-'));
  const processRoot = path.join(base, 'process-root');
  const injectedCwd = path.join(base, 'injected-cwd');
  const injectedHome = path.join(base, 'home');
  await fs.mkdir(processRoot);
  await fs.mkdir(injectedCwd);
  await fs.mkdir(injectedHome);

  try {
    process.chdir(processRoot);
    const exitCode = await runCli([
      'install',
      '--dir',
      'relative-project',
      '--target',
      'kiro',
      '--yes'
    ], {
      cwd: injectedCwd,
      env: { HOME: injectedHome, USERPROFILE: injectedHome },
      stdin: Readable.from([]),
      stdout: captureStream(),
      stderr: captureStream()
    });

    assert.equal(exitCode, 0);
    await fs.stat(path.join(injectedCwd, 'relative-project', '.kiro/steering/review.md'));
    await assert.rejects(
      fs.stat(path.join(processRoot, 'relative-project', '.kiro/steering/review.md')),
      /ENOENT/
    );
  } finally {
    process.chdir(originalCwd);
    await fs.rm(base, { recursive: true, force: true });
  }
});

test('CLI prefers injected HOME over os.homedir for user-scope installs', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-env-home-'));
  const projectRoot = path.join(base, 'project');
  const envHome = path.join(base, 'env-home');
  const osHome = path.join(base, 'os-home');
  await fs.mkdir(projectRoot);
  await fs.mkdir(envHome);
  await fs.mkdir(osHome);

  const originalHomedir = os.homedir;
  os.homedir = () => osHome;

  try {
    const exitCode = await runCli([
      'install',
      '--scope',
      'user',
      '--target',
      'codex',
      '--yes'
    ], {
      cwd: projectRoot,
      env: { HOME: envHome, USERPROFILE: envHome },
      stdin: Readable.from([]),
      stdout: captureStream(),
      stderr: captureStream()
    });

    assert.equal(exitCode, 0);
    await fs.stat(path.join(envHome, '.agents/skills/review-ultra/SKILL.md'));
    await assert.rejects(
      fs.stat(path.join(osHome, '.agents/skills/review-ultra/SKILL.md')),
      /ENOENT/
    );
  } finally {
    os.homedir = originalHomedir;
    await fs.rm(base, { recursive: true, force: true });
  }
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

// F-6: askApproval is reached when --yes is omitted
test('CLI install with "y" approval writes files and exits 0', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-yes-'));
  const output = captureStream();

  const exitCode = await runCli([
    'install',
    '--dir',
    root,
    '--target',
    'kiro'
  ], {
    cwd: root,
    env: { HOME: root, USERPROFILE: root },
    stdin: Readable.from(['y\n']),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /Install result:/);
  await fs.stat(path.join(root, '.kiro/steering/simplify.md'));
  await fs.stat(path.join(root, '.kiro/steering/review.md'));
  await fs.stat(path.join(root, '.kiro/steering/tokenmaxxing-ai.md'));
});

test('CLI install with "n" approval cancels and exits 1 without writing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-no-'));
  const output = captureStream();

  const exitCode = await runCli([
    'install',
    '--dir',
    root,
    '--target',
    'kiro'
  ], {
    cwd: root,
    env: { HOME: root, USERPROFILE: root },
    stdin: Readable.from(['n\n']),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 1);
  assert.match(output.text(), /cancelled/);
  await assert.rejects(fs.stat(path.join(root, '.kiro/steering/simplify.md')), /ENOENT/);
});

test('CLI install with non-y answer cancels and exits 1', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-cli-garbage-'));
  const output = captureStream();

  const exitCode = await runCli([
    'install',
    '--dir',
    root,
    '--target',
    'kiro'
  ], {
    cwd: root,
    env: { HOME: root, USERPROFILE: root },
    stdin: Readable.from(['maybe\n']),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 1);
  assert.match(output.text(), /cancelled/);
});

// F-13: unknown command / unknown option / unknown scope
test('CLI returns 1 for unknown command and writes the error to stderr', async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(['unknown-command'], {
    cwd: '/',
    env: {},
    stdin: Readable.from([]),
    stdout,
    stderr
  });
  assert.equal(exitCode, 1);
  assert.match(stderr.text(), /Unknown command/);
});

test('CLI throws on unknown --option', async () => {
  await assert.rejects(
    runCli(['install', '--not-a-flag'], {
      cwd: '/', env: {},
      stdin: Readable.from([]),
      stdout: captureStream(),
      stderr: captureStream()
    }),
    /Unknown option/
  );
});

test('CLI throws on unknown --scope value', async () => {
  await assert.rejects(
    runCli(['install', '--scope', 'galaxy'], {
      cwd: '/', env: {},
      stdin: Readable.from([]),
      stdout: captureStream(),
      stderr: captureStream()
    }),
    /Invalid --scope/
  );
});

test('CLI throws on missing value for --target', async () => {
  await assert.rejects(
    runCli(['install', '--target'], {
      cwd: '/', env: {},
      stdin: Readable.from([]),
      stdout: captureStream(),
      stderr: captureStream()
    }),
    /Missing value for --target/
  );
});

// --help
test('CLI --help prints usage and exits 0', async () => {
  const output = captureStream();
  const exitCode = await runCli(['--help'], {
    cwd: '/', env: {},
    stdin: Readable.from([]),
    stdout: output,
    stderr: captureStream()
  });
  assert.equal(exitCode, 0);
  assert.match(output.text(), /Usage:/);
});

// list-targets
test('CLI list-targets prints target names', async () => {
  const output = captureStream();
  const exitCode = await runCli(['list-targets'], {
    cwd: '/', env: {},
    stdin: Readable.from([]),
    stdout: output,
    stderr: captureStream()
  });
  assert.equal(exitCode, 0);
  assert.match(output.text(), /codex/);
  assert.match(output.text(), /claude-code/);
  assert.match(output.text(), /kiro/);
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

test('CLI rejects empty inline install option values without writing', async () => {
  for (const flag of ['--target=', '--dir=', '--scope=']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-empty-inline-'));
    await assert.rejects(runCli(['install', '--yes', flag], {
      cwd: root,
      env: { HOME: root, USERPROFILE: root },
      stdin: Readable.from([]),
      stdout: captureStream(),
      stderr: captureStream()
    }), /Missing value for --(?:target|dir|scope)/);
    await assert.rejects(fs.stat(path.join(root, '.agents')), /ENOENT/);
  }
});
