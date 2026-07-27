import { createHash } from 'node:crypto';

import {
  buildNpcCrawlerFactEvidence,
  buildNpcCrawlerFactMaintRow,
  verifyNpcBridgeRetirement,
} from './npc-canonical-contract.mjs';
import { buildNpcCanonicalReadinessReport } from './npc-canonical-readiness.mjs';
import { buildItemSourceRelations } from '../relation/item-source-relation-processor.mjs';
import { buildNpcCrawlerFactRelationInputs } from '../relation/sync-maint-to-relation.mjs';
import { buildBuffRelationSyncPayload } from '../relation/sync-buffs-to-relation.mjs';

const ZERO_COUNTS = Object.freeze(Array(9).fill(0));
const COMMIT_COUNTS = Object.freeze(Array(9).fill(1));
const FIXTURE_IDS = Object.freeze({
  baseLanding: 910001,
  crawlerLanding: 910002,
  torch: 920001,
  medusaHead: 920002,
  medusa: 920003,
  stoned: 920004,
  localShop: 930001,
  localLoot: 930002,
  localBuff: 930003,
});

export const EXPECTED_NPC_T0_SCHEMA_EVIDENCE = Object.freeze([
  ['local', 'source_dataset_landings'],
  ['local', 'items'],
  ['local', 'npcs'],
  ['local', 'buffs'],
  ['local', 'npc_buff_relations'],
  ['local', 'npc_shop_entries'],
  ['local', 'npc_loot_entries'],
  ['maint', 'maint_npc_crawler_facts'],
  ['relation', 'item_source_facts'],
  ['relation', 'item_source_details'],
  ['relation', 'item_npc_shop_relations'],
  ['relation', 'item_npc_loot_relations'],
  ['relation', 'npc_buff_relations'],
]);

const INSERT_COLUMNS = Object.freeze({
  maint_npc_crawler_facts: [
    'recordKey', 'npcIdentityKey', 'npcSourceId', 'npcInternalName', 'npcName',
    'matchStatus', 'matchReason', 'sourcePage', 'sourceRevisionTimestamp', 'fetchedAt',
    'parsedAt', 'landingSourceId', 'landingSourceKey', 'landingSourcePage',
    'landingContentHash', 'normalizedContentHash', 'crawlerAuditHash',
    'crawlerAuditStatus', 'buffInflictionsJson', 'shopFactsJson', 'lootFactsJson',
    'sourceMetadataJson', 'rawEvidenceJson', 'reviewStatus', 'status', 'deleted',
  ],
  item_source_facts: [
    'recordKey', 'itemSourceId', 'itemInternalName', 'itemName', 'sourceType',
    'sourceRefType', 'sourceRefName', 'sourceRefNormalized', 'biomeCode', 'sortOrder',
    'sourceMaintTable', 'sourceMaintRecordKey', 'sourceMaintId', 'landingSourceId',
    'landingSourceKey', 'landingContentHash', 'sourceProvider', 'sourcePage',
    'sourceRevisionTimestamp', 'confidence', 'reason', 'reviewStatus', 'rawJson',
  ],
  item_source_details: [
    'recordKey', 'sourceFactKey', 'sourceRefName', 'quantityMin', 'quantityMax',
    'quantityText', 'chanceValue', 'chanceText', 'sourceRefInternalName',
    'sourceRefResolution', 'notes', 'sourceMaintTable', 'sourceMaintRecordKey',
    'sourceMaintId', 'landingSourceId', 'landingSourceKey', 'landingContentHash',
    'sourceProvider', 'sourcePage', 'sourceRevisionTimestamp', 'rawJson',
  ],
  item_npc_shop_relations: [
    'recordKey', 'sourceFactKey', 'itemInternalName', 'itemName', 'npcSourceId',
    'npcInternalName', 'npcName', 'priceText', 'conditions', 'conditionSourceText',
    'conditionParseStatus', 'conditionBiomeCode', 'conditionGamePeriodCode',
    'conditionTimeCode', 'conditionWeatherCode', 'conditionEventsJson',
    'specialFlagsJson', 'sourceMaintTable', 'sourceMaintRecordKey', 'sourceMaintId',
    'landingSourceId', 'landingSourceKey', 'landingContentHash', 'sourceProvider',
    'sourcePage', 'sourceRevisionTimestamp', 'confidence', 'reason', 'reviewStatus',
    'rawJson',
  ],
  item_npc_loot_relations: [
    'recordKey', 'sourceFactKey', 'itemInternalName', 'itemName', 'npcSourceId',
    'npcInternalName', 'npcName', 'quantityMin', 'quantityMax', 'quantityText',
    'chanceValue', 'chanceText', 'conditions', 'conditionSourceText',
    'conditionParseStatus', 'conditionBiomeCode', 'conditionGamePeriodCode',
    'conditionTimeCode', 'conditionWeatherCode', 'conditionEventsJson',
    'specialFlagsJson', 'sourceMaintTable', 'sourceMaintRecordKey', 'sourceMaintId',
    'landingSourceId', 'landingSourceKey', 'landingContentHash', 'sourceProvider',
    'sourcePage', 'sourceRevisionTimestamp', 'confidence', 'reason', 'reviewStatus',
    'rawJson',
  ],
  npc_buff_relations: [
    'recordKey', 'npcSourceId', 'npcInternalName', 'npcName', 'buffSourceId',
    'buffInternalName', 'relationType', 'durationTicks', 'chanceValue', 'chanceText',
    'conditions', 'sourceMaintTable', 'sourceMaintRecordKey', 'sourceMaintId',
    'landingSourceId', 'landingSourceKey', 'landingContentHash', 'sourceProvider',
    'sourcePage', 'sourceRevisionTimestamp', 'confidence', 'reason', 'reviewStatus',
  ],
});

