#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';

export const PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID =
  'canonical-npc-projection-text-identity-residual-repair';
export const PROJECTION_TEXT_IDENTITY_RESIDUAL_PREVIEW_PATH =
  'reports/runtime/local-data-chain-closure/20260819/post-final/npc-projection-text-identity-residual-preview.json';

const DATABASE = 'terria_v1_relation';
const SOURCE_PROVIDER = 'terraria.wiki.gg';
const SOURCE_MAINT_TABLE = 'maint_item_sources';
const LANDING_SOURCE_KEY = 'generated.npc_item_relations_bundle';
const LANDING_CONTENT_HASH = 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05';
const EXPECTED_COUNTS = Object.freeze({ relationLoot: 2, projectionNpcs: 2 });
const REPORT_ROOT = 'reports/runtime/local-data-chain-closure/20260819/post-final';

export const EXPECTED_TARGETS = Object.freeze([
  Object.freeze({
    npcInternalName: 'CrimsonAxe',
    itemInternalName: 'Nazar',
    projectionId: 179,
    relationId: 3779,
    beforeRelationId: 128,
    relationRecordKey: 'd5f5ac84c046117962a402a194c12f9084b858ff42daa9974d7275ce63636fa5',
    sourceFactKey: '8a926d60439431042f14e30bb61d7cf3aee431e03c26aa50be3f9fd0d20ab245',
    sourceMaintRecordKey: '11cf10672227d212a15d3287e0bd0aac92db0e7cfb8cdc9d2f7ce048946f52f2',
    quantityText: '1',
    chanceText: '{{modes|1%|1.99%}}',
    sourcePage: 'https://terraria.wiki.gg/wiki/Crimson_Axe',
    beforeChanceText: '1% 1.99%',
    beforeSourceFactKey: 'cf18ff25756a712c09f84ec5f748393e34147f3734a1c91f18bfd57a72b77cc3',
    beforeRelationRecordKey: 'a4a51693c3764482eb4356bad860d81b2aad86da7defcafc58206d5bc44afff9',
    beforeSourceMaintRecordKey: 'e97267fa8e5bb24e8224e62eb5bed2627eb319d5eabedf4712a96aa6158058c8',
    beforeSourceMaintId: 1920,
    beforeLandingSourceId: 6180,
    localRetirementId: 81872,
    localSurvivorId: 83374,
  }),
  Object.freeze({
    npcInternalName: 'CursedHammer',
    itemInternalName: 'Nazar',
    projectionId: 83,
    relationId: 3678,
    beforeRelationId: 129,
    relationRecordKey: 'b1dd5ffbdff4a30df259cbfe49f034009f791541382395bc980d6fa5b7def405',
    sourceFactKey: 'e82aa93f49a26172df459d106cd873e155f8e14c0b23d069f1e9a6b7fcc12112',
    sourceMaintRecordKey: '5fecf3ad4d32c84d9fad4ae81b520d0648bf8f2b660b5288a6542575e8699d62',
    quantityText: '1',
    chanceText: '{{modes|1%|1.99%}}',
    sourcePage: 'https://terraria.wiki.gg/wiki/Cursed_Hammer',
    beforeChanceText: '1% 1.99%',
    beforeSourceFactKey: '1890328939c36c9d790b37c92fb7222b716bbbb0fb9521820d15286bb87a30b6',
    beforeRelationRecordKey: '930a37f89e3417c7f5547ebe5206725dbdfd2258256452ecc704ad09f59db552',
    beforeSourceMaintRecordKey: '472009165fa392a578afd866884e6a8a0c691ff609acf1782c6cb5e36053210d',
    beforeSourceMaintId: 1921,
    beforeLandingSourceId: 6180,
    localRetirementId: 81873,
    localSurvivorId: 83362,
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

export function hashProjectionTextIdentityResidualScope({
  operationId = PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID,
  contractVersion = 1,
  expectedCounts = EXPECTED_COUNTS,
  targets = EXPECTED_TARGETS,
} = {}) {
  return hashJson({ operationId, contractVersion, expectedCounts, targets });
}

export const PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE = hashProjectionTextIdentityResidualScope();

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  return value == null ? null : String(value);
}

function parseLoot(value, label) {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed;
  } catch {
    throw new Error(`${label} loot_items_json is invalid`);
  }
}

function assertRelation(target, relation) {
  if (!relation || !active(relation)) throw new Error(`accepted relation missing: ${target.npcInternalName}`);
  const expected = {
    record_key: target.relationRecordKey,
    source_fact_key: target.sourceFactKey,
    source_maint_record_key: target.sourceMaintRecordKey,
    npc_internal_name: target.npcInternalName,
    item_internal_name: target.itemInternalName,
    quantity_text: target.quantityText,
    chance_text: target.chanceText,
    source_provider: SOURCE_PROVIDER,
    source_maint_table: SOURCE_MAINT_TABLE,
    landing_source_key: LANDING_SOURCE_KEY,
    landing_content_hash: LANDING_CONTENT_HASH,
    source_page: target.sourcePage,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (comparable(relation[key]) !== comparable(value)) {
      throw new Error(`accepted relation drifted: ${target.npcInternalName} ${key}`);
    }
  }
}

function assertRetiringRelation(target, relation) {
  if (!relation || !active(relation)) throw new Error(`retiring relation missing: ${target.npcInternalName}`);
  const expected = {
    record_key: target.beforeRelationRecordKey,
    source_fact_key: target.beforeSourceFactKey,
    source_maint_record_key: target.beforeSourceMaintRecordKey,
    npc_internal_name: target.npcInternalName,
    item_internal_name: target.itemInternalName,
    quantity_text: target.quantityText,
    chance_text: target.beforeChanceText,
    source_provider: 'wiki_gg',
    source_maint_table: SOURCE_MAINT_TABLE,
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
    source_page: 'Nazar',
    source_revision_timestamp: '2026-02-19T02:11:12.000Z',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (comparable(relation[key]) !== comparable(value)) {
      throw new Error(`retiring relation drifted: ${target.npcInternalName} ${key}`);
    }
  }
}

function localSummary(row) {
  return {
    localId: Number(row.id),
    npcId: Number(row.npc_id),
    itemId: Number(row.item_id),
    sourceItemId: Number(row.source_item_id),
    dropSourceKind: row.drop_source_kind,
    quantityText: row.quantity_text,
    chanceText: row.chance_text,
    conditions: row.conditions ?? null,
  };
}

function assertLocalRow(target, row, { retirement }) {
  const expectedId = retirement ? target.localRetirementId : target.localSurvivorId;
  const expectedChance = retirement ? target.beforeChanceText : target.chanceText;
  if (!row || !active(row) || Number(row.id) !== expectedId) {
    throw new Error(`local ${retirement ? 'retirement' : 'survivor'} missing: ${target.npcInternalName}`);
  }
  const expected = {
    npc_id: target.projectionId,
    item_id: 891,
    source_item_id: 891,
    drop_source_kind: 'npc_drop',
    quantity_text: target.quantityText,
    chance_text: expectedChance,
    conditions: null,
  };
  for (const [key, value] of Object.entries(expected)) {
    if ((row[key] ?? null) !== value) {
      throw new Error(`local ${retirement ? 'retirement' : 'survivor'} drifted: ${target.npcInternalName} ${key}`);
    }
  }
}

function frozenProjectionEntry(target, entry) {
  return entry?.relationType === 'loot'
    && entry.itemInternalName === target.itemInternalName
    && entry.quantityText === target.quantityText
    && entry.chanceText === target.beforeChanceText
    && entry.sourceFactKey === target.beforeSourceFactKey
    && entry.relationRecordKey === target.beforeRelationRecordKey
    && entry.sourceProvider === 'wiki_gg';
}

function buildRow(target, relation, retiringRelation, projection, localRetirement, localSurvivor) {
  if (!projection || !active(projection) || Number(projection.id) !== target.projectionId
      || projection.internal_name !== target.npcInternalName) {
    throw new Error(`target projection drifted: ${target.npcInternalName}`);
  }
  const beforeLootItems = parseLoot(projection.loot_items_json, target.npcInternalName);
  const matchingIndexes = beforeLootItems
    .map((entry, index) => (frozenProjectionEntry(target, entry) ? index : -1))
    .filter((index) => index >= 0);
  if (matchingIndexes.length !== 1) {
    throw new Error(`frozen projection identity missing: ${target.npcInternalName}`);
  }
  const targetIndex = matchingIndexes[0];
  const beforeLootItem = beforeLootItems[targetIndex];
  const afterLootItem = {
    ...beforeLootItem,
    chanceText: relation.chance_text,
    quantityText: relation.quantity_text,
    sourceFactKey: relation.source_fact_key,
    relationRecordKey: relation.record_key,
    sourceProvider: relation.source_provider,
    sourcePage: relation.source_page,
    sourceRevisionTimestamp: relation.source_revision_timestamp ?? null,
  };
  const afterLootItems = beforeLootItems.map((entry, index) => (index === targetIndex ? afterLootItem : entry));
  assertRetiringRelation(target, retiringRelation);
  assertLocalRow(target, localRetirement, { retirement: true });
  assertLocalRow(target, localSurvivor, { retirement: false });
  return {
    relationRecordKey: target.relationRecordKey,
    relationId: Number(relation.id),
    sourceFactKey: target.sourceFactKey,
    npcInternalName: target.npcInternalName,
    itemInternalName: target.itemInternalName,
    sourceMaintRecordKey: target.sourceMaintRecordKey,
    quantityText: target.quantityText,
    chanceText: target.chanceText,
    projectionId: target.projectionId,
    projectionInternalName: target.npcInternalName,
    targetIndex,
    beforeLootItems,
    afterLootItems,
    beforeLootItem,
    afterLootItem,
    sourceProvider: SOURCE_PROVIDER,
    sourceMaintTable: SOURCE_MAINT_TABLE,
    landingSourceKey: LANDING_SOURCE_KEY,
    landingContentHash: LANDING_CONTENT_HASH,
    relationRetirement: {
      relationId: Number(retiringRelation.id),
      recordKey: retiringRelation.record_key,
      sourceFactKey: retiringRelation.source_fact_key,
      sourceMaintRecordKey: retiringRelation.source_maint_record_key,
      sourceMaintId: retiringRelation.source_maint_id == null ? null : Number(retiringRelation.source_maint_id),
      landingSourceId: retiringRelation.landing_source_id == null ? null : Number(retiringRelation.landing_source_id),
      sourceProvider: retiringRelation.source_provider,
      landingSourceKey: retiringRelation.landing_source_key,
      landingContentHash: retiringRelation.landing_content_hash,
      quantityText: retiringRelation.quantity_text,
      chanceText: retiringRelation.chance_text,
      conditions: retiringRelation.conditions ?? null,
    },
    localRetirement: localSummary(localRetirement),
    localSurvivor: localSummary(localSurvivor),
  };
}

export function buildProjectionTextIdentityResidualPreview({ relations, projections, localRows } = {}) {
  if (!Array.isArray(relations) || !Array.isArray(projections) || !Array.isArray(localRows)) {
    throw new Error('relations, projections, and localRows must be arrays');
  }
  if (relations.length !== EXPECTED_TARGETS.length * 2 || projections.length !== EXPECTED_TARGETS.length) {
    throw new Error('target set drifted');
  }
  if (localRows.length !== EXPECTED_TARGETS.length * 2) throw new Error('local target set drifted');
  const relationByKey = new Map(relations.map((row) => [row.record_key, row]));
  const projectionById = new Map(projections.map((row) => [Number(row.id), row]));
  const localById = new Map(localRows.map((row) => [Number(row.id), row]));
  const rows = EXPECTED_TARGETS.map((target) => {
    const relation = relationByKey.get(target.relationRecordKey);
    assertRelation(target, relation);
    return buildRow(
      target,
      relation,
      relationByKey.get(target.beforeRelationRecordKey),
      projectionById.get(target.projectionId),
      localById.get(target.localRetirementId),
      localById.get(target.localSurvivorId),
    );
  });
  return {
    schemaVersion: 1,
    resultKind: 'npc_projection_text_identity_residual_preview',
    operationId: PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID,
    generatedAt: new Date().toISOString(),
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE,
    summary: {
      acceptedRelationLoot: EXPECTED_COUNTS.relationLoot,
      relationRowsToRetire: EXPECTED_COUNTS.relationLoot,
      projectionNpcsToReplace: EXPECTED_COUNTS.projectionNpcs,
      localRowsToRetire: EXPECTED_COUNTS.relationLoot,
      sourceFactsTargeted: 0,
      sourceDetailsTargeted: 0,
    },
    rows,
  };
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

export async function loadProjectionTextIdentityResidualPreview({ repoRoot = process.cwd(), mysqlModule } = {}) {
  const mysql = loadMysqlModule({ repoRoot, mysqlModule });
  const connection = await mysql.createConnection(configFor(repoRoot));
  try {
    const relationKeys = EXPECTED_TARGETS.flatMap((target) => [
      target.relationRecordKey,
      target.beforeRelationRecordKey,
    ]);
    const projectionIds = EXPECTED_TARGETS.map((target) => target.projectionId);
    const localIds = EXPECTED_TARGETS.flatMap((target) => [target.localRetirementId, target.localSurvivorId]);
    const placeholders = (values) => values.map(() => '?').join(', ');
    const [relations] = await connection.execute(
      `SELECT * FROM \`${DATABASE}\`.\`item_npc_loot_relations\` WHERE record_key IN (${placeholders(relationKeys)})`,
      relationKeys,
    );
    const [projections] = await connection.execute(
      `SELECT * FROM \`${DATABASE}\`.\`projection_npcs\` WHERE id IN (${placeholders(projectionIds)})`,
      projectionIds,
    );
    const [localRows] = await connection.execute(
      `SELECT * FROM \`terria_v1_local\`.\`npc_loot_entries\` WHERE id IN (${placeholders(localIds)})`,
      localIds,
    );
    return buildProjectionTextIdentityResidualPreview({ relations, projections, localRows });
  } finally {
    await connection.end();
  }
}

function booleanArgument(value, label) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${label} must be true or false`);
}

function resolveReportOutputPath(repoRoot, output) {
  const reportRoot = path.resolve(repoRoot, REPORT_ROOT);
  const resolved = path.resolve(repoRoot, output);
  const relative = path.relative(reportRoot, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('preview output must be inside the date-scoped report root');
  }
  return path.relative(repoRoot, resolved).split(path.sep).join('/');
}

export function parseProjectionTextIdentityResidualPreviewArgs(argv, { repoRoot = process.cwd() } = {}) {
  const raw = {};
  for (const arg of argv) {
    if (!String(arg).startsWith('--')) throw new Error(`unknown argument: ${arg}`);
    const [key, ...parts] = String(arg).slice(2).split('=');
    if (!['write-report', 'output', 'apply', 'write-db'].includes(key)) {
      throw new Error(`unknown argument: --${key}`);
    }
    raw[key] = parts.join('=') || 'true';
  }
  if (raw.apply === 'true' || raw['write-db'] === 'true') {
    throw new Error('projection text identity residual preview is read-only');
  }
  if (raw.apply != null) booleanArgument(raw.apply, 'apply');
  if (raw['write-db'] != null) booleanArgument(raw['write-db'], 'write-db');
  const writeReport = raw['write-report'] == null
    ? false
    : booleanArgument(raw['write-report'], 'write-report');
  if (raw.output != null && !writeReport) {
    throw new Error('output requires --write-report=true');
  }
  return {
    writeReport,
    output: writeReport
      ? resolveReportOutputPath(repoRoot, raw.output ?? PROJECTION_TEXT_IDENTITY_RESIDUAL_PREVIEW_PATH)
      : null,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = parseProjectionTextIdentityResidualPreviewArgs(process.argv.slice(2));
  const outputPath = args.output == null ? null : path.resolve(process.cwd(), args.output);
  loadProjectionTextIdentityResidualPreview().then((preview) => {
    if (args.writeReport) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(preview, null, 2)}\n`, { mode: 0o600 });
    }
    process.stdout.write(`${JSON.stringify(preview)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
