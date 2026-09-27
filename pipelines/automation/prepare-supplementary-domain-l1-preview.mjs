#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot, resolveSharedDataRoot } from '../lib/project-root.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import {
  readCanonicalShimmerImportProposal,
  runCanonicalShimmerImportProposal,
} from './build-canonical-shimmer-import-proposal.mjs';
import { readCanonicalShimmerImportInputContract } from './canonical-shimmer-import-input-contract.mjs';
import { readCurrentSupplementaryContext } from './run-supplementary-domain-l1-operation.mjs';
import {
  buildSupplementaryL1Bundle,
  SUPPLEMENTARY_EXECUTION_MODES,
} from './supplementary-domain-l1-contract.mjs';
import {
  acknowledgeWikiProbeSnapshot,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
  loadWikiSourceManifest,
} from '../lib/wiki-sync-manifest.mjs';
import {
  probeSupplementarySource,
  SUPPLEMENTARY_SOURCE_DEFINITIONS,
} from '../monitor/supplementary-source-probes.mjs';
import {
  assertCurrentSourceMonitorStateMatchesDispatchIdentity,
  assertFrozenSourceMatchesDispatchIdentity,
  readFrozenSourceMonitorState,
  sourceDispatchIdentityFromEnvironment,
} from './source-dispatch-identity.mjs';

export const DOMAIN_PREVIEW_CONFIG = Object.freeze({
  audio: Object.freeze({
    actionId: 'wiki-audio-assets-refresh',
    progressPath: 'data/generated/wiki-audio-assets-progress.latest.json',
    ownedTables: Object.freeze([
      Object.freeze({ databaseRole: 'local', table: 'audio_assets' }),
      Object.freeze({ databaseRole: 'local', table: 'audio_asset_links' }),
    ]),
  }),
  bosses: Object.freeze({
    actionId: 'domain-source-bosses',
    progressPath: 'data/generated/domain-source-bosses-progress.latest.json',
    ownedTables: Object.freeze([
      Object.freeze({ databaseRole: 'local', table: 'boss_groups' }),
      Object.freeze({ databaseRole: 'local', table: 'npcs' }),
    ]),
  }),
  shimmer: Object.freeze({
    actionId: 'domain-source-shimmer',
    progressPath: 'data/generated/domain-source-shimmer-progress.latest.json',
    ownedTables: Object.freeze([
      Object.freeze({ databaseRole: 'local', table: 'shimmer_item_transforms' }),
      Object.freeze({ databaseRole: 'local', table: 'shimmer_decraft_rules' }),
      Object.freeze({ databaseRole: 'local', table: 'shimmer_entity_transforms' }),
      Object.freeze({ databaseRole: 'local', table: 'shimmer_npc_transforms' }),
    ]),
  }),
});

