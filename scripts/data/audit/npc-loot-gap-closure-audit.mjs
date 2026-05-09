#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const DEFAULTS = Object.freeze({
  maintDatabase: 'terria_v1_maint',
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local',
  writeReport: true,
  dateTag: new Date().toISOString().slice(0, 10),
});

const MIMIC_VARIANTS = Object.freeze([
  'PresentMimic',
  'BigMimicCorruption',
  'BigMimicCrimson',
  'BigMimicHallow',
  'BigMimicJungle',
]);

const GENERIC_BUCKET_SOURCES = new Set(['mimics']);
const NON_NPC_SOURCE_PATTERNS = Object.freeze([
  /\bchest\b/i,
  /\bcrate\b/i,
  /\btreasure\s+bag\b/i,
  /\block\s+box\b/i,
  /\bbonus\s+drop\b/i,
  /\bexpert\s+mode\b/i,
  /\bgeode\b/i,
  /^shaking$/i,
  /\btree\b/i,
  /\bpalm\s+tree\b/i,
  /\bheart\b/i,
  /\borb\b/i,
  /^present$/i,
  /\bherb\s+bag\b/i,
  /\bgoodie\s+bag\b/i,
  /\bcan\s+of\s+worms\b/i,
  /\bpigronata\b/i,
  /\bshadow\s+hammer\b/i,
  /\bpot\b/i,
  /\bextractinator\b/i,
]);
const GENERIC_BUCKET_PATTERNS = Object.freeze([
  /\bmummies\b/i,
  /\bghouls\b/i,
  /\bjellyfish\b/i,
  /\bsand\s+sharks\b/i,
  /\bslimes\b/i,
  /\bthe\s+twins\b/i,
  /\bcelestial\s+pillars\b/i,
]);
const UNSAFE_VARIANT_TOKENS = Object.freeze([
  'Corruption',
  'Crimson',
  'Hallow',
  'Hallowed',
  'Jungle',
  'Desert',
  'Light',
  'Dark',
  'T1',
  'T2',
  'T3',
  'Axe',
  'Flail',
  'Sword',
  'Spear',
  'Gun',
  'Snow',
  'Frozen',
]);
const SAFE_REPRESENTATIVE_TOKENS = Object.freeze(['Head', 'Body', 'Tail', 'Legs']);

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, DEFAULTS.writeReport),
    output: raw.output ?? null,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? DEFAULTS.dateTag,
  };
}

export function classifyNpcLootGap(input = {}) {
  const sourceRefName = normalizeText(input.sourceRefName);
  const sourceKey = sourceRefName?.toLowerCase() ?? '';
  const targetNpcInternalName = normalizeText(input.targetNpcInternalName);
  const raw = input.raw && typeof input.raw === 'object' ? input.raw : {};
  const rawInternalName = normalizeText(raw.sourceRefInternalName ?? raw.source_ref_internal_name);
  const rawResolution = normalizeText(raw.sourceRefResolution ?? raw.source_ref_resolution);
  const candidates = normalizeCandidateNames(input.candidateNpcInternalNames);

  if (GENERIC_BUCKET_SOURCES.has(sourceKey)) {
    return {
      classification: 'generic_bucket',
      materializable: false,
      resolvedNpcInternalName: null,
      reason: 'generic_bucket_not_variant_materializable',
    };
  }

  if (isGenericBucketSource(sourceRefName)) {
    return {
      classification: 'generic_bucket',
      materializable: false,
      resolvedNpcInternalName: null,
      reason: 'source_ref_is_generic_group_bucket',
    };
  }

  if (isNonNpcSource(sourceRefName)) {
    return {
      classification: 'non_npc_source_misclassified',
      materializable: false,
      resolvedNpcInternalName: null,
      reason: 'source_ref_is_not_npc',
    };
  }

  if (
    rawResolution === 'positive_id_fallback'
    && rawInternalName
    && isRepresentativeSafeNpcFamily(candidates, rawInternalName)
  ) {
    return {
      classification: 'positive_id_fallback_resolvable',
      materializable: true,
      resolvedNpcInternalName: rawInternalName,
      reason: 'representative_safe_positive_id_fallback',
    };
  }

  if (candidates.length > 1 || input.auditStatus === 'ambiguous') {
    return {
      classification: 'true_ambiguous',
      materializable: false,
      resolvedNpcInternalName: null,
      reason: 'candidate_set_requires_manual_review',
    };
  }

  return {
    classification: 'missing_source',
    materializable: false,
    resolvedNpcInternalName: null,
    reason: 'no_usable_npc_source_evidence',
  };
}

