import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildAutomationDatabaseNames,
  openDurableRunKeyRegistry
} from './automation-database-contract.mjs';
import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from './authorized-operation-context.mjs';
import {
  deriveCanonicalTechnicalIdentity,
  resolveCanonicalOperationTechnicalInput,
} from './build-canonical-cutover-authorization.mjs';
import { canonicalServerFingerprint, hashCanonicalServerFingerprint } from './automation-database-contract.mjs';
import {
  createLiveAutomationAdapter,
  createMysqlCommandClient,
} from './mysql-automation-acceptance-adapter.mjs';
import { provisionAutomationDatabases } from './provision-automation-databases.mjs';
import { dropAutomationDatabases } from './drop-automation-databases.mjs';
import { runItemGroupLiveAcceptance } from '../item-groups/item-group-live-acceptance.mjs';
import { runNpcCanonicalT0Acceptance } from '../npc-canonical/npc-canonical-t0-acceptance.mjs';
import {
  buildNpcCanonicalT1Evidence,
  buildNpcCanonicalT1SnapshotBinding,
  runNpcCanonicalT1Acceptance,
} from '../npc-canonical/npc-canonical-t1-acceptance.mjs';
import { readCanonicalNpcOwnerPhaseCompletion } from '../npc-canonical/npc-canonical-readiness.mjs';
import { runRecipeCanonicalT1Acceptance } from '../recipe/recipe-canonical-t1-acceptance.mjs';
import { runBossCanonicalT1Acceptance } from '../boss/boss-canonical-t1-acceptance.mjs';
import { runProjectileCanonicalT1Acceptance } from '../projectile/projectile-canonical-t1-acceptance.mjs';
import { runBuffCanonicalT1Acceptance } from '../buff/buff-canonical-t1-acceptance.mjs';
import { runBiomeCanonicalT1Acceptance } from '../biome/biome-canonical-t1-acceptance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROBE_TABLE = '__automation_acceptance_probe';
const NPC_T1_EVIDENCE_PATH = 'reports/canonical-migration/canonical-npc-t1-acceptance.json';
const RECIPE_T1_EVIDENCE_PATH = 'reports/canonical-migration/canonical-recipe-t1-acceptance.json';
const BOSS_T1_EVIDENCE_PATH = 'reports/canonical-migration/canonical-boss-t1-acceptance.json';
const PROJECTILE_T1_EVIDENCE_PATH = 'reports/canonical-migration/canonical-projectile-t1-acceptance.json';
const BUFF_T1_EVIDENCE_PATH = 'reports/canonical-migration/canonical-buff-t1-acceptance.json';
const BIOME_T1_EVIDENCE_PATH = 'reports/canonical-migration/canonical-biome-t1-acceptance.json';
const NPC_T1_OPERATION_ID = 'canonical-npc-t1-acceptance';
const NPC_T1_INPUT_PATH = 'reports/authorization/canonical/canonical-npc-apply.input.json';
const NPC_T1_COMPLETION_PATH = 'reports/authorization/canonical/canonical-npc-apply.completion.json';

function requireRunKey(runKey) {
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(runKey ?? '')) throw new Error('live acceptance runKey is invalid');
  return runKey;
}

export function buildLiveResourceNames({ profile, runKey } = {}) {
  requireRunKey(runKey);
  const prefix = profile === 't0'
    ? 'terria_v1_automation_test_'
    : profile === 't1' ? 'terria_v1_automation_acceptance_' : null;
  if (!prefix) throw new Error('live acceptance profile must be t0 or t1');
  const suffix = createHash('sha256').update(`${profile}:${runKey}`).digest('hex').slice(0, 12);
  return Object.freeze({
    databases: Object.freeze(Object.fromEntries(['local', 'maint', 'relation']
      .map((role) => [role, `${prefix}${runKey}_${role}`]))),
    accounts: Object.freeze({
      provisioner: `automation_prov_${suffix}`,
      readonly: `automation_ro_${suffix}`
    })
  });
}

