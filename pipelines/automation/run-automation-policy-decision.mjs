#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertAuthorizedOperationDataBundle,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from './authorized-operation-context.mjs';
import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import { assertRepositoryOrdinaryFile } from '../lib/private-repository-path.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { verifyFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import { assertProposal as assertL2PromotionProposal } from './build-l2-promotion-proposal.mjs';
import { assertApprovedL2PolicyCeilingArtifact } from './l2-policy-ceiling-artifact.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const L1_PROMOTION = Object.freeze({
  currentLevel: 'L0',
  currentStates: Object.freeze(['DISABLED', 'SHADOW']),
  targetLevel: 'L1',
  targetOperationalState: 'ACTIVE',
  decisionKind: null,
});
const OPERATION_DEFINITIONS = {
  'automation-biomes-l1-policy-promotion': Object.freeze({
    domainId: 'biomes',
    ...L1_PROMOTION,
  }),
  'automation-items-l1-policy-promotion': Object.freeze({ domainId: 'items', ...L1_PROMOTION }),
  'automation-projectiles-l1-policy-promotion': Object.freeze({ domainId: 'projectiles', ...L1_PROMOTION }),
  'automation-audio-l1-policy-promotion': Object.freeze({ domainId: 'audio', ...L1_PROMOTION }),
  'automation-bosses-l1-policy-promotion': Object.freeze({ domainId: 'bosses', ...L1_PROMOTION }),
  'automation-shimmer-l1-policy-promotion': Object.freeze({ domainId: 'shimmer', ...L1_PROMOTION }),
  'automation-npcs-l1-policy-promotion': Object.freeze({ domainId: 'npcs', ...L1_PROMOTION }),
  'automation-buffs-l1-policy-promotion': Object.freeze({ domainId: 'buffs', ...L1_PROMOTION }),
  'automation-armor-sets-l1-policy-promotion': Object.freeze({ domainId: 'armor_sets', ...L1_PROMOTION }),
  'automation-crawler-v2-scheduler-l1-policy-promotion': Object.freeze({ domainId: 'crawler_v2_scheduler', ...L1_PROMOTION }),
  'automation-crawler-v2-scheduler-activation': Object.freeze({
    domainId: 'crawler_v2_scheduler',
    currentLevel: 'L1',
    currentStates: Object.freeze(['ACTIVE']),
    targetLevel: null,
    targetOperationalState: null,
    decisionKind: 'SCHEDULER_ACTIVATION',
    requiresSuccessfulL1Runs: false,
  }),
  'automation-crawler-v2-scheduler-reactivation': Object.freeze({
    domainId: 'crawler_v2_scheduler',
    currentLevel: 'L1',
    currentStates: Object.freeze(['ACTIVE']),
    targetLevel: null,
    targetOperationalState: null,
    decisionKind: 'SCHEDULER_ACTIVATION',
    requiresSuccessfulL1Runs: false,
  }),
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
};

const L2_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l2-promotion',
  npcs: 'automation-npcs-l2-promotion',
  projectiles: 'automation-projectiles-l2-promotion',
  armor_sets: 'automation-armor-sets-l2-promotion',
  buffs: 'automation-buffs-l2-promotion',
  audio: 'automation-audio-l2-promotion',
  bosses: 'automation-bosses-l2-promotion',
  shimmer: 'automation-shimmer-l2-promotion',
});
for (const [domainId, operationId] of Object.entries(L2_OPERATION_IDS)) {
  OPERATION_DEFINITIONS[operationId] = Object.freeze({
    domainId,
    currentLevel: 'L1',
    currentStates: Object.freeze(['ACTIVE']),
    targetLevel: 'L2',
    targetOperationalState: 'ACTIVE',
    decisionKind: 'L2_PROMOTION',
  });
}
Object.freeze(OPERATION_DEFINITIONS);

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
  const requiresSuccessfulL1Runs = definition.requiresSuccessfulL1Runs !== false;
  const minimumSuccessfulL1Runs = Number(input.minimumSuccessfulL1Runs);
  const minimum = definition.decisionKind === 'L2_PROMOTION' ? 3 : 2;
  if (!Number.isSafeInteger(minimumSuccessfulL1Runs) || minimumSuccessfulL1Runs < minimum) {
    throw new Error(`minimumSuccessfulL1Runs must be an integer of at least ${minimum}`);
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
  const proposalBinding = definition.decisionKind === 'L2_PROMOTION'
    ? validateL2ProposalBinding(input, operationId)
    : {};
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
    requiresSuccessfulL1Runs,
    requiresFullReconciliation: definition.decisionKind === 'L2_PROMOTION',
    ...proposalBinding,
    ...(definition.decisionKind === 'L2_PROMOTION' ? validateL2TargetInput(input) : {}),
    ...definition,
  });
}

