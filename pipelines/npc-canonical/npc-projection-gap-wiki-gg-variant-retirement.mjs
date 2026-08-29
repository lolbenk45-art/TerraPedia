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

export const PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID =
  'canonical-npc-projection-gap-wiki-gg-variant-retirement';
export const PROJECTION_GAP_WIKI_GG_VARIANT_PREVIEW_PATH =
  'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-projection-gap-wiki-gg-variant-retirement-preview.json';
export const PROJECTION_GAP_WIKI_GG_VARIANT_INPUT_PATH =
  'reports/authorization/canonical/canonical-npc-projection-gap-wiki-gg-variant-retirement.input.json';
export const PROJECTION_GAP_WIKI_GG_VARIANT_RESULT_PATH =
  'reports/authorization/canonical/canonical-npc-projection-gap-wiki-gg-variant-retirement.result.json';

const DATABASE = 'terria_v1_relation';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const WRITE_TARGET = 'relation.item_npc_loot_relations.projection_gap_wiki_gg_variant';
const EXPECTED_COUNTS = Object.freeze({ relationLoot: 4 });
const CANDIDATE_LINEAGE = Object.freeze({
  sourceProvider: 'wiki_gg',
  landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
  landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  sourceMaintTable: 'maint_item_sources',
});
const SURVIVOR_LINEAGE = Object.freeze({
  sourceProvider: 'terraria.wiki.gg',
  landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
});