export async function prepareSupplementaryDomainL1Preview(options = {}, dependencies = {}) {
  const domainId = requireDomain(options.domainId);
  const config = DOMAIN_PREVIEW_CONFIG[domainId];
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const generatedAt = requireTimestamp(options.generatedAt ?? new Date().toISOString());
  const runId = requireText(options.runId, 'runId');
  const executionMode = requireExecutionMode(options.executionMode);
  requirePreviewRunId(runId, domainId);
  const progressPath = path.resolve(repoRoot, options.progressPath ?? config.progressPath);
  const artifactRoot = resolvePreviewArtifactRoot({
    repoRoot,
    domainId,
    runId,
    executionMode,
    artifactRoot: options.artifactRoot,
  });
  const sourcePath = path.join(
    artifactRoot,
    executionMode === 'ACTIVATION_GATED_AUTO' ? 'source.json' : `automation-${domainId}-first-l1.source.json`,
  );
  const bundlePath = path.join(
    artifactRoot,
    executionMode === 'ACTIVATION_GATED_AUTO' ? 'bundle.json' : `automation-${domainId}-first-l1.bundle.json`,
  );
  const writeProgress = dependencies.writeProgress
    ?? ((filePath, payload) => writeJsonFile(filePath, payload));
  const runSource = requireFunction(dependencies.runSource, 'runSource');
  const loadPolicyContext = requireFunction(dependencies.loadPolicyContext, 'loadPolicyContext');
  const buildImportPlan = requireFunction(dependencies.buildImportPlan, 'buildImportPlan');
  const probeSource = dependencies.probeSource ?? null;
  const acknowledgeSource = dependencies.acknowledgeSource ?? null;
  const reuseCurrentSourceSnapshot = options.reuseCurrentSourceSnapshot == null
    ? null
    : normalizeReusableCurrentSourceSnapshot(options.reuseCurrentSourceSnapshot, domainId);
  const sourceDispatchIdentity = options.sourceDispatchIdentity ?? null;
  const sourceStatePath = options.sourceStatePath ?? null;
  const readSourceMonitorState = dependencies.readSourceMonitorState
    ?? readFrozenSourceMonitorState;
  let automaticArtifactPublication = null;
  let phase = 'source';

  const progress = ({ status, message, current, total, outputPath = null, reportPath = null }) => {
    const heartbeatAt = new Date().toISOString();
    writeProgress(progressPath, buildActionProgressPayload({
      actionId: config.actionId,
      status,
      phase,
      message,
      current,
      total,
      startedAt: generatedAt,
      generatedAt: heartbeatAt,
      lastHeartbeatAt: heartbeatAt,
      childStatusPath: progressPath,
      outputPath,
      reportPath,
    }));
  };

  try {
    if (sourceDispatchIdentity != null) {
      assertCurrentSourceMonitorStateMatchesDispatchIdentity({
        identity: sourceDispatchIdentity,
        domain: domainId,
        repoRoot,
        sourceStatePath,
        readSourceMonitorStateImpl: readSourceMonitorState,
      });
    }
    if (executionMode === 'ACTIVATION_GATED_AUTO') {
      automaticArtifactPublication = reserveAutomaticPreviewArtifactDirectory({
        repoRoot,
        artifactRoot,
      });
    }
    progress({ status: 'running', message: `starting ${domainId} source refresh`, current: 0, total: 3 });
    const firstSnapshot = reuseCurrentSourceSnapshot ?? (probeSource ? await probeSource({ domainId }) : null);
    const sourceResult = await runSource({ domainId, config, repoRoot, progressPath });
    const sourcePayload = requireObject(sourceResult?.sourcePayload, 'sourcePayload');
    let sourceAcknowledged = false;
    let stableSourceSnapshot = null;
    let sourceAcknowledgementReason = firstSnapshot ? 'post_probe_failed' : 'probe_not_configured';
    if (reuseCurrentSourceSnapshot) {
      stableSourceSnapshot = reuseCurrentSourceSnapshot;
      sourceAcknowledgementReason = 'local_source_reused';
    } else if (firstSnapshot) {
      try {
        const secondSnapshot = await probeSource({ domainId });
        if (firstSnapshot.contentHash !== secondSnapshot.contentHash) {
          sourceAcknowledgementReason = 'source_changed_during_preview';
        } else {
          stableSourceSnapshot = firstSnapshot;
          sourceAcknowledgementReason = 'stable_source_snapshot';
        }
      } catch {
        sourceAcknowledgementReason = 'post_probe_failed';
      }
    }
    assertAutomaticPreviewSourceDispatchIdentity({
      sourceDispatchIdentity,
      stableSourceSnapshot,
      domainId,
      repoRoot,
      sourceStatePath,
      readSourceMonitorState,
    });
    phase = 'freeze';
    let sourceSha256;
    if (executionMode === 'ACTIVATION_GATED_AUTO') {
      sourceSha256 = writePrivateJsonFile({
        publication: automaticArtifactPublication,
        filePath: sourcePath,
        payload: sourcePayload,
        label: 'automatic preview source artifact',
      }).sha256;
    } else {
      writeJsonFile(sourcePath, sourcePayload);
      sourceSha256 = sha256Bytes(fs.readFileSync(sourcePath));
    }
    progress({ status: 'running', message: `froze ${domainId} source`, current: 1, total: 3, outputPath: sourcePath });
    const context = await loadPolicyContext({ domainId, config, repoRoot });
    const importPlan = await buildImportPlan({ domainId, config, repoRoot, sourcePayload, sourceResult, context });
    phase = 'preview';
    const bundle = buildSupplementaryL1Bundle({
      operationId: `automation-${domainId}-first-l1`,
      runId,
      domainId,
      generatedAt,
      policy: context.policy,
      baseline: context.baseline,
      source: {
        path: path.relative(repoRoot, sourcePath).replaceAll('\\', '/'),
        sha256: sourceSha256,
      },
      ownedTables: context.ownedTables ?? config.ownedTables,
      importPlan,
      executionMode,
      ...(sourceDispatchIdentity == null ? {} : { sourceDispatchIdentity }),
    });
    if (executionMode === 'ACTIVATION_GATED_AUTO') {
      writePrivateJsonFile({
        publication: automaticArtifactPublication,
        filePath: bundlePath,
        payload: bundle,
        label: 'automatic preview bundle artifact',
      });
    } else {
      writeJsonFile(bundlePath, bundle);
    }
    if (stableSourceSnapshot != null && !reuseCurrentSourceSnapshot) {
      if (options.deferSourceAcknowledgement === true) {
        sourceAcknowledgementReason = 'deferred_until_apply';
      } else if (typeof acknowledgeSource !== 'function') {
        sourceAcknowledgementReason = 'acknowledger_not_configured';
      } else {
        try {
          acknowledgeSource({
            manifestPath: options.manifestPath ?? DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
            snapshot: stableSourceSnapshot,
            outputPath: bundlePath
          });
          sourceAcknowledged = true;
          sourceAcknowledgementReason = 'acknowledged';
        } catch {
          sourceAcknowledgementReason = 'post_probe_failed';
        }
      }
    }
    progress({
      status: 'completed',
      message: `prepared ${domainId} L1 frozen bundle`,
      current: 3,
      total: 3,
      outputPath: sourcePath,
      reportPath: bundlePath,
    });
    return Object.freeze({
      domainId,
      sourcePath,
      bundlePath,
      bundle,
      sourceAcknowledged,
      sourceAcknowledgementReason,
      stableSourceSnapshot,
    });
  } catch (error) {
    progress({
      status: 'failed',
      message: `${domainId} L1 preview failed: ${error?.message ?? String(error)}`,
      current: 0,
      total: 3,
    });
    throw error;
  }
}

