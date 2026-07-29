#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import { assertCanonicalOperationExecutionManifestContract } from './canonical-operation-execution-manifest.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';

export {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
};

const OPERATION_ID_SET = new Set(CANONICAL_CUTOVER_OPERATION_IDS);
const FORMAL_DATABASES = Object.freeze(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAX_REQUEST_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REQUIRED_TECHNICAL_FIELDS = Object.freeze([
  'serverFingerprint',
  'schemaBundleSha256',
  'dataBundleSha256',
  'policySetHash',
]);
const EXECUTABLE_REQUIRED_TECHNICAL_FIELDS = Object.freeze([
  ...DEFAULT_REQUIRED_TECHNICAL_FIELDS,
  'executionManifestHash',
]);
const BOOTSTRAP_REQUIRED_TECHNICAL_FIELDS = Object.freeze([
  'serverFingerprint',
  'schemaBundleSha256',
  'dataBundleSha256',
  'executionManifestHash',
]);

export function hashOrderedBundleBytes(entries, label = 'bundle') {
  if (!Array.isArray(entries)) throw new TypeError(`${label} entries must be an array`);
  const hash = createHash('sha256');
  const seen = new Set();
  hash.update(`terrapedia-ordered-bundle-v1\n${entries.length}\n`, 'utf8');
  for (const entry of entries) {
    const entryPath = requireNormalizedPath(entry?.path, `${label} path`);
    if (seen.has(entryPath)) throw new Error(`${label} contains duplicate path: ${entryPath}`);
    seen.add(entryPath);
    const bytes = toBuffer(entry?.bytes, `${label} ${entryPath} bytes`);
    hash.update(`${Buffer.byteLength(entryPath, 'utf8')}:`, 'utf8');
    hash.update(entryPath, 'utf8');
    hash.update(`:${bytes.length}:`, 'utf8');
    hash.update(bytes);
    hash.update('\n', 'utf8');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function buildCanonicalAuthorizationRequest(input = {}) {
  const generatedAt = requireTimestamp(input.generatedAt, 'generatedAt');
  const expiresAt = requireTimestamp(input.expiresAt, 'expiresAt');
  assertBoundedExpiry(generatedAt, expiresAt);
  const technical = deriveTechnicalIdentity(input);
  const payload = {
    schemaVersion: 1,
    requestKind: 'canonical_cutover_authorization',
    authorizationStatus: 'AWAITING_OWNER',
    generatedAt,
    expiresAt,
    ...technical,
    actor: null,
    reason: null,
    authorizationReference: null,
    decisionIdentity: null,
    missingTechnicalFields: missingTechnicalFields(technical),
    missingOwnerFields: ['actor', 'reason', 'authorizationReference', 'decisionIdentity'],
  };
  return Object.freeze({ ...payload, requestHash: hashJson(payload) });
}

export function authorizeCanonicalCutoverRequest({
  request,
  requestHash,
  actor,
  reason,
  authorizationReference,
  decisionIdentity,
  authorizedAt = new Date().toISOString(),
  currentTechnicalInput,
  usedDecisionIdentities = new Set(),
} = {}) {
  verifyRequestEnvelope(request, requestHash);
  if (request.missingTechnicalFields.length > 0) {
    throw new Error(`authorization request technical identity is incomplete: ${request.missingTechnicalFields.join(', ')}`);
  }
  const owner = {
    actor: requireText(actor, 'actor'),
    reason: requireText(reason, 'reason'),
    authorizationReference: requireText(authorizationReference, 'authorization reference'),
    decisionIdentity: requireText(decisionIdentity, 'decision identity'),
  };
  if (!(usedDecisionIdentities instanceof Set)) {
    throw new TypeError('used decision identities must be a Set');
  }
  if (usedDecisionIdentities.has(owner.decisionIdentity)) {
    throw new Error(`decision identity is already used: ${owner.decisionIdentity}`);
  }
  const authorizationTime = requireTimestamp(authorizedAt, 'authorizedAt');
  if (Date.parse(authorizationTime) < Date.parse(request.generatedAt)) {
    throw new Error('authorization timestamp cannot be before the request was generated');
  }
  if (Date.parse(authorizationTime) >= Date.parse(request.expiresAt)) {
    throw new Error('authorization request is expired');
  }

  const current = deriveTechnicalIdentity(currentTechnicalInput ?? {});
  assertTechnicalIdentityMatches(request, current);

  const payload = {
    ...request,
    authorizationStatus: 'AUTHORIZED',
    authorizedAt: authorizationTime,
    ...owner,
    missingOwnerFields: [],
    requestHash,
  };
  return Object.freeze({ ...payload, packetHash: hashJson(payload) });
}

export function verifyCanonicalAuthorizationPacketAgainstCurrent({
  packet,
  currentTechnicalInput,
  now = new Date().toISOString(),
} = {}) {
  verifyCanonicalAuthorizationPacket(packet);
  const verificationTime = requireTimestamp(now, 'verification time');
  if (Date.parse(verificationTime) >= Date.parse(packet.expiresAt)) {
    throw new Error('authorized packet is expired');
  }
  const current = deriveTechnicalIdentity(currentTechnicalInput ?? {});
  assertTechnicalIdentityMatches(packet, current);
  return true;
}

function assertTechnicalIdentityMatches(expected, current) {
  for (const [field, label] of [
    ['operationId', 'operation'],
    ['targetDatabases', 'target databases'],
    ['serverFingerprint', 'server fingerprint'],
    ['schemaBundleSha256', 'schema bundle'],
    ['dataBundleSha256', 'data bundle'],
    ['policySetHash', 'policy set'],
    ['executionManifestHash', 'execution manifest'],
    ['requiredTechnicalFields', 'required technical fields'],
  ]) {
    if (JSON.stringify(current[field]) !== JSON.stringify(expected[field])) {
      throw new Error(`${label} drifted after the authorization request was created`);
    }
  }
}

export function verifyCanonicalAuthorizationPacket(packet) {
  if (!packet || packet.authorizationStatus !== 'AUTHORIZED') {
    throw new Error('authorized canonical cutover packet is required');
  }
  if (!HASH_PATTERN.test(packet.packetHash ?? '')) throw new Error('packet hash is invalid');
  const { packetHash, ...payload } = packet;
  if (hashJson(payload) !== packetHash) throw new Error('packet hash or content mismatch');
  verifyRequestEnvelope(packet, packet.requestHash);
  if (packet.missingTechnicalFields?.length || packet.missingOwnerFields?.length) {
    throw new Error('authorized packet cannot contain missing fields');
  }
  requireText(packet.actor, 'actor');
  requireText(packet.reason, 'reason');
  requireText(packet.authorizationReference, 'authorization reference');
  requireText(packet.decisionIdentity, 'decision identity');
  requireTimestamp(packet.authorizedAt, 'authorizedAt');
  if (Date.parse(packet.authorizedAt) >= Date.parse(packet.expiresAt)) {
    throw new Error('authorized packet is expired');
  }
  return true;
}

export function buildCanonicalAuthorizationRequestForOperation({
  repoRoot = process.cwd(),
  operationId,
  serverFingerprint = null,
  policyRows = [],
  executionManifest = null,
  generatedAt = new Date().toISOString(),
  expiresAt = new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString(),
} = {}) {
  return buildCanonicalAuthorizationRequest({
    ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId, executionManifest }),
    serverFingerprint,
    policyRows,
    generatedAt,
    expiresAt,
  });
}

export function resolveCanonicalOperationTechnicalInput({ repoRoot, operationId, executionManifest = null }) {
  requireOperationId(operationId);
  const root = path.resolve(repoRoot);
  const verifiedExecutionManifest = executionManifest == null
    ? null
    : verifyExecutionManifestCodeBundle(root, executionManifest, operationId);
  const schemaEntries = operationId === 'canonical-schema-v56-v58'
    ? readMigrationEntries(root)
    : [];
  let dataEntries = readCompleteEntries(root, CANONICAL_OPERATION_DATA_PATHS[operationId]);
  if (operationId === 'canonical-npc-apply' || operationId.startsWith('canonical-npc-') && operationId.endsWith('-apply')) {
    const crawlerEntries = readNpcCrawlerEntries(root);
    dataEntries = dataEntries === null || crawlerEntries === null
      ? null
      : dataEntries.concat(crawlerEntries);
  }
  return {
    operationId,
    targetDatabases: [...FORMAL_DATABASES],
    schemaEntries,
    dataEntries,
    executionManifest: verifiedExecutionManifest,
    requiredTechnicalFields: operationId === 'automation-biomes-l0-bootstrap'
      ? [...BOOTSTRAP_REQUIRED_TECHNICAL_FIELDS]
      : [...EXECUTABLE_REQUIRED_TECHNICAL_FIELDS],
  };
}

function verifyExecutionManifestCodeBundle(repoRoot, manifest, operationId) {
  const normalized = requireExecutionManifest(manifest);
  if (!Number.isSafeInteger(normalized.schemaVersion) || normalized.schemaVersion < 1) {
    throw new Error('execution manifest schemaVersion must be a positive integer');
  }
  if (normalized.operationId !== operationId) {
    throw new Error(`execution manifest operationId must be ${operationId}`);
  }
  if (!Array.isArray(normalized.command) || normalized.command.length < 2
      || normalized.command.some((part) => typeof part !== 'string' || !part.trim())) {
    throw new Error('execution manifest command must contain at least two non-empty strings');
  }
  if (!Array.isArray(normalized.codeBundleEntries) || normalized.codeBundleEntries.length === 0) {
    throw new Error('execution manifest code bundle entries are required');
  }
  const commandEntrypoint = requireNormalizedPath(
    normalized.command[1],
    'execution manifest command entrypoint',
  );
  const expectedEntrypoint = CANONICAL_OPERATION_ENTRYPOINTS[operationId];
  if (expectedEntrypoint === null) {
    throw new Error(`no governed executor is registered for operation: ${operationId}`);
  }
  if (commandEntrypoint !== expectedEntrypoint) {
    throw new Error(`execution manifest entrypoint must be ${expectedEntrypoint}`);
  }
  const declaredCodePaths = normalized.codeBundleEntries.map((entry) => (
    requireNormalizedPath(entry?.path, 'execution manifest code bundle path')
  ));
  if (!declaredCodePaths.includes(commandEntrypoint)) {
    throw new Error('execution manifest command entrypoint must be present in the code bundle');
  }
  const seen = new Set();
  for (const entry of normalized.codeBundleEntries) {
    const entryPath = requireNormalizedPath(entry?.path, 'execution manifest code bundle path');
    if (seen.has(entryPath)) throw new Error(`execution manifest code bundle contains duplicate path: ${entryPath}`);
    seen.add(entryPath);
    if (!HASH_PATTERN.test(entry?.contentHash ?? '')) {
      throw new Error(`execution manifest code bundle hash is invalid: ${entryPath}`);
    }
    const fullPath = path.join(repoRoot, entryPath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      throw new Error(`execution manifest code bundle file is missing: ${entryPath}`);
    }
    const actual = `sha256:${createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')}`;
    if (actual !== entry.contentHash) {
      throw new Error(`execution manifest code bundle hash mismatch: ${entryPath}`);
    }
  }
  assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest: normalized });
  return normalized;
}

