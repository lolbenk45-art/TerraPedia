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
import {
  readCanonicalShimmerImportInputContract,
} from './canonical-shimmer-import-input-contract.mjs';
import { assertCanonicalOperationExecutionManifestContract } from './canonical-operation-execution-manifest.mjs';
import {
  canonicalServerFingerprint,
  hashCanonicalServerFingerprint,
} from './automation-database-contract.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import {
  assertItemImageProjectionAuthorizationPacket,
  assertItemImageProjectionInputContract,
  assertItemImageProjectionProposal,
  assertItemImageProjectionSnapshot,
  buildItemImageProjectionInputContract,
  canonicalItemImageProjectionHash,
} from '../relation/item-image-projection-contract.mjs';
const ARMOR_CANONICAL_OPERATION_ID = 'canonical-armor-ingestion';
const ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID =
  'canonical-item-image-projection-missing-row-insert';
const ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID = 'canonical-item-source-local-npc-admission';
const HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID =
  'automation-l1-historical-source-hash-disposition';
const SCHEDULER_ACTIVATION_POLICY_OPERATION_ID =
  'automation-crawler-v2-scheduler-activation';
const HISTORICAL_DISPOSITION_CANDIDATE_ROOT =
  'reports/authorization/canonical/l1-historical-source-hash-disposition/';
const HISTORICAL_DISPOSITION_CANDIDATE_PATH_PATTERN =
  /^reports\/authorization\/canonical\/l1-historical-source-hash-disposition\/(items|projectiles|shimmer)\/([a-f0-9]{64})\/candidate\.json$/;
const HISTORICAL_DISPOSITION_PACKET_PATH_PATTERN =
  /^reports\/authorization\/canonical\/l1-historical-source-hash-disposition\/(items|projectiles|shimmer)\/([a-f0-9]{64})\/packet\.json$/;
