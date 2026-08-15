#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAudioAssetImport } from '../import/import-wiki-audio-assets-to-db.mjs';
import { runBossImport } from '../import/import-wiki-bosses-to-db.mjs';
import { runIndependentEntityImport } from '../import/import-independent-entities-to-db.mjs';
import {
  applyBundleChanges as applyShimmerBundleChanges,
  assertShimmerImportScopeMatchesPreview,
  buildShimmerImportPreview,
  loadCurrentShimmerScope,
  loadTargetFingerprint,
  loadVerifiedShimmerImportBundle,
} from '../import/import-wiki-shimmer-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { validateSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export async function executeSupplementaryL1Operation({
  adapter,
  bundle,
  authorizationContext,
  now = new Date().toISOString(),
} = {}) {
  validateSupplementaryL1Bundle(bundle);
  const executionTime = requireTimestamp(now, 'execution time');
  validateAuthorizationContext(authorizationContext, bundle.operationId, executionTime);
  requireAdapter(adapter);
  await adapter.begin();
  try {
    const current = await adapter.lockCurrentContext(bundle, executionTime);
    assertCurrentContext({ current, bundle, authorizationContext });
    await adapter.persistRunChain(bundle, authorizationContext);
    const importSummary = await adapter.applyFrozenImport(bundle.importPlan, bundle);
    assertImportSummaryHealthy(importSummary);
    await adapter.advanceMutationGenerations(bundle);
    const completedAt = executionTime;
    await adapter.persistCommittedApply({ bundle, importSummary, completedAt });
    await adapter.commit();
    return Object.freeze({
      schemaVersion: 1,
      operationId: bundle.operationId,
      runId: bundle.runId,
      domainId: bundle.domainId,
      status: 'completed',
      bundleHash: bundle.bundleHash,
      policySetHash: bundle.policy.policySetHash,
      importSummary,
      completedAt,
    });
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}

export function assertImportSummaryHealthy(value) {
  const errors = [];
  collectImportErrors(value, '$', errors);
  if (errors.length > 0) {
    throw new Error(`import summary contains ${errors.length} error(s): ${errors.slice(0, 3).join('; ')}`);
  }
}

function collectImportErrors(value, location, errors) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectImportErrors(entry, `${location}[${index}]`, errors));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if ((key === 'errors' || key === 'failures') && Array.isArray(child)) {
      child.forEach((entry) => errors.push(`${childLocation}: ${String(entry)}`));
      continue;
    }
    collectImportErrors(child, childLocation, errors);
  }
}

