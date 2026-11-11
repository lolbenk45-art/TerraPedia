import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import { validateArmorCanonicalFenceCommit } from '../relation/armor-canonical-write-fence.mjs';

export const ARMOR_AUTOMATIC_DISPATCH_BINDING_SCHEMA = 'armor-automatic-dispatch-binding/v1';
export const ARMOR_AUTOMATIC_ACTION_ID = 'domain-source-armor-sets';
export const ARMOR_AUTOMATIC_OPERATION_ID = 'canonical-armor-ingestion';
export const ARMOR_AUTOMATIC_BINDING_ROOT = 'reports/authorization/canonical/automatic-armor/';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RESULT_LABEL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ATTEMPT_ID_PATTERN = /^attempt-[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SOURCE_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;
const PRIVATE_MODE_MASK = 0o077;
const CANONICAL_ROOT = 'reports/authorization/canonical/';

/**
 * Return the deterministic private binding path for one complete source
 * dispatch identity. The run/content suffix keeps later probes immutable even
 * when the upstream fingerprint is unchanged.
 * The overloaded object form keeps callers from having to repeat the field name.
 */
export function buildArmorAutomaticBindingPath(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || !HASH_PATTERN.test(input.sourceFingerprint ?? '')
      || !SOURCE_RUN_ID_PATTERN.test(input.sourceRunIdentity ?? '')
      || !HASH_PATTERN.test(input.sourceContentIdentity ?? '')) {
    throw new Error('Armor automatic source dispatch identity is invalid');
  }
  const sourceFingerprint = input.sourceFingerprint;
  if (!HASH_PATTERN.test(sourceFingerprint)) {
    throw new Error('Armor automatic source fingerprint must be a lowercase sha256 hash');
  }
  const sourceRunIdentity = requireTimestamp(input.sourceRunIdentity, 'Armor automatic source run identity');
  if (new Date(sourceRunIdentity).toISOString() !== sourceRunIdentity) {
    throw new Error('Armor automatic source run identity must be a canonical ISO timestamp');
  }
  const dispatchHash = createHash('sha256')
    .update(`${sourceRunIdentity}\n${input.sourceContentIdentity}`, 'utf8')
    .digest('hex');
  return `${ARMOR_AUTOMATIC_BINDING_ROOT}${sourceFingerprint.slice('sha256:'.length)}/${dispatchHash}.binding.json`;
}

/**
 * Persist one fully authorized, source-bound Armor dispatch binding. The caller
 * must supply the exact operation authorization artifacts and scheduler
 * activation; this helper validates every reference and never replaces a prior
 * binding.
 */
