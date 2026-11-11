import crypto from 'node:crypto';

import { parseArmorSetBonuses } from '../fetch/armor-set-module-parser.mjs';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';

export function buildDependencyEvidence({ domain, sourcePayload, dependencyPayloads = {} } = {}) {
  if (domain === 'items') return buildItemsEvidence(sourcePayload);
  if (domain === 'armor_sets') return buildArmorEvidence(sourcePayload, dependencyPayloads.items);
  throw new Error(`unsupported dependency evidence domain: ${String(domain ?? '')}`);
}

function buildItemsEvidence(sourcePayload) {
  const records = normalizeItemRecords(sourcePayload);
  const seenKeys = new Set();
  const rows = [];
  let duplicateCount = 0;
  for (const record of records) {
    const stableKey = `item:${record.id}:${record.internalName}`;
    if (seenKeys.has(stableKey)) duplicateCount += 1;
    seenKeys.add(stableKey);
    rows.push({ stableKey, rowHash: hashJson(record) });
  }
  return finalize({ domain: 'items', rows, unresolved: [], duplicateCount, sourceHash: hashJson(sourcePayload) });
}

function buildArmorEvidence(sourcePayload, itemPayload) {
  const records = normalizeArmorRecords(sourcePayload);
  const itemRecords = normalizeItemRecords(itemPayload ?? {});
  const itemIds = new Set(itemRecords.map((record) => record.id));
  const seenKeys = new Set();
  const rows = [];
  const unresolved = [];
  let duplicateCount = 0;
  for (const record of records) {
    const stableKey = `armor-set:${requireText(record.textKey, 'armor set textKey')}`;
    if (seenKeys.has(stableKey)) duplicateCount += 1;
    seenKeys.add(stableKey);
    for (const id of uniqueNumbers(record.uniqueItemIds)) {
      if (!itemIds.has(id)) unresolved.push({ dependency: 'items', id, stableKey: `item:${id}` });
    }
    rows.push({ stableKey, rowHash: hashJson(record) });
  }
  return finalize({ domain: 'armor_sets', rows, unresolved, duplicateCount, sourceHash: hashJson(sourcePayload) });
}

function normalizeItemRecords(sourcePayload) {
  if (Array.isArray(sourcePayload?.records)) {
    return sourcePayload.records.map((record) => normalizeItemRecord(record));
  }
  if (typeof sourcePayload?.moduleContent === 'string') {
    const parsed = parseIteminfoModulePayload(sourcePayload.moduleContent);
    return Object.entries(parsed)
      .filter(([key]) => /^\d+$/.test(key) && Number(key) > 0)
      .map(([key, value]) => normalizeItemRecord({ id: Number(key), ...value }));
  }
  throw new Error('item dependency evidence requires records or moduleContent');
}

function normalizeArmorRecords(sourcePayload) {
  if (Array.isArray(sourcePayload?.records)) return sourcePayload.records;
  if (typeof sourcePayload?.moduleContent === 'string') return parseArmorSetBonuses(sourcePayload.moduleContent);
  throw new Error('armor dependency evidence requires records or moduleContent');
}

function normalizeItemRecord(record) {
  const id = Number(record?.id);
  const internalName = requireText(record?.internalName, 'item internalName');
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('item dependency evidence id is invalid');
  return { ...record, id, internalName };
}

function finalize({ domain, rows, unresolved, duplicateCount, sourceHash }) {
  const normalizedRows = [...rows].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
  const normalizedUnresolved = [...unresolved].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    schemaVersion: 'local-formal-catch-up/dependency-evidence/v1',
    domain,
    complete: normalizedUnresolved.length === 0 && duplicateCount === 0 && normalizedRows.length > 0,
    rowCount: normalizedRows.length,
    unresolvedCount: normalizedUnresolved.length,
    duplicateCount,
    stableKeyHash: hashJson(normalizedRows.map((row) => row.stableKey)),
    rows: normalizedRows,
    unresolved: normalizedUnresolved,
    sourceHash,
  };
}

function uniqueNumbers(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b);
}

function hashJson(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
