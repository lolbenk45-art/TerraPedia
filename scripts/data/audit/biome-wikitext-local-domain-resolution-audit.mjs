#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..', '..');
const ALLOWED_ARGS = new Set(['input', 'output']);
const DEFAULT_DB_NAME = 'terria_v1_local';
const REQUIRED_ORIGINAL_FIELDS = [
  'index',
  'rowKey',
  'biomeCode',
  'pageTitle',
  'matchType',
  'matchStatus',
  'section',
  'source',
  'name',
  'candidateMatches',
  'needsUserDecision'
];
const ALLOWED_RECOMMENDATIONS = new Set([
  'evidence_armor_set_single_candidate',
  'evidence_armor_set_variant_needs_decision',
  'evidence_boss_treasure_bag_projection',
  'ambiguous_npc_variant_needs_decision',
  'missing_local_entity_needs_backfill',
  'unresolved_local_domain_gap'
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    const key = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body;
    if (!ALLOWED_ARGS.has(key)) throw new Error(`Unknown option: --${key}`);
    args[key] = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : 'true';
  }
  if (!toNullableText(args.input)) throw new Error('--input is required');
  return {
    input: args.input,
    output: args.output ?? defaultOutputPath()
  };
}

export function buildConnectionConfig(env = process.env) {
  const database = toNullableText(env.TERRAPEDIA_DB_NAME) ?? DEFAULT_DB_NAME;
  if (database !== DEFAULT_DB_NAME) {
    throw new Error(`Refusing non-local database '${database}' for local domain audit`);
  }
  const base = {
    user: toNullableText(env.TERRAPEDIA_DB_USERNAME) ?? 'root',
    password: toNullableText(env.TERRAPEDIA_DB_PASSWORD) ?? '',
    database
  };
  const socketPath = toNullableText(env.TERRAPEDIA_DB_SOCKET);
  if (socketPath) return { socketPath, ...base };
  return {
    host: toNullableText(env.TERRAPEDIA_DB_HOST) ?? '127.0.0.1',
    port: Number(toNullableText(env.TERRAPEDIA_DB_PORT) ?? 3306),
    ...base
  };
}

export async function auditBiomeWikitextLocalDomainResolution({ unresolvedReport, loadEvidenceForRow, generatedAt = new Date().toISOString() }) {
  const rows = [];
  for (const original of Array.isArray(unresolvedReport?.rows) ? unresolvedReport.rows : []) {
    const evidence = normalizeEvidence(await loadEvidenceForRow(original));
    const recommendation = classifyDomainRecommendation({ original, evidence });
    rows.push({
      inputIndex: original.index,
      original: cloneOriginal(original),
      itemExactMatches: evidence.itemExact,
      itemLikeMatches: evidence.itemLike,
      npcExactMatches: evidence.npcExact,
      npcLikeMatches: evidence.npcLike,
      armorSetCandidates: evidence.armorSetCandidates,
      bossLootCandidates: evidence.bossLootCandidates,
      recommendation,
      evidenceOnly: true,
      needsUserDecision: true
    });
  }
  return {
    entity: 'biome_wikitext_local_domain_resolution_audit',
    generatedAt,
    sourceReportPath: unresolvedReport?.sourceReportPath ?? null,
    sourceGeneratedAt: unresolvedReport?.generatedAt ?? null,
    summary: summarizeRows(rows),
    rows
  };
}

export function classifyDomainRecommendation({ original, evidence }) {
  const armorSetCandidates = Array.isArray(evidence?.armorSetCandidates) ? evidence.armorSetCandidates : [];
  const bossLootCandidates = Array.isArray(evidence?.bossLootCandidates) ? evidence.bossLootCandidates : [];
  const npcExact = Array.isArray(evidence?.npcExact) ? evidence.npcExact : [];

  if (original?.matchType === 'item' && bossLootCandidates.length > 0) {
    return 'evidence_boss_treasure_bag_projection';
  }
  if (original?.matchType === 'item' && armorSetCandidates.length === 1) {
    const setCount = Number(armorSetCandidates[0]?.setCount ?? 0);
    return setCount > 1 ? 'evidence_armor_set_variant_needs_decision' : 'evidence_armor_set_single_candidate';
  }
  if (original?.matchType === 'item' && armorSetCandidates.length > 1) {
    return 'evidence_armor_set_variant_needs_decision';
  }
  if (original?.matchType === 'npc' && (original?.matchStatus === 'ambiguous' || npcExact.length > 1)) {
    return 'ambiguous_npc_variant_needs_decision';
  }
  if (original?.matchStatus === 'missing') {
    return 'missing_local_entity_needs_backfill';
  }
  return 'unresolved_local_domain_gap';
}