export function buildNpcCanonicalT0Projection({ runKey } = {}) {
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(runKey ?? '')) {
    throw new Error('NPC canonical T0 runKey is invalid');
  }
  const normalized = {
    entityId: 'Medusa',
    source: { pageTitle: 'Medusa' },
    sourceMetadata: {
      revisionTimestamp: '2026-07-27T01:00:00.000Z',
      fetchedAt: '2026-07-27T01:01:00.000Z',
      parsedAt: '2026-07-27T01:02:00.000Z',
      sourceId: 477,
    },
    display: { name: 'Medusa' },
    buffInflictions: [{ buffName: 'Stoned', durationText: '1 second' }],
    shop: { normalizedRows: [{ itemName: 'Torch', itemInternalName: 'Torch', priceText: '50 Copper' }] },
    loot: [{ itemName: 'Medusa Head', itemInternalName: 'MedusaHead', chanceText: '1%', quantityText: '1' }],
  };
  const audit = {
    status: 'pass',
    entityId: normalized.entityId,
    sourcePage: normalized.source.pageTitle,
    sourceRevisionTimestamp: normalized.sourceMetadata.revisionTimestamp,
    auditedAt: '2026-07-27T01:03:00.000Z',
    normalizedContentHash: hashJson(normalized, false),
  };
  const evidence = buildNpcCrawlerFactEvidence({ normalized, audit });
  const basePayload = { records: [{ id: 477, internalName: 'Medusa', name: 'Medusa' }] };
  const baseLanding = {
    id: FIXTURE_IDS.baseLanding,
    datasetType: 'npcs_base_raw',
    provider: 'terraria.game-content',
    sourceKind: 'standardized_fixture',
    sourceKey: `fixture:npc-base:${runKey}`,
    sourceLocator: 'fixture://npc-base/medusa',
    sourcePage: 'Medusa',
    sourceRevisionTimestamp: normalized.sourceMetadata.revisionTimestamp,
    contentHash: hashJson(basePayload, false),
    payloadJson: JSON.stringify(basePayload),
    fetchedAt: normalized.sourceMetadata.fetchedAt,
    parsedAt: normalized.sourceMetadata.parsedAt,
    parseStatus: 'ok',
    artifactRole: 'fixture',
    producerId: 'npc-canonical-t0',
    producerVersion: '1',
    producerRunKey: runKey,
    isCurrent: 1,
  };
  const crawlerLanding = {
    id: FIXTURE_IDS.crawlerLanding,
    datasetType: 'npc_crawler_facts_raw',
    provider: 'terraria.wiki.gg',
    sourceKind: 'crawler_fixture',
    sourceKey: `fixture:npc-crawler-fact:${runKey}:medusa`,
    sourceLocator: 'fixture://npc-crawler/medusa',
    sourcePage: evidence.sourcePage,
    sourceRevisionTimestamp: evidence.sourceRevisionTimestamp,
    contentHash: evidence.contentHash,
    payloadJson: JSON.stringify(evidence.payload),
    fetchedAt: evidence.fetchedAt,
    parsedAt: evidence.parsedAt,
    parseStatus: evidence.parseStatus,
    artifactRole: 'fixture',
    producerId: 'npc-canonical-t0',
    producerVersion: '1',
    producerRunKey: runKey,
    isCurrent: 1,
  };
  const maintFact = buildNpcCrawlerFactMaintRow({
    landingRow: {
      id: crawlerLanding.id,
      source_key: crawlerLanding.sourceKey,
      source_page: crawlerLanding.sourcePage,
      source_revision_timestamp: crawlerLanding.sourceRevisionTimestamp,
      content_hash: crawlerLanding.contentHash,
      normalized_content_hash: evidence.normalizedContentHash,
      audit_content_hash: evidence.auditContentHash,
      fetched_at: crawlerLanding.fetchedAt,
      parsed_at: crawlerLanding.parsedAt,
      payload_json: crawlerLanding.payloadJson,
    },
    maintNpcRows: [{ source_id: 477, internal_name: 'Medusa', english_name: 'Medusa' }],
  });
  const relationInputs = buildNpcCrawlerFactRelationInputs({
    maintNpcCrawlerFactRows: [maintFact],
    maintBuffRows: [{
      source_id: 156,
      internal_name: 'Stoned',
      english_name: 'Stoned',
      raw_json: '{}',
      source_provider: 'fixture',
      source_page: 'Stoned',
    }],
  });
  const itemSources = buildItemSourceRelations({
    itemSourceRows: relationInputs.itemSourceRows,
    npcIndex: new Map([['medusa', { sourceId: 477, internalName: 'Medusa', name: 'Medusa' }]]),
    itemIndex: new Map([
      ['torch', { sourceId: 8, internalName: 'Torch', name: 'Torch' }],
      ['medusa head', { sourceId: 3269, internalName: 'MedusaHead', name: 'Medusa Head' }],
      ['medusahead', { sourceId: 3269, internalName: 'MedusaHead', name: 'Medusa Head' }],
    ]),
  });
  const buffs = buildBuffRelationSyncPayload({
    maintBuffRows: relationInputs.maintBuffRows,
    maintNpcRows: [{ source_id: 477, internal_name: 'Medusa', english_name: 'Medusa', raw_json: '{}' }],
  });
  const relation = {
    sourceFacts: itemSources.sourceFacts,
    sourceDetails: itemSources.sourceDetails,
    npcShop: itemSources.npcShopRelations,
    npcLoot: itemSources.npcLootRelations,
    npcBuff: buffs.npcBuffRelations,
  };
  if (relation.npcShop.length !== 1 || relation.npcLoot.length !== 1 || relation.npcBuff.length !== 1) {
    throw new Error('NPC canonical T0 fixture did not reconstruct every relation lane');
  }
  const local = {
    npcShop: [{ id: FIXTURE_IDS.localShop, npcId: FIXTURE_IDS.medusa, itemId: FIXTURE_IDS.torch }],
    npcLoot: [{ id: FIXTURE_IDS.localLoot, npcId: FIXTURE_IDS.medusa, itemId: FIXTURE_IDS.medusaHead }],
    npcBuff: [{ id: FIXTURE_IDS.localBuff, npcId: FIXTURE_IDS.medusa, buffId: FIXTURE_IDS.stoned }],
  };
  return {
    runKey,
    evidence,
    baseLanding,
    crawlerLanding,
    maintFact,
    relation,
    local,
    counts: {
      landing: { base: 1, crawlerFacts: 1, normalized: 1, audit: 1 },
      maint: { facts: 1, matched: 1, unmatched: 0, ambiguous: 0, rejected: 0 },
      relation: { npcBuff: 1, npcShop: 1, npcLoot: 1 },
      local: { npcBuff: 1, npcShop: 1, npcLoot: 1 },
    },
    hashes: {
      landing: hashJson([baseLanding, crawlerLanding]),
      maint: hashJson([maintFact]),
      relation: hashJson(relation),
      relationNpcBuff: hashJson(relation.npcBuff),
      relationNpcShop: hashJson(relation.npcShop),
      relationNpcLoot: hashJson(relation.npcLoot),
      local: hashJson(local),
      localNpcBuff: hashJson(local.npcBuff),
      localNpcShop: hashJson(local.npcShop),
      localNpcLoot: hashJson(local.npcLoot),
    },
  };
}