function deriveTechnicalIdentity(input) {
  const operationId = requireOperationId(input.operationId);
  const targetDatabases = requireFormalDatabases(input.targetDatabases);
  const requiredTechnicalFields = requireTechnicalFields(
    input.requiredTechnicalFields ?? DEFAULT_REQUIRED_TECHNICAL_FIELDS,
  );
  return {
    operationId,
    targetDatabases,
    serverFingerprint: input.serverFingerprint == null
      ? null
      : hashJson(canonicalServerFingerprint(input.serverFingerprint)),
    schemaBundleSha256: input.schemaEntries == null
      ? null
      : hashOrderedBundleBytes(input.schemaEntries, 'schema bundle'),
    schemaBundleEntries: input.schemaEntries == null
      ? null
      : summarizeBundleEntries(input.schemaEntries, 'schema bundle'),
    dataBundleSha256: input.dataEntries == null
      ? null
      : hashOrderedBundleBytes(input.dataEntries, 'data bundle'),
    dataBundleEntries: input.dataEntries == null
      ? null
      : summarizeBundleEntries(input.dataEntries, 'data bundle'),
    policySetHash: Array.isArray(input.policyRows) && input.policyRows.length > 0
      ? computePolicySetHash(input.policyRows)
      : null,
    executionManifestHash: input.executionManifest == null
      ? null
      : hashJson(requireExecutionManifest(input.executionManifest)),
    executionManifest: input.executionManifest == null
      ? null
      : requireExecutionManifest(input.executionManifest),
    requiredTechnicalFields,
  };
}