export async function runSupplementaryDomainL1PreviewCli({
  argv = process.argv.slice(2),
  env = process.env,
  repoRoot = getProjectRoot(),
  mysqlModule = null,
  now = new Date().toISOString(),
  sourceDispatchIdentity = sourceDispatchIdentityFromEnvironment(env),
  sourceStatePath = env.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH,
} = {}) {
  const args = parseArgs(argv);
  const domainId = requireDomain(args.domain);
  const config = DOMAIN_PREVIEW_CONFIG[domainId];
  const root = path.resolve(repoRoot);
  const runId = args['run-id'] ?? `${domainId}_l1_${now.replace(/\D/g, '').slice(0, 14)}`;
  const executionMode = resolveSupplementaryPreviewExecutionMode(args);
  const reuseCurrentSourceSnapshot = args['reuse-current-source'] === 'true'
    ? loadReusableCurrentSourceSnapshot({
        domainId,
        repoRoot: root,
        manifestPath: args['manifest-path'],
      })
    : null;
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  try {
    return await prepareSupplementaryDomainL1Preview({
      domainId,
      repoRoot: root,
      generatedAt: now,
      runId,
      progressPath: args['progress-path'],
      artifactRoot: args['artifact-root'],
      manifestPath: args['manifest-path'],
      executionMode,
      deferSourceAcknowledgement: args['defer-source-acknowledgement'] === 'true',
      reuseCurrentSourceSnapshot,
      sourceDispatchIdentity,
      sourceStatePath,
    }, {
      runSource: (input) => runDomainSource(input, {
        env,
        runId,
        resumeMode: args['resume-mode'] ?? 'fresh',
        resumeState: args['resume-state'],
        reuseCurrentGeneration: args['reuse-current-generation'] === 'true',
        reuseCurrentSource: args['reuse-current-source'] === 'true',
        persistCanonicalShimmerProposal: args['persist-canonical-shimmer-proposal'] !== 'false',
      }),
      loadPolicyContext: async () => {
        const current = await readCurrentSupplementaryContext(connection, {
          bundle: { domainId, ownedTables: config.ownedTables, executionMode },
          environmentId: env.TERRAPEDIA_AUTOMATION_ENVIRONMENT_ID ?? 'local',
        });
        return {
          policy: {
            domainId,
            level: current.currentLevel,
            operationalState: current.operationalState,
            policyVersion: current.policyVersion,
            policyHash: current.policyHash,
            policySetHash: current.policySetHash,
            ...(current.policyJson == null ? {} : { policyJson: current.policyJson }),
          },
          baseline: current.baseline,
          ownedTables: current.ownedTables,
        };
      },
      buildImportPlan: ({ sourcePayload, sourceResult }) => buildDomainImportPlan(domainId, sourcePayload, sourceResult),
      probeSource: reuseCurrentSourceSnapshot
        ? null
        : ({ domainId: probeDomainId }) => probeSupplementarySource({ domainId: probeDomainId }),
      acknowledgeSource: acknowledgeWikiProbeSnapshot,
    });
  } finally {
    await connection.end();
  }
}

