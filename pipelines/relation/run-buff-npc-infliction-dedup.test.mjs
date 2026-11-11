import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BUFF_NPC_INFLICTION_DEDUP_SOURCE_PATH,
  assertBuffNpcInflictionDedupApplyAuthorization,
  buildBuffNpcInflictionDedupPaths,
  parseBuffNpcInflictionDedupArgs,
  prepareBuffNpcInflictionDedupProposal,
  readBuffNpcInflictionDedupIndependentAfterSet,
} from './run-buff-npc-infliction-dedup.mjs';
import { buildBuffNpcInflictionDedupProposal } from './buff-npc-infliction-dedup.mjs';

const TARGETS = [
  { npcSourceId: 222, npcInternalName: 'QueenBee', buffSourceId: 20, buffInternalName: 'Poisoned', retainedId: 904, retireId: 1219 },
  { npcSourceId: 370, npcInternalName: 'DukeFishron', buffSourceId: 30, buffInternalName: 'Bleeding', retainedId: 444, retireId: 393 },
  { npcSourceId: 370, npcInternalName: 'DukeFishron', buffSourceId: 148, buffInternalName: 'Rabies', retainedId: 471, retireId: 627 },
  { npcSourceId: 668, npcInternalName: 'Deerclops', buffSourceId: 32, buffInternalName: 'Slow', retainedId: 773, retireId: 232 },
  { npcSourceId: 668, npcInternalName: 'Deerclops', buffSourceId: 47, buffInternalName: 'Frozen', retainedId: 575, retireId: 457 },
];
const HASH = `sha256:${'a'.repeat(64)}`;
const SOURCE_RECORD_KEYS = new Map([
  [904, 'b7e62390ad52ff1ca54f051b2197ef7436e87af412af9ff0793dc75ca11c8234'],
  [1219, 'f5789b2091662071ab2cada7e10cfe2661289568ccc2ce2d91004b469b169563'],
  [444, '5923d81ff8384ec7e52cec0e9e5e4c3cff8408d7752590b07ac884c804e14317'],
  [393, '4d96df32ebc0bb65413685ea5676b6398f4bacfa1c1b913b23d1a36e154d9a57'],
  [471, '5eb0233dcb37df21c5493b0b0cd51ee5149c06f322b86e1a32c4e1aeb7f59b80'],
  [627, '8033b465d6e1cd8075276be5acf52196dfe38351796d83f34c790f1b608973f3'],
  [773, '9c7c6552dceb552ee9c2c1e5bf1b652e2bb0102afd8f50c7bcbf0dcfe1d55363'],
  [232, '2ed2597d197c843ef89e24cb81b6ff9cfde937deb5e9615c9ad074a799b05534'],
  [575, '74614c9eda39eaaed6c15e8abe83d50577f97aeecfbe41b52cb5c86bb7b060a7'],
  [457, '5c58c008caadd51f4d94ff816cebcfcc11f4c45a4ca19341241eddbdfe77563c'],
]);

function makeSourceRows() {
  const values = [
    [20, 'Poisoned', 'QueenBee', [3, 4]],
    [30, 'Bleeding', 'DukeFishron', [6]],
    [148, 'Rabies', 'DukeFishron', [5]],
    [32, 'Slow', 'Deerclops', [8]],
    [47, 'Frozen', 'Deerclops', [1]],
  ];
  return values.map(([sourceId, internalName, npcName, indexes]) => {
    const maxIndex = Math.max(...indexes);
    const inflictingNpcs = Array.from({ length: maxIndex + 1 }, (_, index) => ({ internalName: `Npc${index}` }));
    for (const index of indexes) inflictingNpcs[index] = { internalName: npcName };
    return { source_id: sourceId, internal_name: internalName, raw_json: JSON.stringify({ inflictingNpcs }), status: 1, deleted: 0 };
  });
}

