#!/usr/bin/env node

import { createHash } from 'node:crypto';
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
import { buildSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';

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
  const progressPath = path.resolve(repoRoot, options.progressPath ?? config.progressPath);
  const artifactRoot = path.join(repoRoot, 'reports', 'authorization', 'canonical');
  const sourcePath = path.join(artifactRoot, `automation-${domainId}-first-l1.source.json`);
  const bundlePath = path.join(artifactRoot, `automation-${domainId}-first-l1.bundle.json`);
  const writeProgress = dependencies.writeProgress
    ?? ((filePath, payload) => writeJsonFile(filePath, payload));
  const runSource = requireFunction(dependencies.runSource, 'runSource');
  const loadPolicyContext = requireFunction(dependencies.loadPolicyContext, 'loadPolicyContext');
  const buildImportPlan = requireFunction(dependencies.buildImportPlan, 'buildImportPlan');
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
    progress({ status: 'running', message: `starting ${domainId} source refresh`, current: 0, total: 3 });
    const sourceResult = await runSource({ domainId, config, repoRoot, progressPath });
    const sourcePayload = requireObject(sourceResult?.sourcePayload, 'sourcePayload');
    phase = 'freeze';
    writeJsonFile(sourcePath, sourcePayload);
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
        sha256: sha256Json(sourcePayload),
      },
      ownedTables: config.ownedTables,
      importPlan,
    });
    writeJsonFile(bundlePath, bundle);
    progress({
      status: 'completed',
      message: `prepared ${domainId} L1 frozen bundle`,
      current: 3,
      total: 3,
      outputPath: sourcePath,
      reportPath: bundlePath,
    });
    return Object.freeze({ domainId, sourcePath, bundlePath, bundle });
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
} = {}) {
  const args = parseArgs(argv);
  const domainId = requireDomain(args.domain);
  const config = DOMAIN_PREVIEW_CONFIG[domainId];
  const root = path.resolve(repoRoot);
  const runId = args['run-id'] ?? `${domainId}_l1_${now.replace(/\D/g, '').slice(0, 14)}`;
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  try {
    return await prepareSupplementaryDomainL1Preview({
      domainId,
      repoRoot: root,
      generatedAt: now,
      runId,
      progressPath: args['progress-path'],
    }, {
      runSource: (input) => runDomainSource(input, {
        env,
        runId,
        resumeMode: args['resume-mode'] ?? 'fresh',
        resumeState: args['resume-state'],
        reuseCurrentGeneration: args['reuse-current-generation'] === 'true',
      }),
      loadPolicyContext: async () => {
        const current = await readCurrentSupplementaryContext(connection, {
          bundle: { domainId, ownedTables: config.ownedTables },
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
          },
          baseline: current.baseline,
        };
      },
      buildImportPlan: ({ sourcePayload, sourceResult }) => buildDomainImportPlan(domainId, sourcePayload, sourceResult),
    });
  } finally {
    await connection.end();
  }
}

export async function runDomainSource({ domainId, repoRoot, progressPath }, {
  env,
  runId,
  resumeMode,
  resumeState,
  reuseCurrentGeneration = false,
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
  if (!reuseCurrentGeneration) {
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
  const proposal = await runProposalImpl({
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
      'scripts/data/fetch/fetch-wiki-audio-assets.mjs',
      '--mode=all',
      '--allow-full-audio-corpus=true',
      '--max-total-files=600',
      `--progress-path=${progressPath}`,
    ],
    bosses: [
      'scripts/data/fetch/fetch-wiki-bosses.mjs',
      `--resume-mode=${resumeMode}`,
      ...(resumeState ? [`--resume-state=${resumeState}`] : []),
      `--progress-path=${progressPath}`,
    ],
    shimmer: [
      'scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
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
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
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

function connectionOptions(env) {
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
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length === 0 ? 'true' : rest.join('=')];
  }));
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function requireDomain(value) {
  const domainId = requireText(value, 'domainId');
  if (!DOMAIN_PREVIEW_CONFIG[domainId]) throw new Error(`unsupported supplementary preview domain: ${domainId}`);
  return domainId;
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