function countsSql(databases, label) {
  return `SELECT '${label}',`
    + ` (SELECT COUNT(*) FROM \`${databases.local}\`.\`${PROBE_TABLE}\`),`
    + ` (SELECT COUNT(*) FROM \`${databases.maint}\`.\`${PROBE_TABLE}\`),`
    + ` (SELECT COUNT(*) FROM \`${databases.relation}\`.\`${PROBE_TABLE}\`)`;
}

export function buildAcceptanceProbeSql(databases, probeId) {
  if (!/^[a-z0-9_]+$/.test(probeId ?? '')) throw new Error('probe identity is invalid');
  const names = Object.values(databases ?? {});
  if (names.length !== 3 || names.some((name) => !/^terria_v1_automation_(?:test|acceptance)_[a-z0-9_]+$/.test(name))) {
    throw new Error('probe requires an exact isolated three-database set');
  }
  const create = names.map((name) => `CREATE TABLE IF NOT EXISTS \`${name}\`.\`${PROBE_TABLE}\` (`
    + '`probe_id` VARCHAR(64) NOT NULL PRIMARY KEY, `marker` VARCHAR(64) NOT NULL) ENGINE=InnoDB').join(';\n');
  const insert = names.map((name) => `INSERT INTO \`${name}\`.\`${PROBE_TABLE}\` (probe_id, marker) VALUES ('${probeId}', 'acceptance')`).join(';\n');
  const remove = names.map((name) => `DELETE FROM \`${name}\`.\`${PROBE_TABLE}\` WHERE probe_id = '${probeId}'`).join(';\n');
  return [
    create,
    `${remove}; COMMIT`,
    'START TRANSACTION', insert, 'ROLLBACK', countsSql(databases, 'rollback'),
    'START TRANSACTION', insert, 'COMMIT', countsSql(databases, 'commit'),
    'START TRANSACTION', remove, 'COMMIT', countsSql(databases, 'restore')
  ].join(';\n') + ';\n';
}

export function parseProbeCounts(output) {
  const parsed = Object.fromEntries(String(output ?? '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [label, ...values] = line.split('\t');
    if (!['rollback', 'commit', 'restore'].includes(label) || values.length !== 3) {
      throw new Error('probe count output is malformed');
    }
    return [label, values.map(Number)];
  }));
  for (const label of ['rollback', 'commit', 'restore']) {
    if (!parsed[label] || parsed[label].some((value) => !Number.isInteger(value))) {
      throw new Error(`probe ${label} evidence is missing`);
    }
  }
  if (parsed.rollback.some((value) => value !== 0)) throw new Error('probe rollback left a database mutation');
  if (parsed.commit.some((value) => value !== 1)) throw new Error('probe commit did not reach all three databases');
  if (parsed.restore.some((value) => value !== 0)) throw new Error('probe snapshot restore did not restore the baseline');
  return parsed;
}

export function resolveAcceptanceScope(scope, executor) {
  if (scope === undefined || scope === null || scope === '') return null;
  if (!['item-groups', 'npc-canonical', 'recipe-canonical', 'boss-canonical', 'projectile-canonical', 'buff-canonical', 'biome-canonical'].includes(scope)) {
    throw new Error(`unsupported live acceptance scope: ${scope}`);
  }
  if (typeof executor !== 'function') throw new Error(`${scope} acceptance executor is required`);
  return executor;
}

export function resolveAcceptanceExecutor({ profile, scope } = {}) {
  if (scope === undefined || scope === null || scope === '') return null;
  if (scope === 'item-groups') return runItemGroupLiveAcceptance;
  if (scope === 'npc-canonical' && profile === 't0') return runNpcCanonicalT0Acceptance;
  if (scope === 'npc-canonical' && profile === 't1') return runNpcCanonicalT1Acceptance;
  if (scope === 'recipe-canonical' && profile === 't1') return runRecipeCanonicalT1Acceptance;
  if (scope === 'boss-canonical' && profile === 't1') return runBossCanonicalT1Acceptance;
  if (scope === 'projectile-canonical' && profile === 't1') return runProjectileCanonicalT1Acceptance;
  if (scope === 'buff-canonical' && profile === 't1') return runBuffCanonicalT1Acceptance;
  if (scope === 'biome-canonical' && profile === 't1') return runBiomeCanonicalT1Acceptance;
  if (scope === 'projectile-canonical') throw new Error('Projectile canonical acceptance supports only T1');
  if (scope === 'buff-canonical') throw new Error('Buff canonical acceptance supports only T1');
  if (scope === 'biome-canonical') throw new Error('Biome canonical acceptance supports only T1');
  if (scope === 'boss-canonical') throw new Error('Boss canonical acceptance supports only T1');
  if (scope === 'npc-canonical') throw new Error('NPC canonical acceptance supports only T0 or T1');
  throw new Error(`unsupported live acceptance scope: ${scope}`);
}

