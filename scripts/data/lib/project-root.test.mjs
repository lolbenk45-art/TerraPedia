import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  getProjectRoot,
  resolveProjectPath,
  resolveSharedDataRoot
} from './project-root.mjs';

test('getProjectRoot resolves repository root from current module path', () => {
  const projectRoot = getProjectRoot();

  assert.equal(path.isAbsolute(projectRoot), true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'scripts')), true);
  assert.equal(fs.existsSync(path.join(projectRoot, 'project-plan')), true);
});

test('resolveProjectPath joins paths relative to repository root', () => {
  const actual = resolveProjectPath('scripts', 'data', 'lib');

  assert.equal(actual, path.join(getProjectRoot(), 'scripts', 'data', 'lib'));
});

test('resolveSharedDataRoot stays under data/terraPedia', () => {
  const actual = resolveSharedDataRoot();

  assert.equal(path.basename(actual), 'terraPedia');
  assert.equal(path.basename(path.dirname(actual)), 'data');
});

test('resolveSharedDataRoot uses primary worktree shared data directory for linked worktrees by default', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-project-root-'));
  const primaryRoot = path.join(tempDir, 'primary');
  const linkedRoot = path.join(tempDir, 'linked');
  const gitWorktreeDir = path.join(primaryRoot, '.git', 'worktrees', 'linked');
  fs.mkdirSync(path.join(primaryRoot, '.git'), { recursive: true });
  fs.mkdirSync(path.join(primaryRoot, 'data', 'terraPedia'), { recursive: true });
  fs.mkdirSync(gitWorktreeDir, { recursive: true });
  fs.mkdirSync(path.join(linkedRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(linkedRoot, 'project-plan'), { recursive: true });
  fs.writeFileSync(path.join(linkedRoot, '.git'), `gitdir: ${gitWorktreeDir}\n`, 'utf8');

  const moduleUrl = pathToFileURL(path.join(getProjectRoot(), 'scripts', 'data', 'lib', 'project-root.mjs')).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { resolveSharedDataRoot } from ${JSON.stringify(moduleUrl)}; console.log(resolveSharedDataRoot());`
    ],
    {
      cwd: linkedRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TERRAPEDIA_SHARED_DATA_ROOT: '',
        TERRAPEDIA_SOURCE_DATA_DIR: '',
        WORKTREE_ROOT: '',
        TERRAPEDIA_PROJECT_ROOT: ''
      }
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), path.join(primaryRoot, 'data', 'terraPedia'));
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
