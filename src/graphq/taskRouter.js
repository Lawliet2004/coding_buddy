import { pathTokens } from './fileClassifier.js';

const HIGH_CONTEXT_WORDS = new Set([
  'refactor',
  'bug',
  'auth',
  'jwt',
  'token',
  'database',
  'db',
  'routing',
  'route',
  'security',
  'performance',
  'architecture',
  'dependency',
  'tests',
  'migration',
  'api'
]);

const LOW_CONTEXT_WORDS = new Set(['typo', 'docs', 'readme', 'formatting', 'comment', 'spelling']);

export function buildTaskPlan(task, scan, options = {}) {
  const normalizedTask = normalizeTask(task);
  const taskTokens = tokenize(normalizedTask);
  const memory = options.memory ?? null;
  const freshness = options.freshness ?? null;
  const contextMode = selectContextMode(normalizedTask, taskTokens, scan);
  const impactMap = buildImpactMap(scan);
  const testsMap = buildTestsMap(scan);
  const riskMap = buildRiskMap(scan, testsMap);
  const routesMap = buildRoutesMap(scan, testsMap, impactMap);
  const rankedFiles = rankFiles(scan.files, taskTokens, riskMap, memory, scan, freshness);
  const primaryFiles = rankedFiles
    .filter((item) => item.file.category !== 'test')
    .slice(0, contextMode === 'low' ? 2 : contextMode === 'full' ? 6 : 4)
    .map((item) => item.file.path);
  const likelyTests = unique(primaryFiles.flatMap((filePath) => testPathsForSource(testsMap[filePath])));
  const selectedFiles = unique([...primaryFiles, ...likelyTests]).slice(0, contextMode === 'high' || contextMode === 'full' ? 8 : 6);
  const highestRisk = selectedFiles.some((filePath) => riskMap[filePath]?.risk === 'high') ? 'High'
    : selectedFiles.some((filePath) => riskMap[filePath]?.risk === 'medium') ? 'Medium'
    : 'Low';
  const rankingByPath = new Map(rankedFiles.map((item) => [item.file.path, item]));

  return {
    task: normalizedTask,
    contextMode,
    selectedFiles,
    primaryFiles,
    likelyTests,
    risk: highestRisk,
    riskMap,
    testsMap,
    impactMap,
    routesMap,
    suggestedTests: suggestTestCommands(scan.project, likelyTests),
    avoid: suggestAvoid(taskTokens),
    reasons: buildReasons(selectedFiles, scan, riskMap, testsMap, rankingByPath, routesMap),
    ranking: rankedFiles.slice(0, 12).map((item) => ({
      path: item.file.path,
      score: item.score,
      reasons: item.reasons
    }))
  };
}

export function buildRiskMap(scan, testsMap = buildTestsMap(scan)) {
  const dependentCounts = dependentCountMap(scan.dependencies);
  const hotspots = new Set(scan.tokenmaxxingMemory?.summary
    ?.filter((line) => /risk|hotspot|high-risk/i.test(line))
    .flatMap((line) => scan.files.filter((file) => line.includes(file.path)).map((file) => file.path)) ?? []);

  return Object.fromEntries(scan.files.map((file) => {
    const reasons = [];
    const isTest = file.category === 'test';
    const isConfig = file.category === 'config' || file.tags.includes('config');
    const isBinWrapper = file.path.startsWith('bin/');
    const hasRelatedTests = testPathsForSource(testsMap[file.path]).length > 0;

    if (isTest) {
      if (file.size > 20_000) addRisk(reasons, 'large file', 1);
    } else if (isConfig) {
      addRisk(reasons, 'configuration file', 2);
      if (file.usesEnv && !isBinWrapper) addRisk(reasons, 'environment variable usage', 1);
    } else if (isBinWrapper) {
      if (file.usesEnv) addRisk(reasons, 'reads environment in CLI wrapper', 1);
      if (file.size > 20_000) addRisk(reasons, 'large file', 1);
    } else {
      if (file.tags.includes('auth')) addRisk(reasons, 'auth/security-sensitive path', 4);
      if (file.tags.includes('database') || file.category === 'database') addRisk(reasons, 'database or migration path', 4);
      if (file.tags.includes('api') || file.tags.includes('routing') || file.routes.length) {
        addRisk(reasons, 'API or routing path', 3);
      }
      if (file.usesEnv) addRisk(reasons, 'environment variable usage', 2);
      if ((dependentCounts.get(file.path) ?? 0) >= 3) {
        addRisk(reasons, `used by ${dependentCounts.get(file.path)} files`, 2);
      }
      if (file.size > 20_000) addRisk(reasons, 'large file', 1);
      if (!hasRelatedTests) addRisk(reasons, 'no obvious related test', 2);
      if (hotspots.has(file.path)) addRisk(reasons, 'listed in project memory as risky', 2);
    }

    const score = reasons.reduce((sum, reason) => sum + reason.weight, 0);
    const risk = isTest
      ? (score >= 2 ? 'medium' : 'low')
      : score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
    return [file.path, { risk, score, reasons: reasons.map((reason) => reason.text) }];
  }));
}