const EXACT_ATTEMPT_AUTHORIZATION_OPERATIONS = Object.freeze({
  'canonical-item-image-projection-apply': Object.freeze({
    attemptKey: 'itemImageProjectionAttempt',
    label: 'projection',
  }),
  [ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID]: Object.freeze({
    attemptKey: 'itemSourceLocalNpcAdmissionAttempt',
    label: 'Item-source admission',
  }),
});

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
const ISOLATED_T1_REQUIRED_TECHNICAL_FIELDS = Object.freeze([
  'serverFingerprint',
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

// Both shapes the durable decision ledger has ever carried, reduced to the
// identities they name.
export function readUsedDecisionIdentities(values) {
  const identities = new Set();
  for (const entry of values ?? []) {
    const identity = typeof entry === 'string'
      ? entry.trim()
      : String(entry?.decisionIdentity ?? '').trim();
    if (identity) identities.add(identity);
  }
  return identities;
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
  // The durable ledger mixes bare identity strings with the record form the
  // dispatch side writes. Looking a string up in a Set that holds records never
  // matches, which would let an already-used decision be signed again.
  if (readUsedDecisionIdentities(usedDecisionIdentities).has(owner.decisionIdentity)) {
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
  const resolved = resolveCanonicalOperationTechnicalInput({ repoRoot, operationId, executionManifest });
  const request = buildCanonicalAuthorizationRequest({
    ...resolved,
    serverFingerprint,
    policyRows,
    generatedAt,
    expiresAt,
  });
  if (operationId !== HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID) return request;
  const scope = resolved.executionManifest?.scope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    throw new Error('historical disposition execution manifest scope is required');
  }
  const payload = { ...request, scope };
  delete payload.requestHash;
  return Object.freeze({ ...payload, requestHash: hashJson(payload) });
}

export function resolveCanonicalOperationTechnicalInput({ repoRoot, operationId, executionManifest = null }) {
  requireOperationId(operationId);
  const root = path.resolve(repoRoot);
  const verifiedExecutionManifest = operationId === HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID
    ? verifyHistoricalDispositionExecutionManifest(root, executionManifest)
    : executionManifest == null
      ? null
      : verifyExecutionManifestCodeBundle(root, executionManifest, operationId);
  const schemaEntries = operationId === 'canonical-schema-v56-v58'
    ? readMigrationEntries(root)
    : [];
  let dataEntries;
  if (operationId === HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID) {
    dataEntries = readHistoricalDispositionDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === 'canonical-armor-set-projection-incremental'
      || operationId === 'canonical-armor-secondary-projection'
      || operationId === 'canonical-armor-image-cache') {
    if (verifiedExecutionManifest == null) throw new Error('Armor projection execution manifest is required');
    dataEntries = verifiedExecutionManifest.inputPaths.map(inputPath => readConfinedEntry(root, inputPath, {
      label: 'Armor projection proposal', privateFile: true,
    }));
  } else if (operationId === 'canonical-buff-full-chain') {
    if (verifiedExecutionManifest == null) throw new Error('Buff full-chain execution manifest is required');
    dataEntries = verifiedExecutionManifest.inputPaths.map((inputPath) => readConfinedEntry(root, inputPath, {
      label: 'Buff full-chain envelope', privateFile: true,
    }));
  } else if (operationId === 'canonical-armor-semantic-repair') {
    if (verifiedExecutionManifest == null) throw new Error('Armor semantic repair execution manifest is required');
    dataEntries = verifiedExecutionManifest.inputPaths.map((inputPath) => readConfinedEntry(root, inputPath, {
      label: 'Armor semantic repair proposal', privateFile: true,
    }));
  } else if (operationId === ARMOR_CANONICAL_OPERATION_ID) {
    if (verifiedExecutionManifest == null) throw new Error('Armor canonical ingestion execution manifest is required');
    dataEntries = readArmorCanonicalIntentDataEntries(root, verifiedExecutionManifest);
  } else if (operationId.startsWith('automation-')
      && (operationId.endsWith('-l2-promotion') || operationId.endsWith('-l2-policy-ceiling-registration')
        || operationId.endsWith('-l2-reauthorization'))) {
    dataEntries = readL2AuthorizationDataEntries(root, operationId, verifiedExecutionManifest);
  } else if (operationId === ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID) {
    if (verifiedExecutionManifest == null) {
      throw new Error('Item-source admission execution manifest is required');
    }
    dataEntries = readItemSourceLocalNpcAdmissionDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === 'canonical-item-image-projection-apply') {
    if (verifiedExecutionManifest == null) {
      throw new Error('item image projection execution manifest is required');
    }
    dataEntries = readItemImageProjectionDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === 'canonical-item-image-lineage-apply') {
    if (verifiedExecutionManifest == null) {
      throw new Error('item image lineage execution manifest is required');
    }
    dataEntries = readItemImageLineageDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === 'canonical-item-image-provenance-patch'
      && verifiedExecutionManifest?.itemImageProvenanceAttempt != null) {
    dataEntries = readItemImageProvenanceDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === 'canonical-two-item-image-quarantine-repair'
      && verifiedExecutionManifest?.twoItemImageQuarantineRepairAttempt != null) {
    dataEntries = readTwoItemImageQuarantineRepairDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID) {
    if (verifiedExecutionManifest == null) {
      throw new Error('missing-row insert execution manifest is required');
    }
    dataEntries = readItemImageProjectionMissingRowInsertDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === 'canonical-item-base-entity-restoration') {
    if (verifiedExecutionManifest == null) {
      throw new Error('canonical base-entity restoration execution manifest is required');
    }
    dataEntries = readItemCanonicalBaseEntityRestorationDataEntries(root, verifiedExecutionManifest);
  } else if (operationId === SCHEDULER_ACTIVATION_POLICY_OPERATION_ID
      && verifiedExecutionManifest != null) {
    dataEntries = readSchedulerActivationPolicyDataEntries(root, operationId, verifiedExecutionManifest);
  } else {
    dataEntries = readCompleteEntries(root, CANONICAL_OPERATION_DATA_PATHS[operationId]);
  }
  if (operationId === 'canonical-shimmer-import' && dataEntries !== null) {
    readCanonicalShimmerImportInputContract({ repoRoot: root });
  }
  if (operationId === 'canonical-npc-t1-acceptance'
      || operationId === 'canonical-npc-t2-cutover-verification'
      || operationId === 'canonical-npc-apply'
      || operationId.startsWith('canonical-npc-') && operationId.endsWith('-apply')
      || operationId === 'canonical-npc-item-relation-lineage-repair') {
    if (operationId === 'canonical-npc-external-relation-scope-apply') {
      return {
        operationId,
        targetDatabases: [...FORMAL_DATABASES],
        schemaEntries,
        dataEntries,
        executionManifest: verifiedExecutionManifest,
        requiredTechnicalFields: requiredTechnicalFieldsForOperation(operationId),
      };
    }
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
    requiredTechnicalFields: requiredTechnicalFieldsForOperation(operationId),
  };
}

/**
 * Historical source-hash dispositions are evidence/authorization contracts,
 * not executable operations.  They still need a manifest so an independent
 * resolver can reconstruct the exact candidate file from a packet.  Keep
 * this validator separate from verifyExecutionManifestCodeBundle(), whose
 * null-entrypoint fail-closed rule must remain in force for real operations.
 */
function verifyHistoricalDispositionExecutionManifest(repoRoot, manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('historical disposition execution manifest is required');
  }
  if (manifest.schemaVersion !== 1
      || manifest.operationId !== HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID
      || manifest.executionClass !== 'historical_source_hash_disposition'
      || !Array.isArray(manifest.command)
      || manifest.command.length !== 2
      || manifest.command[0] !== 'node'
      || manifest.command[1] !== 'pipelines/automation/historical-source-hash-disposition.mjs'
      || !Array.isArray(manifest.outputPaths) || manifest.outputPaths.length !== 0
      || !Array.isArray(manifest.reportPaths) || manifest.reportPaths.length !== 0
      || !Array.isArray(manifest.progressPaths) || manifest.progressPaths.length !== 0
      || manifest.databaseWrites !== false
      || manifest.networkAccess !== false) {
    throw new Error('historical disposition execution manifest contract is invalid');
  }

  const binding = normalizeHistoricalDispositionCandidateBinding(manifest);
  if (!Array.isArray(manifest.inputPaths) || manifest.inputPaths.length !== 1
      || manifest.inputPaths[0] !== binding.candidatePath) {
    throw new Error('historical disposition manifest must bind exactly one candidate input path');
  }
  if (!manifest.scope || typeof manifest.scope !== 'object' || Array.isArray(manifest.scope)
      || manifest.scope.domainId !== binding.domainId
      || manifest.scope.candidateArtifactHash !== binding.candidateArtifactHash
      || !requireText(manifest.scope.runId, 'historical disposition manifest scope runId')) {
    throw new Error('historical disposition manifest scope is invalid');
  }
  return manifest;
}

function normalizeHistoricalDispositionCandidateBinding(manifest) {
  const candidates = [
    ['historicalSourceHashDisposition', manifest?.historicalSourceHashDisposition],
    ['historicalSourceHashDispositionCandidate', manifest?.historicalSourceHashDispositionCandidate],
    ['historicalDispositionCandidate', manifest?.historicalDispositionCandidate],
    ['candidate', manifest?.candidate],
  ].filter(([, value]) => value != null);
  if (candidates.length !== 1) {
    throw new Error('historical disposition manifest candidate binding is required exactly once');
  }
  const [label, value] = candidates[0];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} candidate binding is invalid`);
  }
  const candidatePath = requireConsistentAlias([
    ['candidatePath', value.candidatePath],
    ['path', value.path],
  ], 'historical disposition candidate path', (candidate) => requireNormalizedPath(
    candidate,
    'historical disposition candidate path',
  ));
  const match = HISTORICAL_DISPOSITION_CANDIDATE_PATH_PATTERN.exec(candidatePath);
  if (!match) {
    throw new Error('historical disposition candidate path must be content-addressed');
  }
  const candidateFileSha256 = requireHash(
    requireConsistentAlias([
      ['candidateFileSha256', value.candidateFileSha256],
      ['fileSha256', value.fileSha256],
      ['sha256', value.sha256],
    ], 'historical disposition candidate file hash'),
    'historical disposition candidate file hash',
  );
  const candidateArtifactHash = requireHash(
    requireConsistentAlias([
      ['candidateArtifactHash', value.candidateArtifactHash],
      ['artifactHash', value.artifactHash],
    ], 'historical disposition candidate artifact hash'),
    'historical disposition candidate artifact hash',
  );
  if (match[2] !== candidateArtifactHash.slice(7)) {
    throw new Error('historical disposition candidate path hash does not match its artifact hash');
  }
  return {
    candidatePath,
    candidateFileSha256,
    candidateArtifactHash,
    domainId: match[1],
  };
}

function requireConsistentAlias(entries, label, normalize = (value) => value) {
  const present = entries.filter(([, value]) => value != null);
  if (present.length === 0) throw new Error(`${label} is required`);
  const first = normalize(present[0][1]);
  for (const [, value] of present.slice(1)) {
    if (normalize(value) !== first) {
      throw new Error(`${label} aliases conflict`);
    }
  }
  return first;
}

function readHistoricalDispositionDataEntries(repoRoot, manifest) {
  const binding = normalizeHistoricalDispositionCandidateBinding(manifest);
  const candidateEntry = readConfinedEntry(repoRoot, binding.candidatePath, {
    label: 'historical disposition candidate',
    privateFile: true,
  });
  const actualFileHash = `sha256:${createHash('sha256').update(candidateEntry.bytes).digest('hex')}`;
  if (actualFileHash !== binding.candidateFileSha256) {
    throw new Error('historical disposition candidate file hash drifted');
  }
  const candidate = parseJsonBytes(candidateEntry.bytes, 'historical disposition candidate');
  assertHistoricalDispositionCandidate(candidate, binding, manifest.scope);
  return [candidateEntry];
}

function assertHistoricalDispositionCandidate(candidate, binding, scope) {
  if (!candidate || candidate.schemaVersion !== 1
      || candidate.artifactKind !== 'l1-historical-source-hash-disposition'
      || candidate.operationId !== HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID
      || candidate.status !== 'candidate'
      || candidate.proposalOnly !== true
      || candidate.databaseName !== 'terria_v1_local'
      || candidate.disposition !== 'exclude_from_l1_qualification'
      || candidate.reasonCode !== 'legacy_semantic_json_source_hash'
      || candidate.domainId !== binding.domainId
      || !Array.isArray(candidate.entries) || candidate.entries.length !== 1
      || !candidate.entries[0]?.runId
      || candidate.artifactHash !== binding.candidateArtifactHash) {
    throw new Error('historical disposition candidate identity is invalid');
  }
  const { artifactHash, ...payload } = candidate;
  if (hashJson(payload) !== artifactHash) {
    throw new Error('historical disposition candidate artifact hash drifted');
  }
  if (scope.domainId !== candidate.domainId
      || scope.runId !== candidate.entries[0].runId
      || scope.candidateArtifactHash !== candidate.artifactHash) {
    throw new Error('historical disposition manifest scope does not match the candidate');
  }
}

function readL2AuthorizationDataEntries(repoRoot, operationId, executionManifest = null) {
  const inputPath = resolveL2AuthorizationInputPath(operationId, executionManifest);
  const inputAbsolute = path.resolve(repoRoot, inputPath);
  if (!fs.existsSync(inputAbsolute) || !fs.statSync(inputAbsolute).isFile()) return null;
  const inputEntry = readConfinedEntry(repoRoot, inputPath, {
    label: `${operationId} input`,
    privateFile: true,
  });
  const input = parseJsonBytes(inputEntry.bytes, `${operationId} input`);
  const entries = [inputEntry];
  if (operationId.endsWith('-l2-reauthorization')) {
    entries.push(readProjectionBoundEntry(repoRoot, input.proposalPath, input.proposalSha256, {
      label: `${operationId} proposal`,
      privateFile: true,
    }));
    assertReauthorizationProposalBinding(input, entries.at(-1), operationId);
  } else if (operationId.endsWith('-l2-promotion')) {
    entries.push(readProjectionBoundEntry(repoRoot, input.proposalPath, input.proposalSha256, {
      label: `${operationId} proposal`,
      privateFile: true,
    }));
    entries.push(readProjectionBoundEntry(repoRoot, input.policyArtifactPath, input.policyArtifactFileSha256, {
      label: `${operationId} policy ceiling artifact`,
      privateFile: true,
    }));
    if (operationId !== 'automation-biomes-l2-promotion') {
      entries.push(readProjectionBoundEntry(
        repoRoot,
        input.policyRegistrationResultPath,
        input.policyRegistrationResultFileSha256,
        { label: `${operationId} policy registration result`, privateFile: true },
      ));
      entries.push(readProjectionBoundEntry(
        repoRoot,
        input.policyRegistrationCommitMarkerPath,
        input.policyRegistrationCommitMarkerFileSha256,
        { label: `${operationId} policy registration commit marker`, privateFile: true },
      ));
    }
  } else {
    entries.push(readProjectionBoundEntry(repoRoot, input.artifactPath, input.artifactFileSha256, {
      label: `${operationId} policy ceiling artifact`,
      privateFile: true,
    }));
    const registrationMode = executionManifest?.policyCeilingRegistration?.mode ?? 'register';
    if (registrationMode === 'recover') {
      const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
      if (!executionManifest?.command?.includes('--recover=true')
          || !executionManifest?.inputPaths?.includes(resultPath)) {
        throw new Error(`${operationId} recovery manifest does not bind the pending result`);
      }
      entries.push(readConfinedEntry(repoRoot, resultPath, {
        label: `${operationId} pending result`,
        privateFile: true,
      }));
    }
  }
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`${operationId} data bundle contains duplicate path: ${entry.path}`);
    seen.add(entry.path);
  }
  return entries;
}

function assertReauthorizationProposalBinding(input, proposalEntry, operationId) {
  const expectedPrefix = `reports/authorization/canonical/${operationId}/`;
  const proposalPath = requireNormalizedPath(input.proposalPath, `${operationId} proposal path`);
  if (!proposalPath.startsWith(expectedPrefix)
      || !/^[a-f0-9]{64}\/proposal\.json$/.test(proposalPath.slice(expectedPrefix.length))) {
    throw new Error(`${operationId} proposal path must be content-addressed`);
  }
  const proposal = parseJsonBytes(proposalEntry.bytes, `${operationId} proposal`);
  if (proposal?.operationId !== operationId || proposal?.proposalOnly !== true
      || proposal?.proposalHash !== input.proposalHash) {
    throw new Error(`${operationId} proposal identity does not match the input`);
  }
  if (proposalPath.slice(expectedPrefix.length, expectedPrefix.length + 64)
      !== String(input.proposalHash ?? '').slice(7)) {
    throw new Error(`${operationId} proposal path does not match proposalHash`);
  }
}

function resolveL2AuthorizationInputPath(operationId, executionManifest) {
  const inputPath = executionManifest?.inputPaths?.[0]
    ?? `reports/authorization/canonical/${operationId}.input.json`;
  const normalized = requireNormalizedPath(inputPath, `${operationId} input path`);
  const prefix = `reports/authorization/canonical/${operationId}`;
  const match = new RegExp(`^${escapeRegExp(prefix)}(?:\\.([a-z0-9]+(?:-[a-z0-9]+)*))?\\.input\\.json$`).exec(normalized);
  if (!match) throw new Error(`${operationId} input path must use the exact operation identity and optional retry label`);
  if (executionManifest?.resultLabel != null && match[1] !== executionManifest.resultLabel) {
    throw new Error(`${operationId} input path retry label does not match the execution manifest`);
  }
  return normalized;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readItemImageLineageDataEntries(repoRoot, manifest) {
  const attempt = manifest?.itemImageLineageAttempt;
  const attemptRoot = requireNormalizedPath(attempt?.attemptRoot, 'lineage attempt root');
  const prefix = 'reports/authorization/canonical/item-image-lineage-apply/';
  if (!attemptRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(attemptRoot.slice(prefix.length))) {
    throw new Error('lineage execution manifest attempt root is invalid');
  }
  const inputPath = requireNormalizedPath(attempt?.inputPath, 'lineage input path');
  const bundlePath = requireNormalizedPath(attempt?.bundlePath, 'lineage bundle path');
  if (inputPath !== `${attemptRoot}/input.json`
      || bundlePath !== `${attemptRoot}/bundle.json`) {
    throw new Error('lineage execution manifest paths must share the exact attempt root');
  }
  const inputEntry = readConfinedEntry(repoRoot, inputPath, {
    label: 'lineage input contract',
    privateFile: true,
  });
  const bundleEntry = readConfinedEntry(repoRoot, bundlePath, {
    label: 'lineage bundle',
    privateFile: false,
  });
  let input;
  try {
    input = JSON.parse(inputEntry.bytes.toString('utf8'));
  } catch {
    throw new Error('lineage input contract must be valid JSON');
  }
  if (input?.operationId !== 'canonical-item-image-lineage-apply'
      || input?.lineageBundle?.path !== bundlePath) {
    throw new Error('lineage input contract must bind the exact manifest bundle path');
  }
  const bundleSha256 = `sha256:${createHash('sha256').update(bundleEntry.bytes).digest('hex')}`;
  if (input.lineageBundle.sha256 !== bundleSha256) {
    throw new Error('lineage input contract bundle hash drifted');
  }
  return [inputEntry, bundleEntry];
}

function readItemSourceLocalNpcAdmissionDataEntries(repoRoot, manifest) {
  const attempt = manifest?.itemSourceLocalNpcAdmissionAttempt;
  const attemptRoot = requireNormalizedPath(attempt?.attemptRoot, 'Item-source admission attempt root');
  const prefix = 'reports/authorization/canonical/canonical-item-source-local-npc-admission/';
  if (!attemptRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(attemptRoot.slice(prefix.length))) {
    throw new Error('Item-source admission execution manifest attempt root is invalid');
  }
  const inputPath = requireNormalizedPath(attempt?.inputPath, 'Item-source admission input path');
  const proposalPath = requireNormalizedPath(attempt?.proposalPath, 'Item-source admission proposal path');
  const expectedInputPath = `${attemptRoot}/input.json`;
  const expectedProposalPath = `${attemptRoot}/proposal.json`;
  const expectedManifestPath = `${attemptRoot}/execution-manifest.json`;
  const expectedRequestPath = `${attemptRoot}/request.json`;
  const expectedPacketPath = `${attemptRoot}/packet.json`;
  const expectedPermitPath = `${attemptRoot}/permit.json`;
  const expectedResultPath = `${attemptRoot}/result.json`;
  if (inputPath !== expectedInputPath || proposalPath !== expectedProposalPath
      || attempt?.manifestPath !== expectedManifestPath || attempt?.requestPath !== expectedRequestPath
      || attempt?.packetPath !== expectedPacketPath || attempt?.permitPath !== expectedPermitPath
      || attempt?.resultPath !== expectedResultPath) {
    throw new Error('Item-source admission execution manifest paths must share the exact attempt root');
  }
  const inputEntry = readConfinedEntry(repoRoot, inputPath, {
    label: 'Item-source admission input contract', privateFile: true,
  });
  const input = parseJsonBytes(inputEntry.bytes, 'Item-source admission input contract');
  assertItemSourceLocalNpcAdmissionInputContract(input);
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(
    input.proposalAuthorization.decisionIdentity,
  );
  if (JSON.stringify(stableValue(paths)) !== JSON.stringify(stableValue(attempt))
      || input.attemptId !== paths.attemptId || input.attemptRoot !== paths.attemptRoot
      || input.proposalPath !== paths.proposalPath) {
    throw new Error('Item-source admission attempt binding drifted from the input contract');
  }
  const proposalEntry = readProjectionBoundEntry(
    repoRoot,
    input.proposalPath,
    input.proposalSha256,
    { label: 'Item-source admission proposal', privateFile: true },
  );
  const proposal = parseJsonBytes(proposalEntry.bytes, 'Item-source admission proposal');
  assertItemSourceLocalNpcAdmissionProposal(proposal);
  if (!itemSourceLocalNpcAdmissionInputMatchesProposal(input, proposal)) {
    throw new Error('Item-source admission input contract drifted from the proposal');
  }
  const entries = [
    inputEntry,
    proposalEntry,
    readProjectionBoundEntry(repoRoot, input.sourceFreeze.partition.path,
      input.sourceFreeze.partition.sha256, { label: 'Item-source admission frozen partition', privateFile: false }),
  ];
  for (const pair of input.sourceFreeze.snapshotPairs) {
    entries.push(readProjectionBoundEntry(repoRoot, pair.normalizedPath,
      pair.normalizedSha256, { label: 'Item-source admission normalized NPC snapshot', privateFile: false }));
    entries.push(readProjectionBoundEntry(repoRoot, pair.auditPath,
      pair.auditSha256, { label: 'Item-source admission NPC audit snapshot', privateFile: false }));
  }
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`Item-source admission data bundle duplicates ${entry.path}`);
    seen.add(entry.path);
  }
  return entries;
}

function buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity) {
  const identity = requireText(decisionIdentity, 'Item-source admission decision identity');
  const attemptId = createHash('sha256').update(identity, 'utf8').digest('hex');
  const attemptRoot = `reports/authorization/canonical/${ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID}/${attemptId}`;
  return {
    attemptId,
    attemptRoot,
    proposalPath: `${attemptRoot}/proposal.json`,
    inputPath: `${attemptRoot}/input.json`,
    manifestPath: `${attemptRoot}/execution-manifest.json`,
    requestPath: `${attemptRoot}/request.json`,
    packetPath: `${attemptRoot}/packet.json`,
    permitPath: `${attemptRoot}/permit.json`,
    resultPath: `${attemptRoot}/result.json`,
  };
}

function assertItemSourceLocalNpcAdmissionInputContract(input) {
  if (!input || input.schemaVersion !== 'item-source-local-npc-admission-input-v1'
      || input.operationId !== ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID || input.apply !== true) {
    throw new Error('Item-source admission input contract identity is invalid');
  }
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(
    requireText(input.proposalAuthorization?.decisionIdentity, 'Item-source admission decision identity'),
  );
  if (input.attemptId !== paths.attemptId || input.attemptRoot !== paths.attemptRoot
      || input.proposalPath !== paths.proposalPath || !HASH_PATTERN.test(input.proposalSha256 ?? '')
      || !HASH_PATTERN.test(input.proposalScopeHash ?? '') || !HASH_PATTERN.test(input.selectedIdentityHash ?? '')
      || !HASH_PATTERN.test(input.beforeFingerprint ?? '') || !HASH_PATTERN.test(input.afterFingerprint ?? '')
      || !input.sourceFreeze?.partition || !Array.isArray(input.sourceFreeze.snapshotPairs)
      || input.sourceFreeze.snapshotPairs.length === 0 || !input.tableBeforeFingerprints) {
    throw new Error('Item-source admission input contract binding is invalid');
  }
  return input;
}

function assertItemSourceLocalNpcAdmissionProposal(proposal) {
  if (!proposal || proposal.schemaVersion !== 'item-source-local-npc-admission-proposal-v1'
      || proposal.operationId !== ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID
      || proposal.readOnly !== true || proposal.authorizationAllowed !== true
      || Number(proposal.summary?.accepted) < 1 || Number(proposal.summary?.blocked) !== 0
      || Number(proposal.summary?.unclassified) !== 0) {
    throw new Error('Item-source admission proposal is not authorization-eligible');
  }
  return proposal;
}

function itemSourceLocalNpcAdmissionInputMatchesProposal(input, proposal) {
  return input.proposalScopeHash === proposal.scopeHash
    && input.selectedIdentityHash === proposal.selectedIdentityHash
    && input.beforeFingerprint === proposal.beforeFingerprint
    && input.afterFingerprint === proposal.afterFingerprint
    && Number(input.expectedChangedRowCount) === Number(proposal.changedRowCount)
    && Number(input.expectedAcceptedCount) === Number(proposal.summary?.accepted)
    && Number(input.expectedLocalSourceReconciliationCount)
      === Number(proposal.summary?.localSourceReconciliation)
    && JSON.stringify(stableValue(input.databaseFingerprint))
      === JSON.stringify(stableValue(proposal.databaseFingerprint))
    && JSON.stringify(stableValue(input.sourceFreeze))
      === JSON.stringify(stableValue(proposal.sourceFreeze))
    && JSON.stringify(stableValue(input.tableBeforeFingerprints))
      === JSON.stringify(stableValue(proposal.tableBeforeFingerprints));
}

function readItemImageProvenanceDataEntries(repoRoot, manifest) {
  const attempt = manifest?.itemImageProvenanceAttempt;
  const attemptRoot = requireNormalizedPath(attempt?.attemptRoot, 'provenance attempt root');
  const prefix = 'reports/authorization/canonical/item-image-provenance-patch/';
  if (!attemptRoot.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(attemptRoot.slice(prefix.length))) {
    throw new Error('provenance execution manifest attempt root is invalid');
  }
  const inputPath = requireNormalizedPath(attempt?.inputPath, 'provenance input path');
  const previewPath = requireNormalizedPath(attempt?.previewPath, 'provenance preview path');
  if (inputPath !== `${attemptRoot}/input.json` || previewPath !== `${attemptRoot}/preview.json`) {
    throw new Error('provenance execution manifest paths must share the exact attempt root');
  }
  const inputEntry = readConfinedEntry(repoRoot, inputPath, { label: 'provenance input contract', privateFile: true });
  const previewEntry = readConfinedEntry(repoRoot, previewPath, { label: 'provenance preview', privateFile: true });
  let input;
  let preview;
  try {
    input = JSON.parse(inputEntry.bytes.toString('utf8'));
    preview = JSON.parse(previewEntry.bytes.toString('utf8'));
  } catch {
    throw new Error('provenance input and preview must be valid JSON');
  }
  if (input?.operationId !== 'canonical-item-image-provenance-patch'
      || preview?.operationId !== input.operationId
      || input.previewSha256 !== `sha256:${createHash('sha256').update(previewEntry.bytes).digest('hex')}`) {
    throw new Error('provenance input must bind the exact attempt preview');
  }
  return [inputEntry, previewEntry];
}

function readTwoItemImageQuarantineRepairDataEntries(repoRoot, manifest) {
  const attempt = manifest?.twoItemImageQuarantineRepairAttempt;
  const attemptRoot = requireNormalizedPath(attempt?.attemptRoot, 'two-item attempt root');
  const prefix = 'reports/authorization/canonical/two-item-image-quarantine-repair/';
  if (!attemptRoot.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(attemptRoot.slice(prefix.length))) throw new Error('two-item execution manifest attempt root is invalid');
  const inputPath = requireNormalizedPath(attempt?.inputPath, 'two-item input path');
  const previewPath = requireNormalizedPath(attempt?.previewPath, 'two-item preview path');
  if (inputPath !== `${attemptRoot}/input.json` || previewPath !== `${attemptRoot}/preview.json`) throw new Error('two-item execution manifest paths must share the exact attempt root');
  const inputEntry = readConfinedEntry(repoRoot, inputPath, { label: 'two-item input contract', privateFile: true });
  const previewEntry = readConfinedEntry(repoRoot, previewPath, { label: 'two-item preview', privateFile: true });
  let input; let preview;
  try { input = JSON.parse(inputEntry.bytes.toString('utf8')); preview = JSON.parse(previewEntry.bytes.toString('utf8')); } catch { throw new Error('two-item input and preview must be valid JSON'); }
  if (input?.operationId !== 'canonical-two-item-image-quarantine-repair' || preview?.operationId !== input.operationId || input.previewSha256 !== `sha256:${createHash('sha256').update(previewEntry.bytes).digest('hex')}`) throw new Error('two-item input must bind the exact attempt preview');
  return [inputEntry, previewEntry];
}

function requiredTechnicalFieldsForOperation(operationId) {
  if (operationId === 'canonical-npc-external-relation-scope-apply') {
    return ['serverFingerprint', 'schemaBundleSha256', 'dataBundleSha256', 'executionManifestHash'];
  }
  if (operationId === 'automation-biomes-l0-bootstrap') {
    return [...BOOTSTRAP_REQUIRED_TECHNICAL_FIELDS];
  }
  if (['canonical-npc-t1-acceptance', 'canonical-recipe-t1-acceptance', 'canonical-boss-t1-acceptance', 'canonical-projectile-t1-acceptance', 'canonical-buff-t1-acceptance', 'canonical-biome-t1-acceptance'].includes(operationId)) {
    return [...ISOLATED_T1_REQUIRED_TECHNICAL_FIELDS];
  }
  return [...EXECUTABLE_REQUIRED_TECHNICAL_FIELDS];
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

export function deriveCanonicalTechnicalIdentity(input) {
  const operationId = requireOperationId(input.operationId);
  const targetDatabases = requireFormalDatabases(input.targetDatabases);
  const requiredTechnicalFields = requireTechnicalFields(
    input.requiredTechnicalFields ?? DEFAULT_REQUIRED_TECHNICAL_FIELDS,
  );
  assertNpcT1ManifestServerIdentity({
    operationId,
    executionManifest: input.executionManifest,
    serverFingerprint: input.serverFingerprint,
  });
  const technical = {
    operationId,
    targetDatabases,
    serverFingerprint: input.serverFingerprint == null
      ? null
      : hashCanonicalServerFingerprint(input.serverFingerprint),
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
  if (operationId === ARMOR_CANONICAL_OPERATION_ID && input.executionManifest?.armorCanonicalIntent) {
    const binding = input.executionManifest.armorCanonicalIntent;
    if (technical.serverFingerprint !== binding.serverFingerprint) {
      throw new Error('Armor canonical operation server fingerprint drifted from the execution manifest binding');
    }
    if (technical.policySetHash !== binding.policySetHash) {
      throw new Error('Armor canonical operation policy set drifted from the execution manifest binding');
    }
  }
  return technical;
}

function deriveTechnicalIdentity(input) {
  return deriveCanonicalTechnicalIdentity(input);
}

function assertNpcT1ManifestServerIdentity({ operationId, executionManifest, serverFingerprint } = {}) {
  if (!['canonical-npc-t1-acceptance', 'canonical-recipe-t1-acceptance', 'canonical-boss-t1-acceptance', 'canonical-projectile-t1-acceptance', 'canonical-buff-t1-acceptance', 'canonical-biome-t1-acceptance'].includes(operationId) || executionManifest == null || serverFingerprint == null) {
    return;
  }
  const frozen = canonicalServerFingerprint(executionManifest?.isolatedAcceptance?.serverFingerprint);
  const supplied = canonicalServerFingerprint(serverFingerprint);
  if (JSON.stringify(frozen) !== JSON.stringify(supplied)) {
    throw new Error('NPC T1 isolated config server identity differs from the authorization fingerprint');
  }
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

function readItemImageProjectionMissingRowInsertDataEntries(repoRoot, manifest) {
  const attempt = manifest?.itemImageProjectionMissingRowInsertAttempt;
  const inputPath = requireProjectionManifestPath(manifest?.inputPaths, 'input');
  if (attempt?.attemptRoot == null || inputPath !== `${attempt.attemptRoot}/input.json`) {
    throw new Error('missing-row insert manifest input must share its attempt root');
  }
  const inputEntry = readConfinedEntry(repoRoot, inputPath, {
    label: 'missing-row insert input contract',
    privateFile: true,
  });
  const input = parseJsonBytes(inputEntry.bytes, 'missing-row insert input contract');
  if (input?.operationId !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID
      || input?.attemptRoot !== attempt.attemptRoot
      || Number(input?.insertedRowCount) !== 5
      || JSON.stringify(input?.keys) !== JSON.stringify([
        'AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood',
      ])) {
    throw new Error('missing-row insert input contract is not the exact five-row scope');
  }
  const expectedAttemptId = createHash('sha256')
    .update(String(input.proposalAuthorization?.decisionIdentity ?? ''), 'utf8')
    .digest('hex');
  const expectedAttemptRoot = `reports/authorization/canonical/item-image-projection-missing-row-insert/${expectedAttemptId}`;
  if (expectedAttemptRoot !== attempt.attemptRoot) {
    throw new Error('missing-row insert input attempt root is not decision-derived');
  }
  return [inputEntry];
}

function readItemCanonicalBaseEntityRestorationDataEntries(repoRoot, manifest) {
  const attemptRoot = requireNormalizedPath(
    manifest?.itemCanonicalBaseEntityRestorationAttempt?.attemptRoot,
    'canonical restoration attempt root',
  );
  const prefix = 'reports/authorization/canonical/item-canonical-base-entity-restoration/';
  if (!attemptRoot.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(attemptRoot.slice(prefix.length))) {
    throw new Error('canonical restoration execution manifest attempt root is invalid');
  }
  const inputPath = requireProjectionManifestPath(manifest?.inputPaths, 'input');
  if (inputPath !== `${attemptRoot}/input.json`) {
    throw new Error('canonical restoration execution manifest input path drifted');
  }
  const inputEntry = readConfinedEntry(repoRoot, inputPath, {
    label: 'canonical restoration input contract', privateFile: true,
  });
  const input = parseJsonBytes(inputEntry.bytes, 'canonical restoration input contract');
  if (input?.operationId !== 'canonical-item-base-entity-restoration' || input?.apply !== true
      || input?.attemptRoot !== attemptRoot || input?.attemptId !== attemptRoot.slice(prefix.length)
      || input?.maintRows?.length !== 5 || input?.relationRows?.length !== 5
      || input?.projectionRows?.length !== 5 || input?.legacyMaintRows?.length !== 5
      || input?.legacyRelationRows?.length !== 5 || input?.legacyProjectionRows?.length !== 5
      || input?.legacyProjectileAudits?.length !== 5) {
    throw new Error('canonical restoration input contract is not the exact reconciliation scope');
  }
  const paths = [
    ['proposalPath', 'canonical restoration proposal'],
    ['snapshotPath', 'canonical restoration snapshot'],
    ['archivePath', 'canonical restoration archive'],
    ['proposalAuthorization.path', 'canonical restoration proposal-read Owner authorization'],
  ];
  const entries = [inputEntry];
  for (const [field, label] of paths) {
    const value = field.includes('.')
      ? field.split('.').reduce((current, key) => current?.[key], input)
      : input[field];
    const relativePath = requireNormalizedPath(value, `${label} path`);
    if (!relativePath.startsWith(`${attemptRoot}/`)) {
      throw new Error(`${label} must be inside the same restoration attempt`);
    }
    entries.push(readConfinedEntry(repoRoot, relativePath, { label, privateFile: true }));
  }
  const standardizedPath = requireNormalizedPath(
    input?.standardizedSource?.path,
    'canonical restoration standardized source path',
  );
  if (standardizedPath !== 'data/standardized/items.standardized.json') {
    throw new Error('canonical restoration standardized source path drifted');
  }
  entries.push(readConfinedEntry(repoRoot, standardizedPath, {
    label: 'canonical restoration standardized source', privateFile: false,
  }));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`canonical restoration data bundle duplicates ${entry.path}`);
    seen.add(entry.path);
  }
  return entries;
}

function readItemImageProjectionDataEntries(repoRoot, manifest) {
  const inputPath = requireProjectionManifestPath(manifest?.inputPaths, 'input');
  const inputEntry = readConfinedEntry(repoRoot, inputPath, {
    label: 'projection input contract',
    privateFile: true,
  });
  const input = parseJsonBytes(inputEntry.bytes, 'projection input contract');
  assertItemImageProjectionInputContract(input);
  const manifestBinding = manifest?.itemImageProjectionAttempt?.inputBinding;
  if (JSON.stringify(stableValue(manifestBinding))
      !== JSON.stringify(stableValue(projectionInputBinding(input)))) {
    throw new Error('projection execution manifest input binding drifted');
  }

  const proposalEntry = readProjectionBoundEntry(repoRoot, input.proposalPath, input.proposalSha256, {
    label: 'projection proposal',
    privateFile: true,
  });
  const proposal = parseJsonBytes(proposalEntry.bytes, 'projection proposal');
  assertItemImageProjectionProposal(proposal);
  const rebuiltInput = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: input.proposalPath,
    proposalSha256: input.proposalSha256,
  });
  if (JSON.stringify(stableValue(rebuiltInput)) !== JSON.stringify(stableValue(input))) {
    throw new Error('projection proposal content drifted from the input contract');
  }

  const snapshotEntry = readProjectionBoundEntry(repoRoot, input.snapshotPath, input.snapshotSha256, {
    label: 'projection snapshot',
    privateFile: true,
  });
  const snapshot = parseJsonBytes(snapshotEntry.bytes, 'projection snapshot');
  assertItemImageProjectionSnapshot(snapshot);
  if (JSON.stringify(stableValue(snapshot))
      !== JSON.stringify(stableValue(projectionSnapshotBinding(input)))) {
    throw new Error('projection snapshot content drifted from the input contract');
  }

  const ownerEntry = readProjectionBoundEntry(
    repoRoot,
    input.proposalAuthorization.path,
    input.proposalAuthorization.sha256,
    { label: 'projection proposal-read Owner authorization', privateFile: true },
  );
  const ownerAuthorization = parseJsonBytes(
    ownerEntry.bytes,
    'projection proposal-read Owner authorization',
  );
  assertProjectionProposalAuthorization(ownerAuthorization, input);

  let lineageEntries;
  if (input.lineage.kind === 'origin-repair-bound') {
    lineageEntries = [readProjectionBoundEntry(
      repoRoot,
      input.lineage.originRepairResultPath,
      input.lineage.originRepairResultSha256,
      { label: 'origin repair result', privateFile: false },
    )];
    const originResult = parseJsonBytes(lineageEntries[0].bytes, 'origin repair result');
    if (originResult.operationId !== input.lineage.originRepairOperationId
        || originResult.status !== input.lineage.originRepairStatus
        || originResult.scopeHash !== input.lineage.originRepairScopeHash
        || originResult.externalRequests !== false) {
      throw new Error('origin repair result identity drifted from projection input');
    }
  } else {
    const lineageBindings = [
      ['inputContractPath', 'inputContractSha256', 'lineage input contract', true],
      ['resultPath', 'resultSha256', 'lineage result', true],
      ['bundlePath', 'bundleSha256', 'lineage bundle', false],
      ['applySnapshotPath', 'applySnapshotSha256', 'lineage apply snapshot', true],
      ['authorizationPacketPath', 'authorizationPacketSha256', 'lineage authorization packet', true],
    ];
    lineageEntries = lineageBindings.map(([pathKey, hashKey, label, privateFile]) => (
      readProjectionBoundEntry(repoRoot, input.lineage[pathKey], input.lineage[hashKey], {
        label,
        privateFile,
      })
    ));
    const historicalPacket = parseJsonBytes(
      lineageEntries.at(-1).bytes,
      'lineage authorization packet',
    );
    assertItemImageProjectionAuthorizationPacket(historicalPacket);
    if (historicalPacket.decisionIdentity !== input.lineage.decisionIdentity
        || historicalPacket.packetHash !== input.lineage.packetHash) {
      throw new Error('lineage authorization packet identity drifted from projection input');
    }
  }

  const policyEntry = readProjectionBoundEntry(
    repoRoot,
    input.managedUrlPolicy.sourcePath,
    input.managedUrlPolicy.sourceSha256,
    { label: 'projection managed URL policy', privateFile: false },
  );
  const entries = [
    inputEntry,
    proposalEntry,
    snapshotEntry,
    ownerEntry,
    ...lineageEntries,
    policyEntry,
  ];
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      throw new Error(`projection data bundle contains duplicate path: ${entry.path}`);
    }
    seen.add(entry.path);
  }
  return entries;
}

function requireProjectionManifestPath(paths, label) {
  if (!Array.isArray(paths) || paths.length !== 1) {
    throw new Error(`projection execution manifest must declare exactly one ${label} path`);
  }
  return requireNormalizedPath(paths[0], `projection execution manifest ${label} path`);
}

function readProjectionBoundEntry(repoRoot, relativePath, expectedSha256, options) {
  if (!HASH_PATTERN.test(expectedSha256 ?? '')) {
    throw new Error(`${options.label} hash is invalid`);
  }
  const entry = readConfinedEntry(repoRoot, relativePath, options);
  const actualSha256 = `sha256:${createHash('sha256').update(entry.bytes).digest('hex')}`;
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${options.label} hash drifted`);
  }
  return entry;
}

