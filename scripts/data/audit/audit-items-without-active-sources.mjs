#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline'
]);

export function parseAuditItemsWithoutActiveSourcesArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key) && value !== false && value !== 'false') {
      throw new Error(`read-only audit refuses mutation flag: --${key}`);
    }
  }
  return {
    outputPath: options.output ?? null,
    localDatabase: options['local-database'] ?? options.localDatabase ?? 'terria_v1_local',
    maintDatabase: options['maint-database'] ?? options.maintDatabase ?? 'terria_v1_maint',
    relationDatabase: options['relation-database'] ?? options.relationDatabase ?? 'terria_v1_relation',
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null
  };
}

export function buildItemsWithoutActiveSourcesReport({
  generatedAt = new Date().toISOString(),
  items = [],
  activeSourceCounts = new Map(),
  rawSourceInternalNames = new Set(),
  maintSourceCounts = new Map(),
  relationFactCounts = new Map(),
  recipeItemIds = new Set(),
  npcRelationItemIds = new Set(),
  biomeEvidenceItemIds = new Set(),
  exemptions = new Map(),
  warnings = []
} = {}) {
  const normalizedRawSourceInternalNames = normalizeSet(rawSourceInternalNames);
  const rows = items
    .map((rawItem) => normalizeItem(rawItem))
    .filter((item) => item.itemId != null)
    .sort((a, b) => a.itemId - b.itemId)
    .map((item) => buildCoverageRow(item, {
      activeSourceCounts,
      rawSourceInternalNames: normalizedRawSourceInternalNames,
      maintSourceCounts,
      relationFactCounts,
      recipeItemIds,
      npcRelationItemIds,
      biomeEvidenceItemIds,
      exemptions
    }));

  return {
    generatedAt,
    readOnly: true,
    entity: 'items_without_active_sources_audit',
    summary: buildSummary(rows),
    warnings,
    rows
  };
}

export async function runAuditItemsWithoutActiveSources(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlModule = dependencies.mysqlModule ?? require('mysql2/promise');
  const connectionConfig = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: options.localDatabase ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };
  if (connectionConfig.database !== 'terria_v1_local') {
    throw new Error(`Refusing item source coverage audit against non-local database: ${connectionConfig.database}`);
  }

  const connection = dependencies.connection ?? await mysqlModule.createConnection(connectionConfig);
  const shouldClose = !dependencies.connection;
  const warnings = [];
  try {
    const localDatabase = options.localDatabase ?? 'terria_v1_local';
    const maintDatabase = options.maintDatabase ?? 'terria_v1_maint';
    const relationDatabase = options.relationDatabase ?? 'terria_v1_relation';
    const [
      items,
      activeSourceCounts,
      recipeItemIds,
      npcRelationItemIds,
      biomeEvidenceItemIds,
      maintSourceCounts,
      relationFactCounts
    ] = await Promise.all([
      loadItems(connection, localDatabase),
      loadCountsByItemId(connection, localDatabase, 'item_acquisition_sources', 'item_id', 'status = 1 AND deleted = 0', warnings),
      loadIdSet(connection, localDatabase, 'recipes', 'result_item_id', 'status = 1 AND deleted = 0', warnings),
      loadNpcRelationItemIds(connection, localDatabase, warnings),
      loadBiomeEvidenceItemIds(connection, localDatabase, warnings),
      loadMaintSourceCounts(connection, maintDatabase, localDatabase, warnings),
      loadRelationFactCounts(connection, relationDatabase, localDatabase, warnings)
    ]);

    const report = buildItemsWithoutActiveSourcesReport({
      generatedAt: now.toISOString(),
      items,
      activeSourceCounts,
      recipeItemIds,
      npcRelationItemIds,
      biomeEvidenceItemIds,
      maintSourceCounts,
      relationFactCounts,
      warnings
    });

    if (options.outputPath) {
      writeJson(path.resolve(process.cwd(), options.outputPath), report);
    }
    return report;
  } finally {
    if (shouldClose) {
      await connection.end();
    }
  }
}

