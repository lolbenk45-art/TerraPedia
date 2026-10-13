#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import { SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';
import { assertRepositoryPathConfinement, assertRepositoryOrdinaryFile } from '../lib/private-repository-path.mjs';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SHIMMER_CROSS_OWNER_POLICY_TABLES = new Set(['world_contexts', 'entity_source_snapshots']);
const DOMAIN_TABLES = Object.freeze({
  items: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
  npcs: [{ databaseRole: 'local', table: 'npcs', fieldGroup: 'npc_owned' }],
  projectiles: [{ databaseRole: 'local', table: 'projectiles', fieldGroup: 'all_columns' }],
  armor_sets: [
    { databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' },
  ],
  buffs: [
    { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
  ],
  audio: [
    { databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'audio_asset_links', fieldGroup: 'all_columns' },
  ],
  bosses: [
    { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'npcs', fieldGroup: 'boss_owned' },
  ],
  shimmer: [
    ...SHIMMER_PARTITION_SCOPES
      .filter((scope) => SHIMMER_CROSS_OWNER_POLICY_TABLES.has(scope.table))
      .map((scope) => ({
        databaseRole: scope.databaseRole,
        table: scope.table,
        fieldGroup: scope.fieldGroup,
        logicalPredicateHash: scope.logicalPredicateHash,
      })),
    { databaseRole: 'local', table: 'shimmer_item_transforms', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'shimmer_decraft_rules', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'shimmer_entity_transforms', fieldGroup: 'all_columns' },
    { databaseRole: 'local', table: 'shimmer_npc_transforms', fieldGroup: 'all_columns' },
  ],
});
const POLICY_SET_DOMAIN_IDS = new Set([
  ...Object.keys(DOMAIN_TABLES),
  'biomes',
  'crawler_v2_scheduler',
]);

export function buildL2PolicyCeilingArtifact({
  domainId,
  currentPolicy,
  currentPolicyRows,
  targetPolicyVersion,
  ceiling,
  generatedAt = new Date().toISOString(),
} = {}) {
  const domain = requireDomain(domainId);
  const current = normalizeCurrentPolicy(currentPolicy, domain);
  const rows = normalizePolicyRows(currentPolicyRows);
  const currentRow = rows.find((row) => row.domainId === domain);
  if (!currentRow || currentRow.policyVersion !== current.policyVersion || currentRow.policyHash !== current.policyHash) {
    throw new Error('current policy rows do not match the exact domain policy');
  }
  const version = requirePositiveInteger(targetPolicyVersion, 'targetPolicyVersion');
  if (version <= current.policyVersion) throw new Error('targetPolicyVersion must be newer than current policy');
  const policyJson = normalizeCeiling(ceiling, domain);
  const policyHash = computePolicyHash(policyJson);
  const targetRows = rows.map((row) => row.domainId === domain
    ? { domainId: domain, policyVersion: version, policyHash }
    : row);
  const payload = {
    schemaVersion: 1,
    artifactKind: 'l2-policy-ceiling',
    status: 'candidate',
    proposalOnly: true,
    generatedAt: requireTimestamp(generatedAt),
    domainId: domain,
    currentPolicy: current,
    currentPolicyRows: rows,
    targetPolicy: { policyVersion: version, level: 'L2', policyHash, policyJson },
    currentPolicySetHash: computePolicySetHash(rows),
    targetPolicySetHash: computePolicySetHash(targetRows),
    approval: null,
  };
  return Object.freeze({ ...payload, artifactHash: hashPayload(payload) });
}

export function approveL2PolicyCeilingArtifact({ artifact, actor, approvalReference, approvedAt } = {}) {
  assertCandidate(artifact);
  const approval = {
    actor: requireText(actor, 'approval actor'),
    reference: requireText(approvalReference, 'approval reference'),
    approvedAt: requireTimestamp(approvedAt ?? new Date().toISOString()),
  };
  const payload = { ...artifact, status: 'approved', proposalOnly: false, approval };
  delete payload.artifactHash;
  return Object.freeze({ ...payload, artifactHash: hashPayload(payload) });
}

export function assertApprovedL2PolicyCeilingArtifact(artifact) {
  assertArtifactEnvelope(artifact, 'approved', false);
  const { artifactHash, ...payload } = artifact;
  if (artifactHash !== hashPayload(payload)) throw new Error('L2 policy ceiling artifact hash drifted');
  if (!artifact.approval?.actor || !artifact.approval?.reference || !artifact.approval?.approvedAt) {
    throw new Error('L2 policy ceiling approval identity is incomplete');
  }
  const rebuilt = buildL2PolicyCeilingArtifact({
    domainId: artifact.domainId,
    currentPolicy: artifact.currentPolicy,
    currentPolicyRows: artifact.currentPolicyRows ?? [artifact.currentPolicy],
    targetPolicyVersion: artifact.targetPolicy.policyVersion,
    ceiling: artifact.targetPolicy.policyJson,
    generatedAt: artifact.generatedAt,
  });
  if (rebuilt.currentPolicySetHash !== artifact.currentPolicySetHash
      || rebuilt.targetPolicy.policyHash !== artifact.targetPolicy.policyHash
      || rebuilt.targetPolicySetHash !== artifact.targetPolicySetHash) {
    throw new Error('L2 policy ceiling artifact policy set or hash drifted');
  }
  return true;
}

export function writeL2PolicyCeilingArtifact({ repoRoot = process.cwd(), artifact } = {}) {
  assertApprovedL2PolicyCeilingArtifact(artifact);
  const root = path.resolve(repoRoot);
  const outputPath = path.resolve(root, 'reports/authorization/canonical/l2-policy-ceiling', artifact.domainId, artifact.artifactHash.slice(7), 'artifact.json');
  const confined = assertRepositoryPathConfinement({ repoRoot: root, filePath: outputPath, label: 'L2 policy ceiling artifact', createParent: true });
  assertNoExistingEntry(confined, 'L2 policy ceiling artifact');
  const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.writeFileSync(confined, bytes, { mode: 0o600, flag: 'wx' });
  return Object.freeze({ path: path.relative(root, confined).replaceAll('\\', '/'), sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });
}

export function readL2PolicyCeilingArtifact({ repoRoot = process.cwd(), artifactPath, requireApproved = true } = {}) {
  const root = path.resolve(repoRoot);
  const normalized = requireText(artifactPath, 'artifactPath').replaceAll('\\', '/');
  const match = /^reports\/authorization\/canonical\/l2-policy-ceiling\/([a-z][a-z0-9_]{0,63})\/([a-f0-9]{64})\/artifact\.json$/.exec(normalized);
  if (!match) {
    throw new Error('policy ceiling artifact path is not content-addressed');
  }
  const absolute = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, normalized), label: 'L2 policy ceiling artifact' });
  if ((fs.lstatSync(absolute).mode & 0o077) !== 0) {
    throw new Error('L2 policy ceiling artifact must be private');
  }
  let artifact;
  try { artifact = JSON.parse(fs.readFileSync(absolute, 'utf8')); } catch (error) { throw new Error(`policy ceiling artifact is invalid JSON: ${error.message}`); }
  if (artifact?.domainId !== match[1] || artifact?.artifactHash !== `sha256:${match[2]}`) {
    throw new Error('policy ceiling artifact path does not match its artifact hash');
  }
  if (requireApproved) assertApprovedL2PolicyCeilingArtifact(artifact);
  return artifact;
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