export function createMysqlSupplementaryL1Adapter(connection, {
  bundlePath,
  repoRoot = process.cwd(),
  environmentId = 'local',
} = {}) {
  if (!connection) throw new TypeError('MySQL connection is required');
  const frozenBundlePath = path.resolve(requireText(bundlePath, 'bundlePath'));
  const bundleBytes = fs.readFileSync(frozenBundlePath);
  const bundleFileHash = sha256Bytes(bundleBytes);
  const root = path.resolve(repoRoot);
  const state = { applyId: null, approvalId: null };
  return {
    begin: () => connection.beginTransaction(),
    lockCurrentContext: (bundle, executionTime) => readCurrentSupplementaryContext(connection, {
      bundle,
      environmentId,
      executionTime,
      lock: true,
      initializeGenerations: true,
    }),
    async persistRunChain(bundle, authorizationContext) {
      const expiresAt = toMysqlTimestamp(authorizationContext.expiresAt);
      await connection.query(
        'INSERT INTO crawler_automation_run'
        + ' (run_id, primary_domain_id, covered_domains_json, policy_set_hash, trigger_kind,'
        + ' status, baseline_fingerprint, version) VALUES (?, ?, CAST(? AS JSON), ?, ?, ?, ?, 0)',
        [bundle.runId, bundle.domainId, JSON.stringify([bundle.domainId]), bundle.policy.policySetHash,
          'AUTHORIZED_L1', 'SNAPSHOT_READY', bundle.baselineFingerprint],
      );
      await connection.query(
        'INSERT INTO crawler_automation_run_policy'
        + ' (run_id, domain_id, policy_version, policy_hash, policy_set_hash) VALUES (?, ?, ?, ?, ?)',
        [bundle.runId, bundle.domainId, bundle.policy.policyVersion, bundle.policy.policyHash,
          bundle.policy.policySetHash],
      );
      await connection.query(
        'INSERT INTO crawler_automation_evidence'
        + ' (run_id, kind, private_path, sha256, size_bytes, schema_version, frozen_input,'
        + ' policy_set_hash, retention_until) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)',
        [bundle.runId, `${bundle.domainId.toUpperCase()}_FROZEN_BUNDLE`, frozenBundlePath,
          bundleFileHash, bundleBytes.length, bundle.policy.policySetHash, expiresAt],
      );
      await connection.query(
        'INSERT INTO crawler_automation_evidence_set'
        + ' (run_id, evidence_hash, manifest_json, policy_set_hash, baseline_fingerprint)'
        + ' VALUES (?, ?, CAST(? AS JSON), ?, ?)',
        [bundle.runId, bundle.evidenceHash, JSON.stringify({
          automaticSourceFingerprint: bundle.importPlan.automaticSourceFingerprint ?? null,
          bundleFileHash,
          privatePath: frozenBundlePath,
          source: bundle.source,
        }), bundle.policy.policySetHash, bundle.baselineFingerprint],
      );
      await connection.query(
        'INSERT INTO crawler_automation_apply_bundle'
        + ' (run_id, bundle_hash, policy_set_hash, evidence_hash, logical_diff_hash,'
        + ' baseline_fingerprint, planned_apply_action_id, schema_version, private_path,'
        + ' size_bytes, retention_until) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
        [bundle.runId, bundle.bundleHash, bundle.policy.policySetHash, bundle.evidenceHash,
          bundle.logicalDiffHash, bundle.baselineFingerprint, bundle.operationId,
          frozenBundlePath, bundleBytes.length, expiresAt],
      );
      const automatic = bundle.executionMode === 'ACTIVATION_GATED_AUTO';
      await connection.query(
        'INSERT INTO crawler_automation_decision'
        + ' (run_id, decision, decision_hash, reason_codes_json, counts_ratios_json,'
        + ' gate_results_json, policy_set_hash, evidence_hash, bundle_hash, logical_diff_hash,'
        + ' logical_diff_identity_json, baseline_fingerprint, snapshot_required,'
        + ' planned_apply_action_id) VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON),'
        + ' CAST(? AS JSON), ?, ?, ?, ?, CAST(? AS JSON), ?, 1, ?)',
        [bundle.runId, automatic ? 'AUTO_APPLY_L2' : 'REQUIRES_OWNER_L1', bundle.decisionHash,
          JSON.stringify([automatic ? 'ACTIVATION_GATED_AUTOMATIC' : 'LEVEL_L1_REQUIRES_OWNER']), JSON.stringify({}), JSON.stringify([true]),
          bundle.policy.policySetHash, bundle.evidenceHash, bundle.bundleHash,
          bundle.logicalDiffHash, JSON.stringify(bundle.logicalDiffIdentity),
          bundle.baselineFingerprint, bundle.operationId],
      );
      if (!automatic) {
        const [approval] = await connection.query(
        'INSERT INTO crawler_automation_approval'
        + ' (request_key, run_id, decision_hash, policy_set_hash, evidence_hash, bundle_hash,'
        + ' logical_diff_hash, logical_diff_identity_json, baseline_fingerprint,'
        + ' planned_apply_action_id, actor, action, reason, reauth_id, run_version, version,'
        + ' consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, 0, 0, NOW())',
        [authorizationContext.decisionIdentity, bundle.runId, bundle.decisionHash,
          bundle.policy.policySetHash, bundle.evidenceHash, bundle.bundleHash,
          bundle.logicalDiffHash, JSON.stringify(bundle.logicalDiffIdentity),
          bundle.baselineFingerprint, bundle.operationId, authorizationContext.actor,
          'APPROVE', authorizationContext.reason, authorizationContext.authorizationReference],
        );
        state.approvalId = Number(approval?.insertId);
        if (!Number.isSafeInteger(state.approvalId) || state.approvalId < 1) {
          throw new Error('supplementary L1 approval insert did not return an id');
        }
      }
      await connection.query(
        'INSERT INTO crawler_automation_snapshot'
        + ' (run_id, scope_descriptor_json, private_path, sha256, policy_set_hash,'
        + ' baseline_fingerprint, integrity_status, retention_until)'
        + ' VALUES (?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?)',
        [bundle.runId, JSON.stringify({ ownedTables: bundle.ownedTables }), frozenBundlePath,
          bundleFileHash, bundle.policy.policySetHash, bundle.baselineFingerprint, 'VERIFIED', expiresAt],
      );
      const [apply] = await connection.query(
        'INSERT INTO crawler_automation_apply'
        + ' (run_id, bundle_hash, policy_set_hash, decision_hash, approval_id, mode, status,'
        + ' before_generation_json, commit_protocol) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)',
        [bundle.runId, bundle.bundleHash, bundle.policy.policySetHash, bundle.decisionHash,
          state.approvalId, automatic ? 'AUTO_APPLY_L2' : 'APPROVED_OWNER_L1', 'APPLYING',
          JSON.stringify(bundle.baseline.generations), 'SINGLE_TXN'],
      );
      state.applyId = Number(apply?.insertId);
      if (!Number.isSafeInteger(state.applyId) || state.applyId < 1) {
        throw new Error('supplementary L1 apply insert did not return an id');
      }
      for (const generation of bundle.baseline.generations) {
        await connection.query(
          'INSERT INTO crawler_automation_write_fence'
          + ' (environment_id, database_role, physical_table, field_group, logical_predicate_hash,'
          + ' latest_run_id, fence_token, before_generation, expires_at, version)'
          + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
          + ' ON DUPLICATE KEY UPDATE latest_run_id = VALUES(latest_run_id),'
          + ' fence_token = VALUES(fence_token), before_generation = VALUES(before_generation),'
          + ' committed_generation = NULL, commit_marker = NULL, expires_at = VALUES(expires_at),'
          + ' version = version + 1',
          [environmentId, generation.databaseRole, generation.table, 'all_columns', hashJson({ kind: 'all' }),
            bundle.runId, hashJson({ runId: bundle.runId, table: generation.table }),
            generation.generation, expiresAt],
        );
      }
    },
    applyFrozenImport: (_plan, bundle) => applyFrozenDomainImport({ connection, bundle, repoRoot: root }),
    async advanceMutationGenerations(bundle) {
      for (const generation of bundle.baseline.generations) {
        const [result] = await connection.query(
          'UPDATE crawler_automation_mutation_generation'
          + ' SET generation = generation + 1, last_writer_run_id = ?'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND scope_key_hash = ? AND generation = ?',
          [bundle.runId, environmentId, generation.databaseRole, generation.table,
            generationScopeHash(generation), generation.generation],
        );
        if (Number(result?.affectedRows) !== 1) {
          throw new Error(`mutation generation fence was lost: ${generation.table}`);
        }
        const [fence] = await connection.query(
          'UPDATE crawler_automation_write_fence SET committed_generation = ?, commit_marker = ?'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND latest_run_id = ? AND before_generation = ?',
          [generation.generation + 1, bundle.bundleHash.slice(7), environmentId,
            generation.databaseRole, generation.table, bundle.runId, generation.generation],
        );
        if (Number(fence?.affectedRows) !== 1) throw new Error(`write fence was lost: ${generation.table}`);
      }
    },
    async persistCommittedApply({ bundle, importSummary, completedAt }) {
      const committed = bundle.baseline.generations.map((row) => ({ ...row, generation: row.generation + 1 }));
      const [apply] = await connection.query(
        'UPDATE crawler_automation_apply SET status = ?, committed_generation_json = CAST(? AS JSON),'
        + ' completed_at = ? WHERE id = ? AND status = ?',
        ['COMMITTED', JSON.stringify({ generations: committed, importSummary }),
          toMysqlTimestamp(completedAt), state.applyId, 'APPLYING'],
      );
      if (Number(apply?.affectedRows) !== 1) throw new Error('supplementary apply status fence was lost');
      const [run] = await connection.query(
        'UPDATE crawler_automation_run SET status = ?, completed_at = ?, version = version + 1'
        + ' WHERE run_id = ? AND status = ? AND version = 0',
        ['COMPLETED', toMysqlTimestamp(completedAt), bundle.runId, 'SNAPSHOT_READY'],
      );
      if (Number(run?.affectedRows) !== 1) throw new Error('supplementary run status fence was lost');
    },
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
  };
}