export function preflightLiveAcceptanceInvocation({ profile, scope, output, repoRoot = ROOT, completion } = {}) {
  if (profile === 't1' && scope === 'npc-canonical') {
    const evidenceOutput = preflightNpcT1EvidenceOutput({ output, repoRoot });
    requireNpcT1Completion(completion);
    return evidenceOutput;
  }
  return null;
}

function preflightNpcT1EvidenceOutput({ output, repoRoot = ROOT } = {}) {
  if (output !== NPC_T1_EVIDENCE_PATH) {
    throw new Error(`NPC T1 evidence output must be ${NPC_T1_EVIDENCE_PATH}`);
  }
  return resolveNpcT1EvidenceOutput(repoRoot, output);
}

export async function runLiveAutomationAcceptance({
  profile,
  runId,
  mysql,
  redis,
  environmentId = 'local-automation-acceptance',
  privateDirectory,
  maxRowsPerTable = 2,
  scope,
  acceptanceExecutor,
  completion,
  onResources = () => {}
} = {}) {
  if (!['t0', 't1'].includes(profile)) throw new Error('live acceptance profile must be t0 or t1');
  if (!runId || !privateDirectory) throw new Error('runId and privateDirectory are required');
  const scopedExecutor = resolveAcceptanceScope(scope, acceptanceExecutor);
  const npcT1Completion = profile === 't1' && scope === 'npc-canonical'
    ? requireNpcT1Completion(completion)
    : null;
  fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const mappings = openDurableRunKeyRegistry(path.join(privateDirectory, 'run-keys.json'));
  const names = buildAutomationDatabaseNames({ profile, runId, mappings });
  const resources = buildLiveResourceNames({ profile, runKey: names.runKey });
  if (JSON.stringify(resources.databases) !== JSON.stringify({ local: names.local, maint: names.maint, relation: names.relation })) {
    throw new Error('derived live resource names disagree with the durable runKey contract');
  }
  if (!Number.isInteger(redis.logicalDb) || redis.logicalDb < 1 || redis.logicalDb > 14) {
    throw new Error('an explicit empty Redis logical DB from 1..14 is required');
  }
  await onResources({ ...resources, redis: { host: redis.host, port: redis.port, logicalDb: redis.logicalDb } });

  const accountPasswords = {
    provisioner: randomBytes(32).toString('hex'),
    readonly: randomBytes(32).toString('hex')
  };
  const adapter = await createLiveAutomationAdapter({
    repoRoot: ROOT, mysql, redis, environmentId,
    accountNames: resources.accounts, accountPasswords, maxRowsPerTable
  });
  let manifest;
  let primaryError;
  let result;
  try {
    const observed = await adapter.inspectServer();
    manifest = await provisionAutomationDatabases({
      profile,
      runId,
      mappings,
      adapter,
      manifestPath: path.join(privateDirectory, `${profile}-manifest.json`),
      environmentId,
      expectedServerIdentity: observed,
      sourceSnapshot: profile === 't1' ? { snapshotId: `${runId}-readonly-snapshot` } : undefined
    });
    const snapshotVerification = profile === 't1'
      ? await adapter.verifyCopiedSnapshot({ sourceSnapshot: manifest.sourceSnapshot, targetDatabases: manifest.databases })
      : null;
    const snapshotBinding = npcT1Completion
      ? buildNpcCanonicalT1SnapshotBinding({
        completion: npcT1Completion,
        sourceSnapshot: manifest.sourceSnapshot,
        snapshotVerification,
      })
      : null;
    const probeId = `probe_${createHash('sha256').update(runId).digest('hex').slice(0, 16)}`;
    const probeCounts = parseProbeCounts(await adapter.provisionerClient.query(
      buildAcceptanceProbeSql(resources.databases, probeId)
    ));
    const acceptance = scopedExecutor ? await scopedExecutor({
      profile,
      runId,
      repoRoot: ROOT,
      databases: resources.databases,
      client: adapter.provisionerClient,
      manifest,
      snapshotVerification,
      completion: npcT1Completion,
      snapshotBinding,
      mysql: ['recipe-canonical', 'boss-canonical', 'projectile-canonical', 'buff-canonical', 'biome-canonical'].includes(scope) ? {
        host: mysql.host,
        port: mysql.port,
        username: resources.accounts.provisioner,
        password: accountPasswords.provisioner,
        readonlyUsername: resources.accounts.readonly,
        readonlyPassword: accountPasswords.readonly,
      } : mysql,
    }) : null;
    result = {
      profile,
      runId,
      runKey: manifest.runKey,
      databases: resources.databases,
      redis: { host: redis.host, port: redis.port, logicalDb: redis.logicalDb },
      serverIdentity: manifest.serverIdentity,
      snapshot: manifest.sourceSnapshot ? {
        snapshotId: manifest.sourceSnapshot.snapshotId,
        snapshotHash: manifest.sourceSnapshot.snapshotHash,
        tableCount: manifest.sourceSnapshot.tables.length,
        tables: manifest.sourceSnapshot.tables
      } : null,
      snapshotVerification: snapshotVerification ? {
        verified: snapshotVerification.verified,
        tableCount: snapshotVerification.tables.length,
        verificationHash: snapshotVerification.verificationHash
      } : null,
      snapshotBinding,
      probeCounts,
      acceptance,
      cleanupPassed: false,
      status: 'passed'
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    if (manifest) {
      try {
        await dropAutomationDatabases({ manifest, runKey: manifest.runKey, adapter });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await adapter.verifyCleanup({ databases: resources.databases, logicalDb: redis.logicalDb });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await adapter.cleanupAccounts();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length && !primaryError) {
      throw new AggregateError(cleanupErrors, 'live acceptance cleanup failed');
    }
    if (cleanupErrors.length && primaryError) {
      primaryError.message += `; cleanup failures: ${cleanupErrors.map((error) => error.message).join('; ')}`;
    }
    if (result && cleanupErrors.length === 0) result.cleanupPassed = true;
  }
  return result;
}

function requireNpcT1Completion(completion) {
  if (!/^sha256:[a-f0-9]{64}$/.test(completion?.inputHash ?? '')
      || !/^sha256:[a-f0-9]{64}$/.test(completion?.completionHash ?? '')) {
    throw new Error('NPC T1 requires a pre-read owner-phase completion binding');
  }
  return completion;
}

export async function preflightNpcT1AuthorizedCliInvocation({
  repoRoot = ROOT,
  configPath,
  expectedConfigHash,
  redisLogicalDb,
  runId,
  env = process.env,
  now = new Date().toISOString(),
  loadAuthorizationContextImpl = loadAuthorizedOperationContext,
  operationId = NPC_T1_OPERATION_ID,
  requireCompletion = true,
  consumeDispatchPermitImpl = consumeAuthorizedOperationDispatchPermit,
  resolveCurrentTechnicalInputImpl = resolveNpcT1CurrentTechnicalIdentity,
  inspectServerFingerprintImpl = inspectNpcT1ServerFingerprint,
} = {}) {
  const configBytes = readPrivateNpcT1Config({ configPath, expectedConfigHash });
  let config;
  try {
    config = JSON.parse(configBytes.toString('utf8'));
  } catch {
    throw new Error('NPC T1 config must be valid JSON');
  }
  const authorizationContext = loadAuthorizationContextImpl({
    env,
    operationId,
    now,
  });
  const currentTechnicalInput = await resolveCurrentTechnicalInputImpl({
    repoRoot: path.resolve(repoRoot),
    config,
    authorizationContext,
  });
  const completion = requireCompletion ? requireNpcT1Completion(currentTechnicalInput?.completion) : null;
  if (requireCompletion) assertNpcT1CompletionMatchesDataBundle({ completion, dataBundleEntries: currentTechnicalInput?.dataBundleEntries });
  const expectedServerFingerprint = assertNpcT1PacketTechnicalIdentity({
    configPath,
    expectedConfigHash,
    redisLogicalDb,
    runId,
    authorizationContext,
    currentTechnicalInput,
  });
  const observedServerFingerprint = canonicalServerFingerprint(await inspectServerFingerprintImpl({ config }));
  if (JSON.stringify(observedServerFingerprint) !== JSON.stringify(expectedServerFingerprint)) {
    throw new Error('NPC T1 live server fingerprint differs from the authorized config identity');
  }
  consumeDispatchPermitImpl({
    env,
    authorizedContext: authorizationContext,
    decisionLedgerPath: path.join(path.resolve(repoRoot), 'reports/authorization/canonical/used-decisions.json'),
  });
  return {
    configBytes,
    config,
    authorizationContext,
    currentTechnicalInput,
    serverFingerprint: expectedServerFingerprint,
    completion,
  };
}

export async function preflightRecipeT1AuthorizedCliInvocation(options = {}) {
  const resolver = options.resolveCurrentTechnicalInputImpl ?? (async ({ repoRoot, authorizationContext }) => {
    return deriveCanonicalTechnicalIdentity({
      ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId: authorizationContext.operationId, executionManifest: authorizationContext.executionManifest }),
      serverFingerprint: authorizationContext.executionManifest.isolatedAcceptance.serverFingerprint,
    });
  });
  return preflightNpcT1AuthorizedCliInvocation({ ...options, operationId: 'canonical-recipe-t1-acceptance', requireCompletion: false, resolveCurrentTechnicalInputImpl: resolver });
}

