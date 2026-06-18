import fs from 'node:fs/promises';
import path from 'node:path';

export async function assertNoLinkedPathComponents(trustedRoot, targetPath, displayPath) {
  const root = path.resolve(trustedRoot);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);

  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing to inspect a path outside its trusted root: ${displayPath ?? targetPath}`);
  }
  if (!relative) return;

  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    try {
      const stats = await fs.lstat(current);
      if (stats.isSymbolicLink()) {
        const unsafePath = path.relative(root, current) || component;
        throw new Error(`Unsafe linked path component "${unsafePath}" in ${displayPath ?? relative}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}
