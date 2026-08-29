import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
  NPC_EXTERNAL_RELATION_SCOPE_BINDING,
  NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH,
  NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH,
  NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH,
  buildNpcExternalRelationScopeRows,
  buildNpcExternalRelationScopeLocalRows,
  buildNpcExternalRelationScopePlan,
  createNpcExternalRelationScopeMysqlWriter,
  createNpcExternalRelationScopeWriter,
  executeNpcExternalRelationScope,
  validateNpcExternalRelationScope,
} from './npc-external-relation-scope-operation.mjs';
import {
  buildCanonicalOperationExecutionManifest,
} from '../automation/canonical-operation-execution-manifest.mjs';
import { hashCanonicalServerFingerprint } from '../automation/automation-database-contract.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const bundlePath = NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH;
const previewPath = NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH;
const projectionPath = NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH;

const serverFingerprint = {
  host: '127.0.0.1',
  port: 13306,
  serverUuid: 'local-test-server',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
};

function authorizationContext(candidateCount) {
  return {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    actor: 'operator',
    reason: 'authorized exact scope',
    authorizationReference: 'scope authorization',
    decisionIdentity: 'npc-external-relation-scope-20260818-01',
    serverFingerprint,
    executionManifest: {
      ownershipKeys: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
      npcExternalRelationScope: {
        scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
        bundleSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256,
        previewSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.previewSha256,
        projectionSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.projectionSha256,
        unresolvedCandidateCount: candidateCount,
        quarantinedFactCount: NPC_EXTERNAL_RELATION_SCOPE_BINDING.quarantinedFactCount,
      },
    },
  };
}

function acceptedProjectionIndexes() {
  const projection = JSON.parse(fs.readFileSync(path.resolve(repoRoot, projectionPath), 'utf8'));
  const itemIndex = new Map();
  const npcIndex = new Map();
  const detailsByFact = new Map(projection.accepted.sourceDetails.map((row) => [row.sourceFactKey, row]));
  const add = (index, key, value) => {
    if (!key || !value?.internal_name) return;
    const existing = index.get(key) ?? [];
    if (!existing.some((candidate) => candidate.internal_name === value.internal_name)) {
      existing.push(value);
    }
    index.set(key, existing);
    index.set(String(key).toLowerCase(), existing);
  };
  for (const fact of projection.accepted.sourceFacts) {
    add(itemIndex, fact.itemName, {
      id: 1,
      source_id: 1,
      internal_name: fact.itemInternalName,
      name: fact.itemName,
    });
    const detail = detailsByFact.get(fact.recordKey);
    add(npcIndex, fact.sourceRefName, {
      id: 1,
      source_id: 1,
      internal_name: detail?.sourceRefInternalName,
      name: fact.sourceRefName,
    });
    add(npcIndex, detail?.sourceRefInternalName, {
      id: 1,
      source_id: 1,
      internal_name: detail?.sourceRefInternalName,
      name: fact.sourceRefName,
    });
  }
  return { itemIndex, npcIndex };
}

function fixtureBundle(overrides = {}) {
  return {
    schemaVersion: 1,
    source: 'wiki-crawler:npc',
    records: [{
      recordKey: 'npc-item:test:loot:test-item:1',
      relationType: 'loot',
      npcInternalName: 'TestNpc',
      itemName: 'Test Item',
      sourceRefInternalName: 'TestNpc',
      sourceUrl: 'https://terraria.wiki.gg/wiki/TestNpc',
    }],
    backfillCandidates: [],
    ...overrides,
  };
}

function fixturePreview(overrides = {}) {
  return {
    schemaVersion: 1,
    reportKind: 'external_npc_relation_owner_scope_preview',
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    applyAllowed: false,
    summary: { recordCount: 1, lootRecords: 1, shopRecords: 0, candidateCount: 0, candidates: {} },
    writeTargets: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
    forbidden: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.forbidden],
    ownerFence: { required: true, mode: 'exact_request_preview_readback', status: 'missing_authorization' },
    conflictResolution: { bridgeConflictSamples: [], status: 'resolved_read_only' },
    ...overrides,
  };
}

