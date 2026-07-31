#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext
} from '../automation/authorized-operation-context.mjs';
import { hashOrderedBundleBytes } from '../automation/build-canonical-cutover-authorization.mjs';
import { createWikiRequestGate } from '../lib/wiki-request-gate.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const ACTION_ID = 'item-image-source-verification';
const OPERATION_ID = 'canonical-item-image-source-verification';
const DEFAULT_API_URL = 'https://terraria.wiki.gg/api.php';
const DEFAULT_INPUT_PATH = 'reports/authorization/canonical/canonical-item-image-source-verification.input.json';
const DEFAULT_OUTPUT_PATH = 'reports/audit/item-image-source-verification.latest.json';
const DEFAULT_PROGRESS_PATH = 'reports/backend-refresh/history/canonical-item-image-source-verification.runtime/child-status.json';
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_MAX_REQUESTS = 877;
const SINGLE_ATTEMPT_REQUEST_PROFILE = Object.freeze({
  baseDelayMs: 1_000,
  jitterMs: 500,
  maxAttempts: 1,
  cooldownMs: 15 * 60_000
});

export function buildItemImageSourceVerificationInput({
  candidateReportBytes,
  candidateReportPath = 'reports/audit/item-image-source-candidates-2026-07-30-v2.json',
  promotionReviewBytes,
  promotionReviewPath = 'reports/audit/item-image-source-promotion-review-2026-07-30.json',
  rawEvidenceBytesByFile,
  generatedAt = new Date().toISOString(),
  batchSize = DEFAULT_BATCH_SIZE,
  maxRequests
} = {}) {
  const candidateReport = parseJsonBytes(candidateReportBytes, 'candidateReportBytes');
  const promotionReview = parseJsonBytes(promotionReviewBytes, 'promotionReviewBytes');
  if (candidateReport?.schemaVersion !== '2.0.0'
      || candidateReport?.entity !== 'item_image_source_candidates') {
    throw new Error('item image verification requires candidate schema 2.0.0');
  }
  if (promotionReview?.schemaVersion !== 1
      || promotionReview?.entity !== 'item_image_source_promotion_review') {
    throw new Error('item image verification requires a promotion review');
  }
  const candidateReportSha256 = sha256Bytes(candidateReportBytes);
  if (promotionReview?.descriptor?.candidateReport?.sha256 !== candidateReportSha256) {
    throw new Error('promotion review candidate report SHA-256 mismatch');
  }
  if (Number(promotionReview?.counters?.duplicate) !== 0
      || Number(promotionReview?.counters?.conflict) !== 0) {
    throw new Error('promotion review duplicate/conflict counters must be zero before verification');
  }

  const reviewRows = requireRecords(promotionReview?.rows, 'promotion review rows')
    .filter((row) => row?.status === 'ambiguous' || row?.status === 'unresolved')
    .sort(compareItemIdentity);
  const expectedReviewRows = Number(promotionReview?.counters?.ambiguous ?? 0)
    + Number(promotionReview?.counters?.unresolved ?? 0);
  if (reviewRows.length !== expectedReviewRows) {
    throw new Error('promotion review unresolved identity counters do not match its rows');
  }
  const effectiveBatchSize = positiveInteger(batchSize, DEFAULT_BATCH_SIZE);
  const effectiveMaxRequests = positiveInteger(maxRequests, reviewRows.length);
  if (effectiveMaxRequests !== reviewRows.length) {
    throw new Error('item image verification request cap must equal the frozen identity count');
  }

  const candidateByInternalName = indexUniqueByInternalName(
    requireRecords(candidateReport?.records, 'candidate report records'),
    'candidate report'
  );
  const quarantineByInternalName = indexUniqueByInternalName([
    ...requireRecords(candidateReport?.quarantine?.groupPages ?? [], 'group quarantine rows'),
    ...requireRecords(candidateReport?.quarantine?.nonGroupPages ?? [], 'non-group quarantine rows')
  ], 'candidate quarantine');
  const rawDescriptorByPath = new Map();
  for (const descriptor of requireRecords(candidateReport?.inputs?.rawFiles, 'candidate raw descriptors')) {
    const rawPath = requireText(descriptor?.path, 'candidate raw descriptor path');
    if (rawDescriptorByPath.has(rawPath)) {
      throw new Error(`duplicate candidate raw descriptor ${rawPath}`);
    }
    rawDescriptorByPath.set(rawPath, {
      path: rawPath,
      sha256: requireSha256(descriptor?.sha256, `candidate raw descriptor ${rawPath}`)
    });
  }
  const rawBytes = rawEvidenceBytesByFile instanceof Map
    ? rawEvidenceBytesByFile
    : new Map(Object.entries(rawEvidenceBytesByFile ?? {}));
  const seenIds = new Set();
  const seenInternalNames = new Set();
  const relevantRawDescriptors = new Map();
  const records = reviewRows.map((reviewRow) => {
    const identity = itemIdentity({
      itemId: reviewRow?.itemId,
      itemInternalName: requireText(reviewRow?.itemInternalName, 'review itemInternalName'),
      itemName: requireText(reviewRow?.itemName, 'review itemName')
    });
    if (seenIds.has(String(identity.itemId)) || seenInternalNames.has(identity.itemInternalName)) {
      throw new Error(`duplicate frozen item image identity ${identity.itemInternalName}`);
    }
    seenIds.add(String(identity.itemId));
    seenInternalNames.add(identity.itemInternalName);
    const candidate = candidateByInternalName.get(identity.itemInternalName);
    if (!candidate || String(candidate.itemId) !== String(identity.itemId)
        || candidate.itemName !== identity.itemName
        || candidate.classification !== reviewRow.status) {
      throw new Error(`candidate/review identity mismatch for ${identity.itemInternalName}`);
    }
    const quarantine = quarantineByInternalName.get(identity.itemInternalName);
    if (!quarantine) {
      throw new Error(`candidate quarantine evidence is missing for ${identity.itemInternalName}`);
    }
    const rawSourceFile = requireText(quarantine.sourceFile, `raw source file for ${identity.itemInternalName}`);
    const rawDescriptor = rawDescriptorByPath.get(rawSourceFile);
    if (!rawDescriptor || !rawBytes.has(rawSourceFile)) {
      throw new Error(`raw evidence bytes are missing for ${identity.itemInternalName}`);
    }
    if (sha256Bytes(rawBytes.get(rawSourceFile)) !== rawDescriptor.sha256) {
      throw new Error(`raw evidence SHA-256 mismatch for ${identity.itemInternalName}`);
    }
    const rawPayload = parseJsonBytes(rawBytes.get(rawSourceFile), `raw evidence ${rawSourceFile}`);
    const pageId = Number(rawPayload?.pageId);
    const requestedPageTitle = requireText(
      rawPayload?.requestedPageTitle ?? quarantine.requestedPageTitle,
      `requested page title for ${identity.itemInternalName}`
    );
    const sourcePage = requireText(
      rawPayload?.pageTitle ?? quarantine.pageTitle,
      `source page for ${identity.itemInternalName}`
    );
    if (!Number.isInteger(pageId) || pageId <= 0
        || requestedPageTitle !== quarantine.requestedPageTitle
        || sourcePage !== quarantine.pageTitle) {
      throw new Error(`raw page identity mismatch for ${identity.itemInternalName}`);
    }
    const identityKeys = new Set([
      normalizeIdentity(identity.itemInternalName),
      normalizeIdentity(identity.itemName)
    ]);
    const fileTitles = [...new Set([
      ...(quarantine.candidateFileTitles ?? []),
      `${identity.itemName}.png`,
      `${identity.itemName}.gif`
    ].map(normalizeFileTitle).filter((fileTitle) => (
      fileTitle && identityKeys.has(normalizeFileIdentity(fileTitle))
    )))].sort((left, right) => left.localeCompare(right));
    if (fileTitles.length === 0) {
      throw new Error(`exact file title probes are missing for ${identity.itemInternalName}`);
    }
    relevantRawDescriptors.set(rawSourceFile, rawDescriptor);
    return {
      ...identity,
      priorClassification: reviewRow.status,
      rawSourceFile,
      rawFileSha256: rawDescriptor.sha256,
      pageId,
      requestedPageTitle,
      sourcePage,
      sourceRevisionTimestamp: requireTimestamp(
        rawPayload?.revisionTimestamp,
        `source revision timestamp for ${identity.itemInternalName}`
      ),
      fileTitles,
      comparison: structuredClone(candidate.comparison ?? null)
    };
  });

  return {
    schemaVersion: '1.0.0',
    entity: 'item_image_source_verification_input',
    generatedAt: requireTimestamp(generatedAt, 'verification input generatedAt'),
    inputs: {
      candidateReport: {
        path: candidateReportPath,
        sha256: candidateReportSha256
      },
      promotionReview: {
        path: promotionReviewPath,
        sha256: sha256Bytes(promotionReviewBytes)
      },
      standardized: structuredClone(promotionReview.descriptor.standardized),
      unresolvedIdentitySetSha256: sha256Canonical(records.map((record) => ({
        itemId: record.itemId,
        itemInternalName: record.itemInternalName,
        itemName: record.itemName,
        priorClassification: record.priorClassification
      }))),
      rawFiles: [...relevantRawDescriptors.values()]
        .sort((left, right) => left.path.localeCompare(right.path))
    },
    constraints: {
      batchSize: effectiveBatchSize,
      maxRequests: effectiveMaxRequests
    },
    writeBoundary: {
      networkRequests: false,
      databaseWrites: false,
      standardizedDataModified: false,
      promotionBundleWritten: false
    },
    records
  };
}