export async function executeAutomationPolicyDecision({
  adapter,
  plan,
  now = new Date().toISOString(),
  beforeCommit = null,
  afterCommit = null,
} = {}) {
  if (!adapter || typeof adapter.begin !== 'function'
      || typeof adapter.commit !== 'function' || typeof adapter.rollback !== 'function') {
    throw new TypeError('policy decision adapter is required');
  }
  if (beforeCommit != null && typeof beforeCommit !== 'function') {
    throw new TypeError('beforeCommit must be a function');
  }
  if (afterCommit != null && typeof afterCommit !== 'function') {
    throw new TypeError('afterCommit must be a function');
  }
  const executionTime = requireTimestamp(now, 'execution time');
  if (Date.parse(executionTime) < Date.parse(plan.authorizedAt)
      || Date.parse(executionTime) >= Date.parse(plan.expiresAt)) {
    throw new Error('policy decision is not currently valid');
  }
  await adapter.begin();
  let transactionCommitted = false;
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
    let qualifyingEvidence = null;
    if (plan.decisionKind === 'L2_PROMOTION') {
      if (typeof adapter.readTargetPolicyForUpdate !== 'function') {
        throw new Error('target L2 policy reader is required for L2 promotion');
      }
      const targetPolicy = await adapter.readTargetPolicyForUpdate(plan.domainId, plan.targetPolicyVersion);
      const targetPolicyJson = parsePolicyJson(targetPolicy?.policyJson);
      if (!targetPolicy || targetPolicy.domainId !== plan.domainId
          || Number(targetPolicy.policyVersion) !== plan.targetPolicyVersion
          || targetPolicy.policyHash !== plan.targetPolicyHash
          || targetPolicy.level !== 'L2'
          || computePolicyHash(targetPolicyJson) !== plan.targetPolicyHash) {
        throw new Error('target L2 policy version or ceiling does not match the decision');
      }
      if (typeof adapter.readTargetPolicySetHash !== 'function'
          || await adapter.readTargetPolicySetHash(plan.domainId, plan.targetPolicyVersion) !== plan.targetPolicySetHash) {
        throw new Error('target L2 policy set identity does not match the decision');
      }
      if (typeof adapter.readL2OwnershipFenceState !== 'function') {
        throw new Error('L2 ownership fence reader is required for L2 promotion');
      }
      const fenceState = await adapter.readL2OwnershipFenceState(plan.domainId, plan.targetPolicyJson.ownedTables);
      if (!fenceState || [fenceState.activeAttempts, fenceState.activeReservations,
        fenceState.activeFences, fenceState.mismatchedFences ?? 0]
        .some((count) => !Number.isSafeInteger(Number(count)) || Number(count) !== 0)) {
        throw new Error('active writer, reservation, or attempt blocks L2 promotion');
      }
      if (typeof adapter.readQualifyingL1Evidence !== 'function') {
        throw new Error('full reconciliation evidence reader is required for L2 promotion');
      }
      qualifyingEvidence = await adapter.readQualifyingL1Evidence(plan.domainId, {
        policyVersion: plan.policyVersion,
        policyHash: plan.policyHash,
        policySetHash: plan.policySetHash,
        minimumSuccessfulL1Runs: plan.minimumSuccessfulL1Runs,
      });
      successfulL1Runs = Number(qualifyingEvidence?.distinctCommittedL1Runs);
      if (!Number.isSafeInteger(successfulL1Runs) || successfulL1Runs < plan.minimumSuccessfulL1Runs) {
        throw new Error(`at least ${plan.minimumSuccessfulL1Runs} distinct committed L1 runs are required`);
      }
      try {
        verifyFullReconciliationEvidence(qualifyingEvidence.fullReconciliation, {
          domainId: plan.domainId,
          policyVersion: plan.policyVersion,
          policyHash: plan.policyHash,
          policySetHash: plan.policySetHash,
        });
      } catch (error) {
        throw new Error(`full reconciliation evidence is required for L2 promotion: ${error.message}`);
      }
    } else if (plan.decisionKind !== null && plan.requiresSuccessfulL1Runs) {
      successfulL1Runs = Number(await adapter.countSuccessfulL1Applies(plan.domainId, {
        policyVersion: plan.policyVersion,
        policyHash: plan.policyHash,
        policySetHash: plan.policySetHash,
      }));
      if (!Number.isSafeInteger(successfulL1Runs)
          || successfulL1Runs < plan.minimumSuccessfulL1Runs) {
        throw new Error(`at least ${plan.minimumSuccessfulL1Runs} successful L1 applies are required`);
      }
    }
    if (plan.decisionKind !== null) {
      await adapter.insertActivationDecision({
        decisionKind: plan.decisionKind,
        domainId: plan.domainId,
        policyVersion: plan.targetPolicyVersion ?? plan.policyVersion,
        policyHash: plan.targetPolicyHash ?? plan.policyHash,
        // L2 decisions are keyed to the policy set that exists after the
        // promotion. The pre-promotion set remains bound by the packet and
        // the transaction's current-policy identity check above.
        policySetHash: plan.targetPolicySetHash ?? plan.policySetHash,
        targetPolicySetHash: plan.targetPolicySetHash,
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
        ...(plan.targetPolicyVersion == null ? {} : { targetPolicyVersion: plan.targetPolicyVersion }),
        ...(plan.targetPolicyHash == null ? {} : { targetPolicyHash: plan.targetPolicyHash }),
        targetLevel: plan.targetLevel,
        targetOperationalState: plan.targetOperationalState,
      });
    }
    const result = Object.freeze({
      schemaVersion: 1,
      operationId: plan.operationId,
      domainId: plan.domainId,
      status: 'completed',
      authoritative: true,
      policyVersion: plan.targetPolicyVersion ?? plan.policyVersion,
      policyHash: plan.targetPolicyHash ?? plan.policyHash,
      policySetHash: plan.targetPolicySetHash ?? plan.policySetHash,
      level: plan.targetLevel ?? policy.currentLevel,
      operationalState: plan.targetOperationalState ?? policy.operationalState,
      decisionKind: plan.decisionKind,
      decisionIdentity: plan.decisionIdentity,
      actor: plan.actor,
      reason: plan.reason,
      authorizationReference: plan.authorizationReference,
      packetHash: plan.packetHash,
      successfulL1Runs,
      completedAt: executionTime,
    });
    if (beforeCommit != null) await beforeCommit(result);
    await adapter.commit();
    transactionCommitted = true;
    if (afterCommit != null) await afterCommit(result);
    return result;
  } catch (error) {
    if (!transactionCommitted) await adapter.rollback();
    throw error;
  }
}

