#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import { canonicalizePolicySet, computePolicySetHash } from './policy-set-hash.mjs';
import {
  assertL2PolicyStableReauthorizationInput,
  l2PolicyStableReauthorizationOperationId,
} from './l2-policy-stable-reauthorization.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';

const DATABASE_NAME = 'terria_v1_local';
const DATABASES = ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'];
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function mysqlDateTimeToUtcIso(value, timeZone = 'Asia/Shanghai') {
  const text = requireText(value, 'MySQL DATETIME');
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text).toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(text);
  if (!match) throw new Error('MySQL DATETIME must use YYYY-MM-DD HH:mm:ss');
  const components = match.slice(1).map(Number);
  const wallMs = Date.UTC(
    components[0], components[1] - 1, components[2],
    components[3], components[4], components[5],
  );
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let guess = wallMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]));
    const representedMs = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    guess += wallMs - representedMs;
  }
  return new Date(guess).toISOString();
}

export function buildL2PolicyStableReauthorizationSnapshot({
  domainId,
  policyRows,
  serverFingerprint,
  priorDecision,
  predecessorL1Evidence,
  now = new Date().toISOString(),
} = {}) {
  const operationId = l2PolicyStableReauthorizationOperationId(domainId);
  const rows = normalizePolicyRows(policyRows);
  const currentRow = rows.find((row) => row.domainId === domainId);
  if (!currentRow || currentRow.currentLevel !== 'L2' || currentRow.operationalState !== 'ACTIVE') {
    throw new Error('current policy must be L2/ACTIVE');
  }
  const currentPolicySetHash = computePolicySetHash(rows);
  const currentPolicy = {
    domainId,
    policyVersion: currentRow.policyVersion,
    policyHash: currentRow.policyHash,
    level: 'L2',
    operationalState: 'ACTIVE',
    policySetHash: currentPolicySetHash,
  };
  const prior = normalizePriorDecision(priorDecision, domainId, currentPolicy, now);
  const predecessor = normalizePredecessor(predecessorL1Evidence, currentPolicy);
  const input = assertL2PolicyStableReauthorizationInput({
    schemaVersion: 1,
    operationId,
    databaseName: DATABASE_NAME,
    domainId,
    reauthorization: true,
    currentPolicy,
    predecessorL1Evidence: predecessor,
    priorDecision: prior,
    targetPolicy: currentPolicy,
  }, { now });
  const fingerprint = canonicalServerFingerprint(serverFingerprint);
  return Object.freeze({
    input,
    policyRows: Object.freeze(rows.map(({ domainId: id, policyVersion, policyHash, currentLevel, operationalState }) => ({
      domainId: id, policyVersion, policyHash, currentLevel, operationalState,
    }))),
    serverFingerprint: fingerprint,
  });
}

export function writeL2PolicyStableReauthorizationSnapshot({
  repoRoot = process.cwd(),
  snapshot,
  inputPath,
  policyRowsPath,
  serverFingerprintPath,
  priorDecisionPath,
  predecessorEvidencePath,
} = {}) {
  if (!snapshot?.input || !snapshot?.policyRows || !snapshot?.serverFingerprint) {
    throw new Error('L2 reauthorization snapshot is required');
  }
  const root = path.resolve(repoRoot);
  const outputs = [
    [inputPath, snapshot.input, 'input'],
    [policyRowsPath, snapshot.policyRows, 'policy rows'],
    [serverFingerprintPath, snapshot.serverFingerprint, 'server fingerprint'],
    [priorDecisionPath, snapshot.input.priorDecision, 'prior decision'],
    [predecessorEvidencePath, snapshot.input.predecessorL1Evidence, 'predecessor evidence'],
  ].map(([output, payload, label]) => {
    const confined = resolveOutput(root, output, label);
    return [confined, payload];
  });
  if (new Set(outputs.map(([output]) => output)).size !== outputs.length) {
    throw new Error('L2 reauthorization snapshot outputs must be distinct');
  }
  for (const [output] of outputs) assertAbsent(output, 'L2 reauthorization snapshot output');
  for (const [output, payload] of outputs) writeJsonAtomicNoOverwrite(output, payload);
  return Object.freeze(Object.fromEntries([
    ['inputPath', outputs[0][0]], ['policyRowsPath', outputs[1][0]],
    ['serverFingerprintPath', outputs[2][0]], ['priorDecisionPath', outputs[3][0]],
    ['predecessorEvidencePath', outputs[4][0]],
  ].map(([key, value]) => [key, path.relative(root, value).replaceAll('\\', '/')])));
}