function assertAutomaticPreviewSourceDispatchIdentity({
  sourceDispatchIdentity,
  stableSourceSnapshot,
  domainId,
  repoRoot,
  sourceStatePath,
  readSourceMonitorState,
}) {
  if (sourceDispatchIdentity == null) return;
  if (stableSourceSnapshot == null) {
    throw new Error('automatic preview source must remain stable for the scheduler dispatch identity');
  }
  const currentState = assertCurrentSourceMonitorStateMatchesDispatchIdentity({
    identity: sourceDispatchIdentity,
    domain: domainId,
    repoRoot,
    sourceStatePath,
    readSourceMonitorStateImpl: readSourceMonitorState,
  });
  assertFrozenSourceMatchesDispatchIdentity(sourceDispatchIdentity, stableSourceSnapshot.contentHash);
  if (stableSourceSnapshot.checkedAt !== sourceDispatchIdentity.sourceRunIdentity) {
    throw new Error('automatic preview source checkedAt does not match the scheduler dispatch identity');
  }
  if (stableSourceSnapshot.sourceKey !== currentState.sourceKey) {
    throw new Error('automatic preview source key does not match the scheduler dispatch identity');
  }
}

export function loadReusableCurrentSourceSnapshot({
  domainId,
  repoRoot = getProjectRoot(),
  manifestPath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
} = {}) {
  const normalizedDomainId = requireDomain(domainId);
  const definition = SUPPLEMENTARY_SOURCE_DEFINITIONS[normalizedDomainId];
  const root = path.resolve(repoRoot);
  const manifest = loadWikiSourceManifest(path.resolve(root, manifestPath));
  const record = (manifest.records ?? []).find((entry) => (
    entry?.sourceKey === definition.sourceKey
    && entry?.pageTitle === definition.locator
    && entry?.requestedPageTitle === definition.locator
    && entry?.entityFamily === definition.entityFamily
    && entry?.sourceKind === definition.sourceKind
    && entry?.status === 'ok'
  ));
  const contentHash = String(record?.contentHash ?? '').trim();
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error(`local ${normalizedDomainId} source reuse requires a canonical manifest snapshot`);
  }
  return Object.freeze({
    ...definition,
    contentHash,
    checkedAt: requireTimestamp(record.lastParsedAt ?? record.lastFetchedAt),
  });
}

function normalizeReusableCurrentSourceSnapshot(snapshot, domainId) {
  const definition = SUPPLEMENTARY_SOURCE_DEFINITIONS[domainId];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || snapshot.sourceKey !== definition.sourceKey
      || snapshot.locator !== definition.locator
      || snapshot.entityFamily !== definition.entityFamily
      || snapshot.sourceKind !== definition.sourceKind
      || !/^[a-f0-9]{64}$/.test(String(snapshot.contentHash ?? '').trim())) {
    throw new Error(`local ${domainId} source reuse snapshot is invalid`);
  }
  return Object.freeze({
    ...definition,
    contentHash: String(snapshot.contentHash).trim(),
    checkedAt: requireTimestamp(snapshot.checkedAt),
  });
}

export function resolveSupplementaryPreviewExecutionMode(args = {}) {
  return requireExecutionMode(args['execution-mode']);
}

