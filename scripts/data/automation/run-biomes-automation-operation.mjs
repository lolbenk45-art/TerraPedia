#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBiomeImportPlan,
  importBiomeDataset,
  loadStandardizedBiomeRecords,
} from '../import/import-biomes-to-db.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadAuthorizedOperationContext } from './authorized-operation-context.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const OPERATION_IDS = new Set([
  'automation-biomes-first-l1',
  'automation-biomes-second-l1',
]);
const OWNED_TABLES = Object.freeze([
  Object.freeze({ databaseRole: 'local', table: 'biomes' }),
  Object.freeze({ databaseRole: 'local', table: 'biome_relations' }),
  Object.freeze({ databaseRole: 'local', table: 'biome_resources' }),
  Object.freeze({ databaseRole: 'local', table: 'item_biomes' }),
]);

export function buildBiomesAutomationBundle({
  operationId,
  runId,
  generatedAt = new Date().toISOString(),
  policy,
  baseline,
  importPlan,
} = {}) {
  requireOperationId(operationId);
  const normalizedRunId = requireText(runId, 'runId');
  if (!/^biomes_l1_[a-z0-9_]{8,72}$/.test(normalizedRunId)) {
    throw new Error('runId must use the bounded biomes_l1 identity');
  }
  const timestamp = requireTimestamp(generatedAt, 'generatedAt');
  const normalizedPolicy = normalizePolicy(policy);
  const normalizedBaseline = normalizeBaseline(baseline);
  const frozenImportPlan = cloneObject(importPlan, 'importPlan');
  if (!Array.isArray(frozenImportPlan.biomes) || !Array.isArray(frozenImportPlan.itemBiomes)) {
    throw new Error('importPlan must freeze biomes and itemBiomes arrays');
  }
  const baselineFingerprint = hashJson(normalizedBaseline);
  const evidenceIdentity = {
    sourceFiles: frozenImportPlan.sourceFiles ?? {},
    importPlan: frozenImportPlan,
  };
  const evidenceHash = hashJson(evidenceIdentity);
  const logicalDiffIdentity = {
    baselineFingerprint,
    ownedTables: OWNED_TABLES,
    inputSummary: frozenImportPlan.summary ?? {},
  };
  const logicalDiffHash = hashJson(logicalDiffIdentity);
  const decisionHash = hashJson({
    runId: normalizedRunId,
    decision: 'REQUIRES_OWNER_L1',
    policySetHash: normalizedPolicy.policySetHash,
    evidenceHash,
    logicalDiffHash,
    baselineFingerprint,
    plannedApplyActionId: 'biome-sync',
  });
  const body = {
    schemaVersion: 1,
    operationId,
    runId: normalizedRunId,
    domainId: 'biomes',
    databaseName: 'terria_v1_local',
    generatedAt: timestamp,
    plannedApplyActionId: 'biome-sync',
    policy: normalizedPolicy,
    baseline: normalizedBaseline,
    baselineFingerprint,
    evidenceHash,
    logicalDiffIdentity,
    logicalDiffHash,
    decisionHash,
    ownedTables: OWNED_TABLES.map((row) => ({ ...row })),
    importPlan: frozenImportPlan,
  };
  return Object.freeze({ ...body, bundleHash: hashJson(body) });
}