export const EXPECTED_TARGETS = Object.freeze([
  Object.freeze({
    npcInternalName: 'CursedSkull', itemInternalName: 'Nazar', quantityText: '1', chanceText: '1% 1.99%',
    candidateRecordKey: '3b236ed3c9ba6e92d17124c9f7f946cb8596cb363c1144ec0c8c8bb75a6f0fc0',
    candidateSourceFactKey: '824ed012df6fb6dc8247d5fbd169223bd38b615cf06c532158a82a3ac01015bd',
    candidateSourceMaintRecordKey: '81ba2f9b5905ea9575b295300b7d81fe2e6c56c6254faa418d7392f255222ce7',
    survivorRecordKey: '814335bd87bcb75ab728f4f56816634812689774307c691d6bf700e27c978167',
    survivorSourceFactKey: 'd08b1810e482bfe390cb0af7f41324f9ba76d4a29623c3b3f2c02460b0986adf',
  }),
  Object.freeze({
    npcInternalName: 'Hornet', itemInternalName: 'Stinger', quantityText: '1', chanceText: '66% 100%',
    candidateRecordKey: '2e3885486e017aff4a135fadb9d0101248b54b8620e5fde60c9c308059dd7dc2',
    candidateSourceFactKey: '0c3d9a9d6fefc3ae627fd13b4f1d2631bb86c495a7a1c705fa3d28b54feb69c8',
    candidateSourceMaintRecordKey: '6f165a5e14f05a8b489df5426740d0492ff385e0b35e169509589d8da679e3ee',
    survivorRecordKey: 'f99572374ca1e34a2b5b3ab2a050850d97ef8c34e6974002b965acb56778d2d5',
    survivorSourceFactKey: 'a2ac1646917d5652ab8cb97ea10613464e650e639b31f7147eddee8393ca989f',
  }),
  Object.freeze({
    npcInternalName: 'JungleSlime', itemInternalName: 'SlimeStaff', quantityText: '1', chanceText: '0.01% 0.014%',
    candidateRecordKey: 'fc73e03fee6e27e60eed1b31f3a5f379b6918eec796331542f1d5b4f8b7a3b75',
    candidateSourceFactKey: '248166b2c1512a090756eeb806df22956ff3177813441db9f889fd07e2002461',
    candidateSourceMaintRecordKey: '0472cc853e3c2dc9b56ca571b2539cacee11be74a770fe4b53cdd8a64773e17b',
    survivorRecordKey: '54b14274bcd308be48a8102729d3d23912050c9bbfbae5b22ee7338dd8e83b96',
    survivorSourceFactKey: 'ebc542fa440e2bcece54fae42aa822a2351a0d504ee0c951faaac321240de2ce',
  }),
  Object.freeze({
    npcInternalName: 'ManEater', itemInternalName: 'Vine', quantityText: '1', chanceText: '50% 100%',
    candidateRecordKey: '8c3172823a4f2aee9eac9ae9cb342a77184f3c9b7a53ebb62e6ac1f4d06da9ac',
    candidateSourceFactKey: 'c7381fbfbe67ce6efa187ee1f911916ae63244da75c2fa33f2eedd18d4483268',
    candidateSourceMaintRecordKey: '2f57c9790cacc1ceb55ed5560cc5bbb141ba8a454816012974dcc6ad81ace348',
    survivorRecordKey: '7df5ffebb5b67f4efaad13527d5cebd00975d163cb83043c554054a9fd006f99',
    survivorSourceFactKey: 'add97e869f75c0381d5f614250eaeedf436fae9443e35a850514a57111999da5',
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

export function hashProjectionGapWikiGgVariantScope({
  operationId = PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
  contractVersion = 1,
  expectedCounts = EXPECTED_COUNTS,
  targets = EXPECTED_TARGETS,
} = {}) {
  return hashJson({ operationId, contractVersion, expectedCounts, targets });
}

export const PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE = hashProjectionGapWikiGgVariantScope();

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

function assertLineage(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) {
    if (String(actual?.[field] ?? '') !== value) throw new Error(`${label} ${field} drifted`);
  }
}

function expectedTarget(candidateRecordKey) {
  return EXPECTED_TARGETS.find((target) => target.candidateRecordKey === candidateRecordKey);
}

function assertExpectedRow(row, label) {
  const expected = expectedTarget(row?.candidateRecordKey);
  if (!expected) throw new Error(`${label} relation record key is outside accepted scope`);
  for (const field of ['npcInternalName', 'itemInternalName', 'candidateSourceFactKey', 'candidateSourceMaintRecordKey', 'quantityText', 'chanceText', 'survivorRecordKey', 'survivorSourceFactKey']) {
    if (String(row?.[field] ?? '') !== String(expected[field] ?? '')) throw new Error(`${label} ${field} drifted`);
  }
  return expected;
}

function assertExactCount(summary) {
  if (Number(summary?.relationLoot) !== EXPECTED_COUNTS.relationLoot) throw new Error('projection gap relation count drifted');
}

export function validateProjectionGapWikiGgVariantInput({ input, preview, previewSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID) {
    throw new Error('projection gap wiki_gg variant retirement input contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('projection gap wiki_gg variant retirement write/network flags are invalid');
  }
  if (preview?.schemaVersion !== 1 || preview.operationId !== PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID) {
    throw new Error('projection gap wiki_gg variant preview contract is invalid');
  }
  if (input.scopeSha256 !== PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE || preview.scopeSha256 !== input.scopeSha256) {
    throw new Error('projection gap wiki_gg variant retirement scope hash drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256) || input.previewSha256 !== previewSha256) {
    throw new Error('projection gap wiki_gg variant retirement preview hash drifted');
  }
  assertExactCount(input.expectedCounts);
  if (JSON.stringify(input.writeTargets) !== JSON.stringify([WRITE_TARGET])) {
    throw new Error('projection gap wiki_gg variant retirement write targets drifted');
  }
  if (preview.applyAllowed !== false || preview.databaseWrites !== false || preview.externalRequests !== false) {
    throw new Error('projection gap wiki_gg variant preview must remain read-only');
  }
  assertLineage(preview.candidateLineage ?? preview.rows?.[0]?.candidateLineage, CANDIDATE_LINEAGE, 'projection gap candidate lineage');
  assertLineage(preview.acceptedSurvivorLineage ?? preview.rows?.[0]?.survivorLineage, SURVIVOR_LINEAGE, 'projection gap survivor lineage');
  const candidateCount = preview.summary.candidateLootRelations ?? preview.summary.relationLoot;
  if (Number(candidateCount) !== 4 || Number(preview.summary.acceptedSurvivors) !== 4
      || preview.summary.localRowsTargeted !== 0 || preview.summary.projectionRowsTargeted !== 0
      || preview.rows?.length !== 4) {
    throw new Error('projection gap wiki_gg variant preview counts drifted');
  }
  const seenCandidates = new Set();
  const seenSurvivors = new Set();
  for (const row of preview.rows) {
    const expected = assertExpectedRow(row, 'projection gap row');
    if (seenCandidates.has(row.candidateRecordKey)) throw new Error('duplicate projection gap candidate');
    if (seenSurvivors.has(row.survivorRecordKey)) throw new Error('duplicate projection gap survivor');
    seenCandidates.add(row.candidateRecordKey);
    seenSurvivors.add(row.survivorRecordKey);
    assertLineage(row.candidateLineage, CANDIDATE_LINEAGE, `projection gap candidate ${row.candidateRecordKey}`);
    assertLineage(row.survivorLineage, SURVIVOR_LINEAGE, `projection gap survivor ${row.survivorRecordKey}`);
    if (row.disposition !== 'quarantine_projection_gap_wiki_gg_variant') throw new Error('projection gap disposition drifted');
  }
  return true;
}

export function buildProjectionGapWikiGgVariantMutationPlan(preview) {
  validateProjectionGapWikiGgVariantInput({
    input: {
      schemaVersion: 1,
      operationId: PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE,
      previewSha256: `sha256:${'0'.repeat(64)}`,
      expectedCounts: EXPECTED_COUNTS,
      writeTargets: [WRITE_TARGET],
    },
    preview,
    previewSha256: `sha256:${'0'.repeat(64)}`,
  });
  const relationLoot = preview.rows.map((row) => required(row.candidateRecordKey, 'projection gap candidate record key'));
  if (new Set(relationLoot).size !== relationLoot.length) throw new Error('duplicate projection gap relation target');
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

async function selectRows(connection, keys, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT * FROM \`${DATABASE}\`.\`item_npc_loot_relations\` WHERE record_key IN (${placeholders(keys)})${lock}`,
    keys,
  );
  return rows;
}

function assertCandidateRows(rows, preview) {
  const expected = new Map(preview.rows.map((row) => [row.candidateRecordKey, row]));
  if (rows.length !== expected.size) throw new Error('projection gap candidate set drifted');
  for (const row of rows) {
    const wanted = expected.get(row.record_key);
    if (!wanted || !active(row)) throw new Error(`projection gap candidate missing or inactive: ${row.record_key}`);
    const target = assertExpectedRow({
      candidateRecordKey: row.record_key,
      npcInternalName: row.npc_internal_name,
      itemInternalName: row.item_internal_name,
      candidateSourceFactKey: row.source_fact_key,
      candidateSourceMaintRecordKey: row.source_maint_record_key,
      quantityText: row.quantity_text,
      chanceText: row.chance_text,
      survivorRecordKey: wanted.survivorRecordKey,
      survivorSourceFactKey: wanted.survivorSourceFactKey,
    }, 'projection gap candidate');
    assertLineage({ sourceProvider: row.source_provider, landingContentHash: row.landing_content_hash, landingSourceKey: row.landing_source_key, sourceMaintTable: row.source_maint_table }, CANDIDATE_LINEAGE, `projection gap candidate ${target.candidateRecordKey}`);
  }
}

function assertSurvivorRows(rows, preview) {
  const expected = new Map(preview.rows.map((row) => [row.survivorRecordKey, row]));
  if (rows.length !== expected.size) throw new Error('projection gap survivor set drifted');
  for (const row of rows) {
    const wanted = expected.get(row.record_key);
    if (!wanted || !active(row)) throw new Error(`projection gap survivor missing or inactive: ${row.record_key}`);
    if (row.source_fact_key !== wanted.survivorSourceFactKey) throw new Error(`projection gap survivor fact drifted: ${row.record_key}`);
    assertLineage({ sourceProvider: row.source_provider, landingContentHash: row.landing_content_hash, landingSourceKey: row.landing_source_key, sourceMaintTable: row.source_maint_table }, SURVIVOR_LINEAGE, `projection gap survivor ${row.record_key}`);
  }
}

async function updateRows(connection, preview) {
  for (const row of preview.rows) {
    const [result] = await connection.execute(
      `UPDATE \`${DATABASE}\`.\`item_npc_loot_relations\`
       SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP
       WHERE record_key = ? AND source_fact_key = ? AND source_provider = ?
         AND landing_content_hash = ? AND landing_source_key = ?
         AND source_maint_table = ? AND source_maint_record_key = ?
         AND status = 1 AND deleted = 0`,
      [row.candidateRecordKey, row.candidateSourceFactKey, CANDIDATE_LINEAGE.sourceProvider,
        CANDIDATE_LINEAGE.landingContentHash, CANDIDATE_LINEAGE.landingSourceKey,
        CANDIDATE_LINEAGE.sourceMaintTable, row.candidateSourceMaintRecordKey],
    );
    if (Number(result?.affectedRows) !== 1) throw new Error(`projection gap affected row count drifted: ${row.candidateRecordKey}`);
  }
}

export async function runProjectionGapWikiGgVariantRetirement({
  repoRoot = process.cwd(),
  inputPath = PROJECTION_GAP_WIKI_GG_VARIANT_INPUT_PATH,
  previewPath = PROJECTION_GAP_WIKI_GG_VARIANT_PREVIEW_PATH,
  apply = false,
  mysqlModule,
} = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const preview = JSON.parse(fs.readFileSync(path.resolve(repoRoot, previewPath), 'utf8'));
  const previewSha256 = hashFile(repoRoot, previewPath);
  validateProjectionGapWikiGgVariantInput({ input, preview, previewSha256 });
  const plan = buildProjectionGapWikiGgVariantMutationPlan(preview);
  if (!apply) return { operationId: PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID, apply: false, scopeSha256: input.scopeSha256, counts: plan.counts, writeTargets: [WRITE_TARGET] };
  const authorizedContext = loadAuthorizedOperationContext({ operationId: PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({ authorizedContext, decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json') });
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const before = await selectRows(connection, plan.keys.relationLoot, { forUpdate: true });
      const survivors = await selectRows(connection, preview.rows.map((row) => row.survivorRecordKey), { forUpdate: true });
      assertCandidateRows(before, preview);
      assertSurvivorRows(survivors, preview);
      await updateRows(connection, preview);
      const after = await selectRows(connection, plan.keys.relationLoot);
      const survivorReadback = await selectRows(connection, preview.rows.map((row) => row.survivorRecordKey));
      const activeTargets = after.filter(active).length;
      if (activeTargets !== 0) throw new Error('projection gap candidate readback found active targets');
      assertSurvivorRows(survivorReadback, preview);
      const readback = { relationLoot: after.length, activeTargets, activeSurvivors: survivorReadback.filter(active).length };
      await connection.commit();
      return {
        schemaVersion: 1,
        resultKind: 'canonical_npc_projection_gap_wiki_gg_variant_retirement_result',
        operationId: PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
        status: 'COMPLETED',
        transactionCommitted: true,
        scopeSha256: input.scopeSha256,
        authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash },
        affected: plan.counts,
        readback,
        preserved: { sourceFacts: true, sourceDetails: true, projectionNpcs: true, localRows: true },
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
  runProjectionGapWikiGgVariantRetirement({
    repoRoot: process.cwd(),
    inputPath: args.input ?? PROJECTION_GAP_WIKI_GG_VARIANT_INPUT_PATH,
    previewPath: args.preview ?? PROJECTION_GAP_WIKI_GG_VARIANT_PREVIEW_PATH,
    apply: args.apply === 'true',
  }).then((result) => {
    if (args.apply === 'true') fs.writeFileSync(path.resolve(process.cwd(), args.output ?? PROJECTION_GAP_WIKI_GG_VARIANT_RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
