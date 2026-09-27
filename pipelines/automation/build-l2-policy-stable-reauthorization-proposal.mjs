#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalServerFingerprint, hashCanonicalServerFingerprint } from './automation-database-contract.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  assertL2PolicyStableReauthorizationInput,
  isL2PolicyStableReauthorizationOperation,
} from './l2-policy-stable-reauthorization.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const AUTHORIZATION_ROOT = 'reports/authorization/canonical/';

export function buildL2PolicyStableReauthorizationProposal({
  input,
  policyRows,
  serverFingerprint,
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalized = assertL2PolicyStableReauthorizationInput(input, { now: generatedAt });
  if (!isL2PolicyStableReauthorizationOperation(normalized.operationId)) {
    throw new Error('unsupported L2 reauthorization operation');
  }
  const rows = normalizeRows(policyRows);
  const currentPolicySetHash = computePolicySetHash(rows);
  if (currentPolicySetHash !== normalized.currentPolicy.policySetHash) {
    throw new Error('current policy rows do not match the reauthorization H8');
  }
  const live = rows.find((row) => row.domainId === normalized.domainId);
  if (!live || live.policyVersion !== normalized.currentPolicy.policyVersion
      || live.policyHash !== normalized.currentPolicy.policyHash
      || live.currentLevel !== 'L2' || live.operationalState !== 'ACTIVE') {
    throw new Error('current L2 policy identity drifted');
  }
  const fingerprint = canonicalServerFingerprint(serverFingerprint);
  const payload = {
    schemaVersion: 1,
    artifactKind: 'l2-policy-stable-reauthorization-proposal',
    operationId: normalized.operationId,
    domainId: normalized.domainId,
    databaseName: normalized.databaseName,
    proposalOnly: true,
    authorizationStatus: 'AWAITING_OWNER',
    databaseWrites: false,
    networkAccess: false,
    policyUpdate: false,
    generatedAt: requireTimestamp(generatedAt, 'proposal generatedAt'),
    serverFingerprint: fingerprint,
    serverFingerprintHash: hashCanonicalServerFingerprint(fingerprint),
    currentPolicy: normalized.currentPolicy,
    targetPolicy: normalized.targetPolicy,
    currentPolicySetHash,
    predecessorL1Evidence: normalized.predecessorL1Evidence,
    priorDecision: normalized.priorDecision,
    policyRows: rows.map(({ domainId, policyVersion, policyHash }) => ({ domainId, policyVersion, policyHash })),
    forbidden: ['direct-sql', 'policy-update', 'replay', 'source-refresh', 'scheduler-activation'],
  };
  return Object.freeze({ ...payload, proposalHash: hashPayload(payload) });
}

export function assertProposal(proposal) {
  if (!proposal || proposal.artifactKind !== 'l2-policy-stable-reauthorization-proposal'
      || proposal.proposalOnly !== true || proposal.authorizationStatus !== 'AWAITING_OWNER'
      || proposal.databaseWrites !== false || proposal.networkAccess !== false || proposal.policyUpdate !== false) {
    throw new Error('L2 reauthorization proposal must be an awaiting-owner read-only artifact');
  }
  const { proposalHash, ...payload } = proposal;
  if (!HASH_PATTERN.test(proposalHash ?? '') || proposalHash !== hashPayload(payload)) {
    throw new Error('L2 reauthorization proposal hash drifted');
  }
  assertL2PolicyStableReauthorizationInput({
    schemaVersion: 1,
    operationId: proposal.operationId,
    databaseName: proposal.databaseName,
    domainId: proposal.domainId,
    reauthorization: true,
    currentPolicy: proposal.currentPolicy,
    targetPolicy: proposal.targetPolicy,
    predecessorL1Evidence: proposal.predecessorL1Evidence,
    priorDecision: proposal.priorDecision,
  }, { now: proposal.generatedAt });
  const rows = normalizeRows(proposal.policyRows);
  if (computePolicySetHash(rows) !== proposal.currentPolicySetHash) throw new Error('proposal policy-set hash drifted');
  const fingerprint = canonicalServerFingerprint(proposal.serverFingerprint);
  if (proposal.serverFingerprintHash !== hashCanonicalServerFingerprint(fingerprint)) throw new Error('proposal server fingerprint drifted');
  return true;
}

export function writeL2PolicyStableReauthorizationProposal({ repoRoot = process.cwd(), proposal, outputPath } = {}) {
  assertProposal(proposal);
  const root = path.resolve(repoRoot);
  const relative = requireText(outputPath, 'proposal output path').replaceAll('\\', '/');
  const expectedPrefix = `${AUTHORIZATION_ROOT}${proposal.operationId}/`;
  if (!relative.startsWith(expectedPrefix)
      || !new RegExp(`^${escapeRegExp(expectedPrefix)}[a-f0-9]{64}/proposal\\.json$`).test(relative)
      || relative.slice(expectedPrefix.length, expectedPrefix.length + 64) !== proposal.proposalHash.slice(7)) {
    throw new Error('proposal output path must be content-addressed by the exact operation identity and proposal hash');
  }
  const confined = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, relative),
    label: 'L2 reauthorization proposal output',
    createParent: true,
  });
  assertAbsent(confined, 'L2 reauthorization proposal output');
  const bytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  fs.writeFileSync(confined, bytes, { mode: 0o600, flag: 'wx' });
  return Object.freeze({ path: path.relative(root, confined).replaceAll('\\', '/'), sha256: hashBytes(bytes), proposalHash: proposal.proposalHash });
}