export async function runNpcLootGapClosureAudit(options = {}, dependencies = {}) {
  const normalized = {
    maintDatabase: options.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: options.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: options.localDatabase ?? DEFAULTS.localDatabase,
    writeReport: options.writeReport ?? DEFAULTS.writeReport,
    output: options.output ?? null,
    dateTag: options.dateTag ?? DEFAULTS.dateTag,
  };

  let connection = dependencies.connection ?? null;
  let shouldClose = false;
  try {
    if (!connection) {
      const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
      const mysqlFactory = dependencies.mysqlFactory ?? mysql;
      connection = await mysqlFactory.createConnection({
        host: config.database?.host ?? '127.0.0.1',
        port: Number(config.database?.port ?? 3306),
        user: config.database?.username ?? 'root',
        password: config.database?.password ?? 'root',
      });
      shouldClose = true;
    }

    const [auditRows, mimicRows, totals] = await Promise.all([
      loadRelationAuditRows(connection, normalized),
      loadMimicVariantRows(connection, normalized),
      loadCountSummary(connection, normalized),
    ]);
    const gaps = [
      ...auditRows.map((row) => buildGapFromAuditRow(row)),
      ...mimicRows
        .filter((row) => Number(row.localLootCount ?? 0) === 0 && Number(row.relationLootCount ?? 0) === 0 && Number(row.projectionLootCount ?? 0) === 0)
        .map((row) => buildGenericMimicGap(row)),
    ];
    const report = buildReport(normalized, gaps, totals);
    let reportPath = null;
    if (normalized.writeReport) {
      reportPath = await writeReport(report, normalized);
    }
    return { report, reportPath };
  } catch (error) {
    const report = buildBlockedReport(normalized, error);
    let reportPath = null;
    if (normalized.writeReport) {
      reportPath = await writeReport(report, normalized);
    }
    return { report, reportPath };
  } finally {
    if (shouldClose && connection) {
      await connection.end();
    }
  }
}

async function loadRelationAuditRows(connection, options) {
  const [rows] = await connection.query(`
    SELECT
      audit_key AS auditKey,
      relation_kind AS relationKind,
      audit_status AS auditStatus,
      reason_code AS reasonCode,
      item_internal_name AS itemInternalName,
      item_name AS itemName,
      source_ref_name AS sourceRefName,
      source_ref_normalized AS sourceRefNormalized,
      candidate_npc_internal_name AS candidateNpcInternalName,
      evidence_json AS evidenceJson,
      1 AS rowCount
    FROM \`${options.relationDatabase}\`.\`item_npc_relation_audits\`
    WHERE relation_kind = 'loot'
      AND (
        (audit_status = 'ambiguous' AND reason_code = 'npc_source_ambiguous')
        OR (audit_status = 'unresolved' AND reason_code = 'npc_source_unresolved')
      )
    ORDER BY source_ref_name, item_internal_name, audit_key
  `);
  return rows;
}

async function loadMimicVariantRows(connection, options) {
  const placeholders = MIMIC_VARIANTS.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
    SELECT
      n.internal_name AS internalName,
      COUNT(l.id) AS localLootCount,
      (
        SELECT COUNT(*)
        FROM \`${options.relationDatabase}\`.\`item_npc_loot_relations\` r
        WHERE r.deleted = 0
          AND r.status = 1
          AND r.npc_internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
      ) AS relationLootCount,
      COALESCE(JSON_LENGTH(p.loot_items_json), 0) AS projectionLootCount
    FROM \`${options.localDatabase}\`.\`npcs\` n
    LEFT JOIN \`${options.localDatabase}\`.\`npc_loot_entries\` l
      ON l.npc_id = n.id AND l.deleted = 0
    LEFT JOIN \`${options.relationDatabase}\`.\`projection_npcs\` p
      ON p.internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
     AND p.deleted = 0
     AND p.status = 1
    WHERE n.internal_name IN (${placeholders})
    GROUP BY n.internal_name, p.loot_items_json
    ORDER BY n.internal_name
    `,
    MIMIC_VARIANTS
  );
  return rows;
}