function readConfinedEntry(repoRoot, relativePath, { label, privateFile }) {
  const normalized = requireNormalizedPath(relativePath, `${label} path`);
  const absolutePath = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, normalized),
    label,
  });
  assertRepositoryOrdinaryFile({ repoRoot, filePath: absolutePath, label });
  if (privateFile && (fs.statSync(absolutePath).mode & 0o077) !== 0) {
    throw new Error(`${label} must be private`);
  }
  return { path: normalized, bytes: fs.readFileSync(absolutePath) };
}

function assertProjectionProposalAuthorization(value, input) {
  const expectedKeys = [
    'schemaVersion',
    'authorizationKind',
    'operationId',
    'action',
    'actor',
    'reason',
    'authorizationReference',
    'decisionIdentity',
    'authorizedAt',
    'expiresAt',
    'targetDatabases',
    'noWrite',
    'authorizationHash',
  ].sort();
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('projection proposal-read Owner authorization schema drifted');
  }
  if (value.schemaVersion !== 1
      || value.authorizationKind !== 'canonical_read_only_proposal_authorization'
      || value.operationId !== 'canonical-item-image-projection-apply'
      || value.action !== 'read-only-proposal'
      || value.noWrite !== true) {
    throw new Error('projection proposal-read Owner authorization contract drifted');
  }
  requireText(value.actor, 'projection proposal-read Owner actor');
  requireText(value.reason, 'projection proposal-read Owner reason');
  requireText(value.authorizationReference, 'projection proposal-read Owner reference');
  requireTimestamp(value.authorizedAt, 'projection proposal-read Owner authorizedAt');
  requireTimestamp(value.expiresAt, 'projection proposal-read Owner expiresAt');
  const { authorizationHash, ...payload } = value;
  if (canonicalItemImageProjectionHash(payload) !== authorizationHash
      || authorizationHash !== input.proposalAuthorization.authorizationHash
      || value.decisionIdentity !== input.proposalAuthorization.decisionIdentity) {
    throw new Error('projection proposal-read Owner authorization hash or identity drifted');
  }
  if (JSON.stringify(value.targetDatabases)
      !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) {
    throw new Error('projection proposal-read Owner authorization target databases drifted');
  }
}