export function buildL2PolicyStableReauthorizationExecutionInput({
  input,
  proposalPath,
  proposalFileSha256,
  proposalHash,
} = {}) {
  const normalized = assertL2PolicyStableReauthorizationInput(input, {
    now: input?.capturedAt ?? new Date().toISOString(),
  });
  const pathValue = requireText(proposalPath, 'proposalPath').replaceAll('\\', '/');
  const prefix = `${AUTHORIZATION_ROOT}${normalized.operationId}/`;
  if (!pathValue.startsWith(prefix)
      || !/^[a-f0-9]{64}\/proposal\.json$/.test(pathValue.slice(prefix.length))) {
    throw new Error('proposalPath must be a content-addressed reauthorization proposal');
  }
  const hash = requireHash(proposalHash, 'proposalHash');
  if (pathValue.slice(prefix.length, prefix.length + 64) !== hash.slice(7)) {
    throw new Error('proposalPath content address does not match proposalHash');
  }
  return Object.freeze({
    ...normalized,
    proposalOnly: false,
    proposalPath: pathValue,
    proposalSha256: requireHash(proposalFileSha256, 'proposalFileSha256'),
    proposalHash: hash,
  });
}

export function writeL2PolicyStableReauthorizationExecutionInput({
  repoRoot = process.cwd(),
  input,
  proposalPath,
  proposalFileSha256,
  proposalHash,
  outputPath,
} = {}) {
  const execution = buildL2PolicyStableReauthorizationExecutionInput({
    input,
    proposalPath,
    proposalFileSha256,
    proposalHash,
  });
  const root = path.resolve(repoRoot);
  const relative = requireText(outputPath, 'execution input output path').replaceAll('\\', '/');
  const expected = new RegExp(`^${escapeRegExp(AUTHORIZATION_ROOT + execution.operationId)}\\.retry-[a-z0-9][a-z0-9_-]*\\.input\\.json$`);
  if (!expected.test(relative)) {
    throw new Error('execution input output path must use the operation retry input path');
  }
  const confined = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, relative),
    label: 'L2 reauthorization execution input output',
    createParent: true,
  });
  assertAbsent(confined, 'L2 reauthorization execution input output');
  const bytes = Buffer.from(`${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  fs.writeFileSync(confined, bytes, { mode: 0o600, flag: 'wx' });
  return Object.freeze({
    path: path.relative(root, confined).replaceAll('\\', '/'),
    sha256: hashBytes(bytes),
  });
}

export function buildL2PolicyStableReauthorizationProposalFromFiles({
  repoRoot = process.cwd(), inputPath, policyRowsPath, serverFingerprintPath, outputPath,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const read = (relative, label) => {
    const confined = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relative), label });
    if ((fs.lstatSync(confined).mode & 0o077) !== 0) throw new Error(`${label} must be private`);
    try { return JSON.parse(fs.readFileSync(confined, 'utf8')); } catch { throw new Error(`${label} must be valid JSON`); }
  };
  const proposal = buildL2PolicyStableReauthorizationProposal({
    input: read(inputPath, 'reauthorization input'),
    policyRows: read(policyRowsPath, 'reauthorization policy rows'),
    serverFingerprint: read(serverFingerprintPath, 'reauthorization server fingerprint'),
    generatedAt,
  });
  return writeL2PolicyStableReauthorizationProposal({ repoRoot: root, proposal, outputPath });
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('policy rows are required');
  return rows.map((row) => ({ domainId: requireText(row.domainId, 'policy domainId'), policyVersion: Number(row.policyVersion), policyHash: requireHash(row.policyHash, 'policy hash'), currentLevel: row.currentLevel ?? row.level, operationalState: row.operationalState }))
    .sort((left, right) => left.domainId.localeCompare(right.domainId));
}
function hashPayload(payload) { return `sha256:${createHash('sha256').update(stableJson(payload), 'utf8').digest('hex')}`; }
function stableJson(value) { return JSON.stringify(stableValue(value)); }
function stableValue(value) { if (Array.isArray(value)) return value.map(stableValue); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])); return value; }
function hashBytes(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function requireText(value, label) { const text = String(value ?? '').trim(); if (!text) throw new Error(`${label} is required`); return text; }
function requireHash(value, label) { if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`); return value; }
function requireTimestamp(value, label) { const text = requireText(value, label); if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`); return text; }
function assertAbsent(filePath, label) { try { fs.lstatSync(filePath); } catch (error) { if (error?.code === 'ENOENT') return; throw error; } throw new Error(`${label} already exists; overwrite is forbidden`); }

function parseArgs(argv) { return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=')]; })); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  buildL2PolicyStableReauthorizationProposalFromFiles({ repoRoot: process.cwd(), inputPath: args.input, policyRowsPath: args['policy-rows'], serverFingerprintPath: args['server-fingerprint'], outputPath: args.output }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { process.stderr.write(`L2 reauthorization proposal failed: ${error.message}\n`); process.exitCode = 1; });
}
