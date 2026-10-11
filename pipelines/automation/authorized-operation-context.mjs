import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  hashOrderedBundleBytes,
  resolveCanonicalOperationTechnicalInput,
  verifyCanonicalAuthorizationPacket,
} from './build-canonical-cutover-authorization.mjs';
import {
  canonicalServerFingerprint,
  hashCanonicalServerFingerprint,
} from './automation-database-contract.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';

export function assertAuthorizedOperationDataBundle({
  repoRoot,
  authorizedContext,
  resolveTechnicalInput = resolveCanonicalOperationTechnicalInput,
} = {}) {
  const operationId = requireText(authorizedContext?.operationId, 'authorized data bundle operationId');
  const current = resolveTechnicalInput({
    repoRoot,
    operationId,
    executionManifest: authorizedContext?.executionManifest,
  });
  if (!Array.isArray(current?.dataEntries)) {
    throw new Error('authorized data bundle entries are required');
  }
  const actual = hashOrderedBundleBytes(current.dataEntries, 'authorized data bundle');
  if (actual !== authorizedContext?.dataBundleSha256) {
    throw new Error('authorized data bundle drifted');
  }
  return true;
}

export function assertItemImageProjectionAuthorizationEnvironment({
  repoRoot,
  attemptRoot,
  env = process.env,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'projection repository root'));
  const normalizedAttemptRoot = requireText(attemptRoot, 'projection attempt root').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/item-image-projection-apply/';
  if (!normalizedAttemptRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalizedAttemptRoot.slice(prefix.length))) {
    throw new Error('projection authorization environment attempt root is invalid');
  }
  const packetPath = path.resolve(requireText(
    env?.TERRAPEDIA_AUTHORIZED_PACKET_PATH,
    'projection authorized packet path',
  ));
  const permitPath = path.resolve(requireText(
    env?.TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH,
    'projection authorized dispatch permit path',
  ));
  if (packetPath !== path.resolve(root, normalizedAttemptRoot, 'packet.json')) {
    throw new Error('projection authorized packet must use the exact same-attempt path');
  }
  if (permitPath !== path.resolve(root, normalizedAttemptRoot, 'permit.json')) {
    throw new Error('projection authorized dispatch permit must use the exact same-attempt path');
  }
  return true;
}

export function loadAuthorizedOperationContext({
  env = process.env,
  operationId,
  now = new Date().toISOString(),
  repoRoot = null,
} = {}) {
  const expectedOperationId = requireText(operationId, 'operationId');
  const packetPath = path.resolve(requireText(
    env?.TERRAPEDIA_AUTHORIZED_PACKET_PATH,
    'TERRAPEDIA_AUTHORIZED_PACKET_PATH',
  ));
  const root = path.resolve(repoRoot ?? env?.WORKTREE_ROOT ?? path.dirname(packetPath));
  const confinedPacketPath = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: packetPath,
    label: 'authorized packet path',
  });
  const stat = fs.lstatSync(confinedPacketPath);
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('authorized packet file must be private');
  }
  const packetBytes = fs.readFileSync(confinedPacketPath);
  const packet = JSON.parse(packetBytes.toString('utf8'));
  verifyCanonicalAuthorizationPacket(packet);
  if (packet.operationId !== expectedOperationId) {
    throw new Error(`authorized packet operationId must be ${expectedOperationId}`);
  }
  const verificationTime = requireTimestamp(now, 'authorization verification time');
  if (Date.parse(verificationTime) < Date.parse(packet.authorizedAt)
      || Date.parse(verificationTime) >= Date.parse(packet.expiresAt)) {
    throw new Error('authorized packet is not currently valid or is expired');
  }
  const packetPathRelative = repositoryRelativePath(root, confinedPacketPath);
  const packetFileSha256 = `sha256:${createHash('sha256').update(packetBytes).digest('hex')}`;
  const technical = Object.freeze({
    operationId: packet.operationId,
    targetDatabases: packet.targetDatabases,
    serverFingerprint: packet.serverFingerprint,
    schemaBundleSha256: packet.schemaBundleSha256,
    schemaBundleEntries: packet.schemaBundleEntries,
    dataBundleSha256: packet.dataBundleSha256,
    dataBundleEntries: packet.dataBundleEntries,
    policySetHash: packet.policySetHash,
    executionManifestHash: packet.executionManifestHash,
    executionManifest: packet.executionManifest,
    requiredTechnicalFields: packet.requiredTechnicalFields,
  });
  return Object.freeze({
    ...packet,
    packet: Object.freeze(packet),
    packetPath: confinedPacketPath,
    packetPathRelative,
    packetFileSha256,
    technical,
  });
}

