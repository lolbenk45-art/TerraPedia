import { createHash } from 'node:crypto';

import { createRecordKey } from './relation-trace.mjs';

export const BUFF_NPC_SECONDARY_CANDIDATE_OPERATION_ID = 'canonical-buff-npc-secondary-candidate';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

const TARGET_COLUMNS = Object.freeze([
  'record_key', 'npc_source_id', 'npc_internal_name', 'npc_name',
  'buff_source_id', 'buff_internal_name', 'relation_type', 'duration_ticks',
  'chance_value', 'chance_text', 'conditions', 'source_maint_table',
  'source_maint_record_key', 'source_maint_id', 'landing_source_id',
  'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
  'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'raw_json',
  'status', 'deleted',
]);

export function buildBuffNpcSecondaryCandidate({
  facts = [],
  maintBuffRows = [],
  currentRows = [],
  targetBuffIds = [],
  serverUuid,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!Array.isArray(facts) || !Array.isArray(maintBuffRows) || !Array.isArray(currentRows)) {
    throw new Error('NPC secondary candidate inputs must be arrays');
  }
  const targetIds = normalizeTargetIds(targetBuffIds);
  if (targetIds.length === 0) throw new Error('NPC secondary candidate target scope is required');
  if (!isUuid(serverUuid)) throw new Error('NPC secondary candidate server UUID is invalid');
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('NPC secondary candidate generatedAt is invalid');

  const targetSet = new Set(targetIds);
  const maintByBuff = new Map();
  for (const row of maintBuffRows) {
    const sourceId = toId(row?.source_id ?? row?.sourceId);
    if (sourceId == null || !targetSet.has(sourceId)) continue;
    if (maintByBuff.has(sourceId)) throw new Error(`duplicate maint Buff identity ${sourceId}`);
    maintByBuff.set(sourceId, row);
  }
  for (const buffId of targetIds) {
    if (!maintByBuff.has(buffId)) throw new Error(`NPC secondary candidate maint scope missing ${buffId}`);
  }

  const currentByKey = new Map();
  for (const row of currentRows) {
    const key = String(row?.record_key ?? row?.recordKey ?? '').trim();
    if (!key) throw new Error('NPC secondary candidate current row key is required');
    if (currentByKey.has(key)) throw new Error(`duplicate current NPC-Buff identity ${key}`);
    currentByKey.set(key, row);
  }

  const seenFacts = new Set();
  const deferred = [];
  const inserts = [];
  for (const fact of facts) {
    const buffId = toId(fact?.buffSourceId ?? fact?.buff_source_id);
    if (buffId == null || !targetSet.has(buffId)) {
      throw new Error('NPC secondary candidate fact is outside target scope');
    }
    if (fact?.factGroup !== 'immuneNpcs') {
      throw new Error('NPC secondary candidate accepts immuneNpcs facts only');
    }
    const npcId = toId(fact?.stableSourceId ?? fact?.npcSourceId ?? fact?.npc_source_id);
    const npcInternalName = text(fact?.maintInternalName ?? fact?.sourceInternalName ?? fact?.npcInternalName);
    const identityKey = `${buffId}:${npcId ?? 'missing'}:${npcInternalName}`;
    if (seenFacts.has(identityKey)) throw new Error(`duplicate NPC secondary fact ${identityKey}`);
    seenFacts.add(identityKey);

    const maintSourceId = toId(fact?.maintSourceId);
    const promotable = fact?.promotable === true
      && npcId != null
      && maintSourceId === npcId
      && Boolean(npcInternalName);
    if (!promotable) {
      deferred.push({ ...fact, classification: text(fact?.classification) || 'not-promotable' });
      continue;
    }
    const maint = maintByBuff.get(buffId);
    const row = buildInsertRow({ fact, buffId, npcId, npcInternalName, maint });
    if (!currentByKey.has(row.record_key)) inserts.push(row);
  }

  const afterRows = [...currentRows, ...inserts].sort(compareRows);
  const result = {
    schemaVersion: 'buff-npc-secondary-candidate/v1',
    operationId: BUFF_NPC_SECONDARY_CANDIDATE_OPERATION_ID,
    generatedAt,
    readOnly: true,
    executable: false,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    serverUuid,
    target: {
      database: 'terria_v1_relation',
      table: 'terria_v1_relation.npc_buff_relations',
      columns: [...TARGET_COLUMNS],
      mutationMode: 'insert-only-preserve-existing',
      relationType: 'immune',
    },
    targetBuffIds: targetIds,
    changes: { inserts, updates: [], deletes: [], preserved: currentRows },
    deferred,
    before: { rowCount: currentRows.length, rowsSha256: hashJson(currentRows) },
    after: { rowCount: afterRows.length, rowsSha256: hashJson(afterRows) },
    summary: {
      targetBuffCount: targetIds.length,
      currentRowCount: currentRows.length,
      insertCount: inserts.length,
      deferredCount: deferred.length,
      deferredDisplayOnlyCount: deferred.filter(row => row.classification === 'display-only-npc-source-id-missing').length,
      databaseWrites: false,
    },
    inputs: {
      factCount: facts.length,
      maintBuffCount: maintBuffRows.length,
      currentRowCount: currentRows.length,
    },
  };
  result.candidateSha256 = hashJson(result);
  return result;
}

function buildInsertRow({ fact, buffId, npcId, npcInternalName, maint }) {
  const buffInternalName = text(fact?.buffInternalName);
  const recordKey = createRecordKey({
    type: 'npc_buff_relation', relationType: 'immune', npcSourceId: npcId,
    npcInternalName, buffSourceId: buffId, buffInternalName,
  });
  return {
    record_key: recordKey,
    npc_source_id: npcId,
    npc_internal_name: npcInternalName,
    npc_name: text(fact?.sourceName ?? fact?.npcName) || null,
    buff_source_id: buffId,
    buff_internal_name: buffInternalName || null,
    relation_type: 'immune',
    duration_ticks: null,
    chance_value: null,
    chance_text: null,
    conditions: null,
    source_maint_table: 'maint_buffs',
    source_maint_record_key: text(maint?.record_key) || null,
    source_maint_id: toId(maint?.id),
    landing_source_id: toId(maint?.landing_source_id),
    landing_source_key: text(maint?.landing_source_key) || null,
    landing_content_hash: text(maint?.landing_content_hash) || null,
    source_provider: text(maint?.source_provider) || null,
    source_page: text(maint?.source_page) || null,
    source_revision_timestamp: maint?.source_revision_timestamp ?? null,
    confidence: '1.0000',
    reason: 'maint_buff_immune',
    review_status: 'resolved',
    raw_json: null,
    status: 1,
    deleted: 0,
  };
}

function normalizeTargetIds(values) {
  if (!Array.isArray(values)) throw new Error('NPC secondary candidate target IDs must be an array');
  const ids = values.map(toId);
  if (ids.some(id => id == null)) throw new Error('NPC secondary candidate target ID is invalid');
  if (new Set(ids).size !== ids.length) throw new Error('NPC secondary candidate target scope contains duplicates');
  return ids.sort((a, b) => a - b);
}

function compareRows(left, right) {
  return String(left?.record_key ?? '').localeCompare(String(right?.record_key ?? ''));
}

export function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));
}

function toId(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function text(value) {
  const valueText = String(value ?? '').trim();
  return valueText || '';
}
