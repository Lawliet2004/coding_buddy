import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable, Readable } from 'node:stream';
import { runCli } from '../src/cli.js';
import { classifyPath } from '../src/graphq/fileClassifier.js';
import {
  scanProject,
  resolveInternalImport,
  stableSortDependencies,
  normalizeNextRouteSegment,
  routeFromNextAppPath,
  routeFromPagesApiPath,
  maskJsStringLiterals
} from '../src/graphq/scanner.js';
import { stableObjectFromEntries } from '../src/graphq/contextPackWriter.js';
import {
  safeMemoryPath,
  readGraphqMemory,
  MEMORY_SCHEMA_VERSION
} from '../src/graphq/memoryStore.js';
import { formatJsonOutput, parseArgs } from '../src/graphq/cli.js';
import {
  buildImpactMap,
  buildRiskMap,
  buildTaskPlan,
  buildTestsMap
} from '../src/graphq/taskRouter.js';
import { runGraphq } from '../src/graphq/index.js';
import { isBugLikeTask } from '../src/graphq/memoryStore.js';

test('graphq default scan creates compact repo intelligence files without source dumps', async () => {
  const root = await makeGraphqProject();
  const output = captureStream();

  const exitCode = await runGraphq([], {
    cwd: root,
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /Read first: \.graphq\/agent\/context\.md/);

  await fs.stat(path.join(root, '.graphq/README.md'));
  await fs.stat(path.join(root, '.graphq/agent/context.md'));
  await fs.stat(path.join(root, '.graphq/agent/repo.md'));
  await fs.stat(path.join(root, '.graphq/agent/instructions.md'));
  await fs.stat(path.join(root, '.graphq/maps/files.json'));
  await fs.stat(path.join(root, '.graphq/maps/graph.min.json'));
  await fs.stat(path.join(root, '.graphq/maps/symbols.json'));
  await fs.stat(path.join(root, '.graphq/maps/routes.json'));
  await fs.stat(path.join(root, '.graphq/cache/hashes.json'));
  await fs.stat(path.join(root, '.graphq/cache/state.json'));
  await fs.stat(path.join(root, '.graphq/reports/freshness.json'));
  await fs.stat(path.join(root, '.graphq/reports/cost.json'));
  await fs.stat(path.join(root, '.graphq/memory/decisions.md'));
  await fs.stat(path.join(root, '.graphq/memory/learnings.md'));
  await fs.stat(path.join(root, '.graphq/memory/sessions.jsonl'));

  const files = JSON.parse(await fs.readFile(path.join(root, '.graphq/maps/files.json'), 'utf8'));
  const paths = files.files.map((file) => file.path);
  assert(paths.includes('src/auth/jwt.js'));
  assert(paths.includes('test/auth.test.js'));
  assert(!paths.includes('.env'));
  assert(!paths.includes('node_modules/ignored.js'));
  assert(!paths.includes('public/assets/logo.png'));

  const graph = await fs.readFile(path.join(root, '.graphq/maps/graph.min.json'), 'utf8');
  assert(!graph.includes('SOURCE_BODY_MARKER'), 'graph.min.json must not contain source bodies');
  assert(!graph.includes('super-secret-token'), 'graph.min.json must not contain secrets');
});

test('graphq task creates a small context pack using task, metadata, memory, and filenames', async () => {
  const root = await makeGraphqProject();

  const exitCode = await runGraphq(['task', 'fix expired JWT tokens being accepted'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);

  const context = await fs.readFile(path.join(root, '.graphq/agent/context.md'), 'utf8');
  assert.match(context, /Fix expired JWT tokens being accepted\./);
  assert.match(context, /src\/auth\/jwt\.js/);
  assert.match(context, /test\/auth\.test\.js/);
  assert.match(context, /Risk:\nHigh\./);
  assert(!context.includes('SOURCE_BODY_MARKER'), 'context.md must not contain source bodies');

  const task = await fs.readFile(path.join(root, '.graphq/agent/task.md'), 'utf8');
  assert.match(task, /Context mode: High/);
  assert.match(task, /tokenmaxxing-ai/);
});

test('tokenmaxxing-ai graphq routes to graphq with --dir', async () => {
  const root = await makeGraphqProject();
  const output = captureStream();

  const exitCode = await runCli(['graphq', '--dir', root, 'task', 'fix auth token expiry'], {
    cwd: os.tmpdir(),
    env: { HOME: root, USERPROFILE: root },
    stdin: Readable.from([]),
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /GraphQ context pack ready/);
  await fs.stat(path.join(root, '.graphq/agent/context.md'));
});

test('graphq changed reports added, changed, and deleted files since the last scan', async () => {
  const root = await makeGraphqProject();

  await runGraphq([], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  await fs.writeFile(path.join(root, 'src/auth/jwt.js'), 'export function validateToken() { return false; }\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/new-feature.js'), 'export function nextThing() { return true; }\n', 'utf8');
  await fs.rm(path.join(root, 'src/db/client.js'));

  const output = captureStream();
  const exitCode = await runGraphq(['changed'], {
    cwd: root,
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /Changed files: 1/);
  assert.match(output.text(), /Added files: 1/);
  assert.match(output.text(), /Deleted files: 1/);
});

test('classifyPath does not tag tokenmaxxing-ai paths as auth from token substring', () => {
  const result = classifyPath('bin/tokenmaxxing-ai.js');
  assert.equal(result.action, 'keep');
  assert(!result.tags.includes('auth'), `unexpected auth tag: ${result.tags.join(', ')}`);
});

test('classifyPath does not tag taskRouter as routing from route substring', () => {
  const result = classifyPath('src/graphq/taskRouter.js');
  assert.equal(result.action, 'keep');
  assert(!result.tags.includes('routing'), `unexpected routing tag: ${result.tags.join(', ')}`);
});

test('classifyPath tags real auth and route paths by token', () => {
  assert(classifyPath('src/auth/jwt.js').tags.includes('auth'));
  assert(classifyPath('src/routes/login.js').tags.includes('routing'));
});

test('buildRiskMap keeps test files low risk when fixture content mentions env routes or secrets', async () => {
  const root = await makeGraphqProject();
  const scan = await scanProject(root);
  const riskMap = buildRiskMap(scan);
  assert.equal(riskMap['test/auth.test.js']?.risk, 'low');
});

test('scanner does not flag its own dangerous-execution heuristic regex as a finding', async () => {
  const root = await makeGraphqProject();
  await fs.mkdir(path.join(root, 'src/graphq'), { recursive: true });
  await fs.copyFile(
    path.join(process.cwd(), 'src/graphq/scanner.js'),
    path.join(root, 'src/graphq/scanner.js')
  );

  const scan = await scanProject(root);
  const selfFindings = scan.securityFindings.filter(
    (finding) => finding.path === 'src/graphq/scanner.js' && finding.kind === 'dangerous-execution'
  );
  assert.equal(selfFindings.length, 0);
});

test('buildTaskPlan prioritizes graphq implementation files over barrels and bins for ranking tasks', async () => {
  const root = await makeGraphqRankingFixture();
  const scan = await scanProject(root);
  const plan = buildTaskPlan('improve GraphQ context ranking', scan);

  const corePaths = [
    'src/graphq/taskRouter.js',
    'src/graphq/scanner.js',
    'src/graphq/fileClassifier.js'
  ];
  const noisyPaths = ['src/graphq/index.js', 'bin/graphq.js'];

  for (const filePath of corePaths) {
    assert(plan.primaryFiles.includes(filePath), `expected primary file ${filePath}`);
  }

  const firstCoreIndex = Math.min(...corePaths.map((filePath) => plan.primaryFiles.indexOf(filePath)));
  for (const filePath of noisyPaths) {
    const noisyIndex = plan.primaryFiles.indexOf(filePath);
    if (noisyIndex === -1) continue;
    assert(
      noisyIndex > firstCoreIndex,
      `expected ${filePath} to rank below core implementation files`
    );
  }
});

test('graphq route reports matching route handlers', async () => {
  const root = await makeGraphqProject();
  const output = captureStream();

  const exitCode = await runGraphq(['route', '/api/login'], {
    cwd: root,
    stdout: output,
    stderr: captureStream()
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /\/api\/login -> src\/routes\/login\.js/);
  assert.match(output.text(), /related: src\/auth\/jwt\.js/);
});

test('scanner flags dangerous execution in normal project files with findings.push', async () => {
  const root = await makeGraphqProject();
  await fs.mkdir(path.join(root, 'src/app'), { recursive: true });
  const evalCall = ['ev', 'al'].join('');
  await fs.writeFile(path.join(root, 'src/app/danger.js'), [
    'const findings = [];',
    'const userInput = "code";',
    `findings.push(${evalCall}(userInput));`,
    ''
  ].join('\n'), 'utf8');

  const scan = await scanProject(root);
  const findings = scan.securityFindings.filter(
    (finding) => finding.path === 'src/app/danger.js' && finding.kind === 'dangerous-execution'
  );
  assert.equal(findings.length, 1);
});

test('resolveInternalImport resolves extensionless, index, and cross-folder imports', async () => {
  const root = await makeImportResolutionFixture();
  const scan = await scanProject(root);
  const byPath = new Map(scan.files.map((file) => [file.path, file]));

  assert.equal(resolveInternalImport('src/a.js', './b', byPath), 'src/b.js');
  assert.equal(resolveInternalImport('src/a.js', './dir', byPath), 'src/dir/index.js');
  assert.equal(resolveInternalImport('test/task-router.test.js', '../src/graphq/taskRouter.js', byPath), 'src/graphq/taskRouter.js');

  const internal = scan.dependencies.filter((dependency) => dependency.type === 'internal');
  assert(internal.some((dependency) => dependency.from === 'src/a.js' && dependency.to === 'src/b.js'));
  assert(internal.some((dependency) => dependency.from === 'src/a.js' && dependency.to === 'src/dir/index.js'));
  assert(internal.some((dependency) => dependency.from === 'test/task-router.test.js' && dependency.to === 'src/graphq/taskRouter.js'));
});

test('buildImpactMap reports direct and indirect dependents with cycle safety', async () => {
  const root = await makeImpactFixture();
  const scan = await scanProject(root);
  const impactMap = buildImpactMap(scan);

  assert.deepEqual(impactMap['src/c.js'].directDependents, ['src/b.js']);
  assert.deepEqual(impactMap['src/c.js'].indirectDependents, ['src/a.js']);
  assert.deepEqual(impactMap['src/cycle-a.js'].directDependents, ['src/cycle-b.js']);
  assert.deepEqual(impactMap['src/cycle-b.js'].directDependents, ['src/cycle-a.js']);
});

test('buildTestsMap ranks direct-import tests above generic cli tests', async () => {
  const root = await makeImportResolutionFixture();
  const scan = await scanProject(root);
  const testsMap = buildTestsMap(scan);
  const ranked = testsMap['src/graphq/taskRouter.js'] ?? [];

  assert(ranked.length >= 1);
  assert.equal(ranked[0].path, 'test/task-router.test.js');
  assert(ranked[0].reasons.includes('direct test import'));
  const cliRank = ranked.find((entry) => entry.path === 'test/cli.test.js');
  if (cliRank) assert(ranked[0].score > cliRank.score);
});

test('buildTestsMap still matches by filename similarity without imports', async () => {
  const root = await makeFilenameSimilarityFixture();
  const scan = await scanProject(root);
  const testsMap = buildTestsMap(scan);
  const ranked = testsMap['src/widgets/tokenService.js'] ?? [];

  assert.equal(ranked[0]?.path, 'test/token-service.test.js');
});

test('buildRiskMap scores auth source without tests as high and keeps fixtures low risk', async () => {
  const root = await makeRiskFixture();
  const scan = await scanProject(root);
  const riskMap = buildRiskMap(scan);

  assert.equal(riskMap['src/auth/session.js'].risk, 'high');
  assert.equal(riskMap['test/auth-fixture.test.js'].risk, 'low');
  assert.equal(riskMap['bin/wrapper.js'].risk, 'low');
  assert.equal(riskMap['package.json'].risk, 'medium');
  assert.match(riskMap['package.json'].reasons.join(' '), /configuration file/);
});

test('dependencies map separates internal and external imports with package metadata', async () => {
  const root = await makeDependencyFixture();
  const output = captureStream();
  await runGraphq([], { cwd: root, stdout: output, stderr: captureStream() });

  const dependencies = JSON.parse(await fs.readFile(path.join(root, '.graphq/maps/dependencies.json'), 'utf8'));
  assert(dependencies.internal.some((entry) => entry.from === 'src/server.js' && entry.to === 'src/auth/jwt.js'));
  assert(dependencies.external.some((entry) => entry.package === 'express' && entry.files.includes('src/server.js')));
  assert(dependencies.external.some((entry) => entry.package === 'node:fs' && entry.files.includes('src/server.js')));
  assert.deepEqual(dependencies.package.dependencies, ['express']);
  assert.deepEqual(dependencies.package.devDependencies, ['node:test']);
  assert.equal(dependencies.package.manager, 'npm');
});

test('routes map and route command include handler, related imports, and likely tests', async () => {
  const root = await makeGraphqProject();
  const output = captureStream();
  await runGraphq(['route', '/api/login'], {
    cwd: root,
    stdout: output,
    stderr: captureStream()
  });

  const routes = JSON.parse(await fs.readFile(path.join(root, '.graphq/maps/routes.json'), 'utf8'));
  const loginRoute = routes.routes.find((entry) => entry.route === '/api/login');
  assert.equal(loginRoute.handler, 'src/routes/login.js');
  assert(loginRoute.related.includes('src/auth/jwt.js'));
  assert(loginRoute.likelyTests.includes('test/auth.test.js'));
  assert.match(output.text(), /likely tests: test\/auth\.test\.js/);
});

test('buildImpactMap excludes self from indirect dependents in import cycles', async () => {
  const root = await makeSimpleCycleFixture();
  const scan = await scanProject(root);
  const impactMap = buildImpactMap(scan);

  assert(!impactMap['src/a.js'].indirectDependents.includes('src/a.js'));
  assert(!impactMap['src/b.js'].indirectDependents.includes('src/b.js'));
  assert(!impactMap['src/a.js'].directDependents.includes('src/a.js'));
  assert(!impactMap['src/b.js'].directDependents.includes('src/b.js'));

  const output = captureStream();
  await runGraphq(['impact', 'src/a.js'], { cwd: root, stdout: output, stderr: captureStream() });
  const text = output.text();
  assert(!text.includes('indirect dependents: src/a.js'));
});

test('scanner ignores fake import strings inside test helper literals', async () => {
  const root = await makeFixtureStringFixture();
  const scan = await scanProject(root);

  const expressDeps = scan.externalImports.filter((entry) => entry.package === 'express');
  assert.equal(expressDeps.length, 0, 'fixture import string must not create express dependency');

  const helper = scan.files.find((file) => file.path === 'test/helper.test.js');
  assert(helper);
  assert(!helper.imports.includes('express'));
});

test('scanner still resolves real test imports after string literal masking', async () => {
  const root = await makeFixtureStringFixture();
  const scan = await scanProject(root);

  assert(scan.dependencies.some(
    (dependency) => dependency.from === 'test/helper.test.js' && dependency.to === 'src/foo.js'
  ));
});

test('scanner ignores security-like fixture strings in test helpers', async () => {
  const root = await makeFixtureStringFixture();
  const scan = await scanProject(root);

  const helperFindings = scan.securityFindings.filter((finding) => finding.path === 'test/helper.test.js');
  assert.equal(helperFindings.length, 0);
});

test('hotspots selectionCount increments across repeated GraphQ task runs', async () => {
  const root = await makeGraphqProject();
  const task = 'improve auth token validation';

  await runGraphq(['task', task], { cwd: root, stdout: captureStream(), stderr: captureStream() });
  const first = JSON.parse(await fs.readFile(path.join(root, '.graphq/memory/hotspots.json'), 'utf8'));

  await runGraphq(['task', task], { cwd: root, stdout: captureStream(), stderr: captureStream() });
  const second = JSON.parse(await fs.readFile(path.join(root, '.graphq/memory/hotspots.json'), 'utf8'));

  const jwtPath = 'src/auth/jwt.js';
  assert((second.files[jwtPath]?.selectionCount ?? 0) >= (first.files[jwtPath]?.selectionCount ?? 0) + 1);
});

test('bug-like task increments bugFixSelectionCount but non-bug task does not', async () => {
  const root = await makeGraphqProject();

  await runGraphq(['task', 'fix expired auth token bug'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });
  const bugHotspots = JSON.parse(await fs.readFile(path.join(root, '.graphq/memory/hotspots.json'), 'utf8'));
  const bugCount = Object.values(bugHotspots.files).reduce((sum, entry) => sum + (entry.bugFixSelectionCount ?? 0), 0);
  assert(bugCount > 0);

  await runGraphq(['task', 'improve documentation wording'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });
  const docHotspots = JSON.parse(await fs.readFile(path.join(root, '.graphq/memory/hotspots.json'), 'utf8'));
  const afterDocCount = Object.values(docHotspots.files).reduce((sum, entry) => sum + (entry.bugFixSelectionCount ?? 0), 0);
  assert.equal(afterDocCount, bugCount);
  assert(!isBugLikeTask('improve documentation wording'));
});

test('recurring bug patterns are created only for bug-like tasks', async () => {
  const root = await makeGraphqProject();

  await runGraphq(['task', 'fix recurring auth token bug'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });
  const recurring = JSON.parse(await fs.readFile(path.join(root, '.graphq/memory/recurring-bugs.json'), 'utf8'));
  assert(recurring.patterns.auth || recurring.patterns.token);

  const tokenCount = recurring.patterns.token?.count ?? 0;
  await runGraphq(['task', 'fix another auth token regression'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });
  const repeated = JSON.parse(await fs.readFile(path.join(root, '.graphq/memory/recurring-bugs.json'), 'utf8'));
  assert((repeated.patterns.token?.count ?? 0) >= tokenCount + 1);

  const beforeDocs = repeated.patterns.docs?.count ?? 0;
  await runGraphq(['task', 'update docs for auth tokens'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });
  const afterDocs = JSON.parse(await fs.readFile(path.join(root, '.graphq/memory/recurring-bugs.json'), 'utf8'));
  assert.equal(afterDocs.patterns.docs?.count ?? 0, beforeDocs);
});

test('sessions.jsonl stores richer Phase 3 fields without source or secrets', async () => {
  const root = await makeGraphqProject();
  await runGraphq(['task', 'fix jwt token validation bug'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  const lines = (await fs.readFile(path.join(root, '.graphq/memory/sessions.jsonl'), 'utf8'))
    .trim()
    .split('\n');
  const session = JSON.parse(lines.at(-1));

  assert.equal(session.mapVersion, 'graphq-v3');
  assert.equal(session.result, null);
  assert(session.contextMode);
  assert(session.risk);
  assert(session.freshnessRecommendation);
  assert(Array.isArray(session.files));
  assert(Array.isArray(session.tests));
  assert.equal(typeof session.filesScanned, 'number');
  assert.equal(typeof session.filesSkipped, 'number');
  assert.equal(typeof session.estimatedTokensAvoided, 'number');
  assert(!JSON.stringify(session).includes('SOURCE_BODY_MARKER'));
  assert(!JSON.stringify(session).includes('super-secret-token'));
});

test('memory suggestions use candidate wording and preserve decisions/learnings content', async () => {
  const root = await makeGraphqProject();
  const decisionsPath = path.join(root, '.graphq/memory/decisions.md');
  const learningsPath = path.join(root, '.graphq/memory/learnings.md');

  await runGraphq([], { cwd: root, stdout: captureStream(), stderr: captureStream() });
  await fs.writeFile(decisionsPath, '# GraphQ Decisions\n\n- User decision: keep custom auth flow.\n', 'utf8');
  await fs.writeFile(learningsPath, '# GraphQ Learnings\n\n- User learning: verify jwt expiry in tests.\n', 'utf8');

  await runGraphq(['task', 'fix auth token bug'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  const suggestions = await fs.readFile(path.join(root, '.graphq/reports/memory-suggestions.md'), 'utf8');
  assert.match(suggestions, /Candidate learning:/);
  assert.match(suggestions, /Candidate decision:/);

  const decisions = await fs.readFile(decisionsPath, 'utf8');
  const learnings = await fs.readFile(learningsPath, 'utf8');
  assert.match(decisions, /User decision: keep custom auth flow/);
  assert.match(learnings, /User learning: verify jwt expiry in tests/);
});

test('memory ranking gives a weak hotspot boost without outranking direct filename matches', async () => {
  const root = await makeMemoryRankingFixture();
  const scan = await scanProject(root);
  const memory = {
    hotspots: {
      files: {
        'src/graphq/taskRouter.js': {
          selectionCount: 5,
          bugFixSelectionCount: 3,
          highRiskSelectionCount: 0
        }
      }
    },
    recurringBugs: { patterns: {} }
  };

  const tiedPlan = buildTaskPlan('fix graphq bug', scan, { memory });
  const scannerIndex = tiedPlan.primaryFiles.indexOf('src/graphq/scanner.js');
  const routerIndex = tiedPlan.primaryFiles.indexOf('src/graphq/taskRouter.js');
  assert.notEqual(scannerIndex, -1);
  assert.notEqual(routerIndex, -1);
  assert(routerIndex < scannerIndex, 'hotspot boost should break ties toward taskRouter.js');

  const directPlan = buildTaskPlan('fix peer widget bug', scan, { memory });
  assert.equal(directPlan.primaryFiles[0], 'src/widgets/peer.js');
});

test('recurring bug memory only boosts bug-like tasks and ignores deleted files', async () => {
  const root = await makeMemoryRankingFixture();
  const scan = await scanProject(root);
  const memory = {
    hotspots: { files: {} },
    recurringBugs: {
      patterns: {
        ranking: {
          count: 2,
          files: ['src/graphq/taskRouter.js', 'src/missing/deleted.js']
        }
      }
    }
  };

  const bugPlan = buildTaskPlan('fix graphq ranking bug', scan, { memory });
  assert(bugPlan.primaryFiles.includes('src/graphq/taskRouter.js'));

  const nonBugPlan = buildTaskPlan('improve graphq ranking quality', scan, { memory });
  const bugRank = bugPlan.primaryFiles.indexOf('src/graphq/taskRouter.js');
  const nonBugRank = nonBugPlan.primaryFiles.indexOf('src/graphq/taskRouter.js');
  if (bugRank !== -1 && nonBugRank !== -1) {
    assert(bugRank <= nonBugRank);
  }
});

test('graphq memory and status commands report memory counts gracefully', async () => {
  const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-memory-empty-'));
  const emptyOutput = captureStream();
  const emptyExit = await runGraphq(['memory'], {
    cwd: emptyRoot,
    stdout: emptyOutput,
    stderr: captureStream()
  });
  assert.equal(emptyExit, 0);
  assert.match(emptyOutput.text(), /hotspot files: 0/);
  assert.match(emptyOutput.text(), /recurring bug patterns: 0/);

  const root = await makeGraphqProject();
  await runGraphq(['task', 'fix auth token bug'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  const memoryOutput = captureStream();
  await runGraphq(['memory'], { cwd: root, stdout: memoryOutput, stderr: captureStream() });
  assert.match(memoryOutput.text(), /hotspot files: [1-9]/);
  assert.match(memoryOutput.text(), /top hotspots:/);

  const statusOutput = captureStream();
  await runGraphq(['status'], { cwd: root, stdout: statusOutput, stderr: captureStream() });
  assert.match(statusOutput.text(), /memory hotspots:/);
  assert.match(statusOutput.text(), /memory recurring patterns:/);
  assert.match(statusOutput.text(), /memory sessions:/);
});

test('memory files do not store source snippets or secret-like fixture values', async () => {
  const root = await makeGraphqProject();
  await runGraphq(['task', 'fix jwt token bug'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  const memoryFiles = [
    '.graphq/memory/hotspots.json',
    '.graphq/memory/recurring-bugs.json',
    '.graphq/memory/sessions.jsonl',
    '.graphq/reports/memory-suggestions.md'
  ];

  for (const relativePath of memoryFiles) {
    const content = await fs.readFile(path.join(root, relativePath), 'utf8');
    assert(!content.includes('SOURCE_BODY_MARKER'), `${relativePath} leaked source marker`);
    assert(!content.includes('super-secret-token'), `${relativePath} leaked secret-like fixture value`);
  }
});

test('stableSortDependencies orders same-from dependencies by to path deterministically', () => {
  const dependencies = [
    { from: 'src/a.js', to: 'src/z.js', type: 'internal' },
    { from: 'src/a.js', to: 'src/m.js', type: 'internal' },
    { from: 'src/b.js', to: 'src/a.js', type: 'internal' }
  ];
  const sorted = stableSortDependencies(dependencies);
  assert.deepEqual(sorted.map((entry) => entry.to), ['src/m.js', 'src/z.js', 'src/a.js']);
  assert.deepEqual(stableSortDependencies(sorted), sorted);
});

test('scanner resolves multiline, side-effect, export-from, dynamic, and require imports', async () => {
  const root = await makeModernImportFixture();
  const scan = await scanProject(root);
  const from = 'src/modern.js';

  assert(scan.dependencies.some((dep) => dep.from === from && dep.to === 'src/a.js'));
  assert(scan.dependencies.some((dep) => dep.from === from && dep.to === 'src/b.js'));
  assert(scan.dependencies.some((dep) => dep.from === from && dep.to === 'src/c.js'));
  assert(scan.dependencies.some((dep) => dep.from === from && dep.to === 'src/d.js'));
  assert(scan.dependencies.some((dep) => dep.from === from && dep.to === 'src/e.js'));
  assert(scan.externalImports.some((entry) => entry.package === 'express'));
  assert(scan.externalImports.some((entry) => entry.package === 'node:fs'));
});

test('scanner ignores imports inside comments and masked string literals', async () => {
  const root = await makeModernImportFixture();
  const scan = await scanProject(root);
  const modern = scan.files.find((file) => file.path === 'src/modern.js');
  assert(modern);
  assert(!modern.imports.includes('fake/comment-import'));
  assert(!modern.imports.includes('fake/string-import'));
  assert(!modern.imports.includes('fake/dynamic-import'));
});

test('scanner ignores import-like lines inside multiline template literals', async () => {
  const root = await makeMultilineTemplateFixture();
  const scan = await scanProject(root);
  const main = scan.files.find((file) => file.path === 'src/main.js');
  assert(main);

  assert(main.imports.includes('./real.js'));
  assert(main.imports.includes('./lazy.js'));
  assert(main.imports.includes('node:fs'));
  assert(!main.imports.includes('express'));
  assert(!main.imports.includes('./fake'));
  assert(!main.imports.includes('fake-lib'));
  assert(!main.imports.includes('./fake-lazy.js'));
  assert(!main.imports.includes('./fake-export.js'));

  const expressDeps = scan.externalImports.filter((entry) => entry.package === 'express');
  assert.equal(expressDeps.length, 0, 'fixture import string must not create express dependency');
});

test('scanner ignores fake require and dynamic import inside multiline template literals', async () => {
  const root = await makeMultilineTemplateFixture();
  const scan = await scanProject(root);
  const main = scan.files.find((file) => file.path === 'src/main.js');
  assert(main);
  assert(!main.imports.includes('fake-lib'));
  assert(!main.imports.includes('./fake-lazy.js'));
  assert(scan.externalImports.some((entry) => entry.package === 'node:fs'));
  const fakeLibDeps = scan.externalImports.filter((entry) => entry.package === 'fake-lib');
  assert.equal(fakeLibDeps.length, 0);
});

test('scanner ignores route-like lines inside multiline template literals', async () => {
  const root = await makeMultilineTemplateRouteFixture();
  const scan = await scanProject(root);
  const server = scan.files.find((file) => file.path === 'src/server.js');
  assert(server);
  assert(server.routes.includes('/real-route'));
  assert(server.routes.includes('/real-post'));
  assert(server.routes.includes('/real-health'));
  assert(!server.routes.includes('/fake-route'));
  assert(!server.routes.includes('/fake-post'));
  assert(!server.routes.includes('/fake-health'));
});

test('scanner ignores import and route patterns inside comments', async () => {
  const root = await makeCommentFixture();
  const scan = await scanProject(root);
  const commented = scan.files.find((file) => file.path === 'src/commented.js');
  assert(commented);
  assert(commented.imports.includes('./real.js'));
  assert(commented.routes.includes('/real-route'));
  assert(!commented.imports.includes('fake'));
  assert(!commented.imports.includes('fake-block'));
  assert(!commented.routes.includes('/fake-comment'));
  assert(!commented.routes.includes('/fake-block-route'));
});

test('scanner detects Next.js app and pages API route conventions', async () => {
  const root = await makeNextRouteFixture();
  const scan = await scanProject(root);
  const routes = scan.files.flatMap((file) => file.routes);

  assert(routes.includes('/users'));
  assert(routes.includes('/users/:id'));
  assert(routes.includes('/blog/*slug'));
  assert(routes.includes('/docs/*slug?'));
  assert(routes.includes('/api/users'));
  assert(routes.includes('/api/users/:id'));
  assert(routes.includes('/api/*slug'));
  assert.equal(routeFromNextAppPath('app/users/route.ts'), '/users');
  assert.equal(routeFromNextAppPath('app/users/[id]/route.ts'), '/users/:id');
  assert.equal(normalizeNextRouteSegment('[...slug]'), '*slug');
  assert.equal(routeFromPagesApiPath('pages/api/users/[id].ts'), '/api/users/:id');
});

test('scanner detects express and fastify route handlers', async () => {
  const root = await makeRouteHandlerFixture();
  const scan = await scanProject(root);
  const routes = scan.files.flatMap((file) => file.routes);
  assert(routes.includes('/api/items'));
  assert(routes.includes('/health'));
  assert(!routes.includes('/fake-route'));
  assert(!routes.includes('/fake-post'));
});

test('classifyPath allows .env.example but skips real env and secret paths', () => {
  assert.equal(classifyPath('.env.example').action, 'keep');
  assert.equal(classifyPath('.env').action, 'skip');
  assert.equal(classifyPath('.env.local').action, 'skip');
  assert.equal(classifyPath('secrets/id_rsa').action, 'skip');
  assert.equal(classifyPath('certs/server.pem').action, 'skip');
});

test('scanner skips binary and oversized files', async () => {
  const root = await makeSkipFixture();
  const scan = await scanProject(root, { maxFileBytes: 64 });
  assert(!scan.files.some((file) => file.path === 'public/assets/logo.png'));
  assert(!scan.files.some((file) => file.path === 'src/huge.js'));
  assert(scan.skipped.some((item) => item.path === 'public/assets/logo.png'));
  assert(scan.skipped.some((item) => item.path === 'src/huge.js' && item.reason === 'large file'));
});

test('generated map JSON uses stable ordering for keys and dependency arrays', async () => {
  const root = await makeDependencyOrderingFixture();
  await runGraphq([], { cwd: root, stdout: captureStream(), stderr: captureStream() });

  const dependencies = JSON.parse(await fs.readFile(path.join(root, '.graphq/maps/dependencies.json'), 'utf8'));
  const impact = JSON.parse(await fs.readFile(path.join(root, '.graphq/maps/impact.json'), 'utf8'));
  const keys = Object.keys(impact);
  assert.deepEqual(keys, [...keys].sort());
  assert.deepEqual(
    dependencies.internal.map((entry) => `${entry.from}:${entry.to}`),
    ['src/a.js:src/x.js', 'src/a.js:src/y.js', 'src/b.js:src/a.js']
  );
  assert.deepEqual(stableObjectFromEntries(impact), impact);
});

test('safeMemoryPath rejects traversal outside memory root', () => {
  const memoryRoot = path.join(os.tmpdir(), 'graphq-memory-safe');
  assert.throws(() => safeMemoryPath(memoryRoot, '../escape.json'), /Refusing to write outside memory root/);
  assert.throws(() => safeMemoryPath(memoryRoot, '/absolute.json'), /Memory path must be relative/);
  const safe = safeMemoryPath(memoryRoot, 'hotspots.json');
  assert(safe.startsWith(memoryRoot));
});

test('readGraphqMemory handles missing and corrupt memory files gracefully', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-memory-corrupt-'));
  const memoryRoot = path.join(root, '.graphq', 'memory');
  await fs.mkdir(memoryRoot, { recursive: true });
  await fs.writeFile(path.join(memoryRoot, 'hotspots.json'), '{not json', 'utf8');
  await fs.writeFile(path.join(memoryRoot, 'recurring-bugs.json'), '{"patterns":{}}\n', 'utf8');
  await fs.writeFile(path.join(memoryRoot, 'sessions.jsonl'), '{"task":"ok"}\n{bad\n', 'utf8');

  const memory = await readGraphqMemory(root);
  assert.equal(memory.degraded, true);
  assert(memory.degradedReasons.some((reason) => reason.includes('hotspots')));
  assert.deepEqual(memory.hotspots.files, {});
  assert.ok(memory.recurringBugs.patterns);
  assert.equal(memory.sessions.length, 1);
});

test('memory bounds cap hotspots, recurring patterns, and sessions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-memory-bounds-'));
  const memoryRoot = path.join(root, '.graphq', 'memory');
  await fs.mkdir(memoryRoot, { recursive: true });

  const files = Object.fromEntries(
    Array.from({ length: 120 }, (_, index) => [
      `src/file-${String(index).padStart(3, '0')}.js`,
      { selectionCount: index + 1, bugFixSelectionCount: 0, highRiskSelectionCount: 0 }
    ])
  );
  await fs.writeFile(path.join(memoryRoot, 'hotspots.json'), JSON.stringify({ generatedAt: 't', files }, null, 2), 'utf8');

  const patterns = Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [`kw${index}`, { count: index + 1, files: [] }])
  );
  await fs.writeFile(path.join(memoryRoot, 'recurring-bugs.json'), JSON.stringify({ generatedAt: 't', patterns }, null, 2), 'utf8');

  const sessionLines = Array.from({ length: 250 }, (_, index) => JSON.stringify({ task: `task-${index}` })).join('\n');
  await fs.writeFile(path.join(memoryRoot, 'sessions.jsonl'), `${sessionLines}\n`, 'utf8');

  await runGraphq(['task', 'fix bounded memory bug'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  const hotspots = JSON.parse(await fs.readFile(path.join(memoryRoot, 'hotspots.json'), 'utf8'));
  const recurring = JSON.parse(await fs.readFile(path.join(memoryRoot, 'recurring-bugs.json'), 'utf8'));
  const sessions = (await fs.readFile(path.join(memoryRoot, 'sessions.jsonl'), 'utf8')).trim().split('\n');

  assert(Object.keys(hotspots.files).length <= 100);
  assert(Object.keys(recurring.patterns).length <= 30);
  assert(sessions.length <= 200);
});

test('graphq JSON output is valid for status, memory, changed, impact, tests, risk, and task', async () => {
  const root = await makeGraphqProject();
  await runGraphq([], { cwd: root, stdout: captureStream(), stderr: captureStream() });

  const statusOutput = captureStream();
  await runGraphq(['status', '--json'], { cwd: root, stdout: statusOutput, stderr: captureStream() });
  const statusJson = JSON.parse(statusOutput.text());
  assert.equal(statusJson.command, 'status');
  assert.equal(typeof statusJson.files, 'number');

  const memoryOutput = captureStream();
  await runGraphq(['memory', '--json'], { cwd: root, stdout: memoryOutput, stderr: captureStream() });
  const memoryJson = JSON.parse(memoryOutput.text());
  assert.equal(memoryJson.command, 'memory');
  assert.equal(memoryJson.schemaVersion, MEMORY_SCHEMA_VERSION);

  const changedOutput = captureStream();
  await runGraphq(['changed', '--json'], { cwd: root, stdout: changedOutput, stderr: captureStream() });
  JSON.parse(changedOutput.text());

  const impactOutput = captureStream();
  await runGraphq(['impact', 'src/auth/jwt.js', '--json'], { cwd: root, stdout: impactOutput, stderr: captureStream() });
  JSON.parse(impactOutput.text());

  const testsOutput = captureStream();
  await runGraphq(['tests', 'src/auth/jwt.js', '--json'], { cwd: root, stdout: testsOutput, stderr: captureStream() });
  JSON.parse(testsOutput.text());

  const riskOutput = captureStream();
  await runGraphq(['risk', 'src/auth/jwt.js', '--json'], { cwd: root, stdout: riskOutput, stderr: captureStream() });
  JSON.parse(riskOutput.text());

  const taskOutput = captureStream();
  await runGraphq(['task', 'fix auth bug', '--json'], { cwd: root, stdout: taskOutput, stderr: captureStream() });
  const taskJson = JSON.parse(taskOutput.text());
  assert(taskJson.selectedFiles.includes('src/auth/jwt.js'));
  assert.equal(formatJsonOutput({ ok: true }).trim(), '{"ok":true}');
});

test('parseArgs accepts global flags before and after commands', () => {
  const parsed = parseArgs(['status', '--json'], '/tmp/project');
  assert.equal(parsed.command, 'status');
  assert.equal(parsed.json, true);

  const withDir = parseArgs(['--dir', '/tmp/other', 'memory', '--json'], '/tmp/project');
  assert.equal(withDir.command, 'memory');
  assert.equal(withDir.json, true);
  assert.equal(withDir.projectRoot, path.resolve('/tmp/other'));
});

test('graphq --explain writes ranking explanations without source dumps', async () => {
  const root = await makeGraphqProject();
  await runGraphq(['task', 'fix auth token bug', '--explain'], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  const explain = JSON.parse(await fs.readFile(path.join(root, '.graphq/reports/explain.json'), 'utf8'));
  assert(Array.isArray(explain.ranking));
  assert(explain.reasons);
  assert(!JSON.stringify(explain).includes('SOURCE_BODY_MARKER'));
});

test('graphq impact tests risk and status commands print concise output', async () => {
  const root = await makeImpactFixture();
  const impactOutput = captureStream();
  const testsOutput = captureStream();
  const riskOutput = captureStream();
  const statusOutput = captureStream();

  await runGraphq(['impact', 'src/c.js'], { cwd: root, stdout: impactOutput, stderr: captureStream() });
  await runGraphq(['tests', 'src/graphq/taskRouter.js'], { cwd: await makeImportResolutionFixture(), stdout: testsOutput, stderr: captureStream() });
  await runGraphq(['risk', 'src/auth/session.js'], { cwd: await makeRiskFixture(), stdout: riskOutput, stderr: captureStream() });
  await runGraphq([], { cwd: root, stdout: captureStream(), stderr: captureStream() });
  await runGraphq(['status'], { cwd: root, stdout: statusOutput, stderr: captureStream() });

  assert.match(impactOutput.text(), /direct dependents: src\/b\.js/);
  assert.match(impactOutput.text(), /indirect dependents: src\/a\.js/);
  assert.match(testsOutput.text(), /task-router\.test\.js/);
  assert.match(riskOutput.text(), /Risk for src\/auth\/session\.js: high/);
  assert.match(statusOutput.text(), /files:/);
  assert.match(statusOutput.text(), /recommendation:/);
});

async function makeMultilineTemplateFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-multiline-template-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'multiline-template', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/real.js'), 'export const real = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/lazy.js'), 'export const lazy = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/main.js'), [
    'const fixture = `',
    'import express from "express";',
    'import fake from "./fake";',
    'const fake = require("fake-lib");',
    'const lazy = import("./fake-lazy.js");',
    '`;',
    '',
    'const other = `',
    'export { fake } from "./fake-export.js";',
    '`;',
    '',
    'import {',
    '  real',
    '} from "./real.js";',
    '',
    'const lazyReal = () => import("./lazy.js");',
    'const fs = require("node:fs");',
    '',
    'void fixture;',
    'void other;',
    'void lazyReal;',
    'void fs;',
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeMultilineTemplateRouteFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-multiline-template-routes-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'multiline-template-routes', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/server.js'), [
    'const docs = `',
    "app.get('/fake-route', () => {});",
    "router.post('/fake-post', () => {});",
    "fastify.get('/fake-health', () => {});",
    '`;',
    '',
    'const app = express();',
    "app.get('/real-route', () => {});",
    "router.post('/real-post', () => {});",
    "fastify.get('/real-health', () => {});",
    'void docs;',
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeCommentFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-comment-fixture-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'comment-fixture', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/commented.js'), [
    '// import fake from "fake";',
    '// app.get("/fake-comment", handler);',
    '',
    '/*',
    'import fakeBlock from "fake-block";',
    'router.post("/fake-block-route", handler);',
    '*/',
    '',
    'import { real } from "./real.js";',
    "app.get('/real-route', () => {});",
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeModernImportFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-modern-imports-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'modern-imports', type: 'module' }, null, 2), 'utf8');
  for (const name of ['a', 'b', 'c', 'd', 'e']) {
    await fs.writeFile(path.join(root, `src/${name}.js`), `export const ${name} = 1;\n`, 'utf8');
  }
  await fs.writeFile(path.join(root, 'src/modern.js'), [
    '/* import "fake/comment-import"; */',
    'import {',
    '  one',
    '} from "./a";',
    'import "./b";',
    'export { two } from "./c";',
    'export * from "./d";',
    'const lazy = () => import("./e");',
    'const fs = require("node:fs");',
    'const express = require("express");',
    'const fixture = "import \\"fake/string-import\\"";',
    'const dynamicFixture = "import(\\"fake/dynamic-import\\")";',
    'void lazy;',
    'void fs;',
    'void express;',
    'void fixture;',
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeNextRouteFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-next-routes-'));
  const dirs = [
    'app/users',
    'app/users/[id]',
    'app/blog/[...slug]',
    'app/docs/[[...slug]]',
    'pages/api/users',
    'pages/api/users/[id]',
    'pages/api'
  ];
  for (const dir of dirs) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
  }
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'next-routes', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'app/users/route.ts'), 'export function GET() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'app/users/[id]/route.ts'), 'export function GET() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'app/blog/[...slug]/route.ts'), 'export function GET() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'app/docs/[[...slug]]/route.ts'), 'export function GET() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'pages/api/users.ts'), 'export default function handler() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'pages/api/users/[id].ts'), 'export default function handler() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'pages/api/[...slug].ts'), 'export default function handler() {}\n', 'utf8');
  return root;
}

async function makeRouteHandlerFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-route-handlers-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'route-handlers', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/server.js'), [
    "import express from 'express';",
    'const app = express();',
    "app.get('/api/items', () => {});",
    "fastify.get('/health', () => {});",
    'const docs = `',
    "app.get('/fake-route', () => {});",
    "router.post('/fake-post', () => {});",
    '`;',
    'void docs;',
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeSkipFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-skip-'));
  await fs.mkdir(path.join(root, 'public/assets'), { recursive: true });
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'skip-fixture', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'public/assets/logo.png'), Buffer.from([0, 1, 2, 3, 4, 5]));
  await fs.writeFile(path.join(root, 'src/huge.js'), `${'x'.repeat(200)}\n`, 'utf8');
  return root;
}