export async function preflightBossT1AuthorizedCliInvocation(options = {}) {
  const resolver = options.resolveCurrentTechnicalInputImpl ?? (async ({ repoRoot, authorizationContext }) => {
    return deriveCanonicalTechnicalIdentity({
      ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId: authorizationContext.operationId, executionManifest: authorizationContext.executionManifest }),
      serverFingerprint: authorizationContext.executionManifest.isolatedAcceptance.serverFingerprint,
    });
  });
  return preflightNpcT1AuthorizedCliInvocation({ ...options, operationId: 'canonical-boss-t1-acceptance', requireCompletion: false, resolveCurrentTechnicalInputImpl: resolver });
}

export async function preflightProjectileT1AuthorizedCliInvocation(options = {}) {
  const resolver = options.resolveCurrentTechnicalInputImpl ?? (async ({ repoRoot, authorizationContext }) => {
    return deriveCanonicalTechnicalIdentity({
      ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId: authorizationContext.operationId, executionManifest: authorizationContext.executionManifest }),
      serverFingerprint: authorizationContext.executionManifest.isolatedAcceptance.serverFingerprint,
    });
  });
  return preflightNpcT1AuthorizedCliInvocation({ ...options, operationId: 'canonical-projectile-t1-acceptance', requireCompletion: false, resolveCurrentTechnicalInputImpl: resolver });
}

