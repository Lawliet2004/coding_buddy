import fs from 'node:fs/promises';
import path from 'node:path';
import { writeGraphqOutput } from './contextPackWriter.js';
import { buildFreshness, readPreviousState } from './freshness.js';
import { readGraphqMemory, summarizeMemoryForCli } from './memoryStore.js';
import { scanProject } from './scanner.js';
import { buildTaskPlan } from './taskRouter.js';

const HELP = `graphq

Usage:
  graphq [options]
  graphq init [options]
  graphq scan [options]
  graphq refresh [options]
  graphq changed [options]
  graphq status [options]
  graphq task "describe the work" [options]
  graphq impact <file> [options]
  graphq tests <file> [options]
  graphq route <route> [options]
  graphq risk <file> [options]
  graphq memory [options]
  graphq clean [options]

Options:
  --dir <path>              Project directory. Default: current directory.
  --max-file-bytes <bytes>  Skip files larger than this. Default: 524288.
  --json                    Emit machine-readable JSON output.
  --explain                 Write richer ranking explanations to .graphq/reports/explain.json.
  --help, -h                Show help.

Examples:
  graphq
  graphq task "fix auth bug"
  graphq impact src/auth/session.ts
  graphq tests src/auth/session.ts
  graphq memory
  graphq status --json
`;

export async function runGraphq(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const parsed = parseArgs(argv, io.cwd ?? process.cwd());

  if (parsed.help) {
    stdout.write(HELP);
    return 0;
  }

  if (parsed.command === 'clean') {
    await fs.rm(path.join(parsed.projectRoot, '.graphq'), { recursive: true, force: true });
    const message = 'GraphQ cache removed: .graphq\n';
    stdout.write(parsed.json ? formatJsonOutput({ ok: true, action: 'clean', message: message.trim() }) : message);
    return 0;
  }

  if (parsed.command === 'status') {
    return status(parsed.projectRoot, stdout, parsed.json);
  }

  if (parsed.command === 'memory') {
    return memory(parsed.projectRoot, stdout, parsed.json);
  }

  try {
    const previous = await readPreviousState(parsed.projectRoot);
    const memory = await readGraphqMemory(parsed.projectRoot);
    const scan = await scanProject(parsed.projectRoot, { maxFileBytes: parsed.maxFileBytes });
    const freshness = buildFreshness(previous, scan, parsed.command);
    const taskPlan = buildTaskPlan(parsed.task, scan, { memory, freshness });

    if (parsed.command === 'changed') {
      await writeGraphqOutput(parsed.projectRoot, scan, freshness, taskPlan, parsed.command, {
        explain: parsed.explain
      });
      stdout.write(parsed.json
        ? formatJsonOutput({ command: 'changed', freshness })
        : formatChanged(freshness));
      return 0;
    }

    const output = await writeGraphqOutput(parsed.projectRoot, scan, freshness, taskPlan, parsed.command, {
      explain: parsed.explain
    });

    if (parsed.command === 'impact') {
      const entry = taskPlan.impactMap[parsed.subject];
      stdout.write(parsed.json
        ? formatJsonOutput({ command: 'impact', subject: parsed.subject, impact: entry ?? null })
        : formatFileMap('Impact', parsed.subject, entry));
      return 0;
    }

    if (parsed.command === 'tests') {
      const tests = taskPlan.testsMap[parsed.subject] ?? [];
      stdout.write(parsed.json
        ? formatJsonOutput({ command: 'tests', subject: parsed.subject, tests })
        : formatList(`Likely tests for ${parsed.subject}:`, tests));
      return 0;
    }

    if (parsed.command === 'risk') {
      const risk = taskPlan.riskMap[parsed.subject];
      stdout.write(parsed.json
        ? formatJsonOutput({ command: 'risk', subject: parsed.subject, risk: risk ?? null })
        : formatRisk(parsed.subject, risk));
      return 0;
    }

    if (parsed.command === 'route') {
      const matches = filterRoutes(parsed.subject, taskPlan.routesMap);
      stdout.write(parsed.json
        ? formatJsonOutput({ command: 'route', subject: parsed.subject, routes: matches })
        : formatRoutes(parsed.subject, { routes: matches }));
      return 0;
    }

    if (parsed.json) {
      stdout.write(formatJsonOutput({
        command: parsed.command,
        contextPath: output.contextPath,
        taskPath: output.taskPath,
        task: taskPlan.task,
        contextMode: taskPlan.contextMode,
        selectedFiles: taskPlan.selectedFiles,
        primaryFiles: taskPlan.primaryFiles,
        likelyTests: taskPlan.likelyTests,
        risk: taskPlan.risk,
        suggestedTests: taskPlan.suggestedTests,
        freshness: output.freshness,
        cost: output.costReport,
        memoryDegraded: memory.degraded,
        memoryDegradedReasons: memory.degradedReasons
      }));
      return 0;
    }

    stdout.write('GraphQ context pack ready.\n');
    stdout.write('Read first: .graphq/agent/context.md\n');
    stdout.write('Avoid by default: .graphq/cache/, .graphq/maps/graph.full.json, .graphq/visuals/\n');
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function parseArgs(argv, cwd) {
  const args = [...argv];
  const options = {
    projectRoot: path.resolve(cwd),
    maxFileBytes: undefined,
    command: 'scan',
    task: '',
    subject: '',
    help: false,
    json: false,
    explain: false
  };

  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--explain') {
      options.explain = true;
      continue;
    }
    if (arg === '--dir') {
      options.projectRoot = path.resolve(cwd, readValue(args, ++index, arg));
      continue;
    }
    if (arg.startsWith('--dir=')) {
      options.projectRoot = path.resolve(cwd, arg.slice('--dir='.length));
      continue;
    }
    if (arg === '--max-file-bytes') {
      options.maxFileBytes = parsePositiveInteger(readValue(args, ++index, arg), arg);
      continue;
    }
    if (arg.startsWith('--max-file-bytes=')) {
      options.maxFileBytes = parsePositiveInteger(arg.slice('--max-file-bytes='.length), '--max-file-bytes');
      continue;
    }
    positional.push(arg);
  }

  if (positional.length) {
    options.command = normalizeCommand(positional[0]);
    const rest = positional.slice(1);
    if (options.command === 'task') options.task = rest.join(' ');
    if (['impact', 'tests', 'risk', 'route'].includes(options.command)) {
      options.subject = normalizeSubject(rest[0] ?? '');
    }
  }

  if (['impact', 'tests', 'risk', 'route'].includes(options.command) && !options.subject) {
    throw new Error(`Missing file path for graphq ${options.command}`);
  }

  return options;
}

