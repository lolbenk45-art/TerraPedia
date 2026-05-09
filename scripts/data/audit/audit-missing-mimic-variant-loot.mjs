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

const DEFAULTS = {
  localDatabase: 'terria_v1_local',
  relationDatabase: 'terria_v1_relation',
  writeReport: true,
  dateTag: new Date().toISOString().slice(0, 10),
};

const TARGETS = Object.freeze([
  { internalName: 'PresentMimic', gameId: 341, name: 'Present Mimic' },
  { internalName: 'BigMimicCorruption', gameId: 473, name: 'Corrupt Mimic' },
  { internalName: 'BigMimicCrimson', gameId: 474, name: 'Crimson Mimic' },
  { internalName: 'BigMimicHallow', gameId: 475, name: 'Hallowed Mimic' },
  { internalName: 'BigMimicJungle', gameId: 476, name: 'Jungle Mimic' },
]);

const CONTROLS = Object.freeze([
  { internalName: 'Mimic', gameId: 85, name: 'Mimic' },
  { internalName: 'IceMimic', gameId: 629, name: 'Ice Mimic' },
  { internalName: 'WaterBoltMimic', gameId: 694, name: 'Water Bolt Mimic' },
]);

const ALLOWED_SCAN_EXTENSIONS = new Set(['.json', '.jsonl', '.ndjson']);
const MAX_SCAN_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const VARIANT_NAME_ALIASES = Object.freeze(new Map([
  ['PresentMimic', ['present mimic']],
  ['BigMimicCorruption', ['corrupt mimic']],
  ['BigMimicCrimson', ['crimson mimic']],
  ['BigMimicHallow', ['hallowed mimic']],
  ['BigMimicJungle', ['jungle mimic']],
]));
const VARIANT_PAGE_TITLES = new Set(['present mimic', 'corrupt mimic', 'crimson mimic', 'hallowed mimic', 'jungle mimic']);

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
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, DEFAULTS.writeReport),
    output: raw.output ?? null,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? DEFAULTS.dateTag,
  };
}

export async function runMissingMimicVariantLootAudit(options = {}, dependencies = {}) {
  const normalized = {
    localDatabase: options.localDatabase ?? DEFAULTS.localDatabase,
    relationDatabase: options.relationDatabase ?? DEFAULTS.relationDatabase,
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
      const mysqlOptions = {
        host: config.database?.host ?? '127.0.0.1',
        port: Number(config.database?.port ?? 3306),
        user: config.database?.username ?? 'root',
        password: config.database?.password ?? 'root',
      };
      connection = await mysqlFactory.createConnection(mysqlOptions);
      shouldClose = true;
    }

    const targetStates = await loadNpcState(connection, normalized, [...TARGETS, ...CONTROLS]);
    const artifacts = await (dependencies.scanArtifacts ?? scanArtifacts)();
    const targets = TARGETS.map((target) => buildTargetReport(target, targetStates.get(target.internalName), artifacts));
    const controls = CONTROLS.map((target) => buildTargetReport(target, targetStates.get(target.internalName), artifacts));
    const report = buildReport(normalized, artifacts, targets, controls);

    let reportPath = null;
    if (normalized.writeReport) {
      reportPath = await writeReport(report, normalized);
    }
    return { report, reportPath };
  } catch (error) {
    const blockedReport = buildBlockedReport(normalized, error);
    let reportPath = null;
    if (normalized.writeReport) {
      reportPath = await writeReport(blockedReport, normalized);
    }
    return { report: blockedReport, reportPath };
  } finally {
    if (shouldClose && connection) {
      await connection.end();
    }
  }
}

