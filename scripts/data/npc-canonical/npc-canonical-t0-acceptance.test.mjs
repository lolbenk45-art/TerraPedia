import assert from 'node:assert/strict';
import test from 'node:test';

const acceptance = await import('./npc-canonical-t0-acceptance.mjs').catch(() => ({}));

const DATABASES = {
  local: 'terria_v1_automation_test_npc_0123456789abcdef_local',
  maint: 'terria_v1_automation_test_npc_0123456789abcdef_maint',
  relation: 'terria_v1_automation_test_npc_0123456789abcdef_relation',
};

test('paired NPC fixture builds non-empty landing maint relation and local evidence', () => {
  assert.equal(typeof acceptance.buildNpcCanonicalT0Projection, 'function');
  const projection = acceptance.buildNpcCanonicalT0Projection({
    runKey: 'npc_0123456789abcdef',
  });

  assert.deepEqual(projection.counts, {
    landing: { base: 1, crawlerFacts: 1, normalized: 1, audit: 1 },
    maint: { facts: 1, matched: 1, unmatched: 0, ambiguous: 0, rejected: 0 },
    relation: { npcBuff: 1, npcShop: 1, npcLoot: 1 },
    local: { npcBuff: 1, npcShop: 1, npcLoot: 1 },
  });
  assert.equal(projection.maintFact.matchStatus, 'MATCHED');
  assert.equal(projection.evidence.normalizedContentHash, projection.maintFact.normalizedContentHash);
  assert.equal(projection.evidence.auditContentHash, projection.maintFact.crawlerAuditHash);
  assert.match(projection.hashes.landing, /^sha256:[a-f0-9]{64}$/);
  assert.match(projection.hashes.maint, /^sha256:[a-f0-9]{64}$/);
  assert.match(projection.hashes.relation, /^sha256:[a-f0-9]{64}$/);
  assert.match(projection.hashes.local, /^sha256:[a-f0-9]{64}$/);
});

test('NPC T0 schema probe requires every landing maint relation and local table', () => {
  assert.equal(typeof acceptance.buildNpcCanonicalT0SchemaProbeSql, 'function');
  const sql = acceptance.buildNpcCanonicalT0SchemaProbeSql(DATABASES);
  assert.doesNotMatch(sql, /terria_v1_(?:local|maint|relation)(?=[^a-z0-9_]|$)/i);
  for (const database of Object.values(DATABASES)) assert.match(sql, new RegExp(database));

  const output = acceptance.EXPECTED_NPC_T0_SCHEMA_EVIDENCE
    .map((entry) => entry.join('\t'))
    .join('\n');
  assert.deepEqual(acceptance.validateNpcCanonicalT0SchemaOutput(output), {
    status: 'passed',
    evidenceCount: acceptance.EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length,
  });
  assert.throws(
    () => acceptance.validateNpcCanonicalT0SchemaOutput(output.split('\n').slice(1).join('\n')),
    /missing schema evidence/i,
  );
});

test('NPC T0 SQL is isolated and proves rollback commit restore for fixture rows', () => {
  assert.equal(typeof acceptance.buildNpcCanonicalT0Sql, 'function');
  const projection = acceptance.buildNpcCanonicalT0Projection({
    runKey: 'npc_0123456789abcdef',
  });
  const sql = acceptance.buildNpcCanonicalT0Sql({ databases: DATABASES, projection });

  assert.doesNotMatch(sql, /terria_v1_(?:local|maint|relation)(?=[^a-z0-9_]|$)/i);
  assert.match(sql, /START TRANSACTION/);
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /'rollback'/);
  assert.match(sql, /'commit'/);
  assert.match(sql, /'restore'/);
  for (const table of [
    'source_dataset_landings',
    'maint_npc_crawler_facts',
    'item_npc_shop_relations',
    'item_npc_loot_relations',
    'npc_buff_relations',
    'npc_shop_entries',
    'npc_loot_entries',
  ]) assert.match(sql, new RegExp(table));
  const detailInsert = sql.match(/INSERT INTO `[^`]+`\.`item_source_details`[\s\S]*?;/)?.[0] ?? '';
  assert.doesNotMatch(detailInsert, /`confidence`|`review_status`|`reason`/);

  const zero = Array(9).fill(0).join('\t');
  const one = Array(9).fill(1).join('\t');
  const output = [
    `rollback\t${zero}`,
    `commit\t${one}`,
    `identity\t${projection.evidence.normalizedContentHash}\t${projection.evidence.auditContentHash}\t${projection.maintFact.recordKey}`,
    `restore\t${zero}`,
  ].join('\n');
  const parsed = acceptance.parseNpcCanonicalT0Output(output, projection);
  assert.equal(parsed.status, 'passed');
  assert.deepEqual(parsed.commit, Array(9).fill(1));
  assert.throws(
    () => acceptance.parseNpcCanonicalT0Output(output.replace(`restore\t${zero}`, `restore\t1\t${zero}`), projection),
    /restore/i,
  );
});

test('NPC scoped T0 executor returns CODE_READY fixture evidence from database queries', async () => {
  assert.equal(typeof acceptance.runNpcCanonicalT0Acceptance, 'function');
  const projection = acceptance.buildNpcCanonicalT0Projection({
    runKey: 'npc_0123456789abcdef',
  });
  const zero = Array(9).fill(0).join('\t');
  const one = Array(9).fill(1).join('\t');
  const outputs = [
    acceptance.EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map((entry) => entry.join('\t')).join('\n'),
    [
      `rollback\t${zero}`,
      `commit\t${one}`,
      `identity\t${projection.evidence.normalizedContentHash}\t${projection.evidence.auditContentHash}\t${projection.maintFact.recordKey}`,
      `restore\t${zero}`,
    ].join('\n'),
  ];
  const calls = [];
  const result = await acceptance.runNpcCanonicalT0Acceptance({
    profile: 't0',
    repoRoot: new URL('../../..', import.meta.url).pathname,
    databases: DATABASES,
    manifest: { runKey: 'npc_0123456789abcdef' },
    client: {
      query: async (sql, targetDatabase) => {
        calls.push({ sql, targetDatabase });
        return outputs.shift();
      },
    },
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.readiness.readinessLevel, 'CODE_READY');
  assert.equal(result.readiness.summary.status, 'pass');
  assert.deepEqual(result.counts, projection.counts);
  assert.equal(calls[1].targetDatabase, DATABASES.local);
  await assert.rejects(
    acceptance.runNpcCanonicalT0Acceptance({
      profile: 't1', databases: DATABASES, client: { query: async () => '' },
    }),
    /T0/i,
  );
});
