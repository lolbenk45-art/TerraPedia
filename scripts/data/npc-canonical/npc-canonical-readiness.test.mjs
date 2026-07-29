import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NPC_CANONICAL_READINESS_SCHEMA_VERSION,
  buildNpcCanonicalReadinessReport,
  validateNpcCanonicalReadinessReport,
} from './npc-canonical-readiness.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function validFixtureEvidence() {
  return {
    evidenceScope: 'fixture',
    writesDatabase: false,
    databaseRole: 't0-fixture',
    landing: {
      base: { fresh: true, currentCount: 1, snapshotHash: HASH },
      crawlerFacts: {
        fresh: true,
        currentCount: 1,
        normalizedCount: 1,
        auditCount: 1,
        snapshotHash: HASH,
      },
    },
    maint: {
      factCount: 4,
      matchCounts: { MATCHED: 1, UNMATCHED: 1, AMBIGUOUS: 1, REJECTED: 1 },
      snapshotHash: HASH,
    },
    relation: {
      npcBuff: { count: 1, snapshotHash: HASH },
      npcShop: { count: 1, snapshotHash: HASH },
      npcLoot: { count: 1, snapshotHash: HASH },
      snapshotHash: HASH,
    },
    local: {
      npcBuff: { count: 1, snapshotHash: HASH },
      npcShop: { count: 1, snapshotHash: HASH },
      npcLoot: { count: 1, snapshotHash: HASH },
      snapshotHash: HASH,
    },
    runtime: { sampleCount: 1, snapshotHash: HASH },
    api: {
      admin: { sampleCount: 1, snapshotHash: HASH },
      public: { sampleCount: 1, snapshotHash: HASH },
    },
    bridgeRetirement: { referenceCount: 0, snapshotHash: HASH },
  };
}

test('NPC canonical readiness emits fixture evidence only as CODE_READY', () => {
  const evidence = validFixtureEvidence();
  evidence.readinessLevel = 'T1_VERIFIED';
  const report = buildNpcCanonicalReadinessReport({
    evidence,
    generatedAt: '2026-07-27T15:00:00.000Z',
  });

  assert.equal(NPC_CANONICAL_READINESS_SCHEMA_VERSION, 1);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.reportKind, 'canonical_npc_crawler_facts_readiness');
  assert.equal(report.readinessLevel, 'CODE_READY');
  assert.equal(report.evidenceScope, 'fixture');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.blockingCount, 0);
  assert.equal(validateNpcCanonicalReadinessReport(report).valid, true);
});

test('NPC canonical readiness blocks stale, empty, unmatched, or hash-drifted fixture evidence', () => {
  const mutations = [
    ['stale base landing', (value) => { value.landing.base.fresh = false; }],
    ['stale crawler landing', (value) => { value.landing.crawlerFacts.fresh = false; }],
    ['unpaired crawler audit', (value) => { value.landing.crawlerFacts.auditCount = 0; }],
    ['no matched fact', (value) => { value.maint.matchCounts.MATCHED = 0; }],
    ['four-state count mismatch', (value) => { value.maint.factCount = 5; }],
    ['empty buff relation', (value) => { value.relation.npcBuff.count = 0; }],
    ['empty shop relation', (value) => { value.relation.npcShop.count = 0; }],
    ['empty loot relation', (value) => { value.relation.npcLoot.count = 0; }],
    ['empty buff local', (value) => { value.local.npcBuff.count = 0; }],
    ['empty shop local', (value) => { value.local.npcShop.count = 0; }],
    ['empty loot local', (value) => { value.local.npcLoot.count = 0; }],
    ['invalid relation hash', (value) => { value.relation.snapshotHash = 'unknown'; }],
    ['runtime hash drift', (value) => { value.runtime.snapshotHash = `sha256:${'b'.repeat(64)}`; }],
    ['admin API hash drift', (value) => { value.api.admin.snapshotHash = `sha256:${'b'.repeat(64)}`; }],
    ['public API empty', (value) => { value.api.public.sampleCount = 0; }],
    ['bridge consumer returned', (value) => { value.bridgeRetirement.referenceCount = 1; }],
    ['database writer', (value) => { value.writesDatabase = true; }],
  ];

  for (const [name, mutate] of mutations) {
    const evidence = validFixtureEvidence();
    mutate(evidence);
    const report = buildNpcCanonicalReadinessReport({ evidence });
    assert.equal(report.summary.status, 'blocked', name);
    assert.equal(validateNpcCanonicalReadinessReport(report).valid, false, name);
  }
});

test('NPC fixture readiness cannot claim T1 without real crawler provenance', () => {
  const evidence = validFixtureEvidence();
  evidence.evidenceScope = 't1-real-crawler';
  evidence.databaseRole = 't1-readonly';

  const report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.readinessLevel, 'T1_VERIFIED');
  assert.equal(report.summary.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /real crawler run identity/i.test(reason)));
});

test('NPC T1 requires rollback restore and zero-leak cleanup evidence', () => {
  const evidence = validFixtureEvidence();
  evidence.evidenceScope = 't1-real-crawler';
  evidence.databaseRole = 't1-readonly';
  evidence.crawlerRunIdentity = {
    runId: 'npc-crawler-run-001',
    normalizedArtifactHash: HASH,
    auditArtifactHash: HASH,
  };

  let report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.summary.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /rollback/i.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /cleanup/i.test(reason)));

  evidence.t1Evidence = { rollbackPassed: true, restorePassed: true, cleanupPassed: true };
  report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.summary.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /owner.phase completion/i.test(reason)));

  evidence.t1Evidence.ownerPhaseCompletion = {
    status: 'COMPLETED',
    operationId: 'canonical-npc-apply',
    inputHash: HASH,
    landingResultHash: HASH,
    phaseResultHashes: Array.from({ length: 7 }, () => HASH),
  };
  report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.readinessLevel, 'T1_VERIFIED');
  assert.equal(report.summary.status, 'pass');
});

test('NPC T2 requires exact cutover run decision and technical hashes', () => {
  const evidence = validFixtureEvidence();
  evidence.evidenceScope = 'formal-t2';
  evidence.databaseRole = 't2-readonly';
  evidence.cutoverIdentity = {
    state: 'T2_CUTOVER_VERIFIED',
    operationId: 'canonical-npc-apply',
  };

  let report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.summary.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /cutover runId/i.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /policy set hash/i.test(reason)));

  Object.assign(evidence.cutoverIdentity, {
    runId: 'canonical-npc-t2-001',
    decisionIdentity: 'canonical-npc-decision-001',
    schemaBundleSha256: HASH,
    dataBundleSha256: HASH,
    serverFingerprint: HASH,
    policySetHash: HASH,
    ownerPhaseCompletion: {
      status: 'COMPLETED',
      operationId: 'canonical-npc-apply',
      inputHash: HASH,
      landingResultHash: HASH,
      phaseResultHashes: Array.from({ length: 7 }, () => HASH),
    },
  });
  report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.readinessLevel, 'T2_CUTOVER_VERIFIED');
  assert.equal(report.summary.status, 'pass');
  assert.equal(validateNpcCanonicalReadinessReport(report, {
    requiredLevel: 'T2_CUTOVER_VERIFIED',
  }).valid, true);
});

test('canonical acceptance requires T2 evidence even when fixture CODE_READY passes', () => {
  const report = buildNpcCanonicalReadinessReport({ evidence: validFixtureEvidence() });
  const validation = validateNpcCanonicalReadinessReport(report, {
    requiredLevel: 'T2_CUTOVER_VERIFIED',
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.blockingReasons.some((reason) => /T2_CUTOVER_VERIFIED/));
});
