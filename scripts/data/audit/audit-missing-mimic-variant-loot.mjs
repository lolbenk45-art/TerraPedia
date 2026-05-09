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

  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
  };
  const connection = dependencies.connection ?? await mysql.createConnection(mysqlOptions);
  const shouldClose = !dependencies.connection;

  try {
    const targetStates = await loadNpcState(connection, normalized, [...TARGETS, ...CONTROLS]);
    const artifacts = await scanArtifacts();
    const targets = TARGETS.map((target) => buildTargetReport(target, targetStates.get(target.internalName), artifacts));
    const controls = CONTROLS.map((target) => buildTargetReport(target, targetStates.get(target.internalName), artifacts));

    const report = {
      generatedAt: new Date().toISOString(),
      localDatabase: normalized.localDatabase,
      relationDatabase: normalized.relationDatabase,
      targets,
      controls,
      artifactSummary: {
        coverageAuditPages: artifacts.coverageAuditPages,
        sourceRefNameMimicsRows: artifacts.sourceRefNameMimicsRows,
        npcAuditFilesFound: artifacts.npcAuditFilesFound,
        evidencePaths: artifacts.evidencePaths,
      },
      summary: summarizeTargets(targets),
    };

    let reportPath = null;
    if (normalized.writeReport) {
      reportPath = await writeReport(report, normalized);
    }
    return { report, reportPath };
  } finally {
    if (shouldClose) {
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
  const evidencePaths = [];
  const coverageAuditPath = path.join(repoRoot, 'data', 'wiki-crawler', 'report', 'npc', 'coverage-audit.latest.json');
  const coverageTargetsPath = path.join(repoRoot, 'data', 'wiki-crawler', 'report', 'npc', 'coverage-targets.latest.json');
  const normalLootDryRunPath = path.join(repoRoot, 'reports', 'normal-npc-loot-restore-dry-run-2026-04-29.json');
  const normalLootApplyPath = path.join(repoRoot, 'reports', 'normal-npc-loot-restore-apply-2026-04-29.json');
  const npcAuditDir = path.join(repoRoot, 'data', 'wiki-crawler', 'audit', 'npc');

  let coverageAuditPages = 0;
  if (await exists(coverageAuditPath)) {
    evidencePaths.push(relativeRepoPath(coverageAuditPath));
    const payload = JSON.parse(await fs.readFile(coverageAuditPath, 'utf8'));
    const targets = Array.isArray(payload?.targets) ? payload.targets : Array.isArray(payload) ? payload : [];
    coverageAuditPages = targets.filter((target) =>
      ['Present Mimic', 'Corrupt Mimic', 'Crimson Mimic', 'Hallowed Mimic', 'Jungle Mimic'].includes(target.pageTitle)
    ).length;
  }

  if (await exists(coverageTargetsPath)) {
    evidencePaths.push(relativeRepoPath(coverageTargetsPath));
  }

  let sourceRefNameMimicsRows = 0;
  for (const reportPath of [normalLootDryRunPath, normalLootApplyPath]) {
    if (!(await exists(reportPath))) continue;
    evidencePaths.push(relativeRepoPath(reportPath));
    const payload = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    const unmatched = Array.isArray(payload?.unmatchedSourceNames) ? payload.unmatchedSourceNames : [];
    const mimicEntry = unmatched.find((entry) => entry?.sourceRefName === 'Mimics');
    if (mimicEntry) {
      sourceRefNameMimicsRows = Math.max(sourceRefNameMimicsRows, Number(mimicEntry.sourceRows ?? 0));
    }
  }

  let npcAuditFilesFound = 0;
  for (const slug of ['present-mimic', 'corrupt-mimic', 'crimson-mimic', 'hallowed-mimic', 'jungle-mimic']) {
    const filePath = path.join(npcAuditDir, `${slug}.latest.json`);
    if (await exists(filePath)) {
      npcAuditFilesFound += 1;
      evidencePaths.push(relativeRepoPath(filePath));
    }
  }

  return {
    coverageAuditPages,
    sourceRefNameMimicsRows,
    npcAuditFilesFound,
    evidencePaths: [...new Set(evidencePaths)],
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
  const alreadyMaterialized = localLootJsonCount > 0 || localLootEntryCount > 0 || relationLootCount > 0 || projectionLootJsonCount > 0;
  const hasDirectLocalSourceArtifact = false;
  const onlyGenericMimicsEvidence = relationFactCandidateCount > 0 || artifacts.sourceRefNameMimicsRows > 0;
  const candidateStatus = alreadyMaterialized
    ? 'already_materialized'
    : hasDirectLocalSourceArtifact
      ? 'source_found'
      : onlyGenericMimicsEvidence
        ? 'missing_source'
        : 'missing_source';
  const gapReason = alreadyMaterialized
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
    artifactStatus: artifacts.coverageAuditPages > 0 ? 'present' : 'missing',
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
    sourceArtifacts: artifacts.evidencePaths,
    candidateDropCount: 0,
    resolvedItemCount: 0,
    unresolvedItemCount: 0,
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runMissingMimicVariantLootAudit(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result.report, null, 2));
}
