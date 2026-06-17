import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCostReport } from './costTracker.js';
import { buildHashes, buildState } from './freshness.js';
import { updateGraphqMemory } from './memoryStore.js';

export async function writeGraphqOutput(projectRoot, scan, freshness, taskPlan, command, options = {}) {
  const graphqRoot = path.join(projectRoot, '.graphq');
  const costReport = buildCostReport(scan, taskPlan, freshness);
  const now = scan.generatedAt;

  await Promise.all([
    mkdirSafe(graphqRoot, 'agent'),
    mkdirSafe(graphqRoot, 'maps'),
    mkdirSafe(graphqRoot, 'cache'),
    mkdirSafe(graphqRoot, 'memory'),
    mkdirSafe(graphqRoot, 'reports')
  ]);

  await Promise.all([
    writeText(graphqRoot, 'README.md', graphqReadme()),
    writeText(graphqRoot, 'agent/context.md', renderContext(taskPlan)),
    writeText(graphqRoot, 'agent/task.md', renderTask(taskPlan, scan)),
    writeText(graphqRoot, 'agent/repo.md', renderRepo(scan)),
    writeText(graphqRoot, 'agent/instructions.md', agentInstructions()),
    writeJson(graphqRoot, 'maps/files.json', renderFiles(scan)),
    writeJson(graphqRoot, 'maps/graph.min.json', renderGraphMin(scan)),
    writeJson(graphqRoot, 'maps/impact.json', stableObjectFromEntries(taskPlan.impactMap)),
    writeJson(graphqRoot, 'maps/tests.json', stableObjectFromEntries(taskPlan.testsMap)),
    writeJson(graphqRoot, 'maps/risk.json', stableObjectFromEntries(taskPlan.riskMap)),
    writeJson(graphqRoot, 'maps/symbols.json', renderSymbols(scan)),
    writeJson(graphqRoot, 'maps/routes.json', taskPlan.routesMap),
    writeJson(graphqRoot, 'maps/dependencies.json', renderDependencies(scan)),
    writeJson(graphqRoot, 'cache/hashes.json', buildHashes(scan)),
    writeJson(graphqRoot, 'cache/state.json', buildState(scan, freshness, command)),
    writeJson(graphqRoot, 'reports/freshness.json', freshness),
    writeJson(graphqRoot, 'reports/cost.json', costReport),
    writeJson(graphqRoot, 'reports/security.json', renderSecurity(scan))
  ]);

  await ensureText(graphqRoot, 'memory/decisions.md', '# GraphQ Decisions\n\n');
  await ensureText(graphqRoot, 'memory/learnings.md', '# GraphQ Learnings\n\n');

  if (options.explain) {
    await writeJson(graphqRoot, 'reports/explain.json', {
      generatedAt: now,
      task: taskPlan.task,
      contextMode: taskPlan.contextMode,
      ranking: taskPlan.ranking ?? [],
      reasons: stableObjectFromEntries(taskPlan.reasons)
    });
  }

  await updateGraphqMemory(projectRoot, {
    scan,
    taskPlan,
    freshness,
    costReport,
    command
  });

  return {
    contextPath: '.graphq/agent/context.md',
    taskPath: '.graphq/agent/task.md',
    freshness,
    costReport
  };
}

function renderContext(taskPlan) {
  const lines = [
    '# GraphQ Context',
    '',
    'Task:',
    taskPlan.task,
    '',
    'Read these files first:',
    ''
  ];

  if (taskPlan.selectedFiles.length) {
    taskPlan.selectedFiles.forEach((filePath, index) => {
      lines.push(`${index + 1}. ${filePath}`);
    });
  } else {
    lines.push('No specific files selected yet.');
  }

  lines.push('', 'Why:', '');
  for (const filePath of taskPlan.selectedFiles) {
    const reasons = taskPlan.reasons[filePath] ?? ['Relevant by filename and project structure.'];
    lines.push(`* ${filePath}: ${reasons.join(' ')}`);
  }

  lines.push('', 'Risk:', `${taskPlan.risk}.`);
  lines.push('', 'Suggested tests:');
  if (taskPlan.suggestedTests.length) {
    taskPlan.suggestedTests.forEach((command) => lines.push(`* ${command}`));
  } else {
    lines.push('* No obvious test command found.');
  }

  lines.push('', 'Avoid:');
  taskPlan.avoid.forEach((item) => lines.push(`* ${item}`));
  lines.push('', 'Context mode:', sentenceCase(taskPlan.contextMode) + '.');
  lines.push('', 'Do not read cache/ or visuals/ by default. Do not dump source code into this file.');

  return `${lines.join('\n')}\n`;
}

function renderTask(taskPlan, scan) {
  return [
    '# GraphQ Task',
    '',
    `Project: ${scan.project.name}`,
    `Task: ${taskPlan.task}`,
    `Context mode: ${sentenceCase(taskPlan.contextMode)}`,
    `Risk: ${taskPlan.risk}`,
    '',
    'Inputs used:',
    '* task text',
    '* README/package metadata',
    '* filenames and lightweight symbols',
    scan.tokenmaxxingMemory ? '* .tokenmaxxing.md project memory' : '* no .tokenmaxxing.md project memory found',
    '',
    'Selected files:',
    ...taskPlan.selectedFiles.map((filePath) => `* ${filePath}`),
    '',
    'Likely tests:',
    ...(taskPlan.likelyTests.length ? taskPlan.likelyTests.map((filePath) => `* ${filePath}`) : ['* None found']),
    ''
  ].join('\n');
}

