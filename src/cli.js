import { createInterface } from 'node:readline/promises';
import { stdin as processStdin, stdout as processStdout } from 'node:process';
import { install, listTargets, normalizeTargets } from './install.js';

const HELP = `tokenmaxxing-ai

Usage:
  tokenmaxxing-ai install [options]
  tokenmaxxing-ai list-targets
  tokenmaxxing-ai help

Options:
  --target, -t <name>      Adapter to install. Repeat or comma-separate. Default: all.
  --dir <path>            Project directory to install into. Default: current directory.
  --scope <project|user>  Install project-local files or user-global files. Default: project.
  --yes, -y               Apply without interactive confirmation.
  --force                 Overwrite existing non-generated command files.
  --dry-run               Print the planned writes without changing files.

Examples:
  npx tokenmaxxing-ai install
  npx tokenmaxxing-ai install --target claude-code --target opencode
  npx tokenmaxxing-ai install --scope user --target codex
`;

export async function runCli(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
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

  if (command !== 'install') {
    stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  }

  const options = parseInstallArgs(rest, cwd, env);
  const targets = normalizeTargets(options.targets);
  const preview = await install({ ...options, targets, dryRun: true });

  stdout.write(formatPlan(preview));

  if (preview.every((item) => item.action === 'unchanged' || item.action === 'skipped')) {
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
  stdout.write(formatResult(result));
  return result.some((item) => item.action === 'conflict') ? 1 : 0;
}

function parseInstallArgs(args, cwd, env) {
  const options = {
    projectRoot: cwd,
    homeDir: env.HOME || env.USERPROFILE || cwd,
    targets: ['all'],
    scope: 'project',
    yes: false,
    force: false,
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--target' || arg === '-t') {
      options.targets = addTargets(options.targets, splitList(readValue(args, ++index, arg)));
    } else if (arg.startsWith('--target=')) {
      options.targets = addTargets(options.targets, splitList(arg.slice('--target='.length)));
    } else if (arg === '--dir') {
      options.projectRoot = readValue(args, ++index, arg);
    } else if (arg.startsWith('--dir=')) {
      options.projectRoot = arg.slice('--dir='.length);
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

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function addTargets(current, next) {
  const base = current.length === 1 && current[0] === 'all' ? [] : current;
  return [...base, ...next];
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

function formatPlan(items) {
  const lines = ['Install plan:'];
  for (const item of items) {
    lines.push(`  ${item.action.padEnd(9)} ${item.path}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatResult(items) {
  const lines = ['Install result:'];
  for (const item of items) {
    lines.push(`  ${item.action.padEnd(9)} ${item.path}`);
  }
  return `${lines.join('\n')}\n`;
}