export function validateLocalDomainAuditReport(report) {
  const issues = [];
  if (report?.entity !== 'biome_wikitext_local_domain_resolution_audit') issues.push('wrong entity');
  if (!Object.hasOwn(report ?? {}, 'generatedAt')) issues.push('missing generatedAt');
  if (!Object.hasOwn(report ?? {}, 'sourceReportPath')) issues.push('missing sourceReportPath');
  if (!Object.hasOwn(report ?? {}, 'sourceGeneratedAt')) issues.push('missing sourceGeneratedAt');
  if (!report?.summary || typeof report.summary !== 'object') issues.push('missing summary');
  if (!report?.summary?.byRecommendation || typeof report.summary.byRecommendation !== 'object' || Array.isArray(report.summary.byRecommendation)) {
    issues.push('missing summary.byRecommendation');
  }
  if (!Array.isArray(report?.rows)) issues.push('rows is not an array');
  if (report?.summary?.total !== report?.rows?.length) issues.push('summary total does not match row length');
  const seen = new Set();
  for (const [index, row] of (Array.isArray(report?.rows) ? report.rows : []).entries()) {
    if (seen.has(row.inputIndex)) issues.push(`duplicate inputIndex ${row.inputIndex}`);
    seen.add(row.inputIndex);
    if (!Number.isInteger(row.inputIndex) || row.inputIndex !== index + 1) issues.push(`row ${row.inputIndex} invalid inputIndex`);
    if (!row.original || typeof row.original !== 'object') issues.push(`row ${row.inputIndex} missing original`);
    for (const field of REQUIRED_ORIGINAL_FIELDS) {
      if (!Object.hasOwn(row.original ?? {}, field)) issues.push(`row ${row.inputIndex} missing original.${field}`);
    }
    if (!Array.isArray(row.original?.candidateMatches)) issues.push(`row ${row.inputIndex} missing original.candidateMatches`);
    for (const field of ['itemExactMatches', 'itemLikeMatches', 'npcExactMatches', 'npcLikeMatches', 'armorSetCandidates', 'bossLootCandidates']) {
      if (!Array.isArray(row[field])) issues.push(`row ${row.inputIndex} ${field} is not an array`);
      for (const [matchIndex, match] of (Array.isArray(row[field]) ? row[field] : []).entries()) {
        if (!match || typeof match !== 'object' || Array.isArray(match)) issues.push(`row ${row.inputIndex} ${field}[${matchIndex}] is not an object`);
      }
    }
    for (const [candidateIndex, candidate] of (Array.isArray(row.armorSetCandidates) ? row.armorSetCandidates : []).entries()) {
      if (!Array.isArray(candidate.items)) issues.push(`row ${row.inputIndex} armorSetCandidates[${candidateIndex}].items is not an array`);
    }
    for (const [candidateIndex, candidate] of (Array.isArray(row.bossLootCandidates) ? row.bossLootCandidates : []).entries()) {
      if (!Array.isArray(candidate.sampleItems)) issues.push(`row ${row.inputIndex} bossLootCandidates[${candidateIndex}].sampleItems is not an array`);
    }
    if (!ALLOWED_RECOMMENDATIONS.has(row.recommendation)) issues.push(`row ${row.inputIndex} unsupported recommendation ${row.recommendation}`);
    if (row.evidenceOnly !== true) issues.push(`row ${row.inputIndex} not evidenceOnly`);
    if (row.needsUserDecision !== true) issues.push(`row ${row.inputIndex} not marked for user decision`);
  }
  return { valid: issues.length === 0, issues };
}

export async function writeLocalDomainAuditReport({ inputPath, outputPath, loadEvidenceForRow }) {
  const resolvedInputPath = path.resolve(process.cwd(), inputPath);
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath ?? defaultOutputPath());
  const unresolvedReport = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
  const report = await auditBiomeWikitextLocalDomainResolution({ unresolvedReport, loadEvidenceForRow });
  const validation = validateLocalDomainAuditReport(report);
  if (!validation.valid) {
    throw new Error(`Local domain audit report contract failed:\n${validation.issues.join('\n')}`);
  }
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: resolvedOutputPath, summary: report.summary };
}

