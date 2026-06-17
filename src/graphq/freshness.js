import fs from 'node:fs/promises';
import path from 'node:path';

export function corruptCacheMessage(relativePaths) {
  const files = relativePaths.join(', ');
  return `GraphQ cache is corrupt: ${files}. Run graphq clean and graphq scan.`;
}

export class GraphqCorruptCacheError extends Error {
  constructor(relativePaths) {
    super(corruptCacheMessage(relativePaths));
    this.name = 'GraphqCorruptCacheError';
    this.relativePaths = relativePaths;
  }
}

export async function readCacheJsonResult(filePath) {
  try {
    return { data: JSON.parse(await fs.readFile(filePath, 'utf8')), corrupt: false };
  } catch (error) {
    if (error.code === 'ENOENT') return { data: null, corrupt: false };
    if (error instanceof SyntaxError) return { data: null, corrupt: true };
    throw error;
  }
}

export async function readCacheJson(filePath) {
  return (await readCacheJsonResult(filePath)).data;
}

export async function readPreviousState(projectRoot) {
  const graphqRoot = path.join(projectRoot, '.graphq');
  const hashesPath = '.graphq/cache/hashes.json';
  const statePath = '.graphq/cache/state.json';
  const [hashesResult, stateResult] = await Promise.all([
    readCacheJsonResult(path.join(graphqRoot, 'cache/hashes.json')),
    readCacheJsonResult(path.join(graphqRoot, 'cache/state.json'))
  ]);
  const corruptCachePaths = [];
  if (hashesResult.corrupt) corruptCachePaths.push(hashesPath);
  if (stateResult.corrupt) corruptCachePaths.push(statePath);
  return {
    hashes: hashesResult.data?.files ?? {},
    state: stateResult.data ?? null,
    cacheCorrupt: corruptCachePaths.length > 0,
    corruptCachePaths
  };
}

export function buildFreshness(previous, scan, command) {
  const currentHashes = Object.fromEntries(scan.files.map((file) => [file.path, file.hash]));
  const previousHashes = previous.hashes ?? {};
  const previousPaths = new Set(Object.keys(previousHashes));
  const currentPaths = new Set(Object.keys(currentHashes));

  const addedFiles = [...currentPaths].filter((file) => !previousPaths.has(file)).sort();
  const changedFiles = [...currentPaths]
    .filter((file) => previousPaths.has(file) && previousHashes[file] !== currentHashes[file])
    .sort();
  const deletedFiles = [...previousPaths].filter((file) => !currentPaths.has(file)).sort();
  const firstScan = !previous.state;
  const stale = firstScan || addedFiles.length > 0 || changedFiles.length > 0 || deletedFiles.length > 0;

  return {
    generatedAt: scan.generatedAt,
    lastFullScan: firstScan ? null : previous.state?.lastFullScan ?? null,
    lastIncrementalScan: command === 'changed' ? scan.generatedAt : previous.state?.lastIncrementalScan ?? null,
    addedFiles,
    changedFiles,
    deletedFiles,
    stale,
    recommendation: recommendation({ firstScan, addedFiles, changedFiles, deletedFiles })
  };
}

export function buildHashes(scan) {
  return {
    generatedAt: scan.generatedAt,
    files: Object.fromEntries(scan.files.map((file) => [file.path, file.hash]))
  };
}

export function buildState(scan, freshness, command) {
  const fullLike = !['changed', 'status'].includes(command);
  return {
    generatedAt: scan.generatedAt,
    lastFullScan: fullLike ? scan.generatedAt : freshness.lastFullScan,
    lastIncrementalScan: fullLike ? freshness.lastIncrementalScan : scan.generatedAt,
    fileCount: scan.files.length,
    bytesScanned: scan.totals.bytesScanned,
    recommendation: freshness.recommendation
  };
}

function recommendation({ firstScan, addedFiles, changedFiles, deletedFiles }) {
  if (firstScan) return 'full scan';
  if (deletedFiles.length > 10 || addedFiles.length + changedFiles.length > 50) return 'full scan';
  if (addedFiles.length || changedFiles.length || deletedFiles.length) return 'changed scan';
  return 'no scan needed';
}