export function writeArmorAutomaticBinding({
  repoRoot = process.cwd(),
  binding,
  now = new Date().toISOString(),
} = {}) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error('Armor automatic binding must be an object');
  }
  const relativePath = buildArmorAutomaticBindingPath(binding.sourceDispatchIdentity);
  const root = path.resolve(repoRoot);
  const target = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, relativePath),
    label: 'Armor automatic binding',
    createParent: true,
  });
  const directory = path.dirname(target);
  const directoryMode = fs.statSync(directory).mode & 0o777;
  if ((directoryMode & PRIVATE_MODE_MASK) !== 0) {
    throw new Error('Armor automatic binding directory must be private');
  }
  assertAbsentArtifact(root, relativePath, 'Armor automatic binding');
  assertArmorAutomaticBinding({
    repoRoot: root,
    binding,
    bindingPath: relativePath,
    now,
    expectedAttemptId: binding.attemptId,
    expectedSourceDispatchIdentity: binding.sourceDispatchIdentity,
  });

  const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`, 'utf8');
  const temporary = `${target}.tmp-${randomUUID()}`;
  let temporaryCreated = false;
  let published = false;
  try {
    const fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600,
    );
    temporaryCreated = true;
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // A same-directory hard link publishes atomically and fails if a binding
    // for this source fingerprint already exists.
    fs.linkSync(temporary, target);
    published = true;
    fs.unlinkSync(temporary);
    temporaryCreated = false;
    const directoryFd = fs.openSync(directory, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directoryFd); }
    finally { fs.closeSync(directoryFd); }
    const readback = readArmorAutomaticBinding({
      repoRoot: root,
      relativePath,
      now,
      expectedAttemptId: binding.attemptId,
      expectedSourceDispatchIdentity: binding.sourceDispatchIdentity,
    });
    return Object.freeze({ path: relativePath, sha256: hashBytes(fs.readFileSync(target)), binding: readback });
  } catch (error) {
    if (temporaryCreated) {
      try { fs.unlinkSync(temporary); } catch {}
    }
    if (published) {
      try {
        if (hashBytes(fs.readFileSync(target)) === hashBytes(bytes)) fs.unlinkSync(target);
      } catch {}
    }
    throw error;
  }
}

/**
 * Read and validate an immutable scheduler binding before any source work runs.
 */
export function readArmorAutomaticBinding({
  repoRoot = process.cwd(),
  relativePath,
  bindingPath,
  now = new Date().toISOString(),
  expectedAttemptId,
  expectedSourceDispatchIdentity,
  expectedActionId = ARMOR_AUTOMATIC_ACTION_ID,
  expectedOperationId = ARMOR_AUTOMATIC_OPERATION_ID,
} = {}) {
  const requestedPath = relativePath ?? bindingPath;
  const normalizedPath = requireCanonicalRelativePath(requestedPath, 'Armor automatic binding path');
  const absolutePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, normalizedPath),
    label: 'Armor automatic binding',
  });
  assertPrivateFile(absolutePath, 'Armor automatic binding');
  let binding;
  try {
    binding = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Armor automatic binding must be valid JSON: ${error.message}`);
  }
  return assertArmorAutomaticBinding({
    repoRoot,
    binding,
    bindingPath: normalizedPath,
    now,
    expectedAttemptId,
    expectedSourceDispatchIdentity,
    expectedActionId,
    expectedOperationId,
  });
}

/**
 * Validate a parsed binding and every immutable artifact it names.
 * The function also accepts `assertArmorAutomaticBinding(binding, options)` for
 * small callers that already parsed the JSON envelope.
 */