export function createMysqlEvidenceLoader({ connection }) {
  return async function loadEvidenceForRow(row) {
    const [itemExact, itemLike, npcExact, npcLike, armorSetCandidates, bossLootCandidates] = await Promise.all([
      row.matchType === 'item' ? queryItems(connection, row, true) : Promise.resolve([]),
      row.matchType === 'item' ? queryItems(connection, row, false) : Promise.resolve([]),
      row.matchType === 'npc' ? queryNpcs(connection, row, true) : Promise.resolve([]),
      row.matchType === 'npc' ? queryNpcs(connection, row, false) : Promise.resolve([]),
      shouldQueryArmorSets(row) ? queryArmorSets(connection, row) : Promise.resolve([]),
      shouldQueryBossLoot(row) ? queryBossLoot(connection, row) : Promise.resolve([])
    ]);
    return { itemExact, itemLike, npcExact, npcLike, armorSetCandidates, bossLootCandidates };
  };
}

export function resolveMysql() {
  const requireFromDataQueryApp = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
  return requireFromDataQueryApp('mysql2/promise');
}

async function queryItems(connection, row, exact) {
  const sql = exact
    ? `SELECT id, internal_name, name, name_zh
         FROM ${localTable('items')}
        WHERE deleted = 0
          AND (LOWER(name) = LOWER(?) OR LOWER(internal_name) = LOWER(?) OR LOWER(name_zh) = LOWER(?))
        ORDER BY id
        LIMIT 80`
    : `SELECT id, internal_name, name, name_zh
         FROM ${localTable('items')}
        WHERE deleted = 0
          AND (name LIKE ? OR internal_name LIKE ? OR name_zh LIKE ?)
        ORDER BY id
        LIMIT 20`;
  const params = exact ? [row.name, row.name, row.name] : likeParams(row.name);
  const [records] = await connection.execute(sql, params);
  return records.map(normalizeItemMatch);
}

async function queryNpcs(connection, row, exact) {
  const sql = exact
    ? `SELECT id, internal_name, name, name_zh
         FROM ${localTable('npcs')}
        WHERE deleted = 0
          AND (LOWER(name) = LOWER(?) OR LOWER(internal_name) = LOWER(?) OR LOWER(name_zh) = LOWER(?))
        ORDER BY id
        LIMIT 120`
    : `SELECT id, internal_name, name, name_zh
         FROM ${localTable('npcs')}
        WHERE deleted = 0
          AND (name LIKE ? OR internal_name LIKE ? OR name_zh LIKE ?)
        ORDER BY id
        LIMIT 40`;
  const params = exact ? [row.name, row.name, row.name] : likeParams(row.name);
  const [records] = await connection.execute(sql, params);
  return records.map(normalizeNpcMatch);
}

async function queryArmorSets(connection, row) {
  const tokens = armorSearchTokens(row.name);
  if (tokens.length === 0) return [];
  const clauses = tokens.map(() => `(a.source_key LIKE ? OR a.text_key LIKE ? OR asi.item_name LIKE ? OR asi.item_internal_name LIKE ?)`);
  const params = tokens.flatMap((token) => {
    const value = `%${token}%`;
    return [value, value, value, value];
  });
  const [records] = await connection.execute(
    `SELECT a.id,
            a.source_key,
            a.text_key,
            a.set_count,
            a.unique_item_count,
            GROUP_CONCAT(DISTINCT COALESCE(asi.item_internal_name, i.internal_name, asi.item_name) ORDER BY asi.set_variant_index, asi.part_index, asi.id SEPARATOR '|') AS items
       FROM ${localTable('armor_sets')} a
       LEFT JOIN ${localTable('armor_set_items')} asi ON asi.armor_set_id = a.id
       LEFT JOIN ${localTable('items')} i ON i.id = asi.item_id
      WHERE a.deleted = 0
        AND (${clauses.join(' OR ')})
      GROUP BY a.id, a.source_key, a.text_key, a.set_count, a.unique_item_count
      ORDER BY a.source_key, a.id
      LIMIT 40`,
    params
  );
  return records.map((record) => ({
    id: record.id,
    sourceKey: record.source_key ?? null,
    textKey: record.text_key ?? null,
    setCount: Number(record.set_count ?? 0),
    uniqueItemCount: Number(record.unique_item_count ?? 0),
    items: splitPipe(record.items)
  }));
}

