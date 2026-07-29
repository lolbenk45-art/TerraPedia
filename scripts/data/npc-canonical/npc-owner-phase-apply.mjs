#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { loadAuthorizedOperationContext } from '../automation/authorized-operation-context.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { listSourceDatasetLandingInputs } from '../landing/source-dataset-locator.mjs';
import {
  expandLandingEntries,
  prepareLandingRows,
  upsertLandingRow,
} from '../landing/import-source-dataset-landings.mjs';
import { buildNpcCrawlerFactRelationInputs } from '../relation/sync-maint-to-relation.mjs';
import { buildItemSourceRelations } from '../relation/item-source-relation-processor.mjs';
import { buildBuffRelationSyncPayload } from '../relation/sync-buffs-to-relation.mjs';
import { buildRelationCompatSyncSql } from '../relation/sync-relation-to-local-compat-tables.mjs';
import { buildNpcCrawlerFactMaintRow } from './npc-canonical-contract.mjs';
import {
  NPC_APPLY_OWNER_PHASES,
  buildNpcApplyOwnershipPreparation,
} from './npc-apply-ownership-preparation.mjs';

const INPUT_PATH = 'reports/authorization/canonical/canonical-npc-apply.input.json';
const LANDING_OPERATION_ID = 'canonical-npc-landing-apply';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const LANDING_DEFINITION = Object.freeze({
  phaseIndex: 0,
  operationId: LANDING_OPERATION_ID,
  capability: 'landing',
  ownershipKeys: Object.freeze([
    'local.source_dataset_landings.npcs_base',
    'local.source_dataset_landings.npc_crawler_facts',
  ]),
  requiredOperationIds: Object.freeze([]),
});
const OPERATION_DEFINITIONS = new Map([
  [LANDING_OPERATION_ID, LANDING_DEFINITION],
  ...NPC_APPLY_OWNER_PHASES.map((phase) => [phase.operationId, phase]),
]);

export async function buildNpcOwnerOperationPlan({
  repoRoot = process.cwd(),
  operationId,
  input = null,
  inputPath = INPUT_PATH,
  requiredResults = null,
} = {}) {
  const definition = requireDefinition(operationId);
  const inputEnvelope = input ?? readEnvelope(repoRoot, inputPath, 'canonical NPC apply input');
  const normalizedInput = normalizeInputEnvelope(inputEnvelope);
  const parsedInput = JSON.parse(normalizedInput.bytes.toString('utf8'));
  if (parsedInput.schemaVersion !== 1 || parsedInput.operationId !== 'canonical-npc-apply'
      || parsedInput.pairCount !== 25 || !Array.isArray(parsedInput.evidencePairs)
      || parsedInput.evidencePairs.length !== 25) {
    throw new Error('canonical NPC apply input must contain exactly 25 frozen evidence pairs');
  }
  if (inputEnvelope.payload != null
      && stableJson(inputEnvelope.payload) !== stableJson(parsedInput)) {
    throw new Error('canonical NPC apply input payload does not match its bytes');
  }
  if (input == null) {
    await buildNpcApplyOwnershipPreparation({ repoRoot, input: parsedInput });
  }
  const inputSummary = summarizeEnvelope({
    path: normalizedInput.path,
    bytes: normalizedInput.bytes,
  });
  const results = requiredResults ?? definition.requiredOperationIds.map((requiredOperationId) => readEnvelope(
    repoRoot,
    `reports/authorization/canonical/${requiredOperationId}.result.json`,
    `required predecessor ${requiredOperationId}`,
  ));
  if (!Array.isArray(results)) throw new TypeError('required predecessor results must be an array');
  const expected = [...definition.requiredOperationIds];
  const actual = results.map((candidate) => payloadOf(candidate)?.operationId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.find((requiredOperationId) => !actual.includes(requiredOperationId));
    throw new Error(`required predecessor result is missing or out of order: ${missing ?? expected.join(', ')}`);
  }
  const predecessorRecords = results.map((candidate) => {
    const payload = payloadOf(candidate);
    const envelope = normalizeResultEnvelope(candidate);
    return { payload, summary: { operationId: payload.operationId, ...summarizeEnvelope(envelope) } };
  });
  const predecessorSummaries = predecessorRecords.map(({ payload, summary }, index) => {
    validateCompletedResult(payload, requireDefinition(expected[index]), inputSummary.contentHash);
    validateRequiredResultBindings(payload, requireDefinition(expected[index]), predecessorRecords);
    return summary;
  });
  return {
    schemaVersion: 1,
    operationId: definition.operationId,
    phaseIndex: definition.phaseIndex,
    capability: definition.capability,
    input: { ...inputSummary, payload: parsedInput },
    requiredResults: predecessorSummaries,
    ownershipKeys: [...definition.ownershipKeys],
  };
}