export function createMysqlAutomationPolicyDecisionAdapter(connection, { repoRoot = process.cwd() } = {}) {
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
    async readTargetPolicyForUpdate(domainId, policyVersion) {
      const [rows] = await connection.query(
        'SELECT domain_id AS domainId, policy_version AS policyVersion, level, policy_hash AS policyHash, policy_json AS policyJson'
        + ' FROM crawler_automation_policy_version WHERE domain_id = ? AND policy_version = ? FOR UPDATE',
        [domainId, policyVersion],
      );
      return rows?.[0] ?? null;
    },
    async readL2OwnershipFenceState(domainId, ownedTables) {
      const scopes = (ownedTables ?? []).map((owned) => ({
        table: owned?.table,
        fieldGroup: owned?.fieldGroup ?? 'all_columns',
        logicalPredicateHash: owned?.logicalPredicateHash ?? null,
      }));
      if (scopes.length === 0 || scopes.some(({ table, fieldGroup, logicalPredicateHash }) => (
        !/^[a-z][a-z0-9_]{0,95}$/.test(table ?? '')
        || !/^[a-z][a-z0-9_]{0,95}$/.test(fieldGroup ?? '')
        || (logicalPredicateHash !== null && !HASH_PATTERN.test(logicalPredicateHash))
      ))) {
        throw new Error('L2 policy owned tables are invalid');
      }
      const domainIds = domainId === 'npcs' || domainId === 'bosses' ? ['npcs', 'bosses'] : [domainId];
      const [attemptRows] = await connection.query(
        "SELECT COUNT(*) AS total FROM crawler_automation_run_attempt WHERE domain_id IN (?) AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')",
        [domainIds],
      );
      const [reservationRows] = await connection.query(
        "SELECT COUNT(*) AS total FROM crawler_automation_attempt_reservation WHERE domain_id IN (?) AND status NOT IN ('RELEASED', 'CONSUMED', 'EXPIRED')",
        [domainIds],
      );
      const [fenceRows] = await connection.query(
        'SELECT physical_table AS physicalTable, field_group AS fieldGroup, '
        + 'logical_predicate_hash AS logicalPredicateHash FROM crawler_automation_write_fence'
        + " WHERE database_role = 'local' AND expires_at > NOW()",
      );
      const scopeKey = ({ table, fieldGroup, logicalPredicateHash }) => (
        `${table}:${fieldGroup}:${logicalPredicateHash ?? ''}`
      );
      const requested = new Set(scopes.map(scopeKey));
      const activeFenceRows = (fenceRows ?? []).filter((row) => (
        scopes.some(({ table }) => table === row.physicalTable)
      ));
      const mismatchedFenceRows = activeFenceRows.filter((row) => (
        !requested.has(scopeKey({
          table: row.physicalTable,
          fieldGroup: row.fieldGroup,
          logicalPredicateHash: row.logicalPredicateHash,
        }))
      ));
      return {
        activeAttempts: Number(attemptRows?.[0]?.total ?? 0),
        activeReservations: Number(reservationRows?.[0]?.total ?? 0),
        // A same-table fence with an unknown field/predicate scope is a
        // fail-closed overlap; exact scope matches are counted separately.
        activeFences: activeFenceRows.length,
        mismatchedFences: mismatchedFenceRows.length,
      };
    },
    async readCurrentPolicySetHash() {
      const [rows] = await connection.query(
        'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
        + ' pv.policy_hash AS policyHash FROM crawler_automation_policy p'
        + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
        + ' AND pv.policy_version = p.current_version ORDER BY p.domain_id FOR UPDATE',
      );
      return computePolicySetHash(rows ?? []);
    },
    async readTargetPolicySetHash(domainId, targetPolicyVersion) {
      const [rows] = await connection.query(
        'SELECT p.domain_id AS domainId, '
        + 'CASE WHEN p.domain_id = ? THEN ? ELSE p.current_version END AS policyVersion, '
        + 'CASE WHEN p.domain_id = ? THEN pv_target.policy_hash ELSE pv_current.policy_hash END AS policyHash '
        + 'FROM crawler_automation_policy p '
        + 'JOIN crawler_automation_policy_version pv_current ON pv_current.domain_id = p.domain_id '
        + 'AND pv_current.policy_version = p.current_version '
        + 'LEFT JOIN crawler_automation_policy_version pv_target ON pv_target.domain_id = p.domain_id '
        + 'AND pv_target.policy_version = ? ORDER BY p.domain_id FOR UPDATE',
        [domainId, targetPolicyVersion, domainId, targetPolicyVersion],
      );
      return computePolicySetHash(rows ?? []);
    },
    async countSuccessfulL1Applies(domainId, identity = {}) {
      const evidence = await this.readQualifyingL1Evidence(domainId, identity);
      return Number(evidence?.distinctCommittedL1Runs ?? 0);
    },
    async readQualifyingL1Evidence(domainId, identity = {}) {
      if (!Number.isSafeInteger(Number(identity.policyVersion))
          || !HASH_PATTERN.test(identity.policyHash ?? '')
          || !HASH_PATTERN.test(identity.policySetHash ?? '')) {
        throw new Error('L1 evidence identity is required');
      }
      const [rows] = await connection.query(
        'SELECT DISTINCT r.run_id AS runId, r.created_at AS runCreatedAt,'
        + ' r.policy_set_hash AS runPolicySetHash, r.baseline_fingerprint AS runBaselineFingerprint,'
        + ' a.bundle_hash AS bundleHash, a.policy_set_hash AS applyPolicySetHash,'
        + ' b.private_path AS bundlePath, b.evidence_hash AS bundleEvidenceHash,'
        + ' b.policy_set_hash AS bundlePolicySetHash, b.baseline_fingerprint AS bundleBaselineFingerprint,'
        + ' es.evidence_hash AS evidenceHash, es.policy_set_hash AS evidenceSetPolicySetHash,'
        + ' es.baseline_fingerprint AS evidenceSetBaselineFingerprint, es.manifest_json AS evidenceManifest,'
        + ' (SELECT JSON_OBJECT(\'path\', e.private_path, \'sha256\', e.sha256, \'policySetHash\', e.policy_set_hash)'
        + ' FROM crawler_automation_evidence e WHERE e.run_id = r.run_id'
        + " AND e.kind = 'FULL_RECONCILIATION' ORDER BY e.id DESC LIMIT 1) AS reconciliationArtifact"
        + ' FROM crawler_automation_run r'
        + ' JOIN crawler_automation_apply a ON a.run_id = r.run_id'
        + ' JOIN crawler_automation_run_policy rp ON rp.run_id = r.run_id'
        + ' JOIN crawler_automation_apply_bundle b ON b.run_id = r.run_id AND b.bundle_hash = a.bundle_hash'
        + ' JOIN crawler_automation_evidence_set es ON es.run_id = b.run_id AND es.evidence_hash = b.evidence_hash'
        + " WHERE r.primary_domain_id = ? AND r.status = 'COMPLETED'"
        + " AND a.status = 'COMMITTED' AND rp.domain_id = ?"
        + ' AND rp.policy_version = ? AND rp.policy_hash = ? AND rp.policy_set_hash = ?'
        + ' ORDER BY runCreatedAt',
        [domainId, domainId, identity.policyVersion, identity.policyHash, identity.policySetHash],
      );
      const distinct = new Map();
      let fullReconciliation = false;
      for (const row of rows ?? []) {
        if (distinct.has(row.runId)) continue;
        let bundle = null;
        const bundlePath = String(row.bundlePath ?? '').trim();
        if (!bundlePath || !path.isAbsolute(bundlePath)) throw new Error('L1 bundle path is missing or not absolute');
        try {
          const confinedBundlePath = assertRepositoryOrdinaryFile({
            repoRoot,
            filePath: bundlePath,
            label: 'L1 bundle path',
          });
          if (!confinedBundlePath.startsWith(`${path.resolve(repoRoot, 'reports', 'authorization', 'canonical')}${path.sep}`)) {
            throw new Error('L1 bundle path must be under the canonical authorization report root');
          }
          bundle = JSON.parse(fs.readFileSync(confinedBundlePath, 'utf8'));
          bundle.__confinedPath = confinedBundlePath;
        } catch (error) {
          throw new Error(`L1 bundle is missing or unreadable: ${error.message}`);
        }
        let manifest = null;
        try {
          manifest = row.evidenceManifest == null
            ? null
            : (typeof row.evidenceManifest === 'string' ? JSON.parse(row.evidenceManifest) : row.evidenceManifest);
        } catch (error) {
          throw new Error(`L1 evidence manifest is invalid: ${error.message}`);
        }
        const sourcePath = String(bundle.source?.path ?? '').replaceAll('\\', '/');
        if (!sourcePath.startsWith('reports/') || sourcePath.includes('..') || sourcePath.startsWith('/')
            || !HASH_PATTERN.test(bundle.source?.sha256 ?? '')
            || manifest?.privatePath !== bundle.__confinedPath
            || manifest?.source?.path !== sourcePath
            || manifest?.source?.sha256 !== bundle.source.sha256) {
          throw new Error('L1 source identity is missing or drifted');
        }
        const sourceAbsolute = assertRepositoryOrdinaryFile({
          repoRoot,
          filePath: path.resolve(repoRoot, sourcePath),
          label: 'L1 source artifact',
        });
        const sourceBytes = fs.readFileSync(sourceAbsolute);
        if (`sha256:${createHash('sha256').update(sourceBytes).digest('hex')}` !== bundle.source.sha256) {
          throw new Error('L1 source artifact hash drifted');
        }
        try {
          JSON.parse(sourceBytes.toString('utf8'));
        } catch (error) {
          throw new Error(`L1 source artifact is invalid JSON: ${error.message}`);
        }
        let reconciliationArtifact = null;
        try {
          reconciliationArtifact = row.reconciliationArtifact == null
            ? null
            : (typeof row.reconciliationArtifact === 'string' ? JSON.parse(row.reconciliationArtifact) : row.reconciliationArtifact);
        } catch (error) {
          throw new Error(`L1 reconciliation artifact reference is invalid: ${error.message}`);
        }
        const bundleFileHash = `sha256:${createHash('sha256').update(fs.readFileSync(bundle.__confinedPath)).digest('hex')}`;
        if (manifest?.bundleFileHash !== bundleFileHash) throw new Error('L1 bundle file hash drifted');
        const { bundleHash, __confinedPath, ...bundleBody } = bundle;
        if (!HASH_PATTERN.test(bundleHash ?? '') || hashCanonicalJson(bundleBody) !== bundleHash) {
          throw new Error('L1 bundle canonical content hash drifted');
        }
        if (bundleHash !== row.bundleHash || bundle.evidenceHash !== row.evidenceHash
            || row.bundleEvidenceHash !== row.evidenceHash
            || bundle.baselineFingerprint !== row.bundleBaselineFingerprint
            || row.runPolicySetHash !== identity.policySetHash
            || row.applyPolicySetHash !== identity.policySetHash
            || row.bundlePolicySetHash !== identity.policySetHash
            || row.evidenceSetPolicySetHash !== identity.policySetHash
            || row.runBaselineFingerprint !== row.bundleBaselineFingerprint
            || row.evidenceSetBaselineFingerprint !== row.bundleBaselineFingerprint) {
          throw new Error('L1 bundle/evidence identity drifted');
        }
        const l1Bound = bundle?.policy?.level === 'L1'
          && exactL1OperationId(domainId, bundle?.operationId)
          && bundle?.policy?.policyVersion === identity.policyVersion
          && bundle?.policy?.policyHash === identity.policyHash
          && bundle?.policy?.policySetHash === identity.policySetHash;
        if (!l1Bound) continue;
        distinct.set(row.runId, true);
        const reconciliation = bundle?.reconciliationEvidence ?? manifest?.reconciliationEvidence;
        if (reconciliation != null) {
          try {
            const verified = verifyFullReconciliationEvidence(reconciliation, {
              domainId,
              runId: row.runId,
              policyVersion: identity.policyVersion,
              policyHash: identity.policyHash,
              policySetHash: identity.policySetHash,
            });
            verifyReconciliationArtifactFiles(verified, repoRoot);
            fullReconciliation = verified;
          } catch (error) {
            throw new Error(`L1 reconciliation evidence is invalid: ${error.message}`);
          }
        }
        if (reconciliationArtifact?.path && reconciliationArtifact?.sha256) {
          try {
            const artifactEntry = readConfinedReconciliationArtifact(repoRoot, reconciliationArtifact);
            const artifactEvidence = JSON.parse(artifactEntry.bytes.toString('utf8'));
            const verified = verifyFullReconciliationEvidence(artifactEvidence, {
              domainId,
              runId: row.runId,
              policyVersion: identity.policyVersion,
              policyHash: identity.policyHash,
              policySetHash: identity.policySetHash,
            });
            if (reconciliationArtifact.policySetHash !== identity.policySetHash) {
              throw new Error('L1 reconciliation artifact policy-set identity drifted');
            }
            fullReconciliation = verified;
          } catch (error) {
            throw new Error(`L1 reconciliation artifact is invalid: ${error.message}`);
          }
        }
      }
      return { distinctCommittedL1Runs: distinct.size, fullReconciliation };
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
      const hasTargetVersion = values.targetPolicyVersion != null;
      const hasTargetHash = values.targetPolicyHash != null;
      if (hasTargetVersion !== hasTargetHash) {
        throw new Error('target policy version and hash must be provided together');
      }
      const [result] = hasTargetVersion
        ? await connection.query(
          'UPDATE crawler_automation_policy p'
          + ' JOIN crawler_automation_policy_version current_pv ON current_pv.domain_id = p.domain_id'
          + ' AND current_pv.policy_version = p.current_version'
          + ' JOIN crawler_automation_policy_version target_pv ON target_pv.domain_id = p.domain_id'
          + ' AND target_pv.policy_version = ?'
          + " AND target_pv.level = 'L2' AND target_pv.policy_hash = ?"
          + ' SET p.current_version = target_pv.policy_version, p.current_level = target_pv.level,'
          + ' p.operational_state = ?, p.version = p.version + 1'
          + ' WHERE p.domain_id = ? AND p.current_version = ? AND current_pv.policy_hash = ?',
          [values.targetPolicyVersion, values.targetPolicyHash, values.targetOperationalState, values.domainId,
            values.policyVersion, values.policyHash],
        )
        : await connection.query(
          'UPDATE crawler_automation_policy p'
          + ' JOIN crawler_automation_policy_version current_pv ON current_pv.domain_id = p.domain_id'
          + ' AND current_pv.policy_version = p.current_version'
          + ' SET p.current_level = ?, p.operational_state = ?, p.version = p.version + 1'
          + ' WHERE p.domain_id = ? AND p.current_version = ? AND current_pv.policy_hash = ?',
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

function verifyReconciliationArtifactFiles(evidence, repoRoot) {
  for (const [pathField, hashField, label] of [
    ['sourceArtifactPath', 'sourceHash', 'reconciliation source artifact'],
    ['ownedTableReadbackPath', 'ownedTableReadbackHash', 'reconciliation table readback'],
    ['attemptStatePath', 'attemptStateHash', 'reconciliation attempt state'],
  ]) {
    const normalized = String(evidence[pathField] ?? '').replaceAll('\\', '/');
    const absolute = assertRepositoryOrdinaryFile({
      repoRoot,
      filePath: path.resolve(repoRoot, normalized),
      label,
    });
    const actual = `sha256:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`;
    if (actual !== evidence[hashField]) {
      throw new Error(`${label} hash drifted`);
    }
  }
}

function readConfinedReconciliationArtifact(repoRoot, reference) {
  const artifactPath = String(reference.path ?? '').trim();
  if (!artifactPath || !path.isAbsolute(artifactPath)) {
    throw new Error('reconciliation artifact path must be absolute');
  }
  const confined = assertRepositoryOrdinaryFile({ repoRoot, filePath: artifactPath, label: 'L1 reconciliation artifact' });
  if (!confined.startsWith(`${path.resolve(repoRoot, 'reports')}${path.sep}`)) {
    throw new Error('reconciliation artifact must be under reports');
  }
  const bytes = fs.readFileSync(confined);
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== reference.sha256) throw new Error('reconciliation artifact file hash drifted');
  return { path: confined, bytes };
}

export async function runAutomationPolicyDecisionCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
  now = new Date().toISOString(),
} = {}) {
  const args = parseArgs(argv);
  const repoRoot = path.resolve(env.WORKTREE_ROOT ?? process.cwd());
  if (args.apply !== 'true') throw new Error('--apply=true is required');
  const operationId = requireText(args['operation-id'], '--operation-id');
  const inputArgument = requireText(args.input, '--input').replaceAll('\\', '/');
  const outputArgument = requireText(args.output, '--output').replaceAll('\\', '/');
  const l2Operation = isL2PolicyDecisionOperation(operationId);
  if (l2Operation) {
    const expectedInput = `reports/authorization/canonical/${operationId}.input.json`;
    const expectedOutput = `reports/authorization/canonical/${operationId}.result.json`;
    if (inputArgument !== expectedInput || outputArgument !== expectedOutput) {
      throw new Error('L2 policy decision input/output paths must be the exact operation-derived canonical paths');
    }
  }
  const inputPath = path.resolve(repoRoot, inputArgument);
  const outputPath = path.resolve(repoRoot, outputArgument);
  assertRepositoryOrdinaryFile({ repoRoot, filePath: inputPath, label: 'policy decision input' });
  if ((fs.lstatSync(inputPath).mode & 0o077) !== 0) {
    throw new Error('policy decision input must be private');
  }
  const confinedOutputPath = assertRepositoryPathConfinement({
    repoRoot,
    filePath: outputPath,
    label: 'policy decision result',
  });
  const confinedCommitMarkerPath = l2Operation
    ? assertRepositoryPathConfinement({
      repoRoot,
      filePath: `${confinedOutputPath}.commit.json`,
      label: 'policy decision commit marker',
    })
    : null;
  if (l2Operation) {
    assertNoExistingEntry(confinedOutputPath, 'policy decision pending result');
    assertNoExistingEntry(confinedCommitMarkerPath, 'policy decision commit marker');
  }
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (operationId !== input.operationId) {
    throw new Error('--operation-id must match the frozen input');
  }
  if (input.targetPolicyLevel === 'L2') {
    assertL2PromotionExecutionInput({ repoRoot, operationId: input.operationId, input });
  }
  const authorizationContext = loadAuthorizedOperationContext({
    env,
    operationId: input.operationId,
    now,
  });
  const plan = buildAutomationPolicyDecisionPlan(input, authorizationContext);
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext: authorizationContext });
  const authorizedServerFingerprint = loadAuthorizedOperationServerFingerprint({
    authorizedContext: authorizationContext,
    env,
  });
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection({
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port: requirePort(env.TERRAPEDIA_DB_PORT),
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: plan.databaseName,
    multipleStatements: false,
  });
  let pendingIdentity = null;
  let transactionCommitted = false;
  try {
    await assertCurrentServerFingerprint(connection, authorizedServerFingerprint, env);
    const result = await executeAutomationPolicyDecision({
      adapter: createMysqlAutomationPolicyDecisionAdapter(connection, { repoRoot }),
      plan,
      now,
      ...(l2Operation ? {
        beforeCommit: async (candidate) => {
          writePolicyDecisionResult(
            confinedOutputPath,
            buildPendingPolicyDecisionResult(candidate),
            { noOverwrite: true },
          );
          pendingIdentity = fs.lstatSync(confinedOutputPath);
        },
        afterCommit: async (candidate) => {
          // Mark the transaction boundary before publication so a marker
          // failure leaves the pending result available for recovery.
          transactionCommitted = true;
          writePolicyDecisionResult(
            confinedCommitMarkerPath,
            buildPolicyDecisionCommitMarker(candidate),
            { noOverwrite: true },
          );
        },
      } : {}),
    });
    if (!l2Operation) writePolicyDecisionResult(confinedOutputPath, result);
    return result;
  } catch (error) {
    if (l2Operation && !transactionCommitted && pendingIdentity) {
      removeOwnedPendingResult(confinedOutputPath, pendingIdentity);
    }
    throw error;
  } finally {
    await connection.end();
  }
}

