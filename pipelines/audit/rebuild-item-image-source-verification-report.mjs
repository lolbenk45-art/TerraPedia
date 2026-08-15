#!/usr/bin/env node

// Reconstruct a complete item image source verification report.
//
// A verification round writes one report per run. When an earlier round's report
// is lost, its records are not gone: the promotion review it produced carries
// every field of each promoted source verbatim, including the per-record
// response hash. This replays those rows back into report shape and merges them
// with a later round's own report.
//
// Nothing is invented here. A row is only replayed when it carries
// `evidenceKind: mediawiki_exact_file` and a `verificationResponseSha256`, which
// together mean it came from a verification round rather than from candidate
// extraction. Every replayed source still faces the raw-evidence hash check in
// generate-item-image-source-promotion.mjs before it can reach a bundle.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const VERIFICATION_EVIDENCE_KIND = 'mediawiki_exact_file';

export function buildReconstructedItemImageSourceVerificationReport({
  promotionReviewBytes,
  roundReportBytes,
  generatedAt
} = {}) {
  const review = parseJsonBytes(promotionReviewBytes, 'promotionReviewBytes');
  const roundReport = parseJsonBytes(roundReportBytes, 'roundReportBytes');
  if (review?.entity !== 'item_image_source_promotion_review') {
    throw new Error('reconstruction requires an item image source promotion review');
  }
  if (roundReport?.entity !== 'item_image_source_verification') {
    throw new Error('reconstruction requires an item image source verification report');
  }

  const roundRecords = requireRecords(roundReport?.records, 'round report records');
  const records = [...roundRecords].map((record) => structuredClone(record));
  const seen = new Set(records.map((record) => requireText(
    record?.itemInternalName,
    'round record itemInternalName'
  )));

  let reconstructedRecordCount = 0;
  for (const row of requireRecords(review?.rows, 'promotion review rows')) {
    if (!isVerificationSourcedRow(row)) continue;
    const itemInternalName = requireText(row?.itemInternalName, 'review row itemInternalName');
    if (seen.has(itemInternalName)) {
      throw new Error(`duplicate reconstructed identity ${itemInternalName}`);
    }
    seen.add(itemInternalName);
    reconstructedRecordCount += 1;
    records.push({
      itemId: row.itemId,
      itemInternalName,
      itemName: requireText(row?.itemName, 'review row itemName'),
      classification: 'verified',
      source: structuredClone(row.source),
      ...(Array.isArray(row.secondarySources) && row.secondarySources.length > 0
        ? { secondarySources: structuredClone(row.secondarySources) }
        : {}),
      comparison: structuredClone(row.comparison ?? null),
      responseSha256: row.source.verificationResponseSha256
    });
  }

  records.sort(compareRecords);
  return {
    schemaVersion: '1.0.0',
    entity: 'item_image_source_verification',
    generatedAt: requireText(generatedAt, 'generatedAt'),
    inputs: {
      ...structuredClone(roundReport.inputs ?? {}),
      rawFiles: collectRawFiles(records)
    },
    constraints: structuredClone(roundReport.constraints ?? null),
    summary: buildSummary(records, roundReport),
    reconstruction: {
      method: 'promotion_review_evidence_replay',
      reconstructedRecordCount,
      roundRecordCount: roundRecords.length,
      promotionReview: {
        generatedAt: review.generatedAt ?? null,
        candidateReportSha256: review?.descriptor?.candidateReport?.sha256 ?? null,
        lostVerificationReportSha256: review?.descriptor?.verificationReport?.sha256 ?? null
      },
      roundReport: {
        generatedAt: roundReport.generatedAt ?? null,
        verificationInput: structuredClone(roundReport?.inputs?.verificationInput ?? null)
      }
    },
    records
  };
}

function isVerificationSourcedRow(row) {
  const source = row?.source;
  return row?.status === 'promoted'
    && source
    && typeof source === 'object'
    && source.evidenceKind === VERIFICATION_EVIDENCE_KIND
    && Boolean(text(source.verificationResponseSha256));
}

function collectRawFiles(records) {
  const byPath = new Map();
  for (const record of records) {
    for (const source of [record.source, ...(record.secondarySources ?? [])]) {
      if (!source) continue;
      const rawPath = requireText(source.rawSourceFile, 'reconstructed rawSourceFile');
      const sha256 = requireText(source.rawFileSha256, `raw evidence hash for ${rawPath}`);
      const current = byPath.get(rawPath);
      if (current && current.sha256 !== sha256) {
        throw new Error(`conflicting raw evidence descriptor for ${rawPath}`);
      }
      byPath.set(rawPath, { path: rawPath, sha256 });
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function buildSummary(records, roundReport) {
  const count = (classification) => records
    .filter((record) => record.classification === classification).length;
  return {
    total: records.length,
    verified: count('verified'),
    ambiguous: count('ambiguous'),
    unresolved: count('unresolved'),
    failed: count('failed'),
    requestCount: Number(roundReport?.summary?.requestCount ?? 0)
  };
}

function compareRecords(left, right) {
  const byId = Number(left.itemId) - Number(right.itemId);
  if (Number.isFinite(byId) && byId !== 0) return byId;
  return String(left.itemInternalName).localeCompare(String(right.itemInternalName));
}

function parseJsonBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
}

function requireRecords(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requireText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) options[token.slice(2, separator)] = token.slice(separator + 1);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const outputPath = path.resolve(requireText(args.output, 'output'));
    if (fs.existsSync(outputPath)) {
      throw new Error(`reconstructed report already exists: ${outputPath}`);
    }
    const report = buildReconstructedItemImageSourceVerificationReport({
      promotionReviewBytes: fs.readFileSync(path.resolve(requireText(args.review, 'review'))),
      roundReportBytes: fs.readFileSync(path.resolve(requireText(args.round, 'round'))),
      generatedAt: args['generated-at'] ?? new Date().toISOString()
    });
    writeJsonFile(outputPath, report);
    process.stdout.write(`${JSON.stringify({
      output: outputPath,
      summary: report.summary,
      reconstruction: {
        reconstructedRecordCount: report.reconstruction.reconstructedRecordCount,
        roundRecordCount: report.reconstruction.roundRecordCount
      }
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  }
}
