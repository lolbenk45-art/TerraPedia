#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const L1_PROMOTION = Object.freeze({
  currentLevel: 'L0',
  currentStates: Object.freeze(['DISABLED', 'SHADOW']),
  targetLevel: 'L1',
  targetOperationalState: 'ACTIVE',
  decisionKind: null,
});
const OPERATION_DEFINITIONS = Object.freeze({
  'automation-biomes-l1-policy-promotion': Object.freeze({
    domainId: 'biomes',
    ...L1_PROMOTION,
  }),
  'automation-audio-l1-policy-promotion': Object.freeze({ domainId: 'audio', ...L1_PROMOTION }),
  'automation-bosses-l1-policy-promotion': Object.freeze({ domainId: 'bosses', ...L1_PROMOTION }),
  'automation-shimmer-l1-policy-promotion': Object.freeze({ domainId: 'shimmer', ...L1_PROMOTION }),
  'automation-biomes-l2-promotion': Object.freeze({
    domainId: 'biomes',
    currentLevel: 'L1',
    currentStates: Object.freeze(['ACTIVE']),
    targetLevel: 'L2',
    targetOperationalState: 'ACTIVE',
    decisionKind: 'L2_PROMOTION',
  }),
  'automation-biomes-scheduler-activation': Object.freeze({
    domainId: 'biomes',
    currentLevel: 'L2',
    currentStates: Object.freeze(['ACTIVE']),
    targetLevel: null,
    targetOperationalState: null,
    decisionKind: 'SCHEDULER_ACTIVATION',
  }),
});

export function buildAutomationPolicyDecisionPlan(input = {}, authorizationContext = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('policy decision input must be a JSON object');
  }
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  const operationId = requireText(input.operationId, 'operationId');
  const definition = OPERATION_DEFINITIONS[operationId];
  if (!definition) throw new Error(`unsupported policy decision operationId: ${operationId}`);
  if (authorizationContext.operationId !== operationId) {
    throw new Error('authorization context operationId must match the policy decision operationId');
  }
  if (input.databaseName !== 'terria_v1_local') {
    throw new Error('databaseName must be terria_v1_local');
  }
  if (input.domainId !== definition.domainId) {
    throw new Error(`domainId must be ${definition.domainId}`);
  }
  const minimumSuccessfulL1Runs = Number(input.minimumSuccessfulL1Runs);
  if (!Number.isSafeInteger(minimumSuccessfulL1Runs) || minimumSuccessfulL1Runs < 2) {
    throw new Error('minimumSuccessfulL1Runs must be an integer of at least 2');
  }
  const policyVersion = Number(input.policyVersion);
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 1) {
    throw new Error('policyVersion must be a positive integer');
  }
  const authorizedAt = requireTimestamp(authorizationContext.authorizedAt, 'authorizedAt');
  const expiresAt = requireTimestamp(authorizationContext.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(authorizedAt)) {
    throw new Error('expiresAt must be after authorizedAt');
  }
  return Object.freeze({
    schemaVersion: 1,
    operationId,
    databaseName: input.databaseName,
    domainId: input.domainId,
    ownerUsername: requireText(authorizationContext.actor, 'actor'),
    actor: requireText(authorizationContext.actor, 'actor'),
    reason: requireText(authorizationContext.reason, 'reason'),
    authorizationReference: requireText(
      authorizationContext.authorizationReference,
      'authorizationReference',
    ),
    decisionIdentity: requireText(authorizationContext.decisionIdentity, 'decisionIdentity'),
    packetHash: requireHash(authorizationContext.packetHash, 'packetHash'),
    policySetHash: requireHash(input.policySetHash, 'policySetHash'),
    policyVersion,
    policyHash: requireHash(input.policyHash, 'policyHash'),
    minimumSuccessfulL1Runs,
    authorizedAt,
    expiresAt,
    ...definition,
  });
}

