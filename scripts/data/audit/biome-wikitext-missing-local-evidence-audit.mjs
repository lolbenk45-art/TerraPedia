#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..', '..');
const DEFAULT_DB_NAME = 'terria_v1_local';
const ALLOWED_ARGS = new Set(['input', 'output']);
const ALLOWED_RECOMMENDATIONS = new Set([
  'normalized_internal_name_candidate',
  'weak_npc_family_candidate_needs_decision',
  'component_item_set_candidate',
  'item_family_candidate',
  'still_missing_after_local_evidence_audit'
]);
const FURNITURE_NAME_PARTS = new Set([
  'bathtub',
  'bed',
  'bookcase',
  'candelabra',
  'candle',
  'chair',
  'chandelier',
  'chest',
  'clock',
  'door',
  'dresser',
  'lamp',
  'lantern',
  'piano',
  'platform',
  'sink',
  'sofa',
  'table',
  'toilet',
  'vase',
  'work bench',
  'workbench'
]);
const GENERIC_FAMILY_TOKENS = new Set([
  'admiral',
  'black',
  'blue',
  'dart',
  'decorative',
  'emperor',
  'furniture',
  'green',
  'hat',
  'julia',
  'mallard',
  'monarch',
  'purple',
  'red',
  'set',
  'sulphur',
  'trap',
  'tree',
  'ulysse',
  'ulysses',
  'white',
  'zebra'
]);
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
    throw new Error(`Refusing non-local database '${database}' for missing local evidence audit`);
  }
  const base = {
    user: toNullableText(env.TERRAPEDIA_DB_USERNAME) ?? 'root',
    password: toNullableText(env.TERRAPEDIA_DB_PASSWORD) ?? '',
    database
  };
  const socketPath = toNullableText(env.TERRAPEDIA_DB_SOCKET);
  if (socketPath) {
    if (socketPath !== '/run/mysqld/mysqld.sock') {
      throw new Error(`Refusing non-local database socket '${socketPath}' for missing local evidence audit`);
    }
    return { socketPath, ...base };
  }
  const host = toNullableText(env.TERRAPEDIA_DB_HOST) ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    throw new Error(`Refusing non-local database host '${host}' for missing local evidence audit`);
  }
  return {
    host,
    port: Number(toNullableText(env.TERRAPEDIA_DB_PORT) ?? 3306),
    ...base
  };
}

export async function auditMissingLocalEvidence({ localDomainReport, loadEvidenceForRow, generatedAt = new Date().toISOString(), sourceReportPath = null }) {
  const rows = [];
  const inputRows = Array.isArray(localDomainReport?.rows) ? localDomainReport.rows : [];
  for (const inputRow of inputRows.filter((row) => row.recommendation === 'missing_local_entity_needs_backfill')) {
    const evidence = normalizeEvidence(await loadEvidenceForRow(inputRow));
    const recommendation = classifyMissingEvidence(evidence);
    rows.push({
      inputIndex: inputRow.inputIndex,
      original: clone(inputRow.original),
      normalizedName: normalizeSearchText(inputRow.original?.name),
      normalizedNpcCandidates: evidence.normalizedNpcCandidates,
      familyNpcCandidates: evidence.familyNpcCandidates,
      componentItemCandidates: evidence.componentItemCandidates,
      familyItemCandidates: evidence.familyItemCandidates,
      recommendation,
      evidenceOnly: true,
      needsUserDecision: true
    });
  }
  return {
    entity: 'biome_wikitext_missing_local_evidence_audit',
    generatedAt,
    sourceReportPath: sourceReportPath ?? localDomainReport?.sourceReportPath ?? null,
    sourceGeneratedAt: localDomainReport?.generatedAt ?? null,
    summary: summarizeRows(rows),
    rows
  };
}