export async function runDomainSource({ domainId, repoRoot, progressPath }, {
  env,
  runId,
  resumeMode,
  resumeState,
  reuseCurrentGeneration = false,
  reuseCurrentSource = false,
  persistCanonicalShimmerProposal = true,
}, {
  runNodeImpl = runNode,
  runProposalImpl = runCanonicalShimmerImportProposal,
  runReadOnlyProposalImpl = runReadOnlyCanonicalShimmerImportProposal,
  readInputContractImpl = readCanonicalShimmerImportInputContract,
  readProposalImpl = readCanonicalShimmerImportProposal,
} = {}) {
  if (reuseCurrentGeneration && domainId !== 'shimmer') {
    throw new Error('--reuse-current-generation=true is only supported for shimmer');
  }
  if (reuseCurrentSource && domainId === 'shimmer' && !reuseCurrentGeneration) {
    throw new Error('shimmer current source reuse requires --reuse-current-generation=true');
  }
  if (!reuseCurrentGeneration && !reuseCurrentSource) {
    await runNodeImpl(buildDomainSourceCommand({
      domainId,
      progressPath,
      runId,
      resumeMode,
      resumeState,
    }), { cwd: repoRoot, env });
  }
  if (domainId === 'audio') {
    return { sourcePayload: readJson(resolveSharedDataRoot('generated', 'wiki-audio-assets.latest.json')) };
  }
  if (domainId === 'bosses') {
    return { sourcePayload: readJson(path.join(repoRoot, 'data', 'generated', 'wiki-bosses.latest.json')) };
  }
  const pointer = readJson(path.join(repoRoot, 'data', 'generated', 'shimmer', 'wiki-shimmer-current-generation.json'));
  if (reuseCurrentGeneration) {
    if (!persistCanonicalShimmerProposal) {
      const proposal = await runReadOnlyProposalImpl({
        bundleManifestPath: path.join('data', 'generated', 'shimmer', pointer.manifestPath),
        database: 'terria_v1_local',
        env,
        generatedAt: new Date().toISOString(),
        repoRoot,
      });
      assertReusableShimmerGeneration({
        pointer,
        inputContract: proposal.inputContract,
        proposal,
        allowPreviewRefresh: true,
      });
      return { sourcePayload: proposal.inputContract, proposal };
    }
    const inputContract = readInputContractImpl({ repoRoot });
    const canonicalProposal = readProposalImpl({ repoRoot });
    assertReusableShimmerGeneration({
      pointer,
      inputContract: inputContract.contract,
      proposal: canonicalProposal.proposal,
    });
    const refreshedProposal = await runReadOnlyProposalImpl({
      bundleManifestPath: path.join('data', 'generated', 'shimmer', pointer.manifestPath),
      database: 'terria_v1_local',
      env,
      generatedAt: new Date().toISOString(),
      repoRoot,
    });
    assertReusableShimmerGeneration({
      pointer,
      inputContract: inputContract.contract,
      proposal: refreshedProposal,
      allowPreviewRefresh: true,
    });
    return { sourcePayload: inputContract.contract, proposal: refreshedProposal };
  }
  const proposalRunner = persistCanonicalShimmerProposal ? runProposalImpl : runReadOnlyProposalImpl;
  const proposal = await proposalRunner({
    bundleManifestPath: path.join('data', 'generated', 'shimmer', pointer.manifestPath),
    database: 'terria_v1_local',
    env,
    generatedAt: new Date().toISOString(),
    repoRoot,
  });
  return { sourcePayload: proposal.inputContract, proposal };
}

function runReadOnlyCanonicalShimmerImportProposal(options) {
  return runCanonicalShimmerImportProposal(options, {
    writeProposal: async () => {},
  });
}

function assertReusableShimmerGeneration({ pointer, inputContract, proposal, allowPreviewRefresh = false }) {
  const expectedManifestPath = path.posix.join('data/generated/shimmer', requireText(pointer.manifestPath, 'pointer manifestPath'));
  if (pointer.generationId !== inputContract?.generationId
      || pointer.manifestSha256 !== inputContract?.manifestSha256
      || pointer.dataBundleSha256 !== inputContract?.dataBundleSha256
      || expectedManifestPath !== inputContract?.manifestPath) {
    throw new Error('Current Shimmer generation pointer does not match the canonical input contract');
  }
  const proposalContract = proposal?.inputContract;
  const contractIdentity = ['generationId', 'manifestPath', 'manifestSha256', 'dataBundleSha256', 'providerScope'];
  const contractsMatch = allowPreviewRefresh
    ? contractIdentity.every((field) => canonicalJson(proposalContract?.[field]) === canonicalJson(inputContract?.[field]))
    : canonicalJson(proposalContract) === canonicalJson(inputContract);
  if (!contractsMatch) {
    throw new Error('Canonical Shimmer proposal input contract does not match the reusable generation');
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildDomainSourceCommand({ domainId, progressPath, runId, resumeMode, resumeState }) {
  const commands = {
    audio: [
      'pipelines/fetch/fetch-wiki-audio-assets.mjs',
      '--mode=all',
      '--allow-full-audio-corpus=true',
      '--max-total-files=600',
      '--max-api-pages-per-prefix=100',
      `--progress-path=${progressPath}`,
    ],
    bosses: [
      'pipelines/fetch/fetch-wiki-bosses.mjs',
      `--resume-mode=${resumeMode}`,
      ...(resumeState ? [`--resume-state=${resumeState}`] : []),
      `--progress-path=${progressPath}`,
    ],
    shimmer: [
      'pipelines/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
      `--run-id=${runId}`,
      `--progress-path=${progressPath}`,
    ],
  };
  return commands[requireDomain(domainId)];
}

function buildDomainImportPlan(domainId, sourcePayload, sourceResult) {
  if (domainId === 'audio') {
    return { summary: { assets: sourcePayload.assets?.length ?? 0 } };
  }
  if (domainId === 'bosses') {
    return { summary: { records: sourcePayload.records?.length ?? 0 } };
  }
  return {
    previewSha256: sourceResult?.proposal?.previewSha256,
    targetFingerprintSha256: sourceResult?.proposal?.targetFingerprintSha256,
    summary: sourceResult?.proposal?.preview?.summary ?? {},
  };
}

function runNode([script, ...args], { cwd, env }) {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(sourceRoot, script), ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`source command failed: script=${script} code=${code} signal=${signal ?? '-'}`));
    });
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolvePreviewArtifactRoot({ repoRoot, domainId, runId, executionMode, artifactRoot }) {
  const root = path.resolve(repoRoot);
  const canonicalRoot = path.join(root, 'reports', 'authorization', 'canonical');
  const requested = executionMode === 'ACTIVATION_GATED_AUTO'
    ? path.join(canonicalRoot, 'automatic', domainId, runId)
    : artifactRoot == null ? canonicalRoot : path.resolve(root, artifactRoot);
  const relative = path.relative(root, requested).replaceAll('\\', '/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('preview artifact root must remain inside the repository');
  }
  if (executionMode === 'ACTIVATION_GATED_AUTO' && artifactRoot != null) {
    const supplied = path.resolve(root, artifactRoot);
    if (supplied !== requested) {
      throw new Error('automatic preview artifact root must be the canonical run-specific directory');
    }
  }
  if (relative !== 'reports/authorization/canonical'
      && !relative.startsWith('reports/authorization/canonical/')) {
    throw new Error('preview artifact root must remain under reports/authorization/canonical');
  }
  return requested;
}