async function makeDependencyOrderingFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-dep-order-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'dep-order', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/x.js'), 'export const x = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/y.js'), 'export const y = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/a.js'), "import './y';\nimport './x';\n", 'utf8');
  await fs.writeFile(path.join(root, 'src/b.js'), "import './a';\n", 'utf8');
  return root;
}

async function makeSimpleCycleFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-cycle-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'cycle-fixture', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/a.js'), "import './b.js';\nexport const a = 1;\n", 'utf8');
  await fs.writeFile(path.join(root, 'src/b.js'), "import './a.js';\nexport const b = 1;\n", 'utf8');
  return root;
}

async function makeFixtureStringFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-fixture-strings-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-strings', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/foo.js'), 'export const foo = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'test/helper.test.js'), [
    "import test from 'node:test';",
    "import '../src/foo.js';",
    "const fixture = \"import express from 'express';\";",
    "const secretFixture = \"JWT_SECRET=super-secret-token\";",
    "const envFixture = \"process.env.TEST_SECRET\";",
    "test('helper fixture strings stay ignored', () => {});",
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeMemoryRankingFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-memory-rank-'));
  await fs.mkdir(path.join(root, 'src/graphq'), { recursive: true });
  await fs.mkdir(path.join(root, 'src/widgets'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'memory-rank-fixture', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/graphq/taskRouter.js'), 'export function buildTaskPlan() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/graphq/scanner.js'), 'export function scanProject() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/widgets/peer.js'), 'export function peer() {}\n', 'utf8');
  return root;
}

async function makeGraphqRankingFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-rank-'));
  const repoRoot = process.cwd();
  const graphqDir = path.join(repoRoot, 'src/graphq');

  await fs.mkdir(path.join(root, 'bin'), { recursive: true });
  await fs.mkdir(path.join(root, 'src/graphq'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });

  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'graphq-ranking-fixture',
    type: 'module',
    scripts: { test: 'node --test' }
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'README.md'), '# Ranking Fixture\n', 'utf8');

  const files = [
    'index.js',
    'taskRouter.js',
    'scanner.js',
    'fileClassifier.js',
    'contextPackWriter.js',
    'cli.js',
    'freshness.js'
  ];
  for (const name of files) {
    await fs.copyFile(path.join(graphqDir, name), path.join(root, 'src/graphq', name));
  }
  await fs.copyFile(path.join(repoRoot, 'bin/graphq.js'), path.join(root, 'bin/graphq.js'));
  await fs.copyFile(path.join(repoRoot, 'test/graphq.test.js'), path.join(root, 'test/graphq.test.js'));

  return root;
}