export async function captureL2PolicyStableReauthorizationInputCli({
  argv = process.argv.slice(2),
  env = process.env,
  repoRoot = env.WORKTREE_ROOT ?? process.cwd(),
  mysqlModule = null,
  write = true,
  now = new Date().toISOString(),
} = {}) {
  const args = parseArgs(argv);
  const domainId = requireText(args.domain, '--domain');
  const outputPaths = {
    inputPath: requireText(args.input, '--input'),
    policyRowsPath: requireText(args['policy-rows'], '--policy-rows'),
    serverFingerprintPath: requireText(args['server-fingerprint'], '--server-fingerprint'),
    priorDecisionPath: requireText(args['prior-decision'], '--prior-decision'),
    predecessorEvidencePath: requireText(args['predecessor-evidence'], '--predecessor-evidence'),
  };
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  let transactionOpen = false;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    transactionOpen = true;
    const [policyRows] = await connection.query(
      'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
      + ' pv.policy_hash AS policyHash, p.current_level AS currentLevel,'
      + ' p.operational_state AS operationalState FROM crawler_automation_policy p'
      + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
      + ' AND pv.policy_version = p.current_version ORDER BY p.domain_id',
    );
    const currentPolicyVersion = Number((policyRows ?? []).find((row) => row.domainId === domainId)?.policyVersion);
    if (!Number.isSafeInteger(currentPolicyVersion) || currentPolicyVersion < 2) {
      throw new Error('current L2 policy version is required for predecessor evidence');
    }
    const [serverRows] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS port');
    const [priorRows] = await connection.query(
      'SELECT decision_kind AS decisionKind, domain_id AS domainId, policy_version AS policyVersion,'
      + ' policy_hash AS policyHash, policy_set_hash AS policySetHash,'
      + ' decision_identity AS decisionIdentity, packet_hash AS packetHash,'
      + " DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS expiresAt"
      + ' FROM crawler_automation_activation_decision'
      + " WHERE decision_kind = 'L2_PROMOTION' AND domain_id = ?"
      + ' ORDER BY authorized_at DESC, id DESC LIMIT 1',
      [domainId],
    );
    const [predecessorRows] = await connection.query(
      'SELECT rp.policy_version AS policyVersion, rp.policy_hash AS policyHash,'
      + ' rp.policy_set_hash AS policySetHash, COUNT(DISTINCT r.run_id) AS successfulL1Runs,'
      + " COUNT(DISTINCT CASE WHEN e.kind = 'FULL_RECONCILIATION' THEN e.run_id END) AS reconciliationRuns"
      + ' FROM crawler_automation_run r JOIN crawler_automation_apply a ON a.run_id = r.run_id'
      + ' JOIN crawler_automation_run_policy rp ON rp.run_id = r.run_id'
      + ' LEFT JOIN crawler_automation_evidence e ON e.run_id = r.run_id'
      + " AND e.kind = 'FULL_RECONCILIATION' WHERE r.primary_domain_id = ?"
      + " AND r.status = 'COMPLETED' AND a.status = 'COMMITTED'"
      + ' AND rp.domain_id = ? AND rp.policy_version < ?'
      + ' GROUP BY rp.policy_version, rp.policy_hash, rp.policy_set_hash'
      + ' ORDER BY rp.policy_version DESC',
      [domainId, domainId, currentPolicyVersion],
    );
    const serverFingerprint = {
      host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
      port: Number(serverRows?.[0]?.port ?? env.TERRAPEDIA_DB_PORT),
      serverUuid: serverRows?.[0]?.serverUuid,
      databases: DATABASES,
    };
    const snapshot = buildL2PolicyStableReauthorizationSnapshot({
      domainId,
      policyRows: policyRows ?? [],
      serverFingerprint,
      priorDecision: priorRows?.[0]
        ? { ...priorRows[0], expiresAt: mysqlDateTimeToUtcIso(priorRows[0].expiresAt, env.TERRAPEDIA_DB_TIME_ZONE ?? 'Asia/Shanghai') }
        : priorRows?.[0],
      predecessorL1Evidence: predecessorRows?.[0],
      now,
    });
    if (write) writeL2PolicyStableReauthorizationSnapshot({ repoRoot, snapshot, ...outputPaths });
    await connection.query('ROLLBACK');
    transactionOpen = false;
    return Object.freeze({
      operationId: snapshot.input.operationId,
      policySetHash: snapshot.input.currentPolicy.policySetHash,
      input: snapshot.input,
      policyRows: snapshot.policyRows,
      serverFingerprint: snapshot.serverFingerprint,
      ...outputPaths,
    });
  } finally {
    if (transactionOpen) {
      try { await connection.query('ROLLBACK'); } catch { /* preserve original error */ }
    }
    await connection.end();
  }
}

function normalizePolicyRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('current policy rows are required');
  return canonicalizePolicySet(rows).map((row) => {
    const source = rows.find((candidate) => candidate.domainId === row.domainId);
    return {
      ...row,
      policyVersion: Number(row.policyVersion),
      currentLevel: source.currentLevel ?? source.level,
      operationalState: source.operationalState,
    };
  });
}

function normalizePriorDecision(value, domainId, currentPolicy, now) {
  if (!value || value.decisionKind !== 'L2_PROMOTION' || value.domainId !== domainId) {
    throw new Error('latest expired L2 promotion decision is required');
  }
  if (Number(value.policyVersion) !== currentPolicy.policyVersion
      || value.policyHash !== currentPolicy.policyHash) {
    throw new Error('prior L2 decision does not bind the current L2 policy');
  }
  if (Date.parse(requireTimestamp(value.expiresAt, 'prior decision expiry')) >= Date.parse(requireTimestamp(now, 'capture time'))) {
    throw new Error('prior L2 promotion decision must be expired');
  }
  return {
    decisionKind: value.decisionKind,
    decisionIdentity: requireText(value.decisionIdentity, 'prior decision identity'),
    packetHash: requireHash(value.packetHash, 'prior decision packet hash'),
    policySetHash: requireHash(value.policySetHash ?? value.priorPolicySetHash, 'prior decision policy-set hash'),
    expiresAt: requireTimestamp(value.expiresAt, 'prior decision expiry'),
  };
}

function normalizePredecessor(value, currentPolicy) {
  const policyVersion = Number(value?.policyVersion);
  const successful = Number(value?.minimumSuccessfulL1Runs ?? value?.successfulL1Runs ?? value?.distinctCommittedL1Runs);
  const reconciliation = value?.fullReconciliation === true
    || Number(value?.reconciliationRuns) > 0;
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 1 || policyVersion >= currentPolicy.policyVersion
      || !HASH_PATTERN.test(value?.policyHash ?? '') || !HASH_PATTERN.test(value?.policySetHash ?? '')
      || successful < 3 || !reconciliation) {
    throw new Error('predecessor L1 evidence requires three committed runs and full reconciliation');
  }
  return {
    policyVersion,
    policyHash: value.policyHash,
    policySetHash: value.policySetHash,
    minimumSuccessfulL1Runs: 3,
    fullReconciliation: true,
  };
}

function connectionOptions(env) {
  if (env.TERRAPEDIA_DB_NAME !== DATABASE_NAME) throw new Error(`TERRAPEDIA_DB_NAME must be exactly ${DATABASE_NAME}`);
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TERRAPEDIA_DB_PORT must be a valid port');
  return { host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'), port, user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'), password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'), database: DATABASE_NAME, multipleStatements: false };
}

function resolveOutput(repoRoot, outputPath, label) {
  const value = requireText(outputPath, `${label} output path`).replaceAll('\\', '/');
  if (!/\.retry-[a-z0-9][a-z0-9_-]*(?:\.|\/)/i.test(value)) throw new Error(`${label} output path must use a retry label`);
  const root = path.resolve(repoRoot);
  const authorizationRoot = path.join(root, 'reports', 'authorization', 'canonical');
  const absolute = path.resolve(root, value);
  if (!absolute.startsWith(`${authorizationRoot}${path.sep}`)) throw new Error(`${label} output must remain under reports/authorization/canonical`);
  return assertRepositoryPathConfinement({ repoRoot, filePath: absolute, label: `${label} output`, createParent: true });
}

function assertAbsent(filePath, label) {
  try { fs.lstatSync(filePath); } catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  throw new Error(`${label} already exists; overwrite is forbidden`);
}

function writeJsonAtomicNoOverwrite(outputPath, payload) {
  const temporary = `${outputPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.linkSync(temporary, outputPath);
    fs.unlinkSync(temporary);
    fs.chmodSync(outputPath, 0o600);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...rest] = arg.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

function requireText(value, label) { const text = String(value ?? '').trim(); if (!text) throw new Error(`${label} is required`); return text; }
function requireHash(value, label) { if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`); return value; }
function requireTimestamp(value, label) { const text = requireText(value, label); if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`); return text; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  captureL2PolicyStableReauthorizationInputCli().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`L2 reauthorization capture failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
