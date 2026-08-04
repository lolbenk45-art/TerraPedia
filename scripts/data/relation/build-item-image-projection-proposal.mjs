import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import {
  assertRepositoryOrdinaryFile,
} from '../lib/private-repository-path.mjs';
import {
  ITEM_IMAGE_PROJECTION_OPERATION_ID,
  ITEM_IMAGE_PROJECTION_POLICY_PATH,
  assertItemImageProjectionAuthorizationPacket,
  assertItemImageProjectionProposal,
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionProposal,
  buildItemImageProjectionSnapshot,
  canonicalItemImageProjectionHash,
  writeItemImageProjectionPrivateJson,
} from './item-image-projection-contract.mjs';
import { resolveManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';
import { readItemImageProjectionSnapshot } from './item-image-projection-db.mjs';
import { resolveItemImageLineageRuntimeConfig } from './item-image-lineage-db.mjs';

const LINEAGE_OPERATION_ID = 'canonical-item-image-lineage-apply';
const CANONICAL_USED_DECISIONS_PATH =
  'reports/authorization/canonical/used-decisions.json';

export async function runItemImageProjectionProposal(options = {}, dependencies = {}) {
  rejectNonProposalOptions(options);
  const root = path.resolve(options.repoRoot ?? getProjectRoot());
  const usedDecisionsPath = requireCanonicalUsedDecisionsPath(options.usedDecisionsPath);
  const readOnlyAuthorizationPath = requireRelativePath(
    options.readOnlyAuthorizationPath,
    'readOnlyAuthorizationPath',
  );
  const readReadOnlyAuthorizationBytes = dependencies.readReadOnlyAuthorizationBytes
    ?? (() => readOrdinaryBytes(root, readOnlyAuthorizationPath, 'read-only Owner authorization'));
  const readOnlyAuthorizationBytes = Buffer.from(await readReadOnlyAuthorizationBytes());
  const readOnlyAuthorization = validateReadOnlyAuthorization({
    value: parseJson(readOnlyAuthorizationBytes, 'read-only Owner authorization'),
    now: options.now ?? new Date().toISOString(),
  });
  const attemptPaths = buildItemImageProjectionAttemptPaths(readOnlyAuthorization.decisionIdentity);
  assertAttemptOptionBindings({
    attemptPaths,
    attemptRoot: options.attemptRoot,
    readOnlyAuthorizationPath,
  });
  const lineageInputContractPath = requireRelativePath(
    options.lineageInputContractPath,
    'lineageInputContractPath',
  );
  const lineageResultPath = requireRelativePath(options.lineageResultPath, 'lineageResultPath');
  const lineageBundlePath = requireRelativePath(options.lineageBundlePath, 'lineageBundlePath');
  const lineageApplySnapshotPath = requireRelativePath(
    options.lineageApplySnapshotPath,
    'lineageApplySnapshotPath',
  );
  const lineageAuthorizationPacketPath = requireRelativePath(
    options.lineageAuthorizationPacketPath,
    'lineageAuthorizationPacketPath',
  );
  const readLineageInputContractBytes = dependencies.readLineageInputContractBytes
    ?? (() => readOrdinaryBytes(root, lineageInputContractPath, 'lineage input contract'));
  const readLineageResultBytes = dependencies.readLineageResultBytes
    ?? (() => readOrdinaryBytes(root, lineageResultPath, 'lineage result'));
  const readLineageBundleBytes = dependencies.readLineageBundleBytes
    ?? (() => readOrdinaryBytes(root, lineageBundlePath, 'lineage bundle'));
  const readLineageApplySnapshotBytes = dependencies.readLineageApplySnapshotBytes
    ?? (() => readOrdinaryBytes(root, lineageApplySnapshotPath, 'lineage apply snapshot'));
  const readLineageAuthorizationPacketBytes = dependencies.readLineageAuthorizationPacketBytes
    ?? (() => readOrdinaryBytes(root, lineageAuthorizationPacketPath, 'lineage authorization packet'));
  const readUsedDecisionsBytes = dependencies.readUsedDecisionsBytes
    ?? (() => readOrdinaryBytes(root, usedDecisionsPath, 'used decisions ledger'));

  const lineageInputContractBytes = Buffer.from(await readLineageInputContractBytes());
  const lineageResultBytes = Buffer.from(await readLineageResultBytes());
  const lineageBundleBytes = Buffer.from(await readLineageBundleBytes());
  const lineageApplySnapshotBytes = Buffer.from(await readLineageApplySnapshotBytes());
  const lineageAuthorizationPacketBytes = Buffer.from(await readLineageAuthorizationPacketBytes());
  const usedDecisionsBytes = Buffer.from(await readUsedDecisionsBytes());
  const lineageInputContract = parseJson(lineageInputContractBytes, 'lineage input contract');
  const lineageResult = parseJson(lineageResultBytes, 'lineage result');
  const lineageBundle = parseJson(lineageBundleBytes, 'lineage bundle');
  const lineageEvidence = validateLineageEvidence({
    lineageInputContract,
    lineageResult,
    lineageBundle,
    lineageBundleBytes,
    lineageBundlePath,
    lineageInputContractBytes,
    lineageApplySnapshot: parseJson(lineageApplySnapshotBytes, 'lineage apply snapshot'),
    lineageApplySnapshotPath,
    lineageAuthorizationPacket: parseJson(
      lineageAuthorizationPacketBytes,
      'lineage authorization packet',
    ),
    usedDecisions: parseJson(usedDecisionsBytes, 'used decisions ledger'),
  });
  const keys = lineageEvidence.keys;

  const expectedTarget = normalizeExpectedTarget(options.expectedTarget);
  assertReadOnlyAuthorizationTarget(readOnlyAuthorization, expectedTarget);
  assertFormalTargetDatabases(lineageEvidence.targetDatabases, expectedTarget, 'lineage packet');
  assertLineageTarget(lineageInputContract.serverFingerprint, expectedTarget);
  const resolveRuntimeConfig = dependencies.resolveRuntimeConfig
    ?? ((context) => resolveDefaultRuntimeConfig(context));
  const runtimeConfig = await resolveRuntimeConfig({ repoRoot: root });
  assertRuntimeConfigMatchesTarget(runtimeConfig, expectedTarget);
  const loadManagedUrlPolicy = dependencies.loadManagedUrlPolicy ?? loadDefaultManagedUrlPolicy;
  const policy = await loadManagedUrlPolicy({ repoRoot: root });
  const managedUrlPrefixes = normalizeItemManagedPrefixes(policy?.prefixes);
  const managedUrlPolicy = {
    sourcePath: requireRelativePath(policy?.sourcePath, 'managed policy sourcePath'),
    sourceSha256: sha256Bytes(Buffer.from(policy?.sourceBytes ?? '')),
    resolvedPrefixesSha256: canonicalItemImageProjectionHash(managedUrlPrefixes),
  };
  if (managedUrlPolicy.sourcePath !== ITEM_IMAGE_PROJECTION_POLICY_PATH) {
    throw new Error('managed URL policy source path drifted');
  }

  const openConnection = dependencies.openConnection
    ?? (() => openDefaultConnection({ root, runtimeConfig }));
  const readDatabaseSnapshot = dependencies.readDatabaseSnapshot
    ?? ((connection, context) => readDefaultDatabaseSnapshot(connection, context));
  const connection = await openConnection();
  let databaseSnapshot;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    databaseSnapshot = await readDatabaseSnapshot(connection, { keys, expectedTarget });
  } finally {
    await connection?.rollback?.();
    await connection?.end?.();
  }
  assertSnapshotTarget(databaseSnapshot?.target, expectedTarget);

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const snapshot = buildItemImageProjectionSnapshot({
    attemptId: attemptPaths.attemptId,
    attemptRoot: attemptPaths.attemptRoot,
    generatedAt,
    target: databaseSnapshot.target,
    managedUrlPolicy,
    managedUrlPrefixes,
    lineageKeys: keys,
    relationRows: databaseSnapshot.relationRows,
    projectionRows: databaseSnapshot.projectionRows,
  });
  const writeSnapshot = dependencies.writeSnapshot ?? writeItemImageProjectionSnapshot;
  const writtenSnapshot = await writeSnapshot({
    repoRoot: root,
    outputPath: attemptPaths.snapshotPath,
    snapshot,
  });

  const proposal = buildItemImageProjectionProposal({
    attemptId: attemptPaths.attemptId,
    attemptRoot: attemptPaths.attemptRoot,
    generatedAt,
    expiresAt: requireTimestamp(options.expiresAt, 'expiresAt'),
    proposalAuthorization: {
      path: readOnlyAuthorizationPath,
      sha256: sha256Bytes(readOnlyAuthorizationBytes),
      decisionIdentity: readOnlyAuthorization.decisionIdentity,
      authorizationHash: readOnlyAuthorization.authorizationHash,
    },
    lineage: {
      inputContractPath: lineageInputContractPath,
      inputContractSha256: sha256Bytes(lineageInputContractBytes),
      resultPath: lineageResultPath,
      resultSha256: sha256Bytes(lineageResultBytes),
      bundlePath: lineageBundlePath,
      bundleSha256: sha256Bytes(lineageBundleBytes),
      applySnapshotPath: lineageApplySnapshotPath,
      applySnapshotSha256: sha256Bytes(lineageApplySnapshotBytes),
      authorizationPacketPath: lineageAuthorizationPacketPath,
      authorizationPacketSha256: sha256Bytes(lineageAuthorizationPacketBytes),
      decisionIdentity: lineageEvidence.decisionIdentity,
      packetHash: lineageEvidence.packetHash,
      dispatchPermitHash: lineageEvidence.dispatchPermitHash,
      completedRowCount: keys.length,
    },
    lineageKeys: keys,
    target: databaseSnapshot.target,
    snapshotPath: writtenSnapshot.relativePath ?? attemptPaths.snapshotPath,
    snapshotSha256: writtenSnapshot.sha256,
    managedUrlPolicy,
    managedUrlPrefixes,
    relationRows: databaseSnapshot.relationRows,
    projectionRows: databaseSnapshot.projectionRows,
  });
  const writeProposal = dependencies.writeProposal ?? writeItemImageProjectionProposal;
  await writeProposal({
    repoRoot: root,
    outputPath: attemptPaths.proposalPath,
    proposal,
  });
  return proposal;
}