export function loadAuthorizedOperationServerFingerprint({
  authorizedContext,
  env = process.env,
} = {}) {
  const expectedHash = requireText(
    authorizedContext?.serverFingerprint,
    'authorized server fingerprint hash',
  );
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error('authorized server fingerprint hash is invalid');
  }
  const raw = requireText(
    env?.TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT,
    'TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT',
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('authorized server fingerprint must be valid JSON');
  }
  const fingerprint = canonicalServerFingerprint(parsed);
  if (hashCanonicalServerFingerprint(fingerprint) !== expectedHash) {
    throw new Error('authorized server fingerprint hash drifted from packet');
  }
  return fingerprint;
}

export function createAuthorizedOperationDispatchPermit({ directory = null, outputPath = null, packet } = {}) {
  const outputDirectoryRoot = path.resolve(requireText(
    directory,
    'authorized dispatch permit directory',
  ));
  const resolvedOutputPath = outputPath == null ? null : assertRepositoryPathConfinement({
    repoRoot: outputDirectoryRoot,
    filePath: path.resolve(requireText(outputPath, 'authorized dispatch permit output path')),
    label: 'authorized dispatch permit output',
    createParent: true,
  });
  const outputDirectory = resolvedOutputPath == null
    ? outputDirectoryRoot
    : path.dirname(resolvedOutputPath);
  const normalized = normalizePermitContext(packet);
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const nonce = randomBytes(24).toString('hex');
  const output = resolvedOutputPath
    ?? path.join(outputDirectory, `.authorized-dispatch-${process.pid}-${randomBytes(12).toString('hex')}.json`);
  const payload = {
    schemaVersion: 1,
    ...normalized,
    nonce,
  };
  fs.writeFileSync(output, `${JSON.stringify(payload)}\n`, { mode: 0o600, flag: 'wx' });
  return Object.freeze({
    path: output,
    nonce,
    dispatchPermitHash: hashDispatchPermit(payload),
  });
}

export function consumeAuthorizedOperationDispatchPermit({
  env = process.env,
  authorizedContext,
  decisionLedgerPath,
} = {}) {
  const permitPath = path.resolve(requireText(
    env?.TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH,
    'authorized dispatch permit path',
  ));
  const nonce = requireText(env?.TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE, 'authorized dispatch permit nonce');
  const expected = normalizePermitContext(authorizedContext);
  const ledgerPath = path.resolve(requireText(decisionLedgerPath, 'authorized dispatch permit decision ledger path'));
  const claimedPath = `${permitPath}.${process.pid}.${randomBytes(12).toString('hex')}.claimed`;
  try {
    fs.renameSync(permitPath, claimedPath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('authorized dispatch permit is unavailable or already consumed');
    throw error;
  }
  try {
    const stat = fs.lstatSync(claimedPath);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
      throw new Error('authorized dispatch permit must be a private ordinary file');
    }
    const permit = JSON.parse(fs.readFileSync(claimedPath, 'utf8'));
    if (permit?.schemaVersion !== 1
        || permit.operationId !== expected.operationId
        || permit.decisionIdentity !== expected.decisionIdentity
        || permit.packetHash !== expected.packetHash
        || permit.nonce !== nonce) {
      throw new Error('authorized dispatch permit does not bind the current packet context');
    }
    const expectedHash = hashDispatchPermit(permit);
    const ledger = readDecisionLedger(ledgerPath);
    const record = ledger.find((entry) => entry?.decisionIdentity === expected.decisionIdentity);
    if (record?.dispatchPermitHash !== expectedHash) {
      throw new Error('authorized dispatch permit does not bind the durable decision ledger');
    }
    return true;
  } finally {
    fs.rmSync(claimedPath, { force: true });
  }
}

export function revokeAuthorizedOperationDispatchPermit({ permit } = {}) {
  const permitPath = permit?.path;
  if (!permitPath) return;
  fs.rmSync(path.resolve(permitPath), { force: true });
}

function normalizePermitContext(context) {
  return {
    operationId: requireText(context?.operationId, 'authorized dispatch permit operationId'),
    decisionIdentity: requireText(context?.decisionIdentity, 'authorized dispatch permit decisionIdentity'),
    packetHash: requireText(context?.packetHash, 'authorized dispatch permit packetHash'),
  };
}

function hashDispatchPermit({ operationId, decisionIdentity, packetHash, nonce }) {
  const payload = JSON.stringify({
    schemaVersion: 1,
    operationId: requireText(operationId, 'authorized dispatch permit operationId'),
    decisionIdentity: requireText(decisionIdentity, 'authorized dispatch permit decisionIdentity'),
    packetHash: requireText(packetHash, 'authorized dispatch permit packetHash'),
    nonce: requireText(nonce, 'authorized dispatch permit nonce'),
  });
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

function readDecisionLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  const stat = fs.lstatSync(ledgerPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('authorized dispatch permit decision ledger must be a private ordinary file');
  }
  const values = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (!Array.isArray(values)) throw new Error('authorized dispatch permit decision ledger must be a JSON array');
  return values.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
}

function requireTimestamp(value, label) {
  const timestamp = requireText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function repositoryRelativePath(repoRoot, filePath) {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(filePath)).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    throw new Error('authorized packet path must be inside the repository root');
  }
  return relative;
}
