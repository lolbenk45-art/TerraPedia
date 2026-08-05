import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const baseMaint = await import('./npc-base-maint-apply.mjs').catch(() => ({}));

const INPUT_PATH = 'reports/authorization/canonical/canonical-npc-apply.input.json';
const LANDING_RESULT_PATH = 'reports/authorization/canonical/canonical-npc-landing-apply.result.json';
const STANDARDIZED_PATH = 'data/standardized/npcs.standardized.json';

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function envelope(path, payload) {
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`);
  return { path, payload, bytes };
}

function frozenInput() {
  return envelope(INPUT_PATH, {
    schemaVersion: 1,
    operationId: 'canonical-npc-apply',
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    pairCount: 25,
    evidencePairs: Array.from({ length: 25 }, (_, index) => ({ entityId: `npc-${index + 1}` })),
  });
}

function landingResult(input) {
  return envelope(LANDING_RESULT_PATH, {
    schemaVersion: 1,
    resultKind: 'canonical_npc_owner_operation_result',
    operationId: 'canonical-npc-landing-apply',
    phaseIndex: 0,
    capability: 'landing',
    status: 'COMPLETED',
    input: { path: input.path, contentHash: hashBytes(input.bytes), sizeBytes: input.bytes.length },
    requiredResults: [],
    ownershipKeys: [
      'local.source_dataset_landings.npcs_base',
      'local.source_dataset_landings.npc_crawler_facts',
    ],
    transactionCommitted: true,
    rowCounts: {
      'local.source_dataset_landings.npcs_base': 1,
      'local.source_dataset_landings.npc_crawler_facts': 25,
    },
    outputHash: `sha256:${'a'.repeat(64)}`,
    completedAt: '2026-07-29T12:00:00.000Z',
  });
}

function standardized() {
  return envelope(STANDARDIZED_PATH, {
    schemaVersion: 1,
    entity: 'npcs',
    generatedAt: '2026-07-30T00:00:00.000Z',
    records: [
      {
        id: 1,
        internalName: 'Guide',
        name: 'Guide',
        flags: { friendly: true, boss: false },
        extras: { townNPC: true },
      },
      {
        id: 2,
        internalName: 'BlueSlime',
        name: 'Blue Slime',
        flags: { friendly: false, boss: false },
        extras: { townNPC: false },
      },
    ],
  });
}

function trackedStandardized() {
  const fullPath = path.resolve(import.meta.dirname, '../../..', STANDARDIZED_PATH);
  const bytes = fs.readFileSync(fullPath);
  return { path: STANDARDIZED_PATH, bytes, payload: JSON.parse(bytes) };
}

test('NPC base maint operations own two exact disjoint maint_npcs partitions', () => {
  assert.deepEqual(baseMaint.NPC_BASE_MAINT_OPERATIONS, [
    {
      operationId: 'canonical-npc-base-maint-nontown-apply',
      capability: 'npcs',
      npcKind: 'non_town',
      ownershipKey: 'maint.maint_npcs.npcs',
    },
    {
      operationId: 'canonical-npc-base-maint-town-apply',
      capability: 'town_npc_maintenance',
      npcKind: 'town',
      ownershipKey: 'maint.maint_npcs.town',
    },
  ]);
});

test('NPC base maint plan binds one input, landing result, standardized payload, and exact partition', async () => {
  assert.equal(typeof baseMaint.buildNpcBaseMaintOperationPlan, 'function');
  const input = frozenInput();
  const landing = landingResult(input);
  const source = standardized();

  const nonTown = await baseMaint.buildNpcBaseMaintOperationPlan({
    operationId: 'canonical-npc-base-maint-nontown-apply',
    input,
    landingResult: landing,
    standardized: source,
  });
  const town = await baseMaint.buildNpcBaseMaintOperationPlan({
    operationId: 'canonical-npc-base-maint-town-apply',
    input,
    landingResult: landing,
    standardized: source,
  });

  assert.equal(nonTown.input.contentHash, hashBytes(input.bytes));
  assert.equal(nonTown.landingResult.contentHash, hashBytes(landing.bytes));
  assert.equal(nonTown.standardized.contentHash, hashBytes(source.bytes));
  assert.deepEqual(nonTown.expectedSourceIds, [2]);
  assert.deepEqual(town.expectedSourceIds, [1]);
  assert.equal(nonTown.expectedCount, 1);
  assert.equal(town.expectedCount, 1);
  assert.deepEqual(nonTown.ownershipKeys, ['maint.maint_npcs.npcs']);
  assert.deepEqual(town.ownershipKeys, ['maint.maint_npcs.town']);

  const driftedLanding = landingResult(input);
  driftedLanding.payload.input.contentHash = `sha256:${'b'.repeat(64)}`;
  driftedLanding.bytes = Buffer.from(`${JSON.stringify(driftedLanding.payload)}\n`);
  await assert.rejects(
    () => baseMaint.buildNpcBaseMaintOperationPlan({
      operationId: nonTown.operationId,
      input,
      landingResult: driftedLanding,
      standardized: source,
    }),
    /landing.*input hash/i,
  );
});

test('tracked standardized NPC source remains partitioned as 723 non-town and 39 town rows', async () => {
  const input = frozenInput();
  const landing = landingResult(input);
  const source = trackedStandardized();
  const plans = await Promise.all(baseMaint.NPC_BASE_MAINT_OPERATIONS.map((definition) => (
    baseMaint.buildNpcBaseMaintOperationPlan({
      operationId: definition.operationId,
      input,
      landingResult: landing,
      standardized: source,
    })
  )));

  assert.deepEqual(
    Object.fromEntries(plans.map((plan) => [plan.npcKind, plan.expectedCount])),
    { non_town: 723, town: 39 },
  );
  assert.equal(plans.reduce((total, plan) => total + plan.expectedCount, 0), 762);
});

test('NPC base maint executor commits one partition and rolls back without success evidence', async () => {
  assert.equal(typeof baseMaint.executeNpcBaseMaintOperation, 'function');
  const input = frozenInput();
  const plan = await baseMaint.buildNpcBaseMaintOperationPlan({
    operationId: 'canonical-npc-base-maint-nontown-apply',
    input,
    landingResult: landingResult(input),
    standardized: standardized(),
  });
  const calls = [];
  const result = await baseMaint.executeNpcBaseMaintOperation({
    plan,
    completedAt: '2026-07-30T01:00:00.000Z',
    adapter: {
      begin: async () => calls.push('begin'),
      apply: async () => {
        calls.push('apply');
        return { 'maint.maint_npcs.npcs': 1 };
      },
      verify: async () => {
        calls.push('verify');
        return {
          rowCounts: { 'maint.maint_npcs.npcs': 1 },
          landingLineage: {
            id: 12468,
            sourceKey: 'standardized.npcs',
            contentHash: plan.standardized.landingContentHash,
          },
          outputHash: `sha256:${'c'.repeat(64)}`,
        };
      },
      commit: async () => calls.push('commit'),
      rollback: async () => calls.push('rollback'),
    },
  });

  assert.deepEqual(calls, ['begin', 'apply', 'verify', 'commit']);
  assert.equal(result.resultKind, 'canonical_npc_base_maint_operation_result');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.transactionCommitted, true);
  assert.deepEqual(result.rowCounts, { 'maint.maint_npcs.npcs': 1 });
  assert.equal(result.landingLineage.id, 12468);

  const failedCalls = [];
  await assert.rejects(
    () => baseMaint.executeNpcBaseMaintOperation({
      plan,
      adapter: {
        begin: async () => failedCalls.push('begin'),
        apply: async () => { throw new Error('partition write failed'); },
        verify: async () => { throw new Error('must not verify'); },
        commit: async () => failedCalls.push('commit'),
        rollback: async () => failedCalls.push('rollback'),
      },
    }),
    /partition write failed/i,
  );
  assert.deepEqual(failedCalls, ['begin', 'rollback']);
});

test('NPC base maint executor rolls back when transaction-local readback lineage mismatches', async () => {
  const input = frozenInput();
  const plan = await baseMaint.buildNpcBaseMaintOperationPlan({
    operationId: 'canonical-npc-base-maint-nontown-apply',
    input,
    landingResult: landingResult(input),
    standardized: standardized(),
  });
  const calls = [];

  await assert.rejects(
    () => baseMaint.executeNpcBaseMaintOperation({
      plan,
      adapter: {
        begin: async () => calls.push('begin'),
        apply: async () => {
          calls.push('apply');
          return { 'maint.maint_npcs.npcs': 1 };
        },
        verify: async () => {
          calls.push('verify');
          return {
            rowCounts: { 'maint.maint_npcs.npcs': 1 },
            landingLineage: {
              id: 12468,
              sourceKey: 'retired.npc.bridge',
              contentHash: plan.standardized.landingContentHash,
            },
            outputHash: `sha256:${'c'.repeat(64)}`,
          };
        },
        commit: async () => calls.push('commit'),
        rollback: async () => calls.push('rollback'),
      },
    }),
    /landing lineage/i,
  );
  assert.deepEqual(calls, ['begin', 'apply', 'verify', 'rollback']);
});

test('NPC base maint completion requires both exact partition results for one input and landing', async () => {
  assert.equal(typeof baseMaint.buildCanonicalNpcBaseMaintCompletion, 'function');
  const input = frozenInput();
  const landing = landingResult(input);
  const source = standardized();
  const plans = await Promise.all(baseMaint.NPC_BASE_MAINT_OPERATIONS.map((definition) => (
    baseMaint.buildNpcBaseMaintOperationPlan({
      operationId: definition.operationId,
      input,
      landingResult: landing,
      standardized: source,
    })
  )));
  const resultEnvelopes = plans.map(completedBaseResultEnvelope);

  const completion = baseMaint.buildCanonicalNpcBaseMaintCompletion({
    input,
    landingResult: landing,
    standardized: source,
    results: resultEnvelopes,
    completedAt: '2026-07-30T01:01:00.000Z',
  });

  assert.equal(completion.resultKind, 'canonical_npc_base_maint_completion');
  assert.equal(completion.status, 'COMPLETED');
  assert.deepEqual(completion.partitionCounts, { non_town: 1, town: 1 });
  assert.equal(completion.totalCount, 2);
  assert.equal(completion.operationResults.length, 2);
  assert.match(completion.completionHash, /^sha256:[a-f0-9]{64}$/);

  assert.throws(
    () => baseMaint.buildCanonicalNpcBaseMaintCompletion({
      input,
      landingResult: landing,
      standardized: source,
      results: resultEnvelopes.slice(0, 1),
    }),
    /missing.*canonical-npc-base-maint-town-apply/i,
  );
  const drifted = structuredClone(resultEnvelopes);
  drifted[1].payload.input.contentHash = `sha256:${'e'.repeat(64)}`;
  drifted[1].bytes = Buffer.from(`${JSON.stringify(drifted[1].payload)}\n`);
  assert.throws(
    () => baseMaint.buildCanonicalNpcBaseMaintCompletion({
      input,
      landingResult: landing,
      standardized: source,
      results: drifted,
    }),
    /input hash mismatch/i,
  );
});

test('NPC base maint MySQL adapter updates and verifies only its explicit partition', async () => {
  assert.equal(typeof baseMaint.createCanonicalNpcBaseMaintMysqlAdapter, 'function');
  const input = frozenInput();
  const source = standardized();
  const plan = await baseMaint.buildNpcBaseMaintOperationPlan({
    operationId: 'canonical-npc-base-maint-nontown-apply',
    input,
    landingResult: landingResult(input),
    standardized: source,
  });
  const calls = [];
  const landingRow = {
    id: 12468,
    dataset_type: 'npcs_base_raw',
    provider: 'terrapedia.standardized',
    source_page: 'npcs.standardized',
    source_key: 'standardized.npcs',
    source_revision_timestamp: null,
    content_hash: plan.standardized.landingContentHash,
    payload_json: JSON.stringify(source.payload),
    fetched_at: source.payload.generatedAt,
    parsed_at: source.payload.generatedAt,
  };
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes('source_dataset_landings')) return [[landingRow]];
      if (sql.includes('FROM `terria_v1_maint`.`maint_npcs`')) {
        return [[{
          sourceId: 2,
          internalName: 'BlueSlime',
          landingSourceId: 12468,
          landingSourceKey: 'standardized.npcs',
          landingContentHash: plan.standardized.landingContentHash,
          flagsJson: JSON.stringify({ friendly: false, townNpc: false, boss: false }),
        }]];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      return [{}];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    end: async () => calls.push('end'),
  };

  const result = await baseMaint.executeNpcBaseMaintOperation({
    plan,
    adapter: baseMaint.createCanonicalNpcBaseMaintMysqlAdapter({
      plan,
      connectionFactory: async () => connection,
    }),
    completedAt: '2026-07-30T01:00:00.000Z',
  });

  assert.deepEqual(result.rowCounts, { 'maint.maint_npcs.npcs': 1 });
  assert.deepEqual(result.landingLineage, {
    id: 12468,
    sourceKey: 'standardized.npcs',
    contentHash: plan.standardized.landingContentHash,
  });
  const writes = calls.filter((entry) => entry && typeof entry === 'object');
  const inserts = writes.filter(({ sql }) => /^INSERT INTO/.test(sql.trim()));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].params[0], 2);
  const sql = calls.map((entry) => typeof entry === 'string' ? entry : entry.sql).join('\n');
  assert.match(sql, /JSON_UNQUOTE\(JSON_EXTRACT\(`flags_json`, '\$\.townNpc'\)\).*'false'/s);
  assert.doesNotMatch(sql, /JSON_UNQUOTE\(JSON_EXTRACT\(`flags_json`, '\$\.townNpc'\)\).*'true'/s);
  assert.deepEqual(calls.slice(-2), ['commit', 'end']);
});

test('NPC base maint MySQL adapter uses the explicit town partition predicate', async () => {
  const input = frozenInput();
  const source = standardized();
  const plan = await baseMaint.buildNpcBaseMaintOperationPlan({
    operationId: 'canonical-npc-base-maint-town-apply',
    input,
    landingResult: landingResult(input),
    standardized: source,
  });
  const calls = [];
  const landingRow = {
    id: 12468,
    dataset_type: 'npcs_base_raw',
    provider: 'terrapedia.standardized',
    source_page: 'npcs.standardized',
    source_key: 'standardized.npcs',
    source_revision_timestamp: null,
    content_hash: plan.standardized.landingContentHash,
    payload_json: JSON.stringify(source.payload),
    fetched_at: source.payload.generatedAt,
    parsed_at: source.payload.generatedAt,
  };
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes('source_dataset_landings')) return [[landingRow]];
      if (sql.includes('FROM `terria_v1_maint`.`maint_npcs`')) {
        return [[{
          sourceId: 1,
          internalName: 'Guide',
          landingSourceId: 12468,
          landingSourceKey: 'standardized.npcs',
          landingContentHash: plan.standardized.landingContentHash,
          flagsJson: JSON.stringify({ friendly: true, townNpc: true, boss: false }),
        }]];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      return [{}];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    end: async () => calls.push('end'),
  };

  const result = await baseMaint.executeNpcBaseMaintOperation({
    plan,
    adapter: baseMaint.createCanonicalNpcBaseMaintMysqlAdapter({
      plan,
      connectionFactory: async () => connection,
    }),
  });

  assert.deepEqual(result.rowCounts, { 'maint.maint_npcs.town': 1 });
  const sql = calls.map((entry) => typeof entry === 'string' ? entry : entry.sql).join('\n');
  assert.match(sql, /JSON_UNQUOTE\(JSON_EXTRACT\(`flags_json`, '\$\.townNpc'\)\).*'true'/s);
  assert.doesNotMatch(sql, /JSON_UNQUOTE\(JSON_EXTRACT\(`flags_json`, '\$\.townNpc'\)\).*'false'/s);
  assert.deepEqual(calls.slice(-2), ['commit', 'end']);
});

test('NPC base maint result writer publishes one private atomic artifact', async () => {
  assert.equal(typeof baseMaint.writeCanonicalNpcBaseMaintResult, 'function');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-base-maint-result-'));
  const outputPath = 'reports/authorization/canonical/canonical-npc-base-maint-nontown-apply.result.json';
  try {
    await baseMaint.writeCanonicalNpcBaseMaintResult({
      repoRoot,
      outputPath,
      result: {
        schemaVersion: 1,
        resultKind: 'canonical_npc_base_maint_operation_result',
        operationId: 'canonical-npc-base-maint-nontown-apply',
        status: 'COMPLETED',
        outputHash: `sha256:${'f'.repeat(64)}`,
      },
    });
    const fullPath = path.join(repoRoot, outputPath);
    assert.equal(JSON.parse(fs.readFileSync(fullPath, 'utf8')).status, 'COMPLETED');
    assert.equal(fs.statSync(fullPath).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(path.dirname(fullPath)).filter((name) => name.endsWith('.tmp')), []);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('NPC base maint completion reader reconstructs both private result bytes and rejects drift', async () => {
  assert.equal(typeof baseMaint.readCanonicalNpcBaseMaintCompletion, 'function');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-base-maint-completion-'));
  try {
    const input = frozenInput();
    const landing = landingResult(input);
    const source = standardized();
    const plans = await Promise.all(baseMaint.NPC_BASE_MAINT_OPERATIONS.map((definition) => (
      baseMaint.buildNpcBaseMaintOperationPlan({
        operationId: definition.operationId,
        input,
        landingResult: landing,
        standardized: source,
      })
    )));
    const results = plans.map(completedBaseResultEnvelope);
    const completion = baseMaint.buildCanonicalNpcBaseMaintCompletion({
      input,
      landingResult: landing,
      standardized: source,
      results,
      completedAt: '2026-07-30T01:01:00.000Z',
    });
    for (const artifact of [input, landing, source, ...results]) writeArtifact(repoRoot, artifact);
    await baseMaint.writeCanonicalNpcBaseMaintResult({
      repoRoot,
      outputPath: 'reports/authorization/canonical/canonical-npc-base-maint.completion.json',
      result: completion,
    });

    const context = await baseMaint.readCanonicalNpcBaseMaintCompletion({ repoRoot });
    assert.equal(context.completion.completionHash, completion.completionHash);
    assert.equal(context.completion.totalCount, 2);
    assert.equal(context.inputHash, hashBytes(input.bytes));
    assert.equal(context.landingResultHash, hashBytes(landing.bytes));

    const townPath = path.join(repoRoot, results[1].path);
    const drifted = JSON.parse(fs.readFileSync(townPath, 'utf8'));
    drifted.outputHash = `sha256:${'e'.repeat(64)}`;
    fs.writeFileSync(townPath, `${JSON.stringify(drifted)}\n`, { mode: 0o600 });
    await assert.rejects(
      () => baseMaint.readCanonicalNpcBaseMaintCompletion({ repoRoot }),
      /completion.*(drift|reconstruct)|result.*hash/i,
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

function withoutPayload(value) {
  const { payload, ...summary } = value;
  return summary;
}

function completedBaseResultEnvelope(plan) {
  const marker = plan.npcKind === 'town' ? 'd' : 'c';
  return envelope(`reports/authorization/canonical/${plan.operationId}.result.json`, {
    schemaVersion: 1,
    resultKind: 'canonical_npc_base_maint_operation_result',
    operationId: plan.operationId,
    capability: plan.capability,
    npcKind: plan.npcKind,
    status: 'COMPLETED',
    input: withoutPayload(plan.input),
    landingResult: withoutPayload(plan.landingResult),
    standardized: {
      ...withoutPayload(plan.standardized),
      landingContentHash: plan.standardized.landingContentHash,
    },
    ownershipKeys: [...plan.ownershipKeys],
    transactionCommitted: true,
    rowCounts: { [plan.ownershipKeys[0]]: plan.expectedCount },
    landingLineage: {
      id: 12468,
      sourceKey: 'standardized.npcs',
      contentHash: plan.standardized.landingContentHash,
    },
    outputHash: `sha256:${marker.repeat(64)}`,
    completedAt: '2026-07-30T01:00:00.000Z',
  });
}

function writeArtifact(repoRoot, artifact) {
  const fullPath = path.join(repoRoot, artifact.path);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, artifact.bytes, { mode: 0o600 });
}