export async function preflightBuffT1AuthorizedCliInvocation(options = {}) {
  const resolver = options.resolveCurrentTechnicalInputImpl ?? (async ({ repoRoot, authorizationContext }) => deriveCanonicalTechnicalIdentity({
    ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId: authorizationContext.operationId, executionManifest: authorizationContext.executionManifest }),
    serverFingerprint: authorizationContext.executionManifest.isolatedAcceptance.serverFingerprint,
  }));
  return preflightNpcT1AuthorizedCliInvocation({ ...options, operationId: 'canonical-buff-t1-acceptance', requireCompletion: false, resolveCurrentTechnicalInputImpl: resolver });
}

export async function preflightBiomeT1AuthorizedCliInvocation(options = {}) {
  const resolver = options.resolveCurrentTechnicalInputImpl ?? (async ({ repoRoot, authorizationContext }) => deriveCanonicalTechnicalIdentity({
    ...resolveCanonicalOperationTechnicalInput({ repoRoot, operationId: authorizationContext.operationId, executionManifest: authorizationContext.executionManifest }),
    serverFingerprint: authorizationContext.executionManifest.isolatedAcceptance.serverFingerprint,
  }));
  return preflightNpcT1AuthorizedCliInvocation({ ...options, operationId: 'canonical-biome-t1-acceptance', requireCompletion: false, resolveCurrentTechnicalInputImpl: resolver });
}