export async function prepareItemImageSourceVerificationInput(rawOptions = {}, dependencies = {}) {
  const repoRoot = path.resolve(rawOptions.repoRoot ?? process.cwd());
  const candidateReportPath = path.resolve(
    repoRoot,
    rawOptions.candidateReportPath
      ?? 'reports/audit/item-image-source-candidates-2026-07-30-v2.json'
  );
  const promotionReviewPath = path.resolve(
    repoRoot,
    rawOptions.promotionReviewPath
      ?? 'reports/audit/item-image-source-promotion-review-2026-07-30.json'
  );
  const rawDir = path.resolve(
    rawOptions.rawDir ?? '/home/lolben/data/terraPedia/raw/wiki/item-pages'
  );
  const outputPath = path.resolve(repoRoot, rawOptions.outputPath ?? DEFAULT_INPUT_PATH);
  const candidateReportBytes = await fs.promises.readFile(candidateReportPath);
  const promotionReviewBytes = await fs.promises.readFile(promotionReviewPath);
  const candidateReport = parseJsonBytes(candidateReportBytes, 'candidateReportBytes');
  const promotionReview = parseJsonBytes(promotionReviewBytes, 'promotionReviewBytes');
  const frozenInternalNames = new Set(
    requireRecords(promotionReview?.rows, 'promotion review rows')
      .filter((row) => row?.status === 'ambiguous' || row?.status === 'unresolved')
      .map((row) => requireText(row?.itemInternalName, 'promotion review itemInternalName'))
  );
  const neededSourceFiles = new Set([
    ...requireRecords(candidateReport?.quarantine?.groupPages ?? [], 'group quarantine rows'),
    ...requireRecords(candidateReport?.quarantine?.nonGroupPages ?? [], 'non-group quarantine rows')
  ].filter((row) => frozenInternalNames.has(row?.itemInternalName)).map((row) => {
    const sourceFile = requireText(row?.sourceFile, `raw source file for ${row?.itemInternalName}`);
    if (path.basename(sourceFile) !== sourceFile) {
      throw new Error(`raw source file must be a basename: ${sourceFile}`);
    }
    return sourceFile;
  }));
  const rawEvidenceBytesByFile = new Map();
  for (const sourceFile of [...neededSourceFiles].sort()) {
    rawEvidenceBytesByFile.set(sourceFile, await fs.promises.readFile(path.join(rawDir, sourceFile)));
  }
  const input = buildItemImageSourceVerificationInput({
    candidateReportBytes,
    candidateReportPath: relativeRepoPath(repoRoot, candidateReportPath),
    promotionReviewBytes,
    promotionReviewPath: relativeRepoPath(repoRoot, promotionReviewPath),
    rawEvidenceBytesByFile,
    generatedAt: rawOptions.generatedAt,
    batchSize: rawOptions.batchSize,
    maxRequests: rawOptions.maxRequests
  });
  const serialized = Buffer.from(`${JSON.stringify(input, null, 2)}\n`);
  const writeInput = dependencies.writeInput ?? writeImmutableInput;
  await writeInput(outputPath, serialized);
  return {
    outputPath,
    sha256: sha256Bytes(serialized),
    recordCount: input.records.length,
    constraints: input.constraints
  };
}