export function assertArmorAutomaticBinding(options = {}, legacyOptions = {}) {
  const config = options?.schemaVersion
    ? { ...legacyOptions, binding: options }
    : options;
  const {
    repoRoot = process.cwd(),
    binding,
    bindingPath = null,
    now = new Date().toISOString(),
    expectedAttemptId,
    expectedSourceDispatchIdentity,
    expectedActionId = ARMOR_AUTOMATIC_ACTION_ID,
    expectedOperationId = ARMOR_AUTOMATIC_OPERATION_ID,
  } = config;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error('Armor automatic binding must be an object');
  }
  if (binding.schemaVersion !== ARMOR_AUTOMATIC_DISPATCH_BINDING_SCHEMA) {
    throw new Error('Armor automatic binding schema is invalid');
  }
  if (binding.actionId !== expectedActionId) {
    throw new Error('Armor automatic binding action identity does not match');
  }
  if (binding.operationId !== expectedOperationId) {
    throw new Error('Armor automatic binding operation identity does not match');
  }
  if (typeof binding.attemptId !== 'string' || !ATTEMPT_ID_PATTERN.test(binding.attemptId)) {
    throw new Error('Armor automatic binding attempt identity is invalid');
  }
  if (expectedAttemptId != null && binding.attemptId !== expectedAttemptId) {
    throw new Error('Armor automatic binding attempt identity does not match');
  }

  const source = assertSourceDispatchIdentity(binding.sourceDispatchIdentity);
  if (expectedSourceDispatchIdentity != null) {
    const expected = assertSourceDispatchIdentity(expectedSourceDispatchIdentity);
    for (const field of ['sourceFingerprint', 'sourceRunIdentity', 'sourceContentIdentity']) {
      if (source[field] !== expected[field]) {
        throw new Error(`Armor automatic source ${field} drifted from the dispatch identity`);
      }
    }
  }

  const resultLabel = requireResultLabel(binding.resultLabel);
  const createdAt = requireTimestamp(binding.createdAt, 'Armor automatic binding createdAt');
  const expiresAt = requireTimestamp(binding.expiresAt, 'Armor automatic binding expiresAt');
  const verificationTime = requireTimestamp(now, 'Armor automatic binding verification time');
  if (Date.parse(createdAt) >= Date.parse(expiresAt)) {
    throw new Error('Armor automatic binding expiry must be after createdAt');
  }
  if (Date.parse(verificationTime) >= Date.parse(expiresAt)) {
    throw new Error('Armor automatic binding is expired');
  }
  if (binding.consumedAt !== null) {
    throw new Error('Armor automatic binding has already been consumed');
  }

  const intent = assertIntentArtifact({
    repoRoot,
    value: binding.intent,
    resultLabel,
    operationId: expectedOperationId,
  });
  const authorization = assertAuthorizationArtifacts({
    repoRoot,
    value: binding.authorization,
    attemptId: binding.attemptId,
  });
  const localProjection = intent.parsedIntent?.localProjection;
  if (!localProjection || typeof localProjection !== 'object' || Array.isArray(localProjection)
      || localProjection.schemaVersion !== 'armor-canonical-local-projection/v1'
      || !HASH_PATTERN.test(localProjection.candidateSha256 ?? '')) {
    throw new Error('Armor automatic full-chain intent requires a valid local projection');
  }
  const packet = authorization.packet;
  if (packet.operationId !== expectedOperationId || packet.decisionIdentity !== binding.authorization.decisionIdentity
      || packet.policySetHash !== authorization.policySetHash
      || packet.executionManifest?.resultLabel !== resultLabel) {
    throw new Error('Armor automatic full-chain packet identity drifted from its binding');
  }
  const operationBinding = authorization.packet?.executionManifest?.armorCanonicalIntent;
  if (!operationBinding || operationBinding.fullChainSha256 !== intent.parsedIntent.fullChainSha256
      || operationBinding.intentFileSha256 !== binding.intent.sha256
      || operationBinding.intentPath !== binding.intent.path) {
    throw new Error('Armor automatic full-chain authorization does not bind the local projection intent');
  }
  validateArmorCanonicalFenceCommit(operationBinding.fenceCommit, {
    runId: operationBinding.runId,
    environmentId: 'local',
  });
  const packetAuthorizedAt = requireTimestamp(authorization.packet.authorizedAt, 'Armor authorization packet authorizedAt');
  const packetExpiresAt = requireTimestamp(authorization.packet.expiresAt, 'Armor authorization packet expiresAt');
  if (Date.parse(packetAuthorizedAt) > Date.parse(verificationTime)) {
    throw new Error('Armor automatic authorization packet is not active yet');
  }
  if (Date.parse(verificationTime) >= Date.parse(packetExpiresAt)) {
    throw new Error('Armor automatic authorization packet is expired');
  }
  if (Date.parse(expiresAt) > Date.parse(packetExpiresAt)) {
    throw new Error('Armor automatic binding outlives the authorization packet');
  }
  if (packetExpiresAt !== operationBinding.fenceCommit.expiresAt) {
    throw new Error('Armor automatic full-chain fence expiry drifted from the authorization packet');
  }
  if (operationBinding.fenceCommit.bindings.some(fence => fence.expiresAt !== operationBinding.fenceCommit.expiresAt)) {
    throw new Error('Armor automatic full-chain fence expiry drifted');
  }
  const activation = assertActivation(binding.activation, verificationTime, expiresAt);
  if (authorization.policySetHash !== activation.policySetHash) {
    throw new Error('Armor automatic authorization policy set drifted from activation');
  }
  if (binding.createdAt > activation.authorizedAt) {
    throw new Error('Armor automatic binding was created after its activation');
  }

  if (bindingPath != null) {
    const normalizedBindingPath = normalizeBindingPath({
      repoRoot,
      bindingPath,
      label: 'Armor automatic binding path',
    });
    const expectedBindingPath = buildArmorAutomaticBindingPath(source);
    if (normalizedBindingPath !== expectedBindingPath) {
      throw new Error('Armor automatic binding path does not match source fingerprint');
    }
  }

  const resultPath = `reports/authorization/canonical/${expectedOperationId}.${resultLabel}.result.json`;
  const journalPath = `reports/authorization/canonical/${expectedOperationId}.${resultLabel}.journal.json`;
  assertAbsentArtifact(repoRoot, resultPath, 'Armor automatic canonical result');
  assertAbsentArtifact(repoRoot, journalPath, 'Armor automatic canonical journal');

  return Object.freeze(binding);
}

