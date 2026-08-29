import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  approveL2PolicyCeilingArtifact,
  assertApprovedL2PolicyCeilingArtifact,
  buildL2PolicyCeilingArtifact,
  readL2PolicyCeilingArtifact,
  writeL2PolicyCeilingArtifact,
} from './l2-policy-ceiling-artifact.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

const CURRENT_ROWS = [
  { domainId: 'items', policyVersion: 1, policyHash: HASH_A },
  { domainId: 'npcs', policyVersion: 1, policyHash: HASH_B },
];

function ceiling() {
  return {
    schemaVersion: 1,
    level: 'L2',
    requireSnapshot: true,
    absoluteInsertCap: 200,
    absoluteUpdateCap: 200,
    absoluteRelationshipDeleteCap: 200,
    absoluteDisableCap: 20,
    ratioInsertCap: 0.1,
    ratioUpdateCap: 0.1,
    ratioRelationshipDeleteCap: 0.05,
    ratioDisableCap: 0.05,
    sourceFreshnessMaxAgeMinutes: 60,
    anomalyAction: 'CIRCUIT_OPEN',
    ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns', logicalPredicateHash: HASH_A }],
  };
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function rehashArtifact(artifact) {
  const { artifactHash, ...payload } = artifact;
  return {
    ...payload,
    artifactHash: `sha256:${createHash('sha256').update(canonicalJson(payload)).digest('hex')}`,
  };
}

test('builds a deterministic candidate L2 ceiling bound to the current policy set', () => {
  const artifact = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: CURRENT_ROWS,
    targetPolicyVersion: 2,
    ceiling: ceiling(),
    generatedAt: '2026-08-26T05:00:00.000Z',
  });
  assert.equal(artifact.status, 'candidate');
  assert.equal(artifact.proposalOnly, true);
  assert.equal(artifact.targetPolicy.level, 'L2');
  assert.equal(artifact.targetPolicy.policyHash, computePolicyHash(artifact.targetPolicy.policyJson));
  assert.equal(artifact.targetPolicySetHash, computePolicySetHash([
    { domainId: 'items', policyVersion: 2, policyHash: artifact.targetPolicy.policyHash },
    CURRENT_ROWS[1],
  ]));
  assert.match(artifact.artifactHash, /^sha256:[a-f0-9]{64}$/);
});

test('preserves independent insert, update, relationship-delete, and soft-disable caps', () => {
  const artifact = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: CURRENT_ROWS,
    targetPolicyVersion: 2,
    ceiling: ceiling(),
    generatedAt: '2026-08-26T05:00:00.000Z',
  });
  assert.deepEqual(artifact.targetPolicy.policyJson, ceiling());

  for (const field of [
    'ratioInsertCap', 'ratioUpdateCap', 'ratioRelationshipDeleteCap', 'ratioDisableCap',
    'absoluteInsertCap', 'absoluteUpdateCap', 'absoluteRelationshipDeleteCap', 'absoluteDisableCap',
  ]) {
    const missing = { ...ceiling() };
    delete missing[field];
    assert.throws(() => buildL2PolicyCeilingArtifact({
      domainId: 'items',
      currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
      currentPolicyRows: CURRENT_ROWS,
      targetPolicyVersion: 2,
      ceiling: missing,
      generatedAt: '2026-08-26T05:00:00.000Z',
    }), new RegExp(field));
  }
});

test('requires explicit Owner approval and rejects policy or ceiling drift', () => {
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: CURRENT_ROWS,
    targetPolicyVersion: 2,
    ceiling: ceiling(),
    generatedAt: '2026-08-26T05:00:00.000Z',
  });
  const approved = approveL2PolicyCeilingArtifact({
    artifact: candidate,
    actor: 'system-owner',
    approvalReference: 'owner://l2/items/20260826-01',
    approvedAt: '2026-08-26T05:10:00.000Z',
  });
  assert.equal(approved.status, 'approved');
  assert.equal(assertApprovedL2PolicyCeilingArtifact(approved), true);
  assert.throws(() => assertApprovedL2PolicyCeilingArtifact({ ...approved, targetPolicySetHash: HASH_B }), /artifact hash|policy set/i);
  assert.throws(() => approveL2PolicyCeilingArtifact({ artifact: candidate, actor: '', approvalReference: 'x' }), /actor/i);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-artifact-'));
  const written = writeL2PolicyCeilingArtifact({ repoRoot, artifact: approved });
  assert.equal(readL2PolicyCeilingArtifact({ repoRoot, artifactPath: written.path }).artifactHash, approved.artifactHash);
  assert.throws(() => writeL2PolicyCeilingArtifact({ repoRoot, artifact: approved }), /overwrite|exists/i);
});

test('approved readback rejects semantic artifact identity drift even when the payload is rehashed', () => {
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: CURRENT_ROWS,
    targetPolicyVersion: 2,
    ceiling: ceiling(),
    generatedAt: '2026-08-26T05:00:00.000Z',
  });
  const approved = approveL2PolicyCeilingArtifact({
    artifact: candidate,
    actor: 'system-owner',
    approvalReference: 'owner://l2/items/semantic-drift',
    approvedAt: '2026-08-26T05:10:00.000Z',
  });
  assert.throws(
    () => assertApprovedL2PolicyCeilingArtifact(rehashArtifact({ ...approved, artifactKind: 'not-a-policy-ceiling' })),
    /approved.*artifact|artifact.*kind|invalid/i,
  );
  assert.throws(
    () => assertApprovedL2PolicyCeilingArtifact(rehashArtifact({ ...approved, currentPolicySetHash: HASH_B })),
    /policy set|identity|drift/i,
  );
});

