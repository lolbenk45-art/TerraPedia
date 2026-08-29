import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import {
  hashOrderedBundleBytes,
  verifyCanonicalAuthorizationPacket,
  verifyCanonicalAuthorizationPacketAgainstCurrent,
} from './build-canonical-cutover-authorization.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CANONICAL_ROOT = 'reports/authorization/canonical/';
const DISPOSITION_ROOT = 'reports/authorization/canonical/l1-historical-source-hash-disposition/';
const DOMAIN_RUN_IDS = Object.freeze({
  items: 'items_l1_auto_0dfbd093f42b072192297f2a727d9c4d',
  projectiles: 'projectiles_l1_auto_4d46fa934fc03769178dfde4a5b7508e',
  shimmer: 'shimmer_l1_20260824closure01',
});
const DOMAIN_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l1',
  projectiles: 'automation-projectiles-l1',
  shimmer: 'automation-shimmer-first-l1',
});

const FORMAL_DATABASES = Object.freeze([
  'terria_v1_local',
  'terria_v1_maint',
  'terria_v1_relation',
]);
const REQUIRED_TECHNICAL_FIELDS = Object.freeze([
  'serverFingerprint',
  'schemaBundleSha256',
  'dataBundleSha256',
  'policySetHash',
  'executionManifestHash',
]);
const PACKET_FLAT_PATH = 'reports/authorization/canonical/automation-l1-historical-source-hash-disposition.packet.json';
const MAX_AUTHORIZATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID = 'automation-l1-historical-source-hash-disposition';
export const HISTORICAL_SOURCE_HASH_DISPOSITION_DOMAINS = Object.freeze(Object.keys(DOMAIN_RUN_IDS));

export function buildHistoricalSourceHashDisposition({
  domainId,
  currentPolicy,
  entries,
  generatedAt = new Date().toISOString(),
} = {}) {
  const domain = requireDomain(domainId);
  const policy = normalizePolicy(currentPolicy, domain);
  const timestamp = requireTimestamp(generatedAt, 'generatedAt');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('historical source hash disposition requires exactly one entry');
  }
  if (entries.length !== 1) {
    throw new Error('historical source hash disposition contains duplicate entries');
  }
  const entry = normalizeEntry(entries[0], domain, policy);
  const payload = {
    schemaVersion: 1,
    artifactKind: 'l1-historical-source-hash-disposition',
    operationId: HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID,
    status: 'candidate',
    proposalOnly: true,
    generatedAt: timestamp,
    databaseName: 'terria_v1_local',
    domainId: domain,
    currentPolicy: policy,
    disposition: 'exclude_from_l1_qualification',
    reasonCode: 'legacy_semantic_json_source_hash',
    entries: [entry],
    approval: null,
  };
  return Object.freeze({ ...payload, artifactHash: hashPayload(payload) });
}

export function approveHistoricalSourceHashDisposition({
  candidate,
  authorizationContext,
  currentTechnicalInput,
  repoRoot = process.cwd(),
  now = new Date().toISOString(),
  usedDecisionIdentities = new Set(),
} = {}) {
  // Owner fields are deliberately not accepted as independent arguments.  A
  // disposition is only approvable when every identity is read from, and
  // cryptographically bound to, one canonical authorization packet.
  if (arguments[0] && Object.keys(arguments[0]).some((key) => (
    ['actor', 'authorizationReference', 'approvedAt'].includes(key)
  ))) {
    throw new Error('historical disposition requires a bound Owner authorization context');
  }
  assertCandidate(candidate);
  const binding = verifyBoundAuthorizationContext({
    candidate,
    authorizationContext,
    currentTechnicalInput,
    repoRoot,
    now,
  });
  assertDecisionIdentityAvailable(binding.packet.decisionIdentity, usedDecisionIdentities);

  const approval = {
    actor: binding.packet.actor,
    reason: binding.packet.reason,
    reference: binding.packet.authorizationReference,
    authorizationReference: binding.packet.authorizationReference,
    decisionIdentity: binding.packet.decisionIdentity,
    packetHash: binding.packet.packetHash,
    packetPath: binding.packetPathRelative,
    packetFileSha256: binding.packetFileSha256,
    authorizedAt: binding.packet.authorizedAt,
    expiresAt: binding.packet.expiresAt,
    approvedAt: binding.packet.authorizedAt,
    technical: binding.technical,
  };
  const payload = {
    ...candidate,
    status: 'approved',
    proposalOnly: false,
    scope: binding.scope,
    approval,
  };
  delete payload.artifactHash;
  return Object.freeze({ ...payload, artifactHash: hashPayload(payload) });
}