async function makeImportResolutionFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-imports-'));
  await fs.mkdir(path.join(root, 'src/graphq'), { recursive: true });
  await fs.mkdir(path.join(root, 'src/dir'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'import-fixture', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/a.js'), "import './b';\nimport './dir';\n", 'utf8');
  await fs.writeFile(path.join(root, 'src/b.js'), 'export const b = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/dir/index.js'), 'export const dir = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/graphq/taskRouter.js'), 'export function buildTaskPlan() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'test/task-router.test.js'), "import '../src/graphq/taskRouter.js';\n", 'utf8');
  await fs.writeFile(path.join(root, 'test/cli.test.js'), "import test from 'node:test';\ntest('cli', () => {});\n", 'utf8');
  return root;
}

async function makeImpactFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-impact-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'impact-fixture', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/a.js'), "import './b.js';\n", 'utf8');
  await fs.writeFile(path.join(root, 'src/b.js'), "import './c.js';\n", 'utf8');
  await fs.writeFile(path.join(root, 'src/c.js'), 'export const c = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/cycle-a.js'), "import './cycle-b.js';\n", 'utf8');
  await fs.writeFile(path.join(root, 'src/cycle-b.js'), "import './cycle-a.js';\n", 'utf8');
  return root;
}

async function makeFilenameSimilarityFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-similarity-'));
  await fs.mkdir(path.join(root, 'src/widgets'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'similarity-fixture', type: 'module' }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/widgets/tokenService.js'), 'export function token() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'test/token-service.test.js'), "import test from 'node:test';\ntest('token service', () => {});\n", 'utf8');
  await fs.writeFile(path.join(root, 'test/unrelated.test.js'), "import test from 'node:test';\ntest('other', () => {});\n", 'utf8');
  return root;
}

