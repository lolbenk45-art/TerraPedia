import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('full quality gate includes live automation adapter and runner contracts without executing live acceptance', () => {
  const source = fs.readFileSync(new URL('./quality-gate.sh', import.meta.url), 'utf8');
  assert.match(source, /scripts\/data\/automation\/mysql-automation-acceptance-adapter\.test\.mjs/);
  assert.match(source, /scripts\/data\/automation\/run-live-automation-acceptance\.test\.mjs/);
  assert.doesNotMatch(source, /TERRAPEDIA_AUTOMATION_ACCEPTANCE_ENABLED=1/);
});
