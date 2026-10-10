import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const script = 'platform/local/run-buff-automation-test-window.sh';

test('Buff manual window wrapper is strict and delegates to the Node runner', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /buff-automation-test-window\.mjs/);
  assert.match(source, /fixture-profile/);
  assert.match(source, /window-minutes/);
  assert.match(source, /between 1 and 15/);
  assert.doesNotMatch(source, /DB14|DB15|DB16/);
});

test('Buff manual window wrapper rejects non-T1 and unknown arguments before Node startup', () => {
  for (const args of [['--fixture-profile=t0'], ['--unknown=value'], ['--window-minutes=16']]) {
    const result = spawnSync('bash', [script, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${args.join(' ')} unexpectedly passed`);
    assert.match(`${result.stdout}${result.stderr}`, /fixture-profile|unknown|window-minutes/i);
  }
});