export function buildTestsMap(scan) {
  const tests = scan.files.filter((file) => file.category === 'test');
  const sources = scan.files.filter((file) => file.category !== 'test');
  const importLookup = new Set(scan.dependencies.map((dependency) => `${dependency.from}:${dependency.to}`));

  const entries = sources.map((source) => {
    const ranked = tests
      .map((test) => scoreTestForSource(source, test, importLookup))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, 3);
    return [source.path, ranked];
  });
  return Object.fromEntries(entries);
}

export function buildImpactMap(scan, options = {}) {
  const maxDepth = options.maxDepth ?? 10;
  const impact = Object.fromEntries(scan.files.map((file) => [
    file.path,
    { directDependents: [], indirectDependents: [], imports: [], maxDepth: 0 }
  ]));

  for (const dependency of scan.dependencies) {
    impact[dependency.to]?.directDependents.push(dependency.from);
    impact[dependency.from]?.imports.push(dependency.to);
  }

  for (const [filePath, entry] of Object.entries(impact)) {
    entry.directDependents = entry.directDependents.filter((dependent) => dependent !== filePath).sort();
    entry.imports = entry.imports.filter((importPath) => importPath !== filePath).sort();
    entry.indirectDependents = collectIndirectDependents(filePath, entry.directDependents, impact, maxDepth);
    entry.maxDepth = computeDependencyDepth(filePath, entry.directDependents, impact, maxDepth);
  }

  return impact;
}

export function buildRoutesMap(scan, testsMap, impactMap) {
  const routes = scan.files.flatMap((file) => {
    const related = impactMap[file.path]?.imports ?? [];
    const likelyTests = unique([
      ...testPathsForSource(testsMap[file.path]),
      ...related.flatMap((relatedPath) => testPathsForSource(testsMap[relatedPath]))
    ]).slice(0, 3);

    return file.routes.map((route) => ({
      route,
      handler: file.path,
      related,
      likelyTests
    }));
  });

  return {
    generatedAt: scan.generatedAt,
    routes: routes.sort((a, b) => `${a.route}:${a.handler}`.localeCompare(`${b.route}:${b.handler}`))
  };
}

function rankFiles(files, taskTokens, riskMap, memory, scan, freshness) {
  const ranked = files
    .map((file) => scoreFile(file, taskTokens, riskMap[file.path], memory, scan, freshness))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  if (ranked.length) return ranked;

  return files
    .filter((file) => file.category !== 'test')
    .map((file) => scoreFile(file, taskTokens, riskMap[file.path], memory, scan, freshness))
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
}