export function assertNpcT1PacketTechnicalIdentity({
  configPath,
  expectedConfigHash,
  redisLogicalDb,
  runId,
  authorizationContext,
  currentTechnicalInput,
} = {}) {
  const operationId = authorizationContext?.operationId;
  if (!['canonical-npc-t1-acceptance', 'canonical-recipe-t1-acceptance', 'canonical-boss-t1-acceptance', 'canonical-projectile-t1-acceptance', 'canonical-buff-t1-acceptance', 'canonical-biome-t1-acceptance'].includes(operationId)) {
    throw new Error(`T1 packet operationId is unsupported: ${operationId}`);
  }
  const manifest = authorizationContext?.executionManifest;
  const isolatedAcceptance = manifest?.isolatedAcceptance;
  const expectedServerFingerprint = canonicalServerFingerprint(isolatedAcceptance?.serverFingerprint);
  if (path.resolve(String(configPath ?? '')) !== path.resolve(String(isolatedAcceptance?.configPath ?? ''))
      || expectedConfigHash !== isolatedAcceptance?.configSha256) {
    throw new Error('NPC T1 config path or hash differs from the authorized execution manifest');
  }
  if (Number(redisLogicalDb) !== isolatedAcceptance?.redisLogicalDb
      || String(runId ?? '') !== isolatedAcceptance?.runId) {
    throw new Error('NPC T1 Redis DB or run ID differs from the authorized execution manifest');
  }
  if (authorizationContext?.serverFingerprint !== hashCanonicalServerFingerprint(expectedServerFingerprint)) {
    throw new Error('NPC T1 packet server fingerprint differs from the authorized config identity');
  }
  if (authorizationContext?.dataBundleSha256 !== currentTechnicalInput?.dataBundleSha256) {
    throw new Error('NPC T1 data bundle drifted after authorization');
  }
  if (authorizationContext?.executionManifestHash !== currentTechnicalInput?.executionManifestHash) {
    throw new Error('NPC T1 execution manifest drifted after authorization');
  }
  return expectedServerFingerprint;
}

export function assertNpcT1CompletionMatchesDataBundle({ completion, dataBundleEntries } = {}) {
  const current = requireNpcT1Completion(completion);
  if (!Array.isArray(dataBundleEntries)) {
    throw new Error('NPC T1 completion requires current data bundle entries');
  }
  const hashes = new Map(dataBundleEntries.map((entry) => [entry?.path, entry?.contentHash]));
  if (hashes.get(NPC_T1_INPUT_PATH) !== current.inputHash
      || hashes.get(NPC_T1_COMPLETION_PATH) !== current.completionHash) {
    throw new Error('NPC T1 completion differs from the current data bundle');
  }
  return current;
}

async function resolveNpcT1CurrentTechnicalIdentity({ repoRoot, config, authorizationContext } = {}) {
  const serverFingerprint = canonicalServerFingerprint(config?.npcT1ServerFingerprint);
  const technicalIdentity = deriveCanonicalTechnicalIdentity({
    ...resolveCanonicalOperationTechnicalInput({
      repoRoot,
      operationId: NPC_T1_OPERATION_ID,
      executionManifest: authorizationContext?.executionManifest,
    }),
    serverFingerprint,
  });
  const completion = await readCanonicalNpcOwnerPhaseCompletion({ repoRoot });
  assertNpcT1CompletionMatchesDataBundle({
    completion,
    dataBundleEntries: technicalIdentity.dataBundleEntries,
  });
  return { ...technicalIdentity, completion };
}