export function formatJsonOutput(value) {
  return `${JSON.stringify(value)}\n`;
}

async function status(projectRoot, stdout, json) {
  const graphqRoot = path.join(projectRoot, '.graphq');
  const statePath = path.join(graphqRoot, 'cache/state.json');
  const freshnessPath = path.join(graphqRoot, 'reports/freshness.json');

  try {
    const [state, freshness, memory] = await Promise.all([
      fs.readFile(statePath, 'utf8').then((text) => JSON.parse(text)),
      fs.readFile(freshnessPath, 'utf8').then((text) => JSON.parse(text)).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      }),
      readGraphqMemory(projectRoot)
    ]);
    const memorySummary = summarizeMemoryForCli(memory);
    const payload = {
      command: 'status',
      files: state.fileCount ?? 0,
      lastFullScan: state.lastFullScan ?? 'never',
      stale: freshness?.stale === false ? false : Boolean(freshness?.stale),
      recommendation: state.recommendation ?? freshness?.recommendation ?? 'unknown',
      memory: memorySummary
    };

    if (json) {
      stdout.write(formatJsonOutput(payload));
      return 0;
    }

    stdout.write('GraphQ status:\n');
    stdout.write(`  files: ${payload.files}\n`);
    stdout.write(`  last full scan: ${payload.lastFullScan}\n`);
    stdout.write(`  stale: ${payload.stale ? 'yes' : freshness?.stale === false ? 'no' : 'unknown'}\n`);
    stdout.write(`  recommendation: ${payload.recommendation}\n`);
    if (memorySummary.degraded) {
      stdout.write(`  memory degraded: yes (${memorySummary.degradedReasons.join(', ')})\n`);
    }
    stdout.write(`  memory hotspots: ${memorySummary.hotspotCount}\n`);
    stdout.write(`  memory recurring patterns: ${memorySummary.recurringPatternCount}\n`);
    stdout.write(`  memory sessions: ${memorySummary.sessionCount}\n`);
    return 0;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const message = 'GraphQ has not scanned this repo yet. Run graphq scan.\n';
    stdout.write(json ? formatJsonOutput({ command: 'status', scanned: false, message: message.trim() }) : message);
    return 0;
  }
}

