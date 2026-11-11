#!/usr/bin/env node

import { createHash } from 'node:crypto';

import { createRecordKey } from './relation-trace.mjs';

export const BUFF_ADDITIVE_RELATION_OPERATION_ID = 'canonical-buff-additive-relation-apply';

const TARGET_TABLES = Object.freeze(['relation_buffs', 'npc_buff_relations', 'projection_buffs']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FACT_SOURCE_SCHEMA = 'buff-npc-page-infliction-evidence/v1';
const PROPOSAL_SCHEMA = 'buff-additive-relation-proposal/v1';
const EVIDENCE_SCHEMA = 'buff-additive-inflicting-evidence/v1';
const JSON_FACT_FIELDS = Object.freeze([
  'npcId', 'internalName', 'name', 'relationType', 'durationText',
  'sourcePage', 'sourcePageId', 'sourceRevisionId', 'sourceRevisionTimestamp',
]);
const REVERSE_COLUMNS = Object.freeze([
  'record_key', 'npc_source_id', 'npc_internal_name', 'npc_name',
  'buff_source_id', 'buff_internal_name', 'relation_type', 'duration_ticks',
  'chance_value', 'chance_text', 'conditions', 'source_maint_table',
  'source_maint_record_key', 'source_maint_id', 'landing_source_id',
  'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
  'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'status', 'deleted',
]);

export function buildBuffAdditiveRelationProposal({
  facts = [],
  source,
  relationBuffRows = [],
  npcBuffRelationRows = [],
  projectionBuffRows = [],
} = {}) {
  const normalizedFacts = validateFacts(facts, source);
  const buffIds = new Set(normalizedFacts.map((fact) => fact.buffId));
  const relationRows = selectTargetRows(relationBuffRows, buffIds, 'relation Buff');
  const projectionRows = selectTargetRows(projectionBuffRows, buffIds, 'projection Buff');
  const relationByBuffId = indexUnique(relationRows, row => Number(row.source_id), 'relation Buff source id');
  const projectionByBuffId = indexUnique(projectionRows, row => Number(row.source_id), 'projection Buff source id');
  const existingReverseRows = (npcBuffRelationRows ?? []).filter((row) => buffIds.has(Number(row?.buff_source_id)));
  const reverseIdentities = indexReverseIdentities(existingReverseRows);
  const factsByBuffId = groupFacts(normalizedFacts);
  const relationUpdates = [];
  const projectionUpdates = [];
  const reverseInserts = [];

  for (const [buffId, buffFacts] of factsByBuffId) {
    const relationBefore = relationByBuffId.get(buffId);
    const projectionBefore = projectionByBuffId.get(buffId);
    if (!relationBefore || !isActive(relationBefore)) throw new Error(`additive relation Buff baseline is missing for ${buffId}`);
    if (!projectionBefore || !isActive(projectionBefore)) throw new Error(`additive projection Buff baseline is missing for ${buffId}`);
    if (String(projectionBefore.relation_record_key) !== String(relationBefore.record_key)
        || String(projectionBefore.internal_name) !== String(relationBefore.internal_name)) {
      throw new Error(`additive projection identity or lineage drifted for ${buffId}`);
    }
    if (relationBefore.immune_npcs_json !== projectionBefore.immune_npcs_json
        || relationBefore.source_items_json !== projectionBefore.source_items_json) {
      throw new Error(`additive relation/projection immutable fact groups drifted for ${buffId}`);
    }

    const currentInflicting = parseArray(relationBefore.inflicting_npcs_json, 'relation Buff inflicting NPC JSON');
    const currentProjectionInflicting = parseArray(projectionBefore.inflicting_npcs_json, 'projection Buff inflicting NPC JSON');
    const merged = mergeFacts(currentInflicting, [...currentProjectionInflicting, ...buffFacts], buffId);
    const mergedProjection = mergeFacts(currentProjectionInflicting, [...currentInflicting, ...buffFacts], buffId);
    const evidence = buildEvidence({ source, facts: buffFacts, previous: parseObject(relationBefore.source_evidence_json) });
    const mergedEvidenceJson = JSON.stringify(evidence);
    const mergedJson = JSON.stringify(merged);
    if (!sameJson(merged, currentInflicting)) {
      relationUpdates.push(buildUpdate(relationBefore, {
        inflicting_npcs_json: mergedJson,
        source_evidence_json: mergedEvidenceJson,
      }, 'relation_buffs'));
    }
    if (!sameJson(mergedProjection, currentProjectionInflicting)) {
      projectionUpdates.push(buildUpdate(projectionBefore, {
        inflicting_npcs_json: JSON.stringify(mergedProjection),
        source_evidence_json: mergedEvidenceJson,
      }, 'projection_buffs'));
    }

    for (const fact of buffFacts) {
      const identity = factIdentity(fact);
      const scopedKeys = reverseIdentityKeys(identity, buffId);
      const existing = reverseIdentities.get(scopedKeys.key);
      if (existing) continue;
      if (reverseIdentities.has(scopedKeys.idKey) || reverseIdentities.has(scopedKeys.nameKey)) {
        throw new Error(`additive reverse relation stable identity conflicts for ${buffId}`);
      }
      const row = buildReverseRow(fact);
      reverseInserts.push(row);
      reverseIdentities.set(scopedKeys.key, row);
      reverseIdentities.set(scopedKeys.idKey, row);
      reverseIdentities.set(scopedKeys.nameKey, row);
    }
  }

  const before = snapshot({ relationBuffs: relationRows, npcBuffRelations: existingReverseRows, projectionBuffs: projectionRows });
  const after = snapshot({
    relationBuffs: applyUpdates(relationRows, relationUpdates),
    npcBuffRelations: [...existingReverseRows, ...reverseInserts],
    projectionBuffs: applyUpdates(projectionRows, projectionUpdates),
  });
  const proposal = {
    schemaVersion: PROPOSAL_SCHEMA,
    operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
    executable: false,
    applyAllowed: false,
    databaseWrites: false,
    destructiveClear: false,
    target: {
      database: 'terria_v1_relation',
      tables: [...TARGET_TABLES],
      writeTargets: [
        'relation.relation_buffs.inflicting_npcs_json',
        'relation.relation_buffs.source_evidence_json',
        'relation.npc_buff_relations.inflicts',
        'relation.projection_buffs.inflicting_npcs_json',
        'relation.projection_buffs.source_evidence_json',
      ],
      forbiddenTargets: ['landing', 'maint', 'local compatibility', 'immune_npcs_json', 'source_items_json'],
    },
    source: {
      schemaVersion: source.schemaVersion,
      artifactSha256: source.artifactSha256,
      factSources: source.factSources.map(clone),
      factCount: normalizedFacts.length,
      factsSha256: hashJson(normalizedFacts),
    },
    facts: normalizedFacts.map(clone),
    before,
    after,
    changes: {
      relation_buffs: { inserts: [], updates: relationUpdates, unchanged: unchangedRows(relationRows, relationUpdates), preserved: [] },
      npc_buff_relations: { inserts: reverseInserts, updates: [], unchanged: existingReverseRows, preserved: [] },
      projection_buffs: { inserts: [], updates: projectionUpdates, unchanged: unchangedRows(projectionRows, projectionUpdates), preserved: [] },
    },
    summary: {
      facts: normalizedFacts.length,
      relationBuffUpdates: relationUpdates.length,
      reverseRelationInserts: reverseInserts.length,
      projectionBuffUpdates: projectionUpdates.length,
      changedRows: relationUpdates.length + reverseInserts.length + projectionUpdates.length,
    },
  };
  proposal.scopeSha256 = hashJson({
    operationId: proposal.operationId,
    target: proposal.target,
    source: proposal.source,
    before: proposal.before,
    after: proposal.after,
    summary: proposal.summary,
  });
  validateBuffAdditiveRelationProposal(proposal);
  return proposal;
}

export function validateBuffAdditiveRelationProposal(proposal) {
  if (!proposal || proposal.schemaVersion !== PROPOSAL_SCHEMA
      || proposal.operationId !== BUFF_ADDITIVE_RELATION_OPERATION_ID
      || proposal.executable !== false || proposal.applyAllowed !== false
      || proposal.databaseWrites !== false || proposal.destructiveClear !== false) {
    throw new Error('Buff additive relation proposal identity or safety flags are invalid');
  }
  if (JSON.stringify(proposal.target?.tables) !== JSON.stringify(TARGET_TABLES)
      || proposal.target.database !== 'terria_v1_relation'
      || !Array.isArray(proposal.target.writeTargets)
      || proposal.target.writeTargets.some((target) => /landing|maint|local|immune_npcs_json|source_items_json/i.test(target))) {
    throw new Error('Buff additive relation proposal target scope is invalid');
  }
  if (!proposal.source || proposal.source.schemaVersion !== FACT_SOURCE_SCHEMA
      || !HASH_PATTERN.test(String(proposal.source.artifactSha256 ?? ''))
      || !Array.isArray(proposal.source.factSources) || proposal.source.factSources.length === 0) {
    throw new Error('Buff additive relation source contract is invalid');
  }
  validateFacts(proposal.facts, proposal.source);
  for (const descriptor of proposal.source.factSources) validateSourceDescriptor(descriptor);
  const expectedBefore = snapshotHash(proposal.before);
  const expectedAfter = snapshotHash(proposal.after);
  if (proposal.before?.sha256 !== expectedBefore || proposal.after?.sha256 !== expectedAfter
      || !HASH_PATTERN.test(String(proposal.scopeSha256 ?? ''))) {
    throw new Error('Buff additive relation proposal snapshot hash is invalid');
  }
  if (!proposal.changes || Object.keys(proposal.changes).some((table) => !TARGET_TABLES.includes(table))) {
    throw new Error('Buff additive relation proposal change scope is invalid');
  }
  validateChanges(proposal);
  const calculatedChangedRows = proposal.changes.relation_buffs.updates.length
    + proposal.changes.npc_buff_relations.inserts.length
    + proposal.changes.projection_buffs.updates.length;
  if (proposal.summary?.changedRows !== calculatedChangedRows) throw new Error('Buff additive relation proposal summary drifted');
  return true;
}

export async function executeBuffAdditiveRelationTransaction({
  connection,
  proposal,
  lockRuntime,
  readLockedRows,
  consumeDispatchPermit,
  applyMutation,
  readAfterRows,
  journal = null,
} = {}) {
  validateBuffAdditiveRelationProposal(proposal);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function' || typeof connection.rollback !== 'function') {
    throw new TypeError('Buff additive relation transaction connection is required');
  }
  for (const [name, callback] of Object.entries({ lockRuntime, readLockedRows, consumeDispatchPermit, applyMutation, readAfterRows })) {
    if (typeof callback !== 'function') throw new TypeError(`Buff additive relation transaction ${name} callback is required`);
  }
  if (journal != null) {
    for (const name of ['prepared', 'commitUnknown', 'committed', 'rolledBack']) {
      if (typeof journal[name] !== 'function') throw new TypeError(`Buff additive relation journal ${name} callback is required`);
    }
  }
  let began = false;
  let journalPrepared = false;
  let commitAttempted = false;
  try {
    await connection.beginTransaction();
    began = true;
    await lockRuntime({ proposal });
    assertSnapshot('before', await readLockedRows({ proposal }), proposal.before);
    if (journal) {
      await journal.prepared({ proposal });
      journalPrepared = true;
    }
    await consumeDispatchPermit({ proposal });
    await applyMutation({ connection, proposal });
    assertSnapshot('after', await readAfterRows({ proposal }), proposal.after);
    commitAttempted = true;
    try {
      await connection.commit();
    } catch (error) {
      if (journal) await journal.commitUnknown({ proposal, error });
      throw error;
    }
    if (journal) await journal.committed({ proposal });
    return Object.freeze({ status: 'completed', beforeSha256: proposal.before.sha256, afterSha256: proposal.after.sha256 });
  } catch (error) {
    if (began && !commitAttempted) {
      await connection.rollback();
      if (journal && journalPrepared) await journal.rolledBack({ proposal, error });
    }
    throw error;
  }
}

