import { createInterface } from 'node:readline/promises';
import os from 'node:os';
import path from 'node:path';
import { stdin as processStdin, stdout as processStdout } from 'node:process';
import { runGraphq } from './graphq/index.js';
import { install, listTargets, normalizeTargets, splitList, verifyInstall } from './install.js';

const HELP = `tokenmaxxing-ai

Usage:
  tokenmaxxing-ai install [options]
  tokenmaxxing-ai graphq [graphq-options]
  tokenmaxxing-ai list-targets
  tokenmaxxing-ai help

Options:
  --target, -t <name>      Adapter to install. Repeat or comma-separate. Default: all.
  --dir <path>            Project directory to install into. Default: current directory.
  --scope <project|user>  Install project-local files or user-global files. Default: project.
                          With --scope user, "all" expands only to user-supported targets:
                          codex, claude-code, github-copilot, opencode, antigravity, kiro.
                          cursor and commandcode require --scope project.
  --yes, -y               Apply without interactive confirmation.
  --force                 Overwrite existing non-generated command files.
  --dry-run               Print the planned writes without changing files.
  --verify                Verify installed files after writing.

Examples:
  npx tokenmaxxing-ai install
  npx tokenmaxxing-ai install --target claude-code --target opencode
  npx tokenmaxxing-ai install --scope user
  npx tokenmaxxing-ai install --scope user --target codex
  npx tokenmaxxing-ai graphq task "fix expired JWT tokens being accepted"
`;

export async function runCli(argv, io = {}) {
  const cwd = path.resolve(io.cwd ?? process.cwd());
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const stdin = io.stdin ?? process.stdin;

  const [command = 'help', ...rest] = argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    stdout.write(HELP);
    return 0;
  }

  if (command === 'list-targets') {
    stdout.write(`${listTargets().join('\n')}\n`);
    return 0;
  }

  if (command === 'graphq') {
    return runGraphq(rest, { cwd, env, stdin, stdout, stderr });
  }

  if (command !== 'install') {
    stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  }

  const options = parseInstallArgs(rest, cwd, env);
  const targets = normalizeTargets(options.targets, options.scope);
  const preview = await install({ ...options, targets, dryRun: true });

  stdout.write(formatList('Install plan:', preview));

  if (preview.every((item) => item.action === 'unchanged')) {
    stdout.write('Nothing to change.\n');
    return 0;
  }

  if (!options.yes && !options.dryRun) {
    const approved = await askApproval(stdin, stdout);
    if (!approved) {
      stdout.write('Install cancelled.\n');
      return 1;
    }
  }

  if (options.dryRun) {
    return 0;
  }

  const result = await install({ ...options, targets, dryRun: false });
  stdout.write(formatList('Install result:', result));

  if (options.verify) {
    const verification = await verifyInstall({ ...options, targets });
    stdout.write(formatVerification(verification));
    if (verification.some((item) => item.action !== 'verified')) return 1;
  }

  return result.some((item) => item.action === 'conflict') ? 1 : 0;
}

function parseInstallArgs(args, cwd, env) {
  const options = {
    projectRoot: cwd,
    homeDir: resolveCliPath(
      env.TOKENMAXXING_AI_HOME || env.HOME || env.USERPROFILE || os.homedir() || cwd,
      cwd
    ),
    targets: ['all'],
    scope: 'project',
    yes: false,
    force: false,
    dryRun: false,
    verify: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--target' || arg === '-t') {
      options.targets = addTargets(options.targets, splitList(readValue(args, ++index, arg)));
    } else if (arg.startsWith('--target=')) {
      options.targets = addTargets(options.targets, splitList(arg.slice('--target='.length)));
    } else if (arg === '--dir') {
      options.projectRoot = resolveCliPath(readValue(args, ++index, arg), cwd);
    } else if (arg.startsWith('--dir=')) {
      options.projectRoot = resolveCliPath(arg.slice('--dir='.length), cwd);
    } else if (arg === '--scope') {
      options.scope = readValue(args, ++index, arg);
    } else if (arg.startsWith('--scope=')) {
      options.scope = arg.slice('--scope='.length);
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verify') {
      options.verify = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!['project', 'user'].includes(options.scope)) {
    throw new Error(`Invalid --scope "${options.scope}". Use "project" or "user".`);
  }

  return options;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function addTargets(current, next) {
  const base = current.length === 1 && current[0] === 'all' ? [] : current;
  return [...base, ...next];
}

export { splitList };

function resolveCliPath(value, cwd) {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

async function askApproval(stdin, stdout) {
  const rl = createInterface({
    input: stdin ?? processStdin,
    output: stdout ?? processStdout
  });
  try {
    const answer = await rl.question('Apply these changes? [y/N] ');
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function formatList(title, items) {
  const lines = [title];
  for (const item of items) {
    lines.push(`  ${item.action.padEnd(9)} ${item.path}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatVerification(items) {
  const failed = items.filter((item) => item.action !== 'verified');
  if (!failed.length) return 'Verification passed.\n';

  const lines = ['Verification failed:'];
  for (const item of failed) {
    lines.push(`  ${item.action.padEnd(9)} ${item.path} ${item.message ?? ''}`.trimEnd());
  }
  return `${lines.join('\n')}\n`;
}