export function assertL2PromotionExecutionInput({ repoRoot, operationId, input } = {}) {
  return assertContentAddressedL2Proposal({
    repoRoot: path.resolve(requireText(repoRoot, 'L2 execution repository root')),
    operationId: requireText(operationId, 'L2 execution operationId'),
    input,
  });
}

function assertContentAddressedL2Proposal({ repoRoot, operationId, input }) {
  const proposalPath = String(input.proposalPath ?? '').replaceAll('\\', '/');
  const expectedPrefix = `reports/authorization/canonical/${operationId}/`;
  if (!proposalPath.startsWith(expectedPrefix)
      || !/^[a-f0-9]{64}\/proposal\.json$/.test(proposalPath.slice(expectedPrefix.length))) {
    throw new Error('L2 promotion proposal path is not content-addressed');
  }
  const inputProposalHash = requireHash(input.proposalHash, 'proposalHash');
  if (proposalPath.slice(expectedPrefix.length, expectedPrefix.length + 64)
      !== inputProposalHash.slice(7)) {
    throw new Error('L2 promotion proposal path content address does not match proposalHash');
  }
  const confined = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, proposalPath),
    label: 'L2 promotion proposal',
  });
  if ((fs.lstatSync(confined).mode & 0o077) !== 0) {
    throw new Error('L2 promotion proposal must be private');
  }
  const bytes = fs.readFileSync(confined);
  const actualHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actualHash !== input.proposalSha256) {
    throw new Error('L2 promotion proposal hash drifted');
  }
  let proposal;
  try {
    proposal = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('L2 promotion proposal must be valid JSON');
  }
  if (proposal?.operationId !== operationId || proposal?.proposalOnly !== true
      || proposal?.proposalHash !== inputProposalHash
      || proposal?.policyArtifactHash !== input.policyArtifactHash
      || proposal?.policyArtifactPath !== input.policyArtifactPath
      || proposal?.policyArtifactFileSha256 !== input.policyArtifactFileSha256) {
    throw new Error('L2 promotion proposal identity is invalid');
  }
  assertL2ProposalMatchesExecutionInput(proposal, input);
  if (isEightDomainL2Operation(operationId)) {
    assertL2PromotionProposal(proposal);
    const policyArtifact = assertL2PolicyArtifact({ repoRoot, input, proposal });
    assertL2RegistrationArtifacts({ repoRoot, input, proposal, policyArtifact });
    return true;
  }
  assertL2PolicyArtifact({ repoRoot, input, proposal });
  return true;
}

