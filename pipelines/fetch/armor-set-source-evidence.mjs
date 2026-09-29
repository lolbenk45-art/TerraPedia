import { createHash } from 'node:crypto';

import { parseArmorSetBonuses } from './armor-set-module-parser.mjs';

const HASH = /^sha256:[a-f0-9]{64}$/;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function requiredRevision(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} revisionId is required`);
  return value;
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function assertSame(left, right, label) {
  if (left !== right) throw new Error(`Armor set source ${label} drifted between artifacts`);
}

function assertRecords(records, label) {
  if (!Array.isArray(records) || records.length === 0) throw new Error(`Armor set source ${label} records are required`);
  const textKeys = new Set();
  return records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Armor set source ${label} record ${index} is invalid`);
    const textKey = requiredText(record.textKey, `Armor set source ${label} record ${index} textKey`);
    const benefitExpression = requiredText(record.benefitExpression, `Armor set source ${label} record ${index} benefitExpression`);
    if (!/^ArmorSetBonus\.[A-Za-z0-9_]+$/.test(textKey)) throw new Error(`Armor set source ${label} record ${index} textKey is invalid`);
    if (textKeys.has(textKey)) throw new Error(`Armor set source ${label} textKey is duplicated: ${textKey}`);
    if (!Array.isArray(record.sets) || record.sets.length === 0
        || record.sets.some((set) => !Array.isArray(set) || set.length !== 3
          || set.some((value) => !Number.isSafeInteger(value) || value < 0))) {
      throw new Error(`Armor set source ${label} record ${index} sets are invalid`);
    }
    if (record.setCount !== record.sets.length || !Array.isArray(record.uniqueItemIds)) {
      throw new Error(`Armor set source ${label} record ${index} counts are invalid`);
    }
    textKeys.add(textKey);
    return {
      benefitExpression,
      primaryPart: record.primaryPart ?? null,
      setCount: record.setCount,
      sets: record.sets.map((set) => [...set]),
      textKey,
      uniqueItemIds: [...record.uniqueItemIds]
    };
  });
}

export function buildArmorSetSourceEvidence({ rawPayload, parsedPayload, standardizedPayload, report } = {}) {
  if (!rawPayload || !parsedPayload || !standardizedPayload || !report) throw new Error('Armor set source artifacts are required');
  const pageTitle = requiredText(rawPayload.pageTitle, 'Armor set source pageTitle');
  if (rawPayload.moduleTitle !== 'Module:ArmorSetBonuses' || pageTitle !== 'Module:ArmorSetBonuses') {
    throw new Error('Armor set source module identity is invalid');
  }
  const revisionId = requiredRevision(rawPayload.revisionId, 'raw');
  const sourceRevisionId = requiredRevision(parsedPayload.sourceRevisionId, 'parsed');
  const standardizedRevisionId = requiredRevision(standardizedPayload.upstreamMeta?.sourceRevisionId, 'standardized');
  const reportRevisionId = requiredRevision(report.revisionId, 'report');
  for (const [value, label] of [[sourceRevisionId, 'parsed'], [standardizedRevisionId, 'standardized'], [reportRevisionId, 'report']]) {
    assertSame(revisionId, value, `${label} revision`);
  }
  const revisionTimestamp = requiredText(rawPayload.sourceRevisionTimestamp, 'Armor set source revision timestamp');
  assertSame(parsedPayload.sourceRevisionTimestamp, revisionTimestamp, 'parsed revision timestamp');
  assertSame(standardizedPayload.upstreamMeta?.sourceRevisionTimestamp, revisionTimestamp, 'standardized revision timestamp');
  assertSame(report.revisionTimestamp, revisionTimestamp, 'report revision timestamp');
  const parsedRecords = assertRecords(parsedPayload.armorSets, 'parsed');
  const standardizedRecords = assertRecords(standardizedPayload.records, 'standardized');
  const moduleContent = requiredText(rawPayload.moduleContent, 'Armor set source moduleContent');
  const rawRecords = assertRecords(parseArmorSetBonuses(moduleContent), 'raw');
  if (JSON.stringify(rawRecords) !== JSON.stringify(parsedRecords)) throw new Error('Armor set source records drifted between raw and parsed artifacts');
  if (JSON.stringify(rawRecords) !== JSON.stringify(standardizedRecords)) throw new Error('Armor set source records drifted between raw and standardized artifacts');
  const contentHash = hash(moduleContent);
  if (!HASH.test(contentHash)) throw new Error('Armor set source content hash is invalid');
  return {
    schemaVersion: 'armor-set-source-evidence/v1',
    source: { pageTitle, revisionId, revisionTimestamp, contentHash },
    mappings: parsedRecords.map(({ textKey, benefitExpression }) => ({ textKey, benefitExpression })),
    records: rawRecords
  };
}