export function buildNpcCanonicalT0SchemaProbeSql(databases) {
  const names = assertDatabaseSet(databases);
  return EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map(([role, table]) => (
    `SELECT '${role}', '${table}' FROM information_schema.tables WHERE table_schema = ${sqlValue(names[role])} AND table_name = '${table}'`
  )).join(';\n') + ';\n';
}

export function validateNpcCanonicalT0SchemaOutput(output) {
  const actual = new Set(String(output ?? '').trim().split(/\r?\n/).filter(Boolean));
  const missing = EXPECTED_NPC_T0_SCHEMA_EVIDENCE
    .map((entry) => entry.join('\t'))
    .filter((entry) => !actual.has(entry));
  if (missing.length) throw new Error(`missing schema evidence: ${missing.join(', ')}`);
  return { status: 'passed', evidenceCount: EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length };
}

export function buildNpcCanonicalT0Sql({ databases, projection } = {}) {
  const names = assertDatabaseSet(databases);
  const apply = buildApplySql(names, projection);
  const restore = buildRestoreSql(names, projection);
  return [
    'START TRANSACTION', apply, 'ROLLBACK', countSql('rollback', names),
    'START TRANSACTION', apply, 'COMMIT', countSql('commit', names),
    `SELECT 'identity', \`normalized_content_hash\`, \`crawler_audit_hash\`, \`record_key\` FROM \`${names.maint}\`.\`maint_npc_crawler_facts\` WHERE \`record_key\` = ${sqlValue(projection.maintFact.recordKey)}`,
    'START TRANSACTION', restore, 'COMMIT', countSql('restore', names),
  ].join(';\n') + ';\n';
}