function assertL2RegistrationArtifacts({ repoRoot, input, proposal, policyArtifact }) {
  const registrationOperationId = input.operationId.replace(/-l2-promotion$/, '-l2-policy-ceiling-registration');
  const resultPath = `reports/authorization/canonical/${registrationOperationId}.result.json`;
  const markerPath = `${resultPath}.commit.json`;
  if (input.policyRegistrationResultPath !== resultPath
      || input.policyRegistrationCommitMarkerPath !== markerPath
      || proposal?.policyRegistration?.resultPath !== resultPath
      || proposal?.policyRegistration?.commitMarkerPath !== markerPath
      || proposal.policyRegistration.resultFileSha256 !== input.policyRegistrationResultFileSha256
      || proposal.policyRegistration.commitMarkerFileSha256 !== input.policyRegistrationCommitMarkerFileSha256) {
    throw new Error('L2 policy registration binding does not match the proposal');
  }
  for (const [relativePath, expectedHash, label] of [
    [resultPath, input.policyRegistrationResultFileSha256, 'L2 policy registration result'],
    [markerPath, input.policyRegistrationCommitMarkerFileSha256, 'L2 policy registration commit marker'],
  ]) {
    const confined = assertRepositoryOrdinaryFile({
      repoRoot, filePath: path.resolve(repoRoot, relativePath), label,
    });
    const stat = fs.lstatSync(confined);
    if ((stat.mode & 0o077) !== 0) throw new Error(`${label} must be private`);
    const actualHash = `sha256:${createHash('sha256').update(fs.readFileSync(confined)).digest('hex')}`;
    if (actualHash !== expectedHash) throw new Error(`${label} hash drifted`);
  }
  const result = readPrivateJsonAtPath(repoRoot, resultPath, 'L2 policy registration result');
  const marker = readPrivateJsonAtPath(repoRoot, markerPath, 'L2 policy registration commit marker');
  const registration = proposal.policyRegistration;
  if (result.schemaVersion !== 1 || result.status !== 'pending' || result.authoritative !== false
      || result.operationId !== registration.operationId || result.domainId !== proposal.domainId
      || Number(result.policyVersion) !== Number(proposal.targetPolicy.policyVersion)
      || result.policyHash !== proposal.targetPolicy.policyHash
      || result.policySetHash !== proposal.targetPolicySetHash
      || result.artifactHash !== proposal.policyArtifactHash
      || result.actor !== policyArtifact.approval?.actor
      || result.authorizationReference !== policyArtifact.approval?.reference
      || !requireText(result.actor, 'L2 policy registration actor')
      || !requireText(result.reason, 'L2 policy registration reason')
      || !requireText(result.authorizationReference, 'L2 policy registration authorization reference')
      || !requireText(result.decisionIdentity, 'L2 policy registration decision identity')
      || !HASH_PATTERN.test(result.packetHash ?? '')) {
    throw new Error('L2 policy registration result semantics do not match the proposal');
  }
  if (marker.schemaVersion !== 1 || marker.markerKind !== 'l2_policy_ceiling_registration_commit'
      || marker.status !== 'committed' || marker.authoritative !== true
      || marker.registrationStatus !== 'registered'
      || marker.operationId !== result.operationId || marker.domainId !== result.domainId
      || Number(marker.policyVersion) !== Number(result.policyVersion)
      || marker.policyHash !== result.policyHash || marker.policySetHash !== result.policySetHash
      || marker.artifactHash !== result.artifactHash
      || marker.registrationActor !== result.actor
      || marker.registrationAuthorizationReference !== result.authorizationReference
      || marker.registrationDecisionIdentity !== result.decisionIdentity
      || marker.registrationPacketHash !== result.packetHash) {
    throw new Error('L2 policy registration commit marker semantics do not match the result');
  }
  const finalizerFields = [
    marker.finalizerActor, marker.finalizerAuthorizationReference,
    marker.finalizerDecisionIdentity, marker.finalizerPacketHash,
  ];
  if (finalizerFields.some((value) => value != null)
      && (finalizerFields.some((value) => typeof value !== 'string' || !value.trim())
        || marker.finalizerActor !== result.actor
        || !HASH_PATTERN.test(marker.finalizerPacketHash))) {
    throw new Error('L2 policy registration recovery marker identity is incomplete');
  }
}

