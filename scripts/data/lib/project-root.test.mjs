import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  getProjectRoot,
  resolveProjectPath,
  resolveSharedDataRoot
} from './project-root.mjs';

test('getProjectRoot resolves repository root from current module path', () => {
  const projectRoot = getProjectRoot();

  assert.equal(path.basename(projectRoot), 'p0-source-stability');
  assert.equal(path.isAbsolute(projectRoot), true);
});

test('resolveProjectPath joins paths relative to repository root', () => {
  const actual = resolveProjectPath('scripts', 'data', 'lib');

  assert.equal(actual, path.join(getProjectRoot(), 'scripts', 'data', 'lib'));
});

test('resolveSharedDataRoot stays under data/terraPedia', () => {
  const actual = resolveSharedDataRoot();

  assert.equal(
    actual,
    path.join(path.dirname(path.dirname(path.dirname(getProjectRoot()))), 'data', 'terraPedia')
  );
});

test('resolveSharedDataRoot uses workspace-level shared data directory for worktrees by default', () => {
  const projectRoot = getProjectRoot();
  const workspaceRoot = path.dirname(path.dirname(path.dirname(projectRoot)));

  assert.equal(resolveSharedDataRoot(), path.join(workspaceRoot, 'data', 'terraPedia'));
});

test('resolveSharedDataRoot honors explicit shared data env override', () => {
  const previous = process.env.TERRAPEDIA_SHARED_DATA_ROOT;
  process.env.TERRAPEDIA_SHARED_DATA_ROOT = 'G:/tmp/terrapedia-shared';

  try {
    const actual = resolveSharedDataRoot('raw', 'wiki');
    assert.equal(actual, path.resolve('G:/tmp/terrapedia-shared', 'raw', 'wiki'));
  } finally {
    if (previous == null) {
      delete process.env.TERRAPEDIA_SHARED_DATA_ROOT;
    } else {
      process.env.TERRAPEDIA_SHARED_DATA_ROOT = previous;
    }
  }
});
