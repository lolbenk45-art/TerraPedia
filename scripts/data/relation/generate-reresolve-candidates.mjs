#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();

const DEFAULTS = {
  relationDatabase: 'terria_v1_relation',
};

export function resolveMysqlRequirePath(root = repoRoot) {
  return path.join(root, 'data-query-app', 'package.json');
}

const require = createRequire(resolveMysqlRequirePath());
const mysql = require('mysql2/promise');

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const arg of argv) {
    const match = String(arg).match(/^--([^=]+)=(.*)$/);
    if (match) {
      raw[match[1]] = match[2];
    }
  }
  return {
    relationDatabase: nonEmptyText(raw['relation-database']) ?? DEFAULTS.relationDatabase,
    generatedAt: nonEmptyText(raw['generated-at']) ?? null,
    writeReport: raw['write-report'] !== 'false',
    reportPath: nonEmptyText(raw.output) ?? null,
  };
}

export function buildMysqlConnectionOptions({
  relationDatabase = DEFAULTS.relationDatabase,
  config = {},
  env = process.env,
} = {}) {
  return {
    host: env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: relationDatabase,
  };
}

export function buildReresolveCandidateReport({
  generatedAt = new Date().toISOString(),
  auditRows = [],
  npcRows = [],
  previousReport = null,
} = {}) {
  const unresolvedAudits = auditRows.filter((row) => String(row.audit_status ?? '').trim().toLowerCase() === 'unresolved');
  const npcIndex = buildNpcIndex(npcRows);
  const candidates = [];
  let autoMatchedCount = 0;
  let lowConfidenceCount = 0;

  for (const audit of unresolvedAudits) {
    const candidate = buildCandidate(audit, npcIndex);
    if (!candidate) {
      continue;
    }
    candidates.push(candidate);
    if (candidate.confidence === 'high') {
      autoMatchedCount += 1;
    } else {
      lowConfidenceCount += 1;
    }
  }

  const previousUnresolvedAuditCount = toNullableNumber(previousReport?.summary?.unresolvedAuditCount);
  const currentUnresolvedAuditCount = unresolvedAudits.length;
  const delta = previousUnresolvedAuditCount == null
    ? null
    : currentUnresolvedAuditCount - previousUnresolvedAuditCount;

  return {
    generatedAt,
    summary: {
      unresolvedAuditCount: currentUnresolvedAuditCount,
      candidateCount: candidates.length,
      autoMatchedCount,
      manualReviewCount: currentUnresolvedAuditCount - candidates.length,
      lowConfidenceCount,
    },
    trend: {
      previousUnresolvedAuditCount,
      currentUnresolvedAuditCount,
      delta,
      direction: delta == null ? 'unknown' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    },
    candidates,
  };
}

export async function runGenerateReresolveCandidates({
  relationDatabase = DEFAULTS.relationDatabase,
  generatedAt = new Date().toISOString(),
  writeReport = true,
  reportPath = null,
  connection = null,
  projectRoot = repoRoot,
  config = loadLocalStackConfig(projectRoot),
  env = process.env,
} = {}) {
  const ownedConnection = connection ?? await mysql.createConnection(buildMysqlConnectionOptions({
    relationDatabase,
    config,
    env,
  }));
  try {
    const auditRows = await loadAuditRows(ownedConnection, relationDatabase);
    const npcRows = await loadNpcRows(ownedConnection, relationDatabase);
    const previousReport = readPreviousReport(projectRoot, generatedAt);
    const report = buildReresolveCandidateReport({
      generatedAt,
      auditRows,
      npcRows,
      previousReport,
    });
    const resolvedReportPath = reportPath ?? defaultReportPath(generatedAt);
    if (writeReport) {
      writeReportFile(projectRoot, resolvedReportPath, report);
    }
    return { report, reportPath: resolvedReportPath };
  } finally {
    if (!connection) {
      await ownedConnection.end();
    }
  }
}

function buildCandidate(audit, npcIndex) {
  const sourceRefName = nonEmptyText(audit.source_ref_name);
  const sourceRefNormalized = nonEmptyText(audit.source_ref_normalized) ?? normalizeName(sourceRefName);
  if (!sourceRefNormalized) {
    return null;
  }

  const exact = npcIndex.exact.get(normalizeLookupKey(sourceRefNormalized));
  if (exact) {
    return createCandidateRecord(audit, exact, 'high', 'source_ref_exact', sourceRefNormalized);
  }

  const fuzzyKeys = [normalizeName(sourceRefNormalized)];
  if (fuzzyKeys[0]?.startsWith('the ')) {
    fuzzyKeys.push(fuzzyKeys[0].slice(4));
  }
  const fuzzyMatches = dedupeMatches(fuzzyKeys.flatMap((key) => npcIndex.fuzzy.get(key) ?? []));
  if (fuzzyMatches.length === 1) {
    return createCandidateRecord(audit, fuzzyMatches[0], 'low', 'source_ref_fuzzy', sourceRefNormalized);
  }

  return null;
}