async function loadCountSummary(connection, options) {
  const queries = {
    maintCounts: `SELECT COUNT(*) AS count FROM \`${options.maintDatabase}\`.\`maint_item_sources\` WHERE source_type IN ('drop', 'loot')`,
    relationCounts: `SELECT COUNT(*) AS count FROM \`${options.relationDatabase}\`.\`item_npc_loot_relations\` WHERE deleted = 0 AND status = 1`,
    projectionCounts: `SELECT COUNT(*) AS count FROM \`${options.relationDatabase}\`.\`projection_npcs\` WHERE deleted = 0 AND status = 1 AND JSON_VALID(loot_items_json) = 1 AND JSON_LENGTH(loot_items_json) > 0`,
    localCompatCounts: `SELECT COUNT(*) AS count FROM \`${options.localDatabase}\`.\`npc_loot_entries\` WHERE deleted = 0`,
  };
  const result = {};
  for (const [key, sql] of Object.entries(queries)) {
    const [rows] = await connection.query(sql);
    result[key] = Number(rows[0]?.count ?? 0);
  }
  return result;
}

function buildGapFromAuditRow(row) {
  const evidence = parseEvidence(row.evidenceJson);
  const raw = evidence.raw && typeof evidence.raw === 'object' ? evidence.raw : {};
  const candidateNames = normalizeCandidateNames([
    ...(Array.isArray(evidence.candidateNpcInternalNames) ? evidence.candidateNpcInternalNames : []),
    row.candidateNpcInternalName,
  ]);
  const classification = classifyNpcLootGap({
    sourceRefName: row.sourceRefName,
    raw,
    candidateNpcInternalNames: candidateNames,
    auditStatus: row.auditStatus,
    reasonCode: row.reasonCode,
  });

  return {
    auditKey: row.auditKey,
    source: 'item_npc_relation_audits',
    relationKind: row.relationKind,
    auditStatus: row.auditStatus,
    reasonCode: row.reasonCode,
    itemInternalName: row.itemInternalName,
    itemName: row.itemName,
    sourceRefName: row.sourceRefName,
    sourceRefNormalized: row.sourceRefNormalized,
    classification: classification.classification,
    materializable: classification.materializable,
    resolvedNpcInternalName: classification.resolvedNpcInternalName,
    classificationReason: classification.reason,
    resolutionCandidates: candidateNames,
    maintCounts: { sourceRows: Number(row.rowCount ?? 1) },
    relationCounts: { lootRows: 0 },
    projectionCounts: { lootJsonRows: 0 },
    localCompatCounts: { lootEntryRows: 0 },
    evidence,
  };
}

function buildGenericMimicGap(row) {
  const classification = classifyNpcLootGap({
    sourceRefName: 'Mimics',
    targetNpcInternalName: row.internalName,
    candidateNpcInternalNames: MIMIC_VARIANTS,
    auditStatus: 'blocked',
    reasonCode: 'generic_mimics_bucket',
  });
  return {
    auditKey: `mimic:${row.internalName}`,
    source: 'mimic_variant_baseline',
    relationKind: 'loot',
    auditStatus: 'blocked',
    reasonCode: 'generic_mimics_bucket',
    itemInternalName: null,
    itemName: null,
    sourceRefName: 'Mimics',
    sourceRefNormalized: 'Mimics',
    targetNpcInternalName: row.internalName,
    classification: classification.classification,
    materializable: classification.materializable,
    resolvedNpcInternalName: null,
    classificationReason: classification.reason,
    resolutionCandidates: MIMIC_VARIANTS,
    maintCounts: { sourceRows: 0 },
    relationCounts: { lootRows: Number(row.relationLootCount ?? 0) },
    projectionCounts: { lootJsonRows: Number(row.projectionLootCount ?? 0) },
    localCompatCounts: { lootEntryRows: Number(row.localLootCount ?? 0) },
    evidence: {
      sourceRefResolution: 'generic_bucket',
      candidateNpcInternalNames: MIMIC_VARIANTS,
      raw: {},
    },
  };
}