export function parseNpcCanonicalT0Output(output, projection) {
  const rows = String(output ?? '').trim().split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
  const counts = Object.fromEntries(rows.filter(([label]) => ['rollback', 'commit', 'restore'].includes(label))
    .map(([label, ...values]) => [label, values.map(Number)]));
  for (const [label, expected] of [['rollback', ZERO_COUNTS], ['commit', COMMIT_COUNTS], ['restore', ZERO_COUNTS]]) {
    if (!counts[label] || counts[label].length !== expected.length
      || counts[label].some((value, index) => value !== expected[index])) {
      throw new Error(`NPC canonical T0 ${label} counts are missing or invalid`);
    }
  }
  const identity = rows.find(([label]) => label === 'identity');
  if (!identity
    || identity[1] !== projection.evidence.normalizedContentHash
    || identity[2] !== projection.evidence.auditContentHash
    || identity[3] !== projection.maintFact.recordKey) {
    throw new Error('NPC canonical T0 paired evidence identity is invalid');
  }
  return { status: 'passed', ...counts, identity: identity.slice(1) };
}

export async function runNpcCanonicalT0Acceptance({
  profile,
  repoRoot,
  databases,
  client,
  manifest,
} = {}) {
  if (profile !== 't0' || !client?.query) {
    throw new Error('NPC canonical acceptance requires T0 and an isolated database client');
  }
  const schema = validateNpcCanonicalT0SchemaOutput(
    await client.query(buildNpcCanonicalT0SchemaProbeSql(databases)),
  );
  const projection = buildNpcCanonicalT0Projection({ runKey: manifest?.runKey });
  const transaction = parseNpcCanonicalT0Output(
    await client.query(buildNpcCanonicalT0Sql({ databases, projection }), databases.local),
    projection,
  );
  const bridge = verifyNpcBridgeRetirement({ repoRoot });
  if (bridge.status !== 'pass') throw new Error('NPC bridge retirement scan is blocked');
  const bridgeHash = hashJson({
    retiredPath: bridge.retiredPath,
    scannedFileCount: bridge.scannedFileCount,
    allowedReferenceCount: bridge.allowedReferenceCount,
    referenceCount: bridge.referenceCount,
  });
  const readiness = buildNpcCanonicalReadinessReport({
    evidence: {
      evidenceScope: 'fixture',
      writesDatabase: false,
      databaseRole: 't0-fixture',
      landing: {
        base: { fresh: true, currentCount: 1, snapshotHash: projection.hashes.landing },
        crawlerFacts: {
          fresh: true,
          currentCount: 1,
          normalizedCount: 1,
          auditCount: 1,
          snapshotHash: hashJson(projection.evidence),
        },
      },
      maint: {
        factCount: 1,
        matchCounts: { MATCHED: 1, UNMATCHED: 0, AMBIGUOUS: 0, REJECTED: 0 },
        snapshotHash: projection.hashes.maint,
      },
      relation: {
        npcBuff: { count: 1, snapshotHash: projection.hashes.relationNpcBuff },
        npcShop: { count: 1, snapshotHash: projection.hashes.relationNpcShop },
        npcLoot: { count: 1, snapshotHash: projection.hashes.relationNpcLoot },
        snapshotHash: projection.hashes.relation,
      },
      local: {
        npcBuff: { count: 1, snapshotHash: projection.hashes.localNpcBuff },
        npcShop: { count: 1, snapshotHash: projection.hashes.localNpcShop },
        npcLoot: { count: 1, snapshotHash: projection.hashes.localNpcLoot },
        snapshotHash: projection.hashes.local,
      },
      runtime: { sampleCount: 3, snapshotHash: projection.hashes.local },
      api: {
        admin: { sampleCount: 3, snapshotHash: projection.hashes.local },
        public: { sampleCount: 3, snapshotHash: projection.hashes.local },
      },
      bridgeRetirement: { referenceCount: bridge.referenceCount, snapshotHash: bridgeHash },
    },
  });
  if (readiness.summary.status !== 'pass' || readiness.readinessLevel !== 'CODE_READY') {
    throw new Error(`NPC canonical T0 readiness is blocked: ${readiness.blockingReasons.join('; ')}`);
  }
  return {
    profile,
    status: 'passed',
    schema,
    counts: projection.counts,
    hashes: projection.hashes,
    transaction,
    readiness,
    bridge: {
      referenceCount: bridge.referenceCount,
      scannedFileCount: bridge.scannedFileCount,
      snapshotHash: bridgeHash,
    },
  };
}