export async function executeNpcOwnerOperation({
  plan,
  adapter,
  completedAt = new Date().toISOString(),
} = {}) {
  const definition = requireDefinition(plan?.operationId);
  if (JSON.stringify(plan?.ownershipKeys) !== JSON.stringify(definition.ownershipKeys)) {
    throw new Error('NPC owner operation ownership keys drifted');
  }
  for (const method of ['begin', 'apply', 'verify', 'commit', 'rollback']) {
    if (typeof adapter?.[method] !== 'function') throw new TypeError(`NPC owner adapter ${method} is required`);
  }
  let began = false;
  try {
    await adapter.begin();
    began = true;
    const rowCounts = await adapter.apply({
      operationId: plan.operationId,
      capability: plan.capability,
      input: plan.input,
      requiredResults: plan.requiredResults,
      ownershipKeys: [...plan.ownershipKeys],
    });
    validateRowCounts(rowCounts, plan.ownershipKeys);
    const verification = await adapter.verify({
      operationId: plan.operationId,
      ownershipKeys: [...plan.ownershipKeys],
      rowCounts,
    });
    validateRowCounts(verification?.rowCounts, plan.ownershipKeys);
    if (stableJson(verification.rowCounts) !== stableJson(rowCounts)) {
      throw new Error('NPC owner operation readback counts do not match writes');
    }
    if (!HASH_PATTERN.test(verification?.outputHash ?? '')) {
      throw new Error('NPC owner operation output hash must be SHA-256');
    }
    await adapter.commit();
    return {
      schemaVersion: 1,
      resultKind: 'canonical_npc_owner_operation_result',
      operationId: plan.operationId,
      phaseIndex: plan.phaseIndex,
      capability: plan.capability,
      status: 'COMPLETED',
      input: withoutPayload(plan.input),
      requiredResults: plan.requiredResults.map((entry) => ({ ...entry })),
      ownershipKeys: [...plan.ownershipKeys],
      transactionCommitted: true,
      rowCounts: { ...rowCounts },
      outputHash: verification.outputHash,
      completedAt: requireTimestamp(completedAt, 'completedAt'),
    };
  } catch (error) {
    if (began) await adapter.rollback().catch(() => {});
    throw error;
  }
}

export function buildCanonicalNpcApplyCompletion({
  input,
  results,
  completedAt = new Date().toISOString(),
} = {}) {
  const normalizedInput = normalizeInputEnvelope(input);
  const inputHash = hashBytes(normalizedInput.bytes);
  const expectedIds = [LANDING_OPERATION_ID, ...NPC_APPLY_OWNER_PHASES.map((phase) => phase.operationId)];
  if (!Array.isArray(results)) throw new TypeError('canonical NPC apply results must be an array');
  const actualIds = results.map((candidate) => payloadOf(candidate)?.operationId);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    const missing = expectedIds.find((operationId) => !actualIds.includes(operationId));
    throw new Error(`canonical NPC apply result is missing or out of order: ${missing ?? expectedIds.join(', ')}`);
  }
  const resultRecords = results.map((candidate) => {
    const payload = payloadOf(candidate);
    const envelope = normalizeResultEnvelope(candidate);
    return { payload, summary: { operationId: payload.operationId, ...summarizeEnvelope(envelope) } };
  });
  const summaries = resultRecords.map(({ payload, summary }, index) => {
    validateCompletedResult(payload, requireDefinition(expectedIds[index]), inputHash);
    validateRequiredResultBindings(payload, requireDefinition(expectedIds[index]), resultRecords);
    return summary;
  });
  const completionBase = {
    schemaVersion: 1,
    resultKind: 'canonical_npc_apply_completion',
    operationId: 'canonical-npc-apply',
    status: 'COMPLETED',
    inputHash,
    landingResultHash: summaries[0].contentHash,
    phaseResultHashes: summaries.slice(1).map((entry) => entry.contentHash),
    operationResults: summaries,
    completedAt: requireTimestamp(completedAt, 'completedAt'),
  };
  return { ...completionBase, completionHash: hashJson(completionBase) };
}