function assertL2PolicyArtifact({ repoRoot, input, proposal }) {
  const artifactPath = String(input.policyArtifactPath ?? '').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/l2-policy-ceiling/';
  if (!artifactPath.startsWith(prefix)
      || !/^[a-z][a-z0-9_]{0,63}\/[a-f0-9]{64}\/artifact\.json$/.test(artifactPath.slice(prefix.length))) {
    throw new Error('L2 policy artifact path is not content-addressed');
  }
  const artifactAddress = artifactPath.slice(prefix.length).split('/')[1];
  if (artifactAddress !== input.policyArtifactHash.slice(7)) {
    throw new Error('L2 policy artifact path content address does not match policyArtifactHash');
  }
  const confinedArtifact = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, artifactPath),
    label: 'L2 policy ceiling artifact',
  });
  if ((fs.lstatSync(confinedArtifact).mode & 0o077) !== 0) {
    throw new Error('L2 policy ceiling artifact must be private');
  }
  const bytes = fs.readFileSync(confinedArtifact);
  const actualHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actualHash !== input.policyArtifactFileSha256) throw new Error('L2 policy artifact file hash drifted');
  let artifact;
  try { artifact = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('L2 policy artifact must be valid JSON'); }
  assertApprovedL2PolicyCeilingArtifact(artifact);
  if (artifact?.artifactHash !== input.policyArtifactHash
      || artifact?.artifactKind !== 'l2-policy-ceiling'
      || artifact?.status !== 'approved'
      || artifact?.domainId !== proposal.domainId
      || artifact?.targetPolicy?.policyHash !== input.targetPolicyHash
      || artifact?.targetPolicySetHash !== input.targetPolicySetHash) {
    throw new Error('L2 policy artifact identity does not match the proposal');
  }
  if (stableJson(artifact.currentPolicy) !== stableJson(proposal.currentPolicy)
      || artifact.currentPolicySetHash !== proposal.currentPolicySetHash
      || stableJson(artifact.targetPolicy) !== stableJson(proposal.targetPolicy)) {
    throw new Error('L2 policy artifact content does not match the proposal');
  }
  return artifact;
}

