import { createHash } from 'node:crypto';

export const ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID = 'canonical-armor-historical-tuple-repair';
export const ARMOR_HISTORICAL_TUPLE_REPAIR_SCHEMA = 'armor-historical-tuple-repair/v2';

export const HISTORICAL_ARMOR_TUPLE_SCOPE = Object.freeze([
  'ArmorSetBonus.BeetleDamage',
  'ArmorSetBonus.BeetleDefense',
  'ArmorSetBonus.SpectreHealing',
  'ArmorSetBonus.SpectreDamage',
  'ArmorSetBonus.ChlorophyteMelee',
  'ArmorSetBonus.ChlorophyteSummon',
  'ArmorSetBonus.CobaltCaster',
  'ArmorSetBonus.CobaltMelee',
  'ArmorSetBonus.CobaltRanged',
  'ArmorSetBonus.MythrilCaster',
  'ArmorSetBonus.MythrilMelee',
  'ArmorSetBonus.MythrilRanged',
  'ArmorSetBonus.AdamantiteCaster',
  'ArmorSetBonus.AdamantiteMelee',
  'ArmorSetBonus.AdamantiteRanged',
]);

const HASH = /^sha256:[0-9a-f]{64}$/;
const RECORD_KEY = /^[a-f0-9]{64}$/;
const ACTIVE = (row) => row?.status === 1 && row?.deleted === 0;

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function hash(value) {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} is required`);
  return value;
}

function requireRecordKey(value, label) {
  if (!RECORD_KEY.test(String(value ?? ''))) throw new Error(`${label} is invalid`);
  return value;
}

function parseJson(value, label) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') throw new Error();
    return structuredClone(parsed);
  } catch {
    throw new Error(`${label} is malformed`);
  }
}

function parseArray(value, label) {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be an array`);
  return parsed;
}

function positiveId(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error(`${label} must be a positive integer`);
  return numeric;
}

function same(left, right) {
  return stable(left) === stable(right);
}

function requireExactScope(entries) {
  const scope = entries.map((entry) => entry.textKey).sort();
  const expected = [...HISTORICAL_ARMOR_TUPLE_SCOPE].sort();
  if (stable(scope) !== stable(expected)) throw new Error('candidate must contain exactly the 15 owner-bound historical groups');
  if (entries.some((entry) => entry.status !== 'candidate_alignment' || entry.ownerResolvedByMaintRecordKey !== true)) {
    throw new Error('historical tuple candidate contains an unbound or non-candidate group');
  }
}

function itemSlot(item) {
  const raw = parseJson(item.raw_json, 'maint item raw_json');
  for (const [partRole, slotType] of [['head', 'headSlot'], ['body', 'bodySlot'], ['legs', 'legSlot']]) {
    const value = raw[slotType];
    if (Number.isSafeInteger(Number(value)) && Number(value) >= 0) {
      return { partRole, slotType, equipmentSlotId: Number(value) };
    }
  }
  throw new Error(`maint item ${item.id} has no armor slot evidence`);
}

function buildParentUpdate(row, source, table) {
  const sets = source.sets;
  const uniqueItemIds = source.uniqueItemIds;
  if (!Array.isArray(sets) || sets.length === 0 || sets.some((set) => !Array.isArray(set) || set.length !== 3)) {
    throw new Error(`${table} source sets are malformed`);
  }
  if (!Array.isArray(uniqueItemIds) || stable([...new Set(sets.flat())].sort((a, b) => a - b)) !== stable([...uniqueItemIds].sort((a, b) => a - b))) {
    throw new Error(`${table} source unique item IDs disagree with sets`);
  }
  const raw = parseJson(row.raw_json, `${table} raw_json`);
  const after = {
    ...row,
    set_count: sets.length,
    unique_item_count: uniqueItemIds.length,
    sets_json: JSON.stringify(sets),
    unique_item_ids_json: JSON.stringify(uniqueItemIds),
    raw_json: JSON.stringify({ ...raw, setCount: sets.length, uniqueItemCount: uniqueItemIds.length, sets, uniqueItemIds }),
  };
  return {
    id: positiveId(row.id, `${table} id`),
    record_key: requireRecordKey(row.record_key, `${table} record_key`),
    text_key: requireText(row.text_key, `${table} text_key`),
    before: structuredClone(row),
    after,
    changedColumns: ['raw_json', 'set_count', 'sets_json', 'unique_item_count', 'unique_item_ids_json'],
  };
}