export function writeItemImageProjectionProposal({
  repoRoot,
  outputPath,
  proposal,
} = {}) {
  assertItemImageProjectionProposal(proposal);
  const expectedPath = buildItemImageProjectionAttemptPaths(
    proposal.proposalAuthorization.decisionIdentity,
  ).proposalPath;
  if (requireRelativePath(outputPath, 'proposal outputPath') !== expectedPath) {
    throw new Error('proposal outputPath must be proposal.json inside the authorized attemptRoot');
  }
  return writeItemImageProjectionPrivateJson({
    repoRoot,
    outputPath,
    value: proposal,
    label: 'item image projection proposal',
  });
}

export function writeItemImageProjectionSnapshot({
  repoRoot,
  outputPath,
  snapshot,
} = {}) {
  return writeItemImageProjectionPrivateJson({
    repoRoot,
    outputPath,
    value: snapshot,
    label: 'item image projection snapshot',
  });
}

export function readItemImageProjectionProposal({
  repoRoot,
  proposalPath,
} = {}) {
  const { proposal } = readProposalBytes({ repoRoot, proposalPath });
  return proposal;
}

export function materializeItemImageProjectionInputContract({
  repoRoot = getProjectRoot(),
  proposalPath,
  inputContractPath,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const proposalEvidence = readProposalBytes({ repoRoot: root, proposalPath });
  const inputContract = buildItemImageProjectionInputContract({
    proposal: proposalEvidence.proposal,
    proposalPath: proposalEvidence.relativePath,
    proposalSha256: sha256Bytes(proposalEvidence.bytes),
  });
  const attemptPaths = buildItemImageProjectionAttemptPaths(
    inputContract.proposalAuthorization.decisionIdentity,
  );
  if (proposalEvidence.relativePath !== attemptPaths.proposalPath) {
    throw new Error('proposalPath must be proposal.json inside the authorized attemptRoot');
  }
  if (requireRelativePath(inputContractPath, 'inputContractPath') !== attemptPaths.inputPath) {
    throw new Error('inputContractPath must be input.json inside the authorized attemptRoot');
  }
  const written = writeItemImageProjectionPrivateJson({
    repoRoot: root,
    outputPath: inputContractPath,
    value: inputContract,
    label: 'item image projection input contract',
  });
  return { ...written, inputContract };
}

function readProposalBytes({ repoRoot, proposalPath }) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const relativePath = requireRelativePath(proposalPath, 'proposalPath');
  const absolutePath = path.resolve(root, relativePath);
  assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: absolutePath,
    label: 'item image projection proposal',
  });
  assertPrivateMode(absolutePath, 'item image projection proposal');
  const bytes = fs.readFileSync(absolutePath);
  const proposal = parseJson(bytes, 'item image projection proposal');
  assertItemImageProjectionProposal(proposal);
  return { relativePath, absolutePath, bytes, proposal };
}