function assertL2ProposalMatchesExecutionInput(proposal, input) {
  if (proposal.domainId !== input.domainId || proposal.databaseName !== input.databaseName
      || proposal.currentPolicy?.policyVersion !== Number(input.policyVersion)
      || proposal.currentPolicy?.policyHash !== input.policyHash
      || proposal.currentPolicySetHash !== input.policySetHash
      || proposal.targetPolicy?.policyVersion !== Number(input.targetPolicyVersion)
      || proposal.targetPolicy?.policyHash !== input.targetPolicyHash
      || proposal.targetPolicy?.level !== input.targetPolicyLevel
      || proposal.targetPolicySetHash !== input.targetPolicySetHash
      || proposal.minimumSuccessfulL1Runs !== Number(input.minimumSuccessfulL1Runs)
      || stableJson(proposal.targetPolicy?.policyJson) !== stableJson(input.targetPolicyJson)
      || stableJson(proposal.ownedTables) !== stableJson(input.targetPolicyJson?.ownedTables)) {
    throw new Error('L2 promotion proposal content does not match the execution input');
  }
}

function readPrivateJsonAtPath(repoRoot, relativePath, label) {
  const confined = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label,
  });
  if ((fs.lstatSync(confined).mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  try { return JSON.parse(fs.readFileSync(confined, 'utf8')); } catch { throw new Error(`${label} must be valid JSON`); }
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function hashCanonicalJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

async function assertCurrentServerFingerprint(connection, expected, env) {
  const [rows] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS port');
  const actual = canonicalServerFingerprint({
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port: Number(rows?.[0]?.port),
    serverUuid: rows?.[0]?.serverUuid,
    databases: expected.databases,
  });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('current database server fingerprint does not match the authorized packet');
  }
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

const L1_OPERATION_IDS = Object.freeze({
  biomes: new Set(['automation-biomes-first-l1', 'automation-biomes-second-l1']),
  items: new Set(['automation-items-l1']),
  npcs: new Set(['automation-npcs-l1']),
  projectiles: new Set(['automation-projectiles-l1']),
  armor_sets: new Set(['automation-armor-sets-l1']),
  buffs: new Set(['automation-buffs-l1']),
  audio: new Set(['automation-audio-first-l1']),
  bosses: new Set(['automation-bosses-first-l1']),
  shimmer: new Set(['automation-shimmer-first-l1']),
});

function exactL1OperationId(domainId, operationId) {
  return L1_OPERATION_IDS[domainId]?.has(operationId) === true;
}

function validateL2TargetInput(input) {
  const targetPolicyVersion = Number(input.targetPolicyVersion);
  if (!Number.isSafeInteger(targetPolicyVersion) || targetPolicyVersion <= Number(input.policyVersion)) {
    throw new Error('targetPolicyVersion must be a newer immutable policy version for L2 promotion');
  }
  if (input.targetPolicyLevel !== 'L2') throw new Error('targetPolicyLevel must be L2');
  const targetPolicyHash = requireHash(input.targetPolicyHash, 'targetPolicyHash');
  const targetPolicySetHash = requireHash(input.targetPolicySetHash, 'targetPolicySetHash');
  const targetPolicyJson = validateL2PolicyCeiling(input.targetPolicyJson);
  if (computePolicyHash(targetPolicyJson) !== targetPolicyHash) {
    throw new Error('targetPolicyJson hash does not match targetPolicyHash');
  }
  return {
    targetPolicyVersion,
    targetPolicyHash,
    targetPolicySetHash,
    targetPolicyLevel: input.targetPolicyLevel,
    targetPolicyJson,
  };
}

function validateL2ProposalBinding(input, operationId) {
  if (input.proposalOnly !== false) {
    throw new Error('L2 promotion input must be an execution input, not a proposal-only artifact');
  }
  const proposalPath = String(input.proposalPath ?? '').replaceAll('\\', '/');
  const prefix = `reports/authorization/canonical/${operationId}/`;
  if (!proposalPath.startsWith(prefix)
      || !/^[a-f0-9]{64}\/proposal\.json$/.test(proposalPath.slice(prefix.length))) {
    throw new Error('L2 promotion proposalPath must be a content-addressed proposal artifact');
  }
  const proposalHash = requireHash(input.proposalHash, 'proposalHash');
  if (proposalPath.slice(prefix.length, prefix.length + 64) !== proposalHash.slice(7)) {
    throw new Error('L2 promotion proposalPath content address does not match proposalHash');
  }
  const policyArtifactPath = String(input.policyArtifactPath ?? '').replaceAll('\\', '/');
  const policyArtifactPrefix = 'reports/authorization/canonical/l2-policy-ceiling/';
  if (!policyArtifactPath.startsWith(policyArtifactPrefix)
      || !/^[a-z][a-z0-9_]{0,63}\/[a-f0-9]{64}\/artifact\.json$/.test(policyArtifactPath.slice(policyArtifactPrefix.length))) {
    throw new Error('L2 promotion policyArtifactPath must be a content-addressed policy artifact');
  }
  const policyArtifactHash = requireHash(input.policyArtifactHash, 'policyArtifactHash');
  if (policyArtifactPath.slice(policyArtifactPrefix.length).split('/')[1] !== policyArtifactHash.slice(7)) {
    throw new Error('L2 promotion policyArtifactPath content address does not match policyArtifactHash');
  }
  return {
    proposalOnly: false,
    proposalPath,
    proposalSha256: requireHash(input.proposalSha256, 'proposalSha256'),
    proposalHash,
    policyArtifactHash,
    policyArtifactPath,
    policyArtifactFileSha256: requireHash(input.policyArtifactFileSha256, 'policyArtifactFileSha256'),
    ...(isEightDomainL2Operation(operationId) ? {
      policyRegistrationResultPath: requireExactRegistrationPath(
        input.policyRegistrationResultPath, operationId, false,
      ),
      policyRegistrationResultFileSha256: requireHash(
        input.policyRegistrationResultFileSha256, 'policyRegistrationResultFileSha256',
      ),
      policyRegistrationCommitMarkerPath: requireExactRegistrationPath(
        input.policyRegistrationCommitMarkerPath, operationId, true,
      ),
      policyRegistrationCommitMarkerFileSha256: requireHash(
        input.policyRegistrationCommitMarkerFileSha256, 'policyRegistrationCommitMarkerFileSha256',
      ),
    } : {}),
  };
}

function isEightDomainL2Operation(operationId) {
  return Object.values(L2_OPERATION_IDS).includes(operationId);
}

function isL2PolicyDecisionOperation(operationId) {
  return operationId === 'automation-biomes-l2-promotion' || isEightDomainL2Operation(operationId);
}

function requireExactRegistrationPath(value, promotionOperationId, marker) {
  const registrationOperationId = promotionOperationId.replace(/-l2-promotion$/, '-l2-policy-ceiling-registration');
  const expected = `reports/authorization/canonical/${registrationOperationId}.result.json${marker ? '.commit.json' : ''}`;
  const normalized = String(value ?? '').replaceAll('\\', '/');
  if (normalized !== expected) throw new Error(`L2 policy registration path must be ${expected}`);
  return normalized;
}

function validateL2PolicyCeiling(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('targetPolicyJson must be an object');
  }
  if (value.schemaVersion !== 1 || value.requireSnapshot !== true || value.anomalyAction !== 'CIRCUIT_OPEN') {
    throw new Error('targetPolicyJson must declare the L2 snapshot and anomaly contract');
  }
  for (const field of [
    'absoluteInsertCap', 'absoluteUpdateCap', 'absoluteRelationshipDeleteCap',
    'absoluteDisableCap', 'sourceFreshnessMaxAgeMinutes',
  ]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      throw new Error(`targetPolicyJson ${field} must be a non-negative integer`);
    }
  }
  for (const field of [
    'ratioInsertCap', 'ratioUpdateCap', 'ratioRelationshipDeleteCap', 'ratioDisableCap',
  ]) {
    if (!Number.isFinite(value[field]) || value[field] < 0 || value[field] > 1) {
      throw new Error(`targetPolicyJson ${field} must be between 0 and 1`);
    }
  }
  if (!Array.isArray(value.ownedTables) || value.ownedTables.length === 0) {
    throw new Error('targetPolicyJson ownedTables are required');
  }
  const tables = new Set();
  for (const owned of value.ownedTables) {
    const key = `${owned?.databaseRole}:${owned?.table}:${owned?.fieldGroup ?? 'all_columns'}:${owned?.logicalPredicateHash ?? ''}`;
    if (owned?.databaseRole !== 'local' || !/^[a-z][a-z0-9_]{0,95}$/.test(owned?.table ?? '') || tables.has(key)) {
      throw new Error('targetPolicyJson ownedTables must be unique local scopes');
    }
    tables.add(key);
  }
  return value;
}

