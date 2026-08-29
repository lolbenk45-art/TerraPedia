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

export const PARENT_CONFLICT_RETIREMENT_OPERATION_ID = 'canonical-npc-stale-lineage-parent-conflict-retirement';
export const PARENT_CONFLICT_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json';
export const PARENT_CONFLICT_INPUT_PATH = 'reports/authorization/canonical/canonical-npc-stale-lineage-parent-conflict-retirement.input.json';
export const PARENT_CONFLICT_RESULT_PATH = 'reports/authorization/canonical/canonical-npc-stale-lineage-parent-conflict-retirement.result.json';
const EXPECTED_SCOPE = 'sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001';
const EXPECTED_COUNT = 84;
const LEGACY = Object.freeze({
  sourceProvider: 'terrapedia.generated',
  landingContentHash: '07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
});
const WRITE_TARGET = 'relation.item_npc_loot_relations.parent_conflict_old_generated';
const DISPOSITION = Object.freeze({ status: 0, deleted: 1 });
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function required(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function hashFile(repoRoot, relativePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, relativePath))).digest('hex')}`;
}

function assertExactLineage(row, label, { allowMissingSourceMaintTable = false } = {}) {
  for (const [field, expected] of Object.entries(LEGACY)) {
    if (field === 'sourceMaintTable' && allowMissingSourceMaintTable && row?.[field] == null) continue;
    if (String(row?.[field] ?? '').trim() !== expected) {
      throw new Error(`${label} ${field} drifted`);
    }
  }
}

export function validateParentConflictInput({ input, preview, previewSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== PARENT_CONFLICT_RETIREMENT_OPERATION_ID) {
    throw new Error('parent-conflict retirement input contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('parent-conflict retirement write/network flags are invalid');
  }
  if (input.scopeSha256 !== EXPECTED_SCOPE || preview?.scopeSha256 !== EXPECTED_SCOPE) {
    throw new Error('parent-conflict retirement scope hash drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256) || input.previewSha256 !== previewSha256) {
    throw new Error('parent-conflict retirement preview hash drifted');
  }
  if (input.expectedCounts?.relationLoot !== EXPECTED_COUNT) {
    throw new Error('parent-conflict relation count drifted');
  }
  if (JSON.stringify(input.writeTargets) !== JSON.stringify([WRITE_TARGET])) {
    throw new Error('parent-conflict write targets drifted');
  }
  if (preview?.applyAllowed !== false || preview?.databaseWrites !== false || preview?.externalRequests !== false) {
    throw new Error('parent-conflict preview must remain read-only');
  }
  if (preview?.summary?.candidateLootRelations !== EXPECTED_COUNT
      || preview?.summary?.candidateSourceFacts !== EXPECTED_COUNT
      || preview?.summary?.candidateSourceDetails !== EXPECTED_COUNT
      || preview?.summary?.localRowsTargeted !== 0
      || preview?.summary?.projectionRowsTargeted !== 0
      || preview?.rows?.length !== EXPECTED_COUNT) {
    throw new Error('parent-conflict preview counts drifted');
  }
  for (const row of preview.rows) {
    assertExactLineage(row, 'parent-conflict row', { allowMissingSourceMaintTable: true });
    if (row.disposition !== 'quarantine_parent_conflict') {
      throw new Error('parent-conflict disposition drifted');
    }
  }
  return true;
}

export function buildParentConflictMutationPlan(preview) {
  validateParentConflictInput({
    input: {
      schemaVersion: 1,
      operationId: PARENT_CONFLICT_RETIREMENT_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: EXPECTED_SCOPE,
      previewSha256: 'sha256:' + '0'.repeat(64),
      expectedCounts: { relationLoot: EXPECTED_COUNT },
      writeTargets: [WRITE_TARGET],
    },
    preview,
    previewSha256: 'sha256:' + '0'.repeat(64),
  });
  const relationLoot = preview.rows.map((row) => required(row.candidateRecordKey, 'parent-conflict relation recordKey'));
  if (new Set(relationLoot).size !== relationLoot.length) throw new Error('duplicate parent-conflict relation target');
  return { keys: { relationLoot }, counts: { relationLoot: relationLoot.length } };
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

async function selectTargets(connection, keys, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(
    'SELECT * FROM `terria_v1_relation`.`item_npc_loot_relations`'
      + ` WHERE record_key IN (${placeholders(keys)})${lock}`,
    keys,
  );
  return rows;
}

function assertTargetRows(rows, preview) {
  const expected = new Map(preview.rows.map((row) => [row.candidateRecordKey, row]));
  if (rows.length !== expected.size) throw new Error('parent-conflict target set drifted');
  for (const row of rows) {
    const wanted = expected.get(row.record_key);
    if (!wanted || !active(row)) throw new Error(`parent-conflict target missing or inactive: ${row.record_key}`);
    if (row.source_fact_key !== wanted.sourceFactKey) throw new Error(`parent-conflict source fact drifted: ${row.record_key}`);
    assertExactLineage({
      sourceProvider: row.source_provider,
      landingContentHash: row.landing_content_hash,
      landingSourceKey: row.landing_source_key,
      sourceMaintTable: row.source_maint_table,
    }, `parent-conflict target ${row.record_key}`);
    if (row.source_maint_record_key !== wanted.sourceMaintRecordKey) {
      throw new Error(`parent-conflict maint record drifted: ${row.record_key}`);
    }
  }
}

async function updateRows(connection, keys, preview) {
  const byKey = new Map(preview.rows.map((row) => [row.candidateRecordKey, row]));
  for (const key of keys) {
    const row = byKey.get(key);
    const [result] = await connection.execute(
      'UPDATE `terria_v1_relation`.`item_npc_loot_relations`'
        + ' SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP'
        + ' WHERE record_key = ? AND source_fact_key = ? AND source_provider = ?'
        + ' AND landing_content_hash = ? AND landing_source_key = ?'
        + ' AND source_maint_table = ? AND source_maint_record_key = ?'
        + ' AND status = 1 AND deleted = 0',
      [key, row.sourceFactKey, LEGACY.sourceProvider, LEGACY.landingContentHash,
        LEGACY.landingSourceKey, LEGACY.sourceMaintTable, row.sourceMaintRecordKey],
    );
    if (Number(result?.affectedRows) !== 1) throw new Error(`parent-conflict affected row count drifted: ${key}`);
  }
}

export async function runParentConflictRetirement({
  repoRoot = process.cwd(),
  inputPath = PARENT_CONFLICT_INPUT_PATH,
  previewPath = PARENT_CONFLICT_PREVIEW_PATH,
  apply = false,
  mysqlModule,
} = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const preview = JSON.parse(fs.readFileSync(path.resolve(repoRoot, previewPath), 'utf8'));
  const previewSha256 = hashFile(repoRoot, previewPath);
  validateParentConflictInput({ input, preview, previewSha256 });
  const plan = buildParentConflictMutationPlan(preview);
  if (!apply) return { operationId: PARENT_CONFLICT_RETIREMENT_OPERATION_ID, apply: false, scopeSha256: input.scopeSha256, counts: plan.counts };

  const authorizedContext = loadAuthorizedOperationContext({ operationId: PARENT_CONFLICT_RETIREMENT_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const before = await selectTargets(connection, plan.keys.relationLoot, { forUpdate: true });
      assertTargetRows(before, preview);
      await updateRows(connection, plan.keys.relationLoot, preview);
      const after = await selectTargets(connection, plan.keys.relationLoot);
      const activeTargets = after.filter(active).length;
      if (activeTargets !== 0) throw new Error('parent-conflict readback found active targets');
      const readback = { relationLoot: after.length, activeTargets };
      await connection.commit();
      return {
        schemaVersion: 1,
        resultKind: 'canonical_npc_stale_lineage_parent_conflict_retirement_result',
        operationId: PARENT_CONFLICT_RETIREMENT_OPERATION_ID,
        status: 'COMPLETED',
        transactionCommitted: true,
        scopeSha256: input.scopeSha256,
        authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash },
        affected: plan.counts,
        readback,
        outputHash: `sha256:${createHash('sha256').update(JSON.stringify({ input, affected: plan.counts, readback })).digest('hex')}`,
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
  runParentConflictRetirement({
    repoRoot: process.cwd(),
    inputPath: args.input ?? PARENT_CONFLICT_INPUT_PATH,
    previewPath: args.preview ?? PARENT_CONFLICT_PREVIEW_PATH,
    apply: args.apply === 'true',
  }).then((result) => {
    if (args.apply === 'true') fs.writeFileSync(path.resolve(process.cwd(), args.output ?? PARENT_CONFLICT_RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