test('scope validator accepts the exact shape and preserves unresolved candidates as a no-write blocker', () => {
  const bundle = fixtureBundle({
    backfillCandidates: Array.from({ length: 2 }, (_, index) => ({
      candidateKey: `${index}`.repeat(64),
      domain: index === 0 ? 'npc_item_relation' : 'npc_projectile_relation',
      status: 'open',
      recommendedAction: 'crawl_npc_page',
    })),
  });
  const preview = fixturePreview({
    summary: { recordCount: 1, lootRecords: 1, shopRecords: 0, candidateCount: 2, candidates: {
      npc_item_relation: 1,
      npc_projectile_relation: 1,
    } },
  });

  const result = validateNpcExternalRelationScope({ bundle, preview, serverFingerprint });

  assert.equal(result.operationId, NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID);
  assert.equal(result.applyAllowed, false);
  assert.equal(result.writePlan.length, 1);
  assert.equal(result.unresolvedCandidates.length, 2);
  assert.match(result.blockers[0], /unresolved candidates/i);
});

test('scope validator rejects records that target a forbidden domain or table', () => {
  const bundle = fixtureBundle({ records: [{
    recordKey: 'npc-item:test:loot:test-item:1',
    relationType: 'boss_loot',
    npcInternalName: 'TestNpc',
    itemName: 'CenxsWings',
  }] });
  const preview = fixturePreview({ writeTargets: ['relation.item_npc_loot_relations', 'local.npc_loot_entries'] });

  assert.throws(
    () => validateNpcExternalRelationScope({ bundle, preview, serverFingerprint }),
    /forbidden|write target|boss_loot|CenxsWings/i,
  );
});

test('dry-run plan binds repository bytes and exact report scope', () => {
  const plan = buildNpcExternalRelationScopePlan({ repoRoot, serverFingerprint });

  assert.equal(plan.operationId, NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID);
  assert.equal(plan.bundle.path, bundlePath);
  assert.equal(plan.preview.path, previewPath);
  assert.equal(plan.projection.path, projectionPath);
  assert.equal(plan.bundle.sha256, 'sha256:febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05');
  assert.equal(plan.preview.sha256, 'sha256:090652680bb566c6ff670dfe2807fc7378e2d0daa286416304638232316a363d');
  assert.equal(plan.scopeSha256, 'sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39');
  assert.equal(plan.unresolvedCandidates.length, 357);
  assert.equal(plan.quarantinedFactCount, 198);
  assert.equal(plan.applyAllowed, false);
  assert.equal(plan.databaseWrites, false);
});

test('execution manifest freezes the exact scope binding and has no network access', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    artifactDate: '2026-08-18',
  });

  assert.deepEqual(manifest.npcExternalRelationScope, {
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    bundleSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256,
    previewSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.previewSha256,
    unresolvedCandidateCount: 357,
    quarantinedFactCount: 198,
    projectionSha256: 'sha256:2e499d5b089a83f9654828a69113c1994a71d52a026cf6ea377b094be0dec6a4',
  });
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.ok(manifest.command.includes(`--bundle=${bundlePath}`));
  assert.ok(manifest.command.includes(`--preview=${previewPath}`));
  assert.ok(manifest.command.includes(`--projection=${projectionPath}`));
});

test('accepted projection rejects scope, count, and hash drift', () => {
  const projection = JSON.parse(fs.readFileSync(path.resolve(repoRoot, projectionPath), 'utf8'));
  assert.throws(
    () => validateNpcExternalRelationScope({
      bundle: fixtureBundle(),
      preview: fixturePreview(),
      projection: { ...projection, scopeSha256: 'sha256:drift' },
      serverFingerprint,
    }),
    /projection contract|scope hash|scope.*drifted/i,
  );
  assert.throws(
    () => validateNpcExternalRelationScope({
      bundle: fixtureBundle(),
      preview: fixturePreview(),
      projection: {
        ...projection,
        accepted: {
          ...projection.accepted,
          lootRelations: projection.accepted.lootRelations.slice(1),
        },
      },
      serverFingerprint,
    }),
    /accepted projection lootRelations count drifted/i,
  );
  const temporaryProjection = path.join(repoRoot, '.local', 'tmp', `npc-external-relation-projection-${process.pid}.json`);
  fs.writeFileSync(temporaryProjection, JSON.stringify(projection));
  try {
    assert.throws(
      () => buildNpcExternalRelationScopePlan({ repoRoot, serverFingerprint, projectionPath: path.relative(repoRoot, temporaryProjection) }),
      /accepted\/quarantine projection hash drifted/i,
    );
  } finally {
    fs.rmSync(temporaryProjection, { force: true });
  }
});