function assertCandidate(artifact) {
  assertArtifactEnvelope(artifact, 'candidate', true);
  const { artifactHash, ...payload } = artifact;
  if (artifactHash !== hashPayload(payload)) throw new Error('L2 policy ceiling artifact hash drifted');
}

function assertArtifactEnvelope(artifact, status, proposalOnly) {
  if (!artifact || artifact.schemaVersion !== 1 || artifact.artifactKind !== 'l2-policy-ceiling'
      || artifact.status !== status || artifact.proposalOnly !== proposalOnly) {
    throw new Error(`${status} L2 policy ceiling artifact is required`);
  }
}

function normalizeCurrentPolicy(value, domain) {
  if (!value || value.domainId !== domain || value.level !== 'L1' || value.operationalState !== 'ACTIVE') {
    throw new Error('current policy must be exact L1/ACTIVE');
  }
  return {
    domainId: domain,
    policyVersion: requirePositiveInteger(value.policyVersion, 'current policyVersion'),
    policyHash: requireHash(value.policyHash, 'current policyHash'),
    level: 'L1',
    operationalState: 'ACTIVE',
  };
}

function normalizePolicyRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('current policy rows are required');
  const seen = new Set();
  return rows.map((row) => {
    const domainId = requirePolicySetDomain(row?.domainId);
    if (seen.has(domainId)) throw new Error('current policy rows contain duplicate domains');
    seen.add(domainId);
    return {
      domainId,
      policyVersion: requirePositiveInteger(row.policyVersion, `${domainId} policyVersion`),
      policyHash: requireHash(row.policyHash, `${domainId} policyHash`),
    };
  });
}