function verifyBoundAuthorizationContext({
  candidate,
  authorizationContext,
  currentTechnicalInput,
  repoRoot,
  now,
} = {}) {
  if (!authorizationContext || typeof authorizationContext !== 'object'
      || Array.isArray(authorizationContext)
      || !authorizationContext.packet
      || typeof authorizationContext.packet !== 'object'
      || Array.isArray(authorizationContext.packet)) {
    throw new Error('historical disposition requires a bound Owner authorization context');
  }
  const packet = authorizationContext.packet;
  verifyCanonicalAuthorizationPacket(packet);
  if (packet.operationId !== HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID) {
    throw new Error('historical disposition authorization packet operationId is invalid');
  }

  const root = path.resolve(requireText(repoRoot, 'historical disposition repository root'));
  const packetPath = path.resolve(requireText(authorizationContext.packetPath, 'authorization packet path'));
  const packetPathRelative = requireCanonicalPacketPath(
    authorizationContext.packetPathRelative,
    packetPath,
    root,
  );
  const confinedPacket = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: packetPath,
    label: 'historical disposition authorization packet',
  });
  if (confinedPacket !== packetPath || (fs.lstatSync(confinedPacket).mode & 0o077) !== 0) {
    throw new Error('historical disposition authorization packet must be a private canonical file');
  }
  const packetBytes = fs.readFileSync(confinedPacket);
  const packetFileSha256 = requireHash(
    authorizationContext.packetFileSha256,
    'authorization packet file hash',
  );
  if (byteHash(packetBytes) !== packetFileSha256) {
    throw new Error('authorization packet file hash drifted');
  }
  let filePacket;
  try {
    filePacket = JSON.parse(packetBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`authorization packet file is invalid JSON: ${error.message}`);
  }
  if (stableJson(filePacket) !== stableJson(packet)) {
    throw new Error('authorization packet context does not match the packet file');
  }
  for (const [field, label] of [
    ['operationId', 'operation'],
    ['actor', 'Owner actor'],
    ['reason', 'Owner reason'],
    ['authorizationReference', 'Owner authorization reference'],
    ['decisionIdentity', 'Owner decision identity'],
    ['packetHash', 'packet hash'],
    ['authorizedAt', 'authorizedAt'],
    ['expiresAt', 'expiresAt'],
  ]) {
    if (authorizationContext[field] != null && authorizationContext[field] !== packet[field]) {
      throw new Error(`authorization context ${label} drifted from the packet`);
    }
  }

  assertCompletePacketTechnicalIdentity(packet);
  assertCurrentTechnicalInputShape(currentTechnicalInput);
  try {
    verifyCanonicalAuthorizationPacketAgainstCurrent({
      packet,
      currentTechnicalInput,
      now,
    });
  } catch (error) {
    throw new Error(`historical disposition authorization technical identity is invalid: ${error.message}`);
  }
  const verificationTime = requireTimestamp(now, 'authorization verification time');
  const authorizedAt = Date.parse(packet.authorizedAt);
  const expiresAt = Date.parse(packet.expiresAt);
  const generatedAt = Date.parse(packet.generatedAt);
  const nowMs = Date.parse(verificationTime);
  if (nowMs < authorizedAt || nowMs >= expiresAt) {
    throw new Error('historical disposition authorization is not currently valid or is expired');
  }
  if (expiresAt <= generatedAt || expiresAt - generatedAt > MAX_AUTHORIZATION_LIFETIME_MS) {
    throw new Error('historical disposition authorization expiry is not bounded');
  }

  const scope = normalizeAuthorizationScope(packet, candidate);
  assertCandidatePolicyMatchesCurrent(candidate, currentTechnicalInput, packet);
  assertCandidateDataBundleBinding({
    candidate,
    packet,
    currentTechnicalInput,
    repoRoot: root,
  });
  return {
    packet,
    packetPathRelative,
    packetFileSha256,
    scope,
    technical: extractPacketTechnicalIdentity(packet),
  };
}

function requireCanonicalPacketPath(value, absolutePath, repoRoot) {
  const relative = requireText(value, 'authorization packet relative path').replaceAll('\\', '/');
  const expectedAbsolute = path.resolve(repoRoot, relative);
  if (expectedAbsolute !== absolutePath
      || relative !== PACKET_FLAT_PATH) {
    throw new Error('authorization packet path must be the exact canonical historical-disposition packet path');
  }
  return relative;
}

function assertCompletePacketTechnicalIdentity(packet) {
  if (JSON.stringify(packet.targetDatabases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('authorization packet target databases are incomplete or drifted');
  }
  if (JSON.stringify(packet.requiredTechnicalFields) !== JSON.stringify(REQUIRED_TECHNICAL_FIELDS)) {
    throw new Error('authorization packet required technical identity is incomplete');
  }
  for (const field of REQUIRED_TECHNICAL_FIELDS) {
    if (!HASH_PATTERN.test(packet[field] ?? '')) {
      throw new Error(`authorization packet ${field} is missing or invalid`);
    }
  }
  if (!Array.isArray(packet.schemaBundleEntries) || !Array.isArray(packet.dataBundleEntries)) {
    throw new Error('authorization packet schema/data bundle entries are required');
  }
  if (!packet.executionManifest || typeof packet.executionManifest !== 'object'
      || Array.isArray(packet.executionManifest)
      || packet.executionManifest.operationId !== HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID) {
    throw new Error('authorization packet execution manifest identity is invalid');
  }
}

function assertCurrentTechnicalInputShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || !Array.isArray(input.targetDatabases)
      || !Array.isArray(input.schemaEntries)
      || !Array.isArray(input.dataEntries)
      || !Array.isArray(input.policyRows)
      || !input.serverFingerprint
      || !input.executionManifest) {
    throw new Error('complete current technical identity is required');
  }
}