function scoreFile(file, taskTokens, risk, memory, scan, freshness) {
  const filePathTokens = pathTokens(file.path);
  const basename = pathStem(file.path);
  const basenameTokens = pathTokens(basename);
  const filePathTokenSet = new Set(filePathTokens);
  const basenameTokenSet = new Set(basenameTokens);
  const reasons = [];
  let score = 0;

  for (const token of taskTokens) {
    if (basenameTokenSet.has(token)) {
      score += 8;
      reasons.push('filename match');
    } else if (filePathTokenSet.has(token)) {
      score += 4;
      reasons.push('filename match');
    }
    if (file.tags.includes(token)) {
      score += 3;
      reasons.push('tag match');
    }
    if (!isRedundantGraphqToken(file, token) && file.exports.some((symbol) => tokenize(symbol).includes(token))) {
      score += 3;
      reasons.push('symbol match');
    }
    if (!isRedundantGraphqToken(file, token) && file.symbols.some((symbol) => tokenize(symbol).includes(token))) {
      score += 2;
      reasons.push('symbol match');
    }
  }

  if (file.routes.length && taskTokens.some((token) => ['route', 'routes', 'routing', 'api'].includes(token))) {
    score += 2;
    reasons.push('route match');
  }

  if (file.category === 'test') score -= 2;
  if (isBarrelEntrypoint(file)) {
    score -= 8;
    reasons.push('barrel entrypoint penalty');
  }
  if (isBinEntrypoint(file) && !taskMentionsCli(taskTokens)) {
    score -= 6;
    reasons.push('bin wrapper penalty');
  }
  if (isCliModule(file) && !taskMentionsCli(taskTokens)) {
    score -= 5;
    reasons.push('cli wrapper penalty');
  }
  if (isGraphqPipelineModule(file) && taskTokens.includes('graphq') && taskMentionsInternals(taskTokens)) {
    score += 5;
    reasons.push('graphq implementation boost');
  }
  if (isSupportModule(file) && !taskTokens.includes(pathStem(file.path).toLowerCase())) {
    score -= 4;
    reasons.push('support module penalty');
  }
  if (matchesOnlyGenericGraphqPath(file, taskTokens, basenameTokenSet, filePathTokenSet)) {
    score -= 3;
    reasons.push('generic graphq path penalty');
  }

  if (risk?.risk === 'high' && taskTokens.some((token) => HIGH_CONTEXT_WORDS.has(token))) {
    reasons.push('risk reason');
  }

  if (memory && scan) {
    const boost = memoryBoostForFile(file, taskTokens, memory, scan);
    if (boost > 0) {
      score += boost;
      reasons.push('memory weak boost');
    }
  }

  if (freshness && shouldUseFreshnessBoost(taskTokens)) {
    const changed = new Set([
      ...(freshness.changedFiles ?? []),
      ...(freshness.addedFiles ?? [])
    ]);
    if (changed.has(file.path)) {
      score += 1;
      reasons.push('changed-file weak boost');
    }
  }

  return {
    file,
    score,
    reasons: unique(reasons)
  };
}

function shouldUseFreshnessBoost(taskTokens) {
  return taskTokens.some((token) => BUG_TASK_WORDS.has(token) || ['review', 'recent', 'regression', 'changed'].includes(token));
}

function memoryBoostForFile(file, taskTokens, memory, scan) {
  const scannedPaths = new Set(scan.files.map((entry) => entry.path));
  if (!scannedPaths.has(file.path)) return 0;

  let boost = 0;
  const hotspot = memory.hotspots?.files?.[file.path];
  if (hotspot?.selectionCount >= 2) boost += 1;
  if (hotspot?.bugFixSelectionCount >= 1 && taskTokens.some((token) => BUG_TASK_WORDS.has(token))) {
    boost += 1;
  }

  if (taskTokens.some((token) => BUG_TASK_WORDS.has(token))) {
    for (const [keyword, pattern] of Object.entries(memory.recurringBugs?.patterns ?? {})) {
      if (!taskTokens.includes(keyword)) continue;
      if (pattern.files?.includes(file.path)) {
        boost += 1;
        break;
      }
    }
  }

  return Math.min(boost, 2);
}

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

function matchesOnlyGenericGraphqPath(file, taskTokens, basenameTokenSet, filePathTokenSet) {
  if (!file.path.includes('/graphq/') && !file.path.startsWith('graphq/')) return false;
  const specificMatch = taskTokens.some((token) => token !== 'graphq' && (
    basenameTokenSet.has(token)
    || file.exports.some((symbol) => tokenize(symbol).includes(token))
    || file.symbols.some((symbol) => tokenize(symbol).includes(token))
  ));
  return !specificMatch && filePathTokenSet.has('graphq') && !basenameTokenSet.has('graphq');
}

function isBarrelEntrypoint(file) {
  const name = file.path.split('/').at(-1) ?? '';
  if (!/^index\.(js|ts|tsx|mjs|cjs)$/.test(name)) return false;
  if (file.size < 200) return true;
  return file.exports.length <= 2 && file.imports.length > 0 && file.symbols.length === 0;
}

