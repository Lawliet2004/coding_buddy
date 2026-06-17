import fs from 'node:fs/promises';
import path from 'node:path';

export async function readPreviousState(projectRoot) {
  const graphqRoot = path.join(projectRoot, '.graphq');
  const [hashes, state] = await Promise.all([
    readJson(path.join(graphqRoot, 'cache/hashes.json')),
    readJson(path.join(graphqRoot, 'cache/state.json'))
  ]);
  return {
    hashes: hashes?.files ?? {},
    state: state ?? null
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

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function recommendation({ firstScan, addedFiles, changedFiles, deletedFiles }) {
  if (firstScan) return 'full scan';
  if (deletedFiles.length > 10 || addedFiles.length + changedFiles.length > 50) return 'full scan';
  if (addedFiles.length || changedFiles.length || deletedFiles.length) return 'changed scan';
  return 'no scan needed';
}