function extractPacketTechnicalIdentity(packet) {
  return {
    operationId: packet.operationId,
    targetDatabases: [...packet.targetDatabases],
    serverFingerprint: packet.serverFingerprint,
    schemaBundleSha256: packet.schemaBundleSha256,
    schemaBundleEntries: packet.schemaBundleEntries,
    dataBundleSha256: packet.dataBundleSha256,
    dataBundleEntries: packet.dataBundleEntries,
    policySetHash: packet.policySetHash,
    executionManifestHash: packet.executionManifestHash,
    executionManifest: packet.executionManifest,
    requiredTechnicalFields: [...packet.requiredTechnicalFields],
  };
}

function normalizeAuthorizationScope(packet, candidate) {
  const entry = candidate.entries[0];
  const scope = packet.scope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)
      || scope.domainId !== candidate.domainId
      || scope.runId !== entry.runId
      || scope.candidateArtifactHash !== candidate.artifactHash) {
    throw new Error('authorization packet scope does not match the candidate disposition');
  }
  const manifestScope = packet.executionManifest?.scope;
  if (stableJson(manifestScope) !== stableJson(scope)) {
    throw new Error('authorization execution manifest scope does not match the packet scope');
  }
  return {
    domainId: scope.domainId,
    runId: scope.runId,
    candidateArtifactHash: scope.candidateArtifactHash,
  };
}

function assertCandidatePolicyMatchesCurrent(candidate, currentTechnicalInput, packet) {
  const policy = normalizePolicy(candidate.currentPolicy, candidate.domainId);
  if (policy.policySetHash !== packet.policySetHash) {
    throw new Error('candidate policy-set hash does not match the authorization packet');
  }
  const rows = currentTechnicalInput.policyRows.filter((row) => row?.domainId === candidate.domainId);
  if (rows.length !== 1
      || Number(rows[0].policyVersion) !== policy.policyVersion
      || rows[0].policyHash !== policy.policyHash
      || computePolicySetHash(currentTechnicalInput.policyRows) !== policy.policySetHash) {
    throw new Error('current policy object does not match the candidate disposition');
  }
}

function assertCandidateDataBundleBinding({ candidate, packet, currentTechnicalInput, repoRoot }) {
  const candidates = currentTechnicalInput.dataEntries.filter((entry) => {
    if (!entry || typeof entry.path !== 'string') return false;
    try {
      const bytes = toBytes(entry.bytes);
      const parsed = JSON.parse(bytes.toString('utf8'));
      return stableJson(parsed) === stableJson(candidate);
    } catch {
      return false;
    }
  });
  if (candidates.length !== 1) {
    throw new Error('candidate disposition file is not uniquely bound into the authorization data bundle');
  }
  const entry = candidates[0];
  const normalizedPath = normalizeBundlePath(entry.path);
  const bytes = toBytes(entry.bytes);
  const contentHash = byteHash(bytes);
  const packetEntry = packet.dataBundleEntries.find((value) => value?.path === normalizedPath);
  if (!packetEntry || Number(packetEntry.sizeBytes) !== bytes.length
      || packetEntry.contentHash !== contentHash
      || !packet.executionManifest.inputPaths?.includes(normalizedPath)) {
    throw new Error('candidate disposition file is not bound by the packet data bundle');
  }
  if (hashOrderedBundleBytes(currentTechnicalInput.dataEntries.map((value) => ({
    path: normalizeBundlePath(value.path),
    bytes: toBytes(value.bytes),
  })), 'current authorization data bundle') !== packet.dataBundleSha256) {
    throw new Error('current authorization data bundle hash drifted');
  }
  const candidateAbsolute = path.resolve(repoRoot, normalizedPath);
  const confined = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: candidateAbsolute,
    label: 'historical disposition candidate file',
  });
  const actualFileBytes = fs.readFileSync(confined);
  if (byteHash(actualFileBytes) !== contentHash || stableJson(JSON.parse(actualFileBytes.toString('utf8'))) !== stableJson(candidate)) {
    throw new Error('historical disposition candidate file drifted from the authorized data bundle');
  }
}

function assertDecisionIdentityAvailable(decisionIdentity, usedDecisionIdentities) {
  const values = usedDecisionIdentities instanceof Set
    ? [...usedDecisionIdentities]
    : (Array.isArray(usedDecisionIdentities) ? usedDecisionIdentities : null);
  if (values == null) throw new TypeError('used decision identities must be a Set or array');
  const used = new Set(values.map((value) => (
    typeof value === 'string' ? value.trim() : String(value?.decisionIdentity ?? '').trim()
  )).filter(Boolean));
  if (used.has(decisionIdentity)) {
    throw new Error(`historical disposition decision identity is already used: ${decisionIdentity}`);
  }
}