async function loadNpcState(connection, options, npcs) {
  const placeholders = npcs.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
    SELECT
      n.id AS localId,
      n.game_id AS gameId,
      n.internal_name AS internalName,
      n.name,
      COALESCE(JSON_LENGTH(n.loot_items_json), 0) AS localLootJsonCount,
      (
        SELECT COUNT(*)
        FROM \`${options.localDatabase}\`.\`npc_loot_entries\` x
        WHERE x.npc_id = n.id AND x.deleted = 0
      ) AS localLootEntryCount,
      (
        SELECT COUNT(*)
        FROM \`${options.localDatabase}\`.\`item_acquisition_sources\` s
        WHERE s.deleted = 0
          AND s.status = 1
          AND s.source_type = 'drop'
          AND s.source_ref_type = 'npc'
          AND s.source_ref_id = n.id
      ) AS localDerivedByLocalIdCount,
      (
        SELECT COUNT(*)
        FROM \`${options.localDatabase}\`.\`item_acquisition_sources\` s
        WHERE s.deleted = 0
          AND s.status = 1
          AND s.source_type = 'drop'
          AND s.source_ref_type = 'npc'
          AND s.source_ref_id = n.game_id
      ) AS localDerivedByGameIdCount,
      (
        SELECT COUNT(*)
        FROM \`${options.relationDatabase}\`.\`item_npc_loot_relations\` r
        WHERE r.deleted = 0
          AND r.status = 1
          AND r.npc_internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
      ) AS relationLootCount,
      (
        SELECT COUNT(*)
        FROM \`${options.relationDatabase}\`.\`item_source_facts\` f
        WHERE f.deleted = 0
          AND f.status = 1
          AND f.source_type = 'drop'
          AND f.source_ref_type = 'npc'
          AND LOWER(TRIM(COALESCE(f.source_ref_name, ''))) COLLATE utf8mb4_unicode_ci
            IN (
              LOWER(TRIM(n.name)) COLLATE utf8mb4_unicode_ci,
              LOWER(TRIM('Mimics')) COLLATE utf8mb4_unicode_ci
            )
      ) AS relationFactCandidateCount,
      (
        SELECT COALESCE(JSON_LENGTH(p.loot_items_json), 0)
        FROM \`${options.relationDatabase}\`.\`projection_npcs\` p
        WHERE p.deleted = 0
          AND p.status = 1
          AND p.internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
        LIMIT 1
      ) AS projectionLootJsonCount
    FROM \`${options.localDatabase}\`.\`npcs\` n
    WHERE n.internal_name IN (${placeholders})
    `,
    npcs.map((npc) => npc.internalName)
  );

  return new Map(rows.map((row) => [row.internalName, row]));
}

