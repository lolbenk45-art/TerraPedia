#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';

export const NPC_T2_CUTOVER_OPERATION_ID = 'canonical-npc-t2-cutover-verification';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function buildNpcT2CutoverResult({
  authorizationContext,
  ownerCompletionContext,
  baseCompletionContext,
  t1Evidence,
  snapshot,
  api,
  bridgeRetirement,
  verifiedAt,
} = {}) {
  validateAuthorizationContext(authorizationContext);
  validateOwnerCompletionContext(ownerCompletionContext);
  validateBaseCompletionContext(baseCompletionContext, ownerCompletionContext);
  validateT1Evidence(t1Evidence, ownerCompletionContext);
  validateSnapshot(snapshot);
  validateApiEvidence(api);
  if (bridgeRetirement?.status !== 'pass' || Number(bridgeRetirement?.referenceCount) !== 0) {
    throw new Error('NPC T2 bridge retirement evidence must pass with zero references');
  }

  const timestamp = requireTimestamp(verifiedAt, 'NPC T2 verifiedAt');
  const result = {
    schemaVersion: 1,
    resultKind: 'canonical_npc_t2_cutover_result',
    operationId: NPC_T2_CUTOVER_OPERATION_ID,
    status: 'completed',
    noWrite: true,
    cutoverState: 'T2_CUTOVER_VERIFIED',
    decisionIdentity: requireText(authorizationContext.decisionIdentity, 'NPC T2 decision identity'),
    packetHash: requireHash(authorizationContext.packetHash, 'NPC T2 packet hash'),
    runId: `npc-t2:${stripHash(authorizationContext.packetHash).slice(0, 24)}`,
    inputHash: requireHash(ownerCompletionContext.inputHash, 'NPC T2 input hash'),
    ownerCompletionHash: requireHash(ownerCompletionContext.completionHash, 'NPC T2 owner completion hash'),
    baseCompletionHash: requireHash(baseCompletionContext.completionHash, 'NPC T2 base completion hash'),
    databaseSnapshotHash: hashJson(buildNpcT2DatabaseSnapshotEvidence(snapshot)),
    apiEvidenceHash: hashJson(api),
    bridgeRetirementHash: hashJson(bridgeRetirement),
    executionManifestHash: requireHash(
      authorizationContext.executionManifestHash,
      'NPC T2 execution manifest hash',
    ),
    dataBundleSha256: requireHash(authorizationContext.dataBundleSha256, 'NPC T2 data bundle hash'),
    serverFingerprint: requireHash(authorizationContext.serverFingerprint, 'NPC T2 server fingerprint'),
    verifiedAt: timestamp,
  };
  return {
    ...result,
    resultHash: hashJson(result),
  };
}

export function validateNpcT2CutoverResult(result) {
  if (result?.schemaVersion !== 1
      || result?.resultKind !== 'canonical_npc_t2_cutover_result'
      || result?.operationId !== NPC_T2_CUTOVER_OPERATION_ID
      || result?.status !== 'completed'
      || result?.noWrite !== true
      || result?.cutoverState !== 'T2_CUTOVER_VERIFIED') {
    throw new Error('NPC T2 result identity is invalid');
  }
  for (const field of [
    'packetHash',
    'inputHash',
    'ownerCompletionHash',
    'baseCompletionHash',
    'databaseSnapshotHash',
    'apiEvidenceHash',
    'bridgeRetirementHash',
    'executionManifestHash',
    'dataBundleSha256',
    'serverFingerprint',
    'resultHash',
  ]) {
    requireHash(result[field], `NPC T2 ${field}`);
  }
  requireText(result.decisionIdentity, 'NPC T2 decision identity');
  requireText(result.runId, 'NPC T2 run ID');
  requireTimestamp(result.verifiedAt, 'NPC T2 verifiedAt');
  const { resultHash, ...payload } = result;
  if (hashJson(payload) !== resultHash) {
    throw new Error('NPC T2 result hash does not match the terminal payload');
  }
  return true;
}

export function buildNpcT2DatabaseSnapshotEvidence(snapshot) {
  const maint = snapshot?.maint && typeof snapshot.maint === 'object'
    ? Object.fromEntries(Object.entries(snapshot.maint).filter(([key]) => key !== 'baseCompletion'))
    : snapshot?.maint;
  return {
    ...snapshot,
    maint,
  };
}

