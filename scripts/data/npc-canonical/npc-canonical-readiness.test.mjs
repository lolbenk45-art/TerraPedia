import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { NPC_APPLY_OWNER_PHASES } from './npc-apply-ownership-preparation.mjs';
import { buildCanonicalNpcApplyCompletion } from './npc-owner-phase-apply.mjs';
import { EXPECTED_NPC_T0_SCHEMA_EVIDENCE } from './npc-canonical-t0-acceptance.mjs';
import { buildNpcT2CutoverResult } from './npc-canonical-t2-cutover.mjs';
import {
  NPC_CANONICAL_READINESS_SCHEMA_VERSION,
  buildNpcCanonicalReadinessReport,
  buildNpcCanonicalReadinessSnapshot,
  readNpcBridgeRetirementEvidence,
  readNpcCanonicalReadinessRows,
  writeNpcCanonicalReadinessReport,
  validateNpcCanonicalReadinessReport,
} from './npc-canonical-readiness.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

test('bridge retirement reader preserves its validated pass status for T2', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-bridge-retirement-'));
  try {
    writeJson(repoRoot, 'reports/canonical-migration/npc-bridge-retirement.json', {
      status: 'pass',
      writesDatabase: false,
      requiresDatabase: false,
      retiredPath: 'data/generated/wiki-crawler-npc-bridge',
      scannedFileCount: 10,
      allowedReferenceCount: 0,
      referenceCount: 0,
    });

    const evidence = readNpcBridgeRetirementEvidence(repoRoot);

    assert.equal(evidence.status, 'pass');
    assert.equal(evidence.referenceCount, 0);
    assert.match(evidence.snapshotHash, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

function validOwnerPhaseCompletion() {
  return {
    status: 'COMPLETED',
    operationId: 'canonical-npc-apply',
    inputHash: HASH,
    landingResultHash: HASH,
    phaseResultHashes: Array.from({ length: 7 }, () => HASH),
  };
}

function attachBaseMaintCompletion(evidence, ownerCompletion) {
  evidence.maint.base = { count: 2, currentCount: 2, localCount: 2, snapshotHash: HASH };
  evidence.maint.baseCompletion = validBaseCompletionContext(ownerCompletion).completion;
}

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
      base: { count: 1, currentCount: 1, localCount: 1, snapshotHash: HASH },
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
    ['bridge-backed maint base', (value) => { value.maint.base.currentCount = 0; }],
    ['maint/local base count drift', (value) => { value.maint.base.localCount = 2; }],
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

  evidence.t1Evidence.ownerPhaseCompletion = validOwnerPhaseCompletion();
  attachBaseMaintCompletion(evidence, evidence.t1Evidence.ownerPhaseCompletion);
  report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.readinessLevel, 'T1_VERIFIED');
  assert.equal(report.summary.status, 'pass');

  evidence.maint.baseCompletion.inputHash = `sha256:${'b'.repeat(64)}`;
  report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.summary.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /base maint completion.*input/i.test(reason)));
});

