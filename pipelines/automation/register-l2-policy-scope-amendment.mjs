import {
  assertL2PolicyScopeAmendmentProposal,
} from './l2-policy-scope-amendment.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from './authorized-operation-context.mjs';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';

const DOMAINS = new Set(['items', 'armor_sets']);
const HASH = /^sha256:[a-f0-9]{64}$/;

export function buildL2PolicyScopeAmendmentRegistrationPlan({ proposal, authorizationContext } = {}) {
  assertL2PolicyScopeAmendmentProposal(proposal);
  const operationId = proposal.operationId;
  if (!DOMAINS.has(proposal.domainId) || proposal.operationId !== operationId) {
    throw new Error('scope amendment operationId does not match the supported domain');
  }
  if (!authorizationContext || authorizationContext.operationId !== operationId) {
    throw new Error('scope amendment authorization operation is not exact');
  }
  if (authorizationContext.actor !== 'admin') {
    throw new Error('scope amendment requires the active admin Owner');
  }
  for (const field of ['authorizationReference', 'reason', 'decisionIdentity']) {
    requireText(authorizationContext[field], field);
  }
  requireHash(authorizationContext.packetHash, 'packetHash');
  return Object.freeze({
    schemaVersion: 1,
    operationId,
    domainId: proposal.domainId,
    databaseName: 'terria_v1_local',
    currentPolicy: proposal.currentPolicy,
    currentPolicySetHash: proposal.currentPolicySetHash,
    targetPolicyVersion: proposal.targetPolicy.policyVersion,
    targetLevel: 'L2',
    targetOperationalState: 'ACTIVE',
    targetPolicyHash: proposal.targetPolicy.policyHash,
    targetPolicySetHash: proposal.targetPolicySetHash,
    targetPolicyJson: proposal.targetPolicy.policyJson,
    targetPolicyRows: proposal.targetPolicyRows,
    amendmentHash: proposal.amendmentHash,
    serverFingerprint: proposal.serverFingerprint,
    actor: authorizationContext.actor,
    reason: authorizationContext.reason,
    authorizationReference: authorizationContext.authorizationReference,
    decisionIdentity: authorizationContext.decisionIdentity,
    packetHash: authorizationContext.packetHash,
    createsBusinessDataWrites: false,
    policyPointerMutation: 'append_and_advance_current_pointer',
  });
}