function normalizeCeiling(value, domain) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('L2 ceiling must be an object');
  const result = {
    schemaVersion: 1,
    level: 'L2',
    ratioInsertCap: requireRatio(value.ratioInsertCap, 'ratioInsertCap'),
    ratioUpdateCap: requireRatio(value.ratioUpdateCap, 'ratioUpdateCap'),
    ratioRelationshipDeleteCap: requireRatio(value.ratioRelationshipDeleteCap, 'ratioRelationshipDeleteCap'),
    requireSnapshot: value.requireSnapshot,
    absoluteInsertCap: requireNonNegativeInteger(value.absoluteInsertCap, 'absoluteInsertCap'),
    absoluteUpdateCap: requireNonNegativeInteger(value.absoluteUpdateCap, 'absoluteUpdateCap'),
    absoluteRelationshipDeleteCap: requireNonNegativeInteger(value.absoluteRelationshipDeleteCap, 'absoluteRelationshipDeleteCap'),
    absoluteDisableCap: requireNonNegativeInteger(value.absoluteDisableCap, 'absoluteDisableCap'),
    ratioDisableCap: requireRatio(value.ratioDisableCap, 'ratioDisableCap'),
    sourceFreshnessMaxAgeMinutes: requireNonNegativeInteger(value.sourceFreshnessMaxAgeMinutes, 'sourceFreshnessMaxAgeMinutes'),
    anomalyAction: value.anomalyAction,
    ownedTables: normalizeOwnedTables(value.ownedTables, domain),
  };
  if (result.requireSnapshot !== true || result.anomalyAction !== 'CIRCUIT_OPEN') {
    throw new Error('L2 ceiling snapshot and anomaly behavior are required');
  }
  return result;
}

function normalizeOwnedTables(value, domain) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('L2 ceiling ownedTables are required');
  const expected = [...DOMAIN_TABLES[domain]].sort((left, right) => (
    `${left.table}:${left.fieldGroup}`.localeCompare(`${right.table}:${right.fieldGroup}`)
  ));
  const normalized = value.map((entry) => {
    const databaseRole = requireText(entry?.databaseRole, 'owned table databaseRole');
    const table = requireIdentifier(entry?.table, 'owned table table');
    const fieldGroup = requireIdentifier(entry?.fieldGroup ?? 'all_columns', 'owned table fieldGroup');
    const logicalPredicateHash = entry?.logicalPredicateHash == null ? null : requireHash(entry.logicalPredicateHash, 'owned table logicalPredicateHash');
    return { databaseRole, table, fieldGroup, ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }) };
  }).sort((left, right) => `${left.table}:${left.fieldGroup}`.localeCompare(`${right.table}:${right.fieldGroup}`));
  if (normalized.length !== expected.length || normalized.some((entry, index) => (
    entry.databaseRole !== expected[index].databaseRole || entry.table !== expected[index].table || entry.fieldGroup !== expected[index].fieldGroup
  ))) {
    throw new Error(`L2 ceiling owned table scope is invalid for ${domain}`);
  }
  if ((domain === 'npcs' || domain === 'bosses')
      && normalized.some((entry) => entry.table === 'npcs' && !entry.logicalPredicateHash)) {
    throw new Error('shared npcs ownership requires a logical predicate hash');
  }
  if (domain === 'shimmer'
      && normalized.some((entry) => SHIMMER_CROSS_OWNER_POLICY_TABLES.has(entry.table) && !entry.logicalPredicateHash)) {
    throw new Error('Shimmer cross-owner ownership requires a logical predicate hash');
  }
  return normalized;
}

function requireDomain(value) {
  const domain = requireText(value, 'domainId');
  if (!Object.hasOwn(DOMAIN_TABLES, domain)) throw new Error(`unsupported L2 domain: ${domain}`);
  return domain;
}

function requirePolicySetDomain(value) {
  const domain = requireText(value, 'policy set domainId');
  if (!POLICY_SET_DOMAIN_IDS.has(domain)) throw new Error(`unsupported policy set domain: ${domain}`);
  return domain;
}

function requireIdentifier(value, label) {
  const text = requireText(value, label);
  if (!/^[a-z][a-z0-9_]{0,95}$/.test(text)) throw new Error(`${label} is invalid`);
  return text;
}
function requireHash(value, label) { if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`); return value; }
function requirePositiveInteger(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`); return number; }
function requireNonNegativeInteger(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`); return number; }
function requireRatio(value, label) { const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${label} must be between 0 and 1`); return number; }
function requireText(value, label) { const text = String(value ?? '').trim(); if (!text) throw new Error(`${label} is required`); return text; }
function requireTimestamp(value) { const text = requireText(value, 'timestamp'); if (!Number.isFinite(Date.parse(text))) throw new Error('timestamp must be an ISO timestamp'); return text; }
function hashPayload(value) { return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`; }
function canonicalJson(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`; }