export async function readCurrentSupplementaryContext(connection, {
  bundle,
  environmentId = 'local',
  lock = false,
  initializeGenerations = false,
} = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [ownerRows] = await connection.query(
    `SELECT username, status FROM crawler_automation_owner WHERE singleton_key = 1${suffix}`,
  );
  const [policyRows] = await connection.query(
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
    + ' pv.policy_hash AS policyHash, p.current_level AS currentLevel,'
    + ' p.operational_state AS operationalState FROM crawler_automation_policy p'
    + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
    + ` AND pv.policy_version = p.current_version ORDER BY p.domain_id${suffix}`,
  );
  const policy = (policyRows ?? []).find((row) => row.domainId === bundle.domainId);
  if (!policy) throw new Error(`current ${bundle.domainId} policy is missing`);
  const policySetHash = computePolicySetHash((policyRows ?? []).map((row) => ({
    domainId: row.domainId,
    policyVersion: Number(row.policyVersion),
    policyHash: row.policyHash,
  })));
  const generations = [];
  for (const scope of bundle.ownedTables) {
    if (initializeGenerations) {
      await connection.query(
        'INSERT IGNORE INTO crawler_automation_mutation_generation'
        + ' (environment_id, database_role, physical_table, scope_key_hash, generation, schema_hash)'
        + ' VALUES (?, ?, ?, ?, 0, ?)',
        [environmentId, scope.databaseRole, scope.table, generationScopeHash(scope),
          hashJson({ schemaVersion: 1, databaseRole: scope.databaseRole, table: scope.table })],
      );
    }
    const [rows] = await connection.query(
      'SELECT generation FROM crawler_automation_mutation_generation'
      + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
      + ` AND scope_key_hash = ?${suffix}`,
      [environmentId, scope.databaseRole, scope.table, generationScopeHash(scope)],
    );
    generations.push({ ...scope, generation: Number(rows?.[0]?.generation ?? 0) });
  }
  const tables = {};
  for (const scope of bundle.ownedTables) {
    const [rows] = await connection.query(`SELECT * FROM \`${scope.table}\` ORDER BY \`id\`${suffix}`);
    tables[scope.table] = rows ?? [];
  }
  const baseline = {
    environmentId,
    generations,
    projectionHash: hashJson(tables),
  };
  const [activationRows] = await connection.query(
    'SELECT decision_identity AS activationDecisionIdentity, packet_hash AS activationPacketHash,'
    + ' policy_set_hash AS activationPolicySetHash, authorized_at AS activationAuthorizedAt,'
    + ' expires_at AS activationExpiresAt'
    + ' FROM crawler_automation_activation_decision'
    + ' WHERE decision_kind = ? AND domain_id = ?'
    + ' ORDER BY authorized_at DESC, id DESC LIMIT 1',
    ['SCHEDULER_ACTIVATION', 'crawler_v2_scheduler'],
  );
  const activation = activationRows?.[0] ?? null;
  return {
    ownerUsername: ownerRows?.[0]?.username ?? null,
    ownerStatus: ownerRows?.[0]?.status ?? null,
    domainId: policy.domainId,
    policyVersion: Number(policy.policyVersion),
    policyHash: policy.policyHash,
    policySetHash,
    currentLevel: policy.currentLevel,
    operationalState: policy.operationalState,
    baselineFingerprint: hashJson(baseline),
    approvalMode: 'APPROVED_OWNER_L1',
    executionMode: 'MANUAL_OWNER_L1',
    approvalConsumed: false,
    baseline,
    activationDecisionIdentity: activation?.activationDecisionIdentity ?? null,
    activationPacketHash: activation?.activationPacketHash ?? null,
    activationPolicySetHash: activation?.activationPolicySetHash ?? null,
    activationAuthorizedAt: activation?.activationAuthorizedAt ?? null,
    activationExpiresAt: activation?.activationExpiresAt ?? null,
  };
}