test('accepted bundle replay uses the relation processor for 655/408, not raw 663/408 counts', () => {
  const plan = buildNpcExternalRelationScopePlan({ repoRoot, serverFingerprint });
  const { itemIndex, npcIndex } = acceptedProjectionIndexes();
  assert.equal(plan.records.filter((record) => record.relationType === 'loot').length, 663);
  assert.equal(plan.records.filter((record) => record.relationType === 'shop').length, 408);
  const rows = buildNpcExternalRelationScopeRows({
    plan,
    landing: {
      id: 17,
      sourceKey: 'generated.npc_item_relations_bundle',
      contentHash: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256.slice('sha256:'.length),
      sourcePage: 'npc-item-relations.bundle',
      fetchedAt: '2026-08-19 00:00:00',
      parsedAt: '2026-08-19 00:00:00',
    },
    itemIndex,
    npcIndex,
  });
  assert.equal(rows.maintItemSources.length, 1071);
  assert.equal(rows.relation.itemSourceFacts.length, 1071);
  assert.equal(rows.relation.itemSourceDetails.length, 1071);
  assert.equal(rows.relation.npcLootRelations.length, 655);
  assert.equal(rows.relation.npcShopRelations.length, 408);
  assert.equal(rows.quarantine.facts.length, 198);
});

test('row builder uses only accepted records and requires local item and NPC identities', () => {
  const plan = {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    writePlan: [{
      recordKey: 'npc-item:test:loot:test-item:1',
      relationType: 'loot',
      record: fixtureBundle().records[0],
      tables: [
        'maint.maint_item_sources',
        'relation.item_source_facts',
        'relation.item_source_details',
        'relation.item_npc_loot_relations',
        'local.npc_loot_entries',
      ],
    }],
    unresolvedCandidates: [{ candidateKey: 'candidate-never-written' }],
  };
  const rows = buildNpcExternalRelationScopeRows({
    plan,
    landing: {
      id: 17,
      sourceKey: 'npc-external-relation-scope',
      contentHash: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256.slice('sha256:'.length),
      sourcePage: 'npc-item-relations.bundle',
      fetchedAt: '2026-08-18T12:31:00.000Z',
      parsedAt: '2026-08-18T12:31:00.000Z',
    },
    itemIndex: new Map([['test item', { source_id: 22, internal_name: 'TestItem', name: 'Test Item' }]]),
    npcIndex: new Map([['testnpc', { source_id: 33, internal_name: 'TestNpc', name: 'Test NPC' }]]),
  });

  assert.equal(rows.maintItemSources.length, 1);
  assert.match(rows.maintItemSources[0].recordKey, /^[a-f0-9]{64}$/);
  assert.notEqual(rows.maintItemSources[0].recordKey, 'npc-item:test:loot:test-item:1');
  assert.equal(JSON.parse(rows.maintItemSources[0].rawJson).recordKey, 'npc-item:test:loot:test-item:1');
  assert.equal(rows.relation.itemSourceFacts[0].sourceMaintRecordKey, rows.maintItemSources[0].recordKey);
  assert.equal(rows.maintNpcCrawlerFacts.length, 0);
  assert.equal(rows.relation.itemSourceFacts.length, 1);
  assert.equal(rows.relation.npcLootRelations.length, 1);
  assert.equal(rows.relation.npcShopRelations.length, 0);
  assert.equal(rows.maintItemSources.some((row) => row.recordKey === 'candidate-never-written'), false);
});