function buildItemInsert({ parent, item, part, variant }) {
  const slot = itemSlot(item);
  if (slot.partRole !== part.expectedPartRole || slot.partRole !== part.itemSlotRole) {
    throw new Error(`item ${item.id} role disagrees with source tuple for ${parent.text_key}`);
  }
  const recordKey = createRelationItemRecordKey(parent.record_key, variant, part.partIndex, part.itemSourceId);
  return {
    record_key: recordKey,
    armor_set_record_key: parent.record_key,
    text_key: parent.text_key,
    set_variant_index: variant,
    part_index: part.partIndex,
    item_source_id: part.itemSourceId,
    item_internal_name: item.internal_name,
    item_name: item.english_name,
    part_role: slot.partRole,
    slot_type: slot.slotType,
    equipment_slot_id: slot.equipmentSlotId,
    source_maint_table: 'maint_items',
    source_maint_record_key: null,
    source_maint_id: positiveId(item.id, 'maint item id'),
    landing_source_id: item.landing_source_id ?? null,
    landing_source_key: item.landing_source_key ?? null,
    landing_content_hash: item.landing_content_hash ?? null,
    source_provider: item.source_provider ?? null,
    source_page: item.source_page ?? null,
    source_revision_timestamp: item.source_revision_timestamp ?? null,
    confidence: '1.0000',
    reason: 'armor_set_item_source_id_match',
    review_status: 'resolved',
    raw_json: item.raw_json,
    status: 1,
    deleted: 0,
  };
}

function buildProjectionUpdate({ row, relation, source, parts, projectionItems }) {
  if (!ACTIVE(row) || row.relation_record_key !== relation.record_key || row.text_key !== relation.text_key) {
    throw new Error(`projection owner baseline drifted for ${relation.text_key}`);
  }
  const oldParts = parseArray(row.related_items_json, `${relation.text_key} projection related_items_json`);
  const oldPartBySourceId = new Map(oldParts.map((part) => [Number(part.sourceId ?? part.source_id ?? part.itemId), part]));
  const orderedParts = [...parts].sort((left, right) => Number(left.set_variant_index) - Number(right.set_variant_index)
    || Number(left.part_index) - Number(right.part_index));
  const relatedItems = orderedParts.map((part) => {
    const itemId = Number(part.item_source_id);
    const projectionItem = projectionItems.get(itemId);
    if (!projectionItem || !ACTIVE(projectionItem) || Number(projectionItem.id) !== itemId) {
      throw new Error(`projection item owner missing for ${relation.text_key}/${itemId}`);
    }
    const oldPart = oldPartBySourceId.get(itemId);
    return {
      id: itemId,
      itemId,
      sourceId: itemId,
      internalName: part.item_internal_name,
      name: part.item_name,
      nameZh: projectionItem.name_zh ?? oldPart?.nameZh ?? null,
      image: projectionItem.image ?? oldPart?.image ?? null,
      partRole: part.part_role,
      slotType: part.slot_type,
      equipmentSlotId: Number(part.equipment_slot_id),
      setVariantIndex: Number(part.set_variant_index),
      partIndex: Number(part.part_index),
    };
  });
  const after = {
    ...row,
    set_count: source.sets.length,
    unique_item_count: source.uniqueItemIds.length,
    sets_json: JSON.stringify(source.sets),
    unique_item_ids_json: JSON.stringify(source.uniqueItemIds),
    current_item_ids_json: JSON.stringify([...new Set(orderedParts.map((part) => Number(part.item_source_id)))]),
    related_items_json: JSON.stringify(relatedItems),
  };
  return {
    id: positiveId(row.id, 'projection armor set id'),
    record_key: requireRecordKey(row.relation_record_key, 'projection relation_record_key'),
    text_key: requireText(row.text_key, 'projection text_key'),
    before: structuredClone(row),
    after,
    changedColumns: ['current_item_ids_json', 'related_items_json', 'set_count', 'sets_json', 'unique_item_count', 'unique_item_ids_json'],
  };
}

