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
import { DEFAULT_WIKI_API_URL, parseCliArgs } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { fetchShimmerLanglinks } from '../fetch/fetch-wiki-shimmer-langlinks.mjs';
import { fetchWikiShimmerRaw } from '../fetch/fetch-wiki-shimmer-page.mjs';
import { SHIMMER_TABLE_ROLE_VERSION } from '../maint/shimmer-structured-parser.mjs';
import {
  buildShimmerGeneration,
  collectShimmerCandidateTitles
} from '../transform/shimmer-generation-builder.mjs';
import {
  publishShimmerGeneration,
  verifyShimmerGeneration
} from '../transform/shimmer-generation-contract.mjs';
import {
  buildActionProgressPayload,
  buildCrawlerWorkSummary,
  createCrawlerAttemptProgressSequencer,
  createCrawlerProgressHeartbeat,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const ACTION_ID = 'domain-source-shimmer';
const OPERATION_ID = 'canonical-shimmer-generation';
const DEFAULT_INPUT_CONTRACT_PATH = 'reports/authorization/canonical/canonical-shimmer-generation.input.json';
const DEFAULT_CANONICAL_PROGRESS_PATH = 'data/generated/domain-source-shimmer-progress.latest.json';
const DECISION_LEDGER_PATH = 'reports/authorization/canonical/used-decisions.json';
const TOTAL_PHASES = 7;
const RAW_REQUESTS = 3;
const RAW_PHASE_CURRENT = Object.freeze({
  fetch_revision: 1,
  fetch_sections: 2,
  fetch_html: 3
});

export async function runWikiShimmerExtractionPipeline(options = {}, dependencies = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? getProjectRoot());
  const env = options.env ?? process.env;
  const generatedAt = requireTimestamp(options.generatedAt ?? new Date().toISOString());
  const pageTitle = nonEmptyText(options.pageTitle ?? 'Shimmer', 'pageTitle');
  const apiUrl = nonEmptyText(
    options.apiUrl ?? DEFAULT_WIKI_API_URL.replace('/api.php', '/zh/api.php'),
    'apiUrl'
  );
  const progressPath = resolvePath(
    options.progressPath ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? path.join(
      repoRoot,
      'data',
      'generated',
      'domain-source-shimmer-progress.latest.json'
    ),
    repoRoot
  );
  const canonicalProgressPath = path.join(repoRoot, DEFAULT_CANONICAL_PROGRESS_PATH);
  const inputContractPath = resolvePath(
    options.inputContractPath ?? DEFAULT_INPUT_CONTRACT_PATH,
    repoRoot
  );
  const generationRoot = resolvePath(
    options.generationRoot ?? path.join(repoRoot, 'data', 'generated', 'shimmer', 'generations'),
    repoRoot
  );
  const pointerPath = resolvePath(
    options.pointerPath ?? path.join(repoRoot, 'data', 'generated', 'shimmer', 'wiki-shimmer-current-generation.json'),
    repoRoot
  );
  const itemsPath = resolvePath(
    options.itemsPath ?? path.join(repoRoot, 'data', 'standardized', 'items.standardized.json'),
    repoRoot
  );
  const npcsPath = resolvePath(
    options.npcsPath ?? path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'),
    repoRoot
  );
  const reportPath = resolvePath(
    options.reportPath ?? path.join(repoRoot, 'reports', `wiki-shimmer-generation-${generatedAt.slice(0, 10)}.md`),
    repoRoot
  );
  const producerCodeSha256 = requireSha256(options.producerCodeSha256, 'producerCodeSha256');
  const loadAuthorizationContext = dependencies.loadAuthorizationContext ?? loadAuthorizedOperationContext;
  const consumeDispatchPermit = dependencies.consumeDispatchPermit ?? consumeAuthorizedOperationDispatchPermit;
  const fetchRaw = dependencies.fetchRaw ?? fetchWikiShimmerRaw;
  const fetchLanglinks = dependencies.fetchLanglinks ?? fetchShimmerLanglinks;
  const buildGeneration = dependencies.buildGeneration ?? buildShimmerGeneration;
  const collectTitles = dependencies.collectTitles ?? collectShimmerCandidateTitles;
  const publishGeneration = dependencies.publishGeneration ?? publishShimmerGeneration;
  const verifyGeneration = dependencies.verifyGeneration ?? verifyShimmerGeneration;
  const writePrimaryProgress = dependencies.writeProgress ?? ((snapshot) => writeJsonFile(progressPath, snapshot));
  const progressSequencer = createCrawlerAttemptProgressSequencer(env);
  const writeProgress = (snapshot) => {
    const sequenced = progressSequencer.next(snapshot, {
      observedProgressSequence: readProgressSequence(progressPath)
    });
    writePrimaryProgress(sequenced);
    if (path.resolve(progressPath) !== path.resolve(canonicalProgressPath)) {
      writeJsonFile(canonicalProgressPath, {
        ...sequenced,
        childStatusPath: canonicalProgressPath
      });
    }
  };
  const writeReport = dependencies.writeReport ?? writePipelineReport;
  const heartbeat = (dependencies.createHeartbeat ?? createCrawlerProgressHeartbeat)({
    writeProgress,
    intervalMs: options.heartbeatIntervalMs
  });

  let current = 0;
  let raw = null;
  let shards = null;
  let generation = null;
  let publication = null;
  let verified = null;
  let langlinkEvidence = null;

  const publishProgress = ({ status, phase, message, nextStep = null, phaseCurrent = current }) => {
    current = phaseCurrent;
    heartbeat.publish(buildPipelineProgress({
      status,
      phase,
      message,
      nextStep,
      current,
      generatedAt,
      progressPath,
      pointerPath,
      reportPath,
      raw,
      shards,
      generation,
      publication
    }));
  };

  try {
    publishProgress({
      status: 'running',
      phase: 'preflight',
      message: 'loading frozen standardized inputs before shimmer source fetch',
      phaseCurrent: 0
    });

    const itemsInput = readStandardizedInput(itemsPath, 'standardized items', repoRoot);
    const npcsInput = readStandardizedInput(npcsPath, 'standardized NPCs', repoRoot);
    const authorization = authorizeShimmerGenerationDispatch({
      apiUrl,
      canonicalProgressPath,
      consumeDispatchPermit,
      env,
      inputContractPath,
      itemsInput,
      loadAuthorizationContext,
      npcsInput,
      pageTitle,
      repoRoot
    });

    raw = await fetchRaw({
      pageTitle,
      apiUrl,
      generatedAt,
      onPhase: ({ phase }) => {
        const phaseCurrent = RAW_PHASE_CURRENT[phase];
        if (!phaseCurrent) return;
        publishProgress({
          status: 'running',
          phase,
          message: `${phase} for ${pageTitle}`,
          phaseCurrent
        });
      }
    }, { fetchJson: dependencies.fetchJson });

    const titles = collectTitles(raw);
    assertLanglinkRequestCap({
      titleCount: Array.isArray(titles) ? titles.length : null,
      constraints: authorization.constraints
    });
    publishProgress({
      status: 'running',
      phase: 'resolve_langlinks',
      message: `resolving ${titles.length} frozen shimmer langlink titles`,
      phaseCurrent: 4
    });
    langlinkEvidence = await fetchLanglinks({
      titles,
      apiUrl,
      batchSize: authorization.constraints.langlinkBatchSize,
      onPhase: () => {
        publishProgress({
          status: 'running',
          phase: 'resolve_langlinks',
          message: `resolving ${titles.length} frozen shimmer langlink titles`,
          phaseCurrent: 4
        });
      }
    }, { fetchJson: dependencies.fetchJson });

    publishProgress({
      status: 'running',
      phase: 'transform',
      message: 'building deterministic shimmer transform payloads',
      phaseCurrent: 5
    });
    generation = buildGeneration({
      raw,
      itemRecords: itemsInput.records,
      npcRecords: npcsInput.records,
      langlinkEvidence: toBuilderLanglinkEvidence(langlinkEvidence),
      generatedAt
    });
    shards = buildGenerationShards(generation);

    publishProgress({
      status: 'running',
      phase: 'verify_bundle',
      message: 'staging and verifying the shimmer generation bundle',
      phaseCurrent: 6
    });
    publication = publishGeneration({
      rawBytes: Buffer.from(JSON.stringify(raw), 'utf8'),
      shards,
      standardizedInputs: {
        items: itemsInput.descriptor,
        npcs: npcsInput.descriptor
      },
      langlinkEvidenceBytes: Buffer.from(JSON.stringify(langlinkEvidence), 'utf8'),
      producerCodeSha256,
      tableRoleVersion: generation.context.tableRoleVersion ?? SHIMMER_TABLE_ROLE_VERSION,
      generatedAt,
      generationRoot,
      pointerPath,
      runId: options.runId ?? 'shimmer-pipeline'
    });

    publishProgress({
      status: 'running',
      phase: 'publish',
      message: 'verifying the current generation pointer after publication',
      phaseCurrent: 7
    });
    verified = verifyGeneration({ manifestPath: publication.manifestPath });
    verifyCurrentPointer({
      pointerPath,
      expectedManifestPath: publication.manifestPath,
      expectedManifest: verified.manifest,
      verifyGeneration
    });
    writeReport({
      reportPath,
      generation,
      langlinkEvidence,
      publication,
      verified
    });

    publishProgress({
      status: 'completed',
      phase: 'publish',
      message: 'published and verified coherent shimmer generation',
      phaseCurrent: 7
    });

    return {
      generationId: publication.manifest.generationId,
      dataBundleSha256: publication.manifest.dataBundleSha256,
      generationPath: publication.generationPath,
      manifestPath: publication.manifestPath,
      pointerPath,
      outputPath: pointerPath,
      reportPath,
      rawCount: 1,
      shardCount: Object.keys(shards).length,
      unresolvedCount: unresolvedCount(generation),
      verified
    };
  } catch (error) {
    publishProgress({
      status: 'failed',
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
      nextStep: 'inspect the frozen source, standardized inputs, or generation contract',
      phaseCurrent: current
    });
    throw error;
  } finally {
    heartbeat.stop();
  }
}