export async function writeCanonicalNpcApplyResult({ repoRoot = process.cwd(), outputPath, result } = {}) {
  const validOwnerResult = result?.resultKind === 'canonical_npc_owner_operation_result'
    && HASH_PATTERN.test(result?.outputHash ?? '');
  const validCompletion = result?.resultKind === 'canonical_npc_apply_completion'
    && HASH_PATTERN.test(result?.completionHash ?? '');
  if (result?.status !== 'COMPLETED' || (!validOwnerResult && !validCompletion)) {
    throw new Error('a completed canonical NPC owner result is required');
  }
  const root = path.resolve(repoRoot);
  const relative = requireRelativePath(outputPath, 'outputPath');
  const output = path.resolve(root, relative);
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error('outputPath must stay inside repoRoot');
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await fs.promises.rename(temporary, output);
    await fs.promises.chmod(output, 0o600);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

export function createCanonicalNpcOwnerMysqlAdapter({
  repoRoot = process.cwd(),
  plan,
  env = process.env,
  connectionFactory = null,
} = {}) {
  requireDefinition(plan?.operationId);
  const databases = plan?.input?.payload?.databases;
  if (JSON.stringify(databases) !== JSON.stringify({
    local: 'terria_v1_local',
    maint: 'terria_v1_maint',
    relation: 'terria_v1_relation',
  })) {
    throw new Error('formal NPC owner apply requires the exact local, maint, and relation databases');
  }
  const root = path.resolve(repoRoot);
  let connection = null;
  let applied = null;
  const openConnection = connectionFactory ?? (async () => {
    const config = loadLocalStackConfig(root);
    return loadMysqlModule({ repoRoot: root }).createConnection({
      host: env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
      port: Number(env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
      user: env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
      password: env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
      database: databases.local,
    });
  });
  const close = async () => {
    if (connection && typeof connection.end === 'function') await connection.end();
    connection = null;
  };
  return {
    begin: async () => {
      if (connection) throw new Error('NPC owner transaction is already open');
      connection = await openConnection();
      await connection.beginTransaction();
    },
    apply: async ({ operationId, ownershipKeys }) => {
      if (!connection) throw new Error('NPC owner transaction is not open');
      applied = await applyOwnedOperation({
        connection,
        repoRoot: root,
        operationId,
        input: plan.input.payload,
        ownershipKeys,
        databases,
      });
      return applied.rowCounts;
    },
    verify: async ({ operationId, ownershipKeys }) => {
      if (!connection || !applied) throw new Error('NPC owner operation has not been applied');
      const rowCounts = await readOwnedOperationCounts({
        connection,
        operationId,
        ownershipKeys,
        databases,
        recordKeysByOwnershipKey: applied.recordKeysByOwnershipKey,
      });
      return {
        rowCounts,
        outputHash: hashJson({
          operationId,
          inputHash: plan.input.contentHash,
          ownershipKeys,
          rowCounts,
          recordKeysByOwnershipKey: applied.recordKeysByOwnershipKey,
        }),
      };
    },
    commit: async () => {
      if (!connection) throw new Error('NPC owner transaction is not open');
      await connection.commit();
      await close();
    },
    rollback: async () => {
      if (!connection) return;
      try {
        await connection.rollback();
      } finally {
        await close();
      }
    },
  };
}

async function applyOwnedOperation({ connection, repoRoot, operationId, input, ownershipKeys, databases }) {
  if (operationId === LANDING_OPERATION_ID) {
    return applyLandingOperation({ connection, repoRoot, input, ownershipKeys });
  }
  if (operationId === 'canonical-npc-facts-maint-apply') {
    return applyMaintFactsOperation({ connection, input, ownershipKeys, databases });
  }
  if (operationId === 'canonical-npc-item-relations-apply') {
    return applyItemRelationsOperation({ connection, input, ownershipKeys, databases });
  }
  if (operationId === 'canonical-npc-buff-relations-apply') {
    return applyBuffRelationsOperation({ connection, input, ownershipKeys, databases });
  }
  return applyLocalProjectionOperation({ connection, operationId, ownershipKeys, databases });
}

async function applyLandingOperation({ connection, repoRoot, input, ownershipKeys }) {
  const expectedLocators = new Set(input.evidencePairs.map((pair) => `repo://${pair.normalized.path}`));
  const located = await listSourceDatasetLandingInputs({
    repoRoot,
    datasets: ['npcs_base_raw', 'npc_crawler_facts_raw'],
  });
  const selected = located.filter((entry) => (
    entry.datasetType === 'npcs_base_raw'
      || expectedLocators.has(entry.sourceLocator)
  ));
  const baseCount = selected.filter((entry) => entry.datasetType === 'npcs_base_raw').length;
  const crawlerCount = selected.filter((entry) => entry.datasetType === 'npc_crawler_facts_raw').length;
  if (baseCount !== 1 || crawlerCount !== input.pairCount) {
    throw new Error(`frozen NPC landing selection must contain 1 base and ${input.pairCount} crawler rows`);
  }
  const rows = await prepareLandingRows(await expandLandingEntries(selected));
  const summary = { rows: { inserted: 0, updated: 0, replaced: 0, unchanged: 0 } };
  for (const row of rows) await upsertLandingRow(connection, row, summary);
  return {
    rowCounts: {
      [ownershipKeys[0]]: baseCount,
      [ownershipKeys[1]]: crawlerCount,
    },
    recordKeysByOwnershipKey: {
      [ownershipKeys[0]]: rows.filter((row) => row.datasetType === 'npcs_base_raw')
        .map((row) => [row.datasetType, row.sourceKey, row.sourcePage, row.contentHash]),
      [ownershipKeys[1]]: rows.filter((row) => row.datasetType === 'npc_crawler_facts_raw')
        .map((row) => [row.datasetType, row.sourceKey, row.sourcePage, row.contentHash]),
    },
  };
}

async function applyMaintFactsOperation({ connection, input, ownershipKeys, databases }) {
  const [landingRows] = await connection.query(
    `SELECT * FROM \`${databases.local}\`.\`source_dataset_landings\`
     WHERE dataset_type = 'npc_crawler_facts_raw' AND is_current = 1`,
  );
  const expectedHashes = new Set(input.evidencePairs.map((pair) => stripHash(pair.normalizedContentHash)));
  const selected = landingRows.filter((row) => {
    const payload = parseJson(row.payload_json);
    return expectedHashes.has(hashJsonBare(payload.normalized));
  });
  if (selected.length !== input.pairCount) throw new Error('formal NPC maint phase cannot resolve every frozen landing');
  const [maintNpcs] = await connection.query(
    `SELECT * FROM \`${databases.maint}\`.\`maint_npcs\` WHERE status = 1 AND deleted = 0`,
  );
  const rows = selected.map((landing) => {
    const payload = parseJson(landing.payload_json);
    return buildNpcCrawlerFactMaintRow({
      landingRow: {
        ...landing,
        normalized_content_hash: hashJsonBare(payload.normalized),
        audit_content_hash: hashJsonBare(payload.audit),
      },
      maintNpcRows: maintNpcs,
    });
  });
  await upsertRows(connection, databases.maint, 'maint_npc_crawler_facts', rows);
  return {
    rowCounts: { [ownershipKeys[0]]: rows.length },
    recordKeysByOwnershipKey: { [ownershipKeys[0]]: rows.map((row) => row.recordKey).sort() },
  };
}

async function loadFrozenMaintFacts(connection, input, maintDatabase) {
  const hashes = input.evidencePairs.map((pair) => stripHash(pair.normalizedContentHash));
  const placeholders = hashes.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT * FROM \`${maintDatabase}\`.\`maint_npc_crawler_facts\`
     WHERE normalized_content_hash IN (${placeholders}) AND status = 1 AND deleted = 0`,
    hashes,
  );
  if (rows.length !== input.pairCount) throw new Error('formal NPC owner phase cannot resolve every frozen maint fact');
  return rows;
}

async function applyItemRelationsOperation({ connection, input, ownershipKeys, databases }) {
  const facts = await loadFrozenMaintFacts(connection, input, databases.maint);
  const [[maintItems], [maintNpcs]] = await Promise.all([
    connection.query(`SELECT * FROM \`${databases.maint}\`.\`maint_items\` WHERE status = 1 AND deleted = 0`),
    connection.query(`SELECT * FROM \`${databases.maint}\`.\`maint_npcs\` WHERE status = 1 AND deleted = 0`),
  ]);
  const relationInputs = buildNpcCrawlerFactRelationInputs({ maintNpcCrawlerFactRows: facts });
  const projection = buildItemSourceRelations({
    itemSourceRows: relationInputs.itemSourceRows,
    itemIndex: buildLookupIndex(maintItems),
    npcIndex: buildLookupIndex(maintNpcs),
  });
  const groups = [
    ['item_source_facts', projection.sourceFacts],
    ['item_source_details', projection.sourceDetails],
    ['item_npc_shop_relations', projection.npcShopRelations],
    ['item_npc_loot_relations', projection.npcLootRelations],
  ];
  for (const [table, rows] of groups) await upsertRows(connection, databases.relation, table, rows);
  return {
    rowCounts: Object.fromEntries(ownershipKeys.map((key, index) => [key, groups[index][1].length])),
    recordKeysByOwnershipKey: Object.fromEntries(ownershipKeys.map((key, index) => [
      key,
      groups[index][1].map((row) => row.recordKey).sort(),
    ])),
  };
}

async function applyBuffRelationsOperation({ connection, input, ownershipKeys, databases }) {
  const facts = await loadFrozenMaintFacts(connection, input, databases.maint);
  const [[maintBuffs], [maintNpcs]] = await Promise.all([
    connection.query(`SELECT * FROM \`${databases.maint}\`.\`maint_buffs\` WHERE status = 1 AND deleted = 0`),
    connection.query(`SELECT * FROM \`${databases.maint}\`.\`maint_npcs\` WHERE status = 1 AND deleted = 0`),
  ]);
  const relationInputs = buildNpcCrawlerFactRelationInputs({
    maintNpcCrawlerFactRows: facts,
    maintBuffRows: maintBuffs,
  });
  const rows = buildBuffRelationSyncPayload({
    maintBuffRows: relationInputs.maintBuffRows,
    maintNpcRows: maintNpcs,
  }).npcBuffRelations;
  await upsertRows(connection, databases.relation, 'npc_buff_relations', rows);
  return {
    rowCounts: { [ownershipKeys[0]]: rows.length },
    recordKeysByOwnershipKey: { [ownershipKeys[0]]: rows.map((row) => row.recordKey).sort() },
  };
}

async function applyLocalProjectionOperation({ connection, operationId, ownershipKeys, databases }) {
  const sql = buildRelationCompatSyncSql({
    localDatabase: databases.local,
    relationDatabase: databases.relation,
  });
  if (operationId === 'canonical-npc-town-shop-projection-apply') {
    const conditions = await firstCount(connection, sql.npc_shop_conditions.countSql);
    const shops = await firstCount(connection, sql.npc_shop_entries.countSql);
    await connection.query(sql.npc_shop_conditions.deleteSql);
    await connection.query(sql.npc_shop_entries.deleteSql);
    await connection.query(sql.npc_shop_entries.insertSql);
    await connection.query(sql.npc_shop_conditions.insertSql);
    return {
      rowCounts: { [ownershipKeys[0]]: shops, [ownershipKeys[1]]: conditions },
      recordKeysByOwnershipKey: { [ownershipKeys[0]]: [], [ownershipKeys[1]]: [] },
    };
  }
  if (operationId === 'canonical-npc-buff-projection-apply') {
    const count = await firstCount(connection, sql.npc_buff_relations.countSql);
    await connection.query(sql.npc_buff_relations.deleteSql);
    await connection.query(sql.npc_buff_relations.insertSql);
    return { rowCounts: { [ownershipKeys[0]]: count }, recordKeysByOwnershipKey: { [ownershipKeys[0]]: [] } };
  }
  const boss = operationId === 'canonical-npc-boss-loot-projection-apply';
  const predicate = boss ? 'COALESCE(n.is_boss, 0) = 1' : 'COALESCE(n.is_boss, 0) <> 1';
  const countSql = `${sql.npc_loot_entries.countSql}\n  AND ${predicate}`;
  const insertSql = `${sql.npc_loot_entries.insertSql}\n  AND ${predicate}`;
  const deleteSql = `DELETE le FROM \`${databases.local}\`.\`npc_loot_entries\` le
INNER JOIN \`${databases.local}\`.\`npcs\` n ON n.id = le.npc_id
WHERE (le.drop_source_kind IS NULL OR le.drop_source_kind = 'npc_drop') AND ${predicate}`;
  const count = await firstCount(connection, countSql);
  await connection.query(deleteSql);
  await connection.query(insertSql);
  return { rowCounts: { [ownershipKeys[0]]: count }, recordKeysByOwnershipKey: { [ownershipKeys[0]]: [] } };
}

async function readOwnedOperationCounts({
  connection,
  operationId,
  ownershipKeys,
  databases,
  recordKeysByOwnershipKey,
}) {
  if (operationId === LANDING_OPERATION_ID) {
    const counts = {};
    for (const ownershipKey of ownershipKeys) {
      let count = 0;
      for (const [datasetType, sourceKey, sourcePage, contentHash] of recordKeysByOwnershipKey[ownershipKey]) {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) AS total FROM \`${databases.local}\`.\`source_dataset_landings\`
           WHERE dataset_type = ? AND source_key = ? AND source_page <=> ?
             AND content_hash = ? AND is_current = 1`,
          [datasetType, sourceKey, sourcePage, contentHash],
        );
        count += Number(rows[0]?.total ?? 0);
      }
      counts[ownershipKey] = count;
    }
    return counts;
  }
  if (operationId === 'canonical-npc-facts-maint-apply') {
    return {
      [ownershipKeys[0]]: await countRecordKeys(
        connection,
        databases.maint,
        'maint_npc_crawler_facts',
        recordKeysByOwnershipKey[ownershipKeys[0]],
      ),
    };
  }
  if (operationId === 'canonical-npc-item-relations-apply') {
    const tables = ['item_source_facts', 'item_source_details', 'item_npc_shop_relations', 'item_npc_loot_relations'];
    return Object.fromEntries(await Promise.all(ownershipKeys.map(async (ownershipKey, index) => [
      ownershipKey,
      await countRecordKeys(
        connection,
        databases.relation,
        tables[index],
        recordKeysByOwnershipKey[ownershipKey],
      ),
    ])));
  }
  if (operationId === 'canonical-npc-buff-relations-apply') {
    return {
      [ownershipKeys[0]]: await countRecordKeys(
        connection,
        databases.relation,
        'npc_buff_relations',
        recordKeysByOwnershipKey[ownershipKeys[0]],
      ),
    };
  }
  if (operationId === 'canonical-npc-town-shop-projection-apply') {
    return {
      [ownershipKeys[0]]: await firstCount(connection, `SELECT COUNT(*) AS total FROM \`${databases.local}\`.\`npc_shop_entries\``),
      [ownershipKeys[1]]: await firstCount(connection, `SELECT COUNT(*) AS total FROM \`${databases.local}\`.\`npc_shop_conditions\``),
    };
  }
  if (operationId === 'canonical-npc-buff-projection-apply') {
    return {
      [ownershipKeys[0]]: await firstCount(connection, `SELECT COUNT(*) AS total FROM \`${databases.local}\`.\`npc_buff_relations\``),
    };
  }
  const boss = operationId === 'canonical-npc-boss-loot-projection-apply';
  const predicate = boss ? 'COALESCE(n.is_boss, 0) = 1' : 'COALESCE(n.is_boss, 0) <> 1';
  return {
    [ownershipKeys[0]]: await firstCount(connection, `SELECT COUNT(*) AS total
FROM \`${databases.local}\`.\`npc_loot_entries\` le
INNER JOIN \`${databases.local}\`.\`npcs\` n ON n.id = le.npc_id
WHERE (le.drop_source_kind IS NULL OR le.drop_source_kind = 'npc_drop') AND ${predicate}`),
  };
}

