import fs from 'node:fs/promises';
import path from 'node:path';
import { adapters, targetAliases, targetNames } from './adapters.js';
import { GENERATED_MARKER } from './constants.js';

// Targets that support --scope user. Cursor and commandcode write only project files.
export const USER_TARGETS = ['codex', 'claude-code', 'github-copilot', 'opencode', 'antigravity', 'kiro'];

export function listTargets() {
  return [...targetNames];
}

export function normalizeTargets(rawTargets = ['all'], scope = 'project') {
  const requested = rawTargets.flatMap((target) => String(target).split(',')).map((target) => target.trim()).filter(Boolean);
  const normalized = new Set();

  for (const target of requested.length ? requested : ['all']) {
    const key = target.toLowerCase();
    if (key === 'all') {
      // For user scope, expand only to supported user targets.
      const allowedNames = scope === 'user' ? USER_TARGETS : targetNames;
      for (const name of allowedNames) normalized.add(name);
      continue;
    }

    const resolved = targetAliases.get(key);
    if (!resolved) {
      throw new Error(`Unknown target "${target}". Known targets: ${targetNames.join(', ')}`);
    }
    normalized.add(resolved);
  }

  return [...normalized];
}

export async function install(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const homeDir = path.resolve(options.homeDir);
  const files = buildInstallFiles(options.targets, options.scope);

  // Build the full plan first (atomic: inspect all files before writing any).
  const plan = [];
  for (const file of files) {
    const baseDir = file.root === 'home' ? homeDir : projectRoot;
    const absolutePath = safeResolve(baseDir, file.path);
    const next = await planFile(absolutePath, file, options.force);
    plan.push({
      action: next.action,
      write: next.write,
      content: next.content,
      absolutePath,
      relativePath: path.relative(projectRoot, absolutePath) || '.'
    });
  }

  // If any file is a conflict and --force is not set, return the plan without writing.
  const hasConflict = plan.some((p) => p.action === 'conflict');
  if (hasConflict && !options.force) {
    return plan.map((p) => ({ action: p.action, path: p.relativePath }));
  }

  // Write phase.
  const results = [];
  for (const p of plan) {
    if (!options.dryRun && p.write) {
      await fs.mkdir(path.dirname(p.absolutePath), { recursive: true });
      await fs.writeFile(p.absolutePath, p.content, 'utf8');
    }
    results.push({ action: p.action, path: p.relativePath });
  }

  return results;
}

export async function verifyInstall(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const homeDir = path.resolve(options.homeDir);
  const files = buildInstallFiles(options.targets, options.scope);
  const results = [];

  for (const file of files) {
    const baseDir = file.root === 'home' ? homeDir : projectRoot;
    const absolutePath = safeResolve(baseDir, file.path);
    const existing = await readOptional(absolutePath);
    const relativePath = path.relative(projectRoot, absolutePath) || '.';

    if (existing === null) {
      results.push({
        action: 'missing',
        path: relativePath,
        message: 'Expected generated file does not exist.'
      });
      continue;
    }

    const expected = materialize(file, existing);
    if (existing !== expected) {
      results.push({
        action: 'mismatch',
        path: relativePath,
        message: 'Installed file differs from generated content.'
      });
      continue;
    }

    results.push({
      action: 'verified',
      path: relativePath
    });
  }

  return results;
}

function buildInstallFiles(targets, scope) {
  const seen = new Set();
  return targets.flatMap((target) => {
    const adapter = adapters[target];
    if (!adapter) throw new Error(`Missing adapter implementation for ${target}`);
    return adapter(scope);
  }).filter((file) => {
    const key = `${file.root}:${file.path}:${file.blockId ?? ''}:${file.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function planFile(absolutePath, file, force) {
  const existing = await readOptional(absolutePath);
  const content = materialize(file, existing);

  if (existing === content) {
    return { action: 'unchanged', write: false, content };
  }

  if (file.merge === 'block') {
    return { action: existing === null ? 'create' : 'update', write: true, content };
  }

  if (existing === null) {
    return { action: 'create', write: true, content };
  }

  if (existing.includes(GENERATED_MARKER) || force) {
    return { action: 'update', write: true, content };
  }

  return { action: 'conflict', write: false, content: existing };
}

function materialize(file, existing) {
  if (file.merge !== 'block') {
    return ensureTrailingNewline(file.content);
  }

  const start = `<!-- tokenmaxxing-ai:${file.blockId}:start -->`;
  const end = `<!-- tokenmaxxing-ai:${file.blockId}:end -->`;
  const block = `${start}\n${ensureTrailingNewline(file.content).trimEnd()}\n${end}`;

  if (!existing) {
    return `${block}\n`;
  }

  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (pattern.test(existing)) {
    return ensureTrailingNewline(existing.replace(pattern, block));
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
}

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function safeResolve(baseDir, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Adapter path must be relative: ${relativePath}`);
  }

  const resolved = path.resolve(baseDir, relativePath);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : `${baseDir}${path.sep}`;
  if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) {
    throw new Error(`Refusing to write outside install root: ${relativePath}`);
  }
  return resolved;
}

function ensureTrailingNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