export function assertApprovedHistoricalSourceHashDisposition(disposition) {
  assertEnvelope(disposition, 'approved', false);
  const { artifactHash, ...payload } = disposition;
  if (artifactHash !== hashPayload(payload)) {
    throw new Error('historical source hash disposition artifact hash drifted');
  }
  if (!disposition.approval?.actor || !disposition.approval?.reason
      || !disposition.approval?.reference || !disposition.approval?.decisionIdentity
      || !HASH_PATTERN.test(disposition.approval?.packetHash ?? '')
      || !disposition.approval?.packetPath
      || !HASH_PATTERN.test(disposition.approval?.packetFileSha256 ?? '')
      || !disposition.approval?.authorizedAt || !disposition.approval?.expiresAt
      || !disposition.scope) {
    throw new Error('historical source hash disposition approval is incomplete');
  }
  const rebuilt = buildHistoricalSourceHashDisposition({
    domainId: disposition.domainId,
    currentPolicy: disposition.currentPolicy,
    entries: disposition.entries,
    generatedAt: disposition.generatedAt,
  });
  if (rebuilt.domainId !== disposition.domainId
      || rebuilt.currentPolicy.policyHash !== disposition.currentPolicy.policyHash
      || rebuilt.currentPolicy.policySetHash !== disposition.currentPolicy.policySetHash
      || rebuilt.entries.length !== disposition.entries.length
      || stableJson(rebuilt.entries) !== stableJson(disposition.entries)) {
    throw new Error('historical source hash disposition content drifted');
  }
  const scope = disposition.scope;
  if (scope.domainId !== disposition.domainId
      || scope.runId !== disposition.entries[0].runId
      || scope.candidateArtifactHash !== rebuilt.artifactHash) {
    throw new Error('historical source hash disposition scope is invalid');
  }
  if (disposition.approval.authorizationReference !== disposition.approval.reference
      || disposition.approval.approvedAt !== disposition.approval.authorizedAt) {
    throw new Error('historical source hash disposition approval identity is inconsistent');
  }
  return true;
}

export function writeHistoricalSourceHashDisposition({
  repoRoot = process.cwd(),
  disposition,
} = {}) {
  assertApprovedHistoricalSourceHashDisposition(disposition);
  const root = path.resolve(repoRoot);
  const outputPath = path.resolve(
    root,
    DISPOSITION_ROOT,
    disposition.domainId,
    disposition.artifactHash.slice(7),
    'disposition.json',
  );
  const confined = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: outputPath,
    label: 'historical source hash disposition',
    createParent: true,
  });
  assertNoExistingEntry(confined, 'historical source hash disposition');
  const bytes = Buffer.from(`${JSON.stringify(disposition, null, 2)}\n`, 'utf8');
  fs.writeFileSync(confined, bytes, { mode: 0o600, flag: 'wx' });
  return Object.freeze({
    path: path.relative(root, confined).replaceAll('\\', '/'),
    sha256: byteHash(bytes),
    artifactHash: disposition.artifactHash,
  });
}

export function readHistoricalSourceHashDisposition({
  repoRoot = process.cwd(),
  dispositionPath,
  now = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const normalized = requireText(dispositionPath, 'historical source hash disposition path')
    .replaceAll('\\', '/');
  const match = new RegExp(`^${escapeRegExp(DISPOSITION_ROOT)}(items|projectiles|shimmer)/([a-f0-9]{64})/disposition\\.json$`)
    .exec(normalized);
  if (!match) throw new Error('historical source hash disposition path is not content-addressed');
  const absolute = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, normalized),
    label: 'historical source hash disposition',
  });
  if ((fs.lstatSync(absolute).mode & 0o077) !== 0) {
    throw new Error('historical source hash disposition must be private');
  }
  const bytes = fs.readFileSync(absolute);
  const actualFileHash = byteHash(bytes);
  let disposition;
  try {
    disposition = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`historical source hash disposition is invalid JSON: ${error.message}`);
  }
  if (disposition.domainId !== match[1] || disposition.artifactHash !== `sha256:${match[2]}`) {
    throw new Error('historical source hash disposition path does not match its artifact hash');
  }
  assertApprovedHistoricalSourceHashDisposition(disposition);
  const packet = readAndVerifyBoundAuthorizationPacket(root, disposition, { now });
  return Object.freeze({
    disposition,
    path: normalized,
    fileSha256: actualFileHash,
    packet: packet.packet,
    packetPath: packet.path,
    packetFileSha256: packet.fileSha256,
  });
}

function readAndVerifyBoundAuthorizationPacket(repoRoot, disposition, { now = new Date().toISOString() } = {}) {
  const approval = disposition.approval;
  const packetPath = requireCanonicalPacketRelativePath(approval.packetPath);
  const absolute = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, packetPath),
    label: 'historical disposition authorization packet',
  });
  if ((fs.lstatSync(absolute).mode & 0o077) !== 0) {
    throw new Error('historical disposition authorization packet must be private');
  }
  const bytes = fs.readFileSync(absolute);
  const fileSha256 = byteHash(bytes);
  if (fileSha256 !== approval.packetFileSha256) {
    throw new Error('historical disposition authorization packet file hash drifted');
  }
  let packet;
  try {
    packet = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`historical disposition authorization packet is invalid JSON: ${error.message}`);
  }
  try {
    verifyCanonicalAuthorizationPacket(packet);
  } catch (error) {
    throw new Error(`historical disposition authorization packet is invalid: ${error.message}`);
  }
  assertAuthorizationWindow(packet, now);
  for (const [field, label] of [
    ['operationId', 'operation'],
    ['actor', 'Owner actor'],
    ['reason', 'Owner reason'],
    ['authorizationReference', 'Owner authorization reference'],
    ['decisionIdentity', 'Owner decision identity'],
    ['packetHash', 'packet hash'],
    ['authorizedAt', 'authorizedAt'],
    ['expiresAt', 'expiresAt'],
  ]) {
    const expected = field === 'operationId'
      ? HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID
      : approval[field === 'authorizationReference' ? 'authorizationReference' : field];
    if (packet[field] !== expected) {
      throw new Error(`historical disposition authorization packet ${label} does not match the approved disposition`);
    }
  }
  if (stableJson(approval.technical) !== stableJson(extractPacketTechnicalIdentity(packet))) {
    throw new Error('historical disposition approval technical identity does not match the packet');
  }
  const scope = disposition.scope;
  if (!scope || stableJson(packet.scope) !== stableJson(scope)
      || scope.domainId !== disposition.domainId
      || scope.runId !== disposition.entries[0].runId) {
    throw new Error('historical disposition authorization packet scope does not match the disposition');
  }
  assertPacketBindsCandidate({ repoRoot, packet, disposition });
  return { packet, path: packetPath, fileSha256 };
}

