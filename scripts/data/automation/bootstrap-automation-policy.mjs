#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';

const LEVELS = ['L0', 'L1', 'L2'];
const DOMAIN_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const FORMAL_DATABASES = new Set(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const L0_BOOTSTRAP_OPERATIONS = Object.freeze({
  'automation-biomes-l0-bootstrap': 'biomes',
  'automation-audio-l0-bootstrap': 'audio',
  'automation-bosses-l0-bootstrap': 'bosses',
  'automation-shimmer-l0-bootstrap': 'shimmer',
});

/**
 * Canonical JSON so a policy hash depends on content rather than key order or spacing.
 * Mirrors the shape policy-set-hash.mjs expects: `sha256:<64 hex>`.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function computePolicyHash(policy) {
  return `sha256:${createHash('sha256').update(canonicalJson(policy), 'utf8').digest('hex')}`;
}

export function buildBootstrapPlan({
  databaseName,
  ownerUsername,
  domainId,
  level,
  policy,
  reason,
  actor,
  apply = false,
  formalAuthorization = null,
  now = null,
} = {}) {
  if (!databaseName) {
    throw new Error('databaseName is required; refusing to guess a bootstrap target.');
  }
  if (!ownerUsername) {
    throw new Error('ownerUsername is required.');
  }
  if (!DOMAIN_PATTERN.test(domainId ?? '')) {
    throw new Error(`domainId must match ${DOMAIN_PATTERN} (automation domains are unqualified, e.g. "biomes").`);
  }
  if (!LEVELS.includes(level)) {
    throw new Error(`level must be one of ${LEVELS.join(', ')}.`);
  }
  if (!policy || typeof policy !== 'object') {
    throw new Error('policy is required.');
  }
  if (!reason) {
    throw new Error('reason is required; a bootstrap or promotion must record why.');
  }
  if (!actor) {
    throw new Error('actor is required.');
  }
  // Writing automation governance rows into a formal database is an operation-level decision,
  // not a side effect of running a script, so it must carry a recorded authorization.
  if (FORMAL_DATABASES.has(databaseName) && !formalAuthorization?.reference) {
    throw new Error(
      `${databaseName} is a formal database and requires formalAuthorization with a reference; `
      + 'bootstrap against a runKey-scoped isolation database instead.',
    );
  }

  return {
    databaseName,
    ownerUsername,
    domainId,
    level,
    policy,
    policyHash: computePolicyHash(policy),
    reason,
    actor,
    apply: apply === true,
    formalAuthorization,
    plannedAt: now,
  };
}

async function readOwner(connection, plan) {
  const [rows] = await connection.query(
    'SELECT username, status, version FROM crawler_automation_owner WHERE singleton_key = 1',
    [],
  );
  return rows?.[0] ?? null;
}

async function readPolicy(connection, plan) {
  const [rows] = await connection.query(
    'SELECT domain_id AS domainId, current_version AS currentVersion, current_level AS currentLevel,'
    + ' operational_state AS operationalState FROM crawler_automation_policy WHERE domain_id = ?',
    [plan.domainId],
  );
  return rows?.[0] ?? null;
}

async function readMaxPolicyVersion(connection, plan) {
  const [rows] = await connection.query(
    'SELECT COALESCE(MAX(policy_version), 0) AS maxVersion FROM crawler_automation_policy_version WHERE domain_id = ?',
    [plan.domainId],
  );
  const value = Number(rows?.[0]?.maxVersion ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function readExistingVersionForHash(connection, plan) {
  const [rows] = await connection.query(
    'SELECT policy_version AS policyVersion, level FROM crawler_automation_policy_version'
    + ' WHERE domain_id = ? AND policy_hash = ?',
    [plan.domainId, plan.policyHash],
  );
  return rows?.[0] ?? null;
}

export async function executeBootstrapPlan({ connection, plan } = {}) {
  if (!connection) {
    throw new Error('connection is required.');
  }
  if (!plan) {
    throw new Error('plan is required.');
  }

  // When applying, the reads that decide create-vs-promote must sit inside the same transaction
  // as the writes. Deciding outside it would let a concurrent bootstrap land between the two and
  // turn "owner absent" into a duplicate insert, or reuse an already-taken policy version.
  if (plan.apply) {
    await connection.beginTransaction();
    try {
      return await runInsideTransaction(connection, plan);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
  return runPlanOnly(connection, plan);
}

export async function runBootstrapCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
  now = new Date().toISOString(),
  loadAuthorizationContextImpl = loadAuthorizedOperationContext,
} = {}) {
  const args = parseArgs(argv);
  const inputPath = path.resolve(requireText(args.input, '--input'));
  const outputPath = path.resolve(requireText(args.output, '--output'));
  if (args.apply !== 'true') {
    throw new Error('--apply=true is required for the authorized bootstrap entrypoint.');
  }
  const input = readBootstrapInput(inputPath);
  const authorizationContext = loadAuthorizationContextImpl({
    env,
    operationId: input.operationId,
    now,
  });
  const plan = buildBootstrapPlan({
    databaseName: input.databaseName,
    ownerUsername: authorizationContext.actor,
    domainId: input.domainId,
    level: input.level,
    policy: input.policy,
    reason: authorizationContext.reason,
    actor: authorizationContext.actor,
    apply: true,
    formalAuthorization: {
      reference: authorizationContext.authorizationReference,
      approvedBy: authorizationContext.actor,
      decisionIdentity: authorizationContext.decisionIdentity,
      packetHash: authorizationContext.packetHash,
    },
    now,
  });
  const connectionOptions = buildConnectionOptions(env, input.databaseName);
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions);
  try {
    const result = await executeBootstrapPlan({ connection, plan });
    const report = {
      ...result,
      schemaVersion: 1,
      operationId: input.operationId,
      operationalState: input.operationalState,
      decisionIdentity: authorizationContext.decisionIdentity,
      packetHash: authorizationContext.packetHash,
      generatedAt: now,
    };
    writeJsonAtomic(outputPath, report);
    return report;
  } finally {
    await connection.end();
  }
}

function readBootstrapInput(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`bootstrap input file is missing: ${filePath}`);
  }
  const input = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('bootstrap input must be a JSON object.');
  }
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1.');
  const expectedDomainId = L0_BOOTSTRAP_OPERATIONS[input.operationId];
  if (!expectedDomainId) throw new Error('operationId must be an approved L0 bootstrap operation.');
  if (input.databaseName !== 'terria_v1_local') {
    throw new Error('databaseName must be terria_v1_local.');
  }
  if (input.domainId !== expectedDomainId) {
    throw new Error(`domainId must be ${expectedDomainId} for ${input.operationId}.`);
  }
  if (input.level !== 'L0') throw new Error('level must be L0.');
  if (input.operationalState !== 'DISABLED') {
    throw new Error('operationalState must be DISABLED.');
  }
  if (!input.policy || typeof input.policy !== 'object' || Array.isArray(input.policy)) {
    throw new Error('policy must be a JSON object.');
  }
  return input;
}

function buildConnectionOptions(env, databaseName) {
  const host = requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST');
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535.');
  }
  return {
    host,
    port,
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: databaseName,
    multipleStatements: false,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

async function collectState(connection, plan) {
  const owner = await readOwner(connection, plan);
  if (owner && owner.username !== plan.ownerUsername) {
    throw new Error(
      `owner is already bootstrapped as "${owner.username}"; the owner row is a singleton and is `
      + 'never overwritten. Resolve the discrepancy deliberately rather than through bootstrap.',
    );
  }

  const existingPolicy = await readPolicy(connection, plan);
  const maxVersion = await readMaxPolicyVersion(connection, plan);

  // policy_version carries UNIQUE (domain_id, policy_hash), so an unchanged policy cannot be
  // re-inserted under a new version number. Re-running with identical content is a legitimate
  // no-op, not an error, and must reuse the version that already carries this hash.
  const existingForHash = await readExistingVersionForHash(connection, plan);
  const reuseVersion = existingForHash ? Number(existingForHash.policyVersion) : null;
  const nextVersion = reuseVersion ?? maxVersion + 1;

  const ownerAction = owner ? 'unchanged' : 'created';
  const levelMatches = existingPolicy?.currentLevel === plan.level;
  let policyAction;
  if (!existingPolicy) {
    policyAction = 'created';
  } else if (reuseVersion && Number(existingPolicy.currentVersion) === reuseVersion && levelMatches) {
    policyAction = 'unchanged';
  } else if (levelMatches) {
    policyAction = 'reversioned';
  } else {
    policyAction = 'promoted';
  }

  const intendedStatements = [];
  if (ownerAction === 'created') {
    intendedStatements.push({
      sql: 'INSERT INTO crawler_automation_owner (singleton_key, username, status) VALUES (1, ?, ?)',
      params: [plan.ownerUsername, 'ACTIVE'],
    });
  }
  if (!reuseVersion) {
    intendedStatements.push({
      sql: 'INSERT INTO crawler_automation_policy_version'
        + ' (domain_id, policy_version, level, policy_json, policy_hash, created_by, approved_by, reason)'
        + ' VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)',
      params: [
        plan.domainId, nextVersion, plan.level, canonicalJson(plan.policy), plan.policyHash,
        plan.actor, plan.ownerUsername, plan.reason,
      ],
    });
  }
  if (policyAction === 'created') {
    intendedStatements.push({
      sql: 'INSERT INTO crawler_automation_policy (domain_id, current_version, current_level, operational_state)'
        + ' VALUES (?, ?, ?, ?)',
      params: [plan.domainId, nextVersion, plan.level, 'DISABLED'],
    });
  } else if (policyAction !== 'unchanged') {
    intendedStatements.push({
      sql: 'UPDATE crawler_automation_policy SET current_version = ?, current_level = ?, version = version + 1'
        + ' WHERE domain_id = ?',
      params: [nextVersion, plan.level, plan.domainId],
    });
  }

  const summary = {
    databaseName: plan.databaseName,
    domainId: plan.domainId,
    ownerUsername: plan.ownerUsername,
    ownerAction,
    policyAction,
    policyVersion: nextVersion,
    previousLevel: existingPolicy?.currentLevel ?? null,
    level: plan.level,
    policyHash: plan.policyHash,
    formalAuthorization: plan.formalAuthorization,
    intendedStatements,
  };

  return summary;
}

async function runPlanOnly(connection, plan) {
  const summary = await collectState(connection, plan);
  return { ...summary, applied: false };
}

async function runInsideTransaction(connection, plan) {
  const summary = await collectState(connection, plan);
  for (const statement of summary.intendedStatements) {
    await connection.query(statement.sql, statement.params);
  }
  await connection.commit();
  return { ...summary, applied: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBootstrapCli().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`automation policy bootstrap failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