export function hashNpcT2Evidence(value) {
  return hashJson(value);
}

export async function runNpcT2CutoverVerification({
  repoRoot = process.cwd(),
  outputPath,
  readinessOutputPath = 'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json',
  verifiedAt = new Date().toISOString(),
  authorizationContext,
} = {}, dependencies = {}) {
  const root = path.resolve(repoRoot);
  const defaults = await defaultDependencies();
  const loadOwnerCompletion = dependencies.loadOwnerCompletion ?? defaults.loadOwnerCompletion;
  const loadBaseCompletion = dependencies.loadBaseCompletion ?? defaults.loadBaseCompletion;
  const loadT1Evidence = dependencies.loadT1Evidence ?? defaults.loadT1Evidence;
  const loadSnapshot = dependencies.loadSnapshot ?? defaults.loadSnapshot;
  const probeApi = dependencies.probeApi ?? defaults.probeApi;
  const loadBridgeRetirement = dependencies.loadBridgeRetirement ?? defaults.loadBridgeRetirement;
  const writeReadiness = dependencies.writeReadiness ?? defaults.writeReadiness;

  const ownerCompletionContext = await loadOwnerCompletion({ repoRoot: root });
  const baseCompletionContext = await loadBaseCompletion({ repoRoot: root });
  const t1Evidence = await loadT1Evidence({ repoRoot: root, completionContext: ownerCompletionContext });
  const snapshot = await loadSnapshot({
    repoRoot: root,
    input: ownerCompletionContext.input,
    inputHash: ownerCompletionContext.inputHash,
  });
  const api = await probeApi({
    repoRoot: root,
    localSnapshotHash: snapshot.local?.snapshotHash ?? null,
    runtimeSample: snapshot.runtime?.sample ?? null,
  });
  const bridgeRetirement = await loadBridgeRetirement(root);
  const result = buildNpcT2CutoverResult({
    authorizationContext,
    ownerCompletionContext,
    baseCompletionContext,
    t1Evidence,
    snapshot,
    api,
    bridgeRetirement,
    verifiedAt,
  });
  await writePrivateJsonNoOverwrite({ repoRoot: root, outputPath, value: result });
  const readiness = await writeReadiness({
    repoRoot: root,
    outputPath: readinessOutputPath,
    generatedAt: verifiedAt,
    cutoverResult: result,
    loadBaseCompletion: async () => baseCompletionContext,
    loadSnapshot: async () => snapshot,
    probeApi: async () => api,
    loadT1Evidence: async () => t1Evidence,
    loadBridgeRetirement: () => bridgeRetirement,
  });
  if (readiness?.summary?.status !== 'pass'
      || readiness?.readinessLevel !== 'T2_CUTOVER_VERIFIED') {
    throw new Error('NPC T2 readiness publication did not pass');
  }
  return result;
}

async function defaultDependencies() {
  const readiness = await import('./npc-canonical-readiness.mjs');
  const baseMaint = await import('./npc-base-maint-apply.mjs');
  return {
    loadOwnerCompletion: readiness.readCanonicalNpcOwnerPhaseCompletion,
    loadBaseCompletion: baseMaint.readCanonicalNpcBaseMaintCompletion,
    loadT1Evidence: readiness.readNpcCanonicalT1Evidence,
    loadSnapshot: readiness.loadNpcCanonicalReadinessSnapshot,
    probeApi: readiness.probeNpcCanonicalReadinessApis,
    loadBridgeRetirement: readiness.readNpcBridgeRetirementEvidence,
    writeReadiness: readiness.writeNpcCanonicalReadinessReport,
  };
}

async function writePrivateJsonNoOverwrite({ repoRoot, outputPath, value }) {
  const output = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, requireText(outputPath, 'NPC T2 output path')),
    label: 'NPC T2 output',
    createParent: true,
  });
  if (fs.existsSync(output)) throw new Error('NPC T2 output already exists and cannot be overwritten');
  const temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.linkSync(temporary, output);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('NPC T2 output already exists and cannot be overwritten');
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  fs.chmodSync(output, 0o600);
}

