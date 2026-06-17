import fs from 'node:fs/promises';
import path from 'node:path';

export const MAP_VERSION = 'graphq-v3';
export const MEMORY_SCHEMA_VERSION = 'graphq-memory-v1';

const BUG_TASK_WORDS = new Set([
  'bug',
  'fix',
  'broken',
  'failing',
  'failure',
  'regression',
  'crash',
  'wrong',
  'issue',
  'defect'
]);

const RECURRING_KEYWORDS = [
  'auth',
  'token',
  'jwt',
  'db',
  'database',
  'route',
  'api',
  'test',
  'graphq',
  'ranking',
  'scan',
  'import',
  'dependency',
  'security',
  'config',
  'cli'
];

const MAX_PATTERN_FILES = 5;
const MAX_TASK_LENGTH = 120;
const MAX_HOTSPOT_FILES = 100;
const MAX_RECURRING_PATTERNS = 30;
const MAX_SESSIONS = 200;

export function isBugLikeTask(task) {
  return tokenize(task).some((token) => BUG_TASK_WORDS.has(token));
}

export function extractRecurringKeywords(task) {
  const tokens = new Set(tokenize(task));
  return RECURRING_KEYWORDS.filter((keyword) => tokens.has(keyword));
}

export function safeMemoryPath(rootDir, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Memory path must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(rootDir, relativePath);
  const baseWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (resolved !== rootDir && !resolved.startsWith(baseWithSep)) {
    throw new Error(`Refusing to write outside memory root: ${relativePath}`);
  }
  return resolved;
}

export async function readMemoryJsonSafe(filePath, fallback = null) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object') {
      return { data: fallback, degraded: true, reason: 'invalid schema' };
    }
    return { data, degraded: false, reason: null };
  } catch (error) {
    if (error.code === 'ENOENT') return { data: fallback, degraded: false, reason: null };
    return { data: fallback, degraded: true, reason: error instanceof SyntaxError ? 'corrupt json' : 'read error' };
  }
}

export async function readGraphqMemory(projectRoot) {
  const memoryRoot = path.join(projectRoot, '.graphq', 'memory');
  const reportsRoot = path.join(projectRoot, '.graphq', 'reports');
  const degradedReasons = [];

  const [hotspotsResult, recurringResult, sessionsResult] = await Promise.all([
    readMemoryJsonSafe(path.join(memoryRoot, 'hotspots.json'), { generatedAt: null, files: {} }),
    readMemoryJsonSafe(path.join(memoryRoot, 'recurring-bugs.json'), { generatedAt: null, patterns: {} }),
    readSessionsSafe(path.join(memoryRoot, 'sessions.jsonl'))
  ]);

  if (hotspotsResult.degraded) degradedReasons.push(`hotspots: ${hotspotsResult.reason}`);
  if (recurringResult.degraded) degradedReasons.push(`recurring-bugs: ${recurringResult.reason}`);
  if (sessionsResult.degraded) degradedReasons.push(`sessions: ${sessionsResult.reason}`);

  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    hotspots: hotspotsResult.data ?? { generatedAt: null, files: {} },
    recurringBugs: recurringResult.data ?? { generatedAt: null, patterns: {} },
    sessions: sessionsResult.data ?? [],
    degraded: degradedReasons.length > 0,
    degradedReasons
  };
}