if (isDirectExecution()) {
  runWikiShimmerExtractionPipelineCli().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export async function runWikiShimmerExtractionPipelineCli({
  argv = process.argv.slice(2),
  dependencies = {},
  env = process.env,
  repoRoot = getProjectRoot()
} = {}) {
  const options = parseCliArgs(argv);
  const root = path.resolve(repoRoot);
  const generatedAt = options['generated-at'] ?? options.generatedAt ?? new Date().toISOString();
  return runWikiShimmerExtractionPipeline({
    apiUrl: options.api,
    env,
    generatedAt,
    generationRoot: options['generation-root'],
    inputContractPath: options['input-contract'],
    itemsPath: options.items,
    npcsPath: options.npcs,
    pageTitle: options.page,
    pointerPath: options['pointer-path'],
    producerCodeSha256: sha256Bytes(fs.readFileSync(fileURLToPath(import.meta.url))),
    progressPath: options['progress-path'],
    reportPath: options['report-output'],
    repoRoot: root,
    runId: options['run-id']
  }, dependencies);
}

function buildPipelineProgress({
  status,
  phase,
  message,
  nextStep,
  current,
  generatedAt,
  progressPath,
  pointerPath,
  reportPath,
  raw,
  shards,
  generation,
  publication
}) {
  const payload = buildActionProgressPayload({
    ...buildCrawlerWorkSummary({
      status,
      current,
      total: TOTAL_PHASES,
      estimatedRequests: null,
      estimatedRecords: null
    }),
    actionId: ACTION_ID,
    status,
    phase,
    message,
    current,
    total: TOTAL_PHASES,
    overallCurrent: current,
    overallTotal: TOTAL_PHASES,
    percent: Math.round((current / TOTAL_PHASES) * 100),
    startedAt: generatedAt,
    generatedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    childStatusPath: progressPath,
    outputPath: pointerPath,
    reportPath,
    nextStep
  });
  return {
    ...payload,
    generationId: publication?.manifest?.generationId ?? null,
    dataBundleSha256: publication?.manifest?.dataBundleSha256 ?? null,
    manifestPath: publication?.manifestPath ?? null,
    pointerPath,
    rawCount: raw ? 1 : 0,
    shardCount: shards ? Object.keys(shards).length : 0,
    unresolvedCount: generation ? unresolvedCount(generation) : 0
  };
}

function readProgressSequence(progressPath) {
  try {
    const value = JSON.parse(fs.readFileSync(progressPath, 'utf8'))?.progressSequence;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  } catch {
    return null;
  }
}

function readStandardizedInput(filePath, label, repoRoot) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }
  const bytes = readRegularFileBytes(filePath, label);
  const payload = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(payload?.records)) {
    throw new Error(`${label} must contain a records array: ${filePath}`);
  }
  return {
    bytes,
    records: payload.records,
    descriptor: {
      path: path.relative(repoRoot, filePath).replaceAll('\\', '/'),
      sha256: sha256Bytes(bytes)
    }
  };
}