test('accepted projection binding matches the user-authorized resolved scope', () => {
  assert.equal(
    NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    'sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39',
  );
  assert.equal(NPC_EXTERNAL_RELATION_SCOPE_BINDING.recordCount, 1071);
  assert.equal(NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceFactCount, 1071);
  assert.equal(NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedSourceDetailCount, 1071);
  assert.equal(NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedLootRelationCount, 655);
  assert.equal(NPC_EXTERNAL_RELATION_SCOPE_BINDING.acceptedShopRelationCount, 408);
  assert.equal(NPC_EXTERNAL_RELATION_SCOPE_BINDING.quarantinedFactCount, 198);
});

test('apply keeps unresolved candidates out of the write plan', async () => {
  const plan = {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    applyAllowed: true,
    unresolvedCandidates: [{ candidateKey: 'candidate' }],
    writePlan: [{ recordKey: 'record', tables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets] }],
    tableCounts: Object.fromEntries(NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets.map((table) => [table, 1])),
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    serverFingerprint,
    bundle: { sha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256 },
    preview: { sha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.previewSha256 },
  };
  let receivedPlan;

  const result = await executeNpcExternalRelationScope({
      plan,
      apply: true,
      authorizationContext: authorizationContext(1),
      writer: {
        begin: async () => {},
        apply: async ({ writePlan }) => {
          receivedPlan = writePlan;
          return plan.tableCounts;
        },
        readback: async () => plan.tableCounts,
        commit: async () => {},
        rollback: async () => {},
      },
    });
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(receivedPlan?.map((entry) => entry.recordKey), ['record']);
  assert.equal(receivedPlan?.some((entry) => entry.candidateKey === 'candidate'), false);
});

test('local projection rows retain relation keys and reject unresolved local identities', () => {
  const relation = {
    npcLootRelations: [{
      recordKey: 'a'.repeat(64),
      sourceFactKey: 'b'.repeat(64),
      npcInternalName: 'TestNpc',
      itemInternalName: 'TestItem',
      quantityMin: 1,
      quantityMax: 2,
      quantityText: '1-2',
      chanceValue: 0.5,
      chanceText: '50%',
      conditions: null,
      conditionSourceText: null,
      sortOrder: 3,
    }],
    npcShopRelations: [{
      recordKey: 'c'.repeat(64),
      sourceFactKey: 'd'.repeat(64),
      npcInternalName: 'TestNpc',
      itemInternalName: 'TestItem',
      priceText: '5 silver',
      conditionSourceText: 'during day',
      sortOrder: 4,
    }],
  };
  const rows = buildNpcExternalRelationScopeLocalRows({
    relation,
    itemIndex: new Map([['testitem', { id: 22, internal_name: 'TestItem' }]]),
    npcIndex: new Map([['testnpc', { id: 33, internal_name: 'TestNpc' }]]),
  });

  assert.equal(rows.loot.length, 1);
  assert.equal(rows.shop.length, 1);
  assert.deepEqual(rows.loot[0], {
    relationRecordKey: 'a'.repeat(64),
    sourceFactKey: 'b'.repeat(64),
    npcId: 33,
    itemId: 22,
    sourceItemId: 22,
    quantityMin: 1,
    quantityMax: 2,
    quantityText: '1-2',
    chanceValue: 0.5,
    chanceText: '50%',
    conditions: null,
    notes: null,
    sortOrder: 3,
    dropSourceKind: 'npc_drop',
  });
  assert.throws(
    () => buildNpcExternalRelationScopeLocalRows({
      relation,
      itemIndex: new Map(),
      npcIndex: new Map([['testnpc', { id: 33, internal_name: 'TestNpc' }]]),
    }),
    /local item identity/i,
  );
});

test('apply writer is restricted to exact owner tables and rolls back on readback drift', async () => {
  const plan = {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    applyAllowed: true,
    unresolvedCandidates: [],
    writePlan: [{
      recordKey: 'npc-item:test:loot:test-item:1',
      tables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
      rows: 1,
    }],
    serverFingerprint,
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    bundle: { sha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256 },
    preview: { sha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.previewSha256 },
  };
  const calls = [];
  const writer = {
    begin: async () => calls.push('begin'),
    apply: async ({ writePlan }) => {
      calls.push(['apply', writePlan]);
      return { 'landing.npc_item_relations_bundle_raw': 2 };
    },
    readback: async () => ({ 'landing.npc_item_relations_bundle_raw': 1 }),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };

  await assert.rejects(
    () => executeNpcExternalRelationScope({
      plan,
      apply: true,
      authorizationContext: authorizationContext(0),
      writer,
    }),
    /readback|count/i,
  );
  assert.deepEqual(calls.map((entry) => Array.isArray(entry) ? entry[0] : entry), ['begin', 'apply', 'rollback']);
});