export async function updateGraphqMemory(projectRoot, { scan, taskPlan, freshness, costReport, command }) {
  const generatedAt = scan.generatedAt;
  const graphqRoot = path.join(projectRoot, '.graphq');
  const memoryRoot = path.join(graphqRoot, 'memory');
  await fs.mkdir(memoryRoot, { recursive: true });

  const existing = await readGraphqMemory(projectRoot);
  const hotspots = boundHotspots(updateHotspots(existing.hotspots, taskPlan, taskPlan.riskMap, generatedAt));
  const recurringBugs = boundRecurringBugs(updateRecurringBugs(existing.recurringBugs, taskPlan, generatedAt));
  const suggestions = renderMemorySuggestions(hotspots, recurringBugs, taskPlan);

  await Promise.all([
    writeMemoryJson(memoryRoot, 'hotspots.json', {
      schemaVersion: MEMORY_SCHEMA_VERSION,
      ...hotspots
    }),
    writeMemoryJson(memoryRoot, 'recurring-bugs.json', {
      schemaVersion: MEMORY_SCHEMA_VERSION,
      ...recurringBugs
    }),
    writeMemoryText(graphqRoot, 'reports/memory-suggestions.md', suggestions),
    appendSession(memoryRoot, {
      time: generatedAt,
      command,
      task: taskPlan.task,
      files: taskPlan.selectedFiles,
      tests: taskPlan.likelyTests,
      contextMode: taskPlan.contextMode,
      risk: taskPlan.risk,
      freshnessRecommendation: freshness.recommendation,
      mapVersion: MAP_VERSION,
      memorySchemaVersion: MEMORY_SCHEMA_VERSION,
      result: null,
      filesScanned: costReport.filesScanned,
      filesSkipped: costReport.filesSkipped,
      estimatedTokensAvoided: costReport.estimatedTokensAvoided
    })
  ]);

  await compactSessions(memoryRoot);

  return { hotspots, recurringBugs };
}

export function summarizeMemoryForCli(memory) {
  const hotspotFiles = Object.entries(memory.hotspots?.files ?? {})
    .sort((a, b) => b[1].selectionCount - a[1].selectionCount || a[0].localeCompare(b[0]));
  const recurringPatterns = Object.entries(memory.recurringBugs?.patterns ?? {})
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

  return {
    schemaVersion: memory.schemaVersion ?? MEMORY_SCHEMA_VERSION,
    degraded: memory.degraded ?? false,
    degradedReasons: memory.degradedReasons ?? [],
    hotspotCount: hotspotFiles.length,
    recurringPatternCount: recurringPatterns.length,
    sessionCount: memory.sessions.length,
    topHotspots: hotspotFiles.slice(0, 3).map(([filePath, entry]) => ({
      path: filePath,
      selectionCount: entry.selectionCount
    })),
    topRecurringPatterns: recurringPatterns.slice(0, 3).map(([keyword, entry]) => ({
      keyword,
      count: entry.count
    }))
  };
}

function updateHotspots(existing, taskPlan, riskMap, generatedAt) {
  const files = { ...(existing?.files ?? {}) };

  for (const filePath of taskPlan.selectedFiles) {
    const current = files[filePath] ?? {
      selectionCount: 0,
      highRiskSelectionCount: 0,
      bugFixSelectionCount: 0
    };

    current.selectionCount += 1;
    if (riskMap[filePath]?.risk === 'high') current.highRiskSelectionCount += 1;
    if (isBugLikeTask(taskPlan.task)) current.bugFixSelectionCount += 1;
    current.lastSelectedAt = generatedAt;
    current.lastTask = compactTask(taskPlan.task);
    current.risk = riskMap[filePath]?.risk ?? 'low';
    files[filePath] = current;
  }

  const orderedFiles = Object.fromEntries(
    Object.keys(files).sort().map((filePath) => [filePath, files[filePath]])
  );

  return {
    generatedAt,
    files: orderedFiles
  };
}

function boundHotspots(hotspots) {
  const entries = Object.entries(hotspots.files ?? {})
    .sort((a, b) => b[1].selectionCount - a[1].selectionCount || a[0].localeCompare(b[0]))
    .slice(0, MAX_HOTSPOT_FILES);
  return {
    generatedAt: hotspots.generatedAt,
    files: Object.fromEntries(entries)
  };
}

function updateRecurringBugs(existing, taskPlan, generatedAt) {
  const patterns = { ...(existing?.patterns ?? {}) };
  if (!isBugLikeTask(taskPlan.task)) {
    return {
      generatedAt: existing?.generatedAt ?? generatedAt,
      patterns: sortPatterns(patterns)
    };
  }

  const keywords = extractRecurringKeywords(taskPlan.task);
  const associatedFiles = taskPlan.primaryFiles.slice(0, MAX_PATTERN_FILES);

  for (const keyword of keywords) {
    const current = patterns[keyword] ?? { count: 0, files: [] };
    current.count += 1;
    current.files = unique([...current.files, ...associatedFiles])
      .filter((filePath) => typeof filePath === 'string')
      .sort()
      .slice(0, MAX_PATTERN_FILES);
    current.lastTask = compactTask(taskPlan.task);
    current.lastSeenAt = generatedAt;
    patterns[keyword] = current;
  }

  return {
    generatedAt,
    patterns: sortPatterns(patterns)
  };
}

