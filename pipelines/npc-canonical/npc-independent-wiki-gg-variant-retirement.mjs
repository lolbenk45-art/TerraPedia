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

export const INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID = 'canonical-npc-independent-wiki-gg-variant-retirement';
export const INDEPENDENT_WIKI_GG_VARIANT_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-independent-wiki-gg-variant-retirement-preview.json';
export const INDEPENDENT_WIKI_GG_VARIANT_INPUT_PATH = 'reports/authorization/canonical/canonical-npc-independent-wiki-gg-variant-retirement.input.json';
export const INDEPENDENT_WIKI_GG_VARIANT_RESULT_PATH = 'reports/authorization/canonical/canonical-npc-independent-wiki-gg-variant-retirement.result.json';

const EXPECTED_SCOPE = 'sha256:78fa79a468bf72f4c289fc82056e6e250cea41c33da8dbd449e2fae9f93c052c';
const EXPECTED_COUNT = 52;
const WRITE_TARGET = 'relation.item_npc_loot_relations.independent_wiki_gg_variant';
const TARGET_LINEAGE = Object.freeze({
  sourceProvider: 'wiki_gg',
  landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
  landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  sourceMaintTable: 'maint_item_sources',
});
const ACCEPTED_SURVIVOR_LINEAGE = Object.freeze({
  sourceProvider: 'terraria.wiki.gg',
  landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
});
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function hashFile(repoRoot, relativePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, relativePath))).digest('hex')}`;
}

function assertExactLineage(row, lineage, label) {
  for (const [field, expected] of Object.entries(lineage)) {
    if (text(row?.[field]) !== expected) throw new Error(`${label} ${field} drifted`);
  }
}

function previewSurvivor(row) {
  const survivors = Array.isArray(row?.expectedAcceptedSurvivors) ? row.expectedAcceptedSurvivors : [];
  if (survivors.length !== 1) throw new Error('independent wiki_gg variant survivor count drifted');
  return survivors[0];
}

export function validateIndependentWikiGgVariantInput({ input, preview, previewSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID) {
    throw new Error('independent wiki_gg variant retirement input contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('independent wiki_gg variant retirement write/network flags are invalid');
  }
  if (input.scopeSha256 !== EXPECTED_SCOPE || preview?.scopeSha256 !== EXPECTED_SCOPE) {
    throw new Error('independent wiki_gg variant retirement scope hash drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256) || input.previewSha256 !== previewSha256) {
    throw new Error('independent wiki_gg variant retirement preview hash drifted');
  }
  if (input.expectedCounts?.relationLoot !== EXPECTED_COUNT) {
    throw new Error('independent wiki_gg variant retirement relation count drifted');
  }
  if (JSON.stringify(input.writeTargets) !== JSON.stringify([WRITE_TARGET])) {
    throw new Error('independent wiki_gg variant retirement write targets drifted');
  }
  if (preview?.applyAllowed !== false || preview?.databaseWrites !== false || preview?.externalRequests !== false) {
    throw new Error('independent wiki_gg variant preview must remain read-only');
  }
  assertExactLineage(preview?.targetLineage, TARGET_LINEAGE, 'independent wiki_gg variant preview target lineage');
  assertExactLineage(preview?.acceptedSurvivorLineage, ACCEPTED_SURVIVOR_LINEAGE, 'independent wiki_gg variant preview survivor lineage');
  if (preview?.summary?.candidateLootRelations !== EXPECTED_COUNT
      || preview?.summary?.candidateSourceFacts !== EXPECTED_COUNT
      || preview?.summary?.acceptedSurvivors !== EXPECTED_COUNT
      || preview?.summary?.localRowsTargeted !== 0
      || preview?.summary?.projectionRowsTargeted !== 0
      || preview?.rows?.length !== EXPECTED_COUNT) {
    throw new Error('independent wiki_gg variant preview counts drifted');
  }
  const candidateKeys = new Set();
  const survivorKeys = new Set();
  for (const row of preview.rows) {
    const candidateKey = text(row.candidateRecordKey);
    if (!candidateKey || candidateKeys.has(candidateKey)) throw new Error('duplicate independent wiki_gg variant target');
    candidateKeys.add(candidateKey);
    if (!text(row.sourceFactKey) || !text(row.sourceMaintRecordKey) || !text(row.stableIdentity)) {
      throw new Error('independent wiki_gg variant target identity is incomplete');
    }
    assertExactLineage(row.candidateLineage, TARGET_LINEAGE, `independent wiki_gg variant target ${candidateKey}`);
    if (row.disposition !== 'quarantine_independent_wiki_gg_variant') {
      throw new Error('independent wiki_gg variant target disposition drifted');
    }
    const survivor = previewSurvivor(row);
    const survivorKey = text(survivor.recordKey);
    if (!survivorKey || survivorKeys.has(survivorKey)) throw new Error('duplicate independent wiki_gg variant survivor');
    survivorKeys.add(survivorKey);
    if (!text(survivor.sourceFactKey)) throw new Error('independent wiki_gg variant survivor fact is missing');
    assertExactLineage(survivor.lineage, ACCEPTED_SURVIVOR_LINEAGE, `independent wiki_gg variant survivor ${survivorKey}`);
  }
  return true;
}

export function buildIndependentWikiGgVariantMutationPlan(preview) {
  validateIndependentWikiGgVariantInput({
    input: {
      schemaVersion: 1,
      operationId: INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: EXPECTED_SCOPE,
      previewSha256: `sha256:${'0'.repeat(64)}`,
      expectedCounts: { relationLoot: EXPECTED_COUNT },
      writeTargets: [WRITE_TARGET],
    },
    preview,
    previewSha256: `sha256:${'0'.repeat(64)}`,
  });
  const relationLoot = preview.rows.map((row) => text(row.candidateRecordKey));
  const survivorKeys = preview.rows.map((row) => text(previewSurvivor(row).recordKey));
  return { keys: { relationLoot }, survivorKeys, counts: { relationLoot: relationLoot.length, survivors: survivorKeys.length } };
}

function connectionOptions(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function selectRows(connection, keys, { forUpdate = false } = {}) {
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
  if (rows.length !== expected.size) throw new Error('independent wiki_gg variant target set drifted');
  for (const row of rows) {
    const wanted = expected.get(row.record_key);
    if (!wanted || !active(row)) throw new Error(`independent wiki_gg variant target missing or inactive: ${row.record_key}`);
    if (row.source_fact_key !== wanted.sourceFactKey) throw new Error(`independent wiki_gg variant source fact drifted: ${row.record_key}`);
    if (row.source_maint_record_key !== wanted.sourceMaintRecordKey) throw new Error(`independent wiki_gg variant maint record drifted: ${row.record_key}`);
    assertExactLineage({
      sourceProvider: row.source_provider,
      landingContentHash: row.landing_content_hash,
      landingSourceKey: row.landing_source_key,
      sourceMaintTable: row.source_maint_table,
    }, TARGET_LINEAGE, `independent wiki_gg variant target ${row.record_key}`);
  }
}

function assertSurvivorRows(rows, preview) {
  const expected = new Map(preview.rows.map((row) => {
    const survivor = previewSurvivor(row);
    return [survivor.recordKey, survivor];
  }));
  if (rows.length !== expected.size) throw new Error('independent wiki_gg variant survivor set drifted');
  for (const row of rows) {
    const wanted = expected.get(row.record_key);
    if (!wanted || !active(row)) throw new Error(`independent wiki_gg variant survivor missing or inactive: ${row.record_key}`);
    if (row.source_fact_key !== wanted.sourceFactKey) throw new Error(`independent wiki_gg variant survivor fact drifted: ${row.record_key}`);
    assertExactLineage({
      sourceProvider: row.source_provider,
      landingContentHash: row.landing_content_hash,
      landingSourceKey: row.landing_source_key,
      sourceMaintTable: row.source_maint_table,
    }, ACCEPTED_SURVIVOR_LINEAGE, `independent wiki_gg variant survivor ${row.record_key}`);
  }
}

async function updateTargets(connection, preview) {
  for (const row of preview.rows) {
    const [result] = await connection.execute(
      'UPDATE `terria_v1_relation`.`item_npc_loot_relations`'
        + ' SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP'
        + ' WHERE record_key = ? AND source_fact_key = ? AND source_provider = ?'
        + ' AND landing_content_hash = ? AND landing_source_key = ?'
        + ' AND source_maint_table = ? AND source_maint_record_key = ?'
        + ' AND status = 1 AND deleted = 0',
      [row.candidateRecordKey, row.sourceFactKey, TARGET_LINEAGE.sourceProvider,
        TARGET_LINEAGE.landingContentHash, TARGET_LINEAGE.landingSourceKey,
        TARGET_LINEAGE.sourceMaintTable, row.sourceMaintRecordKey],
    );
    if (Number(result?.affectedRows) !== 1) throw new Error(`independent wiki_gg variant affected row count drifted: ${row.candidateRecordKey}`);
  }
}

export async function runIndependentWikiGgVariantRetirement({
  repoRoot = process.cwd(),
  inputPath = INDEPENDENT_WIKI_GG_VARIANT_INPUT_PATH,
  previewPath = INDEPENDENT_WIKI_GG_VARIANT_PREVIEW_PATH,
  apply = false,
  mysqlModule,
} = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const preview = JSON.parse(fs.readFileSync(path.resolve(repoRoot, previewPath), 'utf8'));
  const previewSha256 = hashFile(repoRoot, previewPath);
  validateIndependentWikiGgVariantInput({ input, preview, previewSha256 });
  const plan = buildIndependentWikiGgVariantMutationPlan(preview);
  if (!apply) return { operationId: INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID, apply: false, scopeSha256: input.scopeSha256, counts: plan.counts };

  const authorizedContext = loadAuthorizedOperationContext({ operationId: INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const mysql = await loadMysqlModule({ repoRoot, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const before = await selectRows(connection, plan.keys.relationLoot, { forUpdate: true });
      const survivors = await selectRows(connection, plan.survivorKeys, { forUpdate: true });
      assertTargetRows(before, preview);
      assertSurvivorRows(survivors, preview);
      await updateTargets(connection, preview);
      const after = await selectRows(connection, plan.keys.relationLoot);
      const survivorReadback = await selectRows(connection, plan.survivorKeys);
      const activeTargets = after.filter(active).length;
      if (after.length !== EXPECTED_COUNT || activeTargets !== 0) throw new Error('independent wiki_gg variant target readback drifted');
      assertSurvivorRows(survivorReadback, preview);
      const readback = { relationLoot: after.length, activeTargets, activeSurvivors: survivorReadback.filter(active).length };
      await connection.commit();
      return {
        schemaVersion: 1,
        resultKind: 'canonical_npc_independent_wiki_gg_variant_retirement_result',
        operationId: INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
        status: 'COMPLETED',
        transactionCommitted: true,
        scopeSha256: input.scopeSha256,
        authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash },
        affected: { relationLoot: plan.counts.relationLoot },
        readback,
        outputHash: `sha256:${createHash('sha256').update(JSON.stringify({ input, affected: { relationLoot: plan.counts.relationLoot }, readback })).digest('hex')}`,
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
  runIndependentWikiGgVariantRetirement({
    repoRoot: process.cwd(),
    inputPath: args.input ?? INDEPENDENT_WIKI_GG_VARIANT_INPUT_PATH,
    previewPath: args.preview ?? INDEPENDENT_WIKI_GG_VARIANT_PREVIEW_PATH,
    apply: args.apply === 'true',
  }).then((result) => {
    if (args.apply === 'true') fs.writeFileSync(path.resolve(process.cwd(), args.output ?? INDEPENDENT_WIKI_GG_VARIANT_RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
