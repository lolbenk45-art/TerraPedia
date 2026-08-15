import assert from 'node:assert/strict';
import test from 'node:test';

import { EXPECTED_NPC_T0_SCHEMA_EVIDENCE } from './npc-canonical-t0-acceptance.mjs';

const acceptance = await import('./npc-canonical-t1-acceptance.mjs').catch(() => ({}));

const DATABASES = {
  local: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local',
  maint: 'terria_v1_automation_acceptance_npc_0123456789abcdef_maint',
  relation: 'terria_v1_automation_acceptance_npc_0123456789abcdef_relation',
};

function snapshotTables() {
  return EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map(([role, table]) => ({
    role,
    table,
    sourceAvailable: true,
    sourceCount: 1,
    sampleHash: `sha256:${'a'.repeat(64)}`,
    schemaHash: `sha256:${'b'.repeat(64)}`,
  }));
}

function manifest() {
  return {
    runKey: 'npc_0123456789abcdef',
    sourceSnapshot: {
      snapshotId: 'npc-t1-snapshot',
      profile: 't2-readonly',
      readOnly: true,
      scrubbed: true,
      snapshotHash: `sha256:${'c'.repeat(64)}`,
      credentialRole: 'automation-readonly',
      databases: {
        local: 'terria_v1_local',
        maint: 'terria_v1_maint',
        relation: 'terria_v1_relation',
      },
      serverFingerprints: [
        { role: 'local', name: 'terria_v1_local', host: '127.0.0.1', port: 13306, serverUuid: 'local-server' },
        { role: 'maint', name: 'terria_v1_maint', host: '127.0.0.1', port: 13306, serverUuid: 'maint-server' },
        { role: 'relation', name: 'terria_v1_relation', host: '127.0.0.1', port: 13306, serverUuid: 'relation-server' },
      ],
      tables: snapshotTables(),
    },
  };
}

function completion() {
  return {
    inputHash: `sha256:${'e'.repeat(64)}`,
    completionHash: `sha256:${'f'.repeat(64)}`,
  };
}

function snapshotBinding() {
  return {
    ...completion(),
    snapshotHash: `sha256:${'c'.repeat(64)}`,
    verificationHash: `sha256:${'d'.repeat(64)}`,
  };
}

test('NPC T1 acceptance requires an exact verified scrubbed snapshot', async () => {
  assert.equal(typeof acceptance.runNpcCanonicalT1Acceptance, 'function');
  const result = await acceptance.runNpcCanonicalT1Acceptance({
    profile: 't1',
    databases: DATABASES,
    manifest: manifest(),
    snapshotVerification: {
      verified: true,
      verificationHash: `sha256:${'d'.repeat(64)}`,
      tables: snapshotTables(),
    },
    completion: completion(),
    snapshotBinding: snapshotBinding(),
  });
  assert.deepEqual(result, {
    profile: 't1',
    status: 'passed',
    snapshot: {
      snapshotId: 'npc-t1-snapshot',
      snapshotHash: `sha256:${'c'.repeat(64)}`,
      verificationHash: `sha256:${'d'.repeat(64)}`,
    },
    snapshotBinding: snapshotBinding(),
    npcSnapshot: {
      requiredTableCount: EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length,
      sourceCounts: Object.fromEntries(EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map(([role, table]) => [`${role}.${table}`, 1])),
    },
  });
});

test('NPC T1 acceptance rejects a non-T1 profile, unverified copy, and missing source table', async () => {
  assert.equal(typeof acceptance.runNpcCanonicalT1Acceptance, 'function');
  await assert.rejects(
    acceptance.runNpcCanonicalT1Acceptance({ profile: 't0', databases: DATABASES, manifest: manifest(), snapshotVerification: {} }),
    /T1/i,
  );
  await assert.rejects(
    acceptance.runNpcCanonicalT1Acceptance({ profile: 't1', databases: DATABASES, manifest: manifest(), snapshotVerification: {} }),
    /verification/i,
  );
  const incomplete = manifest();
  incomplete.sourceSnapshot.tables.pop();
  await assert.rejects(
    acceptance.runNpcCanonicalT1Acceptance({
      profile: 't1', databases: DATABASES, manifest: incomplete,
      snapshotVerification: { verified: true, verificationHash: `sha256:${'d'.repeat(64)}`, tables: snapshotTables() },
    }),
    /snapshot table/i,
  );
});