function projectionInputBinding(input) {
  return {
    operationId: input.operationId,
    contractVersion: input.contractVersion,
    attemptId: input.attemptId,
    attemptRoot: input.attemptRoot,
    proposalAuthorization: input.proposalAuthorization,
    proposalPath: input.proposalPath,
    proposalSha256: input.proposalSha256,
    snapshotPath: input.snapshotPath,
    snapshotSha256: input.snapshotSha256,
    lineage: input.lineage,
    target: input.target,
    managedUrlPolicy: input.managedUrlPolicy,
    managedUrlPrefixes: input.managedUrlPrefixes,
    keys: input.keys,
    keySetSha256: input.keySetSha256,
    relationRowsSha256: input.relationRowsSha256,
    projectionBeforeSha256: input.projectionBeforeSha256,
    projectionAfterSha256: input.projectionAfterSha256,
    targetRowCount: input.targetRowCount,
    changedRowCount: input.changedRowCount,
  };
}

function projectionSnapshotBinding(input) {
  return {
    snapshotKind: 'canonical_item_image_projection_snapshot',
    operationId: input.operationId,
    contractVersion: input.contractVersion,
    generatedAt: input.generatedAt,
    target: input.target,
    managedUrlPolicy: input.managedUrlPolicy,
    managedUrlPrefixes: input.managedUrlPrefixes,
    keys: input.keys,
    keySetSha256: input.keySetSha256,
    relationRows: input.relationRows,
    relationRowsSha256: input.relationRowsSha256,
    projectionBeforeRows: input.projectionBeforeRows,
    projectionBeforeSha256: input.projectionBeforeSha256,
    targetRowCount: input.targetRowCount,
  };
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function readMigrationEntries(repoRoot) {
  const dir = path.join(repoRoot, 'services', 'catalog-api', 'src', 'main', 'resources', 'db', 'migration');
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^V5[678]__.*\.sql$/.test(name)).sort()
    : [];
  if (names.length !== 3 || !names[0].startsWith('V56__') || !names[1].startsWith('V57__')
      || !names[2].startsWith('V58__')) {
    throw new Error('canonical schema request requires exact V56, V57, and V58 migration bytes');
  }
  return names.map((name) => readEntry(repoRoot, `services/catalog-api/src/main/resources/db/migration/${name}`));
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

function readSchedulerActivationPolicyDataEntries(repoRoot, operationId, executionManifest) {
  if (!Array.isArray(executionManifest?.inputPaths) || executionManifest.inputPaths.length !== 1) {
    throw new Error('scheduler activation execution manifest must declare exactly one input path');
  }
  const inputPath = requireNormalizedPath(
    executionManifest.inputPaths[0],
    'scheduler activation execution manifest input path',
  );
  const prefix = `reports/authorization/canonical/${operationId}`;
  const match = new RegExp(
    `^${escapeRegExp(prefix)}(?:\\.([a-z0-9]+(?:-[a-z0-9]+)*))?\\.input\\.json$`,
  ).exec(inputPath);
  if (!match || (executionManifest.resultLabel != null && match[1] !== executionManifest.resultLabel)) {
    throw new Error('scheduler activation manifest input path must match its retry label');
  }
  return [readConfinedEntry(repoRoot, inputPath, {
    label: 'scheduler activation policy input',
    privateFile: true,
  })];
}

function readArmorCanonicalIntentDataEntries(repoRoot, executionManifest) {
  const binding = executionManifest?.armorCanonicalIntent;
  const intentPath = requireNormalizedPath(binding?.intentPath, 'Armor canonical intent path');
  if (!Array.isArray(executionManifest?.inputPaths)
      || executionManifest.inputPaths.length !== 1
      || executionManifest.inputPaths[0] !== intentPath
      || executionManifest.resultLabel == null
      || intentPath !== `reports/authorization/canonical/${ARMOR_CANONICAL_OPERATION_ID}.${executionManifest.resultLabel}.intent.json`) {
    throw new Error('Armor canonical intent execution manifest path drifted');
  }
  if (binding.schemaVersion !== 'armor-canonical-operation-binding/v1'
      || binding.operationId !== ARMOR_CANONICAL_OPERATION_ID
      || !HASH_PATTERN.test(binding.intentFileSha256 ?? '')
      || !HASH_PATTERN.test(binding.fullChainSha256 ?? '')
      || !HASH_PATTERN.test(binding.serverFingerprint ?? '')
      || !HASH_PATTERN.test(binding.policySetHash ?? '')
      || typeof binding.runId !== 'string' || !binding.runId.trim()
      || typeof binding.fenceToken !== 'string' || !binding.fenceToken.trim()
      || !binding.fenceCommit || !Number.isSafeInteger(binding.fenceCommit.generation)
      || binding.fenceCommit.generation < 1 || typeof binding.fenceCommit.marker !== 'string'
      || !binding.fenceCommit.marker.trim()) {
    throw new Error('Armor canonical intent operation binding is incomplete');
  }
  const entry = readConfinedEntry(repoRoot, intentPath, {
    label: 'Armor canonical full-chain intent', privateFile: true,
  });
  const actual = `sha256:${createHash('sha256').update(entry.bytes).digest('hex')}`;
  if (actual !== binding.intentFileSha256) throw new Error('Armor canonical full-chain intent bytes drifted');
  let intent;
  try { intent = JSON.parse(entry.bytes.toString('utf8')); }
  catch { throw new Error('Armor canonical full-chain intent must be valid JSON'); }
  if (intent.schemaVersion !== 'armor-canonical-full-chain-intent/v1'
      || intent.operationId !== ARMOR_CANONICAL_OPERATION_ID
      || intent.executable !== false
      || intent.executionBlocker !== 'registered-full-chain-executor-required'
      || !HASH_PATTERN.test(intent.fullChainSha256 ?? '')) {
    throw new Error('Armor canonical full-chain intent identity is invalid');
  }
  if (intent.fullChainSha256 !== binding.fullChainSha256) throw new Error('Armor canonical full-chain hash drifted from binding');
  return [entry];
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

function requireHash(value, label) {
  const hash = requireText(value, label);
  if (!HASH_PATTERN.test(hash)) throw new Error(`${label} must be a sha256 hash`);
  return hash;
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

function writeJsonAtomic(filePath, payload, { noOverwrite = false } = {}) {
  const output = path.resolve(filePath);
  if (noOverwrite && fs.existsSync(output)) {
    throw new Error('authorization artifact already exists; overwrite is forbidden');
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    if (noOverwrite) {
      fs.linkSync(temporary, output);
      fs.unlinkSync(temporary);
    } else {
      fs.renameSync(temporary, output);
    }
    fs.chmodSync(output, 0o600);
  } catch (error) {
    if (noOverwrite && error?.code === 'EEXIST') {
      throw new Error('authorization artifact already exists; overwrite is forbidden');
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function exactAttemptAuthorizationCliPaths({
  repoRoot,
  operationId,
  executionManifestPath,
  executionManifest,
  mode,
  outputPath,
  requestPath = null,
}) {
  if (operationId === HISTORICAL_SOURCE_HASH_DISPOSITION_OPERATION_ID) {
    const scope = executionManifest?.scope;
    const domainId = requireText(scope?.domainId, 'historical disposition manifest scope domain');
    const candidateArtifactHash = requireHash(
      scope?.candidateArtifactHash,
      'historical disposition manifest candidate artifact hash',
    );
    const expectedCandidatePath = `${HISTORICAL_DISPOSITION_CANDIDATE_ROOT}${domainId}/${candidateArtifactHash.slice(7)}/candidate.json`;
    const candidateBinding = executionManifest?.historicalSourceHashDisposition
      ?? executionManifest?.historicalSourceHashDispositionCandidate
      ?? executionManifest?.historicalDispositionCandidate
      ?? executionManifest?.candidate;
    if (!candidateBinding || requireNormalizedPath(
      candidateBinding.candidatePath ?? candidateBinding.path,
      'historical disposition candidate path',
    ) !== expectedCandidatePath) {
      throw new Error('historical disposition manifest candidate path does not match its scope');
    }
    const expectedPacketPath = `${HISTORICAL_DISPOSITION_CANDIDATE_ROOT}${domainId}/${candidateArtifactHash.slice(7)}/packet.json`;
    const expectedRequestPath = `${HISTORICAL_DISPOSITION_CANDIDATE_ROOT}${domainId}/${candidateArtifactHash.slice(7)}/request.json`;
    if (!HISTORICAL_DISPOSITION_PACKET_PATH_PATTERN.test(expectedPacketPath)) {
      throw new Error('historical disposition manifest scope is not a supported candidate path');
    }
    const normalizedOutput = requireNormalizedPath(outputPath, 'historical disposition authorization output path');
    const expectedOutput = mode === 'request' ? expectedRequestPath : expectedPacketPath;
    if (normalizedOutput !== expectedOutput) {
      throw new Error(`historical disposition ${mode} output must be the exact candidate-scoped ${path.posix.basename(expectedOutput)} path`);
    }
    if (mode === 'authorize') {
      const normalizedRequest = requireNormalizedPath(requestPath, 'historical disposition request path');
      if (normalizedRequest !== expectedRequestPath) {
        throw new Error('historical disposition authorization must read the exact candidate-scoped request path');
      }
    }
    const output = assertRepositoryPathConfinement({
      repoRoot,
      filePath: path.resolve(repoRoot, normalizedOutput),
      label: `historical disposition ${mode} output`,
    });
    return { output, noOverwrite: true };
  }
  const operation = EXACT_ATTEMPT_AUTHORIZATION_OPERATIONS[operationId];
  if (operation == null) {
    return { output: path.resolve(outputPath), noOverwrite: false };
  }
  const { attemptKey, label } = operation;
  if (!executionManifest) throw new Error(`${label} execution manifest is required`);
  const attempt = executionManifest[attemptKey];
  if (!attempt || typeof attempt !== 'object') {
    throw new Error(`${label} execution manifest attempt binding is required`);
  }
  const retainedResultPath = path.resolve(
    repoRoot,
    requireNormalizedPath(attempt.resultPath, `${label} result path`),
  );
  if (pathEntryExists(retainedResultPath)) {
    throw new Error(`${label} retained result already exists; retry requires a new attempt`);
  }
  const normalizedManifestPath = requireNormalizedPath(
    executionManifestPath,
    `${label} execution manifest path`,
  );
  if (normalizedManifestPath !== attempt.manifestPath) {
    throw new Error(`${label} execution manifest path must be the exact attempt manifest path`);
  }
  const absoluteManifestPath = path.resolve(repoRoot, normalizedManifestPath);
  assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: absoluteManifestPath,
    label: `${label} execution manifest`,
  });
  if ((fs.statSync(absoluteManifestPath).mode & 0o077) !== 0) {
    throw new Error(`${label} execution manifest must be private`);
  }
  const expectedOutput = mode === 'request' ? attempt.requestPath : attempt.packetPath;
  const normalizedOutput = requireNormalizedPath(outputPath, `${label} ${mode} output path`);
  if (normalizedOutput !== expectedOutput) {
    throw new Error(`${label} ${mode} output must be the exact attempt ${path.posix.basename(expectedOutput)} path`);
  }
  if (mode === 'authorize') {
    const normalizedRequest = requireNormalizedPath(requestPath, `${label} request path`);
    if (normalizedRequest !== attempt.requestPath) {
      throw new Error(`${label} authorization must read the exact same-attempt request path`);
    }
    const absoluteRequestPath = path.resolve(repoRoot, normalizedRequest);
    assertRepositoryOrdinaryFile({
      repoRoot,
      filePath: absoluteRequestPath,
      label: `${label} authorization request`,
    });
    if ((fs.statSync(absoluteRequestPath).mode & 0o077) !== 0) {
      throw new Error(`${label} authorization request must be private`);
    }
  }
  const output = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, normalizedOutput),
    label: `${label} ${mode} output`,
  });
  return { output, noOverwrite: true };
}

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? 'request';
  const operationId = args['operation-id'];
  const rawOutput = requireText(args.output, 'output');
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  const serverFingerprint = readOptionalJson(args['server-fingerprint']);
  const policyRows = readOptionalJson(args['policy-rows']) ?? [];
  const executionManifest = readOptionalJson(args['execution-manifest']);
  const cliExecutionManifest = Object.hasOwn(EXACT_ATTEMPT_AUTHORIZATION_OPERATIONS, operationId)
    && executionManifest != null
    ? verifyExecutionManifestCodeBundle(repoRoot, executionManifest, operationId)
    : executionManifest;
  const outputIdentity = exactAttemptAuthorizationCliPaths({
    repoRoot,
    operationId,
    executionManifestPath: args['execution-manifest'],
    executionManifest: cliExecutionManifest,
    mode,
    outputPath: rawOutput,
    requestPath: args.request,
  });
  const output = outputIdentity.output;
  if (mode === 'request') {
    const generatedAt = args['generated-at'] ?? new Date().toISOString();
    const request = buildCanonicalAuthorizationRequestForOperation({
      repoRoot,
      operationId,
      serverFingerprint,
      policyRows,
      executionManifest: cliExecutionManifest,
      generatedAt,
      expiresAt: args['expires-at'] ?? new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString(),
    });
    writeJsonAtomic(output, request, { noOverwrite: outputIdentity.noOverwrite });
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
        repoRoot,
        operationId: request.operationId,
        executionManifest: cliExecutionManifest,
      }),
      serverFingerprint,
      policyRows,
    },
    usedDecisionIdentities: new Set(used),
  });
  writeJsonAtomic(output, packet, { noOverwrite: outputIdentity.noOverwrite });
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