export async function runItemImageSourceVerification(rawOptions = {}, dependencies = {}) {
  const options = normalizeRunOptions(rawOptions);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const writeProgress = dependencies.writeProgress
    ?? (async (filePath, payload) => writeJsonFile(filePath, payload));
  const writeReport = dependencies.writeReport
    ?? (async (filePath, payload) => writeJsonFile(filePath, payload));
  const fetchJson = dependencies.fetchJson ?? fetchVerificationJson;
  const authorize = dependencies.authorize ?? authorizeVerificationDispatch;
  const startedAt = now();
  const records = Array.isArray(options.input?.records) ? options.input.records : [];
  const total = records.length;
  let current = 0;
  let requestCount = 0;
  let batchOffset = 0;

  const publish = async ({ status, phase, message, failedCount = 0 } = {}) => {
    const generatedAt = now();
    const batchLimit = Math.min(options.batchSize, Math.max(0, total - batchOffset));
    const payload = buildActionProgressPayload({
      actionId: ACTION_ID,
      status,
      phase,
      message,
      current,
      total,
      startedAt,
      batchOffset,
      batchLimit,
      overallCurrent: current,
      overallTotal: total,
      generatedAt,
      lastHeartbeatAt: generatedAt,
      childStatusPath: options.progressPath,
      outputPath: options.outputPath,
      reportPath: options.outputPath,
      nextStep: status === 'completed'
        ? 'rebuild the item image source promotion review'
        : 'continue the bounded frozen item image verification',
      plannedCount: total,
      actualCount: current,
      failedCount,
      estimatedRequests: total,
      resultKind: 'fetched',
      resumeOutcome: 'not_supported'
    });
    await writeProgress(options.progressPath, {
      ...payload,
      queue: OPERATION_ID,
      dataStage: 'frozen item identities -> MediaWiki source verification evidence'
    });
  };

  await publish({
    status: 'running',
    phase: 'verify',
    message: `starting bounded item image source verification for ${total} identities`
  });

  try {
    const frozenRecords = validateFrozenInput(options);
    await authorize({
      operationId: OPERATION_ID,
      input: options.input,
      inputBytes: options.inputBytes,
      inputPath: options.inputPath,
      inputSha256: options.inputSha256,
      batchSize: options.batchSize,
      maxRequests: options.maxRequests,
      repoRoot: options.repoRoot,
      env: options.env
    });

    const outputRecords = [];
    for (batchOffset = 0; batchOffset < frozenRecords.length; batchOffset += options.batchSize) {
      const batch = frozenRecords.slice(batchOffset, batchOffset + options.batchSize);
      for (const identity of batch) {
        if (requestCount >= options.maxRequests) {
          throw new Error(`item image source verification request cap exceeded: ${options.maxRequests}`);
        }
        const url = buildVerificationUrl(identity, options.apiUrl);
        let response;
        try {
          response = await fetchJson({ identity: structuredClone(identity), url });
          requestCount += 1;
          outputRecords.push(buildVerificationRecord(identity, response));
        } catch (error) {
          requestCount += 1;
          outputRecords.push(buildFailedRecord(identity, error));
        }
        current += 1;
      }
      await publish({
        status: 'running',
        phase: 'verify',
        message: `verified ${current}/${total} frozen item image identities`,
        failedCount: outputRecords.filter((record) => record.classification === 'failed').length
      });
    }

    const report = buildVerificationReport({
      options,
      records: outputRecords,
      generatedAt: now(),
      requestCount
    });
    await writeReport(options.outputPath, report);
    if (report.summary.failed > 0) {
      const firstFailure = report.records.find((record) => record.classification === 'failed');
      throw new Error(firstFailure?.error?.message ?? 'item image source verification failed');
    }
    await publish({
      status: 'completed',
      phase: 'write',
      message: `completed bounded item image source verification for ${total} identities`
    });
    return report;
  } catch (error) {
    await publish({
      status: 'failed',
      phase: 'error',
      message: `item image source verification failed: ${error?.message ?? String(error)}`,
      failedCount: 1
    });
    throw error;
  }
}

