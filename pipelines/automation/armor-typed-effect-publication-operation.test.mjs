import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import {
  assertCanonicalOperationExecutionManifestContract,
  buildCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';
import {
  buildCanonicalAuthorizationRequestForOperation,
  resolveCanonicalOperationTechnicalInput,
} from './build-canonical-cutover-authorization.mjs';
import {
  ARMOR_TYPED_EFFECT_REQUIRED_GATES,
  buildArmorTypedEffectOwnerDecision,
} from '../relation/armor-typed-effect-owner-decision.mjs';
import { buildArmorSourceEffectOwnerDecision } from '../relation/armor-source-effect-owner-decision.mjs';
import {
  ARMOR_TYPED_EFFECT_RECOVERY_STATUSES,
  buildArmorTypedEffectRecoveryOwnerEvidence,
} from '../relation/armor-typed-effect-recovery-owner.mjs';

const operationId = 'canonical-armor-typed-effect-publication';
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
};
const hashJson = value => `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;

test('typed effect publication has a governed candidate-only operation manifest', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');

  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(
    CANONICAL_OPERATION_ENTRYPOINTS[operationId],
    'pipelines/relation/run-armor-typed-effect-publication.mjs',
  );
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], [
    'reports/authorization/canonical/canonical-armor-typed-effect-publication.input.json',
  ]);

  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    resultLabel: 'candidate-01',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/relation/run-armor-typed-effect-publication.mjs',
    `--operation-id=${operationId}`,
    '--result-label=candidate-01',
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-armor-typed-effect-publication.candidate-01.proposal.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'reports/authorization/canonical/canonical-armor-typed-effect-publication.candidate-01.prepared.json',
    'reports/authorization/canonical/canonical-armor-typed-effect-publication.candidate-01.result.json',
  ]);
  assert.deepEqual(manifest.ownershipKeys, [
    'relation.relation_equipment_effect_attributes.item_effect_sources',
  ]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.equal(manifest.typedEffectPublication.proposalPath, manifest.inputPaths[0]);
  assert.equal(
    manifest.typedEffectPublication.ownerDecisionPath,
    'reports/authorization/canonical/canonical-armor-typed-effect-publication.candidate-01.owner-decision.json',
  );
  assert.equal(
    manifest.typedEffectPublication.reconciliationPath,
    'reports/authorization/canonical/canonical-armor-typed-effect-publication.candidate-01.reconciliation.json',
  );
  assert.deepEqual(manifest.typedEffectPublication.recoveryCommand, [
    'node',
    'pipelines/relation/run-armor-typed-effect-publication.mjs',
    `--operation-id=${operationId}`,
    '--result-label=candidate-01',
    '--reconcile=true',
  ]);
  assert.deepEqual(manifest.typedEffectPublication.recoveryInputPaths, [
    manifest.typedEffectPublication.proposalPath,
    manifest.typedEffectPublication.preparedPath,
  ]);
  assert.deepEqual(manifest.typedEffectPublication.recoveryOutputPaths, [
    manifest.typedEffectPublication.reconciliationPath,
  ]);
  assert.equal(manifest.typedEffectPublication.recoveryOwnerGateId, 'recovery-owner');
  assert.equal(manifest.typedEffectPublication.recoveryDatabaseWrites, false);
  assert.equal(manifest.typedEffectPublication.recoveryPermitReplayAllowed, false);
  assert.deepEqual(manifest.typedEffectPublication.requiredGateIds, [...ARMOR_TYPED_EFFECT_REQUIRED_GATES]);
  assert.equal(manifest.typedEffectPublication.readinessReason, 'owner-decision-required');
  assert.ok(manifest.codeBundleEntries.some((entry) => (
    entry.path === 'pipelines/relation/armor-typed-effect-publication-db.mjs'
  )));
  assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest });

  const forged = structuredClone(manifest);
  forged.ownershipKeys.push('relation.relation_equipment_effect_attributes.generic_rows');
  assert.throws(
    () => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest: forged }),
    /contract|drift|ownership|manifest/i,
  );
});

test('typed effect publication runner fails closed while source and owner gates are open', () => {
  const entrypoint = path.resolve(
    import.meta.dirname,
    '../relation/run-armor-typed-effect-publication.mjs',
  );
  const result = spawnSync(process.execPath, [
    entrypoint,
    '--operation-id=canonical-armor-typed-effect-publication',
    '--result-label=candidate-01',
    '--apply=true',
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /authorized[_ ]packet|blocked|owner|source gate/i);
});

test('a readiness flag alone cannot authorize the unfinished production operation', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    resultLabel: 'disabled-fixture',
    armorTypedEffectExecutionReady: true,
  });
  assert.equal(manifest.typedEffectPublication.executionReady, true);
  assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
    repoRoot,
    operationId,
    executionManifest: manifest,
    generatedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-10-02T00:00:00.000Z',
  }), /proposal|private|owner decision|JSON|input/i);
});

test('typed effect authorization rejects a proposal with the wrong candidate identity', () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-authorization-'));
  try {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot: sourceRoot,
      operationId,
      resultLabel: 'candidate-01',
    });
    for (const entry of manifest.codeBundleEntries) {
      const target = path.join(repoRoot, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, entry.path), target);
    }
    const proposalPath = path.join(repoRoot, manifest.inputPaths[0]);
    fs.mkdirSync(path.dirname(proposalPath), { recursive: true });
    fs.writeFileSync(proposalPath, `${JSON.stringify({
      schemaVersion: 'foreign/v1',
      operationId: 'foreign-operation',
      databaseWrites: true,
      applyAllowed: true,
    })}\n`, { mode: 0o600 });
    fs.chmodSync(proposalPath, 0o600);

    assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId,
      executionManifest: manifest,
      generatedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-10-02T00:00:00.000Z',
    }), /typed-effect publication proposal|schema|operation|no-write/i);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('typed effect authorization stays blocked even for a valid no-write candidate', () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-gate-'));
  try {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot: sourceRoot,
      operationId,
      resultLabel: 'candidate-02',
    });
    assert.equal(manifest.typedEffectPublication.executionReady, false);
    for (const entry of manifest.codeBundleEntries) {
      const target = path.join(repoRoot, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, entry.path), target);
    }
    const body = {
      schemaVersion: 'armor-typed-effect-publication/v1',
      operationId,
      ownership: ['relation.relation_equipment_effect_attributes.item_effect_sources'],
      databaseWrites: false,
      applyAllowed: false,
      sourceFingerprint: {
        pageRevisionId: 1,
        iteminfoRevisionId: 2,
        armorSetsRevisionId: 3,
      },
      currentRelationRows: [],
      proposedRows: [],
      preservedGenericRecordKeys: [],
      changes: { inserts: [], updates: [], retire: [], unchanged: [] },
    };
    const proposalPath = path.join(repoRoot, manifest.inputPaths[0]);
    fs.mkdirSync(path.dirname(proposalPath), { recursive: true });
    fs.writeFileSync(proposalPath, `${JSON.stringify({ ...body, proposalSha256: hashJson(body) })}\n`, { mode: 0o600 });
    fs.chmodSync(proposalPath, 0o600);

    assert.throws(() => buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId,
      executionManifest: manifest,
      generatedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-10-02T00:00:00.000Z',
    }), /execution-ready|blocked|gate/i);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('pre-apply owner authorization binds source and ownership evidence without post-apply readbacks', () => {
  const sourceRoot = path.resolve(import.meta.dirname, '../..');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-owner-decision-'));
  try {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot: sourceRoot,
      operationId,
      resultLabel: 'candidate-03',
      armorTypedEffectExecutionReady: true,
    });
    for (const entry of manifest.codeBundleEntries) {
      const target = path.join(repoRoot, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, entry.path), target);
    }
    const proposal = {
      schemaVersion: 'armor-typed-effect-publication/v1',
      operationId,
      ownership: ['relation.relation_equipment_effect_attributes.item_effect_sources'],
      databaseWrites: false,
      applyAllowed: false,
      sourceFingerprint: {
        pageRevisionId: 1027106,
        iteminfoRevisionId: 1023241,
        armorSetsRevisionId: 964993,
      },
      currentRelationRows: [],
      proposedRows: [{
        record_key: 'a'.repeat(64),
        owner_kind: 'item',
        owner_record_key: 'b'.repeat(64),
        owner_id: 1,
        owner_key: 'MiningHelmet',
        source_kind: 'armor_item_page',
        item_internal_name: 'MiningHelmet',
        stat_key: 'defense',
        operation: 'add',
        value_decimal: 1,
        unit: 'points',
        condition_text: 'always',
        source_maint_table: 'maint_armor_attribute_rows',
        source_maint_record_key: 'c'.repeat(64),
        source_maint_id: 1,
        landing_source_id: 1,
        landing_source_key: 'landing-1',
        landing_content_hash: 'd'.repeat(64),
        source_provider: 'wiki.gg',
        source_page: 'Mining Helmet',
        source_revision_timestamp: '2026-10-01T00:00:00.000Z',
        review_status: 'accepted',
        status: 1,
        deleted: 0,
      }],
      preservedGenericRecordKeys: [],
      changes: { inserts: [], updates: [], retire: [], unchanged: [] },
    };
    proposal.proposalSha256 = hashJson({ ...proposal });
    const proposalPath = path.join(repoRoot, manifest.inputPaths[0]);
    fs.mkdirSync(path.dirname(proposalPath), { recursive: true });
    fs.writeFileSync(proposalPath, `${JSON.stringify(proposal)}\n`, { mode: 0o600 });
    const classificationBody = {
      schemaVersion: 'armor-effect-parse-unresolved-classification/v1',
      executable: false, databaseWrites: false, applyAllowed: false,
      sourceEvidenceHash: hashJson({ evidence: 'fixture' }),
      summary: { totalOccurrences: 1, uniqueLines: 1, byCategory: {
        'behavior-trigger': 0, 'compound-numeric': 1, 'non-effect-label': 0,
        'numeric-simple': 0, 'unknown-prose': 0, 'visual-behavior': 0,
      } },
      entries: [{ textKey: 'ArmorSetBonus.Fixture', sourceLineIndex: 0,
        line: '+1 伤害', category: 'compound-numeric', occurrences: 1,
        owners: [1], sourcePage: 'Fixture armor' }],
    };
    const classification = { ...classificationBody, classificationSha256: hashJson(classificationBody) };
    const sourceEffectEvidence = buildArmorSourceEffectOwnerDecision({
      proposalSha256: proposal.proposalSha256,
      sourceFingerprint: proposal.sourceFingerprint,
      sourceEvidenceHash: classification.sourceEvidenceHash,
      classification,
      actor: 'owner-reviewer', authorizationReference: 'manual-review-20261001-06',
      decisionIdentity: 'armor-typed-effect-review-20261001-06',
      reviewedAt: '2026-10-01T10:00:00.000Z',
      rationale: 'Fixture source-effect owner is independently reviewed.',
      partialPolicy: {
        unresolvedSourceEffects: 'quarantine',
        allowPartialApply: true,
        unresolvedRowsMustRemainUntouched: true,
      },
      assignments: [{ textKey: 'ArmorSetBonus.Fixture', sourceLineIndex: 0,
        ownerKind: 'unresolved', ownerIds: [1], semanticStatus: 'unresolved',
        decisionStatus: 'quarantined', rationale: 'unresolved fixture remains untouched' }],
    });
    const recoveryEvidence = buildArmorTypedEffectRecoveryOwnerEvidence({
      ownerIdentity: 'recovery-owner-fixture',
      ownerRole: 'typed-effect-publication-recovery',
      decisionIdentity: 'armor-typed-effect-review-20261001-06',
      proposalSha256: proposal.proposalSha256,
      sourceFingerprint: proposal.sourceFingerprint,
      reconciliationPath: manifest.typedEffectPublication.reconciliationPath,
      allowedStatuses: [...ARMOR_TYPED_EFFECT_RECOVERY_STATUSES],
      reviewedAt: '2026-10-01T10:00:00.000Z',
      rationale: 'Read-only recovery owner is explicitly bound to this attempt.',
    });
    const decision = buildArmorTypedEffectOwnerDecision({
      proposalSha256: proposal.proposalSha256,
      sourceFingerprint: proposal.sourceFingerprint,
      actor: 'owner-reviewer',
      authorizationReference: 'manual-review-20261001-06',
      decisionIdentity: 'armor-typed-effect-review-20261001-06',
      reviewedAt: '2026-10-01T10:00:00.000Z',
      rationale: 'All gates are resolved in this isolated contract fixture.',
      gateDecisions: Object.fromEntries(ARMOR_TYPED_EFFECT_REQUIRED_GATES.map((gateId) => [gateId, {
        status: 'resolved',
        evidencePath: `reports/audits/${gateId}.json`,
        evidenceSha256: hashJson(gateId === 'recovery-owner' ? recoveryEvidence
          : gateId === 'typed-set-effect-owner' ? sourceEffectEvidence : { gateId }),
        note: 'independently verified',
      }])),
    });
    const evidenceFiles = [
      ...ARMOR_TYPED_EFFECT_REQUIRED_GATES.map((gateId) => [
        `reports/audits/${gateId}.json`,
        gateId === 'recovery-owner' ? recoveryEvidence
          : gateId === 'typed-set-effect-owner' ? sourceEffectEvidence : { gateId },
      ]),
    ];
    for (const [relativePath, body] of evidenceFiles) {
      const evidencePath = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, JSON.stringify(stable(body)), { mode: 0o600 });
    }
    const decisionPath = path.join(repoRoot, manifest.typedEffectPublication.ownerDecisionPath);
    fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
    fs.writeFileSync(decisionPath, `${JSON.stringify(decision)}\n`, { mode: 0o600 });

    const readyManifest = buildCanonicalOperationExecutionManifest({
      repoRoot: sourceRoot,
      operationId,
      resultLabel: 'candidate-03',
      armorTypedEffectExecutionReady: true,
    });
    const technical = resolveCanonicalOperationTechnicalInput({
      repoRoot,
      operationId,
      executionManifest: readyManifest,
    });
    assert.equal(technical.dataEntries.length, 2);
    assert.equal(technical.dataEntries[1].path, manifest.typedEffectPublication.ownerDecisionPath);
    fs.writeFileSync(path.join(repoRoot, 'reports/audits/complete-armor-coverage.json'),
      JSON.stringify({ gateId: 'tampered-coverage' }), { mode: 0o600 });
    assert.throws(() => resolveCanonicalOperationTechnicalInput({
      repoRoot,
      operationId,
      executionManifest: readyManifest,
    }), /evidence hash drifted|owner decision/i);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