export async function applyBuffAdditiveRelationMutation({ connection, proposal } = {}) {
  validateBuffAdditiveRelationProposal(proposal);
  if (!connection || typeof connection.execute !== 'function') throw new TypeError('Buff additive relation mutation connection is required');
  const updates = [...proposal.changes.relation_buffs.updates, ...proposal.changes.projection_buffs.updates];
  let updateCount = 0;
  for (const change of updates) {
    const table = proposal.changes.relation_buffs.updates.includes(change) ? 'relation_buffs' : 'projection_buffs';
    const keyColumn = table === 'relation_buffs' ? 'record_key' : 'id';
    const keyValue = change.after[keyColumn];
    const identity = table === 'projection_buffs'
      ? ' AND `relation_record_key` = ? AND `source_id` = ? AND `internal_name` = ?'
      : ' AND `source_id` = ? AND `internal_name` = ?';
    const sql = `UPDATE \`terria_v1_relation\`.\`${table}\` SET \`inflicting_npcs_json\` = ?, \`source_evidence_json\` = ? WHERE \`${keyColumn}\` = ?${identity} AND \`status\` = 1 AND \`deleted\` = 0`;
    const values = [change.after.inflicting_npcs_json, change.after.source_evidence_json, keyValue];
    if (table === 'projection_buffs') values.push(change.after.relation_record_key, change.after.source_id, change.after.internal_name);
    else values.push(change.after.source_id, change.after.internal_name);
    const [result] = await connection.execute(sql, values);
    if (Number(result?.affectedRows ?? 0) !== 1) throw new Error(`Buff additive ${table} update receipt is invalid`);
    updateCount += 1;
  }
  let insertCount = 0;
  for (const row of proposal.changes.npc_buff_relations.inserts) {
    const sql = `INSERT INTO \`terria_v1_relation\`.\`npc_buff_relations\` (${REVERSE_COLUMNS.map((column) => `\`${column}\``).join(', ')}) VALUES (${REVERSE_COLUMNS.map(() => '?').join(', ')})`;
    const [result] = await connection.execute(sql, REVERSE_COLUMNS.map((column) => row[column]));
    if (Number(result?.affectedRows ?? 0) !== 1) throw new Error('Buff additive reverse relation insert receipt is invalid');
    insertCount += 1;
  }
  return Object.freeze({ updates: updateCount, inserts: insertCount });
}

function validateFacts(facts, source) {
  if (!Array.isArray(facts) || facts.length === 0) throw new Error('Buff additive relation requires positive facts');
  if (source?.schemaVersion !== FACT_SOURCE_SCHEMA) throw new Error('Buff additive relation source schema is invalid');
  if (!HASH_PATTERN.test(String(source?.artifactSha256 ?? ''))) throw new Error('Buff additive relation source artifact hash is invalid');
  if (!Array.isArray(source?.factSources) || source.factSources.length === 0) throw new Error('Buff additive relation source provenance is missing');
  const sourceKeys = new Set(source.factSources.map((descriptor) => {
    validateSourceDescriptor(descriptor);
    return sourceKey(descriptor);
  }));
  const identities = new Map();
  return facts.map((raw) => {
    const normalized = normalizeFact(raw);
    if (!sourceKeys.has(sourceKey({
      pageTitle: normalized.sourcePage, pageId: normalized.sourcePageId,
      revisionId: normalized.sourceRevisionId, revisionTimestamp: normalized.sourceRevisionTimestamp,
      rawSha256: normalized.sourceRawSha256,
    }))) throw new Error('Buff additive relation fact provenance is not declared');
    const identity = factIdentity(normalized);
    const scopedIdKey = `buff:${normalized.buffId}:${identity.idKey}`;
    const scopedNameKey = `buff:${normalized.buffId}:${identity.nameKey}`;
    if (identities.has(scopedIdKey) || identities.has(scopedNameKey)) {
      const previous = identities.get(scopedIdKey) ?? identities.get(scopedNameKey);
      if (previous.id !== identity.id || previous.internalName !== identity.internalName) {
        throw new Error('Buff additive relation fact stable identity conflicts');
      }
      throw new Error('Buff additive relation fact is duplicated');
    }
    identities.set(scopedIdKey, identity);
    identities.set(scopedNameKey, identity);
    return normalized;
  });
}

function normalizeFact(raw) {
  if (!raw || raw.relationType !== 'inflicts'
      || !positiveId(raw.buffId) || !text(raw.buffInternalName)
      || !Number.isSafeInteger(Number(raw.npcId)) || Number(raw.npcId) === 0
      || !text(raw.internalName) || !text(raw.sourcePage)
      || !positiveId(raw.sourcePageId) || !positiveId(raw.sourceRevisionId)
      || !timestamp(raw.sourceRevisionTimestamp) || !HASH_PATTERN.test(String(raw.sourceRawSha256 ?? ''))) {
    throw new Error('Buff additive relation fact identity or provenance is invalid');
  }
  return {
    buffId: Number(raw.buffId),
    buffInternalName: text(raw.buffInternalName),
    npcId: Number(raw.npcId),
    internalName: text(raw.internalName),
    name: text(raw.name),
    relationType: 'inflicts',
    durationText: text(raw.durationText),
    sourcePage: text(raw.sourcePage),
    sourcePageId: Number(raw.sourcePageId),
    sourceRevisionId: Number(raw.sourceRevisionId),
    sourceRevisionTimestamp: raw.sourceRevisionTimestamp.trim(),
    sourceRawSha256: raw.sourceRawSha256,
  };
}

function validateSourceDescriptor(descriptor) {
  if (!descriptor || !text(descriptor.pageTitle) || !positiveId(descriptor.pageId)
      || !positiveId(descriptor.revisionId) || !timestamp(descriptor.revisionTimestamp)
      || !HASH_PATTERN.test(String(descriptor.rawSha256 ?? ''))) {
    throw new Error('Buff additive relation source descriptor is invalid');
  }
}

function buildEvidence({ source, facts, previous }) {
  return {
    ...previous,
    additiveInflictingEvidence: {
      schemaVersion: EVIDENCE_SCHEMA,
      artifactSha256: source.artifactSha256,
      factSources: source.factSources.map(clone),
      facts: facts.map((fact) => ({
        ...fact,
        sourceRawSha256: fact.sourceRawSha256,
      })),
    },
  };
}

function mergeFacts(existing, additions, buffId) {
  if (!Array.isArray(existing)) throw new Error(`Buff additive inflicting baseline is invalid for ${buffId}`);
  const merged = existing.map(clone);
  const identities = new Map();
  for (const row of merged) {
    const identity = factIdentityFromJson(row);
    if (!identity) continue;
    assertIdentityAvailable(identities, identity);
  }
  for (const fact of additions) {
    const identity = factIdentityFromJson(fact) ?? factIdentity(fact);
    const existingById = identity.idKey == null ? null : identities.get(identity.idKey);
    const existingByName = identity.nameKey == null ? null : identities.get(identity.nameKey);
    if ((existingById && !compatibleIdentity(existingById, identity))
        || (existingByName && !compatibleIdentity(existingByName, identity))) {
      throw new Error(`Buff additive inflicting baseline stable identity conflicts for ${buffId}`);
    }
    if (existingById || existingByName) continue;
    merged.push(Object.fromEntries(JSON_FACT_FIELDS.map((field) => [field, fact[field]])));
    if (identity.idKey != null) identities.set(identity.idKey, identity);
    if (identity.nameKey != null) identities.set(identity.nameKey, identity);
  }
  return merged;
}

function factIdentityFromJson(row) {
  const rawId = row?.npcId ?? row?.npc_source_id ?? row?.sourceId;
  const id = Number.isSafeInteger(Number(rawId)) && Number(rawId) !== 0 ? Number(rawId) : null;
  const internalName = text(row?.internalName ?? row?.npcInternalName ?? row?.npc_internal_name);
  if (!internalName) return null;
  return {
    id,
    internalName,
    key: `${id ?? ''}\u0000${internalName}`,
    idKey: id == null ? null : `id:${id}`,
    nameKey: `name:${internalName}`,
  };
}

function factIdentity(fact) {
  const id = Number(fact.npcId);
  const internalName = text(fact.internalName);
  return { id, internalName, key: `${id}\u0000${internalName}`, idKey: `id:${id}`, nameKey: `name:${internalName}` };
}

function assertIdentityAvailable(map, identity) {
  for (const key of [identity.idKey, identity.nameKey].filter(Boolean)) {
    const previous = map.get(key);
    if (previous && !compatibleIdentity(previous, identity)) {
      throw new Error('Buff additive relation baseline stable identity conflicts');
    }
  }
  map.set(identity.key, identity);
  if (identity.idKey != null) map.set(identity.idKey, identity);
  if (identity.nameKey != null) map.set(identity.nameKey, identity);
}

function compatibleIdentity(left, right) {
  return left?.internalName === right?.internalName
    && (left?.id == null || right?.id == null || left.id === right.id);
}

function buildReverseRow(fact) {
  const recordKey = createRecordKey({ type: 'npc_buff_relation', buffSourceId: fact.buffId,
    buffInternalName: fact.buffInternalName, npcSourceId: fact.npcId, npcInternalName: fact.internalName,
    sourceRevisionId: fact.sourceRevisionId });
  return {
    record_key: recordKey,
    npc_source_id: fact.npcId,
    npc_internal_name: fact.internalName,
    npc_name: fact.name,
    buff_source_id: fact.buffId,
    buff_internal_name: fact.buffInternalName,
    relation_type: 'inflicts',
    duration_ticks: null,
    chance_value: null,
    chance_text: null,
    conditions: fact.durationText,
    source_maint_table: null,
    source_maint_record_key: null,
    source_maint_id: null,
    landing_source_id: null,
    landing_source_key: null,
    landing_content_hash: null,
    source_provider: 'terraria.wiki.gg',
    source_page: fact.sourcePage,
    source_revision_timestamp: mysqlDateTime(fact.sourceRevisionTimestamp),
    confidence: 1,
    reason: 'revision-bound-npc-page-infliction-additive',
    review_status: 'resolved',
    status: 1,
    deleted: 0,
  };
}

function validateChanges(proposal) {
  const relationUpdates = proposal.changes.relation_buffs.updates ?? [];
  const projectionUpdates = proposal.changes.projection_buffs.updates ?? [];
  for (const table of TARGET_TABLES) {
    const changes = proposal.changes[table];
    for (const key of ['inserts', 'updates', 'unchanged', 'preserved']) {
      if (!Array.isArray(changes?.[key])) throw new Error(`Buff additive ${table} change list is invalid`);
    }
  }
  if (proposal.changes.relation_buffs.inserts.length > 0 || proposal.changes.projection_buffs.inserts.length > 0
      || proposal.changes.npc_buff_relations.updates.length > 0) throw new Error('Buff additive relation mutation is not insert/update scoped');
  for (const change of [...relationUpdates, ...projectionUpdates]) {
    if (!change?.before || !change.after || !Array.isArray(change.changedColumns)
        || JSON.stringify([...change.changedColumns].sort()) !== JSON.stringify(['inflicting_npcs_json', 'source_evidence_json'])) {
      throw new Error('Buff additive relation update columns are invalid');
    }
    if (change.before.immune_npcs_json !== change.after.immune_npcs_json
        || change.before.source_items_json !== change.after.source_items_json) {
      throw new Error('Buff additive relation update changed a forbidden fact group');
    }
  }
  for (const row of proposal.changes.npc_buff_relations.inserts) {
    if (!HASH_PATTERN.test(String(row.record_key ?? '').replace(/^/, 'sha256:'))
        || row.relation_type !== 'inflicts' || !isActive(row)) throw new Error('Buff additive reverse relation insert is invalid');
  }
}

function buildUpdate(before, patch, table) {
  const after = { ...before, ...patch };
  return { before: clone(before), after, changedColumns: ['inflicting_npcs_json', 'source_evidence_json'] };
}

function applyUpdates(rows, updates) {
  const byKey = new Map(updates.map((change) => [String(change.after.record_key ?? change.after.id), change.after]));
  return rows.map((row) => byKey.get(String(row.record_key ?? row.id)) ?? clone(row));
}

function unchangedRows(rows, updates) {
  const changed = new Set(updates.map((change) => String(change.after.record_key ?? change.after.id)));
  return rows.filter((row) => !changed.has(String(row.record_key ?? row.id))).map(clone);
}

function selectTargetRows(rows, buffIds, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} baseline rows are invalid`);
  const selected = rows.filter((row) => buffIds.has(Number(row?.source_id)));
  if (selected.length !== buffIds.size) throw new Error(`${label} baseline is missing`);
  return selected.map(clone);
}

