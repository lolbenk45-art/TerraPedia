import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadLocalStackConfig, resolveBackendApiBase } from './local-runtime-config.mjs';

test('resolveBackendApiBase reads backend port from local stack config', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-local-config-'));
  const configDir = path.join(repoRoot, 'scripts', 'dev', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'local-stack.config.json'),
    JSON.stringify({
      backend: {
        port: 18088
      }
    }),
    'utf8'
  );

  assert.equal(
    resolveBackendApiBase({}, { repoRoot }),
    'http://127.0.0.1:18088/api'
  );
});

test('resolveBackendApiBase keeps explicit apiBase override first', () => {
  assert.equal(
    resolveBackendApiBase({ apiBase: 'http://example.com/custom-api/' }),
    'http://example.com/custom-api'
  );
});

test('loadLocalStackConfig reads primary worktree config from linked worktrees', () => {
  const primaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-primary-config-'));
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-linked-config-'));
  const configDir = path.join(primaryRoot, 'scripts', 'dev', 'config');
  const gitWorktreeDir = path.join(primaryRoot, '.git', 'worktrees', 'linked');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(gitWorktreeDir, { recursive: true });
  fs.writeFileSync(
    path.join(worktreeRoot, '.git'),
    `gitdir: ${gitWorktreeDir}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(configDir, 'local-stack.config.json'),
    JSON.stringify({
      backend: {
        port: 18088
      },
      minio: {
        publicEndpoint: 'http://localhost:9000'
      }
    }),
    'utf8'
  );

  const config = loadLocalStackConfig(worktreeRoot);

  assert.equal(config.backend.port, 18088);
  assert.equal(config.minio.publicEndpoint, 'http://localhost:9000');
});