async function applyFrozenDomainImport({ connection, bundle, repoRoot }) {
  const sourcePath = path.resolve(repoRoot, bundle.source.path);
  const sourcePayload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (sha256Json(sourcePayload) !== bundle.source.sha256) throw new Error('frozen source hash drifted before apply');
  if (['npcs', 'buffs', 'armor_sets'].includes(bundle.domainId)) {
    const domainDataset = sourcePayload?.datasets?.[bundle.domainId];
    const itemDataset = sourcePayload?.datasets?.items;
    if (domainDataset?.entity !== bundle.domainId || !Array.isArray(domainDataset.records)
        || itemDataset?.entity !== 'items' || !Array.isArray(itemDataset.records)) {
      throw new Error(`frozen ${bundle.domainId} source is missing exact domain and Item dependency datasets`);
    }
    return runIndependentEntityImport({ apply: 'true', entity: bundle.domainId }, {
      connection,
      transactionOwner: 'caller',
      datasets: sourcePayload.datasets,
    });
  }
  if (bundle.domainId === 'audio') {
    return runAudioAssetImport({
      apply: true,
      inputJsonPath: sourcePath,
      reportPath: null,
      db: { database: 'terria_v1_local' },
    }, { connection, transactionOwner: 'caller' });
  }
  if (bundle.domainId === 'bosses') {
    return runBossImport({
      input: sourcePath,
      'report-json': path.join(repoRoot, 'reports', 'authorization', 'canonical', 'automation-bosses-first-l1.import.json'),
      offline: 'true',
      strict: 'false',
      database: 'terria_v1_local',
    }, { connection, transactionOwner: 'caller' });
  }
  const shimmerBundle = loadFrozenShimmerImportBundle({ repoRoot, frozenSource: sourcePayload });
  const existing = await loadCurrentShimmerScope(connection, shimmerBundle, { forUpdate: true });
  const target = await loadTargetFingerprint(connection, {
    host: connection.config?.host ?? '127.0.0.1',
    port: Number(connection.config?.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    database: connection.config?.database ?? 'terria_v1_local',
  });
  const preview = buildShimmerImportPreview({ bundle: shimmerBundle, existing, target });
  if (bundle.importPlan.previewSha256 !== preview.previewSha256) {
    throw new Error('frozen shimmer preview drifted before apply');
  }
  await applyShimmerBundleChanges({ bundle: shimmerBundle, connection });
  const after = await loadCurrentShimmerScope(connection, shimmerBundle);
  assertShimmerImportScopeMatchesPreview({ after, preview });
  return preview.summary;
}

export function loadFrozenShimmerImportBundle({ repoRoot, frozenSource }, {
  loadBundleImpl = loadVerifiedShimmerImportBundle,
} = {}) {
  const bundle = loadBundleImpl({
    bundleManifestPath: requireText(frozenSource?.manifestPath, 'frozen Shimmer manifest path'),
    repoRoot,
  });
  if (bundle.generationId !== frozenSource?.generationId
      || bundle.manifestSha256 !== frozenSource?.manifestSha256
      || bundle.dataBundleSha256 !== frozenSource?.dataBundleSha256) {
    throw new Error('frozen Shimmer source does not match the verified generation');
  }
  return bundle;
}

export async function runSupplementaryL1OperationCli({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date().toISOString(),
  mysqlModule = null,
  loadAuthorizationContextImpl = loadAuthorizedOperationContext,
} = {}) {
  const args = parseArgs(argv);
  if (args.apply !== 'true') throw new Error('--apply=true is required');
  const inputPath = path.resolve(requireText(args.input, '--input'));
  const outputPath = path.resolve(requireText(args.output, '--output'));
  const operationId = requireText(args['operation-id'], '--operation-id');
  const bundle = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (bundle.operationId !== operationId) throw new Error('--operation-id must match the bundle');
  validateSupplementaryL1Bundle(bundle);
  const authorizationContext = loadAuthorizationContextImpl({ env, operationId, now });
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  try {
    const result = await executeSupplementaryL1Operation({
      adapter: createMysqlSupplementaryL1Adapter(connection, {
        bundlePath: inputPath,
        repoRoot: env.WORKTREE_ROOT ?? process.cwd(),
      }),
      bundle,
      authorizationContext,
      now,
    });
    writeJsonAtomic(outputPath, result);
    return result;
  } finally {
    await connection.end();
  }
}

function requireAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('supplementary L1 adapter is required');
  for (const method of [
    'begin',
    'lockCurrentContext',
    'persistRunChain',
    'applyFrozenImport',
    'advanceMutationGenerations',
    'persistCommittedApply',
    'commit',
    'rollback',
  ]) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`supplementary L1 adapter.${method} is required`);
  }
}