function reserveAutomaticPreviewArtifactDirectory({ repoRoot, artifactRoot }) {
  assertSecureAutomaticPreviewPublicationSupported();
  const root = path.resolve(repoRoot);
  const target = path.resolve(artifactRoot);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('automatic preview artifact directory must be a new descendant of the repository root');
  }
  assertAutomaticPreviewArtifactTrustBoundary({ repoRoot: root, artifactRoot: target });
  const segments = relative.split(path.sep).filter(Boolean);
  let parentFd = openBoundPreviewDirectory(root);
  try {
    assertPrivatePreviewDirectoryFd(parentFd);
    for (const segment of segments.slice(0, -1)) {
      const childFd = openOrCreateBoundPreviewDirectory(parentFd, segment);
      fs.closeSync(parentFd);
      parentFd = childFd;
      assertPrivatePreviewDirectoryFd(parentFd);
    }
    const targetPath = path.join(descriptorDirectoryPathFor(parentFd), segments.at(-1));
    try {
      fs.mkdirSync(targetPath, { mode: 0o700 });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error(`refusing to overwrite automatic preview artifact: ${target}`);
      }
      throw previewArtifactDirectoryError(error);
    }
    fs.fsyncSync(parentFd);
    const targetFd = openBoundPreviewDirectoryAtPath(targetPath);
    try {
      fs.fchmodSync(targetFd, 0o700);
      assertPrivatePreviewDirectoryFd(targetFd);
      const identity = fs.fstatSync(targetFd);
      fs.fsyncSync(targetFd);
      assertAutomaticPreviewArtifactTrustBoundary({ repoRoot: root, artifactRoot: target });
      return Object.freeze({
        repoRoot: root,
        artifactRoot: target,
        dev: identity.dev,
        ino: identity.ino,
      });
    } finally {
      fs.closeSync(targetFd);
    }
  } finally {
    fs.closeSync(parentFd);
  }
}