export async function registerL2PolicyScopeAmendment({
  connection,
  proposal,
  authorizationContext,
  serverFingerprint,
  beforeCommit = null,
  afterCommit = null,
  now = new Date().toISOString(),
} = {}) {
  if (!connection || typeof connection.query !== 'function') throw new TypeError('database connection is required');
  const plan = buildL2PolicyScopeAmendmentRegistrationPlan({ proposal, authorizationContext });
  const expectedFingerprint = canonicalServerFingerprint(serverFingerprint ?? proposal.serverFingerprint);
  if (JSON.stringify(expectedFingerprint) !== JSON.stringify(proposal.serverFingerprint)) {
    throw new Error('scope amendment server fingerprint does not match the proposal');
  }
  if (typeof connection.beginTransaction !== 'function' || typeof connection.commit !== 'function'
      || typeof connection.rollback !== 'function') throw new TypeError('transaction-capable connection is required');
  await connection.beginTransaction();
  let committed = false;
  try {
    const [serverRows] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS port');
    if (serverRows?.[0]?.serverUuid !== expectedFingerprint.serverUuid
        || Number(serverRows?.[0]?.port) !== expectedFingerprint.port) {
      throw new Error('current database server fingerprint does not match scope amendment');
    }
    const [ownerRows] = await connection.query(
      'SELECT username, status FROM crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE',
    );
    const owner = ownerRows?.[0];
    if (!owner || owner.username !== plan.actor || owner.status !== 'ACTIVE') {
      throw new Error('active System Owner does not match scope amendment');
    }
    const [policyRows] = await connection.query(
      'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash,'
        + ' p.current_level AS currentLevel, p.operational_state AS operationalState, pv.policy_json AS policyJson'
        + ' FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv'
        + ' ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version'
        + ' WHERE p.domain_id = ? FOR UPDATE', [plan.domainId],
    );
    const current = policyRows?.[0];
    if (!current || current.domainId !== plan.domainId
        || Number(current.policyVersion) !== plan.currentPolicy.policyVersion
        || current.policyHash !== plan.currentPolicy.policyHash
        || current.currentLevel !== 'L2' || current.operationalState !== 'ACTIVE'
        || computePolicyHash(parseJson(current.policyJson)) !== current.policyHash) {
      throw new Error('current L2 policy identity does not match scope amendment');
    }
    const [setRows] = await connection.query(
      'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash'
        + ' FROM crawler_automation_policy p JOIN crawler_automation_policy_version pv'
        + ' ON pv.domain_id = p.domain_id AND pv.policy_version = p.current_version'
        + ' ORDER BY p.domain_id FOR UPDATE',
    );
    if (computePolicySetHash(setRows ?? []) !== plan.currentPolicySetHash) {
      throw new Error('current policy set identity does not match scope amendment');
    }
    const [attemptRows] = await connection.query(
      "SELECT COUNT(*) AS total FROM crawler_automation_run_attempt WHERE domain_id = ? AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')",
      [plan.domainId],
    );
    const [reservationRows] = await connection.query(
      "SELECT COUNT(*) AS total FROM crawler_automation_attempt_reservation WHERE domain_id = ? AND status NOT IN ('RELEASED', 'CONSUMED', 'EXPIRED')",
      [plan.domainId],
    );
    const tableNames = plan.targetPolicyJson.ownedTables.map((scope) => scope.table);
    const [fenceRows] = await connection.query(
      'SELECT COUNT(*) AS total FROM crawler_automation_write_fence WHERE expires_at > CURRENT_TIMESTAMP AND physical_table IN (?)',
      [tableNames],
    );
    if (Number(attemptRows?.[0]?.total ?? 0) !== 0
        || Number(reservationRows?.[0]?.total ?? 0) !== 0
        || Number(fenceRows?.[0]?.total ?? 0) !== 0) {
      throw new Error('active attempts, reservations, or write fences block scope amendment');
    }
    const [maxRows] = await connection.query(
      'SELECT COALESCE(MAX(policy_version), 0) AS maxVersion FROM crawler_automation_policy_version WHERE domain_id = ?',
      [plan.domainId],
    );
    if (Number(maxRows?.[0]?.maxVersion ?? 0) + 1 !== plan.targetPolicyVersion) {
      throw new Error('scope amendment target policy version is not the next immutable version');
    }
    const [existingRows] = await connection.query(
      'SELECT policy_version AS policyVersion FROM crawler_automation_policy_version WHERE domain_id = ? AND policy_hash = ?',
      [plan.domainId, plan.targetPolicyHash],
    );
    if (existingRows?.length) throw new Error('scope amendment target policy hash already exists');
    const [insert] = await connection.query(
      'INSERT INTO crawler_automation_policy_version'
        + ' (domain_id, policy_version, level, policy_json, policy_hash, created_by, approved_by, reason)'
        + ' VALUES (?, ?, \'L2\', CAST(? AS JSON), ?, ?, ?, ?)',
      [plan.domainId, plan.targetPolicyVersion, JSON.stringify(plan.targetPolicyJson), plan.targetPolicyHash,
        plan.actor, plan.actor, plan.reason],
    );
    if (Number(insert?.affectedRows) !== 1) throw new Error('scope amendment policy version insert was not exact');
    const [update] = await connection.query(
      'UPDATE crawler_automation_policy SET current_version = ?, current_level = \'L2\', operational_state = \'ACTIVE\', version = version + 1'
        + ' WHERE domain_id = ? AND current_version = ? AND current_level = \'L2\' AND operational_state = \'ACTIVE\'',
      [plan.targetPolicyVersion, plan.domainId, plan.currentPolicy.policyVersion],
    );
    if (Number(update?.affectedRows) !== 1) throw new Error('scope amendment current policy pointer update was not exact');
    const result = Object.freeze({
      schemaVersion: 1,
      operationId: plan.operationId,
      domainId: plan.domainId,
      status: 'registered',
      authoritative: true,
      policyVersion: plan.targetPolicyVersion,
      policyHash: plan.targetPolicyHash,
      policySetHash: plan.targetPolicySetHash,
      amendmentHash: plan.amendmentHash,
      actor: plan.actor,
      reason: plan.reason,
      authorizationReference: plan.authorizationReference,
      decisionIdentity: plan.decisionIdentity,
      packetHash: plan.packetHash,
      createsBusinessDataWrites: false,
      completedAt: now,
    });
    if (beforeCommit) await beforeCommit(result);
    await connection.commit();
    committed = true;
    if (afterCommit) await afterCommit(result);
    return result;
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  }
}

