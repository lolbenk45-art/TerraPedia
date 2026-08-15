import { assertReadOnlySourceSnapshot } from '../automation/automation-test-profile.mjs';
import {
  EXPECTED_NPC_T0_SCHEMA_EVIDENCE,
  validateNpcCanonicalT1Snapshot,
} from './npc-canonical-t1-contract.mjs';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function assertIsolatedDatabases(databases) {
  const roles = Object.keys(databases ?? {}).sort();
  if (roles.join(',') !== 'local,maint,relation') {
    throw new Error('NPC T1 acceptance requires exactly three isolated databases');
  }
  for (const [role, database] of Object.entries(databases)) {
    if (!/^terria_v1_automation_acceptance_[a-z0-9_]+$/.test(database)) {
      throw new Error(`NPC T1 ${role} database is not isolated`);
    }
  }
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(String(value ?? ''))) throw new Error(`${label} must be a SHA-256 hash`);
  return value;
}

function indexSnapshotTables(tables, label) {
  if (!Array.isArray(tables)) throw new Error(`${label} tables are missing`);
  return new Map(tables.map((entry) => [`${entry?.role}.${entry?.table}`, entry]));
}

function readNpcSnapshotEvidence({ sourceSnapshot, snapshotVerification }) {
  const sourceTables = indexSnapshotTables(sourceSnapshot.tables, 'NPC T1 source snapshot');
  const verifiedTables = indexSnapshotTables(snapshotVerification.tables, 'NPC T1 snapshot verification');
  const sourceCounts = {};
  for (const [role, table] of EXPECTED_NPC_T0_SCHEMA_EVIDENCE) {
    const key = `${role}.${table}`;
    const source = sourceTables.get(key);
    const verified = verifiedTables.get(key);
    if (source?.sourceAvailable !== true || !Number.isSafeInteger(source?.sourceCount) || source.sourceCount <= 0) {
      throw new Error(`NPC T1 source snapshot table is missing or empty: ${key}`);
    }
    if (!verified || verified.sourceCount !== source.sourceCount) {
      throw new Error(`NPC T1 snapshot verification is missing or mismatched: ${key}`);
    }
    sourceCounts[key] = source.sourceCount;
  }
  return validateNpcCanonicalT1Snapshot({
    requiredTableCount: EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length,
    sourceCounts,
  });
}

export { validateNpcCanonicalT1Snapshot };

export function buildNpcCanonicalT1SnapshotBinding({
  completion,
  sourceSnapshot,
  snapshotVerification,
} = {}) {
  return {
    inputHash: requireHash(completion?.inputHash, 'NPC T1 completion input hash'),
    completionHash: requireHash(completion?.completionHash, 'NPC T1 completion hash'),
    snapshotHash: requireHash(sourceSnapshot?.snapshotHash, 'NPC T1 snapshot hash'),
    verificationHash: requireHash(snapshotVerification?.verificationHash, 'NPC T1 snapshot verification hash'),
  };
}

export function validateNpcCanonicalT1SnapshotBinding({
  snapshotBinding,
  completion,
  sourceSnapshot,
  snapshotVerification,
} = {}) {
  const expected = buildNpcCanonicalT1SnapshotBinding({ completion, sourceSnapshot, snapshotVerification });
  const keys = Object.keys(snapshotBinding ?? {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(expected).sort())
      || keys.some((key) => snapshotBinding[key] !== expected[key])) {
    throw new Error('NPC T1 completion and copied-snapshot binding is invalid');
  }
  return expected;
}

export async function runNpcCanonicalT1Acceptance({
  profile,
  databases,
  manifest,
  snapshotVerification,
  completion,
  snapshotBinding,
} = {}) {
  if (profile !== 't1') throw new Error('NPC T1 acceptance requires the T1 profile');
  assertIsolatedDatabases(databases);
  const sourceSnapshot = manifest?.sourceSnapshot;
  assertReadOnlySourceSnapshot(sourceSnapshot);
  if (snapshotVerification?.verified !== true) {
    throw new Error('NPC T1 snapshot verification must be completed before acceptance');
  }
  const verificationHash = requireHash(snapshotVerification.verificationHash, 'NPC T1 snapshot verification hash');
  const npcSnapshot = readNpcSnapshotEvidence({ sourceSnapshot, snapshotVerification });
  const binding = validateNpcCanonicalT1SnapshotBinding({
    snapshotBinding,
    completion,
    sourceSnapshot,
    snapshotVerification,
  });
  return {
    profile,
    status: 'passed',
    snapshot: {
      snapshotId: sourceSnapshot.snapshotId,
      snapshotHash: sourceSnapshot.snapshotHash,
      verificationHash,
    },
    snapshotBinding: binding,
    npcSnapshot,
  };
}

function hasExactCounts(value, expected) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((count, index) => count === expected[index]);
}

export function buildNpcCanonicalT1Evidence({
  runId,
  result,
  completion,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!String(runId ?? '').trim()) throw new Error('NPC T1 runId is required');
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(result?.runKey ?? '')) {
    throw new Error('NPC T1 runKey is invalid');
  }
  const acceptance = result?.acceptance;
  if (acceptance?.profile !== 't1' || acceptance?.status !== 'passed') {
    throw new Error('NPC T1 acceptance result is incomplete');
  }
  requireHash(acceptance.snapshot?.snapshotHash, 'NPC T1 snapshot hash');
  requireHash(acceptance.snapshot?.verificationHash, 'NPC T1 snapshot verification hash');
  validateNpcCanonicalT1Snapshot(acceptance.npcSnapshot);
  const snapshotBinding = validateNpcCanonicalT1SnapshotBinding({
    snapshotBinding: result?.snapshotBinding,
    completion,
    sourceSnapshot: acceptance.snapshot,
    snapshotVerification: acceptance.snapshot,
  });
  if (JSON.stringify(acceptance.snapshotBinding) !== JSON.stringify(snapshotBinding)) {
    throw new Error('NPC T1 acceptance snapshot binding is invalid');
  }
  if (!hasExactCounts(result?.probeCounts?.rollback, [0, 0, 0])) {
    throw new Error('NPC T1 rollback proof is invalid');
  }
  if (!hasExactCounts(result?.probeCounts?.commit, [1, 1, 1])) {
    throw new Error('NPC T1 commit proof is invalid');
  }
  if (!hasExactCounts(result?.probeCounts?.restore, [0, 0, 0])) {
    throw new Error('NPC T1 restore proof is invalid');
  }
  if (result?.cleanupPassed !== true) throw new Error('NPC T1 cleanup proof is invalid');
  return {
    schemaVersion: 1,
    evidenceKind: 'canonical_npc_isolated_t1_acceptance',
    status: 'passed',
    generatedAt,
    runId,
    runKey: result.runKey,
    profile: 't1',
    inputHash: completion.inputHash,
    completionHash: completion.completionHash,
    snapshot: acceptance.snapshot,
    snapshotBinding,
    npcSnapshot: acceptance.npcSnapshot,
    probeCounts: result.probeCounts,
    rollbackPassed: true,
    restorePassed: true,
    cleanupPassed: true,
  };
}