async function scanArtifacts() {
  const artifactStatuses = [];
  const scanSummary = {
    scannedFileCount: 0,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    matchedEvidenceFileCount: 0,
  };
  const targetEvidence = new Map(TARGETS.map((target) => [target.internalName, createEmptyTargetEvidence()]));
  const evidencePathSet = new Set();

  const coverageAuditPath = path.join(repoRoot, 'data', 'wiki-crawler', 'report', 'npc', 'coverage-audit.latest.json');
  const coverageTargetsPath = path.join(repoRoot, 'data', 'wiki-crawler', 'report', 'npc', 'coverage-targets.latest.json');
  const standardizedPath = path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json');
  const generatedMapPath = path.join(repoRoot, 'data', 'generated', 'npc-standardized-map.json');

  let coverageAuditPages = 0;
  let sourceRefNameMimicsRows = 0;
  let npcAuditFilesFound = 0;

  const coverageAuditPayload = await scanExactArtifact(coverageAuditPath, artifactStatuses, scanSummary, evidencePathSet);
  if (coverageAuditPayload?.payload) {
    const targets = Array.isArray(coverageAuditPayload.payload?.targets)
      ? coverageAuditPayload.payload.targets
      : Array.isArray(coverageAuditPayload.payload)
        ? coverageAuditPayload.payload
        : [];
    coverageAuditPages = targets.filter((target) => VARIANT_PAGE_TITLES.has(normalizeText(target.pageTitle))).length;
  }

  await scanExactArtifact(coverageTargetsPath, artifactStatuses, scanSummary, evidencePathSet);
  await scanExactArtifact(standardizedPath, artifactStatuses, scanSummary, evidencePathSet);
  await scanExactArtifact(generatedMapPath, artifactStatuses, scanSummary, evidencePathSet);

  const normalLootReports = await collectFiles(path.join(repoRoot, 'reports'), (entry) =>
    entry.name.startsWith('normal-npc-loot-') && ALLOWED_SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
  );
  for (const reportPath of normalLootReports) {
    const artifact = await scanExactArtifact(reportPath, artifactStatuses, scanSummary, evidencePathSet, targetEvidence);
    if (artifact?.payload) {
      const unmatched = Array.isArray(artifact.payload?.unmatchedSourceNames) ? artifact.payload.unmatchedSourceNames : [];
      const mimicEntry = unmatched.find((entry) => normalizeText(entry?.sourceRefName) === 'mimics');
      if (mimicEntry) {
        sourceRefNameMimicsRows = Math.max(sourceRefNameMimicsRows, Number(mimicEntry.sourceRows ?? 0));
        for (const target of TARGETS) {
          const targetState = targetEvidence.get(target.internalName);
          targetState.hasGenericMimicsEvidence = true;
        }
      }
    }
  }

  const npcAuditFiles = await collectFiles(path.join(repoRoot, 'data', 'wiki-crawler', 'audit', 'npc'), (entry) =>
    entry.name.endsWith('.latest.json')
  );
  for (const filePath of npcAuditFiles) {
    const artifact = await scanExactArtifact(filePath, artifactStatuses, scanSummary, evidencePathSet, targetEvidence);
    if (artifact?.payload) {
      npcAuditFilesFound += 1;
    }
  }

  const crawlerOutputFiles = await collectFiles(path.join(repoRoot, 'data', 'wiki-crawler', 'output'));
  for (const filePath of crawlerOutputFiles) {
    await scanExactArtifact(filePath, artifactStatuses, scanSummary, evidencePathSet, targetEvidence);
  }

  const auditStatus = scanSummary.unreadableFileCount > 0 ? 'warning' : 'pass';
  const evidenceHealth = scanSummary.unreadableFileCount > 0 ? 'partial' : 'sufficient';

  return {
    auditStatus,
    evidenceHealth,
    artifactStatuses,
    scanSummary,
    targetEvidence,
    coverageAuditPages,
    sourceRefNameMimicsRows,
    npcAuditFilesFound,
    evidencePaths: [...evidencePathSet],
  };
}

function buildTargetReport(target, state = {}, artifacts = {}) {
  const localLootJsonCount = Number(state.localLootJsonCount ?? 0);
  const localLootEntryCount = Number(state.localLootEntryCount ?? 0);
  const localDerivedByLocalIdCount = Number(state.localDerivedByLocalIdCount ?? 0);
  const localDerivedByGameIdCount = Number(state.localDerivedByGameIdCount ?? 0);
  const relationLootCount = Number(state.relationLootCount ?? 0);
  const projectionLootJsonCount = Number(state.projectionLootJsonCount ?? 0);
  const relationFactCandidateCount = Number(state.relationFactCandidateCount ?? 0);
  const targetEvidence = artifacts.targetEvidence?.get(target.internalName) ?? createEmptyTargetEvidence();
  const alreadyMaterialized = localLootJsonCount > 0 || localLootEntryCount > 0 || relationLootCount > 0 || projectionLootJsonCount > 0;
  const hasDirectLocalSourceArtifact = Boolean(targetEvidence.hasVariantSpecificEvidence);
  const onlyGenericMimicsEvidence = !hasDirectLocalSourceArtifact && (
    relationFactCandidateCount > 0 ||
    artifacts.sourceRefNameMimicsRows > 0 ||
    targetEvidence.hasGenericMimicsEvidence
  );
  const artifactStatus = alreadyMaterialized || hasDirectLocalSourceArtifact || onlyGenericMimicsEvidence
    ? 'present'
    : 'missing';
  const candidateStatus = alreadyMaterialized
    ? 'already_materialized'
    : hasDirectLocalSourceArtifact
      ? 'source_found'
      : onlyGenericMimicsEvidence
        ? 'generic_bucket_only'
        : 'missing_source';
  const gapReason = alreadyMaterialized
    ? null
    : hasDirectLocalSourceArtifact
      ? null
    : onlyGenericMimicsEvidence
      ? 'generic_mimics_bucket_not_variant_materializable'
      : 'no_existing_variant_specific_local_artifact';

  return {
    internalName: target.internalName,
    gameId: target.gameId,
    name: target.name,
    localId: Number(state.localId ?? 0),
    candidateStatus,
    artifactStatus,
    localState: {
      localLootJsonCount,
      localLootEntryCount,
      localDerivedByLocalIdCount,
      localDerivedByGameIdCount,
    },
    relationState: {
      relationLootCount,
      relationFactCandidateCount,
      projectionLootJsonCount,
    },
    evidenceHealth: targetEvidence.evidenceHealth,
    sourceArtifacts: targetEvidence.sourceArtifacts,
    candidateDropCount: targetEvidence.candidateDropCount,
    resolvedItemCount: targetEvidence.resolvedItemCount,
    unresolvedItemCount: targetEvidence.unresolvedItemCount,
    gapReason,
  };
}

