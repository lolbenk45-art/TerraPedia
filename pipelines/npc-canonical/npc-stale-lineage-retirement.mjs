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

export const STALE_LINEAGE_RETIREMENT_OPERATION_ID = 'canonical-npc-stale-lineage-retirement';
export const STALE_LINEAGE_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json';
export const STALE_LINEAGE_INPUT_PATH = 'reports/authorization/canonical/canonical-npc-stale-lineage-retirement.input.json';
export const STALE_LINEAGE_RESULT_PATH = 'reports/authorization/canonical/canonical-npc-stale-lineage-retirement.result.json';
export const DATABASES = Object.freeze({
  relation: 'terria_v1_relation',
});
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const EXPECTED_SCOPE = 'sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d';
const EXPECTED_COUNTS = Object.freeze({ relationLoot: 513, relationShop: 408, sourceFacts: 921, sourceDetails: 921 });
const DISPOSITION = Object.freeze({ status: 0, deleted: 1 });

function hashFile(repoRoot, relativePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, relativePath))).digest('hex')}`;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function expectedCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function assertExactCounts(summary) {
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (Number(summary?.[key]) !== expected) throw new Error(`stale lineage ${key} count drifted`);
  }
}

export function validateRetirementInput({ input, preview, previewSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== STALE_LINEAGE_RETIREMENT_OPERATION_ID) {
    throw new Error('stale lineage retirement input contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('stale lineage retirement input write/network flags are invalid');
  }
  if (input.scopeSha256 !== EXPECTED_SCOPE || preview?.scopeSha256 !== input.scopeSha256) {
    throw new Error('stale lineage retirement scope hash drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256) || input.previewSha256 !== previewSha256) {
    throw new Error('stale lineage retirement preview hash drifted');
  }
  assertExactCounts(input.expectedCounts);
  if (preview?.applyAllowed !== false || preview?.databaseWrites !== false || preview?.externalRequests !== false) {
    throw new Error('stale lineage preview must remain read-only');
  }
  if (JSON.stringify(preview?.summary?.proposedRelationLoot) !== JSON.stringify(EXPECTED_COUNTS.relationLoot)
      || JSON.stringify(preview?.summary?.proposedRelationShop) !== JSON.stringify(EXPECTED_COUNTS.relationShop)
      || JSON.stringify(preview?.summary?.proposedSourceFacts) !== JSON.stringify(EXPECTED_COUNTS.sourceFacts)
      || JSON.stringify(preview?.summary?.proposedSourceDetails) !== JSON.stringify(EXPECTED_COUNTS.sourceDetails)) {
    throw new Error('stale lineage preview proposal counts drifted');
  }
  if (preview.proposed?.relationLoot?.length !== EXPECTED_COUNTS.relationLoot
      || preview.proposed?.relationShop?.length !== EXPECTED_COUNTS.relationShop
      || preview.proposed?.sourceFacts?.length !== EXPECTED_COUNTS.sourceFacts
      || preview.proposed?.sourceDetails?.length !== EXPECTED_COUNTS.sourceDetails) {
    throw new Error('stale lineage preview target arrays drifted');
  }
  for (const rows of Object.values(preview.proposed)) {
    for (const row of rows) {
      if (row.disposition?.status !== DISPOSITION.status || row.disposition?.deleted !== DISPOSITION.deleted) {
        throw new Error('stale lineage proposal disposition drifted');
      }
    }
  }
  return true;
}

export function buildRetirementMutationPlan(preview) {
  validateRetirementInput({
    input: {
      schemaVersion: 1,
      operationId: STALE_LINEAGE_RETIREMENT_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: EXPECTED_SCOPE,
      previewSha256: 'sha256:' + '0'.repeat(64),
      expectedCounts: EXPECTED_COUNTS,
    },
    preview,
    previewSha256: 'sha256:' + '0'.repeat(64),
  });
  const keys = {
    relationLoot: preview.proposed.relationLoot.map((row) => required(row.recordKey, 'loot relation recordKey')),
    relationShop: preview.proposed.relationShop.map((row) => required(row.recordKey, 'shop relation recordKey')),
    sourceFacts: preview.proposed.sourceFacts.map((row) => required(row.recordKey, 'source fact recordKey')),
    sourceDetails: preview.proposed.sourceDetails.map((row) => required(row.recordKey, 'source detail recordKey')),
  };
  for (const [label, values] of Object.entries(keys)) {
    if (new Set(values).size !== values.length) throw new Error(`duplicate stale lineage ${label} target`);
  }
  return { keys, counts: Object.fromEntries(Object.entries(keys).map(([key, values]) => [key, values.length])) };
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

async function selectTargets(connection, preview, { forUpdate = false } = {}) {
  const facts = preview.proposed.sourceFacts.map((row) => row.recordKey);
  const details = preview.proposed.sourceDetails.map((row) => row.recordKey);
  const loot = preview.proposed.relationLoot.map((row) => row.recordKey);
  const shop = preview.proposed.relationShop.map((row) => row.recordKey);
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const queries = [
    [`SELECT * FROM \`${DATABASES.relation}\`.\`item_source_facts\` WHERE record_key IN (${placeholders(facts)})${lock}`, facts],
    [`SELECT * FROM \`${DATABASES.relation}\`.\`item_source_details\` WHERE record_key IN (${placeholders(details)})${lock}`, details],
    [`SELECT * FROM \`${DATABASES.relation}\`.\`item_npc_loot_relations\` WHERE record_key IN (${placeholders(loot)})${lock}`, loot],
    [`SELECT * FROM \`${DATABASES.relation}\`.\`item_npc_shop_relations\` WHERE record_key IN (${placeholders(shop)})${lock}`, shop],
  ];
  const results = await Promise.all(queries.map(([sql, values]) => connection.execute(sql, values)));
  return {
    facts: results[0][0], details: results[1][0], relationLoot: results[2][0], relationShop: results[3][0],
  };
}