export async function executeBiomesAutomationOperation({
  adapter,
  bundle,
  authorizationContext,
  now = new Date().toISOString(),
} = {}) {
  const frozen = validateBiomesAutomationBundle(bundle);
  const executionTime = requireTimestamp(now, 'execution time');
  validateAuthorizationContext(authorizationContext, frozen.operationId, executionTime);
  if (!adapter || typeof adapter.begin !== 'function') {
    throw new TypeError('biomes automation adapter is required');
  }
  await adapter.begin();
  try {
    const current = await adapter.lockCurrentContext(frozen, executionTime);
    assertCurrentContext({ current, bundle: frozen, authorizationContext });
    await adapter.persistRunChain(frozen, authorizationContext);
    const importSummary = await adapter.applyFrozenImport(frozen.importPlan, frozen);
    await adapter.advanceMutationGenerations(frozen);
    const completedAt = executionTime;
    await adapter.persistCommittedApply({ bundle: frozen, importSummary, completedAt });
    await adapter.commit();
    return Object.freeze({
      schemaVersion: 1,
      operationId: frozen.operationId,
      runId: frozen.runId,
      status: 'completed',
      bundleHash: frozen.bundleHash,
      policySetHash: frozen.policy.policySetHash,
      importSummary,
      completedAt,
    });
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}

export async function buildBiomesAutomationPreview({
  connection,
  operationId,
  runId,
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  standardizedBiomesFile = null,
  relationBiomesDir = null,
  itemBiomesDir = null,
  wikiBiomesFile = null,
} = {}) {
  if (!connection || typeof connection.query !== 'function') {
    throw new TypeError('preview MySQL connection is required');
  }
  const root = path.resolve(repoRoot);
  const standardizedPath = path.resolve(
    standardizedBiomesFile ?? path.join(root, 'data/standardized/biomes.standardized.json'),
  );
  const relationDir = path.resolve(
    relationBiomesDir ?? path.join(root, 'data/standardized-view/item_relations/biomes'),
  );
  const itemDir = path.resolve(
    itemBiomesDir ?? path.join(root, 'data/standardized-view/item_relations/itemBiomes'),
  );
  const wikiPath = path.resolve(
    wikiBiomesFile ?? path.join(root, 'data/generated/wiki-biomes.importable.latest.json'),
  );
  for (const [label, candidate] of [
    ['standardizedBiomesFile', standardizedPath],
    ['relationBiomesDir', relationDir],
    ['itemBiomesDir', itemDir],
    ['wikiBiomesFile', wikiPath],
  ]) requireInsideRoot(root, candidate, label);

  const current = await readCurrentBiomesContext(connection, { initializeGenerations: false, lock: false });
  if (current.ownerStatus !== 'ACTIVE' || current.domainId !== 'biomes'
      || current.currentLevel !== 'L1' || current.operationalState !== 'ACTIVE') {
    throw new Error('biomes preview requires an active L1 policy and active System Owner');
  }
  const wikiPayload = JSON.parse(fs.readFileSync(wikiPath, 'utf8'));
  const wikiBiomes = Array.isArray(wikiPayload?.biomes) ? wikiPayload.biomes : [];
  if (wikiBiomes.length === 0) throw new Error('wiki biome preview input must contain biomes');
  const importPlan = buildBiomeImportPlan({
    standardizedBiomes: loadStandardizedBiomeRecords({
      dataDir: path.dirname(standardizedPath),
      biomesFile: standardizedPath,
      relationBiomesDir: relationDir,
    }),
    wikiBiomes,
    itemBiomes: readJsonArrayDirectory(itemDir),
    sourceFiles: {
      standardizedBiomesFile: toRelativePath(root, standardizedPath),
      relationBiomesDir: toRelativePath(root, relationDir),
      itemBiomesDir: toRelativePath(root, itemDir),
      wikiBiomesFile: toRelativePath(root, wikiPath),
    },
  });
  importPlan.generatedAt = requireTimestamp(generatedAt, 'generatedAt');
  return buildBiomesAutomationBundle({
    operationId,
    runId,
    generatedAt,
    policy: {
      domainId: current.domainId,
      policyVersion: current.policyVersion,
      policyHash: current.policyHash,
      policySetHash: current.policySetHash,
    },
    baseline: current.baseline,
    importPlan,
  });
}

export function createMysqlBiomesAutomationAdapter(connection, {
  bundlePath,
  environmentId = 'local',
} = {}) {
  if (!connection) throw new TypeError('MySQL connection is required');
  const frozenBundlePath = path.resolve(requireText(bundlePath, 'bundlePath'));
  const bundleBytes = fs.readFileSync(frozenBundlePath);
  const bundleFileHash = `sha256:${createHash('sha256').update(bundleBytes).digest('hex')}`;
  const state = { applyId: null, approvalId: null, authorizationContext: null };
  return {
    begin: () => connection.beginTransaction(),
    lockCurrentContext: (bundle, executionTime) => readCurrentBiomesContext(connection, {
      initializeGenerations: true,
      lock: true,
      bundle,
      environmentId,
      executionTime,
    }),
    async persistRunChain(bundle, authorizationContext) {
      state.authorizationContext = authorizationContext;
      await connection.query(
        'INSERT INTO crawler_automation_run'
        + ' (run_id, primary_domain_id, covered_domains_json, policy_set_hash, trigger_kind,'
        + ' status, baseline_fingerprint, version) VALUES (?, ?, CAST(? AS JSON), ?, ?, ?, ?, 0)',
        [bundle.runId, 'biomes', JSON.stringify(['biomes']), bundle.policy.policySetHash,
          'AUTHORIZED_L1', 'SNAPSHOT_READY', bundle.baselineFingerprint],
      );
      await connection.query(
        'INSERT INTO crawler_automation_run_policy'
        + ' (run_id, domain_id, policy_version, policy_hash, policy_set_hash) VALUES (?, ?, ?, ?, ?)',
        [bundle.runId, 'biomes', bundle.policy.policyVersion, bundle.policy.policyHash,
          bundle.policy.policySetHash],
      );
      await connection.query(
        'INSERT INTO crawler_automation_evidence'
        + ' (run_id, kind, private_path, sha256, size_bytes, schema_version, frozen_input,'
        + ' policy_set_hash, retention_until) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)',
        [bundle.runId, 'BIOMES_FROZEN_BUNDLE', frozenBundlePath, bundleFileHash,
          bundleBytes.length, bundle.policy.policySetHash, toMysqlTimestamp(authorizationContext.expiresAt)],
      );
      await connection.query(
        'INSERT INTO crawler_automation_evidence_set'
        + ' (run_id, evidence_hash, manifest_json, policy_set_hash, baseline_fingerprint)'
        + ' VALUES (?, ?, CAST(? AS JSON), ?, ?)',
        [bundle.runId, bundle.evidenceHash, JSON.stringify({
          bundleFileHash,
          privatePath: frozenBundlePath,
          sourceFiles: bundle.importPlan.sourceFiles ?? {},
        }), bundle.policy.policySetHash, bundle.baselineFingerprint],
      );
      await connection.query(
        'INSERT INTO crawler_automation_apply_bundle'
        + ' (run_id, bundle_hash, policy_set_hash, evidence_hash, logical_diff_hash,'
        + ' baseline_fingerprint, planned_apply_action_id, schema_version, private_path,'
        + ' size_bytes, retention_until) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
        [bundle.runId, bundle.bundleHash, bundle.policy.policySetHash, bundle.evidenceHash,
          bundle.logicalDiffHash, bundle.baselineFingerprint, bundle.plannedApplyActionId,
          frozenBundlePath, bundleBytes.length, toMysqlTimestamp(authorizationContext.expiresAt)],
      );
      await connection.query(
        'INSERT INTO crawler_automation_decision'
        + ' (run_id, decision, decision_hash, reason_codes_json, counts_ratios_json,'
        + ' gate_results_json, policy_set_hash, evidence_hash, bundle_hash, logical_diff_hash,'
        + ' logical_diff_identity_json, baseline_fingerprint, snapshot_required,'
        + ' planned_apply_action_id) VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON),'
        + ' CAST(? AS JSON), ?, ?, ?, ?, CAST(? AS JSON), ?, 1, ?)',
        [bundle.runId, 'REQUIRES_OWNER_L1', bundle.decisionHash,
          JSON.stringify(['WHOLE_DOMAIN_REBUILD_REQUIRES_OWNER']),
          JSON.stringify(bundle.importPlan.summary ?? {}), JSON.stringify([true]),
          bundle.policy.policySetHash, bundle.evidenceHash, bundle.bundleHash,
          bundle.logicalDiffHash, JSON.stringify(bundle.logicalDiffIdentity),
          bundle.baselineFingerprint, bundle.plannedApplyActionId],
      );
      const [approval] = await connection.query(
        'INSERT INTO crawler_automation_approval'
        + ' (request_key, run_id, decision_hash, policy_set_hash, evidence_hash, bundle_hash,'
        + ' logical_diff_hash, logical_diff_identity_json, baseline_fingerprint,'
        + ' planned_apply_action_id, actor, action, reason, reauth_id, run_version, version,'
        + ' consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, 0, 0, NOW())',
        [authorizationContext.decisionIdentity, bundle.runId, bundle.decisionHash,
          bundle.policy.policySetHash, bundle.evidenceHash, bundle.bundleHash,
          bundle.logicalDiffHash, JSON.stringify(bundle.logicalDiffIdentity),
          bundle.baselineFingerprint, bundle.plannedApplyActionId, authorizationContext.actor,
          'APPROVE', authorizationContext.reason, authorizationContext.authorizationReference],
      );
      state.approvalId = Number(approval?.insertId);
      if (!Number.isSafeInteger(state.approvalId) || state.approvalId < 1) {
        throw new Error('biomes automation approval insert did not return an id');
      }
      await connection.query(
        'INSERT INTO crawler_automation_snapshot'
        + ' (run_id, scope_descriptor_json, private_path, sha256, policy_set_hash,'
        + ' baseline_fingerprint, integrity_status, retention_until)'
        + ' VALUES (?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?)',
        [bundle.runId, JSON.stringify({ ownedTables: bundle.ownedTables }), frozenBundlePath,
          bundleFileHash, bundle.policy.policySetHash, bundle.baselineFingerprint,
          'VERIFIED', toMysqlTimestamp(authorizationContext.expiresAt)],
      );
      const [apply] = await connection.query(
        'INSERT INTO crawler_automation_apply'
        + ' (run_id, bundle_hash, policy_set_hash, decision_hash, approval_id, mode, status,'
        + ' before_generation_json, commit_protocol) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)',
        [bundle.runId, bundle.bundleHash, bundle.policy.policySetHash, bundle.decisionHash,
          state.approvalId, 'APPROVED_OWNER_L1', 'APPLYING',
          JSON.stringify(bundle.baseline.generations), 'SINGLE_TXN'],
      );
      state.applyId = Number(apply?.insertId);
      if (!Number.isSafeInteger(state.applyId) || state.applyId < 1) {
        throw new Error('biomes automation apply insert did not return an id');
      }
      for (const generation of bundle.baseline.generations) {
        const predicateHash = hashJson({ kind: 'all' });
        const fenceToken = hashJson({ runId: bundle.runId, table: generation.table });
        await connection.query(
          'INSERT INTO crawler_automation_write_fence'
          + ' (environment_id, database_role, physical_table, field_group, logical_predicate_hash,'
          + ' latest_run_id, fence_token, before_generation, expires_at, version)'
          + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
          + ' ON DUPLICATE KEY UPDATE latest_run_id = VALUES(latest_run_id),'
          + ' fence_token = VALUES(fence_token), before_generation = VALUES(before_generation),'
          + ' committed_generation = NULL, commit_marker = NULL, expires_at = VALUES(expires_at),'
          + ' version = version + 1',
          [environmentId, generation.databaseRole, generation.table, 'all_columns', predicateHash,
            bundle.runId, fenceToken, generation.generation,
            toMysqlTimestamp(authorizationContext.expiresAt)],
        );
      }
    },
    applyFrozenImport: (plan) => importBiomeDataset(connection, plan),
    async advanceMutationGenerations(bundle) {
      for (const generation of bundle.baseline.generations) {
        const scopeHash = generationScopeHash(generation);
        const [result] = await connection.query(
          'UPDATE crawler_automation_mutation_generation'
          + ' SET generation = generation + 1, last_writer_run_id = ?'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND scope_key_hash = ? AND generation = ?',
          [bundle.runId, environmentId, generation.databaseRole, generation.table,
            scopeHash, generation.generation],
        );
        if (Number(result?.affectedRows) !== 1) {
          throw new Error(`mutation generation fence was lost: ${generation.table}`);
        }
        const [fenceResult] = await connection.query(
          'UPDATE crawler_automation_write_fence SET committed_generation = ?, commit_marker = ?'
          + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
          + ' AND latest_run_id = ? AND before_generation = ?',
          [generation.generation + 1, bundle.bundleHash, environmentId,
            generation.databaseRole, generation.table, bundle.runId, generation.generation],
        );
        if (Number(fenceResult?.affectedRows) !== 1) {
          throw new Error(`write fence was lost: ${generation.table}`);
        }
      }
    },
    async persistCommittedApply({ bundle, importSummary, completedAt }) {
      const committed = bundle.baseline.generations.map((row) => ({
        ...row,
        generation: row.generation + 1,
      }));
      const [applyResult] = await connection.query(
        'UPDATE crawler_automation_apply SET status = ?, committed_generation_json = CAST(? AS JSON),'
        + ' completed_at = ? WHERE id = ? AND status = ?',
        ['COMMITTED', JSON.stringify({ generations: committed, importSummary }),
          toMysqlTimestamp(completedAt), state.applyId, 'APPLYING'],
      );
      if (Number(applyResult?.affectedRows) !== 1) throw new Error('biomes apply status fence was lost');
      const [runResult] = await connection.query(
        'UPDATE crawler_automation_run SET status = ?, completed_at = ?, version = version + 1'
        + ' WHERE run_id = ? AND status = ? AND version = 0',
        ['COMPLETED', toMysqlTimestamp(completedAt), bundle.runId, 'SNAPSHOT_READY'],
      );
      if (Number(runResult?.affectedRows) !== 1) throw new Error('biomes run status fence was lost');
    },
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
  };
}

export async function runBiomesAutomationOperationCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
  now = new Date().toISOString(),
  loadAuthorizationContextImpl = loadAuthorizedOperationContext,
} = {}) {
  const args = parseArgs(argv);
  const operationId = requireOperationId(args['operation-id']);
  const outputPath = path.resolve(requireText(args.output, '--output'));
  if (args.apply !== 'true' && args.apply !== 'false') {
    throw new Error('--apply must be exactly true or false');
  }
  let inputPath = null;
  let bundle = null;
  let authorizationContext = null;
  if (args.apply === 'true') {
    inputPath = path.resolve(requireText(args.input, '--input'));
    bundle = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    if (bundle.operationId !== operationId) throw new Error('--operation-id must match the bundle');
    validateBiomesAutomationBundle(bundle);
    authorizationContext = loadAuthorizationContextImpl({ env, operationId, now });
  }
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  try {
    if (args.apply === 'true') {
      const result = await executeBiomesAutomationOperation({
        adapter: createMysqlBiomesAutomationAdapter(connection, { bundlePath: inputPath }),
        bundle,
        authorizationContext,
        now,
      });
      writeJsonAtomic(outputPath, result);
      return result;
    }
    const bundle = await buildBiomesAutomationPreview({
      connection,
      operationId,
      runId: args['run-id'],
      repoRoot: env.WORKTREE_ROOT ?? process.cwd(),
      generatedAt: now,
      standardizedBiomesFile: args['standardized-biomes-file'] ?? null,
      relationBiomesDir: args['relation-biomes-dir'] ?? null,
      itemBiomesDir: args['item-biomes-dir'] ?? null,
      wikiBiomesFile: args['wiki-biomes-file'] ?? null,
    });
    writeJsonAtomic(outputPath, bundle);
    return bundle;
  } finally {
    await connection.end();
  }
}

