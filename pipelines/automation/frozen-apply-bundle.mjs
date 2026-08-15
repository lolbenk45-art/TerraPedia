import { createHash } from 'node:crypto';
import path from 'node:path';

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MUTABLE_PATH_PATTERN = /(?:^|[/.\\_-])latest(?:[/.\\_-]|$)/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalizeJson(value, label) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error(`${label} contains a sparse array`);
    return value.map((item, index) => canonicalizeJson(item, `${label}[${index}]`));
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must contain plain JSON values only`);
  }
  return Object.fromEntries(Object.keys(value).sort(compareUtf8).map((key) => [
    key,
    canonicalizeJson(value[key], `${label}.${key}`),
  ]));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function contentHash(content) {
  return `sha256:${createHash('sha256').update(JSON.stringify(content), 'utf8').digest('hex')}`;
}

function assertPositiveSchemaVersion(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} schemaVersion must be a positive integer`);
  }
}

function assertHash(value, label) {
  if (!SHA256_PATTERN.test(value ?? '')) {
    throw new Error(`${label} must be a sha256 hash`);
  }
}

function canonicalKeys(keys, label) {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' || key.length === 0)) {
    throw new Error(`${label} must be an array of non-empty logical keys`);
  }
  const unique = new Set(keys);
  if (unique.size !== keys.length) {
    throw new Error(`${label} contains duplicate logical keys`);
  }
  return [...unique].sort(compareUtf8);
}

function canonicalizeDiff(diff) {
  assertPositiveSchemaVersion(diff?.schemaVersion, 'diff');
  assertHash(diff?.baselineFingerprint, 'baselineFingerprint');
  if (!Array.isArray(diff.scopes) || diff.scopes.length === 0) {
    throw new Error('diff scopes must not be empty');
  }
  const seenScopes = new Set();
  const scopes = diff.scopes.map((scope) => {
    if (!scope || typeof scope.scopeId !== 'string' || scope.scopeId.length === 0) {
      throw new Error('scopeId must be a non-empty string');
    }
    if (seenScopes.has(scope.scopeId)) {
      throw new Error(`duplicate scopeId: ${scope.scopeId}`);
    }
    seenScopes.add(scope.scopeId);
    if (!Number.isSafeInteger(scope.baselineCount) || scope.baselineCount < 0) {
      throw new Error(`baselineCount must be a non-negative integer for ${scope.scopeId}`);
    }
    const insertedKeys = canonicalKeys(scope.insertedKeys, `${scope.scopeId}.insertedKeys`);
    const updatedKeys = canonicalKeys(scope.updatedKeys, `${scope.scopeId}.updatedKeys`);
    const deletedKeys = canonicalKeys(scope.deletedKeys, `${scope.scopeId}.deletedKeys`);
    const allKeys = [...insertedKeys, ...updatedKeys, ...deletedKeys];
    if (new Set(allKeys).size !== allKeys.length) {
      throw new Error(`${scope.scopeId} contains duplicate logical keys across change types`);
    }
    return {
      scopeId: scope.scopeId,
      baselineCount: scope.baselineCount,
      insertedKeys,
      updatedKeys,
      deletedKeys,
      insertCount: insertedKeys.length,
      updateCount: updatedKeys.length,
      deleteCount: deletedKeys.length,
    };
  }).sort((left, right) => compareUtf8(left.scopeId, right.scopeId));
  return { schemaVersion: diff.schemaVersion, baselineFingerprint: diff.baselineFingerprint, scopes };
}

function canonicalizeSourceArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('sourceArtifacts must not be empty');
  }
  const seenPaths = new Set();
  return artifacts.map((artifact) => {
    assertPositiveSchemaVersion(artifact?.schemaVersion, 'source artifact');
    if (typeof artifact.path !== 'string' || artifact.path.length === 0) {
      throw new Error('source artifact path is required');
    }
    if (MUTABLE_PATH_PATTERN.test(artifact.path)) {
      throw new Error('latest path references are forbidden');
    }
    if (URI_SCHEME_PATTERN.test(artifact.path) || artifact.path.startsWith('//')) {
      throw new Error('network or URI source artifact paths are forbidden');
    }
    if (artifact.path.includes('\\') || path.posix.isAbsolute(artifact.path)
        || path.posix.normalize(artifact.path) !== artifact.path
        || artifact.path.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
      throw new Error('source artifact path must be a normalized private-root relative path');
    }
    if (seenPaths.has(artifact.path)) {
      throw new Error(`duplicate source artifact path: ${artifact.path}`);
    }
    seenPaths.add(artifact.path);
    const content = canonicalizeJson(artifact.content, `source artifact ${artifact.path} content`);
    const derivedHash = contentHash(content);
    if (artifact.contentHash !== undefined && artifact.contentHash !== derivedHash) {
      throw new Error(`source artifact content hash mismatch: ${artifact.path}`);
    }
    return {
      path: artifact.path,
      schemaVersion: artifact.schemaVersion,
      contentHash: derivedHash,
      contentSizeBytes: Buffer.byteLength(JSON.stringify(content), 'utf8'),
      content,
    };
  }).sort((left, right) => compareUtf8(left.path, right.path));
}

function canonicalizeInput(input) {
  assertPositiveSchemaVersion(input?.schemaVersion, 'bundle');
  if (typeof input.runId !== 'string' || input.runId.length === 0) throw new Error('runId is required');
  if (typeof input.plannedApplyActionId !== 'string' || input.plannedApplyActionId.length === 0) {
    throw new Error('plannedApplyActionId is required');
  }
  assertHash(input.policySetHash, 'policySetHash');
  if (input.instructions?.mode !== 'apply-frozen') throw new Error('bundle mode must be apply-frozen');
  if (input.instructions.allowNetwork !== false) throw new Error('network access must be disabled');
  if (input.instructions.allowRenormalize !== false) throw new Error('re-normalization must be disabled');
  return {
    schemaVersion: input.schemaVersion,
    runId: input.runId,
    plannedApplyActionId: input.plannedApplyActionId,
    policySetHash: input.policySetHash,
    sourceArtifacts: canonicalizeSourceArtifacts(input.sourceArtifacts),
    diff: canonicalizeDiff(input.diff),
    instructions: { mode: 'apply-frozen', allowNetwork: false, allowRenormalize: false },
  };
}

function hashBundle(bundle) {
  return `sha256:${createHash('sha256').update(JSON.stringify(bundle), 'utf8').digest('hex')}`;
}

export function createFrozenApplyBundle(input) {
  const bundle = canonicalizeInput(input);
  return deepFreeze({ bundle, bundleHash: hashBundle(bundle) });
}

export function verifyFrozenApplyBundle(envelope) {
  if (!envelope || typeof envelope !== 'object') throw new Error('bundle envelope is required');
  const canonical = canonicalizeInput(envelope.bundle);
  const actualHash = hashBundle(canonical);
  if (actualHash !== envelope.bundleHash || JSON.stringify(canonical) !== JSON.stringify(envelope.bundle)) {
    throw new Error('bundle hash or canonical content mismatch');
  }
  return true;
}