async function memory(projectRoot, stdout, json) {
  const memoryData = await readGraphqMemory(projectRoot);
  const summary = summarizeMemoryForCli(memoryData);

  if (json) {
    stdout.write(formatJsonOutput({ command: 'memory', ...summary }));
    return 0;
  }

  const lines = [
    'GraphQ memory:',
    `  hotspot files: ${summary.hotspotCount}`,
    `  recurring bug patterns: ${summary.recurringPatternCount}`,
    `  recent sessions: ${summary.sessionCount}`
  ];

  if (summary.degraded) {
    lines.push(`  degraded: yes (${summary.degradedReasons.join(', ')})`);
  }

  if (summary.topHotspots.length) {
    lines.push('  top hotspots:');
    for (const hotspot of summary.topHotspots) {
      lines.push(`    - ${hotspot.path} (${hotspot.selectionCount})`);
    }
  } else {
    lines.push('  top hotspots: none');
  }

  if (summary.topRecurringPatterns.length) {
    lines.push('  top recurring patterns:');
    for (const pattern of summary.topRecurringPatterns) {
      lines.push(`    - ${pattern.keyword} (${pattern.count})`);
    }
  } else {
    lines.push('  top recurring patterns: none');
  }

  lines.push('');
  stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

function normalizeCommand(value) {
  if (['init', 'scan', 'refresh'].includes(value)) return 'scan';
  if (['changed', 'task', 'status', 'memory', 'clean', 'impact', 'tests', 'risk', 'route'].includes(value)) return value;
  throw new Error(`Unknown graphq command: ${value}`);
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Invalid ${flag} value: ${value}`);
  }
  return number;
}

function formatChanged(freshness) {
  return [
    'GraphQ changed files:',
    `Changed files: ${freshness.changedFiles.length}`,
    `Added files: ${freshness.addedFiles.length}`,
    `Deleted files: ${freshness.deletedFiles.length}`,
    `Recommendation: ${freshness.recommendation}`,
    ''
  ].join('\n');
}

function formatFileMap(title, subject, value) {
  if (!value) return `${title}: no entry for ${subject}\n`;
  const lines = [`${title} for ${subject}:`];
  if (value.imports?.length) lines.push(`  imports: ${value.imports.join(', ')}`);
  else lines.push('  imports: none');
  if (value.directDependents?.length) lines.push(`  direct dependents: ${value.directDependents.join(', ')}`);
  else lines.push('  direct dependents: none');
  if (value.indirectDependents?.length) lines.push(`  indirect dependents: ${value.indirectDependents.join(', ')}`);
  else lines.push('  indirect dependents: none');
  if (value.maxDepth) lines.push(`  max depth: ${value.maxDepth}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatRisk(subject, value) {
  if (!value) return `Risk: no entry for ${subject}\n`;
  const lines = [`Risk for ${subject}: ${value.risk}`];
  if (value.score !== undefined) lines.push(`  score: ${value.score}`);
  lines.push(...value.reasons.map((reason) => `  - ${reason}`), '');
  return `${lines.join('\n')}\n`;
}

function formatList(title, values) {
  if (!values.length) return `${title}\n  none\n`;
  const lines = [title];
  for (const value of values) {
    if (typeof value === 'string') {
      lines.push(`  - ${value}`);
      continue;
    }
    const reasonText = value.reasons?.length ? ` (${value.reasons.join('; ')})` : '';
    lines.push(`  - ${value.path}${reasonText}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function filterRoutes(subject, routesMap) {
  return (routesMap?.routes ?? []).filter((entry) =>
    entry.route === subject || entry.route.includes(subject) || subject.includes(entry.route)
  );
}

function formatRoutes(subject, routesMap) {
  const matches = filterRoutes(subject, routesMap);
  if (!matches.length) return `Routes for ${subject}:\n  none\n`;

  const lines = [`Routes for ${subject}:`];
  for (const match of matches) {
    lines.push(`  - ${match.route} -> ${match.handler}`);
    if (match.related?.length) lines.push(`    related: ${match.related.join(', ')}`);
    if (match.likelyTests?.length) lines.push(`    likely tests: ${match.likelyTests.join(', ')}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function normalizeSubject(value) {
  return String(value).replaceAll('\\', '/');
}