export function resolveItemImageSourceVerificationProgressPath({
  progressPath,
  env = process.env,
  repoRoot = process.cwd()
} = {}) {
  const selected = text(progressPath)
    ?? text(env?.TERRAPEDIA_CRAWLER_PROGRESS_PATH)
    ?? DEFAULT_PROGRESS_PATH;
  return path.resolve(repoRoot, selected);
}

function validateFrozenInput(options) {
  const input = options.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('item image source verification input must be an object');
  }
  if (input.schemaVersion !== '1.0.0' || input.entity !== 'item_image_source_verification_input') {
    throw new Error('item image source verification input contract is unsupported');
  }
  if (!Array.isArray(input.records) || input.records.length === 0) {
    throw new Error('item image source verification input records are required');
  }
  if (input.records.length > options.maxRequests) {
    throw new Error(
      `item image source verification request cap ${options.maxRequests} is below ${input.records.length} frozen identities`
    );
  }
  if (Number(input.constraints?.batchSize) !== options.batchSize
      || Number(input.constraints?.maxRequests) !== options.maxRequests) {
    throw new Error('item image source verification runtime bounds differ from the frozen input');
  }
  const ids = new Set();
  const internalNames = new Set();
  return input.records.map((record) => {
    const normalized = normalizeFrozenRecord(record);
    if (ids.has(String(normalized.itemId)) || internalNames.has(normalized.itemInternalName)) {
      throw new Error(`duplicate frozen item image identity ${normalized.itemInternalName}`);
    }
    ids.add(String(normalized.itemId));
    internalNames.add(normalized.itemInternalName);
    return normalized;
  });
}