function buildCoverageRow(item, sources) {
  const activeSourceCount = Number(sources.activeSourceCounts.get(item.itemId) ?? 0);
  const maintSourceCount = Number(sources.maintSourceCounts.get(item.itemId) ?? 0);
  const relationFactCount = Number(sources.relationFactCounts.get(item.itemId) ?? 0);
  const hasRawItemPageSource = sources.rawSourceInternalNames.has(normalizeIdentity(item.internalName));
  const hasMaintSource = maintSourceCount > 0;
  const hasRelationFact = relationFactCount > 0;
  const hasRecipe = sources.recipeItemIds.has(item.itemId);
  const hasNpcLootOrShop = sources.npcRelationItemIds.has(item.itemId);
  const hasBiomeEvidence = sources.biomeEvidenceItemIds.has(item.itemId);
  const exemption = sources.exemptions.get(item.itemId) ?? sources.exemptions.get(item.internalName) ?? null;
  const hasAnyEvidence = hasRawItemPageSource || hasMaintSource || hasRelationFact || hasRecipe || hasNpcLootOrShop || hasBiomeEvidence;

  let primaryBucket = 'unclassified_no_source_evidence';
  let blockedReason = 'no_source_evidence_found';
  let exemptionStatus = exemption ? 'eligible' : null;

  if (activeSourceCount > 0) {
    primaryBucket = 'local_source_already_present';
    blockedReason = null;
  } else if (hasMaintSource || hasRelationFact) {
    primaryBucket = 'publication_chain_gap';
    blockedReason = 'maint_or_relation_source_not_published_to_local';
  } else if (hasRawItemPageSource) {
    primaryBucket = 'raw_source_chain_gap';
    blockedReason = 'raw_item_page_source_not_planned_or_published';
  } else if (hasRecipe) {
    primaryBucket = 'recipe_chain_covered';
    blockedReason = null;
  } else if (hasBiomeEvidence) {
    primaryBucket = 'biome_evidence_only';
    blockedReason = null;
  } else if (hasNpcLootOrShop) {
    primaryBucket = 'npc_relation_chain_gap';
    blockedReason = 'npc_loot_or_shop_not_projected_to_item_sources';
  } else if (exemption) {
    primaryBucket = 'explicit_no_source_exemption';
    blockedReason = null;
  }

  if (exemption && hasAnyEvidence) {
    exemptionStatus = 'ignored_due_to_existing_evidence';
  }

  return {
    ...item,
    activeSourceCount,
    hasRawItemPageSource,
    hasMaintSource,
    maintSourceCount,
    hasRelationFact,
    relationFactCount,
    hasRecipe,
    hasNpcLootOrShop,
    hasBiomeEvidence,
    exemptionStatus,
    exemptionRule: exemption?.rule ?? null,
    exemptionReportPath: exemption?.reportPath ?? null,
    primaryBucket,
    blockedReason,
    evidence: buildEvidence({
      hasRawItemPageSource,
      maintSourceCount,
      relationFactCount,
      hasRecipe,
      hasNpcLootOrShop,
      hasBiomeEvidence,
      exemption
    })
  };
}

function buildEvidence({
  hasRawItemPageSource,
  maintSourceCount,
  relationFactCount,
  hasRecipe,
  hasNpcLootOrShop,
  hasBiomeEvidence,
  exemption
}) {
  const evidence = [];
  if (hasRawItemPageSource) evidence.push({ kind: 'raw_item_page_source' });
  if (maintSourceCount > 0) evidence.push({ kind: 'maint_item_sources', count: maintSourceCount });
  if (relationFactCount > 0) evidence.push({ kind: 'relation_item_source_facts', count: relationFactCount });
  if (hasRecipe) evidence.push({ kind: 'recipes' });
  if (hasNpcLootOrShop) evidence.push({ kind: 'npc_loot_or_shop' });
  if (hasBiomeEvidence) evidence.push({ kind: 'biome_evidence' });
  if (exemption) evidence.push({ kind: 'explicit_exemption', rule: exemption.rule, reportPath: exemption.reportPath });
  return evidence;
}

function buildSummary(rows) {
  const summary = {
    totalItems: rows.length,
    itemsWithoutActiveSources: rows.filter((row) => row.activeSourceCount === 0).length,
    unclassifiedNoSourceEvidence: 0,
    sourceChainBroken: 0,
    recipeChainCovered: 0,
    biomeEvidenceOnly: 0,
    npcRelationChainGap: 0,
    exemptedNoSourceRequired: 0,
    localSourceAlreadyPresent: 0,
    bucketCounts: {}
  };
  for (const row of rows) {
    summary.bucketCounts[row.primaryBucket] = (summary.bucketCounts[row.primaryBucket] ?? 0) + 1;
    if (row.primaryBucket === 'unclassified_no_source_evidence') summary.unclassifiedNoSourceEvidence += 1;
    if (['raw_source_chain_gap', 'publication_chain_gap'].includes(row.primaryBucket)) summary.sourceChainBroken += 1;
    if (row.primaryBucket === 'recipe_chain_covered') summary.recipeChainCovered += 1;
    if (row.primaryBucket === 'biome_evidence_only') summary.biomeEvidenceOnly += 1;
    if (row.primaryBucket === 'npc_relation_chain_gap') summary.npcRelationChainGap += 1;
    if (row.primaryBucket === 'explicit_no_source_exemption') summary.exemptedNoSourceRequired += 1;
    if (row.primaryBucket === 'local_source_already_present') summary.localSourceAlreadyPresent += 1;
  }
  return summary;
}