function createCandidateRecord(audit, npc, confidence, matchBasis, sourceRefNormalized) {
  return {
    auditId: String(audit.audit_key),
    proposedMatch: {
      npcSourceId: npc.npcSourceId,
      npcInternalName: npc.npcInternalName,
      npcName: npc.npcName,
    },
    confidence,
    evidence: {
      matchBasis,
      sourceRefName: nonEmptyText(audit.source_ref_name),
      sourceRefNormalized,
      reasonCode: nonEmptyText(audit.reason_code),
      sourceMaintTable: nonEmptyText(audit.source_maint_table),
      sourceMaintRecordKey: nonEmptyText(audit.source_maint_record_key),
      sourceProvider: nonEmptyText(audit.source_provider),
      sourcePage: nonEmptyText(audit.source_page) ?? parseJson(audit.evidence_json)?.row?.sourcePage ?? null,
    },
  };
}

function buildNpcIndex(rows = []) {
  const exact = new Map();
  const fuzzy = new Map();
  for (const row of rows) {
    const npc = {
      npcSourceId: toNullableNumber(row.source_id),
      npcInternalName: nonEmptyText(row.internal_name),
      npcName: nonEmptyText(row.english_name ?? row.internal_name),
      sourcePage: nonEmptyText(row.source_page),
    };
    if (!npc.npcInternalName) {
      continue;
    }
    for (const key of [npc.npcInternalName, npc.npcName, npc.sourcePage]) {
      const exactKey = normalizeLookupKey(key);
      const fuzzyKey = normalizeName(key);
      if (exactKey && !exact.has(exactKey)) {
        exact.set(exactKey, npc);
      }
      if (fuzzyKey) {
        addFuzzyMatch(fuzzy, fuzzyKey, npc);
      }
      if (fuzzyKey?.startsWith('the ')) {
        addFuzzyMatch(fuzzy, fuzzyKey.slice(4), npc);
      }
    }
  }
  return { exact, fuzzy };
}

function dedupeMatches(matches = []) {
  const deduped = new Map();
  for (const match of matches) {
    const key = JSON.stringify([match.npcSourceId, match.npcInternalName]);
    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  }
  return [...deduped.values()];
}

function addFuzzyMatch(fuzzy, key, npc) {
  if (!key) {
    return;
  }
  if (!fuzzy.has(key)) {
    fuzzy.set(key, []);
  }
  if (!fuzzy.get(key).some((candidate) => candidate.npcInternalName === npc.npcInternalName)) {
    fuzzy.get(key).push(npc);
  }
}

async function loadAuditRows(connection, relationDatabase) {
  const [rows] = await connection.query(`
SELECT
  audit_key,
  source_ref_name,
  source_ref_normalized,
  audit_status,
  reason_code,
  evidence_json,
  source_maint_table,
  source_maint_record_key,
  source_provider,
  source_page
FROM \`${relationDatabase}\`.\`item_npc_relation_audits\`
WHERE audit_status = 'unresolved'
ORDER BY audit_key
`);
  return rows;
}

async function loadNpcRows(connection, relationDatabase) {
  const [rows] = await connection.query(`
SELECT source_id, internal_name, english_name, source_page
FROM \`${relationDatabase}\`.\`relation_npcs\`
WHERE deleted = 0 OR deleted IS NULL
ORDER BY source_id, internal_name
`);
  return rows;
}

export function readPreviousReport(projectRoot, generatedAt = new Date().toISOString()) {
  const reportsDir = path.resolve(projectRoot, 'reports', 'relation');
  if (!fs.existsSync(reportsDir)) {
    return null;
  }
  const targetDate = isoDate(generatedAt);
  const latest = fs.readdirSync(reportsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      date: extractReportDate(entry.name),
      name: entry.name,
    }))
    .filter((entry) => entry.date != null && entry.date < targetDate)
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1)?.name;
  if (!latest) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(reportsDir, latest), 'utf8'));
  } catch {
    return null;
  }
}

function writeReportFile(projectRoot, reportPath, payload) {
  const fullPath = path.resolve(projectRoot, reportPath);
  const reportsRoot = path.resolve(projectRoot, 'reports', 'relation');
  if (fullPath !== reportsRoot && !fullPath.startsWith(`${reportsRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside reports/relation: ${reportPath}`);
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function defaultReportPath(generatedAt) {
  return path.posix.join('reports', 'relation', `reresolve-candidates-${isoDate(generatedAt)}.json`);
}

function parseJson(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function normalizeLookupKey(value) {
  const text = nonEmptyText(value);
  return text ? text.toLowerCase() : null;
}

function normalizeName(value) {
  const text = nonEmptyText(value);
  return text ? text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function nonEmptyText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isoDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function extractReportDate(fileName) {
  const match = String(fileName).match(/^reresolve-candidates-(\d{4}-\d{2}-\d{2})\.json$/);
  return match ? match[1] : null;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await runGenerateReresolveCandidates({
    relationDatabase: args.relationDatabase,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    writeReport: args.writeReport,
    reportPath: args.reportPath,
  });
  process.stdout.write(`${JSON.stringify({ ...result.report, reportPath: result.reportPath }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