function buildApplySql(databases, projection) {
  const local = databases.local;
  const maint = databases.maint;
  const relation = databases.relation;
  const shop = projection.relation.npcShop[0];
  const loot = projection.relation.npcLoot[0];
  const buff = projection.relation.npcBuff[0];
  return [
    insertRows(local, 'source_dataset_landings', [projection.baseLanding, projection.crawlerLanding]),
    insertRows(maint, 'maint_npc_crawler_facts', [projection.maintFact], INSERT_COLUMNS.maint_npc_crawler_facts),
    `INSERT INTO \`${local}\`.\`items\` (\`id\`, \`name\`, \`internal_name\`) VALUES (${FIXTURE_IDS.torch}, 'Torch', 'Torch'), (${FIXTURE_IDS.medusaHead}, 'Medusa Head', 'MedusaHead')`,
    `INSERT INTO \`${local}\`.\`npcs\` (\`id\`, \`source_id\`, \`internal_name\`, \`name\`) VALUES (${FIXTURE_IDS.medusa}, 477, 'Medusa', 'Medusa')`,
    `INSERT INTO \`${local}\`.\`buffs\` (\`id\`, \`source_id\`, \`internal_name\`, \`english_name\`) VALUES (${FIXTURE_IDS.stoned}, 156, 'Stoned', 'Stoned')`,
    insertRows(relation, 'item_source_facts', projection.relation.sourceFacts, INSERT_COLUMNS.item_source_facts),
    insertRows(relation, 'item_source_details', projection.relation.sourceDetails, INSERT_COLUMNS.item_source_details),
    insertRows(relation, 'item_npc_shop_relations', [shop], INSERT_COLUMNS.item_npc_shop_relations),
    insertRows(relation, 'item_npc_loot_relations', [loot], INSERT_COLUMNS.item_npc_loot_relations),
    insertRows(relation, 'npc_buff_relations', [buff], INSERT_COLUMNS.npc_buff_relations),
    `INSERT INTO \`${local}\`.\`npc_shop_entries\` (\`id\`, \`npc_id\`, \`item_id\`, \`source_item_id\`, \`price_text\`) VALUES (${FIXTURE_IDS.localShop}, ${FIXTURE_IDS.medusa}, ${FIXTURE_IDS.torch}, ${FIXTURE_IDS.torch}, ${sqlValue(shop.priceText)})`,
    `INSERT INTO \`${local}\`.\`npc_loot_entries\` (\`id\`, \`npc_id\`, \`item_id\`, \`source_item_id\`, \`drop_source_kind\`, \`quantity_text\`, \`chance_text\`) VALUES (${FIXTURE_IDS.localLoot}, ${FIXTURE_IDS.medusa}, ${FIXTURE_IDS.medusaHead}, ${FIXTURE_IDS.medusaHead}, 'npc_drop', ${sqlValue(loot.quantityText)}, ${sqlValue(loot.chanceText)})`,
    `INSERT INTO \`${local}\`.\`npc_buff_relations\` (\`id\`, \`npc_id\`, \`buff_id\`, \`buff_source_id\`, \`relation_type\`) VALUES (${FIXTURE_IDS.localBuff}, ${FIXTURE_IDS.medusa}, ${FIXTURE_IDS.stoned}, 156, ${sqlValue(buff.relationType)})`,
  ].join(';\n');
}

