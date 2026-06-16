import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { safeResolve } from '../src/install.js';

test('safeResolve resolves a relative path within the base', () => {
  const base = path.resolve('/tmp/safe-base');
  const result = safeResolve(base, 'foo/bar.md');
  assert.equal(result, path.join(base, 'foo', 'bar.md'));
});

test('safeResolve rejects absolute paths', () => {
  assert.throws(
    () => safeResolve('/tmp', '/etc/passwd'),
    /Adapter path must be relative/
  );
});

test('safeResolve rejects path traversal that escapes the base', () => {
  assert.throws(
    () => safeResolve(path.resolve('/tmp/base'), '../escape.md'),
    /Refusing to write outside install root/
  );
});

test('safeResolve allows a path equal to the base directory', () => {
  const base = path.resolve('/tmp/equal-base');
  const result = safeResolve(base, '.');
  assert.equal(result, base);
});

test('safeResolve handles a base directory without a trailing separator', () => {
  const base = path.resolve('/tmp/no-sep');
  const result = safeResolve(base, 'child.md');
  assert.equal(result, path.join(base, 'child.md'));
});
