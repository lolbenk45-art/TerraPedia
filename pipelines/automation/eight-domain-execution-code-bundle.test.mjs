import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildExecutionCodeBundleManifest,
  verifyExecutionCodeBundleManifest,
} from './eight-domain-execution-code-bundle.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('execution code bundle binds runtime tracked and untracked files and rejects post-freeze drift', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e8pr-code-bundle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(root, 'pipelines/automation'), { recursive: true });
  fs.mkdirSync(path.join(root, 'platform/local'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pipelines/automation/entry.mjs'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'docs/notes.md'), 'not runtime code\n');
  git(root, 'add', 'pipelines/automation/entry.mjs', 'docs/notes.md');
  git(root, 'commit', '-q', '-m', 'test: add code bundle fixture');
  fs.writeFileSync(path.join(root, 'platform/local/runtime.sh'), 'true\n');

  const manifest = buildExecutionCodeBundleManifest({ repoRoot: root });
  assert.deepEqual(manifest.files.map((entry) => entry.path), [
    'pipelines/automation/entry.mjs', 'platform/local/runtime.sh',
  ]);
  assert.equal(verifyExecutionCodeBundleManifest(manifest, { repoRoot: root }).bundleSha256, manifest.bundleSha256);

  fs.appendFileSync(path.join(root, 'pipelines/automation/entry.mjs'), 'export const changed = true;\n');
  assert.throws(() => verifyExecutionCodeBundleManifest(manifest, { repoRoot: root }), /code bundle.*drift/i);
});