function assertAuthorizationWindow(packet, now) {
  const verificationTime = requireTimestamp(now, 'historical disposition authorization verification time');
  const authorizedAt = Date.parse(packet.authorizedAt);
  const expiresAt = Date.parse(packet.expiresAt);
  const generatedAt = Date.parse(packet.generatedAt);
  const nowMs = Date.parse(verificationTime);
  if (nowMs < authorizedAt || nowMs >= expiresAt) {
    throw new Error('historical disposition authorization is not currently valid or is expired');
  }
  if (expiresAt <= generatedAt || expiresAt - generatedAt > MAX_AUTHORIZATION_LIFETIME_MS) {
    throw new Error('historical disposition authorization expiry is not bounded');
  }
}

function requireCanonicalPacketRelativePath(value) {
  const normalized = requireText(value, 'historical disposition authorization packet path')
    .replaceAll('\\', '/');
  if (normalized !== PACKET_FLAT_PATH) {
    throw new Error('historical disposition authorization packet path is not the exact canonical path');
  }
  return normalized;
}

function assertPacketBindsCandidate({ repoRoot, packet, disposition }) {
  const candidatePath = `${DISPOSITION_ROOT}${disposition.domainId}/${disposition.scope.candidateArtifactHash.slice(7)}/candidate.json`;
  const candidateAbsolute = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, candidatePath),
    label: 'historical disposition candidate',
  });
  const candidateBytes = fs.readFileSync(candidateAbsolute);
  const candidateHash = byteHash(candidateBytes);
  const entries = Array.isArray(packet.dataBundleEntries) ? packet.dataBundleEntries : [];
  const matching = entries.filter((entry) => entry?.path === candidatePath);
  if (matching.length !== 1
      || Number(matching[0].sizeBytes) !== candidateBytes.length
      || matching[0].contentHash !== candidateHash
      || hashOrderedBundleBytes([{ path: candidatePath, bytes: candidateBytes }], 'historical disposition data bundle')
        !== packet.dataBundleSha256
      || !Array.isArray(packet.executionManifest?.inputPaths)
      || packet.executionManifest.inputPaths.length !== 1
      || packet.executionManifest.inputPaths[0] !== candidatePath) {
    throw new Error('historical disposition authorization packet does not bind the candidate data bundle');
  }
}