function writePrivateJsonFile({ publication, filePath, payload, label }) {
  if (!publication || typeof publication !== 'object') {
    throw new Error('automatic preview artifact publication is required');
  }
  const target = path.resolve(requireText(filePath, 'automatic preview artifact path'));
  if (path.dirname(target) !== publication.artifactRoot) {
    throw new Error('automatic preview artifact must remain in its reserved directory');
  }
  const fileName = path.basename(target);
  if (!fileName || fileName === '.' || fileName === '..') {
    throw new Error('automatic preview artifact must name a file');
  }
  assertAutomaticPreviewArtifactTrustBoundary({
    repoRoot: publication.repoRoot,
    artifactRoot: publication.artifactRoot,
  });
  const directoryFd = openBoundPreviewDirectory(publication.artifactRoot);
  let temporaryFd = null;
  let temporaryPath = null;
  try {
    const identity = fs.fstatSync(directoryFd);
    assertPrivatePreviewDirectoryFd(directoryFd);
    if (identity.dev !== publication.dev || identity.ino !== publication.ino) {
      throw new Error('automatic preview artifact directory identity changed or is unavailable');
    }
    const directoryPath = descriptorDirectoryPathFor(directoryFd);
    ({ temporaryFd, temporaryPath } = createBoundPreviewTemporaryFile({ directoryPath, fileName }));
    const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.writeFileSync(temporaryFd, bytes);
    fs.fchmodSync(temporaryFd, 0o600);
    const staged = fs.fstatSync(temporaryFd);
    assertPrivatePreviewFileStat(staged, 'automatic preview staged artifact');
    const stagedIdentity = { dev: staged.dev, ino: staged.ino };
    fs.fsyncSync(temporaryFd);
    fs.closeSync(temporaryFd);
    temporaryFd = null;
    const destinationPath = path.join(directoryPath, fileName);
    assertPreviewDirectoryIdentityAtPath(publication.artifactRoot, identity);
    fs.linkSync(temporaryPath, destinationPath);
    let destinationFd = null;
    try {
      destinationFd = fs.openSync(destinationPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const destination = fs.fstatSync(destinationFd);
      assertPrivatePreviewFileStat(destination, label);
      if (!samePreviewIdentity(stagedIdentity, destination) || destination.size !== bytes.length) {
        throw new Error(`${label} identity or byte length changed during publication`);
      }
      const destinationPathStat = fs.lstatSync(destinationPath);
      if (destinationPathStat.isSymbolicLink() || !samePreviewIdentity(destination, destinationPathStat)) {
        throw new Error(`${label} identity changed or is unavailable`);
      }
    } catch (error) {
      if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
        throw new Error(`${label} identity changed or is unavailable`, { cause: error });
      }
      throw error;
    } finally {
      if (destinationFd != null) fs.closeSync(destinationFd);
    }
    assertPreviewDirectoryIdentityAtPath(publication.artifactRoot, identity);
    fs.unlinkSync(temporaryPath);
    temporaryPath = null;
    fs.fsyncSync(directoryFd);
    return Object.freeze({ sha256: sha256Bytes(bytes) });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`${label} already exists; overwrite is forbidden: ${target}`, { cause: error });
    }
    throw error;
  } finally {
    if (temporaryFd != null) fs.closeSync(temporaryFd);
    if (temporaryPath != null) {
      try { fs.unlinkSync(temporaryPath); } catch {}
    }
    fs.closeSync(directoryFd);
  }
}

function assertSecureAutomaticPreviewPublicationSupported() {
  if (process.platform !== 'linux'
      || typeof process.getuid !== 'function'
      || typeof fs.constants.O_NOFOLLOW !== 'number'
      || typeof fs.constants.O_DIRECTORY !== 'number'
      || !fs.existsSync('/proc/self/fd')) {
    throw new Error('secure automatic preview artifact publication is unavailable on this platform');
  }
}

function assertAutomaticPreviewArtifactTrustBoundary({ repoRoot, artifactRoot }) {
  const root = path.resolve(requireText(repoRoot, 'repository root'));
  const target = path.resolve(requireText(artifactRoot, 'automatic preview artifact directory'));
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('automatic preview artifact directory is outside the repository trust boundary');
  }
  const schedulerUid = process.getuid();
  let current = root;
  for (const segment of [''].concat(relative ? relative.split(path.sep) : [])) {
    if (segment) current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw previewArtifactDirectoryError(error);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error('automatic preview artifact trust boundary requires canonical ordinary directories');
    }
    if (Number(stat.uid) !== Number(schedulerUid) || (stat.mode & 0o022) !== 0) {
      throw new Error('automatic preview artifact trust boundary requires owner-only writable directories');
    }
    let realPath;
    try {
      realPath = fs.realpathSync(current);
    } catch (error) {
      throw previewArtifactDirectoryError(error);
    }
    if (path.resolve(realPath) !== current) {
      throw new Error('automatic preview artifact trust boundary requires canonical directory paths');
    }
  }
}