test('NPC T2 requires exact cutover run decision and technical hashes', () => {
  const evidence = validFixtureEvidence();
  evidence.evidenceScope = 'formal-t2';
  evidence.databaseRole = 't2-readonly';
  evidence.cutoverIdentity = {
    state: 'T2_CUTOVER_VERIFIED',
    operationId: 'canonical-npc-t2-cutover-verification',
  };

  let report = buildNpcCanonicalReadinessReport({ evidence });
  assert.equal(report.summary.status, 'blocked');
  assert.ok(report.blockingReasons.some((reason) => /cutover runId/i.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /packet hash/i.test(reason)));

  Object.assign(evidence.cutoverIdentity, {
    runId: 'canonical-npc-t2-001',
    decisionIdentity: 'canonical-npc-decision-001',
    packetHash: HASH,
    inputHash: HASH,
    ownerCompletionHash: HASH,
    baseCompletionHash: HASH,
    databaseSnapshotHash: HASH,
    apiEvidenceHash: HASH,
    executionManifestHash: HASH,
    dataBundleSha256: HASH,
    serverFingerprint: HASH,
    ownerPhaseCompletion: validOwnerPhaseCompletion(),
  });
  attachBaseMaintCompletion(evidence, evidence.cutoverIdentity.ownerPhaseCompletion);
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

test('NPC readiness writer revalidates all owner-phase bytes and atomically writes a private fail-closed T1 report', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-readiness-'));
  try {
    const completion = writeCompletionFixture(repoRoot);
    writeJson(repoRoot, 'reports/canonical-migration/npc-bridge-retirement.json', {
      status: 'pass',
      referenceCount: 0,
      scannedFileCount: 1,
      allowedReferenceCount: 0,
    });

    const report = await writeNpcCanonicalReadinessReport({
      repoRoot,
      generatedAt: '2026-07-29T12:00:00.000Z',
      loadBaseCompletion: async () => validBaseCompletionContext(completion.ownerCompletion),
      loadSnapshot: async () => validReadOnlySnapshot(),
      probeApi: async () => ({
        admin: { sampleCount: 0, snapshotHash: null, error: 'admin API is unavailable' },
        public: { sampleCount: 0, snapshotHash: null, error: 'public API is unavailable' },
      }),
    });

    const outputPath = path.join(repoRoot, 'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json');
    assert.equal(report.evidenceScope, 't1-real-crawler');
    assert.equal(report.readinessLevel, 'T1_VERIFIED');
    assert.equal(report.writesDatabase, false);
    assert.equal(report.maint.baseCompletion.inputHash, completion.inputHash);
    assert.equal(report.maint.baseCompletion.landingResultHash, completion.ownerCompletion.landingResultHash);
    assert.equal(report.summary.status, 'blocked');
    assert.ok(report.blockingReasons.some((reason) => /rollback/i.test(reason)));
    assert.ok(report.blockingReasons.some((reason) => /admin API/i.test(reason)));
    assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).summary.status, 'blocked');
    assert.equal(fs.statSync(outputPath).mode & 0o077, 0);
    assert.deepEqual(fs.readdirSync(path.dirname(outputPath)).filter((name) => name.endsWith('.tmp')), []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('NPC readiness rejects base maint identity drift before reading the formal snapshot', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-readiness-base-drift-'));
  try {
    const completion = writeCompletionFixture(repoRoot);
    let snapshotRead = false;
    const baseCompletion = validBaseCompletionContext(completion.ownerCompletion);
    baseCompletion.inputHash = `sha256:${'b'.repeat(64)}`;

    const report = await writeNpcCanonicalReadinessReport({
      repoRoot,
      loadBaseCompletion: async () => baseCompletion,
      loadSnapshot: async () => {
        snapshotRead = true;
        return validReadOnlySnapshot();
      },
      probeApi: async () => ({
        admin: { sampleCount: 0, snapshotHash: null, error: 'not reached' },
        public: { sampleCount: 0, snapshotHash: null, error: 'not reached' },
      }),
    });

    assert.equal(snapshotRead, false);
    assert.equal(report.summary.status, 'blocked');
    assert.ok(report.blockingReasons.some((reason) => /base maint completion.*input/i.test(reason)));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('NPC readiness requires a reconstructed base maint completion before reading the formal snapshot', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-readiness-base-completion-'));
  try {
    writeCompletionFixture(repoRoot);
    writeJson(repoRoot, 'reports/canonical-migration/npc-bridge-retirement.json', {
      status: 'pass', writesDatabase: false, requiresDatabase: false,
      referenceCount: 0, scannedFileCount: 1, allowedReferenceCount: 0,
    });
    let snapshotRead = false;
    const report = await writeNpcCanonicalReadinessReport({
      repoRoot,
      loadBaseCompletion: async () => {
        throw new Error('base maint completion is missing');
      },
      loadSnapshot: async () => {
        snapshotRead = true;
        return validReadOnlySnapshot();
      },
      probeApi: async () => ({
        admin: { sampleCount: 0, snapshotHash: null, error: 'not reached' },
        public: { sampleCount: 0, snapshotHash: null, error: 'not reached' },
      }),
    });

    assert.equal(snapshotRead, false);
    assert.equal(report.summary.status, 'blocked');
    assert.ok(report.blockingReasons.some((reason) => /base maint completion/i.test(reason)));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('NPC readiness writer accepts only matching private isolated T1 evidence', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-readiness-t1-'));
  try {
    const completion = writeCompletionFixture(repoRoot);
    writeJson(repoRoot, 'reports/canonical-migration/npc-bridge-retirement.json', {
      status: 'pass', writesDatabase: false, requiresDatabase: false,
      referenceCount: 0, scannedFileCount: 1, allowedReferenceCount: 0,
    });
    writeJson(repoRoot, 'reports/canonical-migration/canonical-npc-t1-acceptance.json', {
      schemaVersion: 1,
      evidenceKind: 'canonical_npc_isolated_t1_acceptance',
      status: 'passed',
      runId: 'npc-t1-20260730-01',
      runKey: 'npc_0123456789abcdef',
      profile: 't1',
      inputHash: completion.inputHash,
      completionHash: completion.completionHash,
      snapshot: {
        snapshotId: 'npc-t1-snapshot',
        snapshotHash: HASH,
        verificationHash: HASH,
      },
      snapshotBinding: {
        inputHash: completion.inputHash,
        completionHash: completion.completionHash,
        snapshotHash: HASH,
        verificationHash: HASH,
      },
      npcSnapshot: {
        requiredTableCount: EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length,
        sourceCounts: Object.fromEntries(EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map(([role, table]) => [`${role}.${table}`, 1])),
      },
      probeCounts: { rollback: [0, 0, 0], commit: [1, 1, 1], restore: [0, 0, 0] },
      rollbackPassed: true,
      restorePassed: true,
      cleanupPassed: true,
    });

    const report = await writeNpcCanonicalReadinessReport({
      repoRoot,
      loadBaseCompletion: async () => validBaseCompletionContext(completion.ownerCompletion),
      loadSnapshot: async () => validReadOnlySnapshot(),
      probeApi: async () => ({
        admin: { sampleCount: 1, snapshotHash: HASH, error: null },
        public: { sampleCount: 1, snapshotHash: HASH, error: null },
      }),
    });

    assert.equal(report.t1Evidence.rollbackPassed, true);
    assert.equal(report.t1Evidence.restorePassed, true);
    assert.equal(report.t1Evidence.cleanupPassed, true);
    assert.equal(report.summary.status, 'pass', report.blockingReasons.join('\n'));

    const evidencePath = path.join(repoRoot, 'reports/canonical-migration/canonical-npc-t1-acceptance.json');
    const missingNpcSnapshot = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    delete missingNpcSnapshot.npcSnapshot;
    writeJson(repoRoot, 'reports/canonical-migration/canonical-npc-t1-acceptance.json', missingNpcSnapshot);
    const blocked = await writeNpcCanonicalReadinessReport({
      repoRoot,
      loadBaseCompletion: async () => validBaseCompletionContext(completion.ownerCompletion),
      loadSnapshot: async () => validReadOnlySnapshot(),
      probeApi: async () => ({
        admin: { sampleCount: 1, snapshotHash: HASH, error: null },
        public: { sampleCount: 1, snapshotHash: HASH, error: null },
      }),
    });
    assert.equal(blocked.t1Evidence.rollbackPassed, false);
    assert.equal(blocked.summary.status, 'blocked');

    const missingSnapshotBinding = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    missingSnapshotBinding.npcSnapshot = {
      requiredTableCount: EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length,
      sourceCounts: Object.fromEntries(EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map(([role, table]) => [`${role}.${table}`, 1])),
    };
    delete missingSnapshotBinding.snapshotBinding;
    writeJson(repoRoot, 'reports/canonical-migration/canonical-npc-t1-acceptance.json', missingSnapshotBinding);
    const bindingBlocked = await writeNpcCanonicalReadinessReport({
      repoRoot,
      loadBaseCompletion: async () => validBaseCompletionContext(completion.ownerCompletion),
      loadSnapshot: async () => validReadOnlySnapshot(),
      probeApi: async () => ({
        admin: { sampleCount: 1, snapshotHash: HASH, error: null },
        public: { sampleCount: 1, snapshotHash: HASH, error: null },
      }),
    });
    assert.equal(bindingBlocked.t1Evidence.rollbackPassed, false);
    assert.equal(bindingBlocked.summary.status, 'blocked');
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('NPC readiness writer publishes formal T2 only from matching terminal evidence', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-readiness-t2-'));
  try {
    const completion = writeCompletionFixture(repoRoot);
    const baseCompletion = validBaseCompletionContext(completion.ownerCompletion);
    const snapshot = validReadOnlySnapshot();
    const api = {
      admin: { sampleCount: 1, snapshotHash: HASH, error: null },
      public: { sampleCount: 1, snapshotHash: HASH, error: null },
    };
    const bridgeRetirement = { status: 'pass', referenceCount: 0, snapshotHash: HASH };
    const t1Evidence = {
      rollbackPassed: true,
      restorePassed: true,
      cleanupPassed: true,
      ownerPhaseCompletion: completion.ownerCompletion,
    };
    const cutoverResult = buildNpcT2CutoverResult({
      authorizationContext: {
        operationId: 'canonical-npc-t2-cutover-verification',
        decisionIdentity: 'canonical-npc-t2-cutover-verification-20260806-admin-01',
        packetHash: HASH,
        executionManifestHash: HASH,
        dataBundleSha256: HASH,
        serverFingerprint: HASH,
        executionManifest: { noWrite: true },
      },
      ownerCompletionContext: {
        completion: completion.ownerCompletion,
        completionHash: completion.completionHash,
        inputHash: completion.inputHash,
      },
      baseCompletionContext: baseCompletion,
      t1Evidence,
      snapshot,
      api,
      bridgeRetirement,
      verifiedAt: '2026-08-06T01:00:00.000Z',
    });

    const report = await writeNpcCanonicalReadinessReport({
      repoRoot,
      generatedAt: '2026-08-06T01:00:01.000Z',
      cutoverResult,
      loadBaseCompletion: async () => baseCompletion,
      loadSnapshot: async () => snapshot,
      probeApi: async () => api,
      loadT1Evidence: async () => t1Evidence,
      loadBridgeRetirement: () => bridgeRetirement,
    });

    assert.equal(report.evidenceScope, 'formal-t2');
    assert.equal(report.readinessLevel, 'T2_CUTOVER_VERIFIED');
    assert.equal(report.databaseRole, 't2-readonly');
    assert.equal(report.cutoverIdentity.packetHash, HASH);
    assert.equal(report.summary.status, 'pass', report.blockingReasons.join('\n'));

    const drifted = structuredClone(cutoverResult);
    drifted.databaseSnapshotHash = `sha256:${'b'.repeat(64)}`;
    await assert.rejects(
      () => writeNpcCanonicalReadinessReport({
        repoRoot,
        outputPath: 'reports/canonical-migration/drifted-t2.json',
        cutoverResult: drifted,
        loadBaseCompletion: async () => baseCompletion,
        loadSnapshot: async () => snapshot,
        probeApi: async () => api,
        loadT1Evidence: async () => t1Evidence,
        loadBridgeRetirement: () => bridgeRetirement,
      }),
      /T2.*(hash|snapshot|result)/i,
    );
    assert.equal(fs.existsSync(path.join(repoRoot, 'reports/canonical-migration/drifted-t2.json')), false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('NPC readiness writer rejects a completion artifact whose bytes no longer reconstruct', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-readiness-drift-'));
  try {
    writeCompletionFixture(repoRoot, { tamperCompletion: true });
    await assert.rejects(
      () => writeNpcCanonicalReadinessReport({
        repoRoot,
        loadSnapshot: async () => validReadOnlySnapshot(),
      }),
      /completion.*(drift|mismatch|reconstruct)/i,
    );
    assert.equal(
      fs.existsSync(path.join(repoRoot, 'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json')),
      false,
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('read-only NPC snapshot binds its runtime sample to the exact local projection snapshot', () => {
  const snapshot = buildNpcCanonicalReadinessSnapshot({
    inputHash: HASH,
    input: {
      evidencePairs: [{ normalizedContentHash: 'a'.repeat(64), auditContentHash: 'b'.repeat(64) }],
    },
    rows: {
      landing: [
        {
          id: 10,
          datasetType: 'npcs_base_raw',
          sourceKey: 'standardized.npcs',
          contentHash: 'c'.repeat(64),
          producerRunKey: `canonical-npc-landing:${HASH}`,
          artifactRole: 'source_evidence',
        },
        { datasetType: 'npc_crawler_facts_raw', producerRunKey: `canonical-npc-landing:${HASH}`, artifactRole: 'source_evidence' },
      ],
      maintBase: [{
        sourceId: 1,
        internalName: 'Guide',
        landingSourceId: 10,
        landingSourceKey: 'standardized.npcs',
        landingContentHash: 'c'.repeat(64),
      }],
      localBaseCount: [{ count: 1 }],
      maint: [{ recordKey: 'maint-1', normalizedContentHash: 'a'.repeat(64), crawlerAuditHash: 'b'.repeat(64), matchStatus: 'MATCHED' }],
      relationBuff: [{ recordKey: 'buff-1' }],
      relationShop: [{ recordKey: 'shop-1' }],
      relationLoot: [{ recordKey: 'loot-1' }],
      localBuff: [{ id: 1, npcId: 1, buffId: 1 }],
      localShop: [{ id: 2, npcId: 1, itemId: 2 }],
      localLoot: [{ id: 3, npcId: 1, itemId: 3 }],
      runtime: [{ id: 1, internalName: 'Guide' }],
    },
  });

  assert.equal(snapshot.runtime.sampleCount, 1);
  assert.equal(snapshot.runtime.snapshotHash, snapshot.local.snapshotHash);
  assert.deepEqual(snapshot.maint.base, {
    count: 1,
    currentCount: 1,
    localCount: 1,
    snapshotHash: snapshot.maint.base.snapshotHash,
  });
  assert.equal(snapshot.relation.npcBuff.count, 1);
  assert.equal(snapshot.relation.npcShop.count, 1);
  assert.equal(snapshot.relation.npcLoot.count, 1);
});

test('read-only NPC snapshot selects its runtime sample from a local NPC projection lane', async () => {
  const queries = [];
  await readNpcCanonicalReadinessRows({
    query: async (sql) => {
      queries.push(sql);
      return [[]];
    },
  });

  const runtimeQuery = queries.find((sql) => sql.includes('FROM `terria_v1_local`.`npcs`'));
  assert.match(runtimeQuery, /npc_buff_relations/);
  assert.match(runtimeQuery, /npc_shop_entries/);
  assert.match(runtimeQuery, /npc_loot_entries/);

  const maintBaseQuery = queries.find((sql) => sql.includes('FROM `terria_v1_maint`.`maint_npcs`'));
  assert.match(maintBaseQuery, /landing_source_id AS landingSourceId/);
  assert.match(maintBaseQuery, /landing_source_key AS landingSourceKey/);
  assert.match(maintBaseQuery, /landing_content_hash AS landingContentHash/);
});

function validReadOnlySnapshot() {
  return {
    landing: {
      base: { fresh: true, currentCount: 1, snapshotHash: HASH },
      crawlerFacts: { fresh: true, currentCount: 25, normalizedCount: 25, auditCount: 25, snapshotHash: HASH },
    },
    maint: {
      base: { count: 2, currentCount: 2, localCount: 2, snapshotHash: HASH },
      factCount: 25,
      matchCounts: { MATCHED: 25, UNMATCHED: 0, AMBIGUOUS: 0, REJECTED: 0 },
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
  };
}

function writeCompletionFixture(repoRoot, { tamperCompletion = false } = {}) {
  const inputPath = 'reports/authorization/canonical/canonical-npc-apply.input.json';
  const inputPayload = {
    schemaVersion: 1,
    operationId: 'canonical-npc-apply',
    pairCount: 25,
    evidencePairs: Array.from({ length: 25 }, (_, index) => ({
      entityId: `Npc${index}`,
      normalizedContentHash: 'a'.repeat(64),
      auditContentHash: 'b'.repeat(64),
    })),
  };
  const inputBytes = Buffer.from(`${JSON.stringify(inputPayload)}\n`);
  const inputHash = sha256(inputBytes);
  writeBytes(repoRoot, inputPath, inputBytes);

  const definitions = [
    {
      phaseIndex: 0,
      operationId: 'canonical-npc-landing-apply',
      capability: 'landing',
      ownershipKeys: [
        'local.source_dataset_landings.npcs_base',
        'local.source_dataset_landings.npc_crawler_facts',
      ],
      requiredOperationIds: [],
    },
    ...NPC_APPLY_OWNER_PHASES,
  ];
  const envelopes = [];
  for (const definition of definitions) {
    const requiredResults = definition.requiredOperationIds.map((operationId) => {
      const predecessor = envelopes.find((entry) => entry.payload.operationId === operationId);
      return {
        operationId,
        path: predecessor.path,
        contentHash: sha256(predecessor.bytes),
        sizeBytes: predecessor.bytes.length,
      };
    });
    const payload = {
      schemaVersion: 1,
      resultKind: 'canonical_npc_owner_operation_result',
      operationId: definition.operationId,
      phaseIndex: definition.phaseIndex,
      capability: definition.capability,
      status: 'COMPLETED',
      input: { path: inputPath, contentHash: inputHash, sizeBytes: inputBytes.length },
      requiredResults,
      ownershipKeys: [...definition.ownershipKeys],
      transactionCommitted: true,
      rowCounts: Object.fromEntries(definition.ownershipKeys.map((key, index) => [key, index])),
      outputHash: HASH,
      completedAt: '2026-07-29T11:59:00.000Z',
    };
    const relativePath = `reports/authorization/canonical/${definition.operationId}.result.json`;
    const bytes = Buffer.from(`${JSON.stringify(payload)}\n`);
    writeBytes(repoRoot, relativePath, bytes);
    envelopes.push({ path: relativePath, bytes, payload });
  }
  const completion = buildCanonicalNpcApplyCompletion({
    input: { path: inputPath, bytes: inputBytes, payload: inputPayload },
    results: envelopes,
    completedAt: '2026-07-29T12:00:00.000Z',
  });
  if (tamperCompletion) completion.completionHash = HASH;
  const completionPath = 'reports/authorization/canonical/canonical-npc-apply.completion.json';
  const completionBytes = Buffer.from(`${JSON.stringify(completion, null, 2)}\n`);
  writeBytes(repoRoot, completionPath, completionBytes);
  return { inputHash, completionHash: sha256(completionBytes), ownerCompletion: completion };
}

function validBaseCompletionContext(ownerCompletion) {
  const completion = {
    schemaVersion: 1,
    resultKind: 'canonical_npc_base_maint_completion',
    operationId: 'canonical-npc-base-maint-completion',
    status: 'COMPLETED',
    inputHash: ownerCompletion.inputHash,
    landingResultHash: ownerCompletion.landingResultHash,
    standardizedHash: HASH,
    landingLineage: {
      id: 10,
      sourceKey: 'standardized.npcs',
      contentHash: HASH,
    },
    partitionCounts: { non_town: 1, town: 1 },
    totalCount: 2,
    operationResults: [
      {
        operationId: 'canonical-npc-base-maint-nontown-apply',
        path: 'reports/authorization/canonical/canonical-npc-base-maint-nontown-apply.result.json',
        contentHash: HASH,
        sizeBytes: 1,
      },
      {
        operationId: 'canonical-npc-base-maint-town-apply',
        path: 'reports/authorization/canonical/canonical-npc-base-maint-town-apply.result.json',
        contentHash: HASH,
        sizeBytes: 1,
      },
    ],
    completedAt: '2026-07-30T01:01:00.000Z',
    completionHash: HASH,
  };
  return {
    completion,
    completionHash: HASH,
    inputHash: ownerCompletion.inputHash,
    landingResultHash: ownerCompletion.landingResultHash,
    standardizedHash: HASH,
  };
}

function writeJson(repoRoot, relativePath, value) {
  writeBytes(repoRoot, relativePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

function writeBytes(repoRoot, relativePath, bytes) {
  const outputPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes, { mode: 0o600 });
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}