function validateLineageEvidence({
  lineageInputContract,
  lineageResult,
  lineageBundle,
  lineageBundleBytes,
  lineageBundlePath,
  lineageInputContractBytes,
  lineageApplySnapshot,
  lineageApplySnapshotPath,
  lineageAuthorizationPacket,
  usedDecisions,
}) {
  if (lineageInputContract?.operationId !== LINEAGE_OPERATION_ID) {
    throw new Error(`lineage input contract operationId must be ${LINEAGE_OPERATION_ID}`);
  }
  if (lineageResult?.operationId !== LINEAGE_OPERATION_ID
      || Number(lineageResult?.schemaVersion) !== 1
      || lineageResult?.resultKind !== 'canonical_item_image_lineage_apply_result'
      || lineageResult?.status !== 'COMPLETED') {
    throw new Error('lineage result must be the exact completed lineage apply result');
  }
  const stages = Array.isArray(lineageResult?.stages) ? lineageResult.stages : [];
  const stageByName = new Map(stages.map((stage) => [stage?.name, stage]));
  if (stageByName.size !== 4) throw new Error('lineage result must contain exactly four stages');
  if (lineageBundle?.entity !== 'item_image_lineage_bundle'
      || lineageBundle?.datasetType !== 'item_image_sources_raw'
      || !Array.isArray(lineageBundle?.itemImages)) {
    throw new Error('lineage bundle must be the canonical item image lineage bundle');
  }
  if (lineageInputContract?.lineageBundle?.path !== lineageBundlePath) {
    throw new Error('lineage input contract bundle path drifted');
  }
  if (lineageInputContract?.lineageBundle?.sha256 !== sha256Bytes(lineageBundleBytes)) {
    throw new Error('lineage input contract bundle hash drifted');
  }
  const keys = lineageBundle.itemImages.map((row) => requireText(
    row?.itemInternalName,
    'lineage bundle itemInternalName',
  )).sort();
  if (new Set(keys).size !== keys.length) throw new Error('lineage bundle has duplicate identities');
  const count = keys.length;
  if (count === 0 || Number(lineageBundle?.counters?.total) !== count
      || Number(lineageInputContract?.expectedIdentityCount) !== count
      || Number(lineageResult?.expectedIdentityCount) !== count) {
    throw new Error('lineage identity counts drifted');
  }
  for (const layer of ['landing', 'maint', 'relation', 'local']) {
    if (Number(lineageResult?.counts?.[layer]) !== count) {
      throw new Error(`lineage completed ${layer} count drifted`);
    }
    const stage = stageByName.get(layer);
    if (stage?.status !== 'applied' || Number(stage?.rowCount) !== count) {
      throw new Error(`lineage completed ${layer} stage drifted`);
    }
  }
  if (lineageResult?.snapshot?.snapshotId !== lineageApplySnapshotPath
      || lineageApplySnapshot?.operationId !== LINEAGE_OPERATION_ID
      || Number(lineageApplySnapshot?.rowCount) !== Number(lineageResult?.snapshot?.rowCount)
      || lineageApplySnapshot?.takenAt !== lineageResult?.snapshot?.takenAt) {
    throw new Error('lineage apply snapshot identity drifted');
  }
  assertExactKeys(
    lineageApplySnapshot,
    ['operationId', 'takenAt', 'rowCount', 'layers'],
    'lineage apply snapshot',
  );
  assertExactKeys(
    lineageApplySnapshot.layers,
    ['landing', 'maint', 'relation', 'local'],
    'lineage apply snapshot layers',
  );
  const packet = lineageAuthorizationPacket;
  if (packet?.operationId !== LINEAGE_OPERATION_ID
      || packet?.authorizationStatus !== 'AUTHORIZED'
      || !Array.isArray(packet?.targetDatabases)
      || !Array.isArray(packet?.dataBundleEntries)) {
    throw new Error('lineage authorization packet is invalid');
  }
  assertItemImageProjectionAuthorizationPacket(packet);
  assertHistoricalPacketTimestampOrder(packet);
  const inputEntry = packet.dataBundleEntries.find((entry) => (
    entry?.path === 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json'
  ));
  if (inputEntry?.contentHash !== sha256Bytes(lineageInputContractBytes)) {
    throw new Error('lineage authorization packet input hash drifted');
  }
  const decisionIdentity = requireText(packet.decisionIdentity, 'lineage packet decisionIdentity');
  const packetHash = requireSha256(packet.packetHash, 'lineage packetHash');
  const usedDecision = Array.isArray(usedDecisions)
    ? usedDecisions.find((entry) => entry?.decisionIdentity === decisionIdentity)
    : null;
  if (!usedDecision) {
    throw new Error('lineage consumed decision is missing from the used decisions ledger');
  }
  const dispatchPermitHash = requireSha256(
    usedDecision.dispatchPermitHash,
    'lineage consumed decision dispatchPermitHash',
  );
  if (lineageResult.decisionId != null && lineageResult.decisionId !== decisionIdentity) {
    throw new Error('lineage result decision identity drifted from packet');
  }
  return {
    keys,
    decisionIdentity,
    packetHash,
    dispatchPermitHash,
    targetDatabases: packet.targetDatabases,
  };
}