function createRelationItemRecordKey(armorSetRecordKey, setVariantIndex, partIndex, itemSourceId) {
  return createHash('sha256').update(JSON.stringify({
    type: 'relation_armor_set_items', armorSetRecordKey, setVariantIndex, partIndex, itemSourceId,
  }), 'utf8').digest('hex');
}

function selectedRows(currentRows, key) {
  if (!Array.isArray(currentRows?.[key])) throw new Error(`current ${key} rows are required`);
  return currentRows[key];
}

export function buildArmorHistoricalTupleRepairProposal({
  candidateArtifact,
  currentRows,
  serverUuid,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!candidateArtifact || candidateArtifact.schemaVersion !== 'armor-source-relation-alignment-candidate/v1') {
    throw new Error('historical tuple candidate artifact is invalid');
  }
  requireText(serverUuid, 'historical tuple server UUID');
  requireText(generatedAt, 'historical tuple generatedAt');
  const entries = candidateArtifact.sets?.filter((entry) => entry.status === 'candidate_alignment') ?? [];
  requireExactScope(entries);
  if (candidateArtifact.summary?.candidateTupleInsertCount !== 45 || candidateArtifact.summary?.candidateTupleRetireCount !== 30) {
    throw new Error('historical tuple candidate summary is not the bounded 45/30 scope');
  }

  const maintArmorSets = selectedRows(currentRows, 'maintArmorSets');
  const relationArmorSets = selectedRows(currentRows, 'relationArmorSets');
  const relationArmorSetItems = selectedRows(currentRows, 'relationArmorSetItems');
  const maintItems = selectedRows(currentRows, 'maintItems');
  const projectionArmorSets = selectedRows(currentRows, 'projectionArmorSets');
  const projectionItems = selectedRows(currentRows, 'projectionItems');
  const maintById = new Map(maintArmorSets.map((row) => [Number(row.id), row]));
  const relationByKey = new Map(relationArmorSets.map((row) => [row.record_key, row]));
  const itemById = new Map(maintItems.map((row) => [Number(row.source_id), row]));
  const projectionByRelationKey = new Map(projectionArmorSets.map((row) => [row.relation_record_key, row]));
  const projectionItemById = new Map(projectionItems.map((row) => [Number(row.id), row]));
  const changes = {
    maintParentUpdates: [],
    relationParentUpdates: [],
    relationItemInserts: [],
    relationItemRetirements: [],
    projectionArmorSetUpdates: [],
  };
  for (const entry of entries) {
    const maint = maintById.get(Number(entry.current.maintId));
    if (!maint || maint.record_key !== entry.current.maintRecordKey || maint.text_key !== entry.textKey || !ACTIVE(maint)) {
      throw new Error(`maint owner baseline drifted for ${entry.textKey}`);
    }
    const relation = relationByKey.get(entry.current.relationRecordKey);
    if (!relation || relation.source_maint_record_key !== maint.record_key || relation.source_maint_id !== maint.id
        || relation.text_key !== entry.textKey || !ACTIVE(relation)) {
      throw new Error(`relation owner baseline drifted for ${entry.textKey}`);
    }
    const currentMaintSets = parseArray(maint.sets_json, `${entry.textKey} maint sets_json`);
    const currentRelationSets = parseArray(relation.sets_json, `${entry.textKey} relation sets_json`);
    if (!same(currentMaintSets, entry.current.maintSets)) throw new Error(`maint parent baseline drifted for ${entry.textKey}`);
    if (!same(currentRelationSets, entry.current.relationSets)) throw new Error(`relation parent baseline drifted for ${entry.textKey}`);
    const proposed = entry.proposedRelationItems ?? [];
    if (proposed.length !== 3) throw new Error(`historical tuple proposal for ${entry.textKey} must contain three parts`);
    const extras = entry.delta?.extraRelationTuples ?? [];
    const activeChildren = relationArmorSetItems.filter((row) => row.armor_set_record_key === relation.record_key && ACTIVE(row));
    if (activeChildren.length !== extras.length || extras.some((extra) => !activeChildren.some((row) => Number(row.id) === Number(extra.id)))) {
      throw new Error(`relation child baseline drifted for ${entry.textKey}`);
    }
    changes.maintParentUpdates.push(buildParentUpdate(maint, entry.source, 'maint_armor_sets'));
    changes.relationParentUpdates.push(buildParentUpdate(relation, entry.source, 'relation_armor_sets'));
    for (const part of proposed) {
      const item = itemById.get(Number(part.itemSourceId));
      if (!item || !ACTIVE(item) || Number(item.source_id) !== Number(part.itemSourceId)) throw new Error(`maint item owner missing for ${entry.textKey}/${part.itemSourceId}`);
      changes.relationItemInserts.push(buildItemInsert({ parent: relation, item, part, variant: part.setVariantIndex }));
    }
    for (const extra of extras) {
      const row = activeChildren.find((candidate) => Number(candidate.id) === Number(extra.id));
      changes.relationItemRetirements.push({
        id: positiveId(row.id, 'relation child id'),
        record_key: requireRecordKey(row.record_key, 'relation child record_key'),
        armor_set_record_key: relation.record_key,
        text_key: entry.textKey,
        before: structuredClone(row),
        retireMode: 'status_deleted',
      });
    }
    const projection = projectionByRelationKey.get(relation.record_key);
    if (!projection) throw new Error(`projection owner missing for ${entry.textKey}`);
    changes.projectionArmorSetUpdates.push(buildProjectionUpdate({
      row: projection,
      relation,
      source: entry.source,
      parts: changes.relationItemInserts.filter((row) => row.armor_set_record_key === relation.record_key),
      projectionItems: projectionItemById,
    }));
  }
  changes.maintParentUpdates.sort((a, b) => a.id - b.id);
  changes.relationParentUpdates.sort((a, b) => a.id - b.id);
  changes.relationItemInserts.sort((a, b) => a.text_key.localeCompare(b.text_key) || a.set_variant_index - b.set_variant_index || a.part_index - b.part_index);
  changes.relationItemRetirements.sort((a, b) => a.id - b.id);
  changes.projectionArmorSetUpdates.sort((a, b) => a.id - b.id);
  const projectionItemRows = sortedRows([...projectionItemById.values()]);
  const before = {
    maintParentRows: changes.maintParentUpdates.map((change) => change.before),
    relationParentRows: changes.relationParentUpdates.map((change) => change.before),
    relationItemRows: changes.relationItemRetirements.map((change) => change.before),
    projectionRows: changes.projectionArmorSetUpdates.map((change) => change.before),
    projectionItemRows,
  };
  const after = {
    maintParentRows: changes.maintParentUpdates.map((change) => change.after),
    relationParentRows: changes.relationParentUpdates.map((change) => change.after),
    relationItemInserts: changes.relationItemInserts,
    projectionRows: changes.projectionArmorSetUpdates.map((change) => change.after),
  };
  const proposal = {
    schemaVersion: ARMOR_HISTORICAL_TUPLE_REPAIR_SCHEMA,
    operationId: ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID,
    databaseWrites: false,
    executable: false,
    applyAllowed: false,
    generatedAt,
    serverUuid,
    scope: [...HISTORICAL_ARMOR_TUPLE_SCOPE],
    source: {
      page: candidateArtifact.source?.page,
      revisionId: candidateArtifact.source?.revisionId,
      revisionTimestamp: candidateArtifact.source?.revisionTimestamp,
      textKeyCount: candidateArtifact.source?.textKeyCount,
      sourceCandidateSha256: hash(candidateArtifact),
    },
    beforeSha256: hash(before),
    afterSha256: hash(after),
    projectionItemRows,
    changes,
    counts: { maintParentUpdates: 15, relationParentUpdates: 15, relationItemInserts: 45, relationItemRetirements: 30, projectionArmorSetUpdates: 15 },
  };
  proposal.proposalSha256 = hash(proposal);
  return proposal;
}