export async function inspectNpcT1ServerFingerprint({ config, mysqlClientFactory = createMysqlCommandClient } = {}) {
  const expected = canonicalServerFingerprint(config?.npcT1ServerFingerprint);
  const client = mysqlClientFactory({
    host: expected.host,
    port: expected.port,
    username: config?.database?.username,
    password: config?.database?.password,
  });
  const serverUuid = String(await client.query('SELECT @@server_uuid')).trim();
  return canonicalServerFingerprint({ ...expected, serverUuid });
}

function readPrivateNpcT1Config({ configPath, expectedConfigHash } = {}) {
  const resolvedConfigPath = path.resolve(String(configPath ?? ''));
  if (!configPath || !/^sha256:[a-f0-9]{64}$/.test(expectedConfigHash ?? '')) {
    throw new Error('NPC T1 config hash is required');
  }
  const stat = fs.lstatSync(resolvedConfigPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('NPC T1 config must be a private ordinary file');
  }
  const configBytes = fs.readFileSync(resolvedConfigPath);
  const actualConfigHash = `sha256:${createHash('sha256').update(configBytes).digest('hex')}`;
  if (actualConfigHash !== expectedConfigHash) {
    throw new Error('NPC T1 config hash drifted from the authorized execution manifest');
  }
  return configBytes;
}

function resolveNpcT1EvidenceOutput(repoRoot, outputPath) {
  const relative = String(outputPath ?? '').replaceAll('\\', '/');
  if (!relative || path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative) {
    throw new Error('NPC T1 evidence output must be a normalized repository-relative path');
  }
  const root = path.resolve(repoRoot);
  const output = path.resolve(root, relative);
  const reportsRoot = path.resolve(root, 'reports/canonical-migration');
  if (!output.startsWith(`${reportsRoot}${path.sep}`)) {
    throw new Error('NPC T1 evidence output must stay under reports/canonical-migration');
  }
  return output;
}

