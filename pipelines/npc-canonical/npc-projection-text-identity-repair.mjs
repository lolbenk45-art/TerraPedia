#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

export const PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID =
  'canonical-npc-projection-text-identity-repair';
export const PROJECTION_TEXT_IDENTITY_REPAIR_PREVIEW_PATH =
  'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-projection-text-identity-repair-preview.json';
export const PROJECTION_TEXT_IDENTITY_REPAIR_INPUT_PATH =
  'reports/authorization/canonical/canonical-npc-projection-text-identity-repair.input.json';
export const PROJECTION_TEXT_IDENTITY_REPAIR_RESULT_PATH =
  'reports/authorization/canonical/canonical-npc-projection-text-identity-repair.result.json';

const DATABASE = 'terria_v1_relation';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const LANDING_CONTENT_HASH = 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05';
const LANDING_SOURCE_KEY = 'generated.npc_item_relations_bundle';
const SOURCE_PROVIDER = 'terraria.wiki.gg';
const SOURCE_MAINT_TABLE = 'maint_item_sources';
const WRITE_TARGET = 'relation.projection_npcs.loot_items_json';
const EXPECTED_COUNTS = Object.freeze({ relationLoot: 4, projectionNpcs: 4 });

// These are the four accepted relation rows from the local evidence bundle.
// Keeping the tuple in code prevents a broad or variant-lineage projection apply.
export const EXPECTED_TARGETS = Object.freeze([
  Object.freeze({
    npcInternalName: 'CursedSkull', itemInternalName: 'Nazar', projectionId: 34,
    relationRecordKey: '814335bd87bcb75ab728f4f56816634812689774307c691d6bf700e27c978167',
    sourceFactKey: 'd08b1810e482bfe390cb0af7f41324f9ba76d4a29623c3b3f2c02460b0986adf',
    sourceMaintRecordKey: '8f428dc573f23ae36f4db870196870b87492492fdc0c6dd9eb6616df80a4ccce',
    quantityText: '1', chanceText: '{{modes|1%|1.99%}}',
  }),
  Object.freeze({
    npcInternalName: 'Hornet', itemInternalName: 'Stinger', projectionId: 42,
    relationRecordKey: 'f99572374ca1e34a2b5b3ab2a050850d97ef8c34e6974002b965acb56778d2d5',
    sourceFactKey: 'a2ac1646917d5652ab8cb97ea10613464e650e639b31f7147eddee8393ca989f',
    sourceMaintRecordKey: '51bd6f7959e5fd842bebcab0e0031f561edbd18e909291ccab21997df61448fa',
    quantityText: '1', chanceText: '{{modes|66%|100%}}',
  }),
  Object.freeze({
    npcInternalName: 'JungleSlime', itemInternalName: 'SlimeStaff', projectionId: -10,
    relationRecordKey: '54b14274bcd308be48a8102729d3d23912050c9bbfbae5b22ee7338dd8e83b96',
    sourceFactKey: 'ebc542fa440e2bcece54fae42aa822a2351a0d504ee0c951faaac321240de2ce',
    sourceMaintRecordKey: 'be27b75160a81912934815362bb197aa4d7517500900f221684a1013a5a4caa3',
    quantityText: '1', chanceText: '{{modes|0.01%|0.014%}}',
  }),
  Object.freeze({
    npcInternalName: 'ManEater', itemInternalName: 'Vine', projectionId: 43,
    relationRecordKey: '7df5ffebb5b67f4efaad13527d5cebd00975d163cb83043c554054a9fd006f99',
    sourceFactKey: 'add97e869f75c0381d5f614250eaeedf436fae9443e35a850514a57111999da5',
    sourceMaintRecordKey: '1544f44b37e61110088bf3f6ac9cf2bb4d0e11e202793617d36ccbeb59b27ffe',
    quantityText: '1', chanceText: '{{modes|50%|100%}}',
  }),
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

export function hashProjectionTextIdentityScope({
  operationId = PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID,
  contractVersion = 1,
  expectedCounts = EXPECTED_COUNTS,
  targets = EXPECTED_TARGETS,
} = {}) {
  return hashJson({ operationId, contractVersion, expectedCounts, targets });
}

export const PROJECTION_TEXT_IDENTITY_REPAIR_SCOPE = hashProjectionTextIdentityScope();

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function hashFile(repoRoot, relativePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, relativePath))).digest('hex')}`;
}

function expectedTarget(key) {
  return EXPECTED_TARGETS.find((target) => target.relationRecordKey === key);
}

function assertExpectedTarget(row, label) {
  const expected = expectedTarget(row?.relationRecordKey);
  if (!expected) throw new Error(`${label} relation record key is outside accepted scope`);
  for (const field of ['npcInternalName', 'itemInternalName', 'sourceFactKey', 'sourceMaintRecordKey', 'quantityText', 'chanceText']) {
    if (String(row?.[field] ?? '') !== String(expected[field] ?? '')) {
      throw new Error(`${label} ${field} drifted`);
    }
  }
  return expected;
}

function assertExactCounts(value) {
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (Number(value?.[key]) !== expected) throw new Error(`projection identity ${key} count drifted`);
  }
}

function assertJsonArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

export function validateProjectionTextIdentityInput({ input, preview, previewSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID) {
    throw new Error('projection text identity repair input contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('projection text identity repair write/network flags are invalid');
  }
  if (preview?.schemaVersion !== 1 || preview.operationId !== PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID) {
    throw new Error('projection text identity preview contract is invalid');
  }
  if (input.scopeSha256 !== PROJECTION_TEXT_IDENTITY_REPAIR_SCOPE
      || preview?.scopeSha256 !== input.scopeSha256) {
    throw new Error('projection text identity repair scope hash drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256) || input.previewSha256 !== previewSha256) {
    throw new Error('projection text identity repair preview hash drifted');
  }
  assertExactCounts(input.expectedCounts);
  if (JSON.stringify(input.writeTargets) !== JSON.stringify([WRITE_TARGET])) {
    throw new Error('projection text identity repair write targets drifted');
  }
  if (preview?.applyAllowed !== false || preview?.databaseWrites !== false || preview?.externalRequests !== false) {
    throw new Error('projection text identity preview must remain read-only');
  }
  assertExactCounts(preview?.summary);
  if (preview?.summary?.sourceFactsTargeted !== 0
      || preview?.summary?.sourceDetailsTargeted !== 0
      || preview?.summary?.localRowsTargeted !== 0
      || !Array.isArray(preview?.rows)
      || preview.rows.length !== EXPECTED_TARGETS.length) {
    throw new Error('projection text identity preview counts drifted');
  }
  const seen = new Set();
  for (const row of preview.rows) {
    const expected = assertExpectedTarget(row, 'projection text identity row');
    if (row.sourceProvider !== SOURCE_PROVIDER
        || row.sourceMaintTable !== SOURCE_MAINT_TABLE
        || row.landingSourceKey !== LANDING_SOURCE_KEY
        || row.landingContentHash !== LANDING_CONTENT_HASH) {
      throw new Error('projection text identity row lineage drifted');
    }
    if (seen.has(row.relationRecordKey)) throw new Error('duplicate projection text identity target');
    seen.add(row.relationRecordKey);
    if (row.projectionId !== expected.projectionId || row.projectionInternalName !== expected.npcInternalName) {
      throw new Error('projection text identity projection target drifted');
    }
    assertJsonArray(row.beforeLootItems, 'projection text identity beforeLootItems');
    assertJsonArray(row.afterLootItems, 'projection text identity afterLootItems');
    if (row.beforeLootItems.length !== row.afterLootItems.length) {
      throw new Error('projection text identity array length drifted');
    }
    if (row.targetIndex < 0 || row.targetIndex >= row.beforeLootItems.length) {
      throw new Error('projection text identity target index drifted');
    }
    const before = row.beforeLootItems[row.targetIndex];
    const after = row.afterLootItems[row.targetIndex];
    if (before?.itemInternalName !== expected.itemInternalName
        || after?.itemInternalName !== expected.itemInternalName
        || after?.chanceText !== expected.chanceText
        || after?.quantityText !== expected.quantityText
        || after?.relationRecordKey !== expected.relationRecordKey
        || after?.sourceFactKey !== expected.sourceFactKey
        || after?.sourceProvider !== SOURCE_PROVIDER) {
      throw new Error('projection text identity replacement drifted');
    }
    const mutableFields = new Set([
      'chanceText', 'quantityText', 'sourceFactKey', 'relationRecordKey',
      'sourceProvider', 'sourcePage', 'sourceRevisionTimestamp',
    ]);
    for (const field of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
      if (!mutableFields.has(field) && JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field])) {
        throw new Error(`projection text identity changed immutable field: ${field}`);
      }
    }
  }
  if (seen.size !== EXPECTED_TARGETS.length) throw new Error('projection text identity target set drifted');
  return true;
}

export function buildProjectionTextIdentityMutationPlan(preview) {
  validateProjectionTextIdentityInput({
    input: {
      schemaVersion: 1,
      operationId: PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: PROJECTION_TEXT_IDENTITY_REPAIR_SCOPE,
      previewSha256: `sha256:${'0'.repeat(64)}`,
      expectedCounts: EXPECTED_COUNTS,
      writeTargets: [WRITE_TARGET],
    },
    preview,
    previewSha256: `sha256:${'0'.repeat(64)}`,
  });
  const rows = preview.rows.map((row) => ({
    relationRecordKey: required(row.relationRecordKey, 'projection text identity relation record key'),
    projectionId: row.projectionId,
    projectionInternalName: required(row.projectionInternalName, 'projection text identity projection internal name'),
    targetIndex: row.targetIndex,
    beforeLootItems: row.beforeLootItems,
    afterLootItems: row.afterLootItems,
  }));
  if (new Set(rows.map((row) => row.relationRecordKey)).size !== rows.length) {
    throw new Error('duplicate projection text identity relation target');
  }
  if (new Set(rows.map((row) => row.projectionId)).size !== rows.length) {
    throw new Error('duplicate projection text identity projection target');
  }
  return { rows, counts: { ...EXPECTED_COUNTS } };
}

function configFor(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
}

function placeholders(rows) { return rows.map(() => '?').join(', '); }

async function selectRelations(connection, keys, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT * FROM \`${DATABASE}\`.\`item_npc_loot_relations\` WHERE record_key IN (${placeholders(keys)})${lock}`,
    keys,
  );
  return rows;
}