function lineageFields(row) {
  return {
    recordKey: row.recordKey,
    sourceFactKey: row.sourceFactKey ?? null,
    sourceProvider: row.sourceProvider ?? null,
    landingContentHash: row.landingContentHash ?? null,
    landingSourceKey: row.landingSourceKey ?? null,
    sourceMaintTable: row.sourceMaintTable ?? null,
    sourceMaintRecordKey: row.sourceMaintRecordKey ?? null,
    sourceMaintId: row.sourceMaintId ?? null,
  };
}

function assertTargetRows(preview, rows) {
  const checks = [
    ['sourceFacts', rows.facts, 'source fact'],
    ['sourceDetails', rows.details, 'source detail'],
    ['relationLoot', rows.relationLoot, 'loot relation'],
    ['relationShop', rows.relationShop, 'shop relation'],
  ];
  for (const [key, actualRows, label] of checks) {
    const expected = new Map(preview.proposed[key].map((row) => [row.recordKey, row]));
    if (actualRows.length !== expected.size) throw new Error(`${label} target set drifted`);
    for (const actual of actualRows) {
      const wanted = expected.get(actual.record_key);
      if (!wanted || !active(actual)) throw new Error(`${label} target is missing or inactive`);
      const actualTuple = lineageFields({
        recordKey: actual.record_key,
        sourceFactKey: actual.source_fact_key,
        sourceProvider: actual.source_provider,
        landingContentHash: actual.landing_content_hash,
        landingSourceKey: actual.landing_source_key,
        sourceMaintTable: actual.source_maint_table,
        sourceMaintRecordKey: actual.source_maint_record_key,
        sourceMaintId: actual.source_maint_id,
      });
      const wantedTuple = lineageFields(wanted);
      if (JSON.stringify(actualTuple) !== JSON.stringify(wantedTuple)) throw new Error(`${label} lineage drifted: ${actual.record_key}`);
    }
  }
}