export function validateBiomesAutomationBundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('biomes automation bundle must be an object');
  }
  const { bundleHash, ...body } = value;
  requireHash(bundleHash, 'bundleHash');
  if (hashJson(body) !== bundleHash) throw new Error('biomes automation bundle hash or content mismatch');
  if (value.schemaVersion !== 1) throw new Error('biomes automation bundle schemaVersion must be 1');
  requireOperationId(value.operationId);
  if (value.domainId !== 'biomes' || value.databaseName !== 'terria_v1_local'
      || value.plannedApplyActionId !== 'biome-sync') {
    throw new Error('biomes automation bundle target identity is invalid');
  }
  normalizePolicy(value.policy);
  const baseline = normalizeBaseline(value.baseline);
  if (hashJson(baseline) !== value.baselineFingerprint) {
    throw new Error('biomes automation baseline fingerprint mismatch');
  }
  requireHash(value.evidenceHash, 'evidenceHash');
  requireHash(value.logicalDiffHash, 'logicalDiffHash');
  requireHash(value.decisionHash, 'decisionHash');
  if (hashJson(value.logicalDiffIdentity) !== value.logicalDiffHash) {
    throw new Error('biomes automation logical diff hash mismatch');
  }
  if (JSON.stringify(value.ownedTables) !== JSON.stringify(OWNED_TABLES)) {
    throw new Error('biomes automation owned table set is invalid');
  }
  cloneObject(value.importPlan, 'importPlan');
  return value;
}