export function validateArmorHistoricalTupleRepairProposal(proposal) {
  if (!proposal || proposal.schemaVersion !== ARMOR_HISTORICAL_TUPLE_REPAIR_SCHEMA
      || proposal.operationId !== ARMOR_HISTORICAL_TUPLE_REPAIR_OPERATION_ID
      || proposal.databaseWrites !== false || proposal.executable !== false || proposal.applyAllowed !== false
      || !HASH.test(proposal.beforeSha256 ?? '') || !HASH.test(proposal.afterSha256 ?? '') || !HASH.test(proposal.proposalSha256 ?? '')
      || stable(proposal.scope) !== stable(HISTORICAL_ARMOR_TUPLE_SCOPE)) {
    throw new Error('historical tuple repair proposal identity is invalid');
  }
  const changes = proposal.changes;
  if (!changes || changes.maintParentUpdates?.length !== 15 || changes.relationParentUpdates?.length !== 15
      || changes.relationItemInserts?.length !== 45 || changes.relationItemRetirements?.length !== 30
      || changes.projectionArmorSetUpdates?.length !== 15 || !Array.isArray(proposal.projectionItemRows)) {
    throw new Error('historical tuple repair proposal counts are invalid');
  }
  const projectionItemIds = [...new Set(changes.relationItemInserts.map((row) => Number(row.item_source_id)))].sort((a, b) => a - b);
  if (stable(proposal.projectionItemRows.map((row) => Number(row.id)).sort((a, b) => a - b)) !== stable(projectionItemIds)) {
    throw new Error('historical tuple projection item baseline is incomplete');
  }
  const copy = structuredClone(proposal);
  delete copy.proposalSha256;
  if (hash(copy) !== proposal.proposalSha256) throw new Error('historical tuple repair proposal hash drifted');
  return true;
}