function normalizeFrozenRecord(record) {
  const itemInternalName = requireText(record?.itemInternalName, 'itemInternalName');
  const itemName = requireText(record?.itemName, `itemName for ${itemInternalName}`);
  const fileTitles = [...new Set((record?.fileTitles ?? []).map(normalizeFileTitle).filter(Boolean))];
  if (fileTitles.length === 0) {
    throw new Error(`frozen file titles are required for ${itemInternalName}`);
  }
  const pageId = Number(record?.pageId);
  if (!Number.isInteger(pageId) || pageId <= 0) {
    throw new Error(`positive pageId is required for ${itemInternalName}`);
  }
  const rawFileSha256 = requireSha256(record?.rawFileSha256, `rawFileSha256 for ${itemInternalName}`);
  const sourceRevisionTimestamp = requireTimestamp(
    record?.sourceRevisionTimestamp,
    `sourceRevisionTimestamp for ${itemInternalName}`
  );
  return {
    itemId: record?.itemId ?? null,
    itemInternalName,
    itemName,
    priorClassification: requireText(record?.priorClassification, `priorClassification for ${itemInternalName}`),
    rawSourceFile: requireText(record?.rawSourceFile, `rawSourceFile for ${itemInternalName}`),
    rawFileSha256,
    pageId,
    requestedPageTitle: requireText(record?.requestedPageTitle, `requestedPageTitle for ${itemInternalName}`),
    sourcePage: requireText(record?.sourcePage, `sourcePage for ${itemInternalName}`),
    sourceRevisionTimestamp,
    fileTitles,
    comparison: structuredClone(record?.comparison ?? null)
  };
}

