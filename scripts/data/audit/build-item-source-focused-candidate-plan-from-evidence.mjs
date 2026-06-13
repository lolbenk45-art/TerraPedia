#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  buildItemSourceCandidateImportPlan
} from './build-item-source-candidate-import-plan.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline',
  'crawler',
  'fetch',
  'flyway',
  'delete',
  'truncate',
  'drop',
  'alter',
  'write'
]);

const REVIEW_LANE_TO_CLASSIFICATION = {
  direct_page_candidate: 'high_confidence',
  family_recipe_exact_result_candidate: 'high_confidence',
  family_or_shared_page_candidate: 'family_page_candidate'
};

const REVIEWED_FAMILY_PENDING_PAGES = new Set([
  'Logic Gates',
  'Team Blocks',
  'Dragonflies',
  'Scorpions',
  'Vases',
  'Moss',
  'Altars',
  'Planter Boxes',
  'Magic Droppers',
  'Sandstone Walls',
  'Paintings',
  'Music Boxes',
  'Statues'
]);

export function parseBuildItemSourceFocusedCandidatePlanFromEvidenceArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only focused candidate plan refuses mutation flag: --${key}`);
    }
  }
  return {
    evidenceReportPath: options['evidence-report'] ?? options.evidenceReport ?? 'data/reports/item-source-existing-evidence-layers-2026-06-12.json',
    rawCandidatesPath: options['raw-candidates'] ?? options.rawCandidates ?? 'data/reports/item-source-raw-page-candidates-2026-06-11-current.json',
    familyCandidatesPath: options['family-candidates'] ?? options.familyCandidates ?? null,
    outputPath: options.output ?? null,
    rawItemPageDir: options['raw-dir'] ?? options.rawDir ?? '/home/lolben/data/terraPedia/raw/wiki/item-pages',
    npcParsedPath: options.npcs ?? options['npc-parsed'] ?? options.npcParsedPath,
    standardizedNpcsPath: options['standardized-npcs'] ?? options.standardizedNpcsPath,
    standardizedItemsPath: options.items ?? options['standardized-items'] ?? options.standardizedItemsPath,
    itemSourcesDir: options['item-sources-dir'] ?? options.itemSourcesDir,
    promotionScope: options['promotion-scope'] ?? options.promotionScope ?? 'all'
  };
}

export function buildFocusedCandidatePlanFromEvidence({
  evidenceReport = {},
  rawCandidateReport = {},
  familyCandidateAuditSummary = {},
  rawItemPageDir,
  npcParsedPath,
  standardizedNpcsPath,
  standardizedItemsPath,
  itemSourcesDir,
  promotionScope = 'all'
} = {}) {
  const targetIdentities = buildRawCandidateNotProjectedIdentities(evidenceReport);
  const familyPendingIdentities = buildReviewedFamilyPendingIdentities(evidenceReport);
  const rawCandidates = (Array.isArray(rawCandidateReport.candidates) ? rawCandidateReport.candidates : [])
    .filter((candidate) => candidateMatchesTarget(candidate, targetIdentities))
    .map(normalizeRawCandidateForImportPlan);
  const familyCandidates = extractFamilyAuditCandidates(familyCandidateAuditSummary)
    .filter((candidate) => REVIEWED_FAMILY_PENDING_PAGES.has(normalizeText(candidate.pageTitle)))
    .filter((candidate) => candidateMatchesTarget(candidate, familyPendingIdentities))
    .map(normalizeRawCandidateForImportPlan);
  const candidates = dedupeCandidates([
    ...rawCandidates,
    ...familyCandidates
  ]);
  const auditSummary = {
    generatedAt: rawCandidateReport.generatedAt ?? null,
    readOnly: true,
    parsedRawItemPages: rawCandidateReport.summary?.rawPageFound ?? null,
    inspectedRawPages: rawCandidateReport.summary?.rawPageFound ?? null,
    rawPagesWithExtractedSources: candidates.length,
    rawExtractedButStandardizedZeroCandidates: candidates.length,
    totalCandidates: candidates.length,
    classificationCounts: countBy(candidates, (candidate) => candidate.classification),
    candidates
  };

  const options = {
    auditSummary,
    promotionScope
  };
  if (rawItemPageDir != null) options.rawItemPageDir = rawItemPageDir;
  if (npcParsedPath != null) options.npcParsedPath = npcParsedPath;
  if (standardizedNpcsPath != null) options.standardizedNpcsPath = standardizedNpcsPath;
  if (standardizedItemsPath != null) options.standardizedItemsPath = standardizedItemsPath;
  if (itemSourcesDir != null) options.itemSourcesDir = itemSourcesDir;
  return buildItemSourceCandidateImportPlan(options);
}

export function runBuildItemSourceFocusedCandidatePlanFromEvidence(options = {}, dependencies = {}) {
  const evidenceReport = dependencies.evidenceReport ?? readJson(options.evidenceReportPath);
  const rawCandidateReport = dependencies.rawCandidateReport ?? readJson(options.rawCandidatesPath);
  const familyCandidateAuditSummary = dependencies.familyCandidateAuditSummary
    ?? (options.familyCandidatesPath ? readJson(options.familyCandidatesPath) : {});
  const plan = buildFocusedCandidatePlanFromEvidence({
    evidenceReport,
    rawCandidateReport,
    familyCandidateAuditSummary,
    rawItemPageDir: options.rawItemPageDir,
    npcParsedPath: options.npcParsedPath,
    standardizedNpcsPath: options.standardizedNpcsPath,
    standardizedItemsPath: options.standardizedItemsPath,
    itemSourcesDir: options.itemSourcesDir,
    promotionScope: options.promotionScope
  });
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), plan);
  }
  return plan;
}

function buildRawCandidateNotProjectedIdentities(evidenceReport) {
  const rows = evidenceReport.rowsByEvidenceLayer?.raw_candidate_not_projected
    ?? (Array.isArray(evidenceReport.rows)
      ? evidenceReport.rows.filter((row) => row.evidenceLayer === 'raw_candidate_not_projected')
      : []);
  return {
    itemIds: new Set(rows.map((row) => Number(row.itemId)).filter(Number.isInteger)),
    internalNames: new Set(rows.map((row) => normalizeIdentity(row.internalName ?? row.itemInternalName)).filter(Boolean))
  };
}

function buildReviewedFamilyPendingIdentities(evidenceReport) {
  const rows = evidenceReport.rowsByEvidenceLayer?.family_policy_pending
    ?? (Array.isArray(evidenceReport.rows)
      ? evidenceReport.rows.filter((row) => row.evidenceLayer === 'family_policy_pending')
      : []);
  return {
    itemIds: new Set(rows.map((row) => Number(row.itemId)).filter(Number.isInteger)),
    internalNames: new Set(rows.map((row) => normalizeIdentity(row.internalName ?? row.itemInternalName)).filter(Boolean))
  };
}

function candidateMatchesTarget(candidate, targets) {
  const itemId = Number(candidate.itemId);
  if (Number.isInteger(itemId) && targets.itemIds.has(itemId)) return true;
  return targets.internalNames.has(normalizeIdentity(candidate.itemInternalName ?? candidate.internalName));
}

function normalizeRawCandidateForImportPlan(candidate) {
  const classification = REVIEW_LANE_TO_CLASSIFICATION[candidate.reviewLane] ?? candidate.classification ?? 'unknown';
  return {
    ...candidate,
    itemInternalName: candidate.itemInternalName ?? candidate.internalName ?? null,
    itemName: candidate.itemName ?? candidate.name ?? null,
    classification,
    rawSourceCount: Number(candidate.rawSourceCount ?? candidate.extractedSourceCount ?? (Array.isArray(candidate.extractedSources) ? candidate.extractedSources.length : 0)),
    standardizedSourceCount: Number(candidate.standardizedSourceCount ?? 0)
  };
}

function extractFamilyAuditCandidates(summary) {
  const direct = Array.isArray(summary?.candidates) ? summary.candidates : [];
  const planCandidates = [
    ...(Array.isArray(summary?.eligibleCandidates) ? summary.eligibleCandidates : []),
    ...(Array.isArray(summary?.blockedCandidates) ? summary.blockedCandidates : [])
  ];
  return [...direct, ...planCandidates].map((candidate) => ({
    ...candidate,
    classification: candidate.classification ?? 'family_page_candidate',
    extractedSources: candidate.extractedSources
      ?? candidate.blockedSources
      ?? candidate.plannedSources
      ?? []
  }));
}

function dedupeCandidates(candidates) {
  const deduped = new Map();
  for (const candidate of candidates) {
    const key = JSON.stringify([
      normalizeIdentity(candidate.itemInternalName ?? candidate.internalName),
      normalizeText(candidate.pageTitle)
    ]);
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }
  return [...deduped.values()];
}

function countBy(values, keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value) ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const plan = runBuildItemSourceFocusedCandidatePlanFromEvidence(parseBuildItemSourceFocusedCandidatePlanFromEvidenceArgs());
    process.stdout.write(`${JSON.stringify(plan.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
