#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

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

export function parseBuildItemSourceGapCoveragePlanArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key) && value !== false && value !== 'false') {
      throw new Error(`read-only coverage plan refuses mutation flag: --${key}`);
    }
  }
  return {
    baselinePath: options.baseline ?? path.join(process.cwd(), 'data', 'reports', 'item-source-full-baseline-2026-06-11.json'),
    candidatePlanPath: options['candidate-plan'] ?? options.candidatePlan ?? path.join(process.cwd(), 'data', 'reports', 'item-source-candidate-import-plan.latest.json'),
    outputPath: options.output ?? null
  };
}

export function buildItemSourceGapCoveragePlan({
  generatedAt = new Date().toISOString(),
  baselineReport = {},
  candidatePlan = {}
} = {}) {
  const candidateIndex = buildCandidateIndex(candidatePlan);
  const rows = (Array.isArray(baselineReport.rows) ? baselineReport.rows : [])
    .map((row) => buildCoveragePlanRow(row, candidateIndex))
    .sort((a, b) => a.itemId - b.itemId);
  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_gap_coverage_plan',
    inputs: {
      baselineGeneratedAt: baselineReport.generatedAt ?? null,
      candidatePlanGeneratedAt: candidatePlan.generatedAt ?? null
    },
    summary: buildSummary(rows),
    rows
  };
}

export function runBuildItemSourceGapCoveragePlan(options = {}) {
  const baselineReport = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.baselinePath), 'utf8'));
  const candidatePlan = fs.existsSync(path.resolve(process.cwd(), options.candidatePlanPath))
    ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.candidatePlanPath), 'utf8'))
    : {};
  const plan = buildItemSourceGapCoveragePlan({ baselineReport, candidatePlan });
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), plan);
  }
  return plan;
}

function buildCoveragePlanRow(row, candidateIndex) {
  const internalName = normalizeText(row.internalName ?? row.itemInternalName);
  const itemId = Number(row.itemId ?? row.id);
  const candidate = candidateIndex.get(normalizeIdentity(internalName));
  const lane = resolveLane(row, candidate);
  return {
    itemId,
    internalName,
    name: row.name ?? row.itemName ?? null,
    activeSourceCount: Number(row.activeSourceCount ?? 0),
    baselineBucket: row.primaryBucket ?? null,
    lane,
    candidateClassification: candidate?.classification ?? null,
    candidateBlockedReason: candidate?.blockedReason ?? null,
    plannedSourceRows: Number(candidate?.plannedSourceRows ?? 0),
    blockedReason: resolveBlockedReason(row, candidate, lane),
    evidence: Array.isArray(row.evidence) ? row.evidence : []
  };
}

function resolveLane(row, candidate) {
  if (Number(row.activeSourceCount ?? 0) > 0 || row.primaryBucket === 'local_source_already_present') {
    return 'local_source_already_present';
  }
  if (row.primaryBucket === 'publication_chain_gap') {
    return 'publication_chain_gap';
  }
  if (candidate?.classification === 'high_confidence' && candidate.kind === 'eligible') {
    return 'high_confidence_candidate_import';
  }
  if (candidate?.classification === 'family_page_candidate' || candidate?.blockedReason === 'family_page_candidate') {
    return 'family_policy_candidate';
  }
  if (candidate?.classification === 'polluted_candidate' || candidate?.blockedReason === 'polluted_candidate') {
    return 'polluted_page_candidate';
  }
  if (row.primaryBucket === 'npc_relation_chain_gap') {
    return 'npc_ref_resolution_gap';
  }
  if (row.hasRecipe || row.primaryBucket === 'recipe_chain_covered') {
    return 'recipe_or_shimmer_chain_covered';
  }
  if (row.hasBiomeEvidence || row.primaryBucket === 'biome_evidence_only') {
    return 'biome_evidence_projection';
  }
  if (row.primaryBucket === 'explicit_no_source_exemption' && row.exemptionStatus !== 'ignored_due_to_existing_evidence') {
    return 'explicit_no_source_exemption';
  }
  return 'unclassified_requires_new_lane';
}

function resolveBlockedReason(row, candidate, lane) {
  if (lane === 'unclassified_requires_new_lane') {
    return row.blockedReason ?? candidate?.blockedReason ?? 'no_coverage_lane';
  }
  if (['family_policy_candidate', 'polluted_page_candidate'].includes(lane)) {
    return candidate?.blockedReason ?? row.blockedReason ?? lane;
  }
  return row.blockedReason ?? null;
}

function buildCandidateIndex(plan) {
  const byName = new Map();
  for (const candidate of Array.isArray(plan.eligibleCandidates) ? plan.eligibleCandidates : []) {
    byName.set(normalizeIdentity(candidate.itemInternalName), {
      kind: 'eligible',
      classification: candidate.classification ?? null,
      plannedSourceRows: Array.isArray(candidate.plannedSources) ? candidate.plannedSources.length : 0
    });
  }
  for (const candidate of Array.isArray(plan.blockedCandidates) ? plan.blockedCandidates : []) {
    byName.set(normalizeIdentity(candidate.itemInternalName), {
      kind: 'blocked',
      classification: candidate.classification ?? null,
      blockedReason: candidate.blockedReason ?? null,
      plannedSourceRows: Array.isArray(candidate.blockedSources) ? candidate.blockedSources.length : 0
    });
  }
  return byName;
}

function buildSummary(rows) {
  const laneCounts = {};
  for (const row of rows) {
    laneCounts[row.lane] = (laneCounts[row.lane] ?? 0) + 1;
  }
  return {
    totalRows: rows.length,
    localSourceAlreadyPresent: laneCounts.local_source_already_present ?? 0,
    publicationChainGap: laneCounts.publication_chain_gap ?? 0,
    highConfidenceCandidateImport: laneCounts.high_confidence_candidate_import ?? 0,
    familyPolicyCandidate: laneCounts.family_policy_candidate ?? 0,
    pollutedPageCandidate: laneCounts.polluted_page_candidate ?? 0,
    npcRefResolutionGap: laneCounts.npc_ref_resolution_gap ?? 0,
    recipeOrShimmerChainCovered: laneCounts.recipe_or_shimmer_chain_covered ?? 0,
    biomeEvidenceProjection: laneCounts.biome_evidence_projection ?? 0,
    explicitNoSourceExemption: laneCounts.explicit_no_source_exemption ?? 0,
    unclassifiedRequiresNewLane: laneCounts.unclassified_requires_new_lane ?? 0,
    laneCounts
  };
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runBuildItemSourceGapCoveragePlan(parseBuildItemSourceGapCoveragePlanArgs());
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