function buildVerificationUrl(identity, apiUrl) {
  const url = new URL(apiUrl);
  const titles = [
    identity.sourcePage,
    ...identity.fileTitles.map((fileTitle) => `File:${fileTitle}`)
  ];
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', titles.join('|'));
  url.searchParams.set('prop', 'revisions|imageinfo');
  url.searchParams.set('rvprop', 'ids|timestamp');
  url.searchParams.set('iiprop', 'url|size|mime|sha1');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  return url;
}

function buildVerificationRecord(identity, response) {
  const responseSha256 = sha256Canonical(response);
  const pages = Array.isArray(response?.query?.pages)
    ? response.query.pages
    : Object.values(response?.query?.pages ?? {});
  const sourcePage = pages.find((page) => Number(page?.pageid) === identity.pageId);
  if (!sourcePage) {
    return {
      ...itemIdentity(identity),
      classification: 'failed',
      source: null,
      comparison: identity.comparison,
      responseSha256,
      error: {
        code: 'page_identity_mismatch',
        message: `MediaWiki page identity mismatch for ${identity.itemInternalName}`
      }
    };
  }
  const revisionTimestamp = sourcePage?.revisions?.[0]?.timestamp ?? null;
  const revisionDrifted = revisionTimestamp !== identity.sourceRevisionTimestamp;

  const requestedFileTitles = new Set(identity.fileTitles.map(normalizeComparableFileTitle));
  const identityKeys = new Set([
    normalizeIdentity(identity.itemInternalName),
    normalizeIdentity(identity.itemName)
  ]);
  const candidates = pages
    .filter((page) => Number(page?.ns) === 6 && page?.imageinfo?.[0]?.url)
    .map((page) => buildFileCandidate(page))
    .filter((candidate) => requestedFileTitles.has(normalizeComparableFileTitle(candidate.fileTitle)))
    .filter((candidate) => identityKeys.has(normalizeFileIdentity(candidate.fileTitle)));
  const uniqueCandidates = dedupeCandidates(candidates);
  if (uniqueCandidates.length === 0) {
    return {
      ...itemIdentity(identity),
      classification: 'unresolved',
      source: null,
      comparison: identity.comparison,
      responseSha256
    };
  }
  if (uniqueCandidates.length > 1) {
    return {
      ...itemIdentity(identity),
      classification: 'ambiguous',
      source: null,
      comparison: identity.comparison,
      responseSha256,
      candidateFileTitles: uniqueCandidates.map((candidate) => candidate.fileTitle)
    };
  }

  const candidate = uniqueCandidates[0];
  return {
    ...itemIdentity(identity),
    classification: 'verified',
    source: {
      authority: 'raw_wiki_evidence',
      evidenceKind: 'mediawiki_exact_file',
      blockOrdinal: 1,
      anchorTitle: identity.itemName,
      rawSourceFile: identity.rawSourceFile,
      rawFileSha256: identity.rawFileSha256,
      pageId: identity.pageId,
      requestedPageTitle: identity.requestedPageTitle,
      sourcePage: identity.sourcePage,
      sourceRevisionTimestamp: revisionTimestamp ?? identity.sourceRevisionTimestamp,
      frozenSourceRevisionTimestamp: identity.sourceRevisionTimestamp,
      revisionDrifted,
      fileTitle: candidate.fileTitle,
      originalUrl: candidate.originalUrl,
      width: candidate.width,
      height: candidate.height,
      contentType: candidate.contentType,
      verificationResponseSha256: responseSha256
    },
    comparison: identity.comparison,
    responseSha256
  };
}

function buildFileCandidate(page) {
  const image = page.imageinfo[0];
  return {
    fileTitle: normalizeFileTitle(page.title),
    originalUrl: requireText(image.url, 'verified image URL'),
    width: nullableNumber(image.width),
    height: nullableNumber(image.height),
    contentType: text(image.mime)
  };
}