async function selectProjections(connection, ids, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT * FROM \`${DATABASE}\`.\`projection_npcs\` WHERE id IN (${placeholders(ids)})${lock}`,
    ids,
  );
  return rows;
}

function parseLoot(value, label) {
  let parsed;
  try { parsed = JSON.parse(String(value ?? '[]')); } catch { throw new Error(`${label} is invalid JSON`); }
  assertJsonArray(parsed, label);
  return parsed;
}

function assertTargetRows(relations, projections, plan) {
  const relationMap = new Map(relations.map((row) => [row.record_key, row]));
  const projectionMap = new Map(projections.map((row) => [Number(row.id), row]));
  if (relations.length !== plan.rows.length || projections.length !== plan.rows.length) {
    throw new Error('projection text identity target set drifted');
  }
  for (const target of plan.rows) {
    const relation = relationMap.get(target.relationRecordKey);
    const projection = projectionMap.get(Number(target.projectionId));
    if (!relation || !active(relation)) throw new Error(`projection text identity relation missing: ${target.relationRecordKey}`);
    if (!projection || !active(projection) || projection.internal_name !== target.projectionInternalName) {
      throw new Error(`projection text identity projection missing: ${target.projectionInternalName}`);
    }
    const expected = expectedTarget(target.relationRecordKey);
    if (relation.source_fact_key !== expected.sourceFactKey
        || relation.item_internal_name !== expected.itemInternalName
        || relation.npc_internal_name !== expected.npcInternalName
        || relation.quantity_text !== expected.quantityText
        || relation.chance_text !== expected.chanceText
        || relation.source_provider !== SOURCE_PROVIDER
        || relation.source_maint_table !== SOURCE_MAINT_TABLE
        || relation.source_maint_record_key !== expected.sourceMaintRecordKey
        || relation.landing_source_key !== LANDING_SOURCE_KEY
        || relation.landing_content_hash !== LANDING_CONTENT_HASH) {
      throw new Error(`projection text identity relation lineage drifted: ${target.relationRecordKey}`);
    }
    const current = parseLoot(projection.loot_items_json, `projection ${target.projectionInternalName} loot_items_json`);
    if (hashJson(current) !== hashJson(target.beforeLootItems)) {
      throw new Error(`projection text identity projection content drifted: ${target.projectionInternalName}`);
    }
  }
  return { relationMap, projectionMap };
}