const PARENT_UPDATE_COLUMNS = Object.freeze([
  'set_count', 'unique_item_count', 'sets_json', 'unique_item_ids_json', 'raw_json',
]);
const PROJECTION_UPDATE_COLUMNS = Object.freeze([
  'set_count', 'unique_item_count', 'sets_json', 'unique_item_ids_json', 'current_item_ids_json', 'related_items_json',
]);
const RELATION_ITEM_INSERT_COLUMNS = Object.freeze([
  'record_key', 'armor_set_record_key', 'text_key', 'set_variant_index', 'part_index',
  'item_source_id', 'item_internal_name', 'item_name', 'part_role', 'slot_type',
  'equipment_slot_id', 'source_maint_table', 'source_maint_record_key', 'source_maint_id',
  'landing_source_id', 'landing_source_key', 'landing_content_hash', 'source_provider',
  'source_page', 'source_revision_timestamp', 'confidence', 'reason', 'review_status',
  'raw_json', 'status', 'deleted',
]);

function sortedRows(rows) {
  return structuredClone(rows).sort((left, right) => Number(left.id) - Number(right.id));
}

function sortedRowsByRecordKey(rows) {
  return structuredClone(rows).sort((left, right) => String(left.record_key).localeCompare(String(right.record_key)));
}