test('apply rejects an authorization packet whose server fingerprint drifted', async () => {
  const plan = {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    unresolvedCandidates: [],
    writePlan: [{ recordKey: 'record', tables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets] }],
    tableCounts: Object.fromEntries(NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets.map((table) => [table, 1])),
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    serverFingerprint,
  };
  const drifted = authorizationContext(0);
  drifted.serverFingerprint = { ...serverFingerprint, serverUuid: 'other-server' };

  await assert.rejects(() => executeNpcExternalRelationScope({
    plan,
    apply: true,
    authorizationContext: drifted,
    writer: {
      begin: async () => { throw new Error('writer must not begin'); },
      apply: async () => plan.tableCounts,
      readback: async () => plan.tableCounts,
      commit: async () => {},
      rollback: async () => {},
    },
  }), /server fingerprint.*drifted/i);
});

test('apply accepts the packet server fingerprint hash emitted by canonical authorization', async () => {
  const plan = {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    unresolvedCandidates: [],
    writePlan: [{ recordKey: 'record', tables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets] }],
    tableCounts: Object.fromEntries(NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets.map((table) => [table, 1])),
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    serverFingerprint,
    serverFingerprintSha256: hashCanonicalServerFingerprint(serverFingerprint),
  };
  const context = authorizationContext(0);
  context.serverFingerprint = plan.serverFingerprintSha256;
  const result = await executeNpcExternalRelationScope({
    plan,
    apply: true,
    authorizationContext: context,
    writer: {
      begin: async () => {},
      apply: async () => plan.tableCounts,
      readback: async () => plan.tableCounts,
      commit: async () => {},
      rollback: async () => {},
    },
  });
  assert.equal(result.status, 'COMPLETED');
});

test('scoped writer opens a transaction for each database and passes only the nine owner tables', async () => {
  const calls = [];
  const connection = (role) => ({
    beginTransaction: async () => calls.push(`begin:${role}`),
    commit: async () => calls.push(`commit:${role}`),
    rollback: async () => calls.push(`rollback:${role}`),
  });
  const handler = (phase) => ({
    apply: async ({ allowedTables }) => {
      calls.push(`apply:${phase}`);
      assert.deepEqual(allowedTables, [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets]);
      return {};
    },
    readback: async ({ allowedTables }) => {
      calls.push(`readback:${phase}`);
      assert.deepEqual(allowedTables, [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets]);
      return {};
    },
  });
  const writer = createNpcExternalRelationScopeWriter({
    connections: { local: connection('local'), maint: connection('maint'), relation: connection('relation') },
    handlers: { landing: handler('landing'), maint: handler('maint'), relation: handler('relation'), local: handler('local') },
  });

  await writer.begin({ operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID });
  await writer.apply({ writePlan: [] });
  await writer.readback({ writePlan: [] });
  await writer.commit();

  assert.deepEqual(calls, [
    'begin:local', 'begin:maint', 'begin:relation',
    'apply:landing', 'apply:maint', 'apply:relation', 'apply:local',
    'readback:landing', 'readback:maint', 'readback:relation', 'readback:local',
    'commit:relation', 'commit:maint', 'commit:local',
  ]);
});