function makeRows() {
  return TARGETS.flatMap((target) => [target.retainedId, target.retireId].map((id) => ({
    id,
    record_key: SOURCE_RECORD_KEYS.get(id) ?? `record-${id}`,
    npc_source_id: target.npcSourceId,
    npc_internal_name: target.npcInternalName,
    npc_name: target.npcInternalName,
    buff_source_id: target.buffSourceId,
    buff_internal_name: target.buffInternalName,
    relation_type: 'inflicts',
    duration_ticks: null,
    chance_value: null,
    chance_text: null,
    conditions: null,
    source_maint_table: 'maint_buffs',
    source_maint_record_key: null,
    source_maint_id: target.buffSourceId,
    landing_source_id: 18627,
    landing_source_key: 'generated.buffs.standardized',
    landing_content_hash: 'b'.repeat(64),
    source_provider: 'terrapedia.generated',
    source_page: 'buffs.standardized',
    source_revision_timestamp: null,
    confidence: '1.0000',
    reason: 'maint_buff_inflicting_npc',
    review_status: 'resolved',
    raw_json: null,
    status: 1,
    deleted: 0,
  })));
}

function makeFacts() {
  return TARGETS.map((target, index) => ({
    relationType: 'inflicts',
    npcSourceId: target.npcSourceId,
    npcInternalName: target.npcInternalName,
    npcName: target.npcInternalName,
    buffId: target.buffSourceId,
    buffInternalName: target.buffInternalName,
    buffName: target.buffInternalName,
    sourcePage: target.npcInternalName,
    sourcePageId: 1000 + index,
    sourceRevisionId: 2000 + index,
    sourceRevisionTimestamp: '2026-10-01T00:00:00Z',
    sourceRawSha256: `sha256:${String(index + 1).repeat(64)}`,
  }));
}

