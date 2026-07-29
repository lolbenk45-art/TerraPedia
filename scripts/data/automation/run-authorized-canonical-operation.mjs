import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveCanonicalOperationTechnicalInput,
  verifyCanonicalAuthorizationPacketAgainstCurrent,
} from './build-canonical-cutover-authorization.mjs';
import {
  createAuthorizedOperationDispatchPermit,
  revokeAuthorizedOperationDispatchPermit,
} from './authorized-operation-context.mjs';

export function consumeDecisionIdentityFile({ ledgerPath, decisionIdentity, dispatchPermitHash = null } = {}) {
  const identity = requireText(decisionIdentity, 'decision identity');
  const permitHash = dispatchPermitHash == null
    ? null
    : requireText(dispatchPermitHash, 'dispatch permit hash');
  const output = path.resolve(requireText(ledgerPath, 'decision ledger path'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const lockPath = `${output}.lock`;
  let lock;
  try {
    lock = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`decision ledger is locked: ${output}`);
    throw error;
  }
  try {
    const used = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
    if (!Array.isArray(used) || used.some((entry) => !isDecisionLedgerEntry(entry))) {
      throw new Error('decision ledger must contain non-empty identities or dispatch-permit records');
    }
    if (used.some((entry) => decisionIdentityOf(entry) === identity)) {
      throw new Error(`decision identity is already used: ${identity}`);
    }
    const nextEntry = permitHash == null
      ? identity
      : { decisionIdentity: identity, dispatchPermitHash: permitHash };
    const temporary = `${output}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify([...used, nextEntry], null, 2)}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
      fs.renameSync(temporary, output);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  } finally {
    if (lock !== undefined) fs.closeSync(lock);
    fs.rmSync(lockPath, { force: true });
  }
}

export async function runExecutionManifestCommand({
  manifest,
  cwd = process.cwd(),
  authorizationPacketPath = null,
  authorizationDispatchPermit = null,
  env = process.env,
  spawnImpl = spawnCommand,
} = {}) {
  const commandParts = manifest?.command;
  if (!Array.isArray(commandParts) || commandParts.length < 2
      || commandParts.some((part) => typeof part !== 'string' || !part.trim())) {
    throw new Error('execution manifest command must contain at least two non-empty strings');
  }
  if (path.basename(commandParts[0]) !== 'node') {
    throw new Error('execution manifest command must use the Node runtime');
  }
  if (commandParts.some((part) => /^--[^=]*(?:password|token|secret|api[-_]?key)[^=]*=/i.test(part))) {
    throw new Error('execution manifest command contains a credential-shaped argument');
  }
  if (typeof spawnImpl !== 'function') throw new TypeError('spawn implementation is required');
  const permit = authorizationDispatchPermit == null
    ? null
    : {
        path: path.resolve(requireText(authorizationDispatchPermit.path, 'authorization dispatch permit path')),
        nonce: requireText(authorizationDispatchPermit.nonce, 'authorization dispatch permit nonce'),
      };
  const childEnv = authorizationPacketPath == null
    ? env
    : {
        ...env,
        TERRAPEDIA_AUTHORIZED_PACKET_PATH: path.resolve(
          requireText(authorizationPacketPath, 'authorization packet path'),
        ),
        ...(permit == null ? {} : {
          TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: permit.path,
          TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: permit.nonce,
        }),
      };
  const result = await spawnImpl(commandParts[0], commandParts.slice(1), {
    cwd: path.resolve(cwd),
    shell: false,
    env: childEnv,
  });
  const exitCode = Number(result?.exitCode);
  if (!Number.isInteger(exitCode) || exitCode !== 0) {
    throw new Error(`authorized operation command failed with exit code ${result?.exitCode ?? 'unknown'}`);
  }
  return result;
}

function spawnCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export async function runAuthorizedCanonicalOperation({
  packet,
  currentTechnicalInput,
  usedDecisionIdentities,
  consumeDecisionIdentity = null,
  dispatchers,
  now = new Date().toISOString(),
} = {}) {
  if (!(usedDecisionIdentities instanceof Set)) {
    throw new TypeError('used decision identities must be a Set');
  }
  verifyCanonicalAuthorizationPacketAgainstCurrent({ packet, currentTechnicalInput, now });
  if (usedDecisionIdentities.has(packet.decisionIdentity)) {
    throw new Error(`decision identity is already used: ${packet.decisionIdentity}`);
  }
  const dispatch = dispatchers?.[packet.operationId];
  if (typeof dispatch !== 'function') {
    throw new Error(`no authorized dispatcher is registered for operation: ${packet.operationId}`);
  }

  if (consumeDecisionIdentity != null) {
    if (typeof consumeDecisionIdentity !== 'function') {
      throw new TypeError('decision identity consumer must be a function');
    }
    await consumeDecisionIdentity(packet.decisionIdentity);
  }
  usedDecisionIdentities.add(packet.decisionIdentity);
  const result = await dispatch({ packet, currentTechnicalInput });
  return {
    operationId: packet.operationId,
    decisionIdentity: packet.decisionIdentity,
    packetHash: packet.packetHash,
    status: 'completed',
    result,
  };
}

export async function runAuthorizedCanonicalOperationsIndependently({
  jobs,
  usedDecisionIdentities = new Set(),
  dispatchers,
  now = new Date().toISOString(),
} = {}) {
  if (!Array.isArray(jobs)) throw new TypeError('jobs must be an array');
  const results = [];
  for (const job of jobs) {
    const operationId = job?.packet?.operationId ?? null;
    try {
      results.push(await runAuthorizedCanonicalOperation({
        ...job,
        usedDecisionIdentities,
        dispatchers,
        now,
      }));
    } catch (error) {
      results.push({
        operationId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

function readJson(filePath, label) {
  return JSON.parse(fs.readFileSync(path.resolve(requireText(filePath, label)), 'utf8'));
}

function readUsedDecisionIdentities(ledgerPath) {
  const resolved = path.resolve(ledgerPath);
  if (!fs.existsSync(resolved)) return new Set();
  const values = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(values) || values.some((value) => !isDecisionLedgerEntry(value))) {
    throw new Error('decision ledger must contain non-empty identities or dispatch-permit records');
  }
  return new Set(values.map(decisionIdentityOf));
}

function isDecisionLedgerEntry(entry) {
  return (typeof entry === 'string' && entry.trim())
    || (entry != null
      && typeof entry === 'object'
      && !Array.isArray(entry)
      && typeof entry.decisionIdentity === 'string'
      && entry.decisionIdentity.trim()
      && typeof entry.dispatchPermitHash === 'string'
      && entry.dispatchPermitHash.trim());
}

function decisionIdentityOf(entry) {
  return typeof entry === 'string' ? entry : entry.decisionIdentity;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  const packet = readJson(args.packet, 'packet');
  const serverFingerprint = readJson(args['server-fingerprint'], 'server fingerprint');
  const policyRows = readJson(args['policy-rows'], 'policy rows');
  if (!Array.isArray(policyRows)) throw new Error('policy rows must be a JSON array');
  const canonicalLedgerPath = path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json');
  const ledgerPath = path.resolve(args['used-decisions'] ?? canonicalLedgerPath);
  if (ledgerPath !== canonicalLedgerPath) {
    throw new Error('authorized canonical operation must use the canonical durable decision ledger');
  }
  const currentTechnicalInput = {
    ...resolveCanonicalOperationTechnicalInput({
      repoRoot,
      operationId: packet.operationId,
      executionManifest: packet.executionManifest,
    }),
    serverFingerprint,
    policyRows,
  };
  let dispatchPermit = null;
  const result = await runAuthorizedCanonicalOperation({
    packet,
    currentTechnicalInput,
    usedDecisionIdentities: readUsedDecisionIdentities(ledgerPath),
    consumeDecisionIdentity: (decisionIdentity) => {
      dispatchPermit = createAuthorizedOperationDispatchPermit({
        directory: path.join(repoRoot, 'reports/authorization/canonical'),
        packet,
      });
      try {
        consumeDecisionIdentityFile({
          ledgerPath,
          decisionIdentity,
          dispatchPermitHash: dispatchPermit.dispatchPermitHash,
        });
      } catch (error) {
        revokeAuthorizedOperationDispatchPermit({ permit: dispatchPermit });
        dispatchPermit = null;
        throw error;
      }
    },
    dispatchers: {
      [packet.operationId]: () => {
        if (dispatchPermit == null) throw new Error('authorized dispatch permit is missing after decision consumption');
        const permit = dispatchPermit;
        return runExecutionManifestCommand({
          manifest: packet.executionManifest,
          cwd: repoRoot,
          authorizationPacketPath: args.packet,
          authorizationDispatchPermit: permit,
        }).finally(() => {
          revokeAuthorizedOperationDispatchPermit({ permit });
          dispatchPermit = null;
        });
      },
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`authorized canonical operation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