async function queryBossLoot(connection, row) {
  const bossName = extractBossName(row.source);
  if (!bossName) return [];
  const [records] = await connection.execute(
    `SELECT n.internal_name AS boss_internal_name,
            n.name AS boss_name,
            nle.drop_source_kind,
            COUNT(*) AS loot_rows,
            GROUP_CONCAT(DISTINCT i.internal_name ORDER BY i.internal_name SEPARATOR '|') AS sample_items
       FROM ${localTable('npcs')} n
       JOIN ${localTable('npc_loot_entries')} nle ON nle.npc_id = n.id AND nle.deleted = 0
       JOIN ${localTable('items')} i ON i.id = nle.item_id
      WHERE n.deleted = 0
        AND nle.drop_source_kind = 'treasure_bag'
        AND (LOWER(n.name) = LOWER(?) OR LOWER(n.internal_name) = LOWER(?))
      GROUP BY n.internal_name, n.name, nle.drop_source_kind
      ORDER BY n.internal_name
      LIMIT 20`,
    [bossName, bossName]
  );
  return records.map((record) => ({
    bossInternalName: record.boss_internal_name ?? null,
    bossName: record.boss_name ?? null,
    dropSourceKind: record.drop_source_kind ?? null,
    lootRows: Number(record.loot_rows ?? 0),
    sampleItems: splitPipe(record.sample_items).slice(0, 12)
  }));
}

function shouldQueryArmorSets(row) {
  return row.matchType === 'item' && /\b(armor|set)\b/i.test(row.name ?? '');
}

function shouldQueryBossLoot(row) {
  return row.matchType === 'item' && /treasure bag/i.test(row.name ?? '');
}

function classifyEvidenceCategoryCount(summary, recommendation) {
  summary.byRecommendation[recommendation] = (summary.byRecommendation[recommendation] ?? 0) + 1;
}

function summarizeRows(rows) {
  const summary = { total: rows.length, byRecommendation: {} };
  for (const row of rows) classifyEvidenceCategoryCount(summary, row.recommendation);
  return summary;
}

function normalizeEvidence(evidence) {
  return {
    itemExact: Array.isArray(evidence?.itemExact) ? evidence.itemExact : [],
    itemLike: Array.isArray(evidence?.itemLike) ? evidence.itemLike : [],
    npcExact: Array.isArray(evidence?.npcExact) ? evidence.npcExact : [],
    npcLike: Array.isArray(evidence?.npcLike) ? evidence.npcLike : [],
    armorSetCandidates: Array.isArray(evidence?.armorSetCandidates) ? evidence.armorSetCandidates : [],
    bossLootCandidates: Array.isArray(evidence?.bossLootCandidates) ? evidence.bossLootCandidates : []
  };
}

function cloneOriginal(row) {
  return JSON.parse(JSON.stringify(row));
}

function normalizeItemMatch(record) {
  return {
    id: record.id ?? null,
    internalName: record.internal_name ?? record.internalName ?? null,
    name: record.name ?? null,
    nameZh: record.name_zh ?? record.nameZh ?? null
  };
}

function normalizeNpcMatch(record) {
  return normalizeItemMatch(record);
}

function armorSearchTokens(name) {
  const text = String(name ?? '').replace(/\b(armor|set)\b/ig, ' ').trim();
  const tokens = text.split(/\s+/).map((token) => token.trim()).filter((token) => token.length >= 3);
  return tokens.length ? tokens : [String(name ?? '').trim()].filter(Boolean);
}

function extractBossName(source) {
  const match = /^From\s+(.+)$/i.exec(String(source ?? '').trim());
  return match ? match[1].trim() : null;
}

function likeParams(value) {
  const likeValue = `%${value ?? ''}%`;
  return [likeValue, likeValue, likeValue];
}

function splitPipe(value) {
  return String(value ?? '').split('|').map((entry) => entry.trim()).filter(Boolean);
}

function localTable(tableName) {
  return `\`${DEFAULT_DB_NAME}\`.\`${tableName}\``;
}

function defaultOutputPath() {
  const dateTag = new Date().toISOString().slice(0, 10);
  return path.join('reports', `biome-wikitext-local-domain-resolution-audit-${dateTag}.json`);
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

if (process.argv[1] === __filename) {
  try {
    const args = parseArgs();
    const mysql = resolveMysql();
    const connection = await mysql.createConnection(buildConnectionConfig());
    try {
      const result = await writeLocalDomainAuditReport({
        inputPath: args.input,
        outputPath: args.output,
        loadEvidenceForRow: createMysqlEvidenceLoader({ connection })
      });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('[biome-wikitext-local-domain-resolution-audit] failed');
    console.error(error);
    process.exitCode = 1;
  }
}
