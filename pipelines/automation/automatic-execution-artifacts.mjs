import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';

const ATTEMPT_FIELDS = ['stateStoreEpoch', 'queueId', 'attemptId'];

export function normalizeAutomaticAttemptIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('automatic attempt identity must be an object');
  }
  return Object.freeze(Object.fromEntries(ATTEMPT_FIELDS.map((field) => {
    if (typeof value[field] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(value[field])) {
      throw new Error(`automatic attempt identity ${field} is invalid`);
    }
    return [field, value[field]];
  })));
}

export function automaticAttemptIdentityFromEnvironment(env, sourceDispatchIdentity) {
  if (sourceDispatchIdentity == null) return null;
  return normalizeAutomaticAttemptIdentity({
    stateStoreEpoch: env.TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH,
    queueId: env.TERRAPEDIA_CRAWLER_QUEUE_ID,
    attemptId: env.TERRAPEDIA_CRAWLER_ATTEMPT_ID,
  });
}

export function automaticArtifactRunId({ runId, sourceDispatchIdentity, importPlan } = {}) {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(runId)) {
    throw new Error('automatic artifact runId must be a safe path segment');
  }
  if (importPlan?.automaticAttemptIdentity == null) return runId;
  const attempt = normalizeAutomaticAttemptIdentity(importPlan.automaticAttemptIdentity);
  if (!sourceDispatchIdentity || !/^sha256:[a-f0-9]{64}$/.test(sourceDispatchIdentity.sourceFingerprint)
      || !/^sha256:[a-f0-9]{64}$/.test(sourceDispatchIdentity.sourceContentIdentity)
      || typeof sourceDispatchIdentity.sourceRunIdentity !== 'string'
      || !Number.isFinite(Date.parse(sourceDispatchIdentity.sourceRunIdentity))) {
    throw new Error('automatic artifact source dispatch identity is invalid');
  }
  const source = {
    sourceFingerprint: sourceDispatchIdentity.sourceFingerprint,
    sourceRunIdentity: sourceDispatchIdentity.sourceRunIdentity,
    sourceContentIdentity: sourceDispatchIdentity.sourceContentIdentity,
  };
  const digest = createHash('sha256').update(JSON.stringify({ source, attempt })).digest('hex');
  return `${runId}_exec_${digest}`;
}

export function automaticReconciliationRoot(binding) {
  if (!/^[a-z][a-z0-9_]*$/.test(binding?.domainId ?? '')) throw new Error('reconciliation domainId is invalid');
  return `reports/runtime/l1-reconciliation/${binding.domainId}/${automaticArtifactRunId(binding)}`;
}

export function assertAutomaticAttemptMatches(value, expected, label) {
  if (expected == null) return;
  const actual = normalizeAutomaticAttemptIdentity(value);
  const bound = normalizeAutomaticAttemptIdentity(expected);
  if (ATTEMPT_FIELDS.some((field) => actual[field] !== bound[field])) {
    throw new Error(`${label} automatic attempt identity does not match the frozen bundle`);
  }
}

export function readAutomaticSourceProgress({ repoRoot, progressPath, binding }) {
  const sourcePath = assertRepositoryOrdinaryFile({ repoRoot, filePath: progressPath, label: 'source progress' });
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (String(payload?.status ?? '').toLowerCase() !== 'completed') {
    throw new Error('source progress must be terminal before database apply');
  }
  assertAutomaticAttemptMatches(payload, binding.importPlan?.automaticAttemptIdentity, 'source progress');
  return payload;
}

export function freezeAutomaticSourceProgressSnapshot({ repoRoot, progressPath, binding }) {
  const payload = readAutomaticSourceProgress({ repoRoot, progressPath, binding });
  const targetPath = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, automaticReconciliationRoot(binding), 'source-progress.json'),
    label: 'source progress snapshot',
    createParent: true,
  });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.chmodSync(targetPath, 0o600);
  return targetPath;
}
