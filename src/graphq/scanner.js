import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_MAX_FILE_BYTES,
  classifyPath,
  compileGitignore,
  hasGitignoreNegationForDescendant,
  isBinaryBuffer,
  isGitignoreNegated,
  matchesGitignore,
  normalizeRepoPath
} from './fileClassifier.js';

export async function scanProject(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const gitignorePatterns = await readGitignore(root);
  const skipped = [];
  const files = [];
  const securityFindings = [];

  await walk(root, '');

  files.sort((a, b) => a.path.localeCompare(b.path));
  const { internal: dependencies, external: externalImports } = buildDependencyMaps(files);
  const project = await readProjectMetadata(root);
  const tokenmaxxingMemory = await readTokenmaxxingMemory(root);

  return {
    projectRoot: root,
    generatedAt: new Date().toISOString(),
    project,
    tokenmaxxingMemory,
    files,
    dependencies,
    externalImports,
    skipped,
    securityFindings,
    totals: {
      filesScanned: files.length,
      filesSkipped: skipped.length,
      bytesScanned: files.reduce((sum, file) => sum + file.size, 0),
      bytesSkipped: skipped.reduce((sum, item) => sum + (item.size ?? 0), 0)
    }
  };

  async function walk(absoluteDir, relativeDir) {
    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch (error) {
      skipped.push({ path: normalizeRepoPath(relativeDir || '.'), reason: `read error: ${error.code ?? 'unknown'}` });
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relativePath = normalizeRepoPath(path.join(relativeDir, entry.name));
      const absolutePath = path.join(root, relativePath);

      let stats;
      try {
        stats = await fs.lstat(absolutePath);
      } catch (error) {
        skipped.push({ path: relativePath, reason: `stat error: ${error.code ?? 'unknown'}` });
        continue;
      }

      const ignoredByGitignore = matchesGitignore(relativePath, gitignorePatterns);
      const hasNegatedDescendant = stats.isDirectory() && hasGitignoreNegationForDescendant(relativePath, gitignorePatterns);
      if (ignoredByGitignore && !hasNegatedDescendant) {
        skipped.push({ path: relativePath, reason: 'gitignore' });
        continue;
      }

      if (stats.isSymbolicLink()) {
        skipped.push({ path: relativePath, reason: 'symlink' });
        continue;
      }

      const classification = classifyPath(relativePath, {
        allowIgnoredSegments: hasNegatedDescendant || isGitignoreNegated(relativePath, gitignorePatterns)
      });
      if (entry.isDirectory()) {
        if (classification.action === 'skip' && classification.reason !== 'unsupported file type') {
          skipped.push({ path: relativePath, reason: classification.reason });
          continue;
        }
        await walk(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        skipped.push({ path: relativePath, reason: 'not a regular file' });
        continue;
      }

      if (classification.action === 'skip') {
        skipped.push({ path: relativePath, reason: classification.reason, size: stats.size });
        continue;
      }

      if (stats.size > maxFileBytes) {
        skipped.push({ path: relativePath, reason: 'large file', size: stats.size });
        continue;
      }

      const buffer = await fs.readFile(absolutePath);
      if (isBinaryBuffer(buffer)) {
        skipped.push({ path: relativePath, reason: 'binary file', size: stats.size });
        continue;
      }

      const content = buffer.toString('utf8');
      const parsed = parseFile(content, classification.language, classification.category);
      const findingHints = detectSecurityHints(content, classification.language, classification.category, relativePath);
      securityFindings.push(...findingHints);

      const pathRoutes = inferRoutesFromPath(relativePath);
      const routes = [...new Set([...parsed.routes, ...pathRoutes])].sort();

      files.push({
        path: relativePath,
        language: classification.language,
        category: classification.category,
        size: stats.size,
        hash: sha256(buffer),
        tags: classification.tags,
        imports: parsed.imports,
        exports: parsed.exports,
        symbols: parsed.symbols,
        routes,
        usesEnv: parsed.usesEnv || findingHints.some((finding) => finding.kind === 'env-usage')
      });
    }
  }
}

export function maskJsStringLiterals(content) {
  let result = '';
  let index = 0;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '/' && next === '/') {
      const end = content.indexOf('\n', index);
      const sliceEnd = end === -1 ? content.length : end;
      result += content.slice(index, sliceEnd);
      index = sliceEnd;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = content.indexOf('*/', index + 2);
      const sliceEnd = end === -1 ? content.length : end + 2;
      result += content.slice(index, sliceEnd);
      index = sliceEnd;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      result += quote;
      index += 1;
      while (index < content.length) {
        const current = content[index];
        if (current === '\\') {
          result += '  ';
          index += 2;
          continue;
        }
        if (current === quote) {
          result += quote;
          index += 1;
          break;
        }
        result += current === '\n' || current === '\r' ? current : ' ';
        index += 1;
      }
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function parseFile(content, language, category) {
  const imports = new Set();
  const exports = new Set();
  const symbols = new Set();
  const routes = new Set();

  if (['javascript', 'typescript'].includes(language)) {
    collectJsTsImports(content, imports);
    collectAll(content, /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, exports, symbols);
    collectAll(content, /\bexport\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g, exports, symbols);
    collectAll(content, /\bfunction\s+([A-Za-z_$][\w$]*)/g, symbols);
    collectAll(content, /\bclass\s+([A-Za-z_$][\w$]*)/g, symbols);
    collectJsTsRoutes(content, routes);
  } else if (language === 'python') {
    collectAll(content, /^\s*(?:from\s+([^\s]+)\s+import|import\s+([^\s,]+))/gm, imports);
    collectAll(content, /^\s*def\s+([A-Za-z_]\w*)\s*\(/gm, symbols);
    collectAll(content, /^\s*class\s+([A-Za-z_]\w*)\s*[:(]/gm, symbols);
  } else if (language === 'go') {
    collectAll(content, /^\s*import\s+(?:\(\s*)?["`]([^"`]+)["`]/gm, imports);
    collectAll(content, /^\s*func\s+([A-Za-z_]\w*)\s*\(/gm, symbols);
  } else if (language === 'rust') {
    collectAll(content, /^\s*use\s+([^;]+);/gm, imports);
    collectAll(content, /^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)\s*\(/gm, symbols);
    collectAll(content, /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/gm, symbols);
  } else if (language === 'java') {
    collectAll(content, /^\s*import\s+([^;]+);/gm, imports);
    collectAll(content, /\b(?:class|interface|enum)\s+([A-Za-z_]\w*)/g, symbols);
  }

  return {
    imports: [...imports].sort(),
    exports: [...exports].sort(),
    symbols: [...symbols].sort(),
    routes: [...routes].sort(),
    usesEnv: /\bprocess\.env\b|\bos\.environ\b|\bSystem\.getenv\b|\benv::var\b/.test(content)
  };
}

function isScannerImplementationPath(relativePath) {
  return relativePath === 'src/graphq/scanner.js' || relativePath.endsWith('/graphq/scanner.js');
}

function isSecurityHeuristicLine(line, relativePath) {
  if (!isScannerImplementationPath(relativePath)) return false;
  return /\.test\s*\(\s*line\s*\)/.test(line)
    || /\bdetectSecurityHints\b/.test(line)
    || /\bfindings\.push\s*\(/.test(line)
    || /\/\\.*\\b(eval|child_process|execSync|spawn)/.test(line);
}

function collectJsTsImports(content, imports) {
  for (const chunk of extractJsImportExportChunks(content)) {
    if (/^import\s+['"]/.test(chunk)) {
      collectAll(chunk, /\bimport\s+['"]([^'"]+)['"]/g, imports);
      continue;
    }
    if (/^import\s/.test(chunk)) {
      collectAll(chunk, /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g, imports);
    }
    if (/^export\s+.*\sfrom\s+['"]/.test(chunk)) {
      collectAll(chunk, /\bexport\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/g, imports);
    }
  }

  for (const specifier of scanInlineModuleSpecifiers(content)) {
    imports.add(specifier);
  }
}

function extractJsImportExportChunks(content) {
  const withoutBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, '\n');
  const masked = maskJsStringLiterals(withoutBlockComments);
  const maskedLines = masked.split(/\r?\n/);
  const originalLines = withoutBlockComments.split(/\r?\n/);
  const chunks = [];
  let currentMasked = null;
  let currentOriginal = null;

  function isComplete(chunk) {
    return /['"][^'"]*['"]\s*;?\s*$/.test(chunk) || (chunk.includes(';') && !/\{\s*$/.test(chunk));
  }

  function flushChunk() {
    if (currentOriginal) chunks.push(currentOriginal.trim());
    currentMasked = null;
    currentOriginal = null;
  }

  for (let lineIndex = 0; lineIndex < maskedLines.length; lineIndex += 1) {
    const maskedLine = maskedLines[lineIndex].replace(/\/\/.*$/, '').trim();
    const originalLine = (originalLines[lineIndex] ?? '').replace(/\/\/.*$/, '').trim();

    if (!maskedLine) {
      if (currentMasked) {
        currentMasked += ' ';
        currentOriginal += ' ';
      }
      continue;
    }

    if (/^(?:import|export)\b/.test(maskedLine)) {
      if (currentOriginal) flushChunk();
      currentMasked = maskedLine;
      currentOriginal = originalLine;
      if (isComplete(currentMasked)) flushChunk();
      continue;
    }

    if (currentMasked) {
      currentMasked += ` ${maskedLine}`;
      currentOriginal += ` ${originalLine}`;
      if (isComplete(currentMasked)) flushChunk();
    }
  }

  if (currentOriginal) chunks.push(currentOriginal.trim());
  return chunks.filter(Boolean);
}

function scanInlineModuleSpecifiers(content) {
  const specifiers = [];
  let index = 0;

  while (index < content.length) {
    if (isLineCommentAt(content, index)) {
      index = content.indexOf('\n', index);
      if (index === -1) break;
      index += 1;
      continue;
    }

    if (isBlockCommentAt(content, index)) {
      const end = content.indexOf('*/', index + 2);
      index = end === -1 ? content.length : end + 2;
      continue;
    }

    const stringLiteral = readStringLiteral(content, index);
    if (stringLiteral) {
      index = stringLiteral.end;
      continue;
    }

    if (hasIdentifierBoundaryBefore(content, index) && content.startsWith('import(', index)) {
      const specifier = readCallStringArgument(content, index + 'import('.length);
      if (specifier) specifiers.push(specifier);
      index += 'import('.length;
      continue;
    }

    if (hasIdentifierBoundaryBefore(content, index) && content.startsWith('require(', index)) {
      const specifier = readCallStringArgument(content, index + 'require('.length);
      if (specifier) specifiers.push(specifier);
      index += 'require('.length;
      continue;
    }

    index += 1;
  }

  return specifiers;
}

function collectJsTsRoutes(content, routes) {
  let index = 0;

  while (index < content.length) {
    if (isLineCommentAt(content, index)) {
      index = content.indexOf('\n', index);
      if (index === -1) break;
      index += 1;
      continue;
    }

    if (isBlockCommentAt(content, index)) {
      const end = content.indexOf('*/', index + 2);
      index = end === -1 ? content.length : end + 2;
      continue;
    }

    const stringLiteral = readStringLiteral(content, index);
    if (stringLiteral) {
      index = stringLiteral.end;
      continue;
    }

    const route = readRouteCallAt(content, index);
    if (route) {
      routes.add(route.value);
      index = route.end;
      continue;
    }

    index += 1;
  }
}

function readRouteCallAt(content, index) {
  if (!hasIdentifierBoundaryBefore(content, index)) return null;
  for (const receiver of ['app', 'router', 'fastify']) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
      const prefix = `${receiver}.${method}(`;
      if (!content.startsWith(prefix, index)) continue;
      const value = readCallStringArgument(content, index + prefix.length);
      if (!value) return null;
      return { value, end: index + prefix.length };
    }
  }
  return null;
}

function isLineCommentAt(content, index) {
  return content[index] === '/' && content[index + 1] === '/';
}

function isBlockCommentAt(content, index) {
  return content[index] === '/' && content[index + 1] === '*';
}

function hasIdentifierBoundaryBefore(content, index) {
  if (index === 0) return true;
  return !/[A-Za-z0-9_$]/.test(content[index - 1]);
}

function readStringLiteral(content, index) {
  const quote = content[index];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;

  let cursor = index + 1;
  while (cursor < content.length) {
    const char = content[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote) {
      return { end: cursor + 1 };
    }
    cursor += 1;
  }

  return { end: content.length };
}

function readCallStringArgument(content, index) {
  let cursor = index;
  while (cursor < content.length && /\s/.test(content[cursor])) cursor += 1;
  const quote = content[cursor];
  if (quote !== '"' && quote !== "'") return null;

  let value = '';
  cursor += 1;
  while (cursor < content.length) {
    const char = content[cursor];
    if (char === '\\') {
      value += content[cursor + 1] ?? '';
      cursor += 2;
      continue;
    }
    if (char === quote) return value;
    value += char;
    cursor += 1;
  }

  return null;
}

function detectSecurityHints(content, language, category, relativePath) {
  const analysisContent = ['javascript', 'typescript'].includes(language)
    ? maskJsStringLiterals(content)
    : content;
  const findings = [];
  const lines = analysisContent.split(/\r?\n/);
  const secretPattern = /\b(api[_-]?key|secret|password|token|credential)\b\s*[:=]\s*['"]?([A-Za-z0-9_./+=-]{12,})/i;

  lines.forEach((line, index) => {
    if (secretPattern.test(line)) {
      findings.push({
        path: relativePath,
        line: index + 1,
        kind: 'secret-like-value',
        severity: 'medium',
        redacted: true
      });
    }
    if (/\bprocess\.env\b|\bos\.environ\b|\bSystem\.getenv\b|\benv::var\b/.test(line)) {
      findings.push({
        path: relativePath,
        line: index + 1,
        kind: 'env-usage',
        severity: 'info',
        redacted: true
      });
    }
    if (
      /\beval\s*\(|new Function\s*\(|child_process|execSync|spawn\s*\(/.test(line)
      && !isSecurityHeuristicLine(line, relativePath)
    ) {
      findings.push({
        path: relativePath,
        line: index + 1,
        kind: 'dangerous-execution',
        severity: 'medium',
        redacted: true
      });
    }
  });

  return findings;
}

function buildDependencyMaps(files) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const internal = [];
  const externalByPackage = new Map();

  for (const file of files) {
    for (const specifier of file.imports) {
      if (specifier.startsWith('.')) {
        const target = resolveInternalImport(file.path, specifier, byPath);
        if (!target) continue;
        internal.push({ from: file.path, to: target, type: 'internal' });
        continue;
      }

      const packageName = parsePackageName(specifier);
      if (!packageName) continue;
      if (!externalByPackage.has(packageName)) externalByPackage.set(packageName, new Set());
      externalByPackage.get(packageName).add(file.path);
    }
  }

  const externalImports = [...externalByPackage.entries()]
    .map(([packageName, fileSet]) => ({
      package: packageName,
      files: [...fileSet].sort()
    }))
    .sort((a, b) => a.package.localeCompare(b.package));

  return {
    internal: stableSortDependencies(internal),
    external: externalImports
  };
}

export function stableSortDependencies(dependencies) {
  return [...dependencies].sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

export function resolveInternalImport(fromPath, specifier, byPath) {
  if (!specifier.startsWith('.')) return null;
  const base = normalizeRepoPath(path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier)));
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.jsx`,
    `${base}.py`,
    `${base}/index.js`,
    `${base}/index.mjs`,
    `${base}/index.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.jsx`
  ];
  return candidates.find((candidate) => byPath.has(candidate)) ?? null;
}

function parsePackageName(specifier) {
  if (specifier.startsWith('node:')) return specifier;
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split('/')[0] ?? null;
}

function inferRoutesFromPath(relativePath) {
  const routes = [];
  const appRoute = routeFromNextAppPath(relativePath);
  if (appRoute) routes.push(appRoute);

  const pagesRoute = routeFromPagesApiPath(relativePath);
  if (pagesRoute) routes.push(pagesRoute);

  const srcRoutesMatch = relativePath.match(/^src\/routes\/([^/]+)\.(?:js|ts|jsx|tsx|mjs|cjs)$/);
  if (srcRoutesMatch) routes.push(`/${srcRoutesMatch[1]}`);

  return routes;
}

export function normalizeNextRouteSegment(segment) {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return `*${segment.slice(5, -2)}?`;
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return `*${segment.slice(4, -1)}`;
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment.replace(/^\[(.+)\]$/, ':$1');
}

export function routeFromNextAppPath(relativePath) {
  const match = relativePath.match(/^app\/(.+)\/route\.(?:ts|tsx|js|jsx|mjs|cjs)$/);
  if (!match) return null;
  const segments = match[1].split('/').map(normalizeNextRouteSegment);
  return `/${segments.join('/')}`;
}

export function routeFromPagesApiPath(relativePath) {
  const match = relativePath.match(/^pages\/api\/(.+)\.(?:ts|tsx|js|jsx|mjs|cjs)$/);
  if (!match) return null;
  const raw = match[1].replace(/\/index$/, '');
  const segments = raw.split('/').map(normalizeNextRouteSegment);
  return `/api/${segments.join('/')}`;
}

async function readProjectMetadata(root) {
  const packageJson = await readJsonIfExists(path.join(root, 'package.json'));
  const readme = await readTextIfExists(path.join(root, 'README.md'));
  return {
    name: packageJson?.name ?? path.basename(root),
    type: inferProjectType(packageJson),
    packageManager: await detectPackageManager(root),
    scripts: Object.fromEntries(Object.keys(packageJson?.scripts ?? {}).sort().map((name) => [name, true])),
    dependencies: Object.keys(packageJson?.dependencies ?? {}).sort(),
    devDependencies: Object.keys(packageJson?.devDependencies ?? {}).sort(),
    readmeTitle: readme?.match(/^#\s+(.+)$/m)?.[1] ?? null
  };
}

async function readTokenmaxxingMemory(root) {
  const content = await readTextIfExists(path.join(root, '.tokenmaxxing.md'));
  if (!content) return null;
  return {
    path: '.tokenmaxxing.md',
    summary: summarizeMemory(content)
  };
}

function summarizeMemory(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => /^-\s+/.test(line.trim()))
    .slice(0, 8)
    .map((line) => line.trim());
}

async function detectPackageManager(root) {
  for (const [filename, manager] of [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm']
  ]) {
    try {
      await fs.stat(path.join(root, filename));
      return manager;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

function inferProjectType(packageJson) {
  if (!packageJson) return 'unknown';
  if (packageJson.bin) return 'node-cli';
  if (packageJson.dependencies?.next || packageJson.devDependencies?.next) return 'next-app';
  if (packageJson.dependencies?.react || packageJson.devDependencies?.react) return 'frontend-app';
  return 'node-project';
}

async function readGitignore(root) {
  const raw = await readTextIfExists(path.join(root, '.gitignore'));
  return raw ? compileGitignore(raw) : [];
}

async function readJsonIfExists(filePath) {
  const text = await readTextIfExists(filePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function collectAll(content, pattern, ...sets) {
  for (const match of content.matchAll(pattern)) {
    const value = match.slice(1).find(Boolean);
    if (!value) continue;
    for (const set of sets) set.add(value.trim());
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