function indexUnique(rows, key, label) {
  const index = new Map();
  for (const row of rows) {
    const identity = key(row);
    if (!Number.isSafeInteger(identity) || index.has(identity)) throw new Error(`${label} is duplicated`);
    index.set(identity, row);
  }
  return index;
}

function indexReverseIdentities(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!isActive(row) || row.relation_type !== 'inflicts') continue;
    const identity = factIdentity({ npcId: row.npc_source_id, internalName: row.npc_internal_name });
    if (!identity) continue;
    const scoped = reverseIdentityKeys(identity, Number(row.buff_source_id));
    for (const key of [scoped.idKey, scoped.nameKey]) {
      const previous = index.get(key);
      if (previous && (previous.npc_source_id !== row.npc_source_id || previous.npc_internal_name !== row.npc_internal_name)) {
        throw new Error('Buff additive reverse relation stable identity conflicts');
      }
    }
    index.set(scoped.key, row);
    index.set(scoped.idKey, row);
    index.set(scoped.nameKey, row);
  }
  return index;
}

function reverseIdentityKeys(identity, buffId) {
  const prefix = `buff:${buffId}:`;
  return {
    key: `${prefix}${identity.key}`,
    idKey: `${prefix}${identity.idKey}`,
    nameKey: `${prefix}${identity.nameKey}`,
  };
}