export function classifyMissingEvidence(evidence) {
  if (Array.isArray(evidence?.normalizedNpcCandidates) && evidence.normalizedNpcCandidates.length > 0) return 'normalized_internal_name_candidate';
  if (Array.isArray(evidence?.familyNpcCandidates) && evidence.familyNpcCandidates.length > 0) return 'weak_npc_family_candidate_needs_decision';
  if (Array.isArray(evidence?.componentItemCandidates) && evidence.componentItemCandidates.length > 0) return 'component_item_set_candidate';
  if (Array.isArray(evidence?.familyItemCandidates) && evidence.familyItemCandidates.length > 0) return 'item_family_candidate';
  return 'still_missing_after_local_evidence_audit';
}

export function validateMissingLocalEvidenceReport(report) {
  const issues = [];
  if (report?.entity !== 'biome_wikitext_missing_local_evidence_audit') issues.push('wrong entity');
  if (!Object.hasOwn(report ?? {}, 'generatedAt')) issues.push('missing generatedAt');
  if (!Object.hasOwn(report ?? {}, 'sourceReportPath')) issues.push('missing sourceReportPath');
  if (!Object.hasOwn(report ?? {}, 'sourceGeneratedAt')) issues.push('missing sourceGeneratedAt');
  if (report?.summary?.total !== report?.rows?.length) issues.push('summary total does not match row length');
  if (!report?.summary?.byRecommendation || typeof report.summary.byRecommendation !== 'object') issues.push('missing summary.byRecommendation');
  if (!Array.isArray(report?.rows)) issues.push('rows is not an array');

  const seen = new Set();
  for (const row of Array.isArray(report?.rows) ? report.rows : []) {
    if (!Number.isInteger(row.inputIndex)) issues.push(`row ${row.inputIndex} invalid inputIndex`);
    if (seen.has(row.inputIndex)) issues.push(`duplicate inputIndex ${row.inputIndex}`);
    seen.add(row.inputIndex);
    if (!row.original || typeof row.original !== 'object') issues.push(`row ${row.inputIndex} missing original`);
    for (const field of REQUIRED_ORIGINAL_FIELDS) {
      if (!Object.hasOwn(row.original ?? {}, field)) issues.push(`row ${row.inputIndex} missing original.${field}`);
    }
    for (const field of ['normalizedNpcCandidates', 'familyNpcCandidates', 'componentItemCandidates', 'familyItemCandidates']) {
      if (!Array.isArray(row[field])) issues.push(`row ${row.inputIndex} ${field} is not an array`);
    }
    if (!ALLOWED_RECOMMENDATIONS.has(row.recommendation)) issues.push(`row ${row.inputIndex} unsupported recommendation ${row.recommendation}`);
    if (row.evidenceOnly !== true) issues.push(`row ${row.inputIndex} not evidenceOnly`);
    if (row.needsUserDecision !== true) issues.push(`row ${row.inputIndex} not marked for user decision`);
  }
  return { valid: issues.length === 0, issues };
}

export async function writeMissingLocalEvidenceReport({ inputPath, outputPath, loadEvidenceForRow, generatedAt }) {
  const resolvedInputPath = path.resolve(process.cwd(), inputPath);
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath ?? defaultOutputPath());
  const localDomainReport = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
  const report = await auditMissingLocalEvidence({ localDomainReport, loadEvidenceForRow, generatedAt, sourceReportPath: resolvedInputPath });
  const validation = validateMissingLocalEvidenceReport(report);
  if (!validation.valid) {
    throw new Error(`Missing local evidence audit report contract failed:\n${validation.issues.join('\n')}`);
  }
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: resolvedOutputPath, summary: report.summary };
}

export function createMysqlMissingEvidenceLoader({ connection }) {
  return async function loadEvidenceForRow(row) {
    const original = row.original ?? row;
    if (original.matchType === 'npc') {
      const [normalizedNpcCandidates, familyNpcCandidates] = await Promise.all([
        queryNormalizedNpcs(connection, original),
        queryFamilyNpcs(connection, original)
      ]);
      return {
        normalizedNpcCandidates,
        familyNpcCandidates,
        componentItemCandidates: [],
        familyItemCandidates: []
      };
    }

    const [componentItemCandidates, familyItemCandidates] = await Promise.all([
      queryComponentItems(connection, original),
      queryFamilyItems(connection, original)
    ]);
    return {
      normalizedNpcCandidates: [],
      familyNpcCandidates: [],
      componentItemCandidates,
      familyItemCandidates: componentItemCandidates.length > 0 ? [] : familyItemCandidates
    };
  };
}

