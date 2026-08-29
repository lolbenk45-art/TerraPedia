#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadAuthorizedOperationContext } from '../automation/authorized-operation-context.mjs';
import { hashOrderedBundleBytes } from '../automation/build-canonical-cutover-authorization.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { runSync } from './sync-maint-to-relation.mjs';

export const ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID = 'canonical-item-source-relation-recovery-from-maint';
export const ITEM_SOURCE_RELATION_RECOVERY_ALLOW_LIST = Object.freeze([
  'relation.item_source_facts',
  'relation.item_source_details',
  'relation.item_npc_shop_relations',
  'relation.item_npc_loot_relations',
  'relation.item_npc_relation_audits',
]);

const TABLES = Object.freeze([
  ['itemSourceFacts', 'item_source_facts'],
  ['itemSourceDetails', 'item_source_details'],
  ['itemNpcShopRelations', 'item_npc_shop_relations'],
  ['itemNpcLootRelations', 'item_npc_loot_relations'],
  ['itemNpcRelationAudits', 'item_npc_relation_audits'],
]);

const CHILD_TABLES = Object.freeze([
  'item_npc_relation_audits',
  'item_source_details',
  'item_npc_shop_relations',
  'item_npc_loot_relations',
  'item_source_facts',
]);

export function buildItemSourceRelationRecoveryPlan({
  sourceBundleSha256,
  sourceFactCount,
  sourceDetailCount,
  shopRelationCount,
  lootRelationCount,
} = {}) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(sourceBundleSha256 ?? ''))) {
    throw new Error('source relation recovery bundle hash must be sha256');
  }
  const counts = {
    itemSourceFacts: Number(sourceFactCount),
    itemSourceDetails: Number(sourceDetailCount),
    itemNpcShopRelations: Number(shopRelationCount),
    itemNpcLootRelations: Number(lootRelationCount),
  };
  for (const [label, count] of Object.entries(counts)) {
    if (!Number.isInteger(count) || count < 0) throw new Error(`${label} count must be a non-negative integer`);
  }
  if (counts.itemSourceDetails !== counts.itemSourceFacts) {
    throw new Error('source facts/details count mismatch');
  }
  return {
    operationId: ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID,
    sourceBundleSha256,
    counts,
    allowList: [...ITEM_SOURCE_RELATION_RECOVERY_ALLOW_LIST],
    databaseWrites: true,
    networkAccess: false,
  };
}

export function buildRelationSourceRecoveryStatements() {
  return [
    ...CHILD_TABLES.map((table) => `DELETE FROM \`${table}\``),
  ];
}

function sha256Bytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function snakeCase(value) {
  return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function mapRowToDb(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const column = snakeCase(key);
    return [column, column.endsWith('_timestamp') ? toMysqlDatetime(value) : value];
  }));
}

function toMysqlDatetime(value) {
  if (value == null || value === '') return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value))) return String(value);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`invalid source revision timestamp: ${value}`);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function assertRowTrace(row, label) {
  if (!row || typeof row !== 'object') throw new Error(`${label} row must be an object`);
  if (!row.recordKey) throw new Error(`${label} row recordKey is required`);
  if (!['maint_item_sources', 'maint_npc_crawler_facts'].includes(row.sourceMaintTable)) {
    throw new Error(`${label} row has an invalid sourceMaintTable`);
  }
  if (!row.sourceMaintRecordKey) throw new Error(`${label} row sourceMaintRecordKey is required`);
}

function normalizeProposal(payload) {
  const rows = {};
  for (const [key] of TABLES) {
    rows[key] = Array.isArray(payload?.rows?.[key]) ? payload.rows[key] : [];
  }
  for (const [key] of TABLES) {
    for (const row of rows[key]) {
      if (key === 'itemNpcRelationAudits') {
        if (!row.auditKey || !row.sourceMaintTable || !row.sourceMaintRecordKey) {
          throw new Error(`${key} row audit/source trace is required`);
        }
      } else {
        assertRowTrace(row, key);
      }
    }
  }
  const factKeys = new Set(rows.itemSourceFacts.map((row) => row.recordKey));
  for (const key of ['itemSourceDetails', 'itemNpcShopRelations', 'itemNpcLootRelations']) {
    for (const row of rows[key]) {
      const factKey = key === 'itemSourceDetails' ? row.sourceFactKey ?? row.sourceSourceFactKey : row.sourceFactKey;
      if (!factKeys.has(factKey)) throw new Error(`${key} row references a missing source fact`);
    }
  }
  return rows;
}