function assertHistoricalPacketTimestampOrder(packet) {
  const generatedAt = requireTimestamp(packet.generatedAt, 'lineage packet generatedAt');
  const expiresAt = requireTimestamp(packet.expiresAt, 'lineage packet expiresAt');
  const authorizedAt = requireTimestamp(packet.authorizedAt, 'lineage packet authorizedAt');
  if (Date.parse(generatedAt) >= Date.parse(expiresAt)) {
    throw new Error('lineage packet expiry must be after generation');
  }
  if (Date.parse(authorizedAt) < Date.parse(generatedAt)
      || Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    throw new Error('lineage packet authorization timestamp is outside its original validity window');
  }
}

function assertLineageTarget(serverFingerprint, expectedTarget) {
  const databases = [
    expectedTarget.databases.local,
    expectedTarget.databases.maint,
    expectedTarget.databases.relation,
  ];
  if (!serverFingerprint || serverFingerprint.host !== expectedTarget.host
      || Number(serverFingerprint.port) !== expectedTarget.port
      || serverFingerprint.serverUuid !== expectedTarget.serverUuid
      || !Array.isArray(serverFingerprint.databases)
      || canonicalItemImageProjectionHash(serverFingerprint.databases)
        !== canonicalItemImageProjectionHash(databases)) {
    throw new Error('lineage input contract server fingerprint drifted from expected target');
  }
}