function buildReport(options, gaps, totals) {
  return {
    auditName: 'npc-loot-gap-closure',
    generatedAt: new Date().toISOString(),
    options: sanitizeOptions(options),
    auditStatus: 'pass',
    evidenceHealth: 'sufficient',
    artifactStatuses: [],
    scanSummary: {
      relationAuditRows: gaps.filter((gap) => gap.source === 'item_npc_relation_audits').length,
      mimicVariantRows: gaps.filter((gap) => gap.source === 'mimic_variant_baseline').length,
    },
    summary: {
      totalGaps: gaps.length,
      materializable: gaps.filter((gap) => gap.materializable).length,
      blocked: gaps.filter((gap) => !gap.materializable).length,
      byClassification: summarizeByClassification(gaps),
      totals,
    },
    gaps,
  };
}

function buildBlockedReport(options, error) {
  return {
    auditName: 'npc-loot-gap-closure',
    generatedAt: new Date().toISOString(),
    options: sanitizeOptions(options),
    auditStatus: 'blocked',
    evidenceHealth: 'db_unavailable',
    artifactStatuses: [],
    scanSummary: {
      relationAuditRows: 0,
      mimicVariantRows: 0,
    },
    summary: {
      totalGaps: 0,
      materializable: 0,
      blocked: 0,
      byClassification: {},
      totals: {},
    },
    gaps: [],
    error: {
      message: error?.message ?? String(error),
      code: error?.code ?? null,
    },
  };
}

function summarizeByClassification(gaps) {
  const summary = {};
  for (const gap of gaps) {
    summary[gap.classification] = (summary[gap.classification] ?? 0) + 1;
  }
  return summary;
}

function parseEvidence(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRepresentativeSafeNpcFamily(candidates, rawInternalName) {
  const normalizedCandidates = normalizeCandidateNames(candidates);
  if (!rawInternalName || !normalizedCandidates.includes(rawInternalName)) return false;
  if (normalizedCandidates.filter((candidate) => candidate === rawInternalName).length !== 1) return false;
  if (normalizedCandidates.length < 2) return false;
  const suffixes = normalizedCandidates.map((candidate) => candidate.slice(commonPrefix(normalizedCandidates).length));
  if (suffixes.some((suffix) => suffix.length === 0)) return false;
  if (suffixes.some((suffix) => UNSAFE_VARIANT_TOKENS.some((token) => suffix.includes(token)))) return false;
  return suffixes.every((suffix) => SAFE_REPRESENTATIVE_TOKENS.some((token) => suffix === token || new RegExp(`^${token}\\d+$`).test(suffix)));
}

function commonPrefix(values) {
  if (!values.length) return '';
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function isNonNpcSource(value) {
  const text = normalizeText(value);
  return Boolean(text && NON_NPC_SOURCE_PATTERNS.some((pattern) => pattern.test(text)));
}

function isGenericBucketSource(value) {
  const text = normalizeText(value);
  return Boolean(text && GENERIC_BUCKET_PATTERNS.some((pattern) => pattern.test(text)));
}

function normalizeCandidateNames(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(normalizeText).filter(Boolean))];
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function booleanOption(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function sanitizeOptions(options) {
  return {
    maintDatabase: options.maintDatabase,
    relationDatabase: options.relationDatabase,
    localDatabase: options.localDatabase,
    writeReport: options.writeReport,
    dateTag: options.dateTag,
  };
}

async function writeReport(report, options) {
  const outputPath = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(repoRoot, 'reports', 'audit', `npc-loot-gap-closure-${options.dateTag}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs();
  const result = await runNpcLootGapClosureAudit(options);
  console.log(`Audit status: ${result.report.auditStatus}`);
  console.log(`Evidence health: ${result.report.evidenceHealth}`);
  console.log(`Total gaps: ${result.report.summary.totalGaps}`);
  if (result.reportPath) {
    console.log(`Report: ${result.reportPath}`);
  }
  if (result.report.auditStatus === 'blocked') {
    process.exitCode = 2;
  }
}
