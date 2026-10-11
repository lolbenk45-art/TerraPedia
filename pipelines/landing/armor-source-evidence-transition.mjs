import { createHash } from 'node:crypto';

export const ARMOR_SOURCE_EVIDENCE_DATASET_TYPES = Object.freeze([
  'armor_attributes_raw',
  'armor_sets_raw',
  'armor_set_images_raw',
]);
const HASH = /^[a-f0-9]{64}$/i;
const SCHEMA = 'armor-source-evidence-transition/v1';

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function hash(value) {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`Armor ${label} is required`);
  return value;
}

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function collationKey(value) {
  // Conservative pre-SQL screen only; the executor still must lock/check the
  // actual MySQL collation range (Unicode case folding is not MySQL equality).
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function identity(row) {
  return [row.dataset_type, row.provider, row.source_key, row.source_page].map(collationKey).join('\u0000');
}

function rawIdentity(row) {
  return [row.dataset_type, row.provider, row.source_key, row.source_page].join('\u0000');
}

function validateRow(row, label, { incoming = false, current = false, marker = 'current' } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Armor ${label} must be an object`);
  if (!ARMOR_SOURCE_EVIDENCE_DATASET_TYPES.includes(row.dataset_type)) throw new Error(`Armor ${label} dataset partition is invalid`);
  text(row.provider, `${label} provider`);
  text(row.source_key, `${label} source_key`);
  text(row.source_page, `${label} source_page`);
  text(row.source_kind, `${label} source_kind`);
  if (!HASH.test(row.content_hash ?? '')) throw new Error(`Armor ${label} content hash is invalid`);
  text(row.payload_json, `${label} payload_json`);
  text(row.producer_id, `${label} producer_id`);
  text(row.producer_version, `${label} producer_version`);
  text(row.producer_run_key, `${label} producer_run_key`);
  if (current ? !['source_evidence', 'legacy_compat'].includes(row.artifact_role) : row.artifact_role !== 'source_evidence') {
    throw new Error(`Armor ${label} must be source_evidence`);
  }
  if (row.bootstrap_manifest_hash != null) throw new Error(`Armor ${label} cannot carry bootstrap metadata`);
  if (marker === 'current' && (row.is_current !== 1 || row.current_slot !== 1)) throw new Error(`Armor ${label} must be current source evidence`);
  if (marker === 'retired' && (row.is_current !== 0 || row.current_slot !== null)) throw new Error(`Armor ${label} must have a retired current marker`);
  if (incoming && row.id != null && !positiveId(row.id)) throw new Error(`Armor ${label} id is invalid`);
}

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function validateBaseline(currentRows) {
  const currentKeys = new Set();
  const ids = new Set();
  for (const [index, row] of currentRows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Armor current landing row ${index} is invalid`);
    if (!positiveId(row.id) || ids.has(row.id)) throw new Error('Armor baseline ID is invalid or duplicate');
    ids.add(row.id);
    if (!ARMOR_SOURCE_EVIDENCE_DATASET_TYPES.includes(row.dataset_type)) continue;
    if (![0, 1].includes(row.is_current) || row.current_slot !== (row.is_current === 1 ? 1 : null)) {
      throw new Error('Armor baseline current marker is invalid');
    }
    if (row.is_current === 1) {
      validateRow(row, `current row ${index}`, { current: true });
      const key = identity(row);
      if (currentKeys.has(key)) throw new Error(`Armor current source evidence identity is duplicate: ${key}`);
      currentKeys.add(key);
    }
  }
}

function validateCollections(currentRows, incomingRows) {
  if (!Array.isArray(currentRows) || !Array.isArray(incomingRows) || incomingRows.length === 0) {
    throw new Error('Armor source evidence currentRows and incomingRows are required');
  }
  validateBaseline(currentRows);
  const incomingKeys = new Set();
  for (const [index, row] of incomingRows.entries()) {
    validateRow(row, `incoming row ${index}`, { incoming: true });
    const key = identity(row);
    if (incomingKeys.has(key)) throw new Error(`Armor incoming source evidence identity collision: ${key}`);
    incomingKeys.add(key);
  }
}

export function buildArmorSourceEvidenceTransition({ currentRows, incomingRows } = {}) {
  validateCollections(currentRows, incomingRows);
  const current = currentRows.map(clone);
  const incoming = incomingRows.map(clone);
  const consumed = new Set();
  const demotions = [];
  const inserts = [];
  const unchanged = [];
  for (const row of incoming) {
    const key = identity(row);
    const currentMatches = current.filter((candidate) => Number(candidate.is_current) === 1 && identity(candidate) === key);
    if (currentMatches.length > 1) throw new Error(`Armor current source evidence identity is duplicate: ${key}`);
    const existing = currentMatches[0] ?? null;
    if (existing && rawIdentity(existing) !== rawIdentity(row)) {
      throw new Error(`Armor source evidence identity has a collation-equivalent byte collision: ${key}`);
    }
    if (row.id != null) {
      if (!existing || existing.id !== row.id) throw new Error(`Armor incoming row claims an unverified allocated ID: ${key}`);
      if (existing.content_hash !== row.content_hash || existing.artifact_role !== 'source_evidence') {
        throw new Error(`Armor source evidence row with an existing ID is immutable: ${key}`);
      }
    }
    if (existing && existing.content_hash === row.content_hash && existing.artifact_role === 'source_evidence') {
      unchanged.push(existing);
      consumed.add(existing.id ?? key);
      continue;
    }
    if (existing) {
      const after = { ...existing, is_current: 0, current_slot: null };
      demotions.push({ identity: key, before: existing, after });
      consumed.add(existing.id ?? key);
    }
    const { id: _id, current_slot: _slot, ...insert } = row;
    inserts.push(insert);
  }
  const preserved = current.filter((row) => !consumed.has(row.id ?? identity(row)));
  const result = {
    schemaVersion: SCHEMA,
    executable: false,
    writeMode: 'insert-only-source-evidence-with-current-marker-demotion',
    requiresCurrentMarkerLock: true,
    datasetTypes: [...ARMOR_SOURCE_EVIDENCE_DATASET_TYPES],
    deletes: [],
    demotions,
    inserts,
    unchanged,
    preserved,
    summary: { demotions: demotions.length, inserts: inserts.length, unchanged: unchanged.length, preserved: preserved.length },
  };
  return freeze({ ...result, transitionSha256: hash(result) });
}