function assertSnapshotTarget(snapshotTarget, expectedTarget) {
  const normalized = normalizeExpectedTarget(snapshotTarget);
  if (canonicalItemImageProjectionHash(normalized) !== canonicalItemImageProjectionHash(expectedTarget)) {
    throw new Error('database snapshot target fingerprint drifted from expected target');
  }
}

function validateReadOnlyAuthorization({ value, now }) {
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
  ];
  assertExactKeys(value, expectedKeys, 'read-only Owner authorization');
  if (Number(value.schemaVersion) !== 1
      || value.authorizationKind !== 'canonical_read_only_proposal_authorization'
      || value.operationId !== ITEM_IMAGE_PROJECTION_OPERATION_ID
      || value.action !== 'read-only-proposal') {
    throw new Error('read-only Owner authorization contract drifted');
  }
  for (const field of ['actor', 'reason', 'authorizationReference', 'decisionIdentity']) {
    requireText(value[field], `read-only authorization ${field}`);
  }
  if (value.noWrite !== true) throw new Error('read-only authorization noWrite must be true');
  requireTimestamp(value.authorizedAt, 'read-only authorization authorizedAt');
  requireTimestamp(value.expiresAt, 'read-only authorization expiresAt');
  const current = Date.parse(requireTimestamp(now, 'now'));
  if (current < Date.parse(value.authorizedAt) || current >= Date.parse(value.expiresAt)) {
    throw new Error('read-only Owner authorization is expired or not yet valid');
  }
  const base = { ...value };
  delete base.authorizationHash;
  if (value.authorizationHash !== canonicalItemImageProjectionHash(base)) {
    throw new Error('read-only Owner authorization hash drifted');
  }
  return value;
}

