import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDurableRunKeyRegistry } from './automation-database-contract.mjs';
import {
  buildAutomationTestManifest,
  assertAutomationTestManifest
} from './automation-test-profile.mjs';

function registry(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-profile-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return openDurableRunKeyRegistry(path.join(directory, 'run-keys.json'));
}

function manifest(t, profile = 't0') {
  return buildAutomationTestManifest({
    profile,
    runId: `profile-${profile}`,
    mappings: registry(t),
    environmentId: `env-${profile}`,
    host: '127.0.0.1',
    port: 3306,
    serverUuid: `server-${profile}`,
    redisIdentity: {
      host: '127.0.0.1', port: 6379, logicalDb: profile === 't0' ? 21 : 22,
      reservationToken: `reservation-${profile}`
    },
    sourceSnapshot: profile === 't1' ? {
      snapshotId: 'snapshot-readonly-1',
      profile: 't2-readonly',
      readOnly: true,
      scrubbed: true,
      snapshotHash: `sha256:${'a'.repeat(64)}`,
      credentialRole: 'automation-readonly',
      serverFingerprints: [
        { role: 'local', name: 'terria_v1_local', host: 'db', port: 3306, serverUuid: 'server-local' },
        { role: 'maint', name: 'terria_v1_maint', host: 'db', port: 3306, serverUuid: 'server-maint' },
        { role: 'relation', name: 'terria_v1_relation', host: 'db', port: 3306, serverUuid: 'server-relation' }
      ],
      databases: { local: 'terria_v1_local', maint: 'terria_v1_maint', relation: 'terria_v1_relation' }
    } : undefined
  });
}

test('automation test manifest is an exact isolated three-database set', (t) => {
  const value = manifest(t);
  assert.doesNotThrow(() => assertAutomationTestManifest(value));
  assert.deepEqual(Object.keys(value.databases).sort(), ['local', 'maint', 'relation']);
  assert.match(value.databases.local.name, /^terria_v1_automation_test_[a-z0-9]{1,3}_[0-9a-f]{16}_local$/);
  assert.equal(value.provisioner.allowedPrefix, `terria_v1_automation_test_${value.runKey}_`);
  assert.equal(value.redis.epoch, `epoch-${value.runKey}`);
});

test('T1 manifest requires a scrubbed read-only T2 snapshot', (t) => {
  const value = manifest(t, 't1');
  assert.doesNotThrow(() => assertAutomationTestManifest(value));
  for (const sourceSnapshot of [
    undefined,
    { ...value.sourceSnapshot, snapshotHash: 'sha256:unsafe' },
    { snapshotId: 'bad', profile: 't0', readOnly: true, scrubbed: true },
    { snapshotId: 'bad', profile: 't2-readonly', readOnly: false, scrubbed: true },
    { snapshotId: 'bad', profile: 't2-readonly', readOnly: true, scrubbed: false }
  ]) {
    assert.throws(() => assertAutomationTestManifest({ ...value, sourceSnapshot }), /snapshot|read.only|scrub/i);
  }
});

test('manifest rejects formal names, wrong roles, wrong server, and wrong Redis epoch', (t) => {
  const value = manifest(t);
  for (const candidate of [
    { ...value, databases: { ...value.databases, local: { ...value.databases.local, name: 'terria_v1_local' } } },
    { ...value, databases: { ...value.databases, local: { ...value.databases.local, role: 'maint' } } },
    { ...value, databases: { ...value.databases, local: { ...value.databases.local, serverUuid: 'other' } } },
    { ...value, redis: { ...value.redis, epoch: 'formal-epoch' } }
  ]) {
    assert.throws(() => assertAutomationTestManifest(candidate), /formal|role|server|epoch|identity/i);
  }
});