function authorizeShimmerGenerationDispatch({
  apiUrl,
  canonicalProgressPath,
  consumeDispatchPermit,
  env,
  inputContractPath,
  itemsInput,
  loadAuthorizationContext,
  npcsInput,
  pageTitle,
  repoRoot
}) {
  if (isGovernedSchedulerPreviewContext(env)) {
    return {
      constraints: {
        rawRequests: RAW_REQUESTS,
        langlinkBatchSize: 8,
        maxLanglinkRequests: 128,
        maxRequests: 131,
      },
    };
  }
  const inputContractRelativePath = relativeRepoPath(
    repoRoot,
    inputContractPath,
    'shimmer generation input contract path'
  );
  if (inputContractRelativePath !== DEFAULT_INPUT_CONTRACT_PATH) {
    throw new Error(`shimmer generation input contract path must be ${DEFAULT_INPUT_CONTRACT_PATH}`);
  }
  const authorizedContext = loadAuthorizationContext({ env, operationId: OPERATION_ID });
  const inputContractBytes = readRegularFileBytes(inputContractPath, 'shimmer generation input contract');
  const inputContract = parseJsonBytes(inputContractBytes, 'shimmer generation input contract');
  const constraints = validateShimmerGenerationInputContract({
    apiUrl,
    canonicalProgressPath,
    inputContract,
    itemsInput,
    npcsInput,
    pageTitle,
    repoRoot
  });
  const dataBundleSha256 = hashOrderedBundleBytes([
    {
      path: inputContractRelativePath,
      bytes: inputContractBytes
    },
    {
      path: itemsInput.descriptor.path,
      bytes: itemsInput.bytes
    },
    {
      path: npcsInput.descriptor.path,
      bytes: npcsInput.bytes
    }
  ], 'shimmer generation data bundle');
  if (authorizedContext?.dataBundleSha256 !== dataBundleSha256) {
    throw new Error('authorized shimmer generation data bundle does not match the frozen input');
  }
  consumeDispatchPermit({
    env,
    authorizedContext,
    decisionLedgerPath: path.join(repoRoot, DECISION_LEDGER_PATH)
  });
  return { constraints };
}