test('concrete MySQL writer uses one transaction and only affected-key projection SQL', async () => {
  const calls = [];
  let landingInserted = false;
  let localLookupCalls = 0;
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    end: async () => calls.push('end'),
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes('maint_items')) {
        assert.doesNotMatch(sql, /\bname\b(?!\s+AS)/i);
        return [[{ source_id: 22, internal_name: 'TestItem', english_name: 'Test Item' }]];
      }
      if (sql.includes('maint_npcs')) {
        assert.doesNotMatch(sql, /\bname\b(?!\s+AS)/i);
        return [[{ source_id: 33, internal_name: 'TestNpc', english_name: 'Test NPC' }]];
      }
      if (sql.includes('FROM `terria_v1_local`.`items`')) return [[{ id: 122, internal_name: 'TestItem', name: 'Test Item' }]];
      if (sql.includes('FROM `terria_v1_local`.`npcs`')) return [[{ id: 133, internal_name: 'TestNpc', name: 'Test NPC' }]];
      throw new Error(`unexpected query: ${sql}`);
    },
    execute: async (sql) => {
      calls.push(sql);
      if (sql.includes('SELECT id, source_key AS sourceKey')) {
        return [[{ id: 17, sourceKey: 'generated.npc_item_relations_bundle', sourcePage: 'npc-item-relations.bundle', contentHash: 'a'.repeat(64), fetchedAt: new Date('2026-08-19T00:00:00.000Z'), parsedAt: new Date('2026-08-19T00:00:00.000Z') }]];
      }
      if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 1 }]];
      if (sql.includes('SELECT id FROM `terria_v1_local`.`npc_')) {
        localLookupCalls += 1;
        return [localLookupCalls >= 2 ? [{ id: localLookupCalls }] : []];
      }
      if (sql.startsWith('SELECT')) return [[]];
      if (/INSERT INTO\s+.*source_dataset_landings/i.test(sql)) {
        landingInserted = true;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  };
  const record = {
    recordKey: 'npc-item:test:loot:test-item:1',
    relationType: 'loot',
    npcInternalName: 'TestNpc',
    itemName: 'Test Item',
    sourceRefInternalName: 'TestNpc',
    sourceUrl: 'https://terraria.wiki.gg/wiki/TestNpc',
    quantityText: '1',
    chanceText: '100%',
  };
  const plan = {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    serverFingerprint,
    bundle: { path: bundlePath, sha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256 },
    records: [record],
    unresolvedCandidates: [],
    writePlan: [{ recordKey: record.recordKey, relationType: 'loot', record, tables: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets] }],
    tableCounts: {
      'landing.npc_item_relations_bundle_raw': 1,
      'maint.maint_item_sources': 1,
      'maint.maint_npc_crawler_facts': 0,
      'relation.item_source_facts': 1,
      'relation.item_source_details': 1,
      'relation.item_npc_loot_relations': 1,
      'relation.item_npc_shop_relations': 0,
      'local.npc_loot_entries': 1,
      'local.npc_shop_entries': 0,
    },
  };
  const writer = createNpcExternalRelationScopeMysqlWriter({
    repoRoot,
    plan,
    connectionFactory: async () => connection,
    now: '2026-08-19T00:00:00.000Z',
  });

  await writer.begin();
  const applied = await writer.apply({
    operationId: plan.operationId,
    scopeSha256: plan.scopeSha256,
    writePlan: plan.writePlan,
  });
  const readback = await writer.readback();
  await writer.commit();

  assert.deepEqual(applied, plan.tableCounts);
  assert.deepEqual(readback, plan.tableCounts);
  assert.equal(landingInserted, true);
  assert.deepEqual(calls.filter((entry) => entry === 'begin' || entry === 'commit' || entry === 'rollback'), ['begin', 'commit']);
  assert.equal(calls.some((entry) => typeof entry === 'string' && /\bDELETE\b|SET FOREIGN_KEY_CHECKS/i.test(entry)), false);
});

test('concrete MySQL writer rejects a payload scope that differs from its bound plan', async () => {
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    end: async () => {},
  };
  const plan = {
    operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
    scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
    serverFingerprint,
    bundle: { path: bundlePath, sha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256 },
    records: [],
    unresolvedCandidates: [],
    writePlan: [],
    tableCounts: Object.fromEntries(NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets.map((table) => [table, 0])),
  };
  const writer = createNpcExternalRelationScopeMysqlWriter({
    repoRoot,
    plan,
    connectionFactory: async () => connection,
  });
  await writer.begin();
  await assert.rejects(
    () => writer.apply({
      operationId: NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID,
      scopeSha256: 'sha256:payload-drift',
      writePlan: [],
    }),
    /scope.*drifted/i,
  );
  await writer.rollback();
});