async function loadItems(connection, database) {
  const [rows] = await connection.execute(
    `SELECT
       i.id,
       i.internal_name,
       i.name,
       i.category_id,
       c.code AS category_code,
       c.name AS category_name
     FROM \`${database}\`.\`items\` i
     LEFT JOIN \`${database}\`.\`category\` c ON c.id = i.category_id AND c.deleted = 0
     WHERE i.status = 1 AND i.deleted = 0
     ORDER BY i.id`
  );
  return Array.isArray(rows) ? rows : [];
}

async function loadCountsByItemId(connection, database, tableName, columnName, whereClause, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT \`${columnName}\` AS itemId, COUNT(*) AS rowCount
       FROM \`${database}\`.\`${tableName}\`
       WHERE ${whereClause}
       GROUP BY \`${columnName}\``
    );
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.itemId), Number(row.rowCount)]));
  } catch (error) {
    warnings.push({ table: `${database}.${tableName}`, reason: 'count_unavailable', message: error.message });
    return new Map();
  }
}

async function loadIdSet(connection, database, tableName, columnName, whereClause, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT DISTINCT \`${columnName}\` AS itemId
       FROM \`${database}\`.\`${tableName}\`
       WHERE ${whereClause}`
    );
    return new Set((Array.isArray(rows) ? rows : []).map((row) => Number(row.itemId)).filter(Number.isInteger));
  } catch (error) {
    warnings.push({ table: `${database}.${tableName}`, reason: 'id_set_unavailable', message: error.message });
    return new Set();
  }
}

async function loadNpcRelationItemIds(connection, database, warnings) {
  const ids = new Set();
  for (const tableName of ['npc_loot_entries', 'npc_shop_entries']) {
    const tableIds = await loadIdSet(connection, database, tableName, 'item_id', 'status = 1 AND deleted = 0 AND item_id IS NOT NULL', warnings);
    for (const id of tableIds) ids.add(id);
  }
  return ids;
}

async function loadBiomeEvidenceItemIds(connection, database, warnings) {
  const ids = new Set();
  for (const [tableName, whereClause] of [
    ['item_biomes', 'item_id IS NOT NULL'],
    ['item_acquisition_sources', "status = 1 AND deleted = 0 AND source_ref_type = 'biome_wikitext' AND item_id IS NOT NULL"]
  ]) {
    const tableIds = await loadIdSet(connection, database, tableName, 'item_id', whereClause, warnings);
    for (const id of tableIds) ids.add(id);
  }
  return ids;
}

async function loadMaintSourceCounts(connection, maintDatabase, localDatabase, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT i.id AS itemId, COUNT(*) AS rowCount
       FROM \`${maintDatabase}\`.\`maint_item_sources\` m
       JOIN \`${localDatabase}\`.\`items\` i
         ON LOWER(TRIM(i.internal_name)) = LOWER(TRIM(m.item_internal_name))
       WHERE m.status = 1 AND m.deleted = 0
       GROUP BY i.id`
    );
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.itemId), Number(row.rowCount)]));
  } catch (error) {
    warnings.push({ table: `${maintDatabase}.maint_item_sources`, reason: 'count_unavailable', message: error.message });
    return new Map();
  }
}

async function loadRelationFactCounts(connection, relationDatabase, localDatabase, warnings) {
  try {
    const [rows] = await connection.execute(
      `SELECT i.id AS itemId, COUNT(*) AS rowCount
       FROM \`${relationDatabase}\`.\`item_source_facts\` f
       JOIN \`${localDatabase}\`.\`items\` i ON i.id = f.item_id
       WHERE f.status = 1 AND f.deleted = 0
       GROUP BY i.id`
    );
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [Number(row.itemId), Number(row.rowCount)]));
  } catch (error) {
    warnings.push({ table: `${relationDatabase}.item_source_facts`, reason: 'count_unavailable', message: error.message });
    return new Map();
  }
}

function normalizeItem(row) {
  return {
    itemId: toInteger(row.itemId ?? row.id),
    internalName: normalizeText(row.internalName ?? row.internal_name),
    name: normalizeText(row.name),
    categoryId: toInteger(row.categoryId ?? row.category_id),
    categoryCode: normalizeText(row.categoryCode ?? row.category_code),
    categoryName: normalizeText(row.categoryName ?? row.category_name)
  };
}

function normalizeSet(values) {
  return new Set(Array.from(values ?? []).map((value) => normalizeIdentity(value)).filter(Boolean));
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAuditItemsWithoutActiveSources(parseAuditItemsWithoutActiveSourcesArgs())
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
