#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

export const INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID = 'canonical-npc-independent-wiki-gg-variant-retirement';
export const INDEPENDENT_WIKI_GG_VARIANT_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-independent-wiki-gg-variant-retirement-preview.json';

export const TARGET_LINEAGE = Object.freeze({
  sourceProvider: 'wiki_gg',
  landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
  landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  sourceMaintTable: 'maint_item_sources',
});

export const ACCEPTED_SURVIVOR_LINEAGE = Object.freeze({
  sourceProvider: 'terraria.wiki.gg',
  landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
});

const DEFAULTS = Object.freeze({
  relationDatabase: 'terria_v1_relation',
  writeReport: true,
  output: INDEPENDENT_WIKI_GG_VARIANT_PREVIEW_PATH,
});

function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function normalizedCondition(value) {
  const result = text(value);
  return result === 'Normal mode row' ? null : result;
}

function runtimeIdentity(row) {
  return JSON.stringify([
    text(row?.npcInternalName),
    text(row?.itemInternalName),
    text(row?.quantityText),
    text(row?.chanceText),
    normalizedCondition(row?.conditions),
  ]);
}

function lineageMatches(row, lineage) {
  return Object.entries(lineage).every(([field, expected]) => text(row?.[field]) === expected);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashScope(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function compactLineage(row) {
  return {
    sourceProvider: text(row?.sourceProvider),
    landingContentHash: text(row?.landingContentHash),
    landingSourceKey: text(row?.landingSourceKey),
    sourceMaintTable: text(row?.sourceMaintTable),
  };
}

function indexByRuntimeIdentity(rows) {
  const index = new Map();
  for (const row of rows) {
    const key = runtimeIdentity(row);
    const values = index.get(key) ?? [];
    values.push(row);
    index.set(key, values);
  }
  return index;
}

function sortRows(rows) {
  return [...rows].sort((left, right) => String(left.candidateRecordKey).localeCompare(String(right.candidateRecordKey)));
}

export function buildIndependentWikiGgVariantRetirementPreview({
  targetRelations = [],
  acceptedRelations = [],
  sourceFacts = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const factsByKey = new Map(sourceFacts.filter(active).map((row) => [text(row.recordKey), row]));
  const acceptedByIdentity = indexByRuntimeIdentity(
    acceptedRelations.filter((row) => active(row) && lineageMatches(row, ACCEPTED_SURVIVOR_LINEAGE)),
  );
  const quarantine = {
    noAcceptedSurvivor: [],
    ambiguousSurvivor: [],
    sourceFactLineageDrift: [],
  };
  const rows = [];

  for (const target of targetRelations
    .filter((row) => active(row) && lineageMatches(row, TARGET_LINEAGE))
    .sort((left, right) => String(left.recordKey).localeCompare(String(right.recordKey)))) {
    const candidateRecordKey = text(target.recordKey);
    const sourceFactKey = text(target.sourceFactKey);
    const candidate = {
      candidateRecordKey,
      sourceFactKey,
      sourceMaintRecordKey: text(target.sourceMaintRecordKey),
      stableIdentity: runtimeIdentity(target),
      candidateLineage: compactLineage(target),
    };
    const fact = factsByKey.get(sourceFactKey);
    if (!fact || !lineageMatches(fact, TARGET_LINEAGE)) {
      quarantine.sourceFactLineageDrift.push(candidate);
      continue;
    }
    const survivors = acceptedByIdentity.get(candidate.stableIdentity) ?? [];
    if (survivors.length === 0) {
      quarantine.noAcceptedSurvivor.push(candidate);
      continue;
    }
    if (survivors.length !== 1) {
      quarantine.ambiguousSurvivor.push({
        ...candidate,
        acceptedSurvivorRecordKeys: survivors.map((row) => text(row.recordKey)).sort(),
      });
      continue;
    }
    const survivor = survivors[0];
    rows.push({
      ...candidate,
      expectedAcceptedSurvivors: [{
        recordKey: text(survivor.recordKey),
        sourceFactKey: text(survivor.sourceFactKey),
        sourceMaintRecordKey: text(survivor.sourceMaintRecordKey),
        lineage: compactLineage(survivor),
      }],
      disposition: 'quarantine_independent_wiki_gg_variant',
    });
  }

  const sortedRows = sortRows(rows);
  for (const values of Object.values(quarantine)) values.sort((left, right) => (
    String(left.candidateRecordKey).localeCompare(String(right.candidateRecordKey))
  ));
  const scope = {
    operationId: INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
    disposition: { status: 0, deleted: 1, action: 'soft_disable_relation_only_after_separate_authorization' },
    writeTargets: ['relation.item_npc_loot_relations.independent_wiki_gg_variant'],
    targetLineage: TARGET_LINEAGE,
    acceptedSurvivorLineage: ACCEPTED_SURVIVOR_LINEAGE,
    targets: sortedRows.map((row) => ({
      candidateRecordKey: row.candidateRecordKey,
      sourceFactKey: row.sourceFactKey,
      sourceMaintRecordKey: row.sourceMaintRecordKey,
      stableIdentity: row.stableIdentity,
      expectedAcceptedSurvivorRecordKeys: row.expectedAcceptedSurvivors.map((survivor) => survivor.recordKey),
    })),
  };

  return {
    schemaVersion: 1,
    reportKind: 'npc_independent_wiki_gg_variant_retirement_preview',
    generatedAt,
    operationId: INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
    readOnly: true,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    targetLineage: TARGET_LINEAGE,
    acceptedSurvivorLineage: ACCEPTED_SURVIVOR_LINEAGE,
    scopeSha256: hashScope(scope),
    summary: {
      candidateLootRelations: sortedRows.length,
      candidateSourceFacts: new Set(sortedRows.map((row) => row.sourceFactKey)).size,
      acceptedSurvivors: new Set(sortedRows.flatMap((row) => row.expectedAcceptedSurvivors.map((survivor) => survivor.recordKey))).size,
      localRowsTargeted: 0,
      projectionRowsTargeted: 0,
      quarantined: Object.fromEntries(Object.entries(quarantine).map(([key, values]) => [key, values.length])),
    },
    rows: sortedRows,
    quarantine,
  };
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

function relationSql(database) {
  return `SELECT record_key AS recordKey, source_fact_key AS sourceFactKey,
    npc_internal_name AS npcInternalName, item_internal_name AS itemInternalName,
    quantity_text AS quantityText, chance_text AS chanceText, conditions,
    source_maint_record_key AS sourceMaintRecordKey,
    source_provider AS sourceProvider, landing_content_hash AS landingContentHash,
    landing_source_key AS landingSourceKey, source_maint_table AS sourceMaintTable,
    status, deleted
    FROM \`${database}\`.\`item_npc_loot_relations\``;
}

function factsSql(database) {
  return `SELECT record_key AS recordKey, source_provider AS sourceProvider,
    landing_content_hash AS landingContentHash, landing_source_key AS landingSourceKey,
    source_maint_table AS sourceMaintTable, status, deleted
    FROM \`${database}\`.\`item_source_facts\``;
}

export async function loadIndependentWikiGgVariantRetirementPreviewInputs(connection, { relationDatabase = DEFAULTS.relationDatabase } = {}) {
  const targetWhere = ' WHERE source_provider = ? AND landing_content_hash = ? AND landing_source_key = ? AND source_maint_table = ?';
  const acceptedWhere = targetWhere;
  const [targetRows] = await connection.execute(`${relationSql(relationDatabase)}${targetWhere}`, Object.values(TARGET_LINEAGE));
  const [acceptedRows] = await connection.execute(`${relationSql(relationDatabase)}${acceptedWhere}`, Object.values(ACCEPTED_SURVIVOR_LINEAGE));
  const [factRows] = await connection.execute(`${factsSql(relationDatabase)}${targetWhere}`, Object.values(TARGET_LINEAGE));
  return { targetRelations: targetRows, acceptedRelations: acceptedRows, sourceFacts: factRows };
}

export async function runIndependentWikiGgVariantRetirementPreview({
  repoRoot = process.cwd(),
  relationDatabase = DEFAULTS.relationDatabase,
  mysqlModule,
} = {}) {
  const mysql = await loadMysqlModule({ repoRoot, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(repoRoot));
  try {
    const inputs = await loadIndependentWikiGgVariantRetirementPreviewInputs(connection, { relationDatabase });
    return buildIndependentWikiGgVariantRetirementPreview(inputs);
  } finally {
    await connection.end();
  }
}

function booleanOption(value, fallback) {
  if (value == null) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error('write-report must be true or false');
}

function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) throw new Error(`unsupported argument: ${token}`);
    const [key, ...parts] = token.slice(2).split('=');
    if (key === 'apply') throw new Error('independent wiki_gg variant preview is read-only and rejects --apply');
    if (!['write-report', 'output', 'relation-database'].includes(key)) throw new Error(`unsupported argument: --${key}`);
    raw[key] = parts.length ? parts.join('=') : 'true';
  }
  return {
    relationDatabase: raw['relation-database'] ?? DEFAULTS.relationDatabase,
    writeReport: booleanOption(raw['write-report'], DEFAULTS.writeReport),
    output: raw.output ?? DEFAULTS.output,
  };
}

async function writeReport(repoRoot, output, report) {
  const absolute = path.resolve(repoRoot, output);
  if (!absolute.startsWith(`${repoRoot}${path.sep}`)) throw new Error('preview output must stay inside the repository');
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return path.relative(repoRoot, absolute).replaceAll('\\', '/');
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const options = parseArgs();
  runIndependentWikiGgVariantRetirementPreview(options).then(async (report) => {
    const reportPath = options.writeReport ? await writeReport(process.cwd(), options.output, report) : null;
    process.stdout.write(`${JSON.stringify({ reportKind: report.reportKind, scopeSha256: report.scopeSha256, summary: report.summary, reportPath })}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