test('rejects L2 ceilings that widen ownership beyond the domain contract', () => {
  assert.throws(() => buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: CURRENT_ROWS,
    targetPolicyVersion: 2,
    ceiling: { ...ceiling(), ownedTables: [{ databaseRole: 'local', table: 'npcs' }] },
  }), /owned table|scope/i);
});

test('requires approved artifacts before deriving an output path and binds the path hash to the artifact bytes', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-artifact-path-'));
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: CURRENT_ROWS,
    targetPolicyVersion: 2,
    ceiling: ceiling(),
    generatedAt: '2026-08-26T05:00:00.000Z',
  });
  assert.throws(() => writeL2PolicyCeilingArtifact({ repoRoot, artifact: candidate }), /approved/i);

  const approved = approveL2PolicyCeilingArtifact({
    artifact: candidate,
    actor: 'system-owner',
    approvalReference: 'owner://l2/items/path-test',
    approvedAt: '2026-08-26T05:10:00.000Z',
  });
  const wrongPath = path.join(
    repoRoot,
    'reports/authorization/canonical/l2-policy-ceiling/items',
    'a'.repeat(64),
    'artifact.json',
  );
  fs.mkdirSync(path.dirname(wrongPath), { recursive: true });
  fs.writeFileSync(wrongPath, `${JSON.stringify(approved, null, 2)}\n`, { mode: 0o600 });
  assert.throws(
    () => readL2PolicyCeilingArtifact({ repoRoot, artifactPath: 'reports/authorization/canonical/l2-policy-ceiling/items/' + `${'a'.repeat(64)}/artifact.json` }),
    /hash|path|content-addressed/i,
  );
});

test('readback rejects an approved policy artifact whose file is not private', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-policy-artifact-permissions-'));
  const candidate = buildL2PolicyCeilingArtifact({
    domainId: 'items',
    currentPolicy: { domainId: 'items', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: CURRENT_ROWS,
    targetPolicyVersion: 2,
    ceiling: ceiling(),
    generatedAt: '2026-08-26T05:00:00.000Z',
  });
  const approved = approveL2PolicyCeilingArtifact({
    artifact: candidate,
    actor: 'system-owner',
    approvalReference: 'owner://l2/items/permissions',
    approvedAt: '2026-08-26T05:10:00.000Z',
  });
  const written = writeL2PolicyCeilingArtifact({ repoRoot, artifact: approved });
  fs.chmodSync(path.join(repoRoot, written.path), 0o644);
  assert.throws(
    () => readL2PolicyCeilingArtifact({ repoRoot, artifactPath: written.path }),
    /private/i,
  );
});

test('builds ceilings for every multi-table governed domain using canonical scope ordering', () => {
  const domains = {
    armor_sets: [
      { databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' },
    ],
    buffs: [
      { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
    ],
    audio: [
      { databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'audio_asset_links', fieldGroup: 'all_columns' },
    ],
    shimmer: [
      { databaseRole: 'local', table: 'shimmer_item_transforms', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'shimmer_decraft_rules', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'shimmer_entity_transforms', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'shimmer_npc_transforms', fieldGroup: 'all_columns' },
    ],
  };
  for (const [domainId, ownedTables] of Object.entries(domains)) {
    const rows = [{ domainId, policyVersion: 1, policyHash: HASH_A }];
    assert.doesNotThrow(() => buildL2PolicyCeilingArtifact({
      domainId,
      currentPolicy: { domainId, policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
      currentPolicyRows: rows,
      targetPolicyVersion: 2,
      ceiling: { ...ceiling(), ownedTables },
      generatedAt: '2026-08-26T05:00:00.000Z',
    }), domainId);
  }
});

test('requires a predicate only for the shared NPC table, not unrelated boss tables', () => {
  const rows = [{ domainId: 'bosses', policyVersion: 1, policyHash: HASH_A }];
  const ownedTables = [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    {
      databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned',
      logicalPredicateHash: HASH_B,
    },
  ];
  assert.doesNotThrow(() => buildL2PolicyCeilingArtifact({
    domainId: 'bosses',
    currentPolicy: { domainId: 'bosses', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: rows,
    targetPolicyVersion: 2,
    ceiling: { ...ceiling(), ownedTables },
    generatedAt: '2026-08-26T05:00:00.000Z',
  }));
  assert.throws(() => buildL2PolicyCeilingArtifact({
    domainId: 'bosses',
    currentPolicy: { domainId: 'bosses', policyVersion: 1, policyHash: HASH_A, level: 'L1', operationalState: 'ACTIVE' },
    currentPolicyRows: rows,
    targetPolicyVersion: 2,
    ceiling: { ...ceiling(), ownedTables: [
      { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
      { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned' },
    ] },
    generatedAt: '2026-08-26T05:00:00.000Z',
  }), /logical predicate hash/i);
});