export function verifyHistoricalSourceHashDispositionEntry({
  repoRoot = process.cwd(),
  disposition,
  entry,
  row,
  domainId,
  policy,
} = {}) {
  const domain = requireDomain(domainId);
  if (!disposition || disposition.domainId !== domain
      || disposition.currentPolicy?.policyVersion !== policy?.policyVersion
      || disposition.currentPolicy?.policyHash !== policy?.policyHash
      || disposition.currentPolicy?.policySetHash !== policy?.policySetHash) {
    throw new Error('historical source hash disposition policy identity does not match');
  }
  const normalized = normalizeEntry(entry, domain, disposition.currentPolicy);
  if (!row || row.runId !== normalized.runId
      || row.bundleHash !== normalized.bundle.hash
      || row.bundleEvidenceHash !== normalized.bundle.evidenceHash
      || row.evidenceHash !== normalized.bundle.evidenceHash
      || row.bundleBaselineFingerprint !== normalized.bundle.baselineFingerprint
      || row.bundlePath !== normalized.bundle.databasePrivatePath
      || row.runPolicySetHash !== policy.policySetHash
      || row.applyPolicySetHash !== policy.policySetHash
      || row.bundlePolicySetHash !== policy.policySetHash
      || row.evidenceSetPolicySetHash !== policy.policySetHash
      || row.runBaselineFingerprint !== normalized.bundle.baselineFingerprint
      || row.evidenceSetBaselineFingerprint !== normalized.bundle.baselineFingerprint) {
    throw new Error('historical source hash disposition database row identity drifted');
  }

  let evidenceManifest;
  try {
    evidenceManifest = row?.evidenceManifest == null
      ? null
      : (typeof row.evidenceManifest === 'string'
        ? JSON.parse(row.evidenceManifest)
        : row.evidenceManifest);
  } catch (error) {
    throw new Error(`historical evidence manifest is invalid: ${error.message}`);
  }
  if (!evidenceManifest || evidenceManifest.privatePath !== normalized.bundle.databasePrivatePath
      || evidenceManifest.bundleFileHash !== normalized.bundle.fileSha256
      || evidenceManifest.source?.path !== normalized.source.path
      || evidenceManifest.source?.sha256 !== normalized.source.declaredSha256) {
    throw new Error('historical evidence manifest identity drifted');
  }

  const root = path.resolve(repoRoot);
  const sourceAbsolute = assertCanonicalArtifactFile(root, normalized.source.path, 'historical source artifact');
  const sourceBytes = fs.readFileSync(sourceAbsolute);
  if (sourceBytes.length !== normalized.source.bytes) {
    throw new Error('historical source artifact byte length drifted');
  }
  if (byteHash(sourceBytes) !== normalized.source.actualByteSha256) {
    throw new Error('historical source artifact byte hash drifted');
  }
  let parsed;
  try {
    parsed = JSON.parse(sourceBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`historical source artifact is invalid JSON: ${error.message}`);
  }
  if (semanticJsonHash(parsed) !== normalized.source.semanticJsonSha256
      || normalized.source.declaredSha256 !== normalized.source.semanticJsonSha256
      || normalized.source.actualByteSha256 === normalized.source.declaredSha256) {
    throw new Error('historical source hash disposition mismatch is not proven');
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (parsed.domainId != null && parsed.domainId !== domain) {
      throw new Error('historical source artifact domain identity drifted');
    }
    if (parsed.runId != null && parsed.runId !== normalized.runId) {
      throw new Error('historical source artifact run identity drifted');
    }
  }
  const bundleAbsolute = assertCanonicalArtifactFile(root, normalized.bundle.relativePath, 'historical bundle artifact');
  const bundleBytes = fs.readFileSync(bundleAbsolute);
  if (byteHash(bundleBytes) !== normalized.bundle.fileSha256) {
    throw new Error('historical bundle file hash drifted');
  }
  let bundle;
  try { bundle = JSON.parse(bundleBytes.toString('utf8')); }
  catch (error) { throw new Error(`historical bundle artifact is invalid JSON: ${error.message}`); }
  const { bundleHash, ...bundleBody } = bundle;
  if (bundleHash !== normalized.bundle.hash || hashCanonicalJson(bundleBody) !== bundleHash
      || bundle.runId !== normalized.runId || bundle.domainId !== domain
      || bundle.databaseName !== 'terria_v1_local'
      || bundle.operationId !== DOMAIN_OPERATION_IDS[domain]
      || bundle.source?.path !== normalized.source.path
      || bundle.source?.sha256 !== normalized.source.declaredSha256
      || bundle.baselineFingerprint !== normalized.bundle.baselineFingerprint
      || bundle.evidenceHash !== normalized.bundle.evidenceHash
      || bundle.policy?.policyVersion !== policy.policyVersion
      || bundle.policy?.policyHash !== policy.policyHash
      || bundle.policy?.policySetHash !== policy.policySetHash) {
    throw new Error('historical bundle identity drifted');
  }
  return true;
}

export function loadHistoricalSourceHashDispositions({
  repoRoot = process.cwd(),
  dispositionPaths = [],
  now = new Date().toISOString(),
} = {}) {
  const paths = Array.isArray(dispositionPaths) ? dispositionPaths : [dispositionPaths];
  const results = paths.filter(Boolean).map((dispositionPath) => (
    readHistoricalSourceHashDisposition({ repoRoot, dispositionPath, now })
  ));
  const byRunId = new Map();
  for (const result of results) {
    const { disposition } = result;
    for (const entry of disposition.entries) {
      if (byRunId.has(entry.runId)) throw new Error(`duplicate historical disposition run: ${entry.runId}`);
      byRunId.set(entry.runId, { ...result, entry });
    }
  }
  return byRunId;
}