async function updateRows(connection, plan) {
  for (const target of plan.rows) {
    const [result] = await connection.execute(
      `UPDATE \`${DATABASE}\`.\`projection_npcs\`
       SET loot_items_json = ?
       WHERE id = ? AND internal_name = ? AND status = 1 AND deleted = 0`,
      [JSON.stringify(target.afterLootItems), target.projectionId, target.projectionInternalName],
    );
    if (Number(result?.affectedRows) !== 1) {
      throw new Error(`projection text identity affected row count drifted: ${target.projectionInternalName}`);
    }
  }
}

export async function runProjectionTextIdentityRepair({
  repoRoot = process.cwd(),
  inputPath = PROJECTION_TEXT_IDENTITY_REPAIR_INPUT_PATH,
  previewPath = PROJECTION_TEXT_IDENTITY_REPAIR_PREVIEW_PATH,
  apply = false,
  mysqlModule,
} = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const preview = JSON.parse(fs.readFileSync(path.resolve(repoRoot, previewPath), 'utf8'));
  const previewSha256 = hashFile(repoRoot, previewPath);
  validateProjectionTextIdentityInput({ input, preview, previewSha256 });
  const plan = buildProjectionTextIdentityMutationPlan(preview);
  if (!apply) {
    return {
      operationId: PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID,
      apply: false,
      scopeSha256: input.scopeSha256,
      counts: plan.counts,
      writeTargets: [WRITE_TARGET],
    };
  }

  const authorizedContext = loadAuthorizedOperationContext({ operationId: PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const beforeRelations = await selectRelations(connection, plan.rows.map((row) => row.relationRecordKey), { forUpdate: true });
      const beforeProjections = await selectProjections(connection, plan.rows.map((row) => row.projectionId), { forUpdate: true });
      assertTargetRows(beforeRelations, beforeProjections, plan);
      await updateRows(connection, plan);
      const afterProjections = await selectProjections(connection, plan.rows.map((row) => row.projectionId));
      for (const target of plan.rows) {
        const row = afterProjections.find((candidate) => Number(candidate.id) === Number(target.projectionId));
        if (!row || hashJson(parseLoot(row.loot_items_json, 'projection readback loot_items_json')) !== hashJson(target.afterLootItems)) {
          throw new Error(`projection text identity readback drifted: ${target.projectionInternalName}`);
        }
      }
      await connection.commit();
      const readback = {
        relationLoot: beforeRelations.length,
        projectionNpcs: afterProjections.length,
        activeTargets: afterProjections.filter(active).length,
      };
      return {
        schemaVersion: 1,
        resultKind: 'canonical_npc_projection_text_identity_repair_result',
        operationId: PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID,
        status: 'COMPLETED',
        transactionCommitted: true,
        scopeSha256: input.scopeSha256,
        authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash },
        affected: plan.counts,
        readback,
        preserved: { sourceFacts: true, sourceDetails: true, localRows: true },
        outputHash: hashJson({ input, affected: plan.counts, readback }),
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...parts] = String(arg).replace(/^--/, '').split('=');
    return [key, parts.join('=') || 'true'];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = parseArgs(process.argv.slice(2));
  runProjectionTextIdentityRepair({
    repoRoot: process.cwd(),
    inputPath: args.input ?? PROJECTION_TEXT_IDENTITY_REPAIR_INPUT_PATH,
    previewPath: args.preview ?? PROJECTION_TEXT_IDENTITY_REPAIR_PREVIEW_PATH,
    apply: args.apply === 'true',
  }).then((result) => {
    if (args.apply === 'true') {
      fs.writeFileSync(path.resolve(process.cwd(), args.output ?? PROJECTION_TEXT_IDENTITY_REPAIR_RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