function validateAuthorizationContext(context) {
  if (context?.operationId !== NPC_T2_CUTOVER_OPERATION_ID) {
    throw new Error(`NPC T2 authorization operation must be ${NPC_T2_CUTOVER_OPERATION_ID}`);
  }
  if (context?.executionManifest?.noWrite !== true) {
    throw new Error('NPC T2 authorization manifest must declare noWrite=true');
  }
  requireText(context.decisionIdentity, 'NPC T2 decision identity');
  for (const [value, label] of [
    [context.packetHash, 'packet hash'],
    [context.executionManifestHash, 'execution manifest hash'],
    [context.dataBundleSha256, 'data bundle hash'],
    [context.serverFingerprint, 'server fingerprint'],
  ]) requireHash(value, `NPC T2 ${label}`);
}

function validateOwnerCompletionContext(context) {
  const completion = context?.completion;
  if (completion?.resultKind !== 'canonical_npc_apply_completion'
      || completion?.operationId !== 'canonical-npc-apply'
      || completion?.status !== 'COMPLETED') {
    throw new Error('NPC T2 owner completion must be COMPLETED');
  }
  const inputHash = requireHash(context?.inputHash, 'NPC T2 owner input hash');
  if (completion.inputHash !== inputHash) {
    throw new Error('NPC T2 owner completion input hash drifted');
  }
  requireHash(context?.completionHash, 'NPC T2 owner completion hash');
  requireHash(completion?.landingResultHash, 'NPC T2 owner landing result hash');
}

function validateBaseCompletionContext(context, ownerContext) {
  const completion = context?.completion;
  if (completion?.resultKind !== 'canonical_npc_base_maint_completion'
      || completion?.operationId !== 'canonical-npc-base-maint-completion'
      || completion?.status !== 'COMPLETED') {
    throw new Error('NPC T2 base completion must be COMPLETED');
  }
  if (context?.inputHash !== ownerContext?.inputHash
      || completion.inputHash !== ownerContext?.inputHash) {
    throw new Error('NPC T2 base completion input hash drifted');
  }
  if (context?.landingResultHash !== ownerContext?.completion?.landingResultHash
      || completion.landingResultHash !== ownerContext?.completion?.landingResultHash) {
    throw new Error('NPC T2 base completion landing result hash drifted');
  }
  requireHash(context?.completionHash, 'NPC T2 base completion hash');
}

function validateT1Evidence(evidence, ownerContext) {
  if (evidence?.rollbackPassed !== true
      || evidence?.restorePassed !== true
      || evidence?.cleanupPassed !== true) {
    throw new Error('NPC T2 requires passing T1 rollback, restore, and cleanup evidence');
  }
  if (stableJson(evidence?.ownerPhaseCompletion) !== stableJson(ownerContext?.completion)) {
    throw new Error('NPC T2 T1 owner completion drifted');
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || snapshot?.landing?.base?.fresh !== true
      || Number(snapshot?.runtime?.sampleCount) <= 0) {
    throw new Error('NPC T2 formal database snapshot is incomplete');
  }
}

function validateApiEvidence(api) {
  if (Number(api?.admin?.sampleCount) <= 0 || api?.admin?.error != null
      || Number(api?.public?.sampleCount) <= 0 || api?.public?.error != null) {
    throw new Error('NPC T2 admin and public API evidence must pass');
  }
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function requireHash(value, label) {
  const text = String(value ?? '');
  if (!HASH_PATTERN.test(text)) throw new Error(`${label} must be SHA-256`);
  return text;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be a valid timestamp`);
  return text;
}

function stripHash(value) {
  return String(value ?? '').replace(/^sha256:/, '');
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((argument) => {
    const [key, ...values] = String(argument).replace(/^--/, '').split('=');
    return [key, values.length === 0 ? 'true' : values.join('=')];
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['no-write'] !== 'true') throw new Error('NPC T2 verification requires --no-write=true');
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  const authorizationContext = loadAuthorizedOperationContext({ operationId: NPC_T2_CUTOVER_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext: authorizationContext });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext: authorizationContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const result = await runNpcT2CutoverVerification({
    repoRoot,
    outputPath: args.output,
    readinessOutputPath: args['readiness-output'],
    verifiedAt: args['verified-at'] ?? new Date().toISOString(),
    authorizationContext,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