function parsePolicyJson(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
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

export function writePolicyDecisionResult(filePath, payload, options = {}) {
  return writeJsonAtomic(filePath, payload, options);
}

export function buildPendingPolicyDecisionResult(result) {
  assertCompletedPolicyDecisionResult(result);
  return Object.freeze({
    ...result,
    status: 'pending',
    authoritative: false,
  });
}

export function buildPolicyDecisionCommitMarker(result) {
  assertCompletedPolicyDecisionResult(result);
  return Object.freeze({
    schemaVersion: 1,
    markerKind: 'automation_policy_decision_commit',
    status: 'committed',
    authoritative: true,
    decisionStatus: result.status,
    operationId: result.operationId,
    domainId: result.domainId,
    policyVersion: result.policyVersion,
    policyHash: result.policyHash,
    policySetHash: result.policySetHash,
    level: result.level,
    operationalState: result.operationalState,
    decisionKind: result.decisionKind,
    decisionIdentity: result.decisionIdentity,
    actor: result.actor,
    reason: result.reason,
    authorizationReference: result.authorizationReference,
    packetHash: result.packetHash,
    successfulL1Runs: result.successfulL1Runs,
    completedAt: result.completedAt,
  });
}

export function assertPolicyDecisionPublication({ pending, marker } = {}) {
  if (!pending || pending.schemaVersion !== 1 || pending.status !== 'pending'
      || pending.authoritative !== false) {
    throw new Error('policy decision pending result is invalid');
  }
  if (!marker || marker.schemaVersion !== 1
      || marker.markerKind !== 'automation_policy_decision_commit'
      || marker.status !== 'committed' || marker.authoritative !== true
      || marker.decisionStatus !== 'completed') {
    throw new Error('policy decision commit marker is invalid');
  }
  for (const field of [
    'operationId', 'domainId', 'policyVersion', 'policyHash', 'policySetHash',
    'level', 'operationalState', 'decisionKind', 'decisionIdentity', 'actor',
    'reason', 'authorizationReference', 'packetHash', 'successfulL1Runs', 'completedAt',
  ]) {
    if (marker[field] !== pending[field]) {
      throw new Error(`policy decision publication identity does not match for ${field}`);
    }
  }
  return true;
}

export function readPolicyDecisionPublication({ repoRoot = process.cwd(), operationId } = {}) {
  const id = requireText(operationId, 'policy decision operationId');
  if (!isL2PolicyDecisionOperation(id)) {
    throw new Error('policy decision publication readback requires an L2 promotion operation');
  }
  const root = path.resolve(requireText(repoRoot, 'policy decision repository root'));
  const resultPath = `reports/authorization/canonical/${id}.result.json`;
  const markerPath = `${resultPath}.commit.json`;
  const pending = readPrivateJsonAtPath(root, resultPath, 'policy decision pending result');
  const marker = readPrivateJsonAtPath(root, markerPath, 'policy decision commit marker');
  assertPolicyDecisionPublication({ pending, marker });
  return Object.freeze({
    operationId: id,
    pendingPath: resultPath,
    commitMarkerPath: markerPath,
    pending,
    marker,
  });
}

function assertCompletedPolicyDecisionResult(result) {
  if (!result || result.schemaVersion !== 1 || result.status !== 'completed'
      || result.authoritative !== true) {
    throw new Error('a completed authoritative policy decision result is required');
  }
}

function assertNoExistingEntry(filePath, label) {
  try {
    fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; overwrite is forbidden`);
}

function removeOwnedPendingResult(filePath, expectedIdentity) {
  try {
    const current = fs.lstatSync(filePath);
    if (current.dev === expectedIdentity.dev && current.ino === expectedIdentity.ino) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function writeJsonAtomic(filePath, payload, { noOverwrite = false } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    if (noOverwrite) {
      fs.linkSync(temporary, filePath);
      fs.unlinkSync(temporary);
    } else {
      fs.renameSync(temporary, filePath);
    }
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    if (noOverwrite && error?.code === 'EEXIST') {
      throw new Error('policy decision result already exists; overwrite is forbidden');
    }
    throw error;
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
