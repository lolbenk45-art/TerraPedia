#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { listSourceDatasetLandingInputs } from '../landing/source-dataset-locator.mjs';
import { resolveProjectPath } from '../lib/project-root.mjs';
import {
  CANONICAL_CANDIDATE_VERSION,
  buildSourceLandingId,
  createCanonicalContentHash,
  validateCanonicalCandidate,
} from './canonical-schema.mjs';

const defaultRepoRoot = resolveProjectPath();
const ITEM_DATASET_TYPES = new Set(['items_raw', 'item_pages_raw']);

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) {
      continue;
    }
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    if (separatorIndex === -1) {
      args[body] = 'true';
      continue;
    }
    args[body.slice(0, separatorIndex)] = body.slice(separatorIndex + 1);
  }
  return args;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function sanitizeFileSegment(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

async function resolvePayload(entry) {
  if (entry.payload !== undefined) {
    return entry.payload;
  }
  if (typeof entry.loadPayload === 'function') {
    return entry.loadPayload();
  }
  return null;
}

export function buildCanonicalCandidateFromLanding(entry, payload, generatedAt) {
  return {
    canonical_version: CANONICAL_CANDIDATE_VERSION,
    domain: 'item',
    dataset_type: entry.datasetType,
    candidate_generated_at: generatedAt,
    source_landing_id: buildSourceLandingId({
      datasetType: entry.datasetType,
      provider: entry.provider,
      sourceKey: entry.sourceKey,
      sourcePage: entry.sourcePage,
    }),
    source_provider: entry.provider,
    source_key: entry.sourceKey,
    source_page: entry.sourcePage,
    source_revision_timestamp: entry.sourceRevisionTimestamp ?? null,
    source_content_hash: entry.contentHash,
    content_hash: createCanonicalContentHash(payload),
    payload,
  };
}

function buildCandidatePayloadFileName(candidate, index) {
  const dataset = sanitizeFileSegment(candidate.dataset_type);
  const sourceKey = sanitizeFileSegment(candidate.source_key);
  const sourcePage = sanitizeFileSegment(candidate.source_page);
  return `${String(index + 1).padStart(5, '0')}-${dataset}-${sourceKey}-${sourcePage || 'payload'}.json`;
}

export async function buildItemCanonicalCandidateSet(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const generatedAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const landingInputs = await listSourceDatasetLandingInputs({
    repoRoot,
    sharedDataRoot: options.sharedDataRoot,
    datasets: ['items_raw', 'item_pages_raw'],
  });

  const candidates = [];
  const schemaViolations = [];
  let hashMatches = 0;

  for (const entry of landingInputs.filter((item) => ITEM_DATASET_TYPES.has(item.datasetType))) {
    const payload = await resolvePayload(entry);
    const candidate = buildCanonicalCandidateFromLanding(entry, payload, generatedAt);
    const errors = validateCanonicalCandidate(candidate);
    if (errors.length > 0) {
      schemaViolations.push({
        sourceLandingId: candidate.source_landing_id,
        errors,
      });
    }
    if (candidate.content_hash === normalizeText(entry.contentHash)) {
      hashMatches += 1;
    }
    candidates.push(candidate);
  }

  return {
    domain: 'item',
    generatedAt,
    candidates,
    summary: {
      totalLandingInputs: landingInputs.length,
      totalCandidates: candidates.length,
      coverageRate: landingInputs.length === 0 ? 0 : candidates.length / landingInputs.length,
      hashMatchRate: candidates.length === 0 ? 0 : hashMatches / candidates.length,
      schemaViolations,
    },
  };
}

export async function writeItemCanonicalCandidateArtifacts(candidateSet, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const reportDir = path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item');
  const candidatesPath = path.join(reportDir, 'canonical-candidates.json');
  const summaryPath = path.join(reportDir, 'canonical-summary.json');
  const payloadDir = path.join(reportDir, 'payloads');
  const persistedCandidates = [];
  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(payloadDir, { recursive: true });

  for (let index = 0; index < candidateSet.candidates.length; index += 1) {
    const candidate = candidateSet.candidates[index];
    const payloadFileName = buildCandidatePayloadFileName(candidate, index);
    const payloadPath = path.join(payloadDir, payloadFileName);
    await fs.writeFile(payloadPath, JSON.stringify(candidate.payload, null, 2), 'utf8');
    persistedCandidates.push({
      ...candidate,
      payload_file: `payloads/${payloadFileName}`,
      payload: undefined,
    });
  }

  await fs.writeFile(candidatesPath, JSON.stringify({
    domain: candidateSet.domain,
    generatedAt: candidateSet.generatedAt,
    candidates: persistedCandidates,
  }, null, 2), 'utf8');
  await fs.writeFile(summaryPath, JSON.stringify({
    ...candidateSet.summary,
    payloadDirectory: 'payloads',
  }, null, 2), 'utf8');
  return {
    reportDir,
    candidatesPath,
    payloadDir,
    summaryPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] ?? defaultRepoRoot);
  const candidateSet = await buildItemCanonicalCandidateSet({
    repoRoot,
    sharedDataRoot: args['shared-data-root'],
  });
  const artifactPaths = await writeItemCanonicalCandidateArtifacts(candidateSet, { repoRoot });
  console.log(JSON.stringify({
    domain: candidateSet.domain,
    generatedAt: candidateSet.generatedAt,
    summary: candidateSet.summary,
    artifactPaths,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