function rowHash(rows) {
  return hash(sortedRows(rows));
}

function inParams(values) {
  return values.map(() => '?').join(', ');
}

export async function readArmorHistoricalTupleRepairSnapshot({ connection, proposal, forUpdate = false } = {}) {
  validateArmorHistoricalTupleRepairProposal(proposal);
  if (typeof connection?.query !== 'function') throw new Error('historical tuple snapshot requires query capability');
  const maintIds = proposal.changes.maintParentUpdates.map((change) => change.id);
  const relationIds = proposal.changes.relationParentUpdates.map((change) => change.id);
  const relationKeys = proposal.changes.relationParentUpdates.map((change) => change.record_key);
  const itemIds = proposal.changes.relationItemInserts.map((row) => row.source_maint_id);
  const projectionIds = proposal.changes.projectionArmorSetUpdates.map((change) => change.id);
  const projectionItemIds = proposal.projectionItemRows.map((row) => Number(row.id));
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const read = async (sql, params) => {
    const [rows] = await connection.query(sql, params);
    if (!Array.isArray(rows)) throw new Error('historical tuple snapshot query did not return rows');
    return sortedRows(rows);
  };
  return {
    maintArmorSets: await read(`SELECT * FROM terria_v1_maint.maint_armor_sets WHERE id IN (${inParams(maintIds)})${lock}`, maintIds),
    relationArmorSets: await read(`SELECT * FROM terria_v1_relation.relation_armor_sets WHERE id IN (${inParams(relationIds)})${lock}`, relationIds),
    relationArmorSetItems: await read(`SELECT * FROM terria_v1_relation.relation_armor_set_items WHERE armor_set_record_key IN (${inParams(relationKeys)}) AND status = 1 AND deleted = 0${lock}`, relationKeys),
    maintItems: await read(`SELECT * FROM terria_v1_maint.maint_items WHERE id IN (${inParams(itemIds)}) FOR SHARE`, itemIds),
    projectionArmorSets: await read(`SELECT * FROM terria_v1_relation.projection_armor_sets WHERE id IN (${inParams(projectionIds)})${lock}`, projectionIds),
    projectionItems: await read(`SELECT id, name_zh, image, status, deleted FROM terria_v1_relation.projection_items WHERE id IN (${inParams(projectionItemIds)})${forUpdate ? ' FOR SHARE' : ''}`, projectionItemIds),
  };
}

function expectedBeforeRows(proposal) {
  return {
    maintArmorSets: proposal.changes.maintParentUpdates.map((change) => change.before),
    relationArmorSets: proposal.changes.relationParentUpdates.map((change) => change.before),
    relationArmorSetItems: proposal.changes.relationItemRetirements.map((change) => change.before),
    projectionArmorSets: proposal.changes.projectionArmorSetUpdates.map((change) => change.before),
  };
}

function expectedAfterRows(proposal) {
  return {
    maintArmorSets: proposal.changes.maintParentUpdates.map((change) => change.after),
    relationArmorSets: proposal.changes.relationParentUpdates.map((change) => change.after),
    relationArmorSetItems: sortedRowsByRecordKey(proposal.changes.relationItemInserts),
    projectionArmorSets: proposal.changes.projectionArmorSetUpdates.map((change) => change.after),
  };
}

function assertSnapshotMatches(proposal, snapshot) {
  const before = expectedBeforeRows(proposal);
  for (const table of Object.keys(before)) {
    if (rowHash(snapshot[table]) !== rowHash(before[table])) throw new Error(`${table} locked baseline drifted`);
  }
  if (rowHash(snapshot.projectionItems) !== rowHash(proposal.projectionItemRows)) throw new Error('projection item locked baseline drifted');
  for (const item of snapshot.maintItems) {
    const expected = proposal.changes.relationItemInserts.find((row) => row.source_maint_id === item.id);
    if (!expected || !ACTIVE(item) || item.internal_name !== expected.item_internal_name) throw new Error('maint item locked baseline drifted');
  }
}

function sqlDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

async function updateParent(connection, schema, change) {
  const values = PARENT_UPDATE_COLUMNS.map((column) => change.after[column]);
  const [result] = await connection.execute(
    `UPDATE \`${schema}\`.\`maint_armor_sets\` SET ${PARENT_UPDATE_COLUMNS.map((column) => `\`${column}\` = ?`).join(', ')}, \`updated_at\` = \`updated_at\` WHERE id = ? AND record_key = ? AND status = 1 AND deleted = 0`,
    [...values, change.id, change.record_key],
  );
  if (Number(result?.affectedRows) !== 1) throw new Error('maint armor parent update receipt drifted');
}

async function updateRelationParent(connection, change) {
  const values = PARENT_UPDATE_COLUMNS.map((column) => change.after[column]);
  const [result] = await connection.execute(
    `UPDATE \`terria_v1_relation\`.\`relation_armor_sets\` SET ${PARENT_UPDATE_COLUMNS.map((column) => `\`${column}\` = ?`).join(', ')}, \`updated_at\` = \`updated_at\` WHERE id = ? AND record_key = ? AND status = 1 AND deleted = 0`,
    [...values, change.id, change.record_key],
  );
  if (Number(result?.affectedRows) !== 1) throw new Error('relation armor parent update receipt drifted');
}

async function insertRelationItem(connection, row) {
  const [result] = await connection.execute(
    `INSERT INTO \`terria_v1_relation\`.\`relation_armor_set_items\` (${RELATION_ITEM_INSERT_COLUMNS.map((column) => `\`${column}\``).join(', ')}) VALUES (${RELATION_ITEM_INSERT_COLUMNS.map(() => '?').join(', ')})`,
    RELATION_ITEM_INSERT_COLUMNS.map((column) => /(?:_timestamp|_at)$/.test(column) ? sqlDate(row[column]) : row[column]),
  );
  if (Number(result?.affectedRows) !== 1) throw new Error('relation armor child insert receipt drifted');
}

async function retireRelationItem(connection, row) {
  const [result] = await connection.execute(
    'UPDATE `terria_v1_relation`.`relation_armor_set_items` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND record_key = ? AND status = 1 AND deleted = 0',
    [row.id, row.record_key],
  );
  if (Number(result?.affectedRows) !== 1) throw new Error('relation armor child retirement receipt drifted');
}

async function updateArmorSetProjection(connection, change) {
  const values = PROJECTION_UPDATE_COLUMNS.map((column) => change.after[column]);
  const [result] = await connection.execute(
    `UPDATE \`terria_v1_relation\`.\`projection_armor_sets\` SET ${PROJECTION_UPDATE_COLUMNS.map((column) => `\`${column}\` = ?`).join(', ')}, \`updated_at\` = \`updated_at\` WHERE id = ? AND relation_record_key = ? AND text_key = ? AND status = 1 AND deleted = 0`,
    [...values, change.id, change.record_key, change.text_key],
  );
  if (Number(result?.affectedRows) !== 1) throw new Error('projection armor set update receipt drifted');
}

async function readAfterRows(connection, proposal) {
  const parentIds = proposal.changes.maintParentUpdates.map((change) => change.id);
  const relationIds = proposal.changes.relationParentUpdates.map((change) => change.id);
  const childKeys = proposal.changes.relationItemInserts.map((row) => row.record_key);
  const projectionIds = proposal.changes.projectionArmorSetUpdates.map((change) => change.id);
  const [maint] = await connection.query(`SELECT * FROM terria_v1_maint.maint_armor_sets WHERE id IN (${inParams(parentIds)})`, parentIds);
  const [relation] = await connection.query(`SELECT * FROM terria_v1_relation.relation_armor_sets WHERE id IN (${inParams(relationIds)})`, relationIds);
  const childColumns = RELATION_ITEM_INSERT_COLUMNS.map((column) => `\`${column}\``).join(', ');
  const [children] = await connection.query(`SELECT ${childColumns} FROM terria_v1_relation.relation_armor_set_items WHERE record_key IN (${inParams(childKeys)}) AND status = 1 AND deleted = 0 ORDER BY record_key`, childKeys);
  const [projection] = await connection.query(`SELECT * FROM terria_v1_relation.projection_armor_sets WHERE id IN (${inParams(projectionIds)})`, projectionIds);
  return { maintArmorSets: sortedRows(maint), relationArmorSets: sortedRows(relation), relationArmorSetItems: sortedRowsByRecordKey(children), projectionArmorSets: sortedRows(projection) };
}

