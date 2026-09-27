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
import {
  canonicalServerFingerprint,
  hashCanonicalServerFingerprint,
} from './automation-database-contract.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
  resolveTrustedEvidenceRoot,
} from '../lib/private-repository-path.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { verifyFullReconciliationEvidence } from './reconciliation-evidence-contract.mjs';
import {
  assertProposal as assertL2PromotionProposal,
  L2_SERIAL_PROMOTION_ORDER,
} from './build-l2-promotion-proposal.mjs';
import {
  assertL2SerialTransition,
  isSerialL2PromotionOperation,
} from './l2-promotion-serial-contract.mjs';
import {
  assertL2PolicyStableReauthorizationInput,
  isL2PolicyStableReauthorizationOperation,
  L2_POLICY_STABLE_REAUTHORIZATION_DOMAINS,
} from './l2-policy-stable-reauthorization.mjs';
import { assertApprovedL2PolicyCeilingArtifact } from './l2-policy-ceiling-artifact.mjs';
import {
  loadHistoricalSourceHashDispositions,
  verifyHistoricalSourceHashDispositionEntry,
} from './historical-source-hash-disposition.mjs';
import { SCHEDULER_ACTION_BY_DOMAIN } from './crawler-v2-scheduler-activation-preflight.mjs';

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
const L2_REAUTHORIZATION_OPERATION_IDS = Object.freeze(Object.fromEntries(
  L2_POLICY_STABLE_REAUTHORIZATION_DOMAINS.map((domainId) => [
    domainId,
    `automation-${domainId.replaceAll('_', '-')}-l2-reauthorization`,
  ]),
));
const SCHEDULER_ACTION_IDS = Object.freeze(new Set(Object.values(SCHEDULER_ACTION_BY_DOMAIN)));
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
for (const [domainId, operationId] of Object.entries(L2_REAUTHORIZATION_OPERATION_IDS)) {
  OPERATION_DEFINITIONS[operationId] = Object.freeze({
    domainId,
    currentLevel: 'L2',
    currentStates: Object.freeze(['ACTIVE']),
    targetLevel: null,
    targetOperationalState: null,
    decisionKind: 'L2_PROMOTION',
    reauthorization: true,
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
  if (isL2PolicyStableReauthorizationOperation(operationId)) {
    return buildL2PolicyStableReauthorizationPlan(input, authorizationContext, definition);
  }
  const authorizedActionId = operationId === 'automation-crawler-v2-scheduler-activation'
    ? requireText(input.authorizedActionId, 'authorizedActionId')
    : null;
  if (authorizedActionId != null && !SCHEDULER_ACTION_IDS.has(authorizedActionId)) {
    throw new Error('authorizedActionId is not a registered scheduler action');
  }
  if (authorizedActionId != null) {
    assertSchedulerCanaryScope(input, authorizedActionId);
  }
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
  const serialBinding = definition.decisionKind === 'L2_PROMOTION'
      && isSerialL2PromotionOperation(operationId)
    ? validateSerialL2Input(input, operationId)
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
    ...(isSerialL2PromotionOperation(operationId)
      ? { l1EvidencePolicySetHash: requireHash(input.l1EvidencePolicySetHash, 'l1EvidencePolicySetHash') }
      : {}),
    policyVersion,
    policyHash: requireHash(input.policyHash, 'policyHash'),
    minimumSuccessfulL1Runs,
    authorizedAt,
    expiresAt,
    requiresSuccessfulL1Runs,
    requiresFullReconciliation: definition.decisionKind === 'L2_PROMOTION',
    ...proposalBinding,
    ...serialBinding,
    ...(definition.decisionKind === 'L2_PROMOTION' ? validateL2TargetInput(input) : {}),
    ...definition,
    ...(authorizedActionId == null ? {} : { authorizedActionId }),
  });
}

function assertSchedulerCanaryScope(input, authorizedActionId) {
  const canary = input?.canary;
  if (!canary || typeof canary !== 'object' || Array.isArray(canary)) {
    throw new Error('scheduler activation requires a captured canary scope');
  }
  const actionId = requireText(canary.actionId, 'captured canary actionId');
  const domainId = requireText(canary.domainId, 'captured canary domainId');
  if (SCHEDULER_ACTION_BY_DOMAIN[domainId] !== actionId) {
    throw new Error('captured canary action/domain binding is invalid');
  }
  if (actionId !== authorizedActionId) {
    throw new Error('authorizedActionId must match the captured canary action');
  }
}