export function isGovernedSchedulerPreviewContext(env = {}) {
  const exact = {
    TERRAPEDIA_CRAWLER_REQUESTED_BY: 'v2-automation',
    TERRAPEDIA_CRAWLER_ACTION_ID: ACTION_ID,
  };
  for (const [key, expected] of Object.entries(exact)) {
    if (String(env[key] ?? '') !== expected) return false;
  }
  for (const key of [
    'TERRAPEDIA_CRAWLER_QUEUE_ID',
    'TERRAPEDIA_CRAWLER_ATTEMPT_ID',
    'TERRAPEDIA_CRAWLER_FENCE_TOKEN',
    'TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH',
    'TERRAPEDIA_CRAWLER_PROGRESS_PATH',
  ]) {
    if (!String(env[key] ?? '').trim()) return false;
  }
  return true;
}

function validateShimmerGenerationInputContract({
  apiUrl,
  canonicalProgressPath,
  inputContract,
  itemsInput,
  npcsInput,
  pageTitle,
  repoRoot
}) {
  if (inputContract?.schemaVersion !== 1) {
    throw new Error('shimmer generation input contract schemaVersion must be 1');
  }
  if (inputContract.operationId !== OPERATION_ID) {
    throw new Error(`shimmer generation input contract operationId must be ${OPERATION_ID}`);
  }
  if (inputContract.actionId !== ACTION_ID) {
    throw new Error(`shimmer generation input contract actionId must be ${ACTION_ID}`);
  }
  if (nonEmptyText(inputContract?.source?.pageTitle, 'shimmer generation contract pageTitle') !== pageTitle) {
    throw new Error('shimmer generation page scope differs from the frozen input');
  }
  if (nonEmptyText(inputContract?.source?.apiUrl, 'shimmer generation contract apiUrl') !== apiUrl) {
    throw new Error('shimmer generation API scope differs from the frozen input');
  }
  const canonicalProgressRelativePath = relativeRepoPath(
    repoRoot,
    canonicalProgressPath,
    'shimmer generation canonical progress path'
  );
  if (canonicalProgressRelativePath !== DEFAULT_CANONICAL_PROGRESS_PATH
      || inputContract.canonicalProgressPath !== canonicalProgressRelativePath) {
    throw new Error('shimmer generation canonical progress path differs from the frozen input');
  }
  assertFrozenInputDescriptor({
    actual: itemsInput.descriptor,
    expectedPath: 'data/standardized/items.standardized.json',
    frozen: inputContract?.inputs?.items,
    label: 'standardized items'
  });
  assertFrozenInputDescriptor({
    actual: npcsInput.descriptor,
    expectedPath: 'data/standardized/npcs.standardized.json',
    frozen: inputContract?.inputs?.npcs,
    label: 'standardized NPCs'
  });
  const rawRequests = requirePositiveInteger(inputContract?.constraints?.rawRequests, 'shimmer raw request count');
  const langlinkBatchSize = requirePositiveInteger(
    inputContract?.constraints?.langlinkBatchSize,
    'shimmer langlink batch size'
  );
  const maxLanglinkRequests = requirePositiveInteger(
    inputContract?.constraints?.maxLanglinkRequests,
    'shimmer langlink request cap'
  );
  const maxRequests = requirePositiveInteger(inputContract?.constraints?.maxRequests, 'shimmer request cap');
  if (rawRequests !== RAW_REQUESTS) {
    throw new Error(`shimmer raw request count must be ${RAW_REQUESTS}`);
  }
  if (maxRequests !== rawRequests + maxLanglinkRequests) {
    throw new Error('shimmer request cap must equal raw and langlink request caps');
  }
  return { rawRequests, langlinkBatchSize, maxLanglinkRequests, maxRequests };
}