export async function runL2PolicyScopeAmendmentRegistrationCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
  now = new Date().toISOString(),
  loadAuthorizationContext = loadAuthorizedOperationContext,
  assertDataBundle = assertAuthorizedOperationDataBundle,
  loadServerFingerprint = loadAuthorizedOperationServerFingerprint,
  consumeDispatchPermit = consumeAuthorizedOperationDispatchPermit,
} = {}) {
  const args = parseArgs(argv);
  if (args.apply !== 'true') throw new Error('--apply=true is required');
  const repoRoot = path.resolve(env.WORKTREE_ROOT ?? process.cwd());
  const operationId = requireText(args['operation-id'], '--operation-id');
  if (!['automation-items-l2-scope-amendment', 'automation-armor-sets-l2-scope-amendment', 'automation-armor-sets-l2-scope-amendment-after-items'].includes(operationId)) {
    throw new Error('unsupported L2 scope amendment operation');
  }
  const expectedInput = `reports/authorization/canonical/${operationId}.input.json`;
  const resultLabel = args['result-label'] == null ? '' : `.${requireResultLabel(args['result-label'])}`;
  const expectedOutput = `reports/authorization/canonical/${operationId}${resultLabel}.result.json`;
  if (String(args.input ?? '').replaceAll('\\', '/') !== expectedInput
      || String(args.output ?? '').replaceAll('\\', '/') !== expectedOutput) {
    throw new Error('scope amendment input/output paths must use exact operation-derived paths');
  }
  const inputPath = assertRepositoryOrdinaryFile({ repoRoot, filePath: path.resolve(repoRoot, expectedInput), label: 'scope amendment input' });
  const outputPath = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, expectedOutput), label: 'scope amendment result', createParent: true });
  const markerPath = `${outputPath}.commit.json`;
  assertAbsent(outputPath, 'scope amendment result');
  assertAbsent(markerPath, 'scope amendment commit marker');
  const proposal = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (proposal.operationId !== operationId) throw new Error('scope amendment input operationId drifted');
  const authorizationContext = loadAuthorizationContext({ env, operationId, now, repoRoot });
  assertDataBundle({ repoRoot, authorizedContext: authorizationContext });
  const serverFingerprint = loadServerFingerprint({ authorizedContext: authorizationContext, env });
  consumeDispatchPermit({
    env,
    authorizedContext: authorizationContext,
    decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
  });
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection({
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port: Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT')),
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: 'terria_v1_local',
    multipleStatements: false,
  });
  let committed = false;
  try {
    const result = await registerL2PolicyScopeAmendment({
      connection, proposal, authorizationContext, serverFingerprint, now,
      beforeCommit: async (pending) => writePrivateJson(outputPath, pending),
      afterCommit: async (committedResult) => {
        committed = true;
        writePrivateJson(markerPath, { schemaVersion: 1, status: 'committed', result: committedResult });
      },
    });
    if (!committed) writePrivateJson(outputPath, result);
    return result;
  } finally {
    await connection.end();
  }
}

function writePrivateJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function assertAbsent(filePath, label) {
  try { fs.lstatSync(filePath); } catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  throw new Error(`${label} already exists; overwrite is forbidden`);
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...parts] = token.slice(2).split('=');
    return [key, parts.join('=')];
  }));
}

function requireResultLabel(value) {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('result label must be a normalized lowercase kebab-case token');
  }
  return value;
}

function parseJson(value) {
  if (typeof value === 'object' && value != null) return value;
  try { return JSON.parse(value); } catch { throw new Error('current policy JSON is invalid'); }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireHash(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = await runL2PolicyScopeAmendmentRegistrationCli();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