test('NPC T1 acceptance requires one matching completion and copied-snapshot binding', async () => {
  await assert.rejects(
    acceptance.runNpcCanonicalT1Acceptance({
      profile: 't1',
      databases: DATABASES,
      manifest: manifest(),
      snapshotVerification: {
        verified: true,
        verificationHash: `sha256:${'d'.repeat(64)}`,
        tables: snapshotTables(),
      },
      completion: completion(),
      snapshotBinding: { ...snapshotBinding(), completionHash: `sha256:${'0'.repeat(64)}` },
    }),
    /binding/i,
  );
});

test('NPC T1 evidence binds the completion identity and only accepts clean isolated proof', () => {
  assert.equal(typeof acceptance.buildNpcCanonicalT1Evidence, 'function');
  const acceptanceResult = {
    profile: 't1',
    status: 'passed',
    snapshot: {
      snapshotId: 'npc-t1-snapshot',
      snapshotHash: `sha256:${'c'.repeat(64)}`,
      verificationHash: `sha256:${'d'.repeat(64)}`,
    },
    snapshotBinding: snapshotBinding(),
    npcSnapshot: {
      requiredTableCount: EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length,
      sourceCounts: Object.fromEntries(EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map(([role, table]) => [`${role}.${table}`, 1])),
    },
  };
  const evidence = acceptance.buildNpcCanonicalT1Evidence({
    runId: 'npc-t1-20260730-01',
    result: {
      runKey: 'npc_0123456789abcdef',
      probeCounts: { rollback: [0, 0, 0], commit: [1, 1, 1], restore: [0, 0, 0] },
      cleanupPassed: true,
      snapshotBinding: {
        inputHash: `sha256:${'e'.repeat(64)}`,
        completionHash: `sha256:${'f'.repeat(64)}`,
        snapshotHash: `sha256:${'c'.repeat(64)}`,
        verificationHash: `sha256:${'d'.repeat(64)}`,
      },
      acceptance: acceptanceResult,
    },
    completion: {
      inputHash: `sha256:${'e'.repeat(64)}`,
      completionHash: `sha256:${'f'.repeat(64)}`,
    },
  });

  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.rollbackPassed, true);
  assert.equal(evidence.restorePassed, true);
  assert.equal(evidence.cleanupPassed, true);
  assert.equal(evidence.completionHash, `sha256:${'f'.repeat(64)}`);
  assert.deepEqual(evidence.snapshotBinding, {
    inputHash: `sha256:${'e'.repeat(64)}`,
    completionHash: `sha256:${'f'.repeat(64)}`,
    snapshotHash: `sha256:${'c'.repeat(64)}`,
    verificationHash: `sha256:${'d'.repeat(64)}`,
  });
  assert.throws(() => acceptance.buildNpcCanonicalT1Evidence({
    runId: 'npc-t1-20260730-01',
    result: {
      runKey: 'npc_0123456789abcdef',
      probeCounts: { rollback: [0, 0, 0], commit: [1, 1, 1], restore: [0, 0, 0] },
      cleanupPassed: true,
      snapshotBinding: {
        inputHash: `sha256:${'e'.repeat(64)}`,
        completionHash: `sha256:${'f'.repeat(64)}`,
        snapshotHash: `sha256:${'c'.repeat(64)}`,
        verificationHash: `sha256:${'d'.repeat(64)}`,
      },
      acceptance: { ...acceptanceResult, npcSnapshot: { requiredTableCount: 13, sourceCounts: { 'local.npcs': 1 } } },
    },
    completion: { inputHash: `sha256:${'e'.repeat(64)}`, completionHash: `sha256:${'f'.repeat(64)}` },
  }), /NPC T1 snapshot/i);
  assert.throws(() => acceptance.buildNpcCanonicalT1Evidence({
    runId: 'npc-t1-20260730-01',
    result: {
      runKey: 'npc_0123456789abcdef',
      probeCounts: { rollback: [0, 0, 0], commit: [1, 1, 1], restore: [1, 0, 0] },
      cleanupPassed: true,
      snapshotBinding: {
        inputHash: `sha256:${'e'.repeat(64)}`,
        completionHash: `sha256:${'f'.repeat(64)}`,
        snapshotHash: `sha256:${'c'.repeat(64)}`,
        verificationHash: `sha256:${'d'.repeat(64)}`,
      },
      acceptance: acceptanceResult,
    },
    completion: { inputHash: `sha256:${'e'.repeat(64)}`, completionHash: `sha256:${'f'.repeat(64)}` },
  }), /restore/i);
});