function validateAuthorizationContext(context, operationId, now) {
  if (context?.operationId !== operationId) {
    throw new Error('authorization context operationId must match the biomes bundle');
  }
  requireText(context.actor, 'actor');
  requireText(context.reason, 'reason');
  requireText(context.authorizationReference, 'authorizationReference');
  requireText(context.decisionIdentity, 'decisionIdentity');
  requireHash(context.packetHash, 'packetHash');
  const executionTime = requireTimestamp(now, 'execution time');
  const authorizedAt = requireTimestamp(context.authorizedAt, 'authorizedAt');
  const expiresAt = requireTimestamp(context.expiresAt, 'expiresAt');
  if (Date.parse(executionTime) < Date.parse(authorizedAt)
      || Date.parse(executionTime) >= Date.parse(expiresAt)) {
    throw new Error('authorization context is not currently valid');
  }
}

function assertCurrentContext({ current, bundle, authorizationContext }) {
  if (!current || current.ownerStatus !== 'ACTIVE'
      || current.ownerUsername !== authorizationContext.actor) {
    throw new Error('active System Owner identity does not match the authorization');
  }
  for (const [label, expected, actual] of [
    ['domain', bundle.policy.domainId, current.domainId],
    ['policy version', bundle.policy.policyVersion, Number(current.policyVersion)],
    ['policy hash', bundle.policy.policyHash, current.policyHash],
    ['policy set', bundle.policy.policySetHash, current.policySetHash],
    ['baseline', bundle.baselineFingerprint, current.baselineFingerprint],
  ]) {
    if (expected !== actual) throw new Error(`${label} identity drifted before biomes apply`);
  }
  if (current.currentLevel !== 'L1' || current.operationalState !== 'ACTIVE') {
    throw new Error('biomes policy must be active L1');
  }
  if (JSON.stringify(normalizeGenerations(current.generations))
      !== JSON.stringify(bundle.baseline.generations)) {
    throw new Error('mutation generation identity drifted before biomes apply');
  }
}

