import { createHash } from 'node:crypto';

const RECORD_KEY = /^[a-f0-9]{64}$/;

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function assertRows(rows, label, selected) {
  if (!Array.isArray(rows)) throw new Error(`${label} rows are required`);
  const keys = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`${label} row ${index} is invalid`);
    const ownerId = Number(row.owner_id);
    if (!Number.isSafeInteger(ownerId) || !selected.has(ownerId)) {
      throw new Error(`${label} row ${index} owner is outside selected Armor member scope`);
    }
    if (!RECORD_KEY.test(String(row.record_key ?? ''))) {
      throw new Error(`${label} row ${index} record_key is invalid`);
    }
    if (keys.has(row.record_key)) throw new Error(`duplicate ${label} record_key`);
    keys.add(row.record_key);
    return { ...row };
  });
}

function equalRow(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

/**
 * Build a no-write plan for replacing stale Armor equipment-effect keys.
 * Old rows are retained in full and are retired with status/deleted semantics;
 * callers must apply the plan through a governed executor.
 */
export function buildArmorEffectKeyRetirementPlan({ selectedMemberIds, currentRows, proposedRows } = {}) {
  if (!Array.isArray(selectedMemberIds) || selectedMemberIds.length === 0) {
    throw new Error('selected Armor member scope is required');
  }
  const selected = new Set(selectedMemberIds.map(Number));
  if ([...selected].some((id) => !Number.isSafeInteger(id) || id <= 0) || selected.size !== selectedMemberIds.length) {
    throw new Error('selected Armor member scope is invalid or duplicated');
  }
  const current = assertRows(currentRows, 'current', selected);
  const proposed = assertRows(proposedRows, 'proposed', selected);
  const currentByKey = new Map(current.map((row) => [row.record_key, row]));
  const proposedByKey = new Map(proposed.map((row) => [row.record_key, row]));
  const retire = current
    .filter((row) => !proposedByKey.has(row.record_key))
    .map((row) => ({ ...row, retireMode: 'status_deleted' }));
  const insert = proposed.filter((row) => !currentByKey.has(row.record_key)).map((row) => ({ ...row }));
  const update = proposed
    .filter((row) => currentByKey.has(row.record_key) && !equalRow(currentByKey.get(row.record_key), row))
    .map((row) => ({ before: { ...currentByKey.get(row.record_key) }, after: { ...row } }));
  const unchanged = proposed
    .filter((row) => currentByKey.has(row.record_key) && equalRow(currentByKey.get(row.record_key), row))
    .map((row) => ({ ...row }));
  const plan = {
    schemaVersion: 1,
    planKind: 'armor_effect_key_retirement',
    selectedMemberIds: [...selected].sort((a, b) => a - b),
    retire,
    insert,
    update,
    unchanged,
    deletes: [],
  };
  return { ...plan, planSha256: hash(plan) };
}

export const ARMOR_EFFECT_RETIREMENT_WRITE_TARGETS = Object.freeze([
  'relation.relation_equipment_effect_attributes.status_deleted',
  'relation.relation_equipment_effect_attributes.insert',
]);