function buildRestoreSql(databases, projection) {
  const factKeys = projection.relation.sourceFacts.map((row) => sqlValue(row.recordKey)).join(', ');
  return [
    `DELETE FROM \`${databases.local}\`.\`npc_buff_relations\` WHERE \`id\` = ${FIXTURE_IDS.localBuff}`,
    `DELETE FROM \`${databases.local}\`.\`npc_shop_entries\` WHERE \`id\` = ${FIXTURE_IDS.localShop}`,
    `DELETE FROM \`${databases.local}\`.\`npc_loot_entries\` WHERE \`id\` = ${FIXTURE_IDS.localLoot}`,
    `DELETE FROM \`${databases.relation}\`.\`npc_buff_relations\` WHERE \`record_key\` = ${sqlValue(projection.relation.npcBuff[0].recordKey)}`,
    `DELETE FROM \`${databases.relation}\`.\`item_npc_shop_relations\` WHERE \`record_key\` = ${sqlValue(projection.relation.npcShop[0].recordKey)}`,
    `DELETE FROM \`${databases.relation}\`.\`item_npc_loot_relations\` WHERE \`record_key\` = ${sqlValue(projection.relation.npcLoot[0].recordKey)}`,
    `DELETE FROM \`${databases.relation}\`.\`item_source_details\` WHERE \`source_fact_key\` IN (${factKeys})`,
    `DELETE FROM \`${databases.relation}\`.\`item_source_facts\` WHERE \`record_key\` IN (${factKeys})`,
    `DELETE FROM \`${databases.maint}\`.\`maint_npc_crawler_facts\` WHERE \`record_key\` = ${sqlValue(projection.maintFact.recordKey)}`,
    `DELETE FROM \`${databases.local}\`.\`source_dataset_landings\` WHERE \`id\` IN (${FIXTURE_IDS.baseLanding}, ${FIXTURE_IDS.crawlerLanding})`,
    `DELETE FROM \`${databases.local}\`.\`buffs\` WHERE \`id\` = ${FIXTURE_IDS.stoned}`,
    `DELETE FROM \`${databases.local}\`.\`npcs\` WHERE \`id\` = ${FIXTURE_IDS.medusa}`,
    `DELETE FROM \`${databases.local}\`.\`items\` WHERE \`id\` IN (${FIXTURE_IDS.torch}, ${FIXTURE_IDS.medusaHead})`,
  ].join(';\n');
}

