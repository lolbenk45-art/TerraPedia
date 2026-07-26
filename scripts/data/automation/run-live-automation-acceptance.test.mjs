import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAcceptanceProbeSql,
  buildLiveResourceNames,
  parseProbeCounts
} from './run-live-automation-acceptance.mjs';

test('live resource names are exact runKey-isolated databases and bounded temporary accounts', () => {
  const value = buildLiveResourceNames({ profile: 't1', runKey: 'abc_0123456789abcdef' });
  assert.deepEqual(value.databases, {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation'
  });
  assert.match(value.accounts.provisioner, /^automation_prov_[0-9a-f]{12}$/);
  assert.match(value.accounts.readonly, /^automation_ro_[0-9a-f]{12}$/);
  assert.equal(value.accounts.provisioner.length <= 32, true);
});

test('probe SQL touches only the exact isolated three-database set and covers rollback commit restore', () => {
  const resources = buildLiveResourceNames({ profile: 't0', runKey: 'abc_0123456789abcdef' });
  const sql = buildAcceptanceProbeSql(resources.databases, 'probe_123');
  assert.doesNotMatch(sql, /terria_v1_(?:local|maint|relation)(?=[^a-z0-9_]|$)/i);
  assert.match(sql, /START TRANSACTION/);
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /COMMIT/);
  for (const name of Object.values(resources.databases)) assert.match(sql, new RegExp(name));
});

test('probe count parser requires rollback zero, commit one, and restore zero for all roles', () => {
  const parsed = parseProbeCounts([
    'rollback\t0\t0\t0',
    'commit\t1\t1\t1',
    'restore\t0\t0\t0'
  ].join('\n'));
  assert.deepEqual(parsed, { rollback: [0, 0, 0], commit: [1, 1, 1], restore: [0, 0, 0] });
  assert.throws(() => parseProbeCounts('rollback\t1\t0\t0\ncommit\t1\t1\t1\nrestore\t0\t0\t0'), /rollback/i);
});