function summarizeBundleEntries(entries, label) {
  const seen = new Set();
  return entries.map((entry) => {
    const entryPath = requireNormalizedPath(entry?.path, `${label} path`);
    if (seen.has(entryPath)) throw new Error(`${label} contains duplicate path: ${entryPath}`);
    seen.add(entryPath);
    const bytes = toBuffer(entry?.bytes, `${label} ${entryPath} bytes`);
    return {
      path: entryPath,
      sizeBytes: bytes.length,
      contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    };
  });
}

function canonicalServerFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('server fingerprint is invalid');
  }
  const databases = requireFormalDatabases(value.databases);
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('server fingerprint port is invalid');
  }
  return {
    host: requireText(value.host, 'server fingerprint host'),
    port,
    serverUuid: requireText(value.serverUuid, 'server fingerprint UUID'),
    databases,
  };
}

function missingTechnicalFields(technical) {
  return technical.requiredTechnicalFields
    .filter((field) => !HASH_PATTERN.test(technical[field] ?? ''));
}

function requireTechnicalFields(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('required technical fields must be a non-empty array');
  }
  const allowed = new Set([...DEFAULT_REQUIRED_TECHNICAL_FIELDS, 'executionManifestHash']);
  const fields = value.map((field) => requireText(field, 'required technical field'));
  if (new Set(fields).size !== fields.length || fields.some((field) => !allowed.has(field))) {
    throw new Error('required technical fields contain duplicate or unsupported values');
  }
  return fields;
}

function requireExecutionManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('execution manifest must be an object');
  }
  return stableValue(value);
}

function verifyRequestEnvelope(request, requestHash) {
  if (!request || typeof request !== 'object') throw new Error('authorization request is required');
  if (request.authorizationStatus !== 'AWAITING_OWNER' && request.authorizationStatus !== 'AUTHORIZED') {
    throw new Error('authorization request status is invalid');
  }
  if (!HASH_PATTERN.test(requestHash ?? '') || request.requestHash !== requestHash) {
    throw new Error('authorization request hash is missing or mismatched');
  }
  const { requestHash: embeddedHash, packetHash, authorizedAt, ...rest } = request;
  const requestPayload = request.authorizationStatus === 'AUTHORIZED'
    ? {
        ...rest,
        authorizationStatus: 'AWAITING_OWNER',
        actor: null,
        reason: null,
        authorizationReference: null,
        decisionIdentity: null,
        missingOwnerFields: ['actor', 'reason', 'authorizationReference', 'decisionIdentity'],
      }
    : rest;
  delete requestPayload.packetHash;
  if (hashJson(requestPayload) !== embeddedHash) {
    throw new Error('authorization request hash or content mismatch');
  }
  requireTimestamp(request.generatedAt, 'generatedAt');
  requireTimestamp(request.expiresAt, 'expiresAt');
}

function readMigrationEntries(repoRoot) {
  const dir = path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration');
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^V5[678]__.*\.sql$/.test(name)).sort()
    : [];
  if (names.length !== 3 || !names[0].startsWith('V56__') || !names[1].startsWith('V57__')
      || !names[2].startsWith('V58__')) {
    throw new Error('canonical schema request requires exact V56, V57, and V58 migration bytes');
  }
  return names.map((name) => readEntry(repoRoot, `back/src/main/resources/db/migration/${name}`));
}

function readRequiredEntries(repoRoot, relativePaths) {
  return relativePaths.map((relativePath) => readEntry(repoRoot, relativePath));
}

function readCompleteEntries(repoRoot, relativePaths) {
  if (!Array.isArray(relativePaths)) return null;
  if (relativePaths.some((relativePath) => {
    const fullPath = path.join(repoRoot, requireNormalizedPath(relativePath, 'bundle path'));
    return !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile();
  })) return null;
  return readRequiredEntries(repoRoot, relativePaths);
}

