import { createHash } from 'node:crypto';

import { assertBuffLandingMutationPlan } from '../landing/buff-bounded-landing-mutation.mjs';

const TABLES = Object.freeze([
  'relation_buffs',
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export function buildBuffFullChainExecutionEnvelope({
  candidate,
  landingRows,
  maintRows,
  pageEvidenceByInternalName,
  runtimeManagedImagePolicySha256,
  maintMutation,
  landingMutation = null,
} = {}) {
  assertCandidate(candidate);
  assertMaintMutation(maintMutation);
  const landingPlan = landingMutation == null ? null : assertBuffLandingMutationPlan(landingMutation) && landingMutation;
  const landings = assertLandingRows(landingRows, { allowEmpty: landingPlan != null });
  if (landingPlan && landings.length > 0) {
    throw new Error('Buff deferred landing mutation cannot also freeze persisted landing rows');
  }
  const maint = assertMaintRows(maintRows);
  const evidence = normalizeEvidence(pageEvidenceByInternalName);
  const relationRows = candidate.expectedRows.relation_buffs;
  const names = relationRows.map((row) => String(row?.internal_name ?? '').trim()).filter(Boolean);
  if (new Set(names).size !== names.length || names.length === 0) {
    throw new Error('Buff full-chain candidate must contain unique relation identities');
  }
  for (const name of names) {
    if (!evidence.has(name)) throw new Error(`Buff page immunity evidence is missing for ${name}`);
    const matches = maint.filter((row) => row.internal_name === name);
    if (matches.length !== 1) throw new Error(`frozen maint identity is missing for ${name}`);
  }
  if (evidence.size !== names.length) throw new Error('Buff page immunity evidence contains unrelated identities');
  if (runtimeManagedImagePolicySha256 !== candidate.managedImageUrlPrefixesSha256) {
    throw new Error('Buff managed image policy drifted between proposal and executor');
  }
  return deepFreeze({
    schemaVersion: 'buff-full-chain-execution/v1',
    domainId: 'buffs',
    executable: landingPlan == null,
    executionBlocker: landingPlan ? 'deferred-lineage-integration-required' : null,
    tables: [...TABLES],
    candidateSha256: hashCanonical(candidate),
    frozenLandingIdentity: {
      table: 'source_dataset_landings',
      rowCount: landings.length,
      sha256: hashCanonical(landings),
      rows: landings,
    },
    frozenMaintIdentity: {
      table: 'maint_buffs',
      rowCount: maint.length,
      sha256: hashCanonical(maint),
      rows: maint,
    },
    pageEvidenceCount: evidence.size,
    pageEvidenceSha256: hashCanonical([...evidence.entries()]),
    managedImagePolicySha256: candidate.managedImageUrlPrefixesSha256,
    upstream: landingPlan ? { landing: clone(landingPlan), maint: maintMutation } : { maint: maintMutation },
    mutation: candidate,
  });
}

function assertMaintMutation(plan) {
  if (!plan || plan.schemaVersion !== 'buff-maint-mutation-plan/v1'
      || plan.executable !== false || plan.executionBlocker !== 'locked-upstream-executor-required'
      || plan.table !== 'terria_v1_maint.maint_buffs' || plan.destructiveClear !== false
      || !Array.isArray(plan.inserts) || !Array.isArray(plan.updates)
      || !Array.isArray(plan.unchanged) || !Array.isArray(plan.preserved)
      || !Array.isArray(plan.deletes) || plan.deletes.length !== 0) {
    throw new Error('Buff maint mutation plan is required and must be bounded');
  }
  const columns = new Set(['source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider',
    'source_page', 'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page',
    'landing_content_hash', 'landing_fetched_at', 'landing_parsed_at', 'module_generated_at', 'terraria_version',
    'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size', 'width', 'height', 'flags_json',
    'raw_json', 'status', 'deleted']);
  for (const row of plan.inserts) {
    if (!row || Object.keys(row).some(key => !columns.has(key))
        || !Number.isSafeInteger(Number(row.source_id)) || typeof row.internal_name !== 'string') {
      throw new Error('Buff maint mutation insert columns or identity are invalid');
    }
  }
  for (const change of plan.updates) {
    if (!change?.before || !change?.after || !Array.isArray(change.changedColumns)
        || change.changedColumns.length === 0 || change.changedColumns.some(column => !columns.has(column)
          || ['source_id', 'id'].includes(column) || !Object.hasOwn(change.after, column))) {
      throw new Error('Buff maint mutation update columns or identity are invalid');
    }
  }
}

function assertCandidate(candidate) {
  if (!candidate || candidate.schemaVersion !== 'buff-incremental-candidate/v1') {
    throw new Error('Buff full-chain candidate is required');
  }
  if (!Array.isArray(candidate.tables)
      || JSON.stringify(candidate.tables) !== JSON.stringify(TABLES)) {
    throw new Error('Buff full-chain candidate table scope is invalid');
  }
  if (candidate.executable !== false || candidate.destructiveClear !== false
      || !Array.isArray(candidate.deletes) || candidate.deletes.length !== 0) {
    throw new Error('Buff full-chain candidate must be bounded and non-destructive');
  }
  if (!candidate.expectedRows || !Array.isArray(candidate.expectedRows.relation_buffs)) {
    throw new Error('Buff full-chain candidate relation projection is missing');
  }
  if (!HASH_PATTERN.test(String(candidate.managedImageUrlPrefixesSha256 ?? ''))) {
    throw new Error('Buff managed image policy hash is missing');
  }
}

function assertLandingRows(rows, { allowEmpty = false } = {}) {
  if (!Array.isArray(rows) || !allowEmpty && rows.length === 0) throw new Error('frozen Buff landing rows are required');
  for (const row of rows) {
    if (!Number.isSafeInteger(Number(row?.id)) || Number(row.id) < 1
        || row.dataset_type !== 'buffs_raw' || !CONTENT_HASH_PATTERN.test(String(row.content_hash ?? ''))) {
      throw new Error('frozen Buff landing identity is invalid');
    }
  }
  return rows.map(clone);
}

function assertMaintRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('frozen Buff maint rows are required');
  const ids = new Set();
  const sourceIds = new Set();
  const internalNames = new Set();
  for (const row of rows) {
    if (!Number.isSafeInteger(Number(row?.id)) || Number(row.id) < 1
        || !Number.isSafeInteger(Number(row?.source_id)) || Number(row.source_id) < 1
        || typeof row.internal_name !== 'string' || !row.internal_name.trim()) {
      throw new Error('frozen Buff maint identity is invalid');
    }
    if (ids.has(Number(row.id)) || sourceIds.has(Number(row.source_id)) || internalNames.has(row.internal_name)) {
      throw new Error('frozen Buff maint identity is duplicated');
    }
    ids.add(Number(row.id));
    sourceIds.add(Number(row.source_id));
    internalNames.add(row.internal_name);
  }
  return rows.map(clone);
}

function normalizeEvidence(value) {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value ?? {});
  const result = new Map();
  for (const [name, row] of entries) {
    if (typeof name !== 'string' || !name.trim() || !row || !Number.isSafeInteger(Number(row.revisionId))
        || Number(row.revisionId) < 1 || typeof row.revisionTimestamp !== 'string'
        || !Number.isFinite(Date.parse(row.revisionTimestamp))) {
      throw new Error('Buff page immunity evidence revision identity is invalid');
    }
    result.set(name, clone(row));
  }
  return result;
}

function hashCanonical(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export { TABLES as BUFF_FULL_CHAIN_TABLES };
