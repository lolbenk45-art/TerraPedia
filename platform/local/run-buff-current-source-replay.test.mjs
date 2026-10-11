import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = 'platform/local/run-buff-current-source-replay.sh';

test('current-source wrapper requires the explicit isolated Redis DB18 and delegates to the bounded Node replay', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /buff-current-source-replay\.mjs/);
  assert.match(source, /redis-db=18|REDIS_DB=18|18/);
  assert.doesNotMatch(source, /DB14|DB15|DB16|terria_v1_local|terria_v1_maint|terria_v1_relation/);
});

test('current-source wrapper accepts only --redis-db=18 and rejects other Redis DBs before Node startup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-source-wrapper-test-'));
  const nodeStub = path.join(directory, 'node');
  fs.writeFileSync(nodeStub, '#!/usr/bin/env bash\nprintf "%s\\n" "$*"\n', { mode: 0o700 });
  const accepted = spawnSync('bash', [script, '--redis-db=18'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
  });
  fs.rmSync(directory, { recursive: true, force: true });
  assert.equal(accepted.status, 0);
  assert.match(accepted.stdout, /buff-current-source-replay\.mjs.*--redis-db=18|--redis-db=18.*buff-current-source-replay\.mjs/);
  const result = spawnSync('bash', [script, '--redis-db=15'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /unknown|argument|source/i);
  const db13 = spawnSync('bash', [script, '--redis-db=13'], { encoding: 'utf8' });
  assert.notEqual(db13.status, 0);
});