function normalizeBindingPath({ repoRoot, bindingPath, label }) {
  if (typeof bindingPath !== 'string' || !bindingPath) {
    throw new Error(`${label} is required`);
  }
  if (path.isAbsolute(bindingPath)) {
    const root = path.resolve(repoRoot);
    const absolute = path.resolve(bindingPath);
    const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
    if (!relative || relative.startsWith('../') || relative === '..' || path.isAbsolute(relative)) {
      throw new Error(`${label} must remain inside the repository root`);
    }
    return requireCanonicalRelativePath(relative, label);
  }
  return requireCanonicalRelativePath(bindingPath, label);
}

function assertSourceDispatchIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !HASH_PATTERN.test(value.sourceFingerprint ?? '')
      || !SOURCE_RUN_ID_PATTERN.test(value.sourceRunIdentity ?? '')
      || !HASH_PATTERN.test(value.sourceContentIdentity ?? '')) {
    throw new Error('Armor automatic source dispatch identity is invalid');
  }
  return {
    sourceFingerprint: value.sourceFingerprint,
    sourceRunIdentity: value.sourceRunIdentity,
    sourceContentIdentity: value.sourceContentIdentity,
  };
}

function assertIntentArtifact({ repoRoot, value, resultLabel, operationId }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !HASH_PATTERN.test(value.sha256 ?? '')
      || !HASH_PATTERN.test(value.fullChainSha256 ?? '')) {
    throw new Error('Armor automatic intent binding is invalid');
  }
  const expectedPath = `reports/authorization/canonical/${operationId}.${resultLabel}.intent.json`;
  if (requireCanonicalRelativePath(value.path, 'Armor automatic intent path') !== expectedPath) {
    throw new Error('Armor automatic intent path does not match operation and result label');
  }
  const bytes = readHashedPrivateArtifact({
    repoRoot,
    relativePath: value.path,
    expectedHash: value.sha256,
    label: 'Armor automatic intent',
  });
  let intent;
  try {
    intent = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Armor automatic intent must be valid JSON: ${error.message}`);
  }
  if (intent?.schemaVersion !== 'armor-canonical-full-chain-intent/v2'
      || intent.operationId !== operationId
      || intent.executable !== false
      || typeof intent.fullChainSha256 !== 'string'
      || intent.fullChainSha256 !== value.fullChainSha256
      || !HASH_PATTERN.test(intent.fullChainSha256)) {
    throw new Error('Armor automatic intent full-chain hash or identity drifted');
  }
  if (!intent.localProjection || typeof intent.localProjection !== 'object' || Array.isArray(intent.localProjection)
      || intent.localProjection.schemaVersion !== 'armor-canonical-local-projection/v1'
      || !HASH_PATTERN.test(intent.localProjection.candidateSha256 ?? '')) {
    throw new Error('Armor automatic full-chain intent requires a valid local projection');
  }
  return Object.freeze({ ...value, parsedIntent: intent });
}

function assertAuthorizationArtifacts({ repoRoot, value, attemptId }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !HASH_PATTERN.test(value.packetSha256 ?? '')
      || !HASH_PATTERN.test(value.permitHash ?? '')
      || !HASH_PATTERN.test(value.serverFingerprintSha256 ?? '')
      || !HASH_PATTERN.test(value.policySetHash ?? '')
      || !nonEmptyToken(value.nonce)
      || !nonEmptyToken(value.decisionIdentity)) {
    throw new Error('Armor automatic authorization binding is invalid');
  }
  const expectedRoot = `reports/authorization/canonical/${attemptId}/`;
  const packetPath = requireCanonicalRelativePath(value.packetPath, 'Armor automatic packet path');
  const permitPath = requireCanonicalRelativePath(value.permitPath, 'Armor automatic permit path');
  const fingerprintPath = requireCanonicalRelativePath(
    value.serverFingerprintPath,
    'Armor automatic server fingerprint path',
  );
  if (packetPath !== `${expectedRoot}packet.json`
      || permitPath !== `${expectedRoot}permit.json`
      || fingerprintPath !== `${expectedRoot}server-fingerprint.json`) {
    throw new Error('Armor automatic authorization paths must be bound to the attempt');
  }
  const packetBytes = readHashedPrivateArtifact({ repoRoot, relativePath: packetPath,
    expectedHash: value.packetSha256, label: 'Armor automatic packet' });
  let packet;
  try { packet = JSON.parse(packetBytes.toString('utf8')); }
  catch { throw new Error('Armor automatic packet must be valid JSON'); }
  readHashedPrivateArtifact({ repoRoot, relativePath: permitPath,
    expectedHash: value.permitHash, label: 'Armor automatic permit' });
  readHashedPrivateArtifact({ repoRoot, relativePath: fingerprintPath,
    expectedHash: value.serverFingerprintSha256, label: 'Armor automatic server fingerprint' });
  return Object.freeze({ ...value, packet });
}

function assertActivation(value, now, bindingExpiresAt) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !nonEmptyToken(value.decisionIdentity)
      || !HASH_PATTERN.test(value.packetHash ?? '')
      || !HASH_PATTERN.test(value.policySetHash ?? '')) {
    throw new Error('Armor automatic scheduler activation is invalid');
  }
  const authorizedAt = requireTimestamp(value.authorizedAt, 'Armor automatic activation authorizedAt');
  const expiresAt = requireTimestamp(value.expiresAt, 'Armor automatic activation expiresAt');
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)
      || Date.parse(now) >= Date.parse(expiresAt)) {
    throw new Error('Armor automatic scheduler activation is expired');
  }
  if (Date.parse(expiresAt) > Date.parse(bindingExpiresAt)) {
    throw new Error('Armor automatic scheduler activation outlives its binding');
  }
  return value;
}

function readHashedPrivateArtifact({ repoRoot, relativePath, expectedHash, label }) {
  const absolutePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label,
  });
  assertPrivateFile(absolutePath, label);
  const bytes = fs.readFileSync(absolutePath);
  if (hashBytes(bytes) !== expectedHash) {
    throw new Error(`${label} bytes drifted from its binding hash`);
  }
  return bytes;
}

function assertAbsentArtifact(repoRoot, relativePath, label) {
  const absolutePath = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label,
  });
  try {
    fs.lstatSync(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; binding cannot be replayed`);
}

function assertPrivateFile(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if ((stat.mode & PRIVATE_MODE_MASK) !== 0) {
    throw new Error(`${label} must be private mode 0600`);
  }
}

function requireCanonicalRelativePath(value, label) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)
      || value.includes('\\') || value.includes('\0')) {
    throw new Error(`${label} must be a canonical repository-relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../') || normalized === '..') {
    throw new Error(`${label} must not contain path traversal`);
  }
  if (normalized.startsWith(ARMOR_AUTOMATIC_BINDING_ROOT)) return normalized;
  if (!normalized.startsWith(CANONICAL_ROOT)) {
    throw new Error(`${label} must remain under reports/authorization/canonical/`);
  }
  return normalized;
}

function requireResultLabel(value) {
  if (typeof value !== 'string' || !RESULT_LABEL_PATTERN.test(value) || value.length > 80) {
    throw new Error('Armor automatic result label is invalid');
  }
  return value;
}

function requireTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return value;
}

function nonEmptyToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/.test(value);
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