async function insertRows(connection, tableName, rows) {
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns.filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
    await connection.execute(
      `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      columns.map((column) => mapped[column]),
    );
  }
}

export async function runItemSourceRelationRecovery({
  proposalPath,
  expectedSha256,
  backupPath,
  outputPath,
  db = {},
  requireAuthorization = true,
  dependencies = {},
} = {}) {
  const resolvedProposal = path.resolve(proposalPath);
  const proposalBytes = fs.readFileSync(resolvedProposal);
  const actualSha256 = sha256Bytes(proposalBytes);
  if (actualSha256 !== expectedSha256) throw new Error('source relation recovery proposal hash drifted');
  const proposal = readJson(resolvedProposal);
  const rows = normalizeProposal(proposal);
  const plan = buildItemSourceRelationRecoveryPlan({
    sourceBundleSha256: actualSha256,
    sourceFactCount: rows.itemSourceFacts.length,
    sourceDetailCount: rows.itemSourceDetails.length,
    shopRelationCount: rows.itemNpcShopRelations.length,
    lootRelationCount: rows.itemNpcLootRelations.length,
  });
  if (requireAuthorization) {
    const context = loadAuthorizedOperationContext({
      operationId: ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID,
    });
    const bundleHash = hashOrderedBundleBytes([
      { path: 'reports/runtime/local-data-chain-closure/20260823/relation-source-recovery/proposal.json', bytes: proposalBytes },
    ], 'source relation recovery data bundle');
    if (context.dataBundleSha256 !== bundleHash) throw new Error('authorized source bundle hash drifted');
  }

  const mysql = dependencies.mysql ?? createRequire(path.resolve('apps/admin-console/package.json'))('mysql2/promise');
  const config = loadLocalStackConfig();
  const connection = await mysql.createConnection({
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 13306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: 'terria_v1_relation',
    ...db,
    database: 'terria_v1_relation',
  });
  try {
    const backup = { operationId: ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID, generatedAt: new Date().toISOString(), tables: {} };
    for (const [, table] of TABLES) {
      const [currentRows] = await connection.query(`SELECT * FROM \`${table}\``);
      backup.tables[table] = currentRows;
    }
    writePrivateJson(path.resolve(backupPath), backup);

    await connection.beginTransaction();
    try {
      for (const statement of buildRelationSourceRecoveryStatements()) await connection.query(statement);
      await insertRows(connection, 'item_source_facts', rows.itemSourceFacts);
      await insertRows(connection, 'item_source_details', rows.itemSourceDetails);
      await insertRows(connection, 'item_npc_shop_relations', rows.itemNpcShopRelations);
      await insertRows(connection, 'item_npc_loot_relations', rows.itemNpcLootRelations);
      await insertRows(connection, 'item_npc_relation_audits', rows.itemNpcRelationAudits);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const readback = {};
    for (const [, table] of TABLES) {
      const [countRows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      readback[table] = Number(countRows[0]?.count ?? 0);
    }
    const result = {
      operationId: ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID,
      status: 'completed',
      apply: true,
      plan,
      proposalPath: path.relative(process.cwd(), resolvedProposal),
      backupPath: path.relative(process.cwd(), path.resolve(backupPath)),
      readback,
    };
    writePrivateJson(path.resolve(outputPath), result);
    return result;
  } finally {
    await connection.end();
  }
}

async function buildProposal({ outputPath }) {
  const result = await runSync({
    apply: false,
    maintDatabase: 'terria_v1_maint',
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    scopes: ['npc'],
  });
  const payload = {
    schemaVersion: 1,
    operationId: ITEM_SOURCE_RELATION_RECOVERY_OPERATION_ID,
    generatedAt: new Date().toISOString(),
    sourceDatabases: ['terria_v1_maint', 'terria_v1_local'],
    rows: Object.fromEntries(TABLES.map(([key]) => [key, result.results[key]])),
  };
  writePrivateJson(path.resolve(outputPath), payload);
  const bytes = fs.readFileSync(path.resolve(outputPath));
  console.log(JSON.stringify({ proposalPath: outputPath, proposalSha256: sha256Bytes(bytes), counts: Object.fromEntries(TABLES.map(([key]) => [key, payload.rows[key].length])) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }));
  if (args['build-proposal'] === 'true' || args['build-proposal'] === true) {
    await buildProposal({ outputPath: args.output });
  } else {
    await runItemSourceRelationRecovery({
      proposalPath: args.proposal,
      expectedSha256: args['expected-sha256'],
      backupPath: args.backup,
      outputPath: args.output,
    });
  }
}
