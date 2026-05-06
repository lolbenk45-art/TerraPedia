#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { listSourceDatasetLandingInputs } from '../landing/source-dataset-locator.mjs';
import { resolveProjectPath } from '../lib/project-root.mjs';
import { validateCanonicalCandidate } from './canonical-schema.mjs';

const defaultRepoRoot = resolveProjectPath();

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

function buildLandingIndex(entries) {
  return new Map(entries.map((entry) => [
    `${entry.datasetType}::${entry.provider}::${entry.sourceKey}::${entry.sourcePage}`,
    entry,
  ]));
}

async function loadCandidatePayload(reportRoot, candidate) {
  if (candidate.payload !== undefined) {
    return candidate.payload;
  }
  const payloadFile = String(candidate.payload_file ?? '').trim();
  if (!payloadFile) {
    return undefined;
  }
  const payloadPath = path.join(reportRoot, payloadFile);
  return JSON.parse(await fs.readFile(payloadPath, 'utf8'));
}

export async function auditCanonicalConsistency(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const candidatesPath = path.resolve(
    options.candidatesPath ?? path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item', 'canonical-candidates.json'),
  );
  const reportRoot = path.dirname(candidatesPath);
  const generatedAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const artifact = JSON.parse(await fs.readFile(candidatesPath, 'utf8'));
  const candidates = Array.isArray(artifact.candidates) ? artifact.candidates : [];
  const landingInputs = await listSourceDatasetLandingInputs({
    repoRoot,
    sharedDataRoot: options.sharedDataRoot,
    datasets: ['items_raw', 'item_pages_raw'],
  });
  const landingIndex = buildLandingIndex(landingInputs);

  const schemaViolations = [];
  const missingLandingInputs = [];
  let hashMatches = 0;

  for (const candidate of candidates) {
    const payload = await loadCandidatePayload(reportRoot, candidate);
    const hydratedCandidate = {
      ...candidate,
      payload,
    };
    const errors = validateCanonicalCandidate(hydratedCandidate);
    if (errors.length > 0) {
      schemaViolations.push({
        sourceLandingId: candidate.source_landing_id,
        errors,
      });
    }
    const lookupKey = `${candidate.dataset_type}::${candidate.source_provider}::${candidate.source_key}::${candidate.source_page}`;
    const landingEntry = landingIndex.get(lookupKey);
    if (!landingEntry) {
      missingLandingInputs.push(candidate.source_landing_id);
      continue;
    }
    if (
      landingEntry.contentHash === candidate.source_content_hash &&
      landingEntry.contentHash === candidate.content_hash
    ) {
      hashMatches += 1;
    }
  }

  return {
    domain: artifact.domain ?? 'item',
    generatedAt,
    summary: {
      totalLandingInputs: landingInputs.length,
      totalCandidates: candidates.length,
      coverageRate: landingInputs.length === 0 ? 0 : candidates.length / landingInputs.length,
      hashMatchRate: candidates.length === 0 ? 0 : hashMatches / candidates.length,
      schemaViolations,
      missingLandingInputs,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] ?? defaultRepoRoot);
  const audit = await auditCanonicalConsistency({
    repoRoot,
    sharedDataRoot: args['shared-data-root'],
    candidatesPath: args.input,
  });
  const reportDir = path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item');
  const reportPath = path.join(reportDir, 'canonical-consistency-audit.json');
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(audit, null, 2), 'utf8');
  console.log(JSON.stringify({ reportPath, ...audit }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