function openOrCreateBoundPreviewDirectory(parentFd, name) {
  const childPath = path.join(descriptorDirectoryPathFor(parentFd), name);
  try {
    return openBoundPreviewDirectoryAtPath(childPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw previewArtifactDirectoryError(error);
    try {
      fs.mkdirSync(childPath, { mode: 0o700 });
    } catch (mkdirError) {
      if (mkdirError?.code !== 'EEXIST') throw previewArtifactDirectoryError(mkdirError);
    }
    fs.fsyncSync(parentFd);
    try {
      return openBoundPreviewDirectoryAtPath(childPath);
    } catch (openError) {
      throw previewArtifactDirectoryError(openError);
    }
  }
}

function openBoundPreviewDirectory(directoryPath) {
  const target = path.resolve(directoryPath);
  const filesystemRoot = path.parse(target).root;
  let directoryFd = openBoundPreviewDirectoryAtPath(filesystemRoot);
  try {
    for (const segment of path.relative(filesystemRoot, target).split(path.sep).filter(Boolean)) {
      const childFd = openBoundPreviewDirectoryAtPath(path.join(descriptorDirectoryPathFor(directoryFd), segment));
      fs.closeSync(directoryFd);
      directoryFd = childFd;
    }
    return directoryFd;
  } catch (error) {
    fs.closeSync(directoryFd);
    throw previewArtifactDirectoryError(error);
  }
}

function openBoundPreviewDirectoryAtPath(directoryPath) {
  return fs.openSync(
    directoryPath,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
}

function descriptorDirectoryPathFor(directoryFd) {
  return `/proc/self/fd/${directoryFd}`;
}

function createBoundPreviewTemporaryFile({ directoryPath, fileName }) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | fs.constants.O_NOFOLLOW;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const temporaryPath = path.join(
      directoryPath,
      `.${fileName}.${randomBytes(16).toString('hex')}.tmp`,
    );
    try {
      return {
        temporaryPath,
        temporaryFd: fs.openSync(temporaryPath, flags, 0o600),
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('unable to reserve a secure automatic preview temporary file');
}

function assertPrivatePreviewDirectoryFd(directoryFd) {
  const stat = fs.fstatSync(directoryFd);
  if (!stat.isDirectory() || Number(stat.uid) !== Number(process.getuid()) || (stat.mode & 0o022) !== 0) {
    throw new Error('automatic preview artifact trust boundary requires owner-only writable directories');
  }
}

function assertPrivatePreviewFileFd(fileFd) {
  assertPrivatePreviewFileStat(fs.fstatSync(fileFd), 'automatic preview artifact');
}

function assertPrivatePreviewFileStat(stat, label) {
  if (!stat.isFile()
      || Number(stat.uid) !== Number(process.getuid())
      || (stat.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} must be an ordinary private 0600 file owned by the automation service UID`);
  }
}

function assertPreviewDirectoryIdentityAtPath(directoryPath, expectedIdentity) {
  const directoryFd = openBoundPreviewDirectory(directoryPath);
  try {
    const current = fs.fstatSync(directoryFd);
    assertPrivatePreviewDirectoryFd(directoryFd);
    if (!samePreviewIdentity(current, expectedIdentity)) {
      throw new Error('automatic preview artifact directory identity changed or is unavailable');
    }
  } finally {
    fs.closeSync(directoryFd);
  }
}

function samePreviewIdentity(left, right) {
  return left != null && right != null && left.dev === right.dev && left.ino === right.ino;
}

function previewArtifactDirectoryError(error) {
  if (['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
    return new Error('automatic preview artifact directory identity changed or is unavailable', { cause: error });
  }
  return error;
}

export function connectionOptions(env) {
  const port = Number(env.TERRAPEDIA_DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535');
  }
  if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') {
    throw new Error('TERRAPEDIA_DB_NAME must be exactly terria_v1_local');
  }
  return {
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port,
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: 'terria_v1_local',
    multipleStatements: false,
    dateStrings: true,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length === 0 ? 'true' : rest.join('=')];
  }));
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function requireDomain(value) {
  const domainId = requireText(value, 'domainId');
  if (!DOMAIN_PREVIEW_CONFIG[domainId]) throw new Error(`unsupported supplementary preview domain: ${domainId}`);
  return domainId;
}

function requireExecutionMode(value) {
  const mode = value == null ? 'MANUAL_OWNER_L1' : requireText(value, 'executionMode');
  if (!SUPPLEMENTARY_EXECUTION_MODES.includes(mode)) {
    throw new Error('supplementary execution mode must be MANUAL_OWNER_L1 or ACTIVATION_GATED_AUTO');
  }
  return mode;
}

function requirePreviewRunId(value, domainId) {
  const runId = requireText(value, 'runId');
  if (!new RegExp(`^${domainId}_l1_[a-z0-9_]{8,72}$`).test(runId)) {
    throw new Error(`runId must use the bounded ${domainId}_l1 identity`);
  }
  return runId;
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} is required`);
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} is required`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value) {
  const text = requireText(value, 'generatedAt');
  if (!Number.isFinite(Date.parse(text))) throw new Error('generatedAt must be an ISO timestamp');
  return text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSupplementaryDomainL1PreviewCli().then(
    (result) => process.stdout.write(`${JSON.stringify({
      domainId: result.domainId,
      bundlePath: result.bundlePath,
    })}\n`),
    (error) => {
      process.stderr.write(`supplementary L1 preview failed: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