function summarizeTargets(targets) {
  return {
    targets: targets.length,
    sourceFound: targets.filter((target) => target.candidateStatus === 'source_found').length,
    materializable: targets.filter((target) => target.candidateStatus === 'source_found').length,
    alreadyMaterialized: targets.filter((target) => target.candidateStatus === 'already_materialized').length,
    blocked: targets.filter((target) => target.candidateStatus !== 'already_materialized' && target.candidateStatus !== 'source_found').length,
  };
}

function buildReport(options, artifacts, targets, controls) {
  const summary = summarizeTargets(targets);
  return {
    generatedAt: new Date().toISOString(),
    auditStatus: artifacts.auditStatus ?? 'pass',
    evidenceHealth: artifacts.evidenceHealth ?? 'sufficient',
    localDatabase: options.localDatabase,
    relationDatabase: options.relationDatabase,
    artifactStatuses: artifacts.artifactStatuses ?? [],
    scanSummary: artifacts.scanSummary ?? {
      scannedFileCount: 0,
      skippedFileCount: 0,
      unreadableFileCount: 0,
      matchedEvidenceFileCount: 0,
    },
    targets,
    controls,
    artifactSummary: {
      coverageAuditPages: artifacts.coverageAuditPages ?? 0,
      sourceRefNameMimicsRows: artifacts.sourceRefNameMimicsRows ?? 0,
      npcAuditFilesFound: artifacts.npcAuditFilesFound ?? 0,
      evidencePaths: artifacts.evidencePaths ?? [],
    },
    summary,
  };
}

function buildBlockedReport(options, error) {
  return {
    generatedAt: new Date().toISOString(),
    auditStatus: 'blocked',
    evidenceHealth: 'db_unavailable',
    localDatabase: options.localDatabase,
    relationDatabase: options.relationDatabase,
    artifactStatuses: [],
    scanSummary: {
      scannedFileCount: 0,
      skippedFileCount: 0,
      unreadableFileCount: 0,
      matchedEvidenceFileCount: 0,
    },
    targets: [],
    controls: [],
    artifactSummary: {
      coverageAuditPages: 0,
      sourceRefNameMimicsRows: 0,
      npcAuditFilesFound: 0,
      evidencePaths: [],
    },
    summary: {
      targets: 0,
      sourceFound: 0,
      materializable: 0,
      alreadyMaterialized: 0,
      blocked: 0,
    },
    error: {
      code: error?.code ?? null,
      message: error?.message ?? 'database_unavailable',
    },
  };
}