function renderRepo(scan) {
  const categories = countBy(scan.files, (file) => file.category);
  const languages = countBy(scan.files, (file) => file.language);
  const lines = [
    '# GraphQ Repo',
    '',
    `Name: ${scan.project.name}`,
    `Type: ${scan.project.type}`,
    `Package manager: ${scan.project.packageManager ?? 'unknown'}`,
    scan.project.readmeTitle ? `README title: ${scan.project.readmeTitle}` : null,
    '',
    'Categories:',
    ...Object.entries(categories).map(([name, count]) => `* ${name}: ${count}`),
    '',
    'Languages:',
    ...Object.entries(languages).map(([name, count]) => `* ${name}: ${count}`),
    '',
    'Known scripts:',
    ...Object.entries(scan.project.scripts).map(([name, command]) => `* ${name}: ${command}`),
    '',
    'Project memory:',
    ...(scan.tokenmaxxingMemory?.summary?.length
      ? scan.tokenmaxxingMemory.summary.map((line) => `* ${line.replace(/^-\s*/, '')}`)
      : ['* None found']),
    ''
  ].filter((line) => line !== null);

  return `${lines.join('\n')}\n`;
}

function agentInstructions() {
  return `# GraphQ Agent Instructions

Read \`.graphq/agent/context.md\` first.

Use deeper maps only if needed:

* \`.graphq/maps/impact.json\` for risky edits
* \`.graphq/maps/tests.json\` after changing files
* \`.graphq/maps/risk.json\` before touching auth, db, config, or security files
* \`.graphq/maps/graph.min.json\` for compact dependency context

Do not read by default:

* \`.graphq/cache/\`
* \`.graphq/maps/graph.full.json\`
* \`.graphq/visuals/\`

Run or refresh GraphQ when:

* a task affects 3+ files
* a task involves auth, db, routing, security, performance, or tests
* the repo is unknown
* the graph is stale
* architecture is unclear

Skip deep GraphQ when:

* typo fix
* docs-only edit
* one obvious file
* formatting-only change

Always prefer the smallest useful context.
`;
}

function graphqReadme() {
  return `# GraphQ

GraphQ is a local-first repo intelligence cache for AI coding agents.

Start with \`.graphq/agent/context.md\`. The larger maps and cache files are for tools and follow-up inspection, not default model context.

Generated files are metadata only. GraphQ does not store full source code in agent context files or compact graph maps.
`;
}

function renderFiles(scan) {
  return {
    generatedAt: scan.generatedAt,
    files: scan.files.map(({ path, language, category, size, hash, tags, imports, exports, symbols, routes, usesEnv }) => ({
      path,
      language,
      category,
      size,
      hash,
      tags,
      imports,
      exports,
      symbols,
      routes,
      usesEnv
    })),
    skipped: [...scan.skipped].sort((a, b) => a.path.localeCompare(b.path))
  };
}

function renderGraphMin(scan) {
  return {
    generatedAt: scan.generatedAt,
    project: scan.project,
    files: scan.files.map((file) => ({
      path: file.path,
      language: file.language,
      category: file.category,
      tags: file.tags,
      imports: file.imports,
      exports: file.exports,
      symbols: file.symbols,
      routes: file.routes
    })),
    dependencies: scan.dependencies
  };
}

function renderSymbols(scan) {
  return {
    generatedAt: scan.generatedAt,
    symbols: scan.files.flatMap((file) =>
      file.symbols.map((symbol) => ({
        name: symbol,
        path: file.path,
        language: file.language,
        exported: file.exports.includes(symbol)
      }))
    ).sort((a, b) => `${a.name}:${a.path}`.localeCompare(`${b.name}:${b.path}`))
  };
}

function renderDependencies(scan) {
  return {
    generatedAt: scan.generatedAt,
    package: {
      manager: scan.project.packageManager,
      scripts: scan.project.scripts,
      dependencies: scan.project.dependencies ?? [],
      devDependencies: scan.project.devDependencies ?? []
    },
    internal: scan.dependencies,
    external: scan.externalImports ?? []
  };
}

function renderSecurity(scan) {
  const findings = [...scan.securityFindings].sort((a, b) =>
    `${a.path}:${String(a.line).padStart(8, '0')}:${a.kind}`.localeCompare(
      `${b.path}:${String(b.line).padStart(8, '0')}:${b.kind}`
    )
  );
  return {
    generatedAt: scan.generatedAt,
    summary: {
      findings: findings.length
    },
    findings
  };
}

export function stableObjectFromEntries(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, record[key]])
  );
}

async function mkdirSafe(graphqRoot, relativePath) {
  await fs.mkdir(safeGraphqPath(graphqRoot, relativePath), { recursive: true });
}

async function writeJson(graphqRoot, relativePath, value) {
  await writeText(graphqRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(graphqRoot, relativePath, content) {
  await fs.writeFile(safeGraphqPath(graphqRoot, relativePath), content, 'utf8');
}

async function ensureText(graphqRoot, relativePath, content) {
  const absolutePath = safeGraphqPath(graphqRoot, relativePath);
  try {
    await fs.stat(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(absolutePath, content, 'utf8');
  }
}

function safeGraphqPath(graphqRoot, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`GraphQ path must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(graphqRoot, relativePath);
  const baseWithSep = graphqRoot.endsWith(path.sep) ? graphqRoot : `${graphqRoot}${path.sep}`;
  if (resolved !== graphqRoot && !resolved.startsWith(baseWithSep)) {
    throw new Error(`Refusing to write outside .graphq: ${relativePath}`);
  }
  return resolved;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sentenceCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