function dedupeCandidates(candidates) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const key = `${normalizeComparableFileTitle(candidate.fileTitle)}\u0000${candidate.originalUrl}`;
    byKey.set(key, candidate);
  }
  return [...byKey.values()].sort((left, right) => left.fileTitle.localeCompare(right.fileTitle));
}

function buildFailedRecord(identity, error) {
  return {
    ...itemIdentity(identity),
    classification: 'failed',
    source: null,
    comparison: identity.comparison,
    responseSha256: null,
    error: {
      code: 'request_failed',
      message: error?.message ?? String(error)
    }
  };
}

function buildVerificationReport({ options, records, generatedAt, requestCount }) {
  return {
    schemaVersion: '1.0.0',
    entity: 'item_image_source_verification',
    generatedAt,
    inputs: {
      verificationInput: {
        path: relativeRepoPath(options.repoRoot, options.inputPath),
        sha256: options.inputSha256
      },
      candidateReport: structuredClone(options.input.inputs?.candidateReport ?? null),
      rawFiles: structuredClone(options.input.inputs?.rawFiles ?? [])
    },
    constraints: {
      batchSize: options.batchSize,
      maxRequests: options.maxRequests
    },
    summary: {
      total: records.length,
      verified: countClassification(records, 'verified'),
      ambiguous: countClassification(records, 'ambiguous'),
      unresolved: countClassification(records, 'unresolved'),
      failed: countClassification(records, 'failed'),
      requestCount
    },
    records
  };
}

export function createItemImageSourceVerificationFetch(dependencies = {}) {
  const gateOptions = {
    requestProfiles: { revision: SINGLE_ATTEMPT_REQUEST_PROFILE },
    externalRequestFn: null
  };
  for (const key of ['statePath', 'sleepFn', 'nowFn', 'fetchFn', 'alertFn']) {
    if (dependencies[key] !== undefined) gateOptions[key] = dependencies[key];
  }
  const gate = createWikiRequestGate(gateOptions);
  return async ({ identity, url }) => gate.runJsonRequest(url, {
    profile: 'revision',
    sourceKey: `${ACTION_ID}:${identity.itemInternalName}`
  });
}

const fetchVerificationJson = createItemImageSourceVerificationFetch();

async function authorizeVerificationDispatch({
  env = process.env,
  inputBytes,
  inputPath,
  maxRequests,
  operationId,
  repoRoot
} = {}) {
  if (inputBytes == null) {
    throw new Error('authorized item image verification requires exact input bytes');
  }
  const authorizedContext = loadAuthorizedOperationContext({ env, operationId });
  const dataBundleSha256 = hashOrderedBundleBytes([{
    path: relativeRepoPath(repoRoot, inputPath),
    bytes: inputBytes
  }], 'item image verification data bundle');
  if (authorizedContext.dataBundleSha256 !== dataBundleSha256) {
    throw new Error('authorized item image verification data bundle does not match the frozen input');
  }
  const frozenMaxRequests = Number(JSON.parse(Buffer.from(inputBytes).toString('utf8'))?.constraints?.maxRequests);
  if (frozenMaxRequests !== maxRequests) {
    throw new Error('authorized item image verification request cap differs from the frozen input');
  }
  consumeAuthorizedOperationDispatchPermit({
    env,
    authorizedContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json')
  });
}

function normalizeRunOptions(rawOptions) {
  const repoRoot = path.resolve(rawOptions.repoRoot ?? process.cwd());
  const inputPath = path.resolve(repoRoot, rawOptions.inputPath ?? DEFAULT_INPUT_PATH);
  const outputPath = path.resolve(repoRoot, rawOptions.outputPath ?? DEFAULT_OUTPUT_PATH);
  const progressPath = resolveItemImageSourceVerificationProgressPath({
    progressPath: rawOptions.progressPath,
    env: rawOptions.env ?? process.env,
    repoRoot
  });
  const input = rawOptions.input;
  return {
    repoRoot,
    env: rawOptions.env ?? process.env,
    input,
    inputBytes: rawOptions.inputBytes ?? null,
    inputPath,
    inputSha256: requireSha256(rawOptions.inputSha256, 'verification input SHA-256'),
    outputPath,
    progressPath,
    apiUrl: text(rawOptions.apiUrl) ?? DEFAULT_API_URL,
    batchSize: positiveInteger(rawOptions.batchSize, DEFAULT_BATCH_SIZE),
    maxRequests: positiveInteger(rawOptions.maxRequests, DEFAULT_MAX_REQUESTS)
  };
}