async function writeReport(report, options) {
  const reportPath = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(repoRoot, 'reports', 'audit', `missing-mimic-variant-loot-${options.dateTag}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function relativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function createEmptyTargetEvidence() {
  return {
    evidenceHealth: 'insufficient_artifacts',
    sourceArtifacts: [],
    candidateDropCount: 0,
    resolvedItemCount: 0,
    unresolvedItemCount: 0,
    hasVariantSpecificEvidence: false,
    hasGenericMimicsEvidence: false,
  };
}

async function scanExactArtifact(filePath, artifactStatuses, scanSummary, evidencePathSet, targetEvidence = new Map()) {
  const relativePath = relativeRepoPath(filePath);
  if (!(await exists(filePath))) {
    artifactStatuses.push({ path: relativePath, status: 'artifact_not_found', fileSizeBytes: 0, reason: 'missing' });
    return null;
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    artifactStatuses.push({ path: relativePath, status: 'artifact_not_found', fileSizeBytes: 0, reason: 'not_a_file' });
    return null;
  }

  const extension = path.extname(filePath).toLowerCase();
  if (!ALLOWED_SCAN_EXTENSIONS.has(extension)) {
    return null;
  }
  if (stat.size > MAX_SCAN_FILE_SIZE_BYTES) {
    artifactStatuses.push({ path: relativePath, status: 'artifact_skipped_too_large', fileSizeBytes: stat.size, reason: 'over_scan_limit' });
    scanSummary.skippedFileCount += 1;
    return null;
  }

  try {
    const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
    artifactStatuses.push({ path: relativePath, status: 'present', fileSizeBytes: stat.size, reason: 'scanned' });
    evidencePathSet.add(relativePath);
    scanSummary.scannedFileCount += 1;
    if (applyTargetEvidenceFromPayload(relativePath, payload, targetEvidence)) {
      scanSummary.matchedEvidenceFileCount += 1;
    }
    return { payload, relativePath };
  } catch (error) {
    artifactStatuses.push({
      path: relativePath,
      status: 'artifact_unreadable',
      fileSizeBytes: stat.size,
      reason: 'json_parse_error',
      errorCode: error?.name ?? 'Error',
    });
    scanSummary.unreadableFileCount += 1;
    return null;
  }
}

function applyTargetEvidenceFromPayload(relativePath, payload, targetEvidence) {
  const payloadText = JSON.stringify(payload).toLowerCase();
  let matched = false;
  const isVariantSpecificLootArtifact = isVariantSpecificLootEvidencePath(relativePath);
  for (const [internalName, aliases] of VARIANT_NAME_ALIASES.entries()) {
    if (!aliases.some((alias) => payloadText.includes(alias))) continue;
    if (isVariantSpecificLootArtifact) {
      const targetState = targetEvidence.get(internalName) ?? createEmptyTargetEvidence();
      targetState.hasVariantSpecificEvidence = true;
      targetState.evidenceHealth = 'sufficient';
      if (!targetState.sourceArtifacts.includes(relativePath)) {
        targetState.sourceArtifacts.push(relativePath);
      }
      targetState.candidateDropCount = Math.max(targetState.candidateDropCount, countPotentialDrops(payload));
      targetState.resolvedItemCount = Math.max(targetState.resolvedItemCount, targetState.candidateDropCount);
      targetEvidence.set(internalName, targetState);
      matched = true;
    }
  }
  if (payloadText.includes('"mimics"') || payloadText.includes('mimics')) {
    for (const internalName of VARIANT_NAME_ALIASES.keys()) {
      const targetState = targetEvidence.get(internalName) ?? createEmptyTargetEvidence();
      targetState.hasGenericMimicsEvidence = true;
      targetEvidence.set(internalName, targetState);
    }
  }
  return matched;
}

function countPotentialDrops(payload) {
  if (Array.isArray(payload?.drops)) return payload.drops.length;
  if (Array.isArray(payload?.loot)) return payload.loot.length;
  if (Array.isArray(payload?.items)) return payload.items.length;
  if (Array.isArray(payload?.records)) return payload.records.length;
  return 1;
}

function isVariantSpecificLootEvidencePath(relativePath) {
  return relativePath.startsWith('data/wiki-crawler/output/')
    || relativePath.startsWith('data/wiki-crawler/audit/npc/')
    || relativePath.startsWith('reports/normal-npc-loot-');
}

async function collectFiles(directoryPath, predicate = null) {
  if (!(await exists(directoryPath))) {
    return [];
  }
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['.git', 'node_modules', 'dist', 'build', '.cache', 'cache', 'minio'].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, predicate));
      continue;
    }
    if (!entry.isFile()) continue;
    if (predicate && !predicate(entry)) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_SCAN_EXTENSIONS.has(extension)) continue;
    files.push(fullPath);
  }
  return files;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runMissingMimicVariantLootAudit(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result.report, null, 2));
}