function countSql(label, databases) {
  const tables = [
    [databases.local, 'source_dataset_landings', "dataset_type = 'npcs_base_raw'"],
    [databases.local, 'source_dataset_landings', "dataset_type = 'npc_crawler_facts_raw'"],
    [databases.maint, 'maint_npc_crawler_facts'],
    [databases.relation, 'npc_buff_relations'],
    [databases.relation, 'item_npc_shop_relations'],
    [databases.relation, 'item_npc_loot_relations'],
    [databases.local, 'npc_buff_relations'],
    [databases.local, 'npc_shop_entries'],
    [databases.local, 'npc_loot_entries'],
  ];
  return `SELECT '${label}', ${tables.map(([database, table, predicate]) => (
    `(SELECT COUNT(*) FROM \`${database}\`.\`${table}\`${predicate ? ` WHERE ${predicate}` : ''})`
  )).join(', ')}`;
}

function insertRows(database, table, rows, selectedColumns = null) {
  if (!rows?.length) return '';
  const columns = selectedColumns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `INSERT INTO \`${database}\`.\`${table}\` (${columns.map((column) => `\`${snakeCase(column)}\``).join(', ')}) VALUES\n`
    + rows.map((row) => `(${columns.map((column) => sqlValue(row[column])).join(', ')})`).join(',\n');
}

function assertDatabaseSet(databases) {
  if (Object.keys(databases ?? {}).sort().join(',') !== 'local,maint,relation') {
    throw new Error('NPC canonical T0 requires three databases');
  }
  return Object.fromEntries(Object.entries(databases).map(([role, value]) => {
    const name = String(value ?? '');
    if (!/^terria_v1_automation_test_[a-z0-9_]+$/.test(name)) {
      throw new Error(`${role} database must be T0 isolated`);
    }
    return [role, name];
  }));
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(Date.parse(text))) {
    text = new Date(text).toISOString().slice(0, 19).replace('T', ' ');
  }
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function snakeCase(value) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function hashJson(value, prefix = true) {
  const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return prefix ? `sha256:${hash}` : hash;
}