function itemIdentity(record) {
  return {
    itemId: record.itemId ?? null,
    itemInternalName: record.itemInternalName ?? record.internalName,
    itemName: record.itemName ?? record.name
  };
}

function compareItemIdentity(left, right) {
  const leftId = Number(left?.itemId);
  const rightId = Number(right?.itemId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return leftId - rightId;
  }
  return String(left?.itemInternalName ?? '').localeCompare(String(right?.itemInternalName ?? ''));
}

function indexUniqueByInternalName(records, label) {
  const output = new Map();
  for (const record of records) {
    const key = requireText(record?.itemInternalName, `${label} itemInternalName`);
    if (output.has(key)) throw new Error(`${label} contains duplicate item identity ${key}`);
    output.set(key, record);
  }
  return output;
}

function requireRecords(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function parseJsonBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  try {
    return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error?.message ?? error}`);
  }
}

function countClassification(records, classification) {
  return records.filter((record) => record.classification === classification).length;
}

function relativeRepoPath(repoRoot, filePath) {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(filePath)).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('item image verification path must stay inside the repository');
  }
  return relative;
}

function writeImmutableInput(outputPath, bytes) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
    fs.linkSync(temporaryPath, outputPath);
    fs.chmodSync(outputPath, 0o600);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function normalizeFileTitle(value) {
  const normalized = String(value ?? '').trim().replace(/^File:/i, '').replaceAll('_', ' ');
  return normalized || null;
}

function normalizeComparableFileTitle(value) {
  return String(normalizeFileTitle(value) ?? '').normalize('NFKC').toLowerCase();
}

function normalizeFileIdentity(value) {
  return normalizeIdentity(String(normalizeFileTitle(value) ?? '').replace(/\.[^.]+$/, ''));
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function positiveInteger(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error('item image verification bounds must be positive integers');
  }
  return number;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requireSha256(value, label) {
  const normalized = String(value ?? '');
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a sha256 hash`);
  }
  return normalized;
}

function requireTimestamp(value, label) {
  const normalized = requireText(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a timestamp`);
  return normalized;
}

function requireText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function sha256Canonical(value) {
  return sha256Bytes(canonicalJson(value));
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
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

function isDirectExecution() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  try {
    if (args.mode === 'prepare') {
      const result = await prepareItemImageSourceVerificationInput({
        repoRoot,
        candidateReportPath: args['candidate-report'],
        promotionReviewPath: args['promotion-review'],
        rawDir: args['raw-dir'],
        outputPath: args.output ?? args.input,
        generatedAt: args['generated-at'],
        batchSize: args['batch-size'],
        maxRequests: args['max-requests']
      });
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }
    const inputPath = path.resolve(repoRoot, args.input ?? DEFAULT_INPUT_PATH);
    const stat = fs.lstatSync(inputPath);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) {
      throw new Error('verification input must be an immutable ordinary file');
    }
    const inputBytes = fs.readFileSync(inputPath);
    const input = JSON.parse(inputBytes.toString('utf8'));
    const inputSha256 = `sha256:${createHash('sha256').update(inputBytes).digest('hex')}`;
    const report = await runItemImageSourceVerification({
      repoRoot,
      input,
      inputBytes,
      inputPath,
      inputSha256,
      outputPath: args.output,
      progressPath: args['progress-path'],
      batchSize: args['batch-size'],
      maxRequests: args['max-requests'],
      apiUrl: args['api-url']
    });
    console.log(JSON.stringify({ outputPath: args.output ?? DEFAULT_OUTPUT_PATH, summary: report.summary }, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  }
}