function assertReadOnlyAuthorizationTarget(authorization, expectedTarget) {
  assertFormalTargetDatabases(authorization.targetDatabases, expectedTarget, 'read-only authorization');
}

function assertFormalTargetDatabases(actual, expectedTarget, label) {
  const expected = [
    expectedTarget.databases.local,
    expectedTarget.databases.maint,
    expectedTarget.databases.relation,
  ];
  if (canonicalItemImageProjectionHash(actual)
      !== canonicalItemImageProjectionHash(expected)) {
    throw new Error(`${label} target databases drifted`);
  }
}

function normalizeExpectedTarget(target) {
  return {
    host: requireText(target?.host, 'target host'),
    port: requirePositiveInteger(target?.port, 'target port'),
    serverUuid: requireText(target?.serverUuid, 'target serverUuid'),
    databases: {
      local: requireIdentifier(target?.databases?.local, 'target local database'),
      maint: requireIdentifier(target?.databases?.maint, 'target maint database'),
      relation: requireIdentifier(target?.databases?.relation, 'target relation database'),
    },
    ownedDatabase: requireIdentifier(target?.ownedDatabase, 'target owned database'),
    ownedTable: requireIdentifier(target?.ownedTable, 'target owned table'),
    ownedColumn: requireIdentifier(target?.ownedColumn, 'target owned column'),
  };
}

function assertAttemptOptionBindings({ attemptPaths, attemptRoot, readOnlyAuthorizationPath }) {
  if (requireRelativePath(attemptRoot, 'attemptRoot') !== attemptPaths.attemptRoot) {
    throw new Error('attemptRoot must be derived from the read-only Owner decision');
  }
  if (readOnlyAuthorizationPath !== attemptPaths.proposalReadOwnerInputPath) {
    throw new Error('read-only authorization path must be proposal-read.owner-input.json inside attemptRoot');
  }
}

function requireCanonicalUsedDecisionsPath(value) {
  const normalized = requireRelativePath(value, 'usedDecisionsPath');
  if (normalized !== CANONICAL_USED_DECISIONS_PATH) {
    throw new Error(`usedDecisionsPath must be the canonical ledger ${CANONICAL_USED_DECISIONS_PATH}`);
  }
  return normalized;
}

function resolveDefaultRuntimeConfig({ repoRoot }) {
  const runtime = resolveItemImageLineageRuntimeConfig({ repoRoot });
  return {
    ...runtime,
    database: {
      ...runtime.database,
      host: process.env.TERRAPEDIA_DB_HOST ?? runtime.database?.host ?? '127.0.0.1',
      port: Number(process.env.TERRAPEDIA_DB_PORT ?? runtime.database?.port ?? 13306),
      name: process.env.TERRAPEDIA_DB_NAME ?? runtime.database?.name ?? 'terria_v1_local',
    },
  };
}

function assertRuntimeConfigMatchesTarget(runtimeConfig, expectedTarget) {
  const runtimeHost = requireText(runtimeConfig?.database?.host, 'runtime database host');
  const runtimePort = requirePositiveInteger(runtimeConfig?.database?.port, 'runtime database port');
  const runtimeLocalDatabase = requireIdentifier(
    runtimeConfig?.database?.name,
    'runtime local database',
  );
  if (runtimeHost !== expectedTarget.host) {
    throw new Error('runtime database host drifted from the frozen target fingerprint');
  }
  if (runtimePort !== expectedTarget.port) {
    throw new Error('runtime database port drifted from the frozen target fingerprint');
  }
  if (runtimeLocalDatabase !== expectedTarget.databases.local) {
    throw new Error('runtime local database drifted from the frozen target fingerprint');
  }
  const fingerprint = runtimeConfig?.serverFingerprint;
  const expectedDatabases = [
    expectedTarget.databases.local,
    expectedTarget.databases.maint,
    expectedTarget.databases.relation,
  ];
  if (fingerprint?.host !== expectedTarget.host
      || Number(fingerprint?.port) !== expectedTarget.port
      || fingerprint?.serverUuid !== expectedTarget.serverUuid
      || canonicalItemImageProjectionHash(fingerprint?.databases)
        !== canonicalItemImageProjectionHash(expectedDatabases)) {
    throw new Error('runtime server fingerprint databases or connection identity drifted');
  }
}