async function writePrivateJson(outputPath, value) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporary = `${outputPath}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temporary, outputPath);
    await fs.promises.chmod(outputPath, 0o600);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const args = parseArgs(process.argv);
  const profile = args.profile;
  const scope = args.scope;
  const npcT1Invocation = profile === 't1' && scope === 'npc-canonical';
  const recipeT1Invocation = profile === 't1' && scope === 'recipe-canonical';
  const bossT1Invocation = profile === 't1' && scope === 'boss-canonical';
  const projectileT1Invocation = profile === 't1' && scope === 'projectile-canonical';
  const buffT1Invocation = profile === 't1' && scope === 'buff-canonical';
  const biomeT1Invocation = profile === 't1' && scope === 'biome-canonical';
  if (!npcT1Invocation && !recipeT1Invocation && !bossT1Invocation && !projectileT1Invocation && !buffT1Invocation && !biomeT1Invocation && process.env.TERRAPEDIA_AUTOMATION_ACCEPTANCE_ENABLED !== '1') {
    throw new Error('set TERRAPEDIA_AUTOMATION_ACCEPTANCE_ENABLED=1 for the authorized isolated run');
  }
  const configPath = path.resolve(args['config-path'] ?? '');
  if (!args['config-path'] || !fs.existsSync(configPath)) throw new Error('--config-path is required');
  const redisLogicalDb = Number(args['redis-db']);
  const requestedRunId = args['run-id'] ?? null;
  const acceptanceExecutor = resolveAcceptanceExecutor({ profile, scope });
  const npcT1EvidenceOutput = npcT1Invocation
    ? preflightNpcT1EvidenceOutput({ output: args.output, repoRoot: ROOT })
    : recipeT1Invocation
      ? path.resolve(ROOT, args.output === RECIPE_T1_EVIDENCE_PATH ? args.output : (() => { throw new Error(`recipe T1 evidence output must be ${RECIPE_T1_EVIDENCE_PATH}`); })())
    : bossT1Invocation
      ? path.resolve(ROOT, args.output === BOSS_T1_EVIDENCE_PATH ? args.output : (() => { throw new Error(`boss T1 evidence output must be ${BOSS_T1_EVIDENCE_PATH}`); })())
    : projectileT1Invocation
      ? path.resolve(ROOT, args.output === PROJECTILE_T1_EVIDENCE_PATH ? args.output : (() => { throw new Error(`projectile T1 evidence output must be ${PROJECTILE_T1_EVIDENCE_PATH}`); })())
    : buffT1Invocation
      ? path.resolve(ROOT, args.output === BUFF_T1_EVIDENCE_PATH ? args.output : (() => { throw new Error(`buff T1 evidence output must be ${BUFF_T1_EVIDENCE_PATH}`); })())
    : biomeT1Invocation
      ? path.resolve(ROOT, args.output === BIOME_T1_EVIDENCE_PATH ? args.output : (() => { throw new Error(`biome T1 evidence output must be ${BIOME_T1_EVIDENCE_PATH}`); })())
    : preflightLiveAcceptanceInvocation({ profile, scope, output: args.output, repoRoot: ROOT });
  const npcT1Preflight = npcT1Invocation
    ? await preflightNpcT1AuthorizedCliInvocation({
      repoRoot: ROOT,
      configPath,
      expectedConfigHash: args['config-sha256'],
      redisLogicalDb,
      runId: requestedRunId,
    })
    : recipeT1Invocation
      ? await preflightRecipeT1AuthorizedCliInvocation({ repoRoot: ROOT, configPath, expectedConfigHash: args['config-sha256'], redisLogicalDb, runId: requestedRunId })
      : bossT1Invocation
        ? await preflightBossT1AuthorizedCliInvocation({ repoRoot: ROOT, configPath, expectedConfigHash: args['config-sha256'], redisLogicalDb, runId: requestedRunId })
      : projectileT1Invocation
        ? await preflightProjectileT1AuthorizedCliInvocation({ repoRoot: ROOT, configPath, expectedConfigHash: args['config-sha256'], redisLogicalDb, runId: requestedRunId })
      : buffT1Invocation
        ? await preflightBuffT1AuthorizedCliInvocation({ repoRoot: ROOT, configPath, expectedConfigHash: args['config-sha256'], redisLogicalDb, runId: requestedRunId })
      : biomeT1Invocation
        ? await preflightBiomeT1AuthorizedCliInvocation({ repoRoot: ROOT, configPath, expectedConfigHash: args['config-sha256'], redisLogicalDb, runId: requestedRunId })
        : null;
  const npcT1Completion = npcT1Preflight?.completion ?? null;
  const config = npcT1Preflight?.config ?? JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-${profile}-live-`));
  const runId = requestedRunId || `${profile}-${Date.now()}-${randomBytes(8).toString('hex')}`;
  try {
    const result = await runLiveAutomationAcceptance({
      profile,
      runId,
      privateDirectory,
      mysql: {
        host: config.database.host,
        port: config.database.port,
        username: config.database.username,
        password: config.database.password
      },
      redis: {
        host: config.redis.host,
        port: Number(args['redis-port'] || config.redis.port),
        password: config.redis.password,
        logicalDb: redisLogicalDb
      },
      maxRowsPerTable: Number(args['max-rows'] || 2),
      scope,
      acceptanceExecutor,
      completion: npcT1Completion,
      onResources: async (resources) => {
        process.stdout.write(`${JSON.stringify({ safetyBoundary: {
          formalDatabases: 'read-only',
          isolatedDatabases: resources.databases,
          temporaryAccounts: resources.accounts,
          redis: resources.redis
        } }, null, 2)}\n`);
      }
    });
    if (npcT1EvidenceOutput) {
      let evidence = result;
      if (npcT1Invocation) {
        const postCleanupCompletion = await readCanonicalNpcOwnerPhaseCompletion({ repoRoot: ROOT });
        if (postCleanupCompletion.inputHash !== npcT1Completion.inputHash
            || postCleanupCompletion.completionHash !== npcT1Completion.completionHash) {
          throw new Error('NPC T1 owner-phase completion changed during isolated acceptance');
        }
        evidence = buildNpcCanonicalT1Evidence({ runId, result, completion: postCleanupCompletion });
      }
      await writePrivateJson(npcT1EvidenceOutput, evidence);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    fs.rmSync(privateDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`live automation acceptance failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
