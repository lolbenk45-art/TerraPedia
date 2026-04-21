import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBackendApiBase } from './local-runtime-config.mjs';

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