function snapshot(value) {
  const body = {
    relationBuffs: value.relationBuffs.map(snapshotStableRow),
    npcBuffRelations: value.npcBuffRelations.map(snapshotStableReverseRow),
    projectionBuffs: value.projectionBuffs.map(snapshotStableRow),
  };
  return { ...body, sha256: snapshotHash(body) };
}

function snapshotStableRow(row) {
  const normalized = clone(row);
  delete normalized.id;
  delete normalized.created_at;
  delete normalized.updated_at;
  return normalized;
}

function snapshotStableReverseRow(row) {
  const normalized = snapshotStableRow(row);
  if (!Object.hasOwn(normalized, 'raw_json')) normalized.raw_json = null;
  for (const field of ['confidence', 'chance_value']) {
    if (normalized[field] != null && normalized[field] !== '') normalized[field] = Number(normalized[field]);
  }
  return normalized;
}

function assertSnapshot(label, actual, expected) {
  const groups = ['relationBuffs', 'npcBuffRelations', 'projectionBuffs'];
  const shapeValid = actual && groups.every((group) => Array.isArray(actual[group]))
    && Object.keys(actual).every((key) => groups.includes(key) || key === 'sha256');
  if (!shapeValid || !expected || snapshot(actual).sha256 !== expected.sha256) {
    throw new Error(`Buff additive relation ${label}-set drifted`);
  }
}

function snapshotHash(snapshotValue) {
  const { sha256: _sha256, ...body } = snapshotValue ?? {};
  return hashJson(body);
}

function parseArray(value, label) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw new Error(`${label} is invalid`); }
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function parseObject(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return clone(value);
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new Error('Buff additive relation source evidence JSON is invalid'); }
}

function sourceKey(value) {
  return [value.pageTitle, value.pageId, value.revisionId, new Date(value.revisionTimestamp).toISOString(), value.rawSha256].join('\u0000');
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function groupFacts(facts) {
  const groups = new Map();
  for (const fact of facts) {
    const group = groups.get(fact.buffId) ?? [];
    group.push(fact);
    groups.set(fact.buffId, group);
  }
  return groups;
}

function isActive(row) {
  return Number(row?.status ?? 1) === 1 && Number(row?.deleted ?? 0) === 0;
}

function positiveId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function mysqlDateTime(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Buff additive relation source revision timestamp is invalid');
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function text(value) {
  const result = typeof value === 'string' ? value.trim() : '';
  return result || null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export { TARGET_TABLES as BUFF_ADDITIVE_RELATION_TABLES };