async function makeRiskFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-risk-'));
  await fs.mkdir(path.join(root, 'src/auth'), { recursive: true });
  await fs.mkdir(path.join(root, 'bin'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'risk-fixture',
    type: 'module',
    scripts: { test: 'node --test' }
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src/auth/session.js'), [
    "const secret = process.env.SESSION_SECRET || 'fallback';",
    'export function createSession() { return secret; }',
    ''
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(root, 'bin/wrapper.js'), [
    '#!/usr/bin/env node',
    "const cwd = process.env.GRAPHQ_DIR || process.cwd();",
    'console.log(cwd);',
    ''
  ].join('\n'), 'utf8');
  const loginRoute = 'router.' + "post('/api/login', () => token);";
  await fs.writeFile(path.join(root, 'test/auth-fixture.test.js'), [
    "import test from 'node:test';",
    "const token = 'super-" + "secret-token';",
    "const secret = process.env.TEST_SECRET;",
    loginRoute,
    "test('fixture strings stay low risk', () => {});",
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeDependencyFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-deps-'));
  await fs.mkdir(path.join(root, 'src/auth'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'dependency-fixture',
    type: 'module',
    dependencies: { express: '^4.0.0' },
    devDependencies: { 'node:test': 'builtin' },
    scripts: { test: 'node --test', start: 'node src/server.js' }
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'package-lock.json'), '{}\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/auth/jwt.js'), 'export function validate() {}\n', 'utf8');
  await fs.writeFile(path.join(root, 'src/server.js'), [
    "import fs from 'node:fs';",
    "import express from 'express';",
    "import { validate } from './auth/jwt.js';",
    'export const app = express();',
    ''
  ].join('\n'), 'utf8');
  return root;
}

async function makeGraphqProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tokenmaxxing-ai-graphq-'));
  await fs.mkdir(path.join(root, 'src/auth'), { recursive: true });
  await fs.mkdir(path.join(root, 'src/db'), { recursive: true });
  await fs.mkdir(path.join(root, 'src/routes'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.mkdir(path.join(root, 'node_modules'), { recursive: true });
  await fs.mkdir(path.join(root, 'public/assets'), { recursive: true });

  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'tokenmaxxing-ai-fixture',
    type: 'module',
    scripts: { test: 'node --test' }
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'README.md'), '# Fixture Project\n\nA local test repo.\n', 'utf8');
  await fs.writeFile(path.join(root, '.tokenmaxxing.md'), [
    '# Tokenmaxxing Project Memory',
    '',
    '## Project Profile',
    '- Type: Node auth service',
    '- Verification commands: npm test',
    '- High-risk areas: src/auth/jwt.js, src/db/client.js',
    ''
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(root, 'src/auth/jwt.js'), [
    "import { db } from '../db/client.js';",
    "const SOURCE_BODY_MARKER = 'do not copy source into graph output';",
    'export function validateToken(token) {',
    "  const secret = process.env.JWT_SECRET || 'fallback';",
    '  return Boolean(token && secret && db);',
    '}',
    ''
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(root, 'src/db/client.js'), [
    'export const db = { query() { return []; } };',
    ''
  ].join('\n'), 'utf8');
  const loginRoute = 'router.' + "post('/api/login', (req, res) => validateToken(req.body.token));";
  await fs.writeFile(path.join(root, 'src/routes/login.js'), [
    "import { validateToken } from '../auth/jwt.js';",
    loginRoute,
    ''
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(root, 'test/auth.test.js'), [
    "import test from 'node:test';",
    "import { validateToken } from '../src/auth/jwt.js';",
    'test("rejects expired tokens", () => validateToken("expired"));',
    ''
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(root, '.env'), 'JWT_SECRET=super-secret-token\n', 'utf8');
  await fs.writeFile(path.join(root, 'node_modules/ignored.js'), 'export const ignored = true;\n', 'utf8');
  await fs.writeFile(path.join(root, 'public/assets/logo.png'), Buffer.from([0, 1, 2, 3, 4, 5]));

  return root;
}

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