function normalizeEntry(value, domain, policy) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('historical source hash disposition entry is required');
  }
  if (value.domainId != null && value.domainId !== domain) {
    throw new Error('historical disposition entry domain identity drifted');
  }
  const runId = requireText(value.runId, 'historical disposition runId');
  if (runId !== DOMAIN_RUN_IDS[domain]) {
    throw new Error(`historical disposition runId must be ${DOMAIN_RUN_IDS[domain]}`);
  }
  if (value.runStatus !== 'COMPLETED' || value.applyStatus !== 'COMMITTED') {
    throw new Error('historical disposition run must be COMPLETED with COMMITTED apply');
  }
  const sourceValue = value.source;
  const source = {
    path: requireCanonicalRelativePath(sourceValue?.path, 'historical source path'),
    declaredSha256: requireHash(sourceValue?.declaredSha256, 'declared source hash'),
    semanticJsonSha256: requireHash(sourceValue?.semanticJsonSha256, 'semantic JSON source hash'),
    actualByteSha256: requireHash(sourceValue?.actualByteSha256, 'actual source byte hash'),
    bytes: requirePositiveInteger(sourceValue?.bytes, 'historical source byte length'),
    encoding: requireText(sourceValue?.encoding ?? 'utf8', 'historical source encoding'),
  };
  if (source.declaredSha256 !== source.semanticJsonSha256) {
    throw new Error('declared source hash must equal the semantic JSON hash');
  }
  if (source.actualByteSha256 === source.declaredSha256) {
    throw new Error('historical disposition requires a source byte hash mismatch');
  }
  const bundleValue = value.bundle && typeof value.bundle === 'object' && !Array.isArray(value.bundle)
    ? value.bundle
    : {};
  assertOptionalIdentity(value.domainId, domain, 'entry domain');
  assertOptionalIdentity(bundleValue.domainId, domain, 'bundle domain');
  assertOptionalIdentity(bundleValue.runId, runId, 'bundle runId');
  assertOptionalIdentity(value.bundleRunId, runId, 'bundle runId');
  assertOptionalIdentity(value.bundleDomainId, domain, 'bundle domain');
  const bundleOperationId = readConsistent([
    ['bundleOperationId', value.bundleOperationId],
    ['bundle.operationId', bundleValue.operationId],
  ], 'bundle operation');
  if (bundleOperationId != null) {
    assertOptionalIdentity(bundleOperationId, DOMAIN_OPERATION_IDS[domain], 'bundle operation');
  }
  for (const [field, actual] of [
    ['policySetHash', value.policySetHash],
    ['runPolicySetHash', value.runPolicySetHash],
    ['applyPolicySetHash', value.applyPolicySetHash],
    ['bundlePolicySetHash', value.bundlePolicySetHash],
    ['evidenceSetPolicySetHash', value.evidenceSetPolicySetHash],
    ['bundle.policySetHash', value.bundle?.policySetHash],
    ['bundle.policy.policySetHash', value.bundle?.policy?.policySetHash],
    ['evidence.policySetHash', value.evidence?.policySetHash],
  ]) {
    assertOptionalIdentity(actual, policy.policySetHash, field);
  }
  for (const [field, actual] of [
    ['bundle.policyVersion', value.bundle?.policy?.policyVersion],
    ['bundle.policy.policyHash', value.bundle?.policy?.policyHash],
  ]) {
    if (actual != null) {
      const expected = field.endsWith('policyVersion')
        ? policy.policyVersion
        : policy.policyHash;
      assertOptionalIdentity(Number(actual), expected, field);
    }
  }
  const databasePrivatePath = requireAbsolutePath(
    readConsistent([
      ['bundlePath', value.bundlePath],
      ['databasePrivatePath', value.databasePrivatePath],
      ['bundle.databasePrivatePath', bundleValue.databasePrivatePath],
    ], 'bundle path'),
    'historical database bundle path',
  );
  const derivedRelativePath = relativeCanonicalPath(databasePrivatePath);
  const bundleRelativePath = requireCanonicalRelativePath(
    readConsistent([
      ['bundleRelativePath', value.bundleRelativePath],
      ['relativePath', value.relativePath],
      ['bundle.relativePath', bundleValue.relativePath],
    ], 'bundle relative path') ?? derivedRelativePath,
    'historical bundle path',
  );
  if (bundleRelativePath !== derivedRelativePath) {
    throw new Error('historical disposition bundle path identity does not match the database path');
  }
  const bundle = {
    databasePrivatePath,
    relativePath: bundleRelativePath,
    hash: requireHash(readConsistent([
      ['bundleHash', value.bundleHash],
      ['bundle.bundleHash', bundleValue.bundleHash],
      ['bundle.hash', bundleValue.hash],
    ], 'bundle hash'), 'historical bundle hash'),
    fileSha256: requireHash(readConsistent([
      ['bundleFileSha256', value.bundleFileSha256],
      ['bundle.fileSha256', bundleValue.fileSha256],
      ['bundle.bundleFileSha256', bundleValue.bundleFileSha256],
    ], 'bundle file hash'), 'historical bundle file hash'),
    evidenceHash: requireHash(readConsistent([
      ['evidenceHash', value.evidenceHash],
      ['bundleEvidenceHash', value.bundleEvidenceHash],
      ['bundle.evidenceHash', bundleValue.evidenceHash],
    ], 'bundle evidence hash'), 'historical evidence hash'),
    baselineFingerprint: requireHash(readConsistent([
      ['baselineFingerprint', value.baselineFingerprint],
      ['bundleBaselineFingerprint', value.bundleBaselineFingerprint],
      ['bundle.baselineFingerprint', bundleValue.baselineFingerprint],
    ], 'bundle baseline fingerprint'), 'historical baseline fingerprint'),
    policySetHash: policy.policySetHash,
    ...(bundleOperationId == null ? {} : { operationId: bundleOperationId }),
  };
  for (const [field, actual, expected] of [
    ['bundle hash', readConsistent([
      ['bundleHash', value.bundleHash],
      ['bundle.bundleHash', bundleValue.bundleHash],
      ['bundle.hash', bundleValue.hash],
    ], 'bundle hash'), bundle.hash],
    ['bundle file hash', readConsistent([
      ['bundleFileSha256', value.bundleFileSha256],
      ['bundle.fileSha256', bundleValue.fileSha256],
      ['bundle.bundleFileSha256', bundleValue.bundleFileSha256],
    ], 'bundle file hash'), bundle.fileSha256],
    ['bundle evidence hash', readConsistent([
      ['evidenceHash', value.evidenceHash],
      ['bundleEvidenceHash', value.bundleEvidenceHash],
      ['bundle.evidenceHash', bundleValue.evidenceHash],
    ], 'bundle evidence hash'), bundle.evidenceHash],
    ['bundle baseline fingerprint', readConsistent([
      ['baselineFingerprint', value.baselineFingerprint],
      ['bundleBaselineFingerprint', value.bundleBaselineFingerprint],
      ['bundle.baselineFingerprint', bundleValue.baselineFingerprint],
    ], 'bundle baseline fingerprint'), bundle.baselineFingerprint],
  ]) {
    assertOptionalIdentity(actual, expected, field);
  }
  return {
    domainId: domain,
    runId,
    runStatus: 'COMPLETED',
    applyStatus: 'COMMITTED',
    bundle,
    source,
    exclusion: 'legacy_semantic_json_source_hash',
  };
}