async function openDefaultConnection({ root, runtimeConfig }) {
  const require = createRequire(path.join(root, 'data-query-app', 'package.json'));
  const mysql = require('mysql2/promise');
  return mysql.createConnection({
    host: runtimeConfig.database.host,
    port: runtimeConfig.database.port,
    user: process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
  });
}

async function readDefaultDatabaseSnapshot(connection, { expectedTarget, keys }) {
  return readItemImageProjectionSnapshot(connection, { keys, target: expectedTarget });
}

function loadDefaultManagedUrlPolicy({ repoRoot }) {
  const sourcePath = ITEM_IMAGE_PROJECTION_POLICY_PATH;
  return {
    sourcePath,
    sourceBytes: fs.readFileSync(path.resolve(repoRoot, sourcePath)),
    prefixes: resolveManagedImageUrlPrefixes({ repoRoot }),
  };
}

function normalizeItemManagedPrefixes(prefixes) {
  const normalized = [...new Set((Array.isArray(prefixes) ? prefixes : [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => /\/items\/$/i.test(value)))].sort();
  if (normalized.length === 0) throw new Error('managed item image policy prefixes are required');
  return normalized;
}

function rejectNonProposalOptions(options) {
  for (const name of ['apply', 'packet', 'permit', 'network', 'rawInput', 'snapshotPath', 'outputPath']) {
    if (options[name] !== undefined) throw new Error(`projection proposal does not accept ${name}`);
  }
}

function readOrdinaryBytes(root, relativePath, label) {
  const absolutePath = path.resolve(root, relativePath);
  assertRepositoryOrdinaryFile({ repoRoot: root, filePath: absolutePath, label });
  return fs.readFileSync(absolutePath);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (canonicalItemImageProjectionHash(Object.keys(value).sort())
      !== canonicalItemImageProjectionHash([...expectedKeys].sort())) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
}

function assertPrivateMode(filePath, label) {
  if ((fs.statSync(filePath).mode & 0o077) !== 0) {
    throw new Error(`${label} must not be group or world accessible`);
  }
}

function requireRelativePath(value, label) {
  const normalized = requireText(value, label).replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')
      || normalized.includes('/../') || normalized === '.') {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return normalized;
}

function requireTimestamp(value, label) {
  const normalized = requireText(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be an ISO timestamp`);
  return normalized;
}

function requireSha256(value, label) {
  const normalized = requireText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`${label} must be a SHA-256 identity`);
  }
  return normalized;
}

function requireIdentifier(value, label) {
  const normalized = requireText(value, label);
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) throw new Error(`${label} must be a plain identifier`);
  return normalized;
}

function requirePositiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) throw new Error(`${label} must be a positive integer`);
  return normalized;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) options[token.slice(2, separator)] = token.slice(separator + 1);
  }
  return options;
}

function isDirectExecution() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    rejectNonProposalOptions(args);
    const repoRoot = getProjectRoot();
    const runtime = resolveItemImageLineageRuntimeConfig({ repoRoot });
    const target = {
      host: runtime.serverFingerprint.host,
      port: runtime.serverFingerprint.port,
      serverUuid: runtime.serverFingerprint.serverUuid,
      databases: {
        local: args['local-database'] ?? 'terria_v1_local',
        maint: args['maint-database'] ?? 'terria_v1_maint',
        relation: args['relation-database'] ?? 'terria_v1_relation',
      },
      ownedDatabase: args['relation-database'] ?? 'terria_v1_relation',
      ownedTable: 'projection_items',
      ownedColumn: 'image',
    };
    const proposal = await runItemImageProjectionProposal({
      repoRoot,
      attemptRoot: args['attempt-root'],
      readOnlyAuthorizationPath: args['read-only-authorization'],
      lineageInputContractPath: args['lineage-input-contract'],
      lineageResultPath: args['lineage-result'],
      lineageBundlePath: args['lineage-bundle'],
      lineageApplySnapshotPath: args['lineage-apply-snapshot'],
      lineageAuthorizationPacketPath: args['lineage-authorization-packet'],
      usedDecisionsPath: args['used-decisions'],
      expectedTarget: target,
      generatedAt: args['generated-at'] ?? new Date().toISOString(),
      expiresAt: args['expires-at'],
    });
    process.stdout.write(`${JSON.stringify(proposal)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
