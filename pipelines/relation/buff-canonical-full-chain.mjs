import { createHash } from 'node:crypto';

const TABLES = Object.freeze([
  'relation_buffs',
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function buildBuffFullChainExecutionEnvelope({
  candidate,
  landingRows,
  maintRows,
  pageEvidenceByInternalName,
  runtimeManagedImagePolicySha256,
} = {}) {
  assertCandidate(candidate);
  const landings = assertLandingRows(landingRows);
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
    executable: true,
    executionBlocker: null,
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
    mutation: candidate,
  });
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

function assertLandingRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('frozen Buff landing rows are required');
  for (const row of rows) {
    if (!Number.isSafeInteger(Number(row?.id)) || Number(row.id) < 1
        || row.dataset_type !== 'buffs_raw' || !HASH_PATTERN.test(String(row.content_hash ?? ''))) {
      throw new Error('frozen Buff landing identity is invalid');
    }
  }
  return rows.map(clone);
}

function assertMaintRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('frozen Buff maint rows are required');
  for (const row of rows) {
    if (!Number.isSafeInteger(Number(row?.source_id)) || Number(row.source_id) < 1
        || typeof row.internal_name !== 'string' || !row.internal_name.trim()
        || typeof row.record_key !== 'string' || !row.record_key.trim()) {
      throw new Error('frozen Buff maint identity is invalid');
    }
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