function isBinEntrypoint(file) {
  return file.path.startsWith('bin/');
}

function isCliModule(file) {
  return pathStem(file.path).toLowerCase() === 'cli' && !isBinEntrypoint(file);
}

function isRedundantGraphqToken(file, token) {
  return token === 'graphq' && file.path.includes('/graphq/');
}

function isGraphqPipelineModule(file) {
  const moduleName = pathStem(file.path).toLowerCase();
  return file.path.startsWith('src/graphq/')
    && ['taskrouter', 'scanner', 'fileclassifier', 'contextpackwriter'].includes(moduleName);
}

function isSupportModule(file) {
  const moduleName = pathStem(file.path).toLowerCase();
  return ['freshness', 'costtracker', 'index'].includes(moduleName);
}

function taskMentionsCli(taskTokens) {
  return taskTokens.some((token) => ['cli', 'bin', 'command', 'entrypoint', 'executable'].includes(token));
}

function taskMentionsInternals(taskTokens) {
  return taskTokens.some((token) => [
    'rank',
    'ranking',
    'context',
    'scan',
    'scanner',
    'classify',
    'classifier',
    'route',
    'router',
    'impact',
    'risk',
    'freshness',
    'security',
    'graphq'
  ].includes(token));
}

function selectContextMode(task, taskTokens, scan) {
  const isDefaultTask = task === 'Understand this repository and choose the smallest safe context.';
  if (!taskTokens.length || isDefaultTask || scan.files.length > 200) return 'full';
  if (taskTokens.some((token) => HIGH_CONTEXT_WORDS.has(token))) return 'high';
  if (taskTokens.length && taskTokens.every((token) => LOW_CONTEXT_WORDS.has(token))) return 'low';
  return 'medium';
}

function suggestTestCommands(project, likelyTests) {
  if (!project.scripts?.test) return [];
  const runner = packageRunner(project);
  const commands = [];
  if (likelyTests.length) {
    commands.push(...likelyTests.slice(0, 2).map((testPath) => `${runner} test -- ${testPath}`));
  }
  commands.push(`${runner} test`);
  return unique(commands).slice(0, 3);
}

function packageRunner(project) {
  if (project.packageManager === 'pnpm') return 'pnpm';
  if (project.packageManager === 'yarn') return 'yarn';
  if (project.packageManager === 'bun') return 'bun';
  return 'npm';
}

function suggestAvoid(taskTokens) {
  if (taskTokens.includes('docs') || taskTokens.includes('readme')) return ['source files', 'test files'];
  return ['unrelated UI files', 'unrelated migrations', 'generated files', 'cache files'];
}

function buildReasons(selectedFiles, scan, riskMap, testsMap, rankingByPath, routesMap) {
  const byPath = new Map(scan.files.map((file) => [file.path, file]));
  const routeHandlers = new Set((routesMap?.routes ?? []).map((entry) => entry.handler));
  return Object.fromEntries(selectedFiles.map((filePath) => {
    const file = byPath.get(filePath);
    const reasons = [];
    const rankingReasons = rankingByPath?.get(filePath)?.reasons ?? [];

    if (rankingReasons.includes('filename match')) reasons.push('Filename matches task tokens.');
    if (rankingReasons.includes('symbol match')) reasons.push('Exported or local symbols match task tokens.');
    if (rankingReasons.includes('tag match') && file?.tags.length) {
      reasons.push(`Tagged as ${file.tags.join(', ')}.`);
    }
    if (rankingReasons.includes('route match') || routeHandlers.has(filePath)) {
      reasons.push('Route handler or routing-related path.');
    }
    if (rankingReasons.includes('memory weak boost')) reasons.push('Weak memory hotspot boost.');
    if (rankingReasons.includes('changed-file weak boost')) reasons.push('Recently changed file weak boost.');
    if (rankingReasons.includes('risk reason') || riskMap[filePath]?.risk === 'high') {
      reasons.push('High-risk file by GraphQ heuristic.');
    }
    if (file?.category === 'test') {
      const directImport = testsMap && Object.values(testsMap).flat().some(
        (entry) => entry.path === filePath && entry.reasons?.includes('direct test import')
      );
      reasons.push(directImport ? 'Direct test import match.' : 'Likely related test file.');
    } else if (testsMap[filePath]?.length) {
      reasons.push('Has likely related tests.');
    }
    if (!reasons.length) reasons.push('Relevant by filename and project structure.');
    return [filePath, unique(reasons)];
  }));
}