function assertOptionalIdentity(actual, expected, label) {
  if (actual == null) return;
  if (actual !== expected) throw new Error(`historical disposition ${label} identity drifted`);
}

function readConsistent(entries, label) {
  const present = entries.filter(([, value]) => value != null);
  if (present.length === 0) return undefined;
  const [firstName, firstValue] = present[0];
  for (const [name, value] of present.slice(1)) {
    if (value !== firstValue) {
      throw new Error(`historical disposition ${label} identity conflicts between ${firstName} and ${name}`);
    }
  }
  return firstValue;
}

function assertCandidate(candidate) {
  assertEnvelope(candidate, 'candidate', true);
  const { artifactHash, ...payload } = candidate;
  if (artifactHash !== hashPayload(payload)) {
    throw new Error('historical source hash disposition candidate hash drifted');
  }
}

function assertEnvelope(value, status, proposalOnly) {
  if (!value || value.schemaVersion !== 1
      || value.artifactKind !== 'l1-historical-source-hash-disposition'
      || value.operationId !== HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID
      || value.status !== status || value.proposalOnly !== proposalOnly
      || value.databaseName !== 'terria_v1_local'
      || value.disposition !== 'exclude_from_l1_qualification'
      || value.reasonCode !== 'legacy_semantic_json_source_hash') {
    throw new Error(`${status} historical source hash disposition is required`);
  }
  requireDomain(value.domainId);
  normalizePolicy(value.currentPolicy, value.domainId);
  if (!Array.isArray(value.entries) || value.entries.length !== 1) {
    throw new Error('historical source hash disposition entry set is invalid');
  }
  normalizeEntry(value.entries[0], value.domainId, value.currentPolicy);
  if (status === 'approved' && (!value.approval || typeof value.approval !== 'object')) {
    throw new Error('approved historical source hash disposition approval is required');
  }
}

function normalizePolicy(value, domain) {
  if (!value || value.domainId !== domain || value.level !== 'L1'
      || value.operationalState !== 'ACTIVE'
      || !Number.isSafeInteger(Number(value.policyVersion))
      || !HASH_PATTERN.test(value.policyHash ?? '')
      || !HASH_PATTERN.test(value.policySetHash ?? '')) {
    throw new Error('historical disposition current policy identity is invalid');
  }
  return {
    domainId: domain,
    level: 'L1',
    operationalState: 'ACTIVE',
    policyVersion: Number(value.policyVersion),
    policyHash: value.policyHash,
    policySetHash: value.policySetHash,
  };
}

function assertCanonicalArtifactFile(root, relativePath, label) {
  const absolute = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, relativePath),
    label,
  });
  const canonicalRoot = path.resolve(root, CANONICAL_ROOT);
  if (!absolute.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`${label} must be under the canonical authorization report root`);
  }
  return absolute;
}

function requireCanonicalRelativePath(value, label) {
  const normalized = requireText(value, label).replaceAll('\\', '/');
  if (!normalized.startsWith(CANONICAL_ROOT)
      || normalized.includes('..') || normalized.startsWith('/')
      || normalized.includes('//')) {
    throw new Error(`${label} must be a canonical relative artifact path`);
  }
  return normalized;
}

function relativeCanonicalPath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/');
  const index = normalized.indexOf(`/${CANONICAL_ROOT}`);
  if (index >= 0) return normalized.slice(index + 1);
  if (normalized.startsWith(CANONICAL_ROOT)) return normalized;
  throw new Error('historical database bundle path is not under the canonical authorization report root');
}

function requireAbsolutePath(value, label) {
  const text = requireText(value, label).replaceAll('\\', '/');
  if (!path.posix.isAbsolute(text)) throw new Error(`${label} must be absolute`);
  return text;
}

function requireDomain(value) {
  const domain = requireText(value, 'historical disposition domainId');
  if (!HISTORICAL_SOURCE_HASH_DISPOSITION_DOMAINS.includes(domain)) {
    throw new Error(`unsupported historical source hash disposition domain: ${domain}`);
  }
  return domain;
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function toBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new TypeError('authorization data bundle entry bytes are invalid');
}

function normalizeBundlePath(value) {
  const normalized = requireText(value, 'authorization data bundle path').replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized.includes('..')
      || normalized.includes('//') || path.posix.normalize(normalized) !== normalized) {
    throw new Error('authorization data bundle path must be a normalized relative path');
  }
  return normalized;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function assertNoExistingEntry(filePath, label) {
  try {
    fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; overwrite is forbidden`);
}

function byteHash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function semanticJsonHash(value) {
  return byteHash(Buffer.from(JSON.stringify(value), 'utf8'));
}

function hashPayload(value) {
  return hashCanonicalJson(value);
}

function hashCanonicalJson(value) {
  return byteHash(Buffer.from(stableJson(value), 'utf8'));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