export async function executeAutomationPolicyDecision({
  adapter,
  plan,
  now = new Date().toISOString(),
} = {}) {
  if (!adapter || typeof adapter.begin !== 'function') {
    throw new TypeError('policy decision adapter is required');
  }
  const executionTime = requireTimestamp(now, 'execution time');
  if (Date.parse(executionTime) < Date.parse(plan.authorizedAt)
      || Date.parse(executionTime) >= Date.parse(plan.expiresAt)) {
    throw new Error('policy decision is not currently valid');
  }
  await adapter.begin();
  try {
    const owner = await adapter.readOwnerForUpdate();
    if (owner?.username !== plan.ownerUsername || owner?.status !== 'ACTIVE'
        || plan.actor !== plan.ownerUsername) {
      throw new Error('active System Owner identity does not match the decision');
    }
    const policy = await adapter.readPolicyForUpdate(plan.domainId);
    if (!policy || policy.domainId !== plan.domainId
        || Number(policy.policyVersion) !== plan.policyVersion
        || policy.policyHash !== plan.policyHash) {
      throw new Error('current policy identity does not match the decision');
    }
    if (policy.currentLevel !== plan.currentLevel
        || !plan.currentStates.includes(policy.operationalState)) {
      throw new Error('current policy level or operational state is not eligible');
    }
    const currentPolicySetHash = await adapter.readCurrentPolicySetHash();
    if (currentPolicySetHash !== plan.policySetHash) {
      throw new Error('current policy set identity does not match the decision');
    }

    let successfulL1Runs = null;
    if (plan.decisionKind !== null) {
      successfulL1Runs = Number(await adapter.countSuccessfulL1Applies(plan.domainId));
      if (!Number.isSafeInteger(successfulL1Runs)
          || successfulL1Runs < plan.minimumSuccessfulL1Runs) {
        throw new Error(`at least ${plan.minimumSuccessfulL1Runs} successful L1 applies are required`);
      }
      await adapter.insertActivationDecision({
        decisionKind: plan.decisionKind,
        domainId: plan.domainId,
        policyVersion: plan.policyVersion,
        policyHash: plan.policyHash,
        policySetHash: plan.policySetHash,
        minimumSuccessfulL1Runs: plan.minimumSuccessfulL1Runs,
        actor: plan.actor,
        reason: plan.reason,
        authorizationReference: plan.authorizationReference,
        decisionIdentity: plan.decisionIdentity,
        packetHash: plan.packetHash,
        authorizedAt: plan.authorizedAt,
        expiresAt: plan.expiresAt,
      });
    }
    if (plan.targetLevel !== null) {
      await adapter.updatePolicy({
        domainId: plan.domainId,
        policyVersion: plan.policyVersion,
        policyHash: plan.policyHash,
        targetLevel: plan.targetLevel,
        targetOperationalState: plan.targetOperationalState,
      });
    }
    await adapter.commit();
    return Object.freeze({
      schemaVersion: 1,
      operationId: plan.operationId,
      domainId: plan.domainId,
      status: 'completed',
      policyVersion: plan.policyVersion,
      policyHash: plan.policyHash,
      policySetHash: plan.policySetHash,
      level: plan.targetLevel ?? policy.currentLevel,
      operationalState: plan.targetOperationalState ?? policy.operationalState,
      decisionKind: plan.decisionKind,
      decisionIdentity: plan.decisionIdentity,
      successfulL1Runs,
      completedAt: executionTime,
    });
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}

export function createMysqlAutomationPolicyDecisionAdapter(connection) {
  if (!connection) throw new TypeError('MySQL connection is required');
  return {
    begin: () => connection.beginTransaction(),
    async readOwnerForUpdate() {
      const [rows] = await connection.query(
        'SELECT username, status FROM crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE',
      );
      return rows?.[0] ?? null;
    },
    async readPolicyForUpdate(domainId) {
      const [rows] = await connection.query(
        'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
        + ' pv.policy_hash AS policyHash, p.current_level AS currentLevel,'
        + ' p.operational_state AS operationalState FROM crawler_automation_policy p'
        + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
        + ' AND pv.policy_version = p.current_version WHERE p.domain_id = ? FOR UPDATE',
        [domainId],
      );
      return rows?.[0] ?? null;
    },
    async readCurrentPolicySetHash() {
      const [rows] = await connection.query(
        'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
        + ' pv.policy_hash AS policyHash FROM crawler_automation_policy p'
        + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
        + ' AND pv.policy_version = p.current_version ORDER BY p.domain_id',
      );
      return computePolicySetHash(rows ?? []);
    },
    async countSuccessfulL1Applies(domainId) {
      const [rows] = await connection.query(
        'SELECT COUNT(*) AS total FROM crawler_automation_apply a'
        + ' JOIN crawler_automation_run r ON r.run_id = a.run_id'
        + " WHERE r.primary_domain_id = ? AND a.mode = 'APPROVED_OWNER_L1'"
        + " AND a.status = 'COMMITTED'",
        [domainId],
      );
      return Number(rows?.[0]?.total ?? 0);
    },
    async insertActivationDecision(values) {
      await connection.query(
        'INSERT INTO crawler_automation_activation_decision'
        + ' (decision_kind, domain_id, policy_version, policy_hash, policy_set_hash,'
        + ' minimum_successful_l1_runs, actor, reason, authorization_reference,'
        + ' decision_identity, packet_hash, authorized_at, expires_at)'
        + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [values.decisionKind, values.domainId, values.policyVersion, values.policyHash,
          values.policySetHash, values.minimumSuccessfulL1Runs, values.actor, values.reason,
          values.authorizationReference, values.decisionIdentity, values.packetHash,
          toMysqlTimestamp(values.authorizedAt), toMysqlTimestamp(values.expiresAt)],
      );
    },
    async updatePolicy(values) {
      const [result] = await connection.query(
        'UPDATE crawler_automation_policy p'
        + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
        + ' AND pv.policy_version = p.current_version'
        + ' SET p.current_level = ?, p.operational_state = ?, p.version = p.version + 1'
        + ' WHERE p.domain_id = ? AND p.current_version = ? AND pv.policy_hash = ?',
        [values.targetLevel, values.targetOperationalState, values.domainId,
          values.policyVersion, values.policyHash],
      );
      if (Number(result?.affectedRows) !== 1) {
        throw new Error('policy promotion lost its current identity fence');
      }
    },
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
  };
}

export async function runAutomationPolicyDecisionCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
  now = new Date().toISOString(),
} = {}) {
  const args = parseArgs(argv);
  if (args.apply !== 'true') throw new Error('--apply=true is required');
  const inputPath = path.resolve(requireText(args.input, '--input'));
  const outputPath = path.resolve(requireText(args.output, '--output'));
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (args['operation-id'] !== input.operationId) {
    throw new Error('--operation-id must match the frozen input');
  }
  const authorizationContext = loadAuthorizedOperationContext({
    env,
    operationId: input.operationId,
    now,
  });
  const plan = buildAutomationPolicyDecisionPlan(input, authorizationContext);
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection({
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port: requirePort(env.TERRAPEDIA_DB_PORT),
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: plan.databaseName,
    multipleStatements: false,
  });
  try {
    const result = await executeAutomationPolicyDecision({
      adapter: createMysqlAutomationPolicyDecisionAdapter(connection),
      plan,
      now,
    });
    writeJsonAtomic(outputPath, result);
    return result;
  } finally {
    await connection.end();
  }
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
  const timestamp = requireText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
}

function requirePort(value) {
  const port = Number(requireText(value, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function toMysqlTimestamp(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAutomationPolicyDecisionCli().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`automation policy decision failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