async function countRecordKeys(connection, database, table, recordKeys) {
  if (!Array.isArray(recordKeys) || recordKeys.length === 0) return 0;
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total FROM \`${database}\`.\`${table}\`
     WHERE record_key IN (${recordKeys.map(() => '?').join(', ')})`,
    recordKeys,
  );
  return Number(rows[0]?.total ?? 0);
}

async function upsertRows(connection, database, table, rows) {
  for (const row of rows) {
    const mapped = Object.fromEntries(Object.entries(row)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), value]));
    const columns = Object.keys(mapped);
    const updates = columns.filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
    await connection.execute(
      `INSERT INTO \`${database}\`.\`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updates || '`record_key` = VALUES(`record_key`)'}`,
      columns.map((column) => mapped[column]),
    );
  }
}

function buildLookupIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    for (const value of [row.internal_name, row.internalName, row.english_name, row.name, row.name_zh]) {
      const key = String(value ?? '').trim().toLowerCase();
      if (key && !index.has(key)) index.set(key, row);
    }
  }
  return index;
}

async function firstCount(connection, sql) {
  const [rows] = await connection.query(sql);
  return Number(rows[0]?.total ?? rows[0]?.count ?? 0);
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function stripHash(value) {
  return String(value ?? '').replace(/^sha256:/, '');
}

function hashJsonBare(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((argument) => {
    const [key, ...values] = String(argument).replace(/^--/, '').split('=');
    return [key, values.length === 0 ? 'true' : values.join('=')];
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const operationId = String(args['operation-id'] ?? '');
  if (args.apply !== 'true') throw new Error('canonical NPC owner operation requires --apply=true');
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  loadAuthorizedOperationContext({ operationId });
  const inputPath = args.input ?? INPUT_PATH;
  const plan = await buildNpcOwnerOperationPlan({ repoRoot, operationId, inputPath });
  const result = await executeNpcOwnerOperation({
    plan,
    adapter: createCanonicalNpcOwnerMysqlAdapter({ repoRoot, plan }),
  });
  const outputPath = args.output
    ?? `reports/authorization/canonical/${operationId}.result.json`;
  await writeCanonicalNpcApplyResult({ repoRoot, outputPath, result });
  if (operationId === 'canonical-npc-boss-loot-projection-apply') {
    const input = readEnvelope(repoRoot, inputPath, 'canonical NPC apply input');
    const results = [LANDING_OPERATION_ID, ...NPC_APPLY_OWNER_PHASES.map((phase) => phase.operationId)]
      .map((resultOperationId) => readEnvelope(
        repoRoot,
        resultOperationId === operationId
          ? outputPath
          : `reports/authorization/canonical/${resultOperationId}.result.json`,
        `canonical NPC owner result ${resultOperationId}`,
      ));
    const completion = buildCanonicalNpcApplyCompletion({ input, results });
    await writeCanonicalNpcApplyResult({
      repoRoot,
      outputPath: args['completion-output']
        ?? 'reports/authorization/canonical/canonical-npc-apply.completion.json',
      result: completion,
    });
  }
  process.stdout.write(`${JSON.stringify({ operationId, status: result.status, outputPath })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`canonical NPC owner operation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

function requireDefinition(operationId) {
  const definition = OPERATION_DEFINITIONS.get(String(operationId ?? ''));
  if (!definition) throw new Error(`unsupported canonical NPC owner operation: ${operationId ?? ''}`);
  return definition;
}

function readEnvelope(repoRoot, relativePath, label) {
  const root = path.resolve(repoRoot);
  const relative = requireRelativePath(relativePath, `${label} path`);
  const fullPath = path.join(root, relative);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`${label} is missing: ${relative}`);
  }
  const bytes = fs.readFileSync(fullPath);
  return { path: relative, bytes, payload: JSON.parse(bytes.toString('utf8')) };
}

function normalizeInputEnvelope(input) {
  if (!input || typeof input !== 'object') throw new Error('canonical NPC apply input envelope is required');
  const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes ?? '');
  if (bytes.length === 0) throw new Error('canonical NPC apply input bytes are required');
  return { path: requireRelativePath(input.path ?? INPUT_PATH, 'input path'), bytes };
}

function normalizeResultEnvelope(candidate) {
  if (candidate?.payload && candidate?.bytes) {
    return {
      path: candidate.path ?? `reports/authorization/canonical/${candidate.payload.operationId}.result.json`,
      bytes: Buffer.isBuffer(candidate.bytes) ? candidate.bytes : Buffer.from(candidate.bytes),
    };
  }
  const payload = payloadOf(candidate);
  return {
    path: `reports/authorization/canonical/${payload.operationId}.result.json`,
    bytes: Buffer.from(`${JSON.stringify(payload)}\n`),
  };
}

function payloadOf(candidate) {
  return candidate?.payload ?? candidate;
}

function validateCompletedResult(result, definition, inputHash) {
  if (result?.schemaVersion !== 1 || result?.resultKind !== 'canonical_npc_owner_operation_result'
      || result?.operationId !== definition.operationId || result?.phaseIndex !== definition.phaseIndex
      || result?.capability !== definition.capability || result?.status !== 'COMPLETED'
      || result?.transactionCommitted !== true) {
    throw new Error(`committed predecessor result is invalid: ${definition.operationId}`);
  }
  if (result.input?.contentHash !== inputHash) {
    throw new Error(`predecessor input hash mismatch: ${definition.operationId}`);
  }
  if (JSON.stringify(result.ownershipKeys) !== JSON.stringify(definition.ownershipKeys)) {
    throw new Error(`predecessor ownership keys drifted: ${definition.operationId}`);
  }
  validateRowCounts(result.rowCounts, definition.ownershipKeys);
  if (!HASH_PATTERN.test(result.outputHash ?? '')) {
    throw new Error(`predecessor output hash is invalid: ${definition.operationId}`);
  }
}

function validateRequiredResultBindings(result, definition, records) {
  const bindings = Array.isArray(result.requiredResults) ? result.requiredResults : [];
  if (JSON.stringify(bindings.map((entry) => entry?.operationId))
      !== JSON.stringify(definition.requiredOperationIds)) {
    throw new Error(`predecessor result bindings drifted: ${definition.operationId}`);
  }
  for (const binding of bindings) {
    const actual = records.find((record) => record.payload.operationId === binding.operationId)?.summary;
    if (!actual || binding.path !== actual.path || binding.contentHash !== actual.contentHash
        || Number(binding.sizeBytes) !== actual.sizeBytes) {
      throw new Error(`predecessor result hash mismatch: ${binding.operationId}`);
    }
  }
}

function validateRowCounts(rowCounts, ownershipKeys) {
  if (!rowCounts || typeof rowCounts !== 'object' || Array.isArray(rowCounts)
      || JSON.stringify(Object.keys(rowCounts)) !== JSON.stringify(ownershipKeys)
      || Object.values(rowCounts).some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('NPC owner operation row counts must match exact ownership keys');
  }
}

function summarizeEnvelope({ path: relativePath, bytes }) {
  const normalized = requireRelativePath(relativePath, 'artifact path');
  return { path: normalized, contentHash: hashBytes(bytes), sizeBytes: bytes.length };
}

function withoutPayload(input) {
  const { payload, ...summary } = input;
  return summary;
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function hashJson(value) {
  return hashBytes(Buffer.from(stableJson(value)));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requireRelativePath(value, label) {
  const text = String(value ?? '').trim();
  if (!text || text.includes('\\') || path.posix.isAbsolute(text) || path.posix.normalize(text) !== text
      || text.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  return text;
}

function requireTimestamp(value, label) {
  const text = String(value ?? '').trim();
  if (!text || !Number.isFinite(Date.parse(text))) throw new Error(`${label} must be a valid timestamp`);
  return text;
}