async function updateRows(connection, tableName, rows) {
  const hasSourceFactKey = tableName !== 'item_source_facts';
  for (const row of rows) {
    const fields = lineageFields(row);
    const sourceFactClause = hasSourceFactKey ? ' AND source_fact_key <=> ?' : '';
    const values = hasSourceFactKey
      ? [fields.recordKey, fields.sourceFactKey, fields.sourceProvider, fields.landingContentHash,
        fields.landingSourceKey, fields.sourceMaintTable, fields.sourceMaintRecordKey, fields.sourceMaintId]
      : [fields.recordKey, fields.sourceProvider, fields.landingContentHash, fields.landingSourceKey,
        fields.sourceMaintTable, fields.sourceMaintRecordKey, fields.sourceMaintId];
    const [result] = await connection.execute(
      `UPDATE \`${DATABASES.relation}\`.\`${tableName}\`
       SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE record_key = ?${sourceFactClause} AND source_provider <=> ?
         AND landing_content_hash <=> ? AND landing_source_key <=> ?
         AND source_maint_table <=> ? AND source_maint_record_key <=> ?
         AND source_maint_id <=> ? AND status = 1 AND deleted = 0`,
      values,
    );
    if (Number(result?.affectedRows) !== 1) throw new Error(`${tableName} affected row count drifted for ${row.recordKey}`);
  }
}

async function readback(connection, preview) {
  const rows = await selectTargets(connection, preview);
  const all = [...rows.facts, ...rows.details, ...rows.relationLoot, ...rows.relationShop];
  if (all.some(active)) throw new Error('stale lineage readback found active target rows');
  return {
    sourceFacts: rows.facts.length,
    sourceDetails: rows.details.length,
    relationLoot: rows.relationLoot.length,
    relationShop: rows.relationShop.length,
    activeTargets: all.filter(active).length,
  };
}

export async function runStaleLineageRetirement({ repoRoot = process.cwd(), inputPath = STALE_LINEAGE_INPUT_PATH, previewPath = STALE_LINEAGE_PREVIEW_PATH, apply = false, mysqlModule } = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const preview = JSON.parse(fs.readFileSync(path.resolve(repoRoot, previewPath), 'utf8'));
  const previewSha256 = hashFile(repoRoot, previewPath);
  validateRetirementInput({ input, preview, previewSha256 });
  buildRetirementMutationPlan(preview);
  if (!apply) return { operationId: STALE_LINEAGE_RETIREMENT_OPERATION_ID, apply: false, scopeSha256: input.scopeSha256, counts: EXPECTED_COUNTS };
  const authorizedContext = loadAuthorizedOperationContext({ operationId: STALE_LINEAGE_RETIREMENT_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const before = await selectTargets(connection, preview, { forUpdate: true });
      assertTargetRows(preview, before);
      await updateRows(connection, 'item_npc_loot_relations', preview.proposed.relationLoot);
      await updateRows(connection, 'item_npc_shop_relations', preview.proposed.relationShop);
      await updateRows(connection, 'item_source_details', preview.proposed.sourceDetails);
      await updateRows(connection, 'item_source_facts', preview.proposed.sourceFacts);
      const readbackCounts = await readback(connection, preview);
      await connection.commit();
      return {
        schemaVersion: 1,
        resultKind: 'canonical_npc_stale_lineage_retirement_result',
        operationId: STALE_LINEAGE_RETIREMENT_OPERATION_ID,
        status: 'COMPLETED',
        transactionCommitted: true,
        scopeSha256: input.scopeSha256,
        authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash },
        affected: EXPECTED_COUNTS,
        readback: readbackCounts,
        outputHash: `sha256:${createHash('sha256').update(JSON.stringify({ input, affected: EXPECTED_COUNTS, readback: readbackCounts })).digest('hex')}`,
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
  runStaleLineageRetirement({
    repoRoot: process.cwd(),
    inputPath: parseArgs(process.argv.slice(2)).input ?? STALE_LINEAGE_INPUT_PATH,
    previewPath: parseArgs(process.argv.slice(2)).preview ?? STALE_LINEAGE_PREVIEW_PATH,
    outputPath: parseArgs(process.argv.slice(2)).output ?? STALE_LINEAGE_RESULT_PATH,
    apply: parseArgs(process.argv.slice(2)).apply === 'true',
  }).then((result) => {
    const args = parseArgs(process.argv.slice(2));
    if (args.apply === 'true') fs.writeFileSync(path.resolve(process.cwd(), args.output ?? STALE_LINEAGE_RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