test('prepares a source-bound exact five-row proposal using only a read-only snapshot', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-infliction-dedup-'));
  const events = [];
  const currentRows = makeRows();
  const currentBuffRows = makeSourceRows();
  try {
    const sourcePath = path.join(root, BUFF_NPC_INFLICTION_DEDUP_SOURCE_PATH);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, `${JSON.stringify({
      databaseWrites: false,
      manifestSha256: `sha256:${'d'.repeat(64)}`,
      evidence: { schemaVersion: 'buff-npc-page-infliction-evidence/v1', facts: makeFacts() },
    })}\n`, { mode: 0o600 });
    const mysqlModule = {
      async createConnection() {
        return {
          async query(sql) {
            events.push(sql);
            if (sql === 'SELECT @@server_uuid AS serverUuid') return [[{ serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf' }], []];
            if (sql.includes('FROM terria_v1_maint.maint_buffs')) return [currentBuffRows, []];
            if (sql.includes('FROM terria_v1_relation.npc_buff_relations')) return [currentRows, []];
            return [[], []];
          },
          async end() { events.push('END'); },
        };
      },
    };

    const result = await prepareBuffNpcInflictionDedupProposal({
      repoRoot: root,
      resultLabel: 'test-01',
      mysqlModule,
      generatedAt: '2026-10-07T00:00:00.000Z',
    });
    const proposal = JSON.parse(fs.readFileSync(path.join(root, result.proposalPath), 'utf8'));

    assert.equal(proposal.databaseWrites, false);
    assert.equal(proposal.summary.retirementCount, 5);
    assert.deepEqual(proposal.changes.retirements.map(change => change.before.id), [232, 393, 457, 627, 1219]);
    assert.equal(proposal.source.facts.length, 5);
    assert.equal(proposal.maintSource.rowCount, 5);
    assert.ok(events.some(sql => sql.includes('FROM terria_v1_maint.maint_buffs')));
    assert.ok(events.includes('START TRANSACTION READ ONLY'));
    assert.ok(events.includes('ROLLBACK'));
    assert.equal(events.at(-1), 'END');
    assert.ok(events.every(sql => typeof sql === 'string' && !/^\s*(UPDATE|INSERT|DELETE|REPLACE)\b/i.test(sql)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts only explicit prepare or apply for the exact operation', () => {
  assert.deepEqual(parseBuffNpcInflictionDedupArgs([
    '--operation-id=canonical-buff-npc-infliction-dedup',
    '--result-label=test-01',
    '--prepare=true',
  ]), {
    operationId: 'canonical-buff-npc-infliction-dedup',
    resultLabel: 'test-01',
    apply: false,
  });
  assert.throws(() => parseBuffNpcInflictionDedupArgs([
    '--operation-id=canonical-buff-npc-infliction-dedup', '--prepare=true', '--apply=true',
  ]), /exact operation and one explicit prepare\/apply action/i);
  assert.throws(() => parseBuffNpcInflictionDedupArgs([
    '--operation-id=canonical-buff-npc-secondary-apply', '--apply=true',
  ]), /exact operation and one explicit prepare\/apply action/i);
});

test('authorization binds the exact proposal, source, write target, and fence identity', () => {
  const paths = buildBuffNpcInflictionDedupPaths('test-01');
  const proposal = buildBuffNpcInflictionDedupProposal({
    facts: makeFacts(),
    source: { artifactSha256: HASH, manifestSha256: HASH },
    currentBuffRows: makeSourceRows(),
    currentRows: makeRows(),
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    generatedAt: '2026-10-07T00:00:00.000Z',
  });
  const sourcePath = BUFF_NPC_INFLICTION_DEDUP_SOURCE_PATH;
  const authorizedContext = {
    authorizationStatus: 'AUTHORIZED',
    operationId: 'canonical-buff-npc-infliction-dedup',
    packetHash: HASH,
    decisionIdentity: 'canonical-buff-npc-infliction-dedup-test-admin-01',
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    executionManifestHash: HASH,
    requiredTechnicalFields: ['executionManifestHash'],
    executionManifest: {
      executionClass: 'formal_buff_npc_infliction_dedup',
      databaseWrites: true,
      networkAccess: false,
      ownershipKeys: ['relation.npc_buff_relations.inflicts.status_deleted'],
      inputPaths: [paths.proposalPath, sourcePath],
      outputPaths: [paths.resultPath, paths.journalPath, paths.readbackPath],
      buffNpcInflictionDedup: {
        schemaVersion: 'buff-npc-infliction-dedup-operation-binding/v1',
        operationId: 'canonical-buff-npc-infliction-dedup',
        resultLabel: 'test-01',
        runId: 'buff-infliction-dedup-test-01',
        fenceToken: 'fence:test-infliction-dedup-01',
        proposalPath: paths.proposalPath,
        resultPath: paths.resultPath,
        journalPath: paths.journalPath,
        readbackPath: paths.readbackPath,
      },
    },
    dataBundleEntries: [
      { path: paths.proposalPath, contentHash: HASH },
      { path: sourcePath, contentHash: HASH },
    ],
  };

  assert.equal(assertBuffNpcInflictionDedupApplyAuthorization({
    authorizedContext, proposal, paths, proposalHash: HASH,
  }), true);
  assert.throws(() => assertBuffNpcInflictionDedupApplyAuthorization({
    authorizedContext: {
      ...authorizedContext,
      executionManifest: {
        ...authorizedContext.executionManifest,
        ownershipKeys: ['relation.npc_buff_relations.immune'],
      },
    },
    proposal,
    paths,
  }), /manifest, artifact paths, or runtime fence binding drifted/i);
  assert.throws(() => assertBuffNpcInflictionDedupApplyAuthorization({
    authorizedContext: {
      ...authorizedContext,
      dataBundleEntries: [
        authorizedContext.dataBundleEntries[0],
        { path: sourcePath, contentHash: `sha256:${'b'.repeat(64)}` },
      ],
    },
    proposal,
    paths,
  }), /source artifact hash drifted/i);
});

test('independent after-set readback uses a separate read-only transaction and exact server', async () => {
  const proposal = buildBuffNpcInflictionDedupProposal({
    facts: makeFacts(),
    source: { artifactSha256: HASH, manifestSha256: HASH },
    currentBuffRows: makeSourceRows(),
    currentRows: makeRows(),
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    generatedAt: '2026-10-07T00:00:00.000Z',
  });
  const events = [];
  const mysql = {
    async createConnection() {
      return {
        async query(sql) {
          events.push(sql);
          if (sql === 'SELECT @@server_uuid AS serverUuid') {
            return [[{ serverUuid: proposal.serverUuid }], []];
          }
          if (sql.includes('FROM terria_v1_relation.npc_buff_relations')) return [proposal.after.rows, []];
          return [[], []];
        },
        async end() { events.push('END'); },
      };
    },
  };
  const readback = await readBuffNpcInflictionDedupIndependentAfterSet({
    mysql,
    connectionOptions: { host: '127.0.0.1', port: 13306 },
    proposal,
    expectedServerUuid: proposal.serverUuid,
  });
  assert.equal(readback.serverUuid, proposal.serverUuid);
  assert.deepEqual(readback.rows, proposal.after.rows);
  assert.equal(events[0], 'START TRANSACTION READ ONLY');
  assert.ok(events.includes('ROLLBACK'));
  assert.equal(events.at(-1), 'END');
});