function normalizePolicy(value) {
  if (!value || value.domainId !== 'biomes') throw new Error('biomes policy identity is required');
  const policyVersion = Number(value.policyVersion);
  if (!Number.isSafeInteger(policyVersion) || policyVersion < 1) {
    throw new Error('policyVersion must be a positive integer');
  }
  return Object.freeze({
    domainId: 'biomes',
    policyVersion,
    policyHash: requireHash(value.policyHash, 'policyHash'),
    policySetHash: requireHash(value.policySetHash, 'policySetHash'),
  });
}

function normalizeBaseline(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('baseline is required');
  }
  const tables = {};
  for (const { table } of OWNED_TABLES) {
    if (!Array.isArray(value.tables?.[table])) throw new Error(`baseline table is missing: ${table}`);
    tables[table] = stableValue(value.tables[table]);
  }
  return Object.freeze({ tables, generations: normalizeGenerations(value.generations) });
}

function normalizeGenerations(values) {
  if (!Array.isArray(values)) throw new Error('baseline generations are required');
  const byKey = new Map(values.map((row) => [
    `${row?.databaseRole}:${row?.table}`,
    {
      databaseRole: row?.databaseRole,
      table: row?.table,
      generation: Number(row?.generation),
    },
  ]));
  return OWNED_TABLES.map((scope) => {
    const row = byKey.get(`${scope.databaseRole}:${scope.table}`);
    if (!row || !Number.isSafeInteger(row.generation) || row.generation < 0) {
      throw new Error(`baseline generation is invalid: ${scope.databaseRole}.${scope.table}`);
    }
    return row;
  });
}

function cloneObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return JSON.parse(JSON.stringify(value));
}

function requireOperationId(value) {
  const operationId = requireText(value, 'operationId');
  if (!OPERATION_IDS.has(operationId)) throw new Error(`unsupported biomes operationId: ${operationId}`);
  return operationId;
}

function requireHash(value, label) {
  const hash = requireText(value, label);
  if (!HASH_PATTERN.test(hash)) throw new Error(`${label} must be a sha256 hash`);
  return hash;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireTimestamp(value, label) {
  const timestamp = requireText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

async function readCurrentBiomesContext(connection, {
  initializeGenerations,
  lock,
  bundle = null,
  environmentId = 'local',
  executionTime = null,
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
  const normalizedPolicies = (policyRows ?? []).map((row) => ({
    domainId: row.domainId,
    policyVersion: Number(row.policyVersion),
    policyHash: row.policyHash,
  }));
  const biomes = (policyRows ?? []).find((row) => row.domainId === 'biomes');
  if (!biomes || normalizedPolicies.length === 0) throw new Error('current biomes policy is missing');
  const policySetHash = computePolicySetHash(normalizedPolicies);
  const generations = [];
  for (const scope of OWNED_TABLES) {
    const scopeHash = generationScopeHash(scope);
    if (initializeGenerations) {
      await connection.query(
        'INSERT IGNORE INTO crawler_automation_mutation_generation'
        + ' (environment_id, database_role, physical_table, scope_key_hash, generation, schema_hash)'
        + ' VALUES (?, ?, ?, ?, 0, ?)',
        [environmentId, scope.databaseRole, scope.table, scopeHash,
          hashJson({ schemaVersion: 1, databaseRole: scope.databaseRole, table: scope.table })],
      );
    }
    const [rows] = await connection.query(
      'SELECT generation FROM crawler_automation_mutation_generation'
      + ' WHERE environment_id = ? AND database_role = ? AND physical_table = ?'
      + ` AND scope_key_hash = ?${suffix}`,
      [environmentId, scope.databaseRole, scope.table, scopeHash],
    );
    const generation = rows?.[0] == null ? 0 : Number(rows[0].generation);
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error(`current mutation generation is invalid: ${scope.table}`);
    }
    generations.push({ ...scope, generation });
    if (lock && bundle) {
      const [fences] = await connection.query(
        'SELECT latest_run_id AS latestRunId, expires_at AS expiresAt'
        + ' FROM crawler_automation_write_fence WHERE environment_id = ?'
        + ' AND database_role = ? AND physical_table = ? AND field_group = ?'
        + ' AND logical_predicate_hash = ? FOR UPDATE',
        [environmentId, scope.databaseRole, scope.table, 'all_columns', hashJson({ kind: 'all' })],
      );
      const fence = fences?.[0];
      if (fence && fence.latestRunId !== bundle.runId
          && Date.parse(String(fence.expiresAt)) > Date.parse(requireTimestamp(executionTime, 'execution time'))) {
        throw new Error(`active write fence exists for ${scope.table}`);
      }
    }
  }
  const baseline = await readBiomesBaseline(connection, lock);
  baseline.generations = generations;
  return {
    ownerUsername: ownerRows?.[0]?.username ?? null,
    ownerStatus: ownerRows?.[0]?.status ?? null,
    domainId: biomes.domainId,
    policyVersion: Number(biomes.policyVersion),
    policyHash: biomes.policyHash,
    policySetHash,
    currentLevel: biomes.currentLevel,
    operationalState: biomes.operationalState,
    baseline,
    baselineFingerprint: hashJson(normalizeBaseline(baseline)),
    generations,
  };
}

async function readBiomesBaseline(connection, lock) {
  const tables = {};
  for (const { table } of OWNED_TABLES) {
    const [rows] = await connection.query(
      `SELECT * FROM \`${table}\` ORDER BY \`id\`${lock ? ' FOR UPDATE' : ''}`,
    );
    tables[table] = stableValue(rows ?? []);
  }
  return { tables, generations: [] };
}

function generationScopeHash(scope) {
  return hashJson({
    databaseRole: scope.databaseRole,
    table: scope.table,
    fieldGroup: 'all_columns',
    logicalPredicate: { kind: 'all' },
  });
}

function readJsonArrayDirectory(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      const value = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
      return Array.isArray(value) ? value : [];
    });
}

function requireInsideRoot(repoRoot, candidate, label) {
  const relative = path.relative(repoRoot, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside repoRoot`);
  }
}

function toRelativePath(repoRoot, candidate) {
  requireInsideRoot(repoRoot, candidate, 'source path');
  return path.relative(repoRoot, candidate).split(path.sep).join('/');
}

function connectionOptions(env) {
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
  };
}

function toMysqlTimestamp(value) {
  return new Date(requireTimestamp(value, 'timestamp')).toISOString().slice(0, 19).replace('T', ' ');
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
  runBiomesAutomationOperationCli().then((result) => {
    process.stdout.write(`${JSON.stringify({
      operationId: result.operationId,
      runId: result.runId,
      status: result.status ?? 'preview_ready',
      bundleHash: result.bundleHash,
    })}\n`);
  }).catch((error) => {
    process.stderr.write(`biomes automation operation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