function assertFrozenInputDescriptor({ actual, expectedPath, frozen, label }) {
  if (actual?.path !== expectedPath || frozen?.path !== expectedPath) {
    throw new Error(`${label} path differs from the frozen shimmer input`);
  }
  if (frozen.sha256 !== actual.sha256) {
    throw new Error(`${label} SHA-256 differs from the frozen shimmer input`);
  }
}

function assertLanglinkRequestCap({ titleCount, constraints }) {
  if (!Number.isSafeInteger(titleCount) || titleCount < 0) {
    throw new Error('shimmer candidate titles must be a finite frozen array');
  }
  const langlinkRequests = Math.ceil(titleCount / constraints.langlinkBatchSize);
  if (langlinkRequests > constraints.maxLanglinkRequests) {
    throw new Error(
      `shimmer langlink request cap exceeded: ${langlinkRequests} > ${constraints.maxLanglinkRequests}`
    );
  }
  if (constraints.rawRequests + langlinkRequests > constraints.maxRequests) {
    throw new Error('shimmer request cap exceeded after langlink title resolution');
  }
  return langlinkRequests;
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function readRegularFileBytes(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an ordinary file: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function relativeRepoPath(repoRoot, filePath, label) {
  const relativePath = path.relative(repoRoot, filePath).replaceAll('\\', '/');
  if (!relativePath || relativePath === '.' || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
    throw new Error(`${label} must be inside the repository root`);
  }
  return relativePath;
}

function requirePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function buildGenerationShards(generation) {
  return {
    context: {
      entity: 'wiki_shimmer_context_importable',
      records: [generation.context]
    },
    itemTransforms: {
      entity: 'wiki_shimmer_item_transforms_importable',
      records: generation.itemTransforms
    },
    decraftRules: {
      entity: 'wiki_shimmer_decraft_rules_importable',
      records: generation.decraftRules
    },
    entityTransforms: {
      entity: 'wiki_shimmer_entity_transforms_importable',
      records: generation.entityTransforms
    },
    npcTransforms: {
      entity: 'wiki_shimmer_npc_transforms_importable',
      records: generation.npcTransforms
    },
    titleResolution: {
      entity: 'wiki_shimmer_title_resolution',
      records: generation.titleResolution
    }
  };
}

function toBuilderLanglinkEvidence(evidence) {
  const records = Array.isArray(evidence) ? evidence : evidence?.records;
  if (!Array.isArray(records)) {
    throw new Error('langlink evidence must contain a records array');
  }
  return records
    .map((record) => ({
      nameZh: record?.requestedTitle ?? record?.resolvedTitle ?? record?.nameZh,
      nameEn: record?.nameEn ?? null
    }))
    .filter((record) => nonEmptyTextOrNull(record.nameZh));
}

function verifyCurrentPointer({ pointerPath, expectedManifestPath, expectedManifest, verifyGeneration }) {
  const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
  if (pointer?.entity !== 'wiki_shimmer_current_generation') {
    throw new Error(`current generation pointer has unexpected entity: ${pointerPath}`);
  }
  if (pointer.generationId !== expectedManifest.generationId) {
    throw new Error('current generation pointer generation ID mismatch');
  }
  if (pointer.manifestSha256 !== expectedManifest.manifestSha256) {
    throw new Error('current generation pointer manifest hash mismatch');
  }
  if (pointer.dataBundleSha256 !== expectedManifest.dataBundleSha256) {
    throw new Error('current generation pointer data bundle hash mismatch');
  }
  const pointerManifestPath = path.resolve(path.dirname(pointerPath), String(pointer.manifestPath ?? ''));
  if (pointerManifestPath !== path.resolve(expectedManifestPath)) {
    throw new Error('current generation pointer manifest path mismatch');
  }
  const pointerVerified = verifyGeneration({ manifestPath: pointerManifestPath });
  if (pointerVerified.manifest.manifestSha256 !== expectedManifest.manifestSha256) {
    throw new Error('current generation pointer references an unexpected manifest');
  }
}

function writePipelineReport({ reportPath, generation, langlinkEvidence, publication, verified }) {
  const lines = [
    '# Wiki Shimmer Generation Summary',
    '',
    `- Generation ID: \`${publication.manifest.generationId}\``,
    `- Data bundle SHA-256: \`${publication.manifest.dataBundleSha256}\``,
    `- Manifest: \`${publication.manifestPath}\``,
    `- Context records: \`1\``,
    `- Item transforms: \`${generation.itemTransforms.length}\``,
    `- Decraft rules: \`${generation.decraftRules.length}\``,
    `- Entity transforms: \`${generation.entityTransforms.length}\``,
    `- NPC transforms: \`${generation.npcTransforms.length}\``,
    `- Unresolved titles: \`${unresolvedCount(generation)}\``,
    `- Langlink records: \`${Array.isArray(langlinkEvidence?.records) ? langlinkEvidence.records.length : 0}\``,
    `- Verified manifest: \`${verified.manifest.manifestSha256}\``,
    ''
  ];
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

function unresolvedCount(generation) {
  return generation.titleResolution.filter((record) => record.kind === 'unresolved').length;
}

function resolvePath(value, repoRoot) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error('required path is empty');
  }
  return path.resolve(repoRoot, text);
}

function requireTimestamp(value) {
  const text = nonEmptyText(value, 'generatedAt');
  if (Number.isNaN(Date.parse(text))) {
    throw new Error('generatedAt must be an ISO timestamp');
  }
  return text;
}

function requireSha256(value, label) {
  const text = nonEmptyText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return text;
}

function nonEmptyText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function nonEmptyTextOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