function readNpcCrawlerEntries(repoRoot) {
  const inputPath = 'reports/authorization/canonical/canonical-npc-apply.input.json';
  const fullInputPath = path.join(repoRoot, inputPath);
  if (!fs.existsSync(fullInputPath) || !fs.statSync(fullInputPath).isFile()) return null;
  const input = JSON.parse(fs.readFileSync(fullInputPath, 'utf8'));
  if (input?.schemaVersion !== 1 || input?.operationId !== 'canonical-npc-apply'
      || input?.pairCount !== 25 || !Array.isArray(input?.evidencePairs)
      || input.evidencePairs.length !== 25) {
    throw new Error('canonical NPC apply input must contain exactly 25 frozen evidence pairs');
  }
  const summaries = [input.targetManifest];
  const seenEntityIds = new Set();
  for (const pair of input.evidencePairs) {
    const entityId = requireText(pair?.entityId, 'NPC apply evidence entityId');
    if (seenEntityIds.has(entityId)) throw new Error(`NPC apply evidence entityId is duplicated: ${entityId}`);
    seenEntityIds.add(entityId);
    summaries.push(pair?.normalized, pair?.audit);
  }
  const seenPaths = new Set();
  return summaries.map((summary) => {
    const relativePath = requireNormalizedPath(summary?.path, 'NPC apply evidence path');
    if (seenPaths.has(relativePath)) throw new Error(`NPC apply evidence path is duplicated: ${relativePath}`);
    seenPaths.add(relativePath);
    const entry = readEntry(repoRoot, relativePath);
    const contentHash = `sha256:${createHash('sha256').update(entry.bytes).digest('hex')}`;
    if (summary?.contentHash !== contentHash || Number(summary?.sizeBytes) !== entry.bytes.length) {
      throw new Error(`NPC apply evidence file drifted: ${relativePath}`);
    }
    return entry;
  });
}

function readEntry(repoRoot, relativePath) {
  const normalized = requireNormalizedPath(relativePath, 'bundle path');
  const fullPath = path.join(repoRoot, normalized);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`required bundle file is missing: ${normalized}`);
  }
  return { path: normalized, bytes: fs.readFileSync(fullPath) };
}

function requireFormalDatabases(value) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error(`target databases must be exactly: ${FORMAL_DATABASES.join(', ')}`);
  }
  return [...value];
}

function requireOperationId(value) {
  const operationId = requireText(value, 'operationId');
  if (!OPERATION_ID_SET.has(operationId)) throw new Error(`unsupported operationId: ${operationId}`);
  return operationId;
}

function requireNormalizedPath(value, label) {
  const text = requireText(value, label);
  if (text.includes('\\') || path.posix.isAbsolute(text) || path.posix.normalize(text) !== text
      || text.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  return text;
}

function toBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError(`${label} must be bytes or a string`);
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

function assertBoundedExpiry(generatedAt, expiresAt) {
  const lifetime = Date.parse(expiresAt) - Date.parse(generatedAt);
  if (lifetime <= 0 || lifetime > MAX_REQUEST_LIFETIME_MS) {
    throw new Error('authorization request expiry must be future and bounded to seven days');
  }
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

function readOptionalJson(filePath) {
  if (!filePath) return null;
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJsonAtomic(filePath, payload) {
  const output = path.resolve(filePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, output);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? 'request';
  const operationId = args['operation-id'];
  const output = requireText(args.output, 'output');
  const serverFingerprint = readOptionalJson(args['server-fingerprint']);
  const policyRows = readOptionalJson(args['policy-rows']) ?? [];
  const executionManifest = readOptionalJson(args['execution-manifest']);
  if (mode === 'request') {
    const generatedAt = args['generated-at'] ?? new Date().toISOString();
    const request = buildCanonicalAuthorizationRequestForOperation({
      repoRoot: args['repo-root'] ?? process.cwd(),
      operationId,
      serverFingerprint,
      policyRows,
      executionManifest,
      generatedAt,
      expiresAt: args['expires-at'] ?? new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString(),
    });
    writeJsonAtomic(output, request);
    process.stdout.write(`${JSON.stringify({ output: path.resolve(output), requestHash: request.requestHash, authorizationStatus: request.authorizationStatus })}\n`);
    return;
  }
  if (mode !== 'authorize') throw new Error('mode must be request or authorize');
  const request = readOptionalJson(requireText(args.request, 'request'));
  const owner = readOptionalJson(requireText(args['owner-input'], 'owner input'));
  const used = readOptionalJson(requireText(args['used-decisions'], 'used decisions'));
  if (!Array.isArray(used)) throw new Error('used decisions must be a JSON array');
  const packet = authorizeCanonicalCutoverRequest({
    request,
    requestHash: requireText(args['request-hash'], 'request hash'),
    ...owner,
    currentTechnicalInput: {
      ...resolveCanonicalOperationTechnicalInput({
        repoRoot: args['repo-root'] ?? process.cwd(),
        operationId: request.operationId,
        executionManifest,
      }),
      serverFingerprint,
      policyRows,
    },
    usedDecisionIdentities: new Set(used),
  });
  writeJsonAtomic(output, packet);
  process.stdout.write(`${JSON.stringify({ output: path.resolve(output), packetHash: packet.packetHash, authorizationStatus: packet.authorizationStatus })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`canonical cutover authorization failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