function boundRecurringBugs(recurringBugs) {
  const entries = Object.entries(recurringBugs.patterns ?? {})
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, MAX_RECURRING_PATTERNS);
  return {
    generatedAt: recurringBugs.generatedAt,
    patterns: Object.fromEntries(entries)
  };
}

function renderMemorySuggestions(hotspots, recurringBugs, taskPlan) {
  const lines = [
    '# GraphQ Memory Suggestions',
    '',
    '## Candidate Learnings'
  ];

  const topHotspots = Object.entries(hotspots.files)
    .sort((a, b) => b[1].selectionCount - a[1].selectionCount || a[0].localeCompare(b[0]))
    .slice(0, 3);

  if (topHotspots.length) {
    for (const [filePath, entry] of topHotspots) {
      lines.push(`- Candidate learning: GraphQ ${compactTask(entry.lastTask ?? taskPlan.task).toLowerCase()} tasks often involve ${filePath}.`);
    }
  } else {
    lines.push('- Candidate learning: No durable hotspot files yet.');
  }

  const topPatterns = Object.entries(recurringBugs.patterns)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 3);

  if (topPatterns.length) {
    for (const [keyword, pattern] of topPatterns) {
      const files = pattern.files?.length ? pattern.files.join(', ') : 'related files';
      lines.push(`- Candidate learning: Recurring ${keyword} bug tasks often touch ${files}.`);
    }
  }

  lines.push('', '## Candidate Decisions');
  lines.push('- Candidate decision: Do not commit .graphq/ output.');
  lines.push('- Candidate decision: Treat GraphQ memory as a weak signal, not verified truth.');
  lines.push('- Candidate decision: Refresh GraphQ before risky edits when freshness recommends it.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function appendSession(memoryRoot, session) {
  const safeSession = sanitizeSession(session);
  await fs.appendFile(
    safeMemoryPath(memoryRoot, 'sessions.jsonl'),
    `${JSON.stringify(safeSession)}\n`,
    'utf8'
  );
}

async function compactSessions(memoryRoot) {
  const filePath = safeMemoryPath(memoryRoot, 'sessions.jsonl');
  const { data: sessions, degraded } = await readSessionsSafe(filePath);
  if (degraded || sessions.length <= MAX_SESSIONS) return;

  const trimmed = sessions.slice(-MAX_SESSIONS);
  await fs.writeFile(
    filePath,
    `${trimmed.map((session) => JSON.stringify(session)).join('\n')}\n`,
    'utf8'
  );
}

async function readSessionsSafe(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const sessions = [];
    let degraded = false;
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      try {
        sessions.push(JSON.parse(line));
      } catch {
        degraded = true;
      }
    }
    return { data: sessions, degraded, reason: degraded ? 'corrupt session line' : null };
  } catch (error) {
    if (error.code === 'ENOENT') return { data: [], degraded: false, reason: null };
    return { data: [], degraded: true, reason: 'read error' };
  }
}

async function writeMemoryJson(memoryRoot, relativePath, value) {
  await fs.writeFile(
    safeMemoryPath(memoryRoot, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

async function writeMemoryText(graphqRoot, relativePath, content) {
  const normalized = relativePath.replace(/^reports\//, '');
  const reportsRoot = path.join(graphqRoot, 'reports');
  await fs.mkdir(reportsRoot, { recursive: true });
  await fs.writeFile(safeMemoryPath(reportsRoot, normalized), content, 'utf8');
}

function sanitizeSession(session) {
  return {
    ...session,
    task: compactTask(session.task),
    files: (session.files ?? []).slice(0, 12),
    tests: (session.tests ?? []).slice(0, 8)
  };
}

function sortPatterns(patterns) {
  return Object.fromEntries(
    Object.keys(patterns).sort().map((keyword) => [keyword, patterns[keyword]])
  );
}

function compactTask(task) {
  const trimmed = String(task ?? '').trim();
  return trimmed.length > MAX_TASK_LENGTH ? `${trimmed.slice(0, MAX_TASK_LENGTH - 3)}...` : trimmed;
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}