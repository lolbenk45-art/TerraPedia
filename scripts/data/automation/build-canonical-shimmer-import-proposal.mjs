#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import {
  buildShimmerImportPreview,
  loadCurrentShimmerScope,
  loadTargetFingerprint,
  loadVerifiedShimmerImportBundle,
} from '../import/import-wiki-shimmer-to-db.mjs';
import {
  CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH,
  CANONICAL_SHIMMER_IMPORT_OPERATION_ID,
  assertCanonicalShimmerImportInputContract,
  buildCanonicalShimmerImportInputContract,
  writeCanonicalShimmerImportInputContract,
} from './canonical-shimmer-import-input-contract.mjs';

export const CANONICAL_SHIMMER_IMPORT_PROPOSAL_PATH =
  'reports/authorization/canonical/canonical-shimmer-import.proposal.json';

const PROPOSAL_FIELDS = Object.freeze([
  'schemaVersion',
  'operationId',
  'status',
  'apply',
  'generatedAt',
  'generationId',
  'manifestSha256',
  'dataBundleSha256',
  'previewSha256',
  'targetFingerprintSha256',
  'providerScope',
  'preview',
  'inputContract',
  'proposalSha256',
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

if (isDirectExecution()) {
  main().catch((error) => {
    console.error('[build-canonical-shimmer-import-proposal] failed');
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}

export function buildCanonicalShimmerImportProposal({
  bundle,
  existing,
  target,
  generatedAt = new Date().toISOString(),
} = {}) {
  const preview = buildShimmerImportPreview({ bundle, existing, target });
  const manifestPath = relativeManifestPath(bundle);
  const inputContract = buildCanonicalShimmerImportInputContract({
    generationId: bundle?.generationId,
    manifestPath,
    manifestSha256: bundle?.manifestSha256,
    dataBundleSha256: bundle?.dataBundleSha256,
    previewSha256: preview.previewSha256,
    targetFingerprintSha256: preview.targetFingerprintSha256,
    providerScope: preview.providerScope,
  });
  const proposal = {
    schemaVersion: 1,
    operationId: CANONICAL_SHIMMER_IMPORT_OPERATION_ID,
    status: 'proposed',
    apply: false,
    generatedAt: requireTimestamp(generatedAt, 'generatedAt'),
    generationId: bundle?.generationId,
    manifestSha256: bundle?.manifestSha256,
    dataBundleSha256: bundle?.dataBundleSha256,
    previewSha256: preview.previewSha256,
    targetFingerprintSha256: preview.targetFingerprintSha256,
    providerScope: preview.providerScope,
    preview,
    inputContract,
  };
  const proposalSha256 = hashCanonical(proposal);
  const output = freezeDeep({ ...proposal, proposalSha256 });
  assertCanonicalShimmerImportProposal(output);
  return output;
}

export async function runCanonicalShimmerImportProposal(options = {}, dependencies = {}) {
  rejectNonProposalOptions(options);
  const root = path.resolve(options.repoRoot ?? getProjectRoot());
  const loadBundle = dependencies.loadBundle ?? loadVerifiedShimmerImportBundle;
  const loadPreviewInputs = dependencies.loadPreviewInputs
    ?? ((input) => loadReadOnlyPreviewInputs(input, dependencies));
  const writeProposal = dependencies.writeProposal ?? writeCanonicalShimmerImportProposal;
  if (typeof loadBundle !== 'function' || typeof loadPreviewInputs !== 'function' || typeof writeProposal !== 'function') {
    throw new TypeError('Shimmer proposal dependencies must be functions');
  }

  const bundle = loadBundle({
    bundleManifestPath: options.bundleManifestPath,
    repoRoot: root,
  });
  const previewInputs = await loadPreviewInputs({ root, bundle, options });
  if (!previewInputs || typeof previewInputs !== 'object' || Array.isArray(previewInputs)) {
    throw new Error('Shimmer proposal preview inputs are required');
  }
  const proposal = buildCanonicalShimmerImportProposal({
    bundle,
    existing: previewInputs.existing,
    target: previewInputs.target,
    generatedAt: options.generatedAt,
  });
  await writeProposal({
    repoRoot: root,
    proposal,
    outputPath: options.outputPath,
  });
  return proposal;
}

export function writeCanonicalShimmerImportProposal({
  repoRoot = process.cwd(),
  proposal,
  outputPath = CANONICAL_SHIMMER_IMPORT_PROPOSAL_PATH,
} = {}) {
  const root = path.resolve(repoRoot);
  const proposalPath = resolvePrivateProposalPath({ root, outputPath });
  assertCanonicalShimmerImportProposal(proposal);
  assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: proposalPath,
    label: 'Shimmer import proposal',
    createParent: true,
  });
  const bytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  writePrivateJsonWithoutOverwrite(proposalPath, bytes, 'Shimmer import proposal');
  return Object.freeze({
    proposal,
    bytes,
    proposalPath,
    relativePath: path.relative(root, proposalPath).replaceAll('\\', '/'),
  });
}

export function materializeCanonicalShimmerImportInputContract({
  repoRoot = process.cwd(),
  proposalPath = CANONICAL_SHIMMER_IMPORT_PROPOSAL_PATH,
  inputContractPath = CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH,
} = {}) {
  const proposal = readCanonicalShimmerImportProposal({ repoRoot, proposalPath });
  return writeCanonicalShimmerImportInputContract({
    repoRoot,
    inputContract: proposal.proposal.inputContract,
    inputContractPath,
  });
}

export function readCanonicalShimmerImportProposal({
  repoRoot = process.cwd(),
  proposalPath = CANONICAL_SHIMMER_IMPORT_PROPOSAL_PATH,
} = {}) {
  const root = path.resolve(repoRoot);
  const resolvedProposalPath = resolvePrivateProposalPath({ root, outputPath: proposalPath });
  assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: resolvedProposalPath,
    label: 'Shimmer import proposal',
  });
  const stat = fs.lstatSync(resolvedProposalPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('Shimmer import proposal must be a private ordinary JSON file');
  }
  const bytes = fs.readFileSync(resolvedProposalPath);
  let proposal;
  try {
    proposal = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Shimmer import proposal must be valid JSON: ${error.message}`);
  }
  assertCanonicalShimmerImportProposal(proposal);
  return Object.freeze({
    proposal: freezeDeep(proposal),
    bytes,
    proposalPath: resolvedProposalPath,
    relativePath: path.relative(root, resolvedProposalPath).replaceAll('\\', '/'),
  });
}

export function assertCanonicalShimmerImportProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)
      || JSON.stringify(Object.keys(proposal).sort()) !== JSON.stringify([...PROPOSAL_FIELDS].sort())) {
    throw new Error('Shimmer import proposal must contain exactly the required fields');
  }
  if (proposal.schemaVersion !== 1
      || proposal.operationId !== CANONICAL_SHIMMER_IMPORT_OPERATION_ID
      || proposal.status !== 'proposed'
      || proposal.apply !== false) {
    throw new Error('Shimmer import proposal identity is invalid');
  }
  requireTimestamp(proposal.generatedAt, 'proposal generatedAt');
  if (!/^[a-f0-9]{64}$/.test(String(proposal.generationId ?? ''))
      || !isSha256(proposal.manifestSha256)
      || !isSha256(proposal.dataBundleSha256)
      || !isSha256(proposal.previewSha256)
      || !isSha256(proposal.targetFingerprintSha256)
      || !isSha256(proposal.proposalSha256)) {
    throw new Error('Shimmer import proposal hashes are invalid');
  }
  assertCanonicalShimmerImportInputContract(proposal.inputContract);
  if (proposal.inputContract.generationId !== proposal.generationId
      || proposal.inputContract.manifestSha256 !== proposal.manifestSha256
      || proposal.inputContract.dataBundleSha256 !== proposal.dataBundleSha256
      || proposal.inputContract.previewSha256 !== proposal.previewSha256
      || proposal.inputContract.targetFingerprintSha256 !== proposal.targetFingerprintSha256
      || hashCanonical(proposal.inputContract.providerScope) !== hashCanonical(proposal.providerScope)
      || proposal.preview?.previewSha256 !== proposal.previewSha256
      || proposal.preview?.targetFingerprintSha256 !== proposal.targetFingerprintSha256
      || proposal.preview?.generationId !== proposal.generationId
      || proposal.preview?.manifestSha256 !== proposal.manifestSha256
      || proposal.preview?.dataBundleSha256 !== proposal.dataBundleSha256
      || hashCanonical(proposal.preview?.providerScope) !== hashCanonical(proposal.providerScope)) {
    throw new Error('Shimmer import proposal does not bind one preview and input contract');
  }
  const { proposalSha256, ...payload } = proposal;
  if (hashCanonical(payload) !== proposalSha256) {
    throw new Error('Shimmer import proposal hash does not match its payload');
  }
  return true;
}

async function loadReadOnlyPreviewInputs({ root, bundle, options }, dependencies) {
  const config = dependencies.loadLocalStackConfig?.(root) ?? loadLocalStackConfig(root);
  const db = buildDatabaseConfig({
    config,
    env: options.env ?? process.env,
    overrides: options.dbOverrides,
    database: options.database,
  });
  if (db.database !== 'terria_v1_local') {
    throw new Error('Shimmer import proposal must use terria_v1_local');
  }
  const mysql = dependencies.mysql ?? loadMysqlModule();
  const connection = await mysql.createConnection({ ...db, dateStrings: true });
  let transactionOpen = false;
  try {
    await connection.query('SET NAMES utf8mb4');
    await connection.query('START TRANSACTION READ ONLY');
    transactionOpen = true;
    const existing = await loadCurrentShimmerScope(connection, bundle);
    const target = await loadTargetFingerprint(connection, db);
    await connection.rollback();
    transactionOpen = false;
    return { existing, target };
  } finally {
    if (transactionOpen) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original read-only proposal error.
      }
    }
    await connection.end();
  }
}

function buildDatabaseConfig({ config, env, overrides = {}, database } = {}) {
  return {
    host: overrides.host ?? env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(overrides.port ?? env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: overrides.user ?? env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: overrides.password ?? env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: database ?? env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local',
  };
}

function rejectNonProposalOptions(options) {
  if (options.apply !== undefined) {
    throw new Error('Shimmer import proposal does not support apply');
  }
  for (const key of ['inputContractPath', 'inputContract', 'raw', 'input', 'packet', 'permit']) {
    if (options[key] != null) {
      throw new Error(`Shimmer import proposal does not accept ${key}`);
    }
  }
}

function relativeManifestPath(bundle) {
  const root = path.resolve(bundle?.repoRoot ?? '');
  const manifestPath = path.resolve(bundle?.manifestPath ?? '');
  const relativePath = path.relative(root, manifestPath).replaceAll('\\', '/');
  if (!root || !relativePath || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
    throw new Error('verified Shimmer manifest must remain inside its repository root');
  }
  return relativePath;
}

function resolvePrivateProposalPath({ root, outputPath }) {
  const supplied = String(outputPath ?? '').trim();
  if (!supplied) throw new Error('Shimmer import proposal path is required');
  const resolved = path.resolve(root, supplied);
  const relativePath = path.relative(root, resolved).replaceAll('\\', '/');
  if (relativePath !== CANONICAL_SHIMMER_IMPORT_PROPOSAL_PATH) {
    throw new Error('Shimmer import proposal must use the private canonical path');
  }
  return resolved;
}

function writePrivateJsonWithoutOverwrite(outputPath, bytes, label) {
  const temporaryPath = `${outputPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, bytes, { mode: 0o600, flag: 'wx' });
    try {
      fs.linkSync(temporaryPath, outputPath);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error(`${label} already exists and cannot be overwritten`);
      }
      throw error;
    }
    fs.chmodSync(outputPath, 0o600);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function hashCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function freezeDeep(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) freezeDeep(nested);
  return value;
}

function isSha256(value) {
  return HASH_PATTERN.test(String(value ?? ''));
}

function requireTimestamp(value, label) {
  const text = String(value ?? '').trim();
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return text;
}

function isDirectExecution() {
  return process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const proposal = await runCanonicalShimmerImportProposal({
    apply: args.apply,
    bundleManifestPath: args['bundle-manifest'] ?? args.bundleManifest,
    database: args.database,
    dbOverrides: {
      host: args.host,
      password: args.password,
      port: args.port,
      user: args.user,
    },
    env: process.env,
    generatedAt: args['generated-at'],
    input: args.input,
    inputContractPath: args['input-contract'] ?? args.inputContract,
    outputPath: args.output,
    packet: args.packet,
    permit: args.permit,
    raw: args.raw,
    repoRoot: getProjectRoot(),
  });
  console.log(JSON.stringify(proposal, null, 2));
}