export async function executeArmorHistoricalTupleRepairTransaction({
  connection,
  proposal,
  assertRuntimeFence,
  consumePermit,
  persistPrepared,
  persistOutcome,
} = {}) {
  validateArmorHistoricalTupleRepairProposal(proposal);
  if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some((key) => typeof connection?.[key] !== 'function')
      || typeof assertRuntimeFence !== 'function' || typeof consumePermit !== 'function'
      || typeof persistPrepared !== 'function' || typeof persistOutcome !== 'function') {
    throw new Error('historical tuple execution requires connection, authorization, permit and evidence adapters');
  }
  let began = false;
  let prepared = false;
  let committing = false;
  let committed = false;
  let permitConsumed = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    began = true;
    await assertRuntimeFence();
    const snapshot = await readArmorHistoricalTupleRepairSnapshot({ connection, proposal, forUpdate: true });
    assertSnapshotMatches(proposal, snapshot);
    await assertRuntimeFence();
    const evidence = {
      schemaVersion: 'armor-historical-tuple-repair-execution/v1',
      operationId: proposal.operationId,
      proposalSha256: proposal.proposalSha256,
      beforeSha256: proposal.beforeSha256,
      afterSha256: proposal.afterSha256,
      scope: proposal.scope,
      counts: proposal.counts,
    };
    await persistPrepared({ ...evidence, status: 'PREPARED' });
    prepared = true;
    await consumePermit();
    permitConsumed = true;
    for (const change of proposal.changes.maintParentUpdates) await updateParent(connection, 'terria_v1_maint', change);
    for (const change of proposal.changes.relationParentUpdates) await updateRelationParent(connection, change);
    for (const row of proposal.changes.relationItemRetirements) await retireRelationItem(connection, row);
    for (const row of proposal.changes.relationItemInserts) await insertRelationItem(connection, row);
    for (const change of proposal.changes.projectionArmorSetUpdates) await updateArmorSetProjection(connection, change);
    const after = await readAfterRows(connection, proposal);
    const expected = expectedAfterRows(proposal);
    for (const table of Object.keys(expected)) if (rowHash(after[table]) !== rowHash(expected[table])) throw new Error(`${table} terminal readback drifted`);
    await assertRuntimeFence();
    committing = true;
    await connection.commit();
    committed = true;
    const result = { ...evidence, status: 'COMMITTED', permitConsumed, transactionCommitted: true };
    await persistOutcome(result);
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    error.transactionCommitted = committed ? true : committing ? null : false;
    error.requiresReadbackReconciliation = committing;
    error.dispatchPermitConsumed = permitConsumed;
    if (began && !committing) {
      try { await connection.rollback(); } catch { error.requiresReadbackReconciliation = true; }
    }
    if (prepared) {
      try { await persistOutcome({ operationId: proposal.operationId, proposalSha256: proposal.proposalSha256,
        status: committing ? 'COMMIT_UNKNOWN' : 'ROLLBACK_CONFIRMED', permitConsumed, error: error.message,
        requiresReadbackReconciliation: error.requiresReadbackReconciliation }); } catch { error.requiresReadbackReconciliation = true; }
    }
    throw error;
  }
}