function dependentCountMap(dependencies) {
  const counts = new Map();
  for (const dependency of dependencies) {
    counts.set(dependency.to, (counts.get(dependency.to) ?? 0) + 1);
  }
  return counts;
}

function scoreTestForSource(source, test, importLookup) {
  const reasons = [];
  let score = 0;
  const sourceStem = pathStem(source.path);
  const testStem = pathStem(test.path);
  const sourceDir = pathDir(source.path);
  const testDir = pathDir(test.path);

  if (importLookup.has(`${test.path}:${source.path}`)) {
    score += 20;
    reasons.push('direct test import');
  }

  if (testStem.includes(sourceStem) || sourceStem.includes(testStem)) {
    score += 8;
    reasons.push('basename similarity');
  }

  if (test.path.includes(sourceStem)) {
    score += 4;
    reasons.push('test filename convention');
  }

  if (testDir.includes(sourceDir) || sourceDir.includes(testDir)) {
    score += 3;
    reasons.push('directory proximity');
  }

  const sourceTokens = new Set(tokenize(source.path).filter((token) => !['src', 'test', 'tests'].includes(token)));
  const testTokens = new Set(tokenize(test.path).filter((token) => !['src', 'test', 'tests'].includes(token)));
  const sharedTokens = [...sourceTokens].filter((token) => testTokens.has(token));
  if (sharedTokens.length) {
    score += sharedTokens.length * 2;
    reasons.push(`shared path tokens: ${sharedTokens.join(', ')}`);
  }

  if (isGenericTestFile(test.path) && score < 15) {
    score -= 6;
    reasons.push('generic test file');
  }

  return { path: test.path, score, reasons };
}

function collectIndirectDependents(rootPath, directDependents, impact, maxDepth) {
  const visited = new Set([rootPath, ...directDependents]);
  const indirect = [];
  const queue = directDependents.map((filePath) => ({ filePath, depth: 1 }));

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth) continue;

    for (const dependent of impact[current.filePath]?.directDependents ?? []) {
      if (dependent === rootPath || visited.has(dependent)) continue;
      visited.add(dependent);
      indirect.push(dependent);
      queue.push({ filePath: dependent, depth: current.depth + 1 });
    }
  }

  return indirect
    .filter((filePath) => filePath !== rootPath && !directDependents.includes(filePath))
    .sort();
}

function computeDependencyDepth(rootPath, directDependents, impact, maxDepth) {
  let deepest = directDependents.length ? 1 : 0;

  for (const dependent of directDependents) {
    const queue = [{ filePath: dependent, depth: 1 }];
    const visited = new Set();

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current.filePath)) continue;
      visited.add(current.filePath);
      deepest = Math.max(deepest, current.depth);

      if (current.depth >= maxDepth) continue;
      for (const next of impact[current.filePath]?.directDependents ?? []) {
        if (next === rootPath) continue;
        queue.push({ filePath: next, depth: current.depth + 1 });
      }
    }
  }

  return deepest;
}

function isGenericTestFile(testPath) {
  const name = testPath.split('/').at(-1) ?? testPath;
  return /^(cli|index|main|app)\.test\.(js|ts|mjs|cjs)$/.test(name);
}

function testPathsForSource(entries = []) {
  return entries.map((entry) => (typeof entry === 'string' ? entry : entry.path));
}

function pathDir(filePath) {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

function pathStem(filePath) {
  return filePath.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? filePath;
}

function normalizeTask(task) {
  if (!task) return 'Understand this repository and choose the smallest safe context.';
  const trimmed = task.trim();
  const sentence = `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}

function tokenize(value) {
  let text = String(value);
  if (!/\s/.test(text)) {
    text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((token) => {
      const variants = [token];
      if (token.endsWith('ing') && token.length > 5) variants.push(token.slice(0, -3));
      if (token.endsWith('s') && token.length > 3) variants.push(token.slice(0, -1));
      return variants;
    });
}

function addRisk(reasons, text, weight) {
  reasons.push({ text, weight });
}

function unique(values) {
  return [...new Set(values)];
}