export function normalizeSearchText(value) {
  let text = String(value ?? '').toLowerCase();
  text = text.replace(/\bdecorative\b/g, ' ');
  text = text.replace(/\b(furniture|banners?|sets?|armor)\b/g, ' ');
  text = text.replace(/'s\b/g, '');
  text = text.replace(/[^a-z0-9]+/g, '');
  if (text.endsWith('ies') && text.length > 4) return `${text.slice(0, -3)}y`;
  if (text.endsWith('es') && text.length > 4) return text.slice(0, -2);
  if (text.endsWith('s') && text.length > 3) return text.slice(0, -1);
  return text;
}

export function buildFamilySearchTokens(value) {
  const rawWords = String(value ?? '')
    .replace(/\bdecorative\b/ig, ' ')
    .replace(/\b(furniture|banners?|sets?|armor)\b/ig, ' ')
    .replace(/'s\b/ig, '')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => singularize(token.trim()))
    .filter((token) => token.length >= 3)
    .filter((token) => !GENERIC_FAMILY_TOKENS.has(token.toLowerCase()));
  return [...new Set(rawWords)].slice(0, 4);
}

export function filterComponentItemCandidates(original, candidates) {
  const originalName = String(original?.name ?? '');
  let filtered = Array.isArray(candidates) ? candidates : [];
  if (/\bset\b/i.test(originalName)) {
    filtered = filtered.filter((match) => !/\bbanner\b/i.test(`${match.internalName ?? ''} ${match.name ?? ''}`));
  }
  return filtered;
}

export function filterFamilyItemCandidates(original, candidates) {
  const originalName = String(original?.name ?? '');
  let filtered = Array.isArray(candidates) ? candidates : [];
  if (/\bfurniture\b/i.test(originalName)) {
    filtered = filtered.filter((match) => isFurnitureCandidate(match));
  }
  if (/\bset\b/i.test(originalName)) {
    filtered = filtered.filter((match) => !/\bbanner\b/i.test(`${match.internalName ?? ''} ${match.name ?? ''}`));
  }
  if (/\bbanners?\b/i.test(originalName)) {
    filtered = filtered.filter((match) => /\bbanner\b/i.test(`${match.internalName ?? ''} ${match.name ?? ''}`));
  }
  return filtered;
}

export function resolveMysql() {
  const requireFromDataQueryApp = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
  return requireFromDataQueryApp('mysql2/promise');
}

async function queryNormalizedNpcs(connection, original) {
  const normalized = normalizeSearchText(original.name);
  if (!normalized) return [];
  const [records] = await connection.execute(
    `SELECT id, internal_name, name, name_zh
       FROM ${localTable('npcs')}
      WHERE deleted = 0
        AND (
          LOWER(REPLACE(REPLACE(REPLACE(internal_name, ' ', ''), '''', ''), '-', '')) = ?
          OR LOWER(REPLACE(REPLACE(REPLACE(name, ' ', ''), '''', ''), '-', '')) = ?
        )
      ORDER BY id
      LIMIT 80`,
    [normalized, normalized]
  );
  return records.map(normalizeEntityMatch);
}

async function queryFamilyNpcs(connection, original) {
  const tokens = familyTokens(original.name);
  if (tokens.length === 0) return [];
  const clauses = tokens.map(() => '(name LIKE ? OR internal_name LIKE ? OR name_zh LIKE ?)');
  const params = tokens.flatMap((token) => {
    const value = `%${token}%`;
    return [value, value, value];
  });
  const [records] = await connection.execute(
    `SELECT id, internal_name, name, name_zh
       FROM ${localTable('npcs')}
      WHERE deleted = 0
        AND (${clauses.join(' OR ')})
      ORDER BY name, internal_name
      LIMIT 120`,
    params
  );
  return records.map(normalizeEntityMatch);
}

async function queryComponentItems(connection, original) {
  if (!/\b(set|armor)\b/i.test(original.name ?? '')) return [];
  const tokens = familyTokens(original.name);
  if (tokens.length === 0) return [];
  const clauses = tokens.map(() => '(name LIKE ? OR internal_name LIKE ? OR name_zh LIKE ?)');
  const params = tokens.flatMap((token) => {
    const value = `${token}%`;
    return [value, value, value];
  });
  const [records] = await connection.execute(
    `SELECT id, internal_name, name, name_zh
       FROM ${localTable('items')}
      WHERE deleted = 0
        AND (${clauses.join(' OR ')})
      ORDER BY internal_name, id
      LIMIT 120`,
    params
  );
  return filterComponentItemCandidates(original, records.map(normalizeEntityMatch));
}

async function queryFamilyItems(connection, original) {
  const tokens = familyTokens(original.name);
  if (tokens.length === 0) return [];
  const clauses = tokens.map(() => '(name LIKE ? OR internal_name LIKE ? OR name_zh LIKE ?)');
  const params = tokens.flatMap((token) => {
    const value = `%${token}%`;
    return [value, value, value];
  });
  const [records] = await connection.execute(
    `SELECT id, internal_name, name, name_zh
       FROM ${localTable('items')}
      WHERE deleted = 0
        AND (${clauses.join(' OR ')})
      ORDER BY name, internal_name
      LIMIT 160`,
    params
  );
  return filterFamilyItemCandidates(original, records.map(normalizeEntityMatch));
}

function familyTokens(value) {
  return buildFamilySearchTokens(value);
}

function singularize(value) {
  const text = value.trim();
  if (/ies$/i.test(text) && text.length > 4) return `${text.slice(0, -3)}y`;
  if (/es$/i.test(text) && text.length > 4) return text.slice(0, -2);
  if (/s$/i.test(text) && text.length > 3) return text.slice(0, -1);
  return text;
}

function normalizeEntityMatch(record) {
  return {
    id: record.id ?? null,
    internalName: record.internal_name ?? record.internalName ?? null,
    name: record.name ?? null,
    nameZh: record.name_zh ?? record.nameZh ?? null
  };
}

function isFurnitureCandidate(match) {
  const name = String(match?.name ?? '').toLowerCase();
  const internalName = String(match?.internalName ?? '').toLowerCase();
  for (const part of FURNITURE_NAME_PARTS) {
    const normalizedPart = part.replace(/\s+/g, '');
    if (name.includes(part) || internalName.includes(normalizedPart)) return true;
  }
  return false;
}

function normalizeEvidence(evidence) {
  return {
    normalizedNpcCandidates: Array.isArray(evidence?.normalizedNpcCandidates) ? evidence.normalizedNpcCandidates : [],
    familyNpcCandidates: Array.isArray(evidence?.familyNpcCandidates) ? evidence.familyNpcCandidates : [],
    componentItemCandidates: Array.isArray(evidence?.componentItemCandidates) ? evidence.componentItemCandidates : [],
    familyItemCandidates: Array.isArray(evidence?.familyItemCandidates) ? evidence.familyItemCandidates : []
  };
}

function summarizeRows(rows) {
  const summary = { total: rows.length, byRecommendation: {} };
  for (const row of rows) {
    summary.byRecommendation[row.recommendation] = (summary.byRecommendation[row.recommendation] ?? 0) + 1;
  }
  return summary;
}

function localTable(tableName) {
  return `\`${DEFAULT_DB_NAME}\`.\`${tableName}\``;
}

function defaultOutputPath() {
  const dateTag = new Date().toISOString().slice(0, 10);
  return path.join('reports', `biome-wikitext-missing-local-evidence-audit-${dateTag}.json`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
      const result = await writeMissingLocalEvidenceReport({
        inputPath: args.input,
        outputPath: args.output,
        loadEvidenceForRow: createMysqlMissingEvidenceLoader({ connection })
      });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('[biome-wikitext-missing-local-evidence-audit] failed');
    console.error(error);
    process.exitCode = 1;
  }
}