function buildL2PolicyStableReauthorizationPlan(input, authorizationContext, definition) {
  if (authorizationContext.operationId !== input.operationId) {
    throw new Error('authorization context operationId must match the policy decision operationId');
  }
  const authorization = assertL2PolicyStableReauthorizationInput(input, {
    now: authorizationContext.authorizedAt,
  });
  const authorizedAt = requireTimestamp(authorizationContext.authorizedAt, 'authorizedAt');
  const expiresAt = requireTimestamp(authorizationContext.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(authorizedAt)) {
    throw new Error('expiresAt must be after authorizedAt');
  }
  const current = authorization.currentPolicy;
  const predecessor = authorization.predecessorL1Evidence;
  return Object.freeze({
    schemaVersion: 1,
    operationId: authorization.operationId,
    databaseName: authorization.databaseName,
    domainId: authorization.domainId,
    ownerUsername: requireText(authorizationContext.actor, 'actor'),
    actor: requireText(authorizationContext.actor, 'actor'),
    reason: requireText(authorizationContext.reason, 'reason'),
    authorizationReference: requireText(authorizationContext.authorizationReference, 'authorizationReference'),
    decisionIdentity: requireText(authorizationContext.decisionIdentity, 'decisionIdentity'),
    packetHash: requireHash(authorizationContext.packetHash, 'packetHash'),
    policySetHash: current.policySetHash,
    policyVersion: current.policyVersion,
    policyHash: current.policyHash,
    minimumSuccessfulL1Runs: predecessor.minimumSuccessfulL1Runs,
    authorizedAt,
    expiresAt,
    requiresSuccessfulL1Runs: true,
    requiresFullReconciliation: true,
    currentLevel: definition.currentLevel,
    currentStates: definition.currentStates,
    targetLevel: null,
    targetOperationalState: null,
    decisionKind: 'L2_PROMOTION',
    reauthorization: true,
    currentPolicy: current,
    targetPolicy: authorization.targetPolicy,
    priorDecision: authorization.priorDecision,
    l1EvidencePolicyVersion: predecessor.policyVersion,
    l1EvidencePolicyHash: predecessor.policyHash,
    l1EvidencePolicySetHash: predecessor.policySetHash,
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

    if (plan.decisionKind === 'L2_PROMOTION' && isSerialL2PromotionOperation(plan.operationId)) {
      await assertSerialPromotionPredecessor({ adapter, plan, currentPolicySetHash });
    }
    if (plan.reauthorization === true) {
      await assertL2PolicyStableReauthorizationPredecessor({ adapter, plan, executionTime });
    }

    let successfulL1Runs = null;
    let qualifyingEvidence = null;
    if (plan.decisionKind === 'L2_PROMOTION' && plan.reauthorization === true) {
      if (typeof adapter.readTargetPolicyForUpdate !== 'function') {
        throw new Error('current L2 policy reader is required for L2 reauthorization');
      }
      const targetPolicy = await adapter.readTargetPolicyForUpdate(plan.domainId, plan.policyVersion);
      const targetPolicyJson = parsePolicyJson(targetPolicy?.policyJson);
      if (!targetPolicy || targetPolicy.domainId !== plan.domainId
          || Number(targetPolicy.policyVersion) !== plan.policyVersion
          || targetPolicy.policyHash !== plan.policyHash
          || targetPolicy.level !== 'L2'
          || computePolicyHash(targetPolicyJson) !== plan.policyHash) {
        throw new Error('current L2 policy version or ceiling does not match the reauthorization');
      }
      if (typeof adapter.readL2OwnershipFenceState !== 'function') {
        throw new Error('L2 ownership fence reader is required for L2 reauthorization');
      }
      const fenceState = await adapter.readL2OwnershipFenceState(plan.domainId, targetPolicyJson.ownedTables);
      if (!fenceState || [fenceState.activeAttempts, fenceState.activeReservations,
        fenceState.activeFences, fenceState.mismatchedFences ?? 0]
        .some((count) => !Number.isSafeInteger(Number(count)) || Number(count) !== 0)) {
        throw new Error('active writer, reservation, or attempt blocks L2 reauthorization');
      }
      if (typeof adapter.readQualifyingL1Evidence !== 'function') {
        throw new Error('full reconciliation evidence reader is required for L2 reauthorization');
      }
      qualifyingEvidence = await adapter.readQualifyingL1Evidence(plan.domainId, {
        policyVersion: plan.l1EvidencePolicyVersion,
        policyHash: plan.l1EvidencePolicyHash,
        policySetHash: plan.l1EvidencePolicySetHash,
        minimumSuccessfulL1Runs: plan.minimumSuccessfulL1Runs,
      });
      successfulL1Runs = Number(qualifyingEvidence?.distinctCommittedL1Runs);
      if (!Number.isSafeInteger(successfulL1Runs) || successfulL1Runs < plan.minimumSuccessfulL1Runs) {
        throw new Error(`at least ${plan.minimumSuccessfulL1Runs} distinct committed L1 runs are required`);
      }
      try {
        verifyFullReconciliationEvidence(qualifyingEvidence.fullReconciliation, {
          domainId: plan.domainId,
          policyVersion: plan.l1EvidencePolicyVersion,
          policyHash: plan.l1EvidencePolicyHash,
          policySetHash: plan.l1EvidencePolicySetHash,
        });
      } catch (error) {
        throw new Error(`full reconciliation evidence is required for L2 reauthorization: ${error.message}`);
      }
    } else if (plan.decisionKind === 'L2_PROMOTION') {
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
        policySetHash: plan.l1EvidencePolicySetHash ?? plan.policySetHash,
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
          policySetHash: plan.l1EvidencePolicySetHash ?? plan.policySetHash,
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
        authorizedActionId: plan.authorizedActionId ?? null,
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
      if (plan.decisionKind === 'L2_PROMOTION' && typeof adapter.readCurrentPolicySetHash === 'function') {
        const postPromotionPolicySetHash = await adapter.readCurrentPolicySetHash();
        if (postPromotionPolicySetHash !== plan.targetPolicySetHash) {
          throw new Error('post-promotion policy set identity does not match the decision');
        }
      }
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
      ...(plan.l1EvidencePolicySetHash == null ? {} : {
        l1EvidencePolicySetHash: plan.l1EvidencePolicySetHash,
        promotionCurrentPolicySetHash: plan.policySetHash,
        promotionTargetPolicySetHash: plan.targetPolicySetHash,
        serialTransition: plan.serialTransition,
      }),
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

async function assertL2PolicyStableReauthorizationPredecessor({ adapter, plan, executionTime }) {
  if (typeof adapter.readLatestL2PromotionDecisionForUpdate !== 'function') {
    throw new Error('latest L2 promotion decision reader is required for L2 reauthorization');
  }
  const actual = await adapter.readLatestL2PromotionDecisionForUpdate(plan.domainId);
  const expected = plan.priorDecision;
  if (!actual || actual.decisionKind !== 'L2_PROMOTION'
      || actual.domainId !== plan.domainId
      || Number(actual.policyVersion) !== plan.policyVersion
      || actual.policyHash !== plan.policyHash
      || actual.policySetHash !== expected.policySetHash
      || actual.decisionIdentity !== expected.decisionIdentity
      || actual.packetHash !== expected.packetHash
      || requireTimestamp(actual.expiresAt, 'latest L2 promotion decision expiry') !== expected.expiresAt) {
    throw new Error('latest L2 promotion decision does not match the reauthorization input');
  }
  if (Date.parse(actual.expiresAt) >= Date.parse(executionTime)) {
    throw new Error('latest L2 promotion decision is not expired');
  }
}

async function assertSerialPromotionPredecessor({ adapter, plan, currentPolicySetHash }) {
  const transition = assertL2SerialTransition(plan.serialTransition, {
    domainId: plan.domainId,
    operationId: plan.operationId,
  });
  if (transition.sequenceIndex === 0) return true;
  if (typeof adapter.readL2PromotionPredecessor !== 'function') {
    throw new Error('serial L2 predecessor reader is required for non-first promotion');
  }
  const expected = transition.predecessor;
  const observed = await adapter.readL2PromotionPredecessor(
    plan.domainId,
    transition,
  );
  if (!observed || observed.decisionKind !== 'L2_PROMOTION'
      || observed.domainId !== expected.domainId
      || observed.operationId !== expected.operationId
      || observed.decisionIdentity !== expected.decisionIdentity
      || observed.packetHash !== expected.packetHash
      || observed.policySetHash !== expected.postPolicySetHash
      || observed.postPolicySetHash !== expected.postPolicySetHash
      || currentPolicySetHash !== expected.postPolicySetHash) {
    throw new Error('serial L2 predecessor identity or post-policy-set hash does not match the live transition');
  }
  return true;
}

export function createMysqlAutomationPolicyDecisionAdapter(connection, {
  repoRoot = process.cwd(),
  databaseEvidenceRoot = null,
  historicalEvidenceRoot = null,
  evidenceRoot = null,
  historicalSourceHashDispositionPaths = [],
  historicalDispositionPaths = [],
  historicalDispositionServerFingerprint = null,
  historicalDispositionNow = null,
} = {}) {
  if (!connection) throw new TypeError('MySQL connection is required');
  const resolvedRepoRoot = path.resolve(repoRoot);
  const evidenceRootInputs = [databaseEvidenceRoot, historicalEvidenceRoot, evidenceRoot]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  for (const value of evidenceRootInputs) {
    if (!path.isAbsolute(value) || path.resolve(value) !== value || value.endsWith(path.sep)) {
      throw new Error('evidence root must be a canonical absolute directory path');
    }
  }
  const normalizedEvidenceRoots = [...new Set(evidenceRootInputs.map((value) => path.resolve(value)))];
  if (normalizedEvidenceRoots.length > 1) {
    throw new Error('conflicting evidence root inputs');
  }
  const evidenceRootDescriptor = resolveTrustedEvidenceRoot({
    repoRoot: resolvedRepoRoot,
    evidenceRoot: evidenceRootInputs[0] ?? null,
  });
  const resolvedEvidenceRoot = evidenceRootDescriptor.root;
  const evidenceRootIdentity = Object.freeze({
    kind: evidenceRootDescriptor.kind,
    repositoryRelativeRoot: evidenceRootDescriptor.repositoryRelativeRoot,
  });
  const sourceDispositionPaths = normalizeHistoricalDispositionPaths(
    Array.isArray(historicalSourceHashDispositionPaths)
      ? historicalSourceHashDispositionPaths
      : [historicalSourceHashDispositionPaths],
  );
  const compatibilityDispositionPaths = normalizeHistoricalDispositionPaths(
    Array.isArray(historicalDispositionPaths)
      ? historicalDispositionPaths
      : [historicalDispositionPaths],
  );
  if (sourceDispositionPaths.length > 0 && compatibilityDispositionPaths.length > 0
      && !samePathSet(sourceDispositionPaths, compatibilityDispositionPaths)) {
    throw new Error('historical disposition path conflict between source-hash and compatibility inputs');
  }
  const dispositionPaths = normalizeHistoricalDispositionPaths([
    ...sourceDispositionPaths,
    ...compatibilityDispositionPaths,
  ]);
  const resolveHistoricalDispositionNow = () => (
    typeof historicalDispositionNow === 'function'
      ? historicalDispositionNow()
      : historicalDispositionNow ?? new Date().toISOString()
  );
  let historicalDispositions = loadHistoricalSourceHashDispositions({
    repoRoot: resolvedRepoRoot,
    dispositionPaths,
    now: resolveHistoricalDispositionNow(),
  });
  let expectedHistoricalServerFingerprint = null;
  if (historicalDispositions.size > 0) {
    if (!historicalDispositionServerFingerprint) {
      throw new Error('historical disposition current server fingerprint is required');
    }
    expectedHistoricalServerFingerprint = canonicalServerFingerprint(
      historicalDispositionServerFingerprint,
    );
  }
  const verifyHistoricalDispositionServerFingerprint = async () => {
    if (dispositionPaths.length === 0) return;
    const refreshedDispositions = loadHistoricalSourceHashDispositions({
      repoRoot: resolvedRepoRoot,
      dispositionPaths,
      now: resolveHistoricalDispositionNow(),
    });
    assertHistoricalDispositionSnapshot(historicalDispositions, refreshedDispositions);
    historicalDispositions = refreshedDispositions;
    if (historicalDispositions.size === 0) return;
    const [serverRows] = await connection.query(
      'SELECT @@server_uuid AS serverUuid, @@port AS port',
    );
    const actual = canonicalServerFingerprint({
      host: expectedHistoricalServerFingerprint.host,
      port: Number(serverRows?.[0]?.port),
      serverUuid: serverRows?.[0]?.serverUuid,
      databases: expectedHistoricalServerFingerprint.databases,
    });
    if (JSON.stringify(actual) !== JSON.stringify(expectedHistoricalServerFingerprint)) {
      throw new Error('current database server fingerprint does not match the historical disposition input');
    }
    const actualHash = hashCanonicalServerFingerprint(actual);
    for (const [runId, historical] of historicalDispositions.entries()) {
      const packetHash = historical.packet?.serverFingerprint;
      const approvalHash = historical.disposition?.approval?.technical?.serverFingerprint;
      if (packetHash !== actualHash || approvalHash !== actualHash) {
        throw new Error(`historical disposition ${runId} server fingerprint does not match the current database server`);
      }
    }
    return actual;
  };
  return {
    evidenceRoot: evidenceRootIdentity,
    databaseEvidenceRoot: evidenceRootIdentity,
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
    async readLatestL2PromotionDecisionForUpdate(domainId) {
      const [rows] = await connection.query(
        'SELECT decision_kind AS decisionKind, domain_id AS domainId,'
        + ' policy_version AS policyVersion, policy_hash AS policyHash,'
        + ' policy_set_hash AS policySetHash, decision_identity AS decisionIdentity,'
        + ' packet_hash AS packetHash,'
        + " DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS expiresAt"
        + ' FROM crawler_automation_activation_decision'
        + " WHERE decision_kind = 'L2_PROMOTION' AND domain_id = ?"
        + ' ORDER BY authorized_at DESC, id DESC LIMIT 1 FOR UPDATE',
        [domainId],
      );
      const row = rows?.[0] ?? null;
      return row == null
        ? null
        : { ...row, expiresAt: mysqlDateTimeToUtcIso(row.expiresAt) };
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
    async readCurrentPolicyRows() {
      const [rows] = await connection.query(
        'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
        + ' pv.policy_hash AS policyHash FROM crawler_automation_policy p'
        + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
        + ' AND pv.policy_version = p.current_version ORDER BY p.domain_id FOR UPDATE',
      );
      return (rows ?? []).map((row) => ({
        domainId: row.domainId,
        policyVersion: Number(row.policyVersion),
        policyHash: row.policyHash,
      }));
    },
    async readCurrentPolicySetHash() {
      return computePolicySetHash(await this.readCurrentPolicyRows());
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
    async readL2PromotionPredecessor(domainId, transition) {
      const predecessor = transition?.predecessor;
      if (!predecessor || typeof predecessor !== 'object') {
        throw new Error('serial L2 predecessor descriptor is required');
      }
      const [rows] = await connection.query(
        'SELECT decision_kind AS decisionKind, domain_id AS domainId, policy_version AS policyVersion, '
        + 'policy_hash AS policyHash, policy_set_hash AS policySetHash, '
        + 'decision_identity AS decisionIdentity, packet_hash AS packetHash '
        + 'FROM crawler_automation_activation_decision '
        + "WHERE decision_kind = 'L2_PROMOTION' AND domain_id = ? "
        + 'AND decision_identity = ? AND packet_hash = ? FOR UPDATE',
        [predecessor.domainId, predecessor.decisionIdentity, predecessor.packetHash],
      );
      const row = rows?.[0];
      if (!row) return null;
      return {
        ...row,
        operationId: `automation-${String(row.domainId).replaceAll('_', '-')}-l2-promotion`,
        postPolicySetHash: row.policySetHash,
      };
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
      await verifyHistoricalDispositionServerFingerprint();
      const [rows] = await connection.query(
        'SELECT DISTINCT r.run_id AS runId, r.primary_domain_id AS runDomainId,'
        + ' r.created_at AS runCreatedAt, r.trigger_kind AS triggerKind, r.status AS runStatus,'
        + ' r.policy_set_hash AS runPolicySetHash, r.baseline_fingerprint AS runBaselineFingerprint,'
        + ' rp.run_id AS runPolicyRunId, rp.run_id AS runPolicyRowRunId, rp.domain_id AS runPolicyDomainId,'
        + ' rp.policy_version AS runPolicyVersion, rp.policy_hash AS runPolicyHash,'
        + ' rp.policy_set_hash AS runPolicyRowSetHash,'
        + ' a.run_id AS applyRunId, a.bundle_hash AS bundleHash, a.bundle_hash AS applyBundleHash, a.status AS applyStatus,'
        + ' a.policy_set_hash AS applyPolicySetHash,'
        + ' b.run_id AS bundleRunId, b.bundle_hash AS bundleRowHash, b.private_path AS bundlePath,'
        + ' b.evidence_hash AS bundleEvidenceHash, b.policy_set_hash AS bundlePolicySetHash,'
        + ' b.baseline_fingerprint AS bundleBaselineFingerprint,'
        + ' es.run_id AS evidenceSetRunId, es.evidence_hash AS evidenceHash, es.evidence_hash AS evidenceSetHash,'
        + ' es.policy_set_hash AS evidenceSetPolicySetHash,'
        + ' es.baseline_fingerprint AS evidenceSetBaselineFingerprint, es.manifest_json AS evidenceManifest,'
        + ' (SELECT JSON_OBJECT(\'runId\', e.run_id, \'path\', e.private_path, \'sha256\', e.sha256, \'policySetHash\', e.policy_set_hash)'
        + ' FROM crawler_automation_evidence e WHERE e.run_id = r.run_id'
        + " AND e.kind = 'FULL_RECONCILIATION' ORDER BY e.id DESC LIMIT 1) AS reconciliationArtifact"
        + ', (SELECT e.run_id FROM crawler_automation_evidence e WHERE e.run_id = r.run_id'
        + " AND e.kind = 'FULL_RECONCILIATION' ORDER BY e.id DESC LIMIT 1) AS reconciliationRunId"
        + ', (SELECT e.private_path FROM crawler_automation_evidence e WHERE e.run_id = r.run_id'
        + " AND e.kind = 'FULL_RECONCILIATION' ORDER BY e.id DESC LIMIT 1) AS reconciliationPath"
        + ', (SELECT e.sha256 FROM crawler_automation_evidence e WHERE e.run_id = r.run_id'
        + " AND e.kind = 'FULL_RECONCILIATION' ORDER BY e.id DESC LIMIT 1) AS reconciliationSha256"
        + ', (SELECT e.policy_set_hash FROM crawler_automation_evidence e WHERE e.run_id = r.run_id'
        + " AND e.kind = 'FULL_RECONCILIATION' ORDER BY e.id DESC LIMIT 1) AS reconciliationPolicySetHash"
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
      // The evidence query is a boundary at which a disposition file or the
      // connected server could have changed. Re-read both immediately before
      // interpreting any row so a stale packet can never exclude evidence.
      await verifyHistoricalDispositionServerFingerprint();
      const distinct = new Map();
      const qualifyingL1Runs = [];
      const excludedHistoricalRuns = [];
      const expectedHistoricalRuns = new Map(
        [...historicalDispositions.entries()]
          .filter(([, value]) => value.entry.domainId === domainId),
      );
      const observedHistoricalRuns = new Set();
      let fullReconciliation = false;
      for (const row of rows ?? []) {
        if (distinct.has(row.runId)) continue;
        assertL1DatabaseRowIdentity(row, domainId, identity);
        const historical = historicalDispositions.get(row.runId);
        if (historical) {
          if (observedHistoricalRuns.has(row.runId)) continue;
          if (historical.entry.domainId !== domainId) {
            throw new Error('historical source hash disposition domain identity does not match the queried domain');
          }
          try {
            verifyHistoricalSourceHashDispositionEntry({
              repoRoot: resolvedRepoRoot,
              disposition: historical.disposition,
              entry: historical.entry,
              row,
              domainId,
              policy: {
                domainId,
                level: 'L1',
                operationalState: 'ACTIVE',
                policyVersion: Number(identity.policyVersion),
                policyHash: identity.policyHash,
                policySetHash: identity.policySetHash,
              },
            });
          } catch (error) {
            throw new Error(`historical source hash disposition is invalid for ${row.runId}: ${error.message}`);
          }
          observedHistoricalRuns.add(row.runId);
          excludedHistoricalRuns.push({
            domainId,
            runId: row.runId,
            reasonCode: historical.disposition.reasonCode,
            disposition: historical.disposition.disposition,
            dispositionPath: historical.path,
            dispositionArtifactHash: historical.disposition.artifactHash,
            declaredSourceSha256: historical.entry.source.declaredSha256,
            semanticJsonSha256: historical.entry.source.semanticJsonSha256,
            actualByteSha256: historical.entry.source.actualByteSha256,
          });
          continue;
        }
        let bundle = null;
        const bundlePath = requireCanonicalAbsoluteEvidencePath(
          row.bundlePath,
          resolvedEvidenceRoot,
          'L1 bundle path',
        );
        try {
          const confinedBundlePath = assertRepositoryOrdinaryFile({
            repoRoot: resolvedEvidenceRoot,
            filePath: bundlePath,
            label: 'L1 bundle path',
          });
          if (confinedBundlePath !== bundlePath
              || !confinedBundlePath.startsWith(`${path.resolve(resolvedEvidenceRoot, 'reports', 'authorization', 'canonical')}${path.sep}`)) {
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
        assertL1BundleIdentity(bundle, row, domainId, identity);
        const sourcePath = requireCanonicalRelativeEvidencePath(bundle.source?.path, 'L1 source path');
        if (!sourcePath.startsWith('reports/')
            || !HASH_PATTERN.test(bundle.source?.sha256 ?? '')
            || manifest?.privatePath !== bundle.__confinedPath
            || manifest?.source?.path !== sourcePath
            || manifest?.source?.sha256 !== bundle.source.sha256) {
          throw new Error('L1 source identity is missing or drifted');
        }
        const sourceAbsolute = assertRepositoryOrdinaryFile({
          repoRoot: resolvedEvidenceRoot,
          filePath: path.resolve(resolvedEvidenceRoot, sourcePath),
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
        let verifiedReconciliationArtifact = null;
        if (reconciliation != null) {
          try {
            const verified = verifyFullReconciliationEvidence(reconciliation, {
              domainId,
              runId: row.runId,
              policyVersion: identity.policyVersion,
              policyHash: identity.policyHash,
              policySetHash: identity.policySetHash,
            });
            verifyReconciliationArtifactFiles(verified, resolvedEvidenceRoot);
          } catch (error) {
            throw new Error(`L1 inline reconciliation evidence is invalid: ${error.message}`);
          }
        }
        const hasReconciliationArtifact = reconciliationArtifact != null;
        if (hasReconciliationArtifact) {
          try {
            assertReconciliationArtifactReferenceIdentity({
              reference: reconciliationArtifact,
              row,
              runId: row.runId,
              policySetHash: identity.policySetHash,
              repoRoot: resolvedEvidenceRoot,
            });
            const artifactEntry = readConfinedReconciliationArtifact(resolvedEvidenceRoot, reconciliationArtifact);
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
            verifyReconciliationArtifactFiles(verified, resolvedEvidenceRoot);
            fullReconciliation = verified;
            verifiedReconciliationArtifact = reconciliationArtifact;
          } catch (error) {
            throw new Error(`L1 reconciliation artifact is invalid: ${error.message}`);
          }
        }
        qualifyingL1Runs.push({
          runId: row.runId,
          status: 'COMPLETED',
          applyStatus: 'COMMITTED',
          ...(row.runCreatedAt == null ? {} : { runCreatedAt: row.runCreatedAt }),
          ...(row.triggerKind == null ? {} : { triggerKind: row.triggerKind }),
          operationId: bundle.operationId,
          bundlePath: toRepoRelativePath(resolvedEvidenceRoot, bundle.__confinedPath),
          bundleSha256: bundleFileHash,
          evidencePath: verifiedReconciliationArtifact?.path
            ? toRepoRelativePath(resolvedEvidenceRoot, verifiedReconciliationArtifact.path)
            : null,
          evidenceSha256: verifiedReconciliationArtifact?.sha256 ?? null,
          policySetHash: bundle.policy.policySetHash,
          baselineFingerprint: bundle.baselineFingerprint,
          fullReconciliation: Boolean(verifiedReconciliationArtifact),
        });
      }
      for (const runId of expectedHistoricalRuns.keys()) {
        if (!observedHistoricalRuns.has(runId)) {
          throw new Error(`historical source hash disposition run ${runId} was not found in the exact database identity query`);
        }
      }
      return {
        distinctCommittedL1Runs: distinct.size,
        fullReconciliation,
        qualifyingL1Runs,
        excludedHistoricalRuns,
        evidenceRoot: evidenceRootIdentity,
        databaseEvidenceRoot: evidenceRootIdentity,
      };
    },
    async insertActivationDecision(values) {
      await connection.query(
        'INSERT INTO crawler_automation_activation_decision'
        + ' (decision_kind, domain_id, policy_version, policy_hash, policy_set_hash,'
        + ' minimum_successful_l1_runs, actor, reason, authorization_reference,'
        + ' decision_identity, packet_hash, authorized_action_id, authorized_at, expires_at)'
        + ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [values.decisionKind, values.domainId, values.policyVersion, values.policyHash,
          values.policySetHash, values.minimumSuccessfulL1Runs, values.actor, values.reason,
          values.authorizationReference, values.decisionIdentity, values.packetHash,
          values.authorizedActionId, toMysqlTimestamp(values.authorizedAt), toMysqlTimestamp(values.expiresAt)],
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
    const normalized = requireCanonicalRelativeEvidencePath(evidence[pathField], `${label} path`);
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

function assertL1DatabaseRowIdentity(row, domainId, identity) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('L1 database evidence row is invalid');
  }
  const runId = requireText(row.runId, 'L1 run identity');
  assertExactIdentity(row.runDomainId, domainId, 'L1 run domain identity');
  assertExactIdentity(row.runPolicyRunId, runId, 'L1 run-policy run identity');
  assertExactIdentity(row.runPolicyRowRunId, runId, 'L1 run-policy row run identity');
  assertExactIdentity(row.runPolicyDomainId, domainId, 'L1 run-policy domain identity');
  assertNumericIdentity(row.runPolicyVersion, identity.policyVersion, 'L1 run-policy version identity');
  assertExactIdentity(row.runPolicyHash, identity.policyHash, 'L1 run-policy hash identity');
  assertExactIdentity(row.runPolicyRowSetHash, identity.policySetHash, 'L1 run-policy set identity');
  assertExactIdentity(row.applyRunId, runId, 'L1 apply run identity');
  assertExactIdentity(row.applyBundleHash, row.bundleHash, 'L1 apply bundle identity');
  assertExactIdentity(row.applyPolicySetHash, identity.policySetHash, 'L1 apply policy-set identity');
  assertExactIdentity(row.bundleRunId, runId, 'L1 bundle run identity');
  assertExactIdentity(row.bundleRowHash, row.bundleHash, 'L1 bundle row hash identity');
  assertExactIdentity(row.bundlePolicySetHash, identity.policySetHash, 'L1 bundle policy-set identity');
  assertExactIdentity(row.evidenceSetRunId, runId, 'L1 evidence-set run identity');
  assertExactIdentity(row.evidenceSetHash, row.evidenceHash, 'L1 evidence-set hash identity');
  assertExactIdentity(row.evidenceSetPolicySetHash, identity.policySetHash, 'L1 evidence-set policy-set identity');
  for (const [field, label] of [
    ['bundleHash', 'L1 bundle hash'],
    ['evidenceHash', 'L1 evidence hash'],
    ['runPolicyHash', 'L1 run-policy hash'],
    ['runPolicyRowSetHash', 'L1 run-policy set hash'],
    ['runPolicySetHash', 'L1 run set hash'],
    ['applyPolicySetHash', 'L1 apply set hash'],
    ['bundlePolicySetHash', 'L1 bundle set hash'],
    ['evidenceSetPolicySetHash', 'L1 evidence-set hash'],
    ['runBaselineFingerprint', 'L1 run baseline fingerprint'],
    ['bundleBaselineFingerprint', 'L1 bundle baseline fingerprint'],
    ['evidenceSetBaselineFingerprint', 'L1 evidence-set baseline fingerprint'],
  ]) {
    if (!HASH_PATTERN.test(String(row[field] ?? ''))) {
      throw new Error(`${label} is missing or invalid`);
    }
  }
  assertExactIdentity(row.runPolicySetHash, identity.policySetHash, 'L1 run policy-set identity');
  assertExactIdentity(row.runBaselineFingerprint, row.bundleBaselineFingerprint, 'L1 run baseline identity');
  assertExactIdentity(row.evidenceSetBaselineFingerprint, row.bundleBaselineFingerprint, 'L1 evidence-set baseline identity');
  if (row.runStatus != null && row.runStatus !== 'COMPLETED') {
    throw new Error('L1 run status identity is not COMPLETED');
  }
  if (row.applyStatus != null && row.applyStatus !== 'COMMITTED') {
    throw new Error('L1 apply status identity is not COMMITTED');
  }
  const reconciliationFields = [
    row.reconciliationRunId,
    row.reconciliationPath,
    row.reconciliationSha256,
    row.reconciliationPolicySetHash,
  ];
  if (reconciliationFields.some((value) => value != null)) {
    if (reconciliationFields.some((value) => value == null)) {
      throw new Error('L1 reconciliation evidence identity is incomplete');
    }
    assertExactIdentity(row.reconciliationRunId, runId, 'L1 reconciliation run identity');
    assertExactIdentity(row.reconciliationPolicySetHash, identity.policySetHash, 'L1 reconciliation policy-set identity');
    if (!HASH_PATTERN.test(String(row.reconciliationSha256))) {
      throw new Error('L1 reconciliation evidence hash identity is invalid');
    }
  }
}

function assertL1BundleIdentity(bundle, row, domainId, identity) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new Error('L1 bundle identity is invalid');
  }
  if (bundle.domainId !== domainId) {
    throw new Error('L1 bundle domain identity drifted');
  }
  if (bundle.runId !== row.runId) {
    throw new Error('L1 bundle run identity drifted');
  }
  if (bundle.databaseName !== 'terria_v1_local') {
    throw new Error('L1 bundle database identity drifted');
  }
  if (!exactL1OperationId(domainId, bundle.operationId)) {
    throw new Error('L1 bundle operation identity is not exact for the domain');
  }
  const policy = bundle.policy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
      || policy.domainId !== domainId || policy.level !== 'L1'
      || policy.operationalState !== 'ACTIVE'
      || Number(policy.policyVersion) !== Number(identity.policyVersion)
      || policy.policyHash !== identity.policyHash
      || policy.policySetHash !== identity.policySetHash) {
    throw new Error('L1 bundle policy identity drifted');
  }
  if (!HASH_PATTERN.test(String(bundle.evidenceHash ?? ''))
      || !HASH_PATTERN.test(String(bundle.baselineFingerprint ?? ''))) {
    throw new Error('L1 bundle evidence or baseline identity is invalid');
  }
}

function assertReconciliationArtifactReferenceIdentity({
  reference,
  row,
  runId,
  policySetHash,
  repoRoot,
} = {}) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
    throw new Error('reconciliation artifact reference is required');
  }
  const artifactPath = requireCanonicalAbsoluteEvidencePath(
    reference.path,
    repoRoot,
    'reconciliation artifact path',
  );
  const relative = path.relative(path.resolve(repoRoot), artifactPath).replaceAll('\\', '/');
  if (!relative.startsWith('reports/runtime/l1-reconciliation/')) {
    throw new Error('reconciliation artifact path must be under the exact L1 reconciliation root');
  }
  if (!relative.endsWith('/reconciliation-evidence.json')) {
    throw new Error('reconciliation artifact path must name reconciliation-evidence.json');
  }
  assertExactIdentity(reference.runId, runId, 'reconciliation artifact run identity');
  if (!HASH_PATTERN.test(String(reference.sha256 ?? ''))) {
    throw new Error('reconciliation artifact hash is invalid');
  }
  if (reference.policySetHash !== policySetHash) {
    throw new Error('reconciliation artifact policy-set identity drifted');
  }
  if (row.reconciliationRunId != null && row.reconciliationRunId !== runId) {
    throw new Error('reconciliation artifact run identity drifted');
  }
  if (row.reconciliationPath != null && row.reconciliationPath !== artifactPath) {
    throw new Error('reconciliation artifact path identity drifted');
  }
  if (row.reconciliationSha256 != null && row.reconciliationSha256 !== reference.sha256) {
    throw new Error('reconciliation artifact hash identity drifted');
  }
  if (row.reconciliationPolicySetHash != null && row.reconciliationPolicySetHash !== reference.policySetHash) {
    throw new Error('reconciliation artifact policy-set identity drifted');
  }
  return artifactPath;
}

function assertExactIdentity(actual, expected, label) {
  if (actual == null || actual === '') {
    throw new Error(`${label} is missing`);
  }
  if (actual !== expected) {
    throw new Error(`${label} drifted`);
  }
}

function assertNumericIdentity(actual, expected, label) {
  if (actual == null || !Number.isSafeInteger(Number(actual))
      || Number(actual) !== Number(expected)) {
    throw new Error(`${label} drifted`);
  }
}

function requireCanonicalRelativeEvidencePath(value, label) {
  const raw = String(value ?? '');
  const normalized = raw.trim();
  if (!normalized || raw !== normalized || normalized.includes('\\')
      || path.posix.isAbsolute(normalized) || normalized.includes('//')
      || normalized.endsWith('/') || path.posix.normalize(normalized) !== normalized
      || !normalized.startsWith('reports/')) {
    throw new Error(`${label} must be a canonical normalized relative path`);
  }
  return normalized;
}

function requireCanonicalAbsoluteEvidencePath(value, repoRoot, label) {
  const raw = String(value ?? '');
  const normalized = raw.trim();
  if (!normalized || raw !== normalized || normalized.includes('\\')
      || !path.posix.isAbsolute(normalized) || normalized.includes('//')
      || normalized.endsWith('/') || path.posix.normalize(normalized) !== normalized) {
    throw new Error(`${label} must be a canonical normalized absolute path`);
  }
  const resolved = path.resolve(normalized);
  if (resolved !== normalized) {
    throw new Error(`${label} must be a canonical normalized absolute path`);
  }
  const root = path.resolve(repoRoot);
  const relative = path.relative(root, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must remain inside the repository root`);
  }
  return normalized;
}

function readConfinedReconciliationArtifact(repoRoot, reference) {
  const artifactPath = requireCanonicalAbsoluteEvidencePath(
    reference?.path,
    repoRoot,
    'reconciliation artifact path',
  );
  const confined = assertRepositoryOrdinaryFile({ repoRoot, filePath: artifactPath, label: 'L1 reconciliation artifact' });
  if (confined !== artifactPath || !confined.startsWith(`${path.resolve(repoRoot, 'reports')}${path.sep}`)) {
    throw new Error('reconciliation artifact must be under reports');
  }
  const bytes = fs.readFileSync(confined);
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== reference.sha256) throw new Error('reconciliation artifact file hash drifted');
  return { path: confined, bytes };
}

function normalizeHistoricalDispositionPaths(values) {
  const normalized = [];
  for (const value of values ?? []) {
    if (value == null || String(value).trim() === '') continue;
    const text = String(value).trim().replaceAll('\\', '/');
    for (const part of text.split(',').map((entry) => entry.trim()).filter(Boolean)) {
      if (!normalized.includes(part)) normalized.push(part);
    }
  }
  return normalized;
}

function samePathSet(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function assertHistoricalDispositionSnapshot(previous, current) {
  if (!(previous instanceof Map) || !(current instanceof Map) || previous.size !== current.size) {
    throw new Error('historical disposition changed between load and consumption');
  }
  for (const [runId, before] of previous.entries()) {
    const after = current.get(runId);
    if (!after
        || before.path !== after.path
        || before.fileSha256 !== after.fileSha256
        || before.packetPath !== after.packetPath
        || before.packetFileSha256 !== after.packetFileSha256
        || stableJson(before.disposition) !== stableJson(after.disposition)
        || stableJson(before.packet) !== stableJson(after.packet)) {
      throw new Error(`historical disposition ${runId} changed between load and consumption`);
    }
  }
}

function toRepoRelativePath(repoRoot, filePath) {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(filePath);
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('evidence path escapes the adapter repository root');
  }
  return relative;
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
    assertL2PolicyDecisionCliPaths({ operationId, inputArgument, outputArgument });
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
  if (isL2PolicyStableReauthorizationOperation(operationId)) {
    assertL2ReauthorizationExecutionInput({ repoRoot, operationId, input });
  } else if (input.targetPolicyLevel === 'L2') {
    assertL2PromotionExecutionInput({ repoRoot, operationId: input.operationId, input });
  }
  const authorizationContext = loadAuthorizedOperationContext({
    env,
    operationId: input.operationId,
    now,
    repoRoot,
  });
  const plan = buildAutomationPolicyDecisionPlan(input, authorizationContext);
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext: authorizationContext });
  const authorizedServerFingerprint = loadAuthorizedOperationServerFingerprint({
    authorizedContext: authorizationContext,
    env,
  });
  const adapterOptions = buildPolicyDecisionAdapterOptions({
    repoRoot,
    args,
    authorizedServerFingerprint,
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
      adapter: createMysqlAutomationPolicyDecisionAdapter(connection, adapterOptions),
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

function assertL2PolicyDecisionCliPaths({ operationId, inputArgument, outputArgument }) {
  const prefix = `reports/authorization/canonical/${operationId}`;
  const inputMatch = new RegExp(`^${escapeRegExp(prefix)}(?:\\.([a-z0-9]+(?:-[a-z0-9]+)*))?\\.input\\.json$`).exec(inputArgument);
  const outputMatch = new RegExp(`^${escapeRegExp(prefix)}(?:\\.([a-z0-9]+(?:-[a-z0-9]+)*))?\\.result\\.json$`).exec(outputArgument);
  if (!inputMatch || !outputMatch || inputMatch[1] !== outputMatch[1]) {
    throw new Error('L2 policy decision input/output paths must use the exact operation identity and one matching retry label');
  }
  return inputMatch[1] ?? null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Translate the CLI's explicit read-only evidence inputs into the adapter
 * contract.  The decision packet and all writable/publication paths remain
 * bound to the caller worktree; an evidence root is only an opt-in read root
 * for historical database rows.  Historical dispositions additionally bind
 * to the live server fingerprint carried by the authorized packet.
 */
export function buildPolicyDecisionAdapterOptions({
  repoRoot = process.cwd(),
  args = {},
  authorizedServerFingerprint = null,
} = {}) {
  const historicalDispositionPaths = normalizeHistoricalDispositionPaths([
    args?.['historical-source-hash-disposition']
      ?? args?.['historical-disposition-paths']
      ?? args?.['historical-disposition'],
  ]);
  return Object.freeze({
    repoRoot: path.resolve(repoRoot),
    databaseEvidenceRoot: args?.['database-evidence-root'] ?? null,
    historicalEvidenceRoot: args?.['historical-evidence-root'] ?? null,
    evidenceRoot: args?.['evidence-root'] ?? null,
    historicalSourceHashDispositionPaths: historicalDispositionPaths,
    historicalDispositionServerFingerprint: historicalDispositionPaths.length > 0
      ? authorizedServerFingerprint
      : null,
  });
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
      || result.policySetHash !== (proposal.policyArtifactTargetPolicySetHash ?? proposal.targetPolicySetHash)
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
      || artifact?.targetPolicySetHash !== (input.policyArtifactTargetPolicySetHash ?? input.targetPolicySetHash)
      || artifact?.currentPolicySetHash !== (input.policyArtifactCurrentPolicySetHash ?? proposal.currentPolicySetHash)) {
    throw new Error('L2 policy artifact identity does not match the proposal');
  }
  if (stableJson(artifact.currentPolicy) !== stableJson(proposal.currentPolicy)
      || artifact.currentPolicySetHash !== (proposal.policyArtifactCurrentPolicySetHash ?? proposal.currentPolicySetHash)
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
      || proposal.l1EvidencePolicySetHash !== input.l1EvidencePolicySetHash
      || proposal.policyArtifactCurrentPolicySetHash !== input.policyArtifactCurrentPolicySetHash
      || proposal.policyArtifactTargetPolicySetHash !== input.policyArtifactTargetPolicySetHash
      || stableJson(proposal.promotionCurrentPolicyRows) !== stableJson(input.promotionCurrentPolicyRows)
      || stableJson(proposal.promotionTargetPolicyRows) !== stableJson(input.promotionTargetPolicyRows)
      || stableJson(proposal.serialTransition) !== stableJson(input.serialTransition)
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

function validateSerialL2Input(input, operationId) {
  const serialTransition = assertL2SerialTransition(input.serialTransition, {
    domainId: input.domainId,
    operationId,
  });
  return {
    serialTransition,
    promotionCurrentPolicyRows: normalizePolicySetRows(
      input.promotionCurrentPolicyRows,
      'promotion current policy rows',
    ),
    promotionTargetPolicyRows: normalizePolicySetRows(
      input.promotionTargetPolicyRows,
      'promotion target policy rows',
    ),
    policyArtifactCurrentPolicySetHash: requireHash(
      input.policyArtifactCurrentPolicySetHash,
      'policy artifact current policy-set provenance',
    ),
    policyArtifactTargetPolicySetHash: requireHash(
      input.policyArtifactTargetPolicySetHash,
      'policy artifact target policy-set provenance',
    ),
  };
}

function normalizePolicySetRows(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} are required`);
  const seen = new Set();
  const rows = value.map((row) => {
    const domainId = requireText(row?.domainId, `${label} domainId`);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(domainId) || seen.has(domainId)) {
      throw new Error(`${label} contain duplicate or invalid domains`);
    }
    seen.add(domainId);
    const policyVersion = Number(row?.policyVersion);
    if (!Number.isSafeInteger(policyVersion) || policyVersion < 1) {
      throw new Error(`${label} policyVersion is invalid`);
    }
    const policyHash = requireHash(row?.policyHash, `${label} policyHash`);
    return { domainId, policyVersion, policyHash };
  });
  return rows.sort((left, right) => left.domainId.localeCompare(right.domainId));
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
  return operationId === 'automation-biomes-l2-promotion'
    || isEightDomainL2Operation(operationId)
    || isL2PolicyStableReauthorizationOperation(operationId);
}

function assertL2ReauthorizationExecutionInput({ repoRoot, operationId, input }) {
  assertL2PolicyStableReauthorizationInput(input, { now: input.generatedAt ?? new Date().toISOString() });
  const proposalPath = String(input.proposalPath ?? '').replaceAll('\\', '/');
  const prefix = `reports/authorization/canonical/${operationId}/`;
  if (!proposalPath.startsWith(prefix)
      || !/^[a-f0-9]{64}\/proposal\.json$/.test(proposalPath.slice(prefix.length))) {
    throw new Error('L2 reauthorization proposal path is not content-addressed');
  }
  const proposalHash = requireHash(input.proposalHash, 'proposalHash');
  if (proposalPath.slice(prefix.length, prefix.length + 64) !== proposalHash.slice(7)) {
    throw new Error('L2 reauthorization proposal path content address does not match proposalHash');
  }
  const confined = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, proposalPath),
    label: 'L2 reauthorization proposal',
  });
  if ((fs.lstatSync(confined).mode & 0o077) !== 0) throw new Error('L2 reauthorization proposal must be private');
  const bytes = fs.readFileSync(confined);
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== requireHash(input.proposalSha256, 'proposalSha256')) {
    throw new Error('L2 reauthorization proposal file hash drifted');
  }
  let proposal;
  try { proposal = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('L2 reauthorization proposal must be valid JSON'); }
  if (proposal?.operationId !== operationId || proposal?.proposalHash !== proposalHash
      || proposal?.proposalOnly !== true || proposal?.policyUpdate !== false
      || proposal?.currentPolicy?.policyHash !== input.currentPolicy?.policyHash
      || proposal?.currentPolicySetHash !== input.currentPolicy?.policySetHash) {
    throw new Error('L2 reauthorization proposal identity is invalid');
  }
  return true;
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

const MYSQL_DATETIME_TIME_ZONE = process.env.TERRAPEDIA_DB_TIME_ZONE ?? 'Asia/Shanghai';

export function toMysqlTimestamp(value) {
  const timestamp = new Date(requireTimestamp(value, 'timestamp'));
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: MYSQL_DATETIME_TIME_ZONE,
    calendar: 'iso8601',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function mysqlDateTimeToUtcIso(value) {
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
    timeZone: MYSQL_DATETIME_TIME_ZONE,
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