function validateAuthorizationContext(context, operationId, executionTime) {
  if (!context || context.operationId !== operationId) {
    throw new Error('authorization context operationId must match the supplementary L1 bundle');
  }
  for (const field of ['actor', 'reason', 'authorizationReference', 'decisionIdentity']) {
    requireText(context[field], field);
  }
  requireHash(context.packetHash, 'packetHash');
  const authorizedAt = requireTimestamp(context.authorizedAt, 'authorizedAt');
  const expiresAt = requireTimestamp(context.expiresAt, 'expiresAt');
  if (Date.parse(executionTime) < Date.parse(authorizedAt)
      || Date.parse(executionTime) >= Date.parse(expiresAt)) {
    throw new Error('authorization context is not currently valid');
  }
  if (context.executionMode === 'ACTIVATION_GATED_AUTO') {
    requireHash(context.activationPolicySetHash, 'activationPolicySetHash');
    requireText(context.activationDecisionIdentity, 'activationDecisionIdentity');
    requireHash(context.activationPacketHash, 'activationPacketHash');
  }
}

function assertCurrentContext({ current, bundle, authorizationContext }) {
  if (!current || current.ownerStatus !== 'ACTIVE'
      || current.ownerUsername !== authorizationContext.actor) {
    throw new Error('active System Owner identity does not match the authorization');
  }
  for (const [label, expected, actual] of [
    ['domain', bundle.domainId, current.domainId],
    ['policy version', bundle.policy.policyVersion, Number(current.policyVersion)],
    ['policy hash', bundle.policy.policyHash, current.policyHash],
    ['policy set hash', bundle.policy.policySetHash, current.policySetHash],
    ['policy level', 'L1', current.currentLevel],
    ['policy operational state', 'ACTIVE', current.operationalState],
    ['baseline fingerprint', bundle.baselineFingerprint, current.baselineFingerprint],
  ]) {
    if (actual !== expected) throw new Error(`current ${label} does not match the frozen L1 bundle`);
  }
  if (current.approvalConsumed === true) throw new Error('L1 approval was already consumed');
  if (bundle.executionMode === 'ACTIVATION_GATED_AUTO') {
    for (const [label, expected, actual] of [
      ['activation decision identity', authorizationContext.activationDecisionIdentity, current.activationDecisionIdentity],
      ['activation packet hash', authorizationContext.activationPacketHash, current.activationPacketHash],
      ['activation policy set hash', authorizationContext.activationPolicySetHash, current.activationPolicySetHash],
    ]) {
      if (actual !== expected) throw new Error(`current ${label} does not match the activation gate`);
    }
    const expiresAt = requireTimestamp(current.activationExpiresAt, 'activation expiry');
    if (Date.parse(expiresAt) <= Date.parse(new Date().toISOString())) {
      throw new Error('scheduler activation decision is stale or expired');
    }
  }
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((token) => token.startsWith('--')).map((token) => {
    const [key, ...rest] = token.slice(2).split('=');
    return [key, rest.length === 0 ? 'true' : rest.join('=')];
  }));
}

export function connectionOptions(env) {
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535');
  }
  if (env.TERRAPEDIA_DB_NAME !== 'terria_v1_local') {
    throw new Error('TERRAPEDIA_DB_NAME must be exactly terria_v1_local');
  }
  return {
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port,
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: 'terria_v1_local',
    multipleStatements: false,
    dateStrings: true,
  };
}

function generationScopeHash(scope) {
  return hashJson({
    databaseRole: scope.databaseRole,
    table: scope.table,
    fieldGroup: 'all_columns',
    logicalPredicate: { kind: 'all' },
  });
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Json(value) {
  return sha256Bytes(JSON.stringify(value));
}

function hashJson(value) {
  return sha256Bytes(JSON.stringify(stableValue(value)));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function toMysqlTimestamp(value) {
  return requireTimestamp(value, 'timestamp').replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSupplementaryL1OperationCli().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(`supplementary L1 operation failed: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