export function validateArmorSourceEvidenceTransition(result) {
  if (!result || result.schemaVersion !== SCHEMA || result.executable !== false
      || result.writeMode !== 'insert-only-source-evidence-with-current-marker-demotion'
      || result.requiresCurrentMarkerLock !== true
      || stable(result.datasetTypes) !== stable(ARMOR_SOURCE_EVIDENCE_DATASET_TYPES)
      || !Array.isArray(result.deletes) || result.deletes.length !== 0) {
    throw new Error('Armor source evidence transition identity is invalid');
  }
  if (['demotions', 'inserts', 'unchanged', 'preserved'].some(field => !Array.isArray(result[field]))) {
    throw new Error('Armor source evidence transition collections are required');
  }
  if (!result.summary || result.summary.demotions !== result.demotions.length
      || result.summary.inserts !== result.inserts.length
      || result.summary.unchanged !== result.unchanged.length
      || result.summary.preserved !== result.preserved.length) {
    throw new Error('Armor source evidence transition summary drifted');
  }
  const assertUnique = (row, label, identities) => {
    const key = identity(row);
    if (identities.has(key)) throw new Error(`Armor source evidence transition identity is duplicate: ${key}`);
    identities.add(key);
    return key;
  };
  const insertIdentities = new Set();
  const unchangedIdentities = new Set();
  const demotionIdentities = new Set();
  for (const row of result.inserts) {
    if (!row || Object.hasOwn(row, 'id') || Object.hasOwn(row, 'current_slot') || row.is_current !== 1) {
      throw new Error('Armor transition insert must not carry generated ID/slot or a retired marker');
    }
    assertUnique(row, 'transition insert', insertIdentities);
    validateRow({ ...row, current_slot: 1 }, 'transition insert');
  }
  for (const row of result.unchanged) {
    assertUnique(row, 'transition unchanged', unchangedIdentities);
    validateRow(row, 'transition unchanged');
    if (insertIdentities.has(identity(row))) throw new Error('Armor inserted and unchanged current identities overlap');
  }
  for (const row of result.preserved) {
    if (!row || typeof row !== 'object') throw new Error('Armor transition preserved row is invalid');
  }
  for (const demotion of result.demotions) {
    if (!demotion || !demotion.before || !demotion.after) throw new Error('Armor transition demotion is invalid');
    assertUnique(demotion.before, 'transition demotion', demotionIdentities);
    validateRow(demotion.before, 'transition demotion before', { current: true });
    validateRow(demotion.after, 'transition demotion after', { current: true, marker: 'retired' });
    if (Number(demotion.after.is_current) !== 0 || demotion.after.current_slot !== null) {
      throw new Error('Armor demotion must clear the current marker only');
    }
    if (identity(demotion.before) !== demotion.identity || stable({ ...demotion.before, is_current: 0, current_slot: null }) !== stable(demotion.after)) {
      throw new Error('Armor demotion changed immutable landing evidence');
    }
    const replacement = result.inserts.find(row => identity(row) === demotion.identity);
    if (!replacement || rawIdentity(replacement) !== rawIdentity(demotion.before)) {
      throw new Error('Armor demotion requires an exact-identity replacement insert');
    }
    if (demotion.before.artifact_role === 'source_evidence' && demotion.before.content_hash === replacement.content_hash) {
      throw new Error('Armor transition demotes unchanged source evidence');
    }
  }
  validateBaseline([...result.demotions.map(change => change.before), ...result.unchanged, ...result.preserved]);
  const finalCurrentIdentities = new Set([...insertIdentities, ...unchangedIdentities]);
  for (const row of result.preserved) if (Number(row.is_current) === 1) {
    const key = identity(row);
    if (finalCurrentIdentities.has(key)) throw new Error('Armor preserved current identity overlaps replacement');
    finalCurrentIdentities.add(key);
  }
  const { transitionSha256: _ignored, ...body } = result;
  if (!/^sha256:[0-9a-f]{64}$/.test(result.transitionSha256 ?? '') || hash(body) !== result.transitionSha256) {
    throw new Error('Armor source evidence transition hash drifted');
  }
  return true;
}
