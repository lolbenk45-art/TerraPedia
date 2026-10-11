import { createHash } from 'node:crypto';
import { createRecordKey } from './relation-trace.mjs';

export const BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID = 'canonical-buff-npc-infliction-dedup';

const SCHEMA_VERSION = 'buff-npc-infliction-dedup-proposal/v2';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const EXPECTED_TARGETS = Object.freeze([
  { npcSourceId: 222, npcInternalName: 'QueenBee', buffSourceId: 20, buffInternalName: 'Poisoned' },
  { npcSourceId: 370, npcInternalName: 'DukeFishron', buffSourceId: 30, buffInternalName: 'Bleeding' },
  { npcSourceId: 370, npcInternalName: 'DukeFishron', buffSourceId: 148, buffInternalName: 'Rabies' },
  { npcSourceId: 668, npcInternalName: 'Deerclops', buffSourceId: 32, buffInternalName: 'Slow' },
  { npcSourceId: 668, npcInternalName: 'Deerclops', buffSourceId: 47, buffInternalName: 'Frozen' }
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

export function hashBuffNpcInflictionDedupJson(value) {
  return hashJson(value);
}

function assertHash(value, label) {
  if (!HASH_PATTERN.test(String(value ?? ''))) throw new Error(`${label} must be a sha256 hash`);
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function targetKey(value) {
  return `${Number(value?.npcSourceId)}:${Number(value?.buffSourceId)}`;
}

function assertSourceFacts(facts, source) {
  assertHash(source?.artifactSha256, 'source artifact hash');
  assertHash(source?.manifestSha256, 'source manifest hash');
  if (!Array.isArray(facts)) throw new Error('source facts must be an array');
  const factByKey = new Map();
  for (const fact of facts) {
    const key = targetKey({ npcSourceId: fact?.npcSourceId, buffSourceId: fact?.buffId });
    if (factByKey.has(key)) throw new Error(`duplicate source fact ${key}`);
    if (fact?.relationType !== 'inflicts' || !Number.isSafeInteger(Number(fact?.npcSourceId))
        || !Number.isSafeInteger(Number(fact?.buffId))
        || typeof fact?.npcInternalName !== 'string' || !fact.npcInternalName.trim()
        || typeof fact?.buffInternalName !== 'string' || !fact.buffInternalName.trim()
        || typeof fact?.sourcePage !== 'string' || !fact.sourcePage.trim()
        || !Number.isSafeInteger(Number(fact?.sourcePageId)) || Number(fact.sourcePageId) <= 0
        || !Number.isSafeInteger(Number(fact?.sourceRevisionId)) || Number(fact.sourceRevisionId) <= 0
        || typeof fact?.sourceRevisionTimestamp !== 'string'
        || !Number.isFinite(Date.parse(fact.sourceRevisionTimestamp))) {
      throw new Error('source fact identity or revision binding is invalid');
    }
    assertHash(fact.sourceRawSha256, 'source raw page hash');
    factByKey.set(key, fact);
  }
  for (const target of EXPECTED_TARGETS) {
    const fact = factByKey.get(`${target.npcSourceId}:${target.buffSourceId}`);
    if (!fact || fact.npcInternalName !== target.npcInternalName
        || fact.buffInternalName !== target.buffInternalName) {
      throw new Error('source fact scope does not match the five reviewed identities');
    }
  }
  if (facts.length !== EXPECTED_TARGETS.length) {
    throw new Error('source fact scope must contain exactly the five reviewed inflicts');
  }
  return [...factByKey.values()].sort((left, right) => (
    Number(left.npcSourceId) - Number(right.npcSourceId) || Number(left.buffId) - Number(right.buffId)
  ));
}

function normalizeMaintSourceRows(sourceRows) {
  if (!Array.isArray(sourceRows) || sourceRows.length !== EXPECTED_TARGETS.length) {
    throw new Error('current Buff maint source rows must contain the exact five reviewed identities');
  }
  const expectedById = new Map(EXPECTED_TARGETS.map(target => [target.buffSourceId, target]));
  const seen = new Set();
  const normalized = sourceRows.map((row) => {
    const sourceId = Number(row?.sourceId ?? row?.source_id);
    const target = expectedById.get(sourceId);
    const internalName = String(row?.internalName ?? row?.internal_name ?? '');
    const status = Number(row?.status);
    const deleted = Number(row?.deleted);
    const rawValue = row?.rawJson ?? row?.raw_json;
    const rawJson = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
    if (!target || seen.has(sourceId) || internalName !== target.buffInternalName
        || status !== 1 || deleted !== 0 || typeof rawJson !== 'string') {
      throw new Error('Buff maint source row identity or active state is invalid');
    }
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error('Buff maint source raw_json is invalid');
    }
    if (!Array.isArray(parsed?.inflictingNpcs)) {
      throw new Error(`Buff maint source inflictingNpcs is invalid: ${sourceId}`);
    }
    seen.add(sourceId);
    return { sourceId, internalName, rawJson, status, deleted };
  }).sort((left, right) => left.sourceId - right.sourceId);
  return normalized;
}

function deriveCanonicalSourceKeys(sourceRows) {
  const rowsById = new Map(sourceRows.map(row => [row.sourceId, row]));
  return EXPECTED_TARGETS.map((target) => {
    const source = JSON.parse(rowsById.get(target.buffSourceId).rawJson);
    const matchingIndexes = source.inflictingNpcs.flatMap((npc, index) => {
      const internalName = npc?.internalName ?? npc?.npcInternalName;
      if (internalName !== target.npcInternalName) return [];
      const explicitId = npc?.npcId ?? npc?.npcSourceId ?? npc?.sourceId;
      if (explicitId != null && Number(explicitId) !== target.npcSourceId) {
        throw new Error(`Buff maint source NPC identity conflicts: ${targetKey(target)}`);
      }
      return [index];
    });
    if (matchingIndexes.length === 0) {
      throw new Error(`Buff maint source does not contain the reviewed infliction: ${targetKey(target)}`);
    }
    if (matchingIndexes.length > 2) {
      throw new Error(`Buff maint source has too many repeated inflictions: ${targetKey(target)}`);
    }
    const sourceRecordKeys = matchingIndexes.map(sortOrder => createRecordKey({
      type: 'npc_buff_relation',
      buffSourceId: target.buffSourceId,
      npcInternalName: target.npcInternalName,
      npcSourceId: target.npcSourceId,
      sortOrder
    }));
    return {
      ...target,
      canonicalRecordKey: sourceRecordKeys[0],
      sourceRecordKeys
    };
  });
}

function assertExactDuplicatePair(target, canonicalRecordKey, sourceRecordKeys, currentRows) {
  const pair = currentRows.filter((row) => Number(row.npc_source_id) === target.npcSourceId
    && Number(row.buff_source_id) === target.buffSourceId
    && row.relation_type === 'inflicts'
    && active(row)).sort((left, right) => Number(left.id) - Number(right.id));
  if (pair.length !== 2) throw new Error(`pair must contain exactly two active rows: ${targetKey(target)}`);
  if (sourceRecordKeys.some(recordKey => !pair.some(row => row.record_key === recordKey))) {
    throw new Error(`source-order relation key is missing from the duplicate pair: ${targetKey(target)}`);
  }
  const retained = pair.find(row => row.record_key === canonicalRecordKey);
  const retired = pair.find(row => row.record_key !== canonicalRecordKey);
  if (!retained || !retired || retained.npc_internal_name !== target.npcInternalName
      || retired.npc_internal_name !== target.npcInternalName
      || retained.buff_internal_name !== target.buffInternalName
      || retired.buff_internal_name !== target.buffInternalName) {
    throw new Error(`duplicate pair identity or keeper choice drifted: ${targetKey(target)}`);
  }
  const normalized = pair.map((row) => {
    const copy = clone(row);
    delete copy.id;
    delete copy.record_key;
    return copy;
  });
  if (hashJson(normalized[0]) !== hashJson(normalized[1])) {
    throw new Error(`pair rows are not exact duplicates: ${targetKey(target)}`);
  }
  if (typeof retained.record_key !== 'string' || !retained.record_key.trim()
      || typeof retired.record_key !== 'string' || !retired.record_key.trim()
      || retained.record_key === retired.record_key) {
    throw new Error(`pair record keys are invalid: ${targetKey(target)}`);
  }
  return { retained, retired };
}

function proposalPayload(proposal) {
  const copy = clone(proposal);
  delete copy.proposalSha256;
  return copy;
}

function buildProposal({
  facts = [],
  source,
  currentRows = [],
  currentBuffRows = [],
  serverUuid,
  generatedAt = new Date().toISOString()
} = {}) {
  if (!Array.isArray(currentRows) || currentRows.length === 0) throw new Error('current NPC-Buff rows are required');
  if (typeof serverUuid !== 'string' || !serverUuid.trim()) throw new Error('MySQL server UUID is required');
  const normalizedFacts = assertSourceFacts(facts, source);
  const maintSourceRows = normalizeMaintSourceRows(currentBuffRows);
  const canonicalSourceTargets = deriveCanonicalSourceKeys(maintSourceRows);
  const rows = currentRows.map(clone).sort((left, right) => Number(left.id) - Number(right.id));
  const ids = new Set();
  const keys = new Set();
  for (const row of rows) {
    const id = Number(row?.id);
    const recordKey = String(row?.record_key ?? '').trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !recordKey || ids.has(id) || keys.has(recordKey)) {
      throw new Error('current NPC-Buff row identity is invalid or duplicated');
    }
    ids.add(id);
    keys.add(recordKey);
  }

  const retirements = [];
  const retained = [];
  for (const target of canonicalSourceTargets) {
    const pair = assertExactDuplicatePair(target, target.canonicalRecordKey, target.sourceRecordKeys, rows);
    retained.push(clone(pair.retained));
    const after = { ...pair.retired, status: 0, deleted: 1 };
    retirements.push({
      key: pair.retired.record_key,
      before: clone(pair.retired),
      after,
      changedColumns: ['status', 'deleted']
    });
  }
  retirements.sort((left, right) => Number(left.before.id) - Number(right.before.id));
  retained.sort((left, right) => Number(left.id) - Number(right.id));
  const retirementsByKey = new Map(retirements.map((change) => [change.key, change.after]));
  const afterRows = rows.map((row) => clone(retirementsByKey.get(row.record_key) ?? row));
  const activeCount = (values) => values.filter(active).length;

  const proposal = {
    schemaVersion: SCHEMA_VERSION,
    operationId: BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID,
    generatedAt,
    executable: false,
    applyAllowed: false,
    databaseWrites: false,
    destructiveClear: false,
    serverUuid,
    target: {
      database: 'terria_v1_relation',
      table: 'terria_v1_relation.npc_buff_relations',
      mutationMode: 'soft-retire-exact-duplicates',
      relationType: 'inflicts',
      updateColumns: ['status', 'deleted'],
      forbiddenTargets: ['relation_buffs', 'projection_buffs', 'immune', 'item_buff_relations']
    },
    source: {
      schemaVersion: 'buff-npc-page-infliction-evidence/v1',
      artifactSha256: source.artifactSha256,
      manifestSha256: source.manifestSha256,
      factCount: normalizedFacts.length,
      factsSha256: hashJson(normalizedFacts),
      facts: normalizedFacts.map(clone)
    },
    maintSource: {
      schemaVersion: 'buff-maint-infliction-source-snapshot/v1',
      rowCount: maintSourceRows.length,
      rowsSha256: hashJson(maintSourceRows),
      rows: maintSourceRows
    },
    scope: EXPECTED_TARGETS.map(clone),
    before: {
      rowCount: rows.length,
      activeRowCount: activeCount(rows),
      rowsSha256: hashJson(rows),
      rows
    },
    after: {
      rowCount: afterRows.length,
      activeRowCount: activeCount(afterRows),
      rowsSha256: hashJson(afterRows),
      rows: afterRows
    },
    changes: { retirements, retained },
    summary: {
      sourceFactCount: normalizedFacts.length,
      targetPairCount: EXPECTED_TARGETS.length,
      currentActiveRows: EXPECTED_TARGETS.length * 2,
      retainedActiveRows: EXPECTED_TARGETS.length,
      retirementCount: retirements.length,
      tableActiveRowsBefore: activeCount(rows),
      tableActiveRowsAfter: activeCount(afterRows)
    }
  };
  proposal.scopeSha256 = hashJson({
    operationId: proposal.operationId,
    target: proposal.target,
    source: proposal.source,
    maintSource: proposal.maintSource,
    scope: proposal.scope,
    before: proposal.before,
    after: proposal.after,
    changes: proposal.changes,
    summary: proposal.summary
  });
  proposal.proposalSha256 = hashJson(proposalPayload(proposal));
  return proposal;
}

export function buildBuffNpcInflictionDedupProposal(input = {}) {
  const proposal = buildProposal(input);
  validateBuffNpcInflictionDedupProposal(proposal);
  return proposal;
}

export function validateBuffNpcInflictionDedupProposal(proposal) {
  if (!proposal || proposal.schemaVersion !== SCHEMA_VERSION
      || proposal.operationId !== BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID
      || proposal.executable !== false || proposal.applyAllowed !== false
      || proposal.databaseWrites !== false || proposal.destructiveClear !== false) {
    throw new Error('Buff NPC infliction dedup proposal identity or safety flags are invalid');
  }
  if (proposal.target?.database !== 'terria_v1_relation'
      || proposal.target?.table !== 'terria_v1_relation.npc_buff_relations'
      || proposal.target?.mutationMode !== 'soft-retire-exact-duplicates'
      || JSON.stringify(proposal.target?.updateColumns) !== JSON.stringify(['status', 'deleted'])
      || JSON.stringify(proposal.target?.forbiddenTargets) !== JSON.stringify(['relation_buffs', 'projection_buffs', 'immune', 'item_buff_relations'])) {
    throw new Error('Buff NPC infliction dedup proposal target scope is invalid');
  }
  if (proposal.source?.schemaVersion !== 'buff-npc-page-infliction-evidence/v1'
      || !Array.isArray(proposal.source.facts)
      || proposal.source.factCount !== proposal.source.facts.length
      || hashJson(proposal.source.facts) !== proposal.source.factsSha256) {
    throw new Error('Buff NPC infliction dedup proposal source binding is invalid');
  }
  if (proposal.maintSource?.schemaVersion !== 'buff-maint-infliction-source-snapshot/v1'
      || !Array.isArray(proposal.maintSource.rows)
      || proposal.maintSource.rowCount !== proposal.maintSource.rows.length
      || proposal.maintSource.rowsSha256 !== hashJson(proposal.maintSource.rows)) {
    throw new Error('Buff NPC infliction dedup maint-source snapshot is invalid');
  }
  const normalizedFacts = assertSourceFacts(proposal.source.facts, proposal.source);
  if (JSON.stringify(proposal.scope) !== JSON.stringify(EXPECTED_TARGETS)
      || JSON.stringify(proposal.scope.map((target) => targetKey(target)).sort())
        !== JSON.stringify(normalizedFacts.map((fact) => `${fact.npcSourceId}:${fact.buffId}`).sort())) {
    throw new Error('Buff NPC infliction dedup proposal scope does not match source facts');
  }
  if (!Array.isArray(proposal.before?.rows) || !Array.isArray(proposal.after?.rows)
      || proposal.before.rowCount !== proposal.before.rows.length
      || proposal.after.rowCount !== proposal.after.rows.length
      || proposal.before.rowsSha256 !== hashJson(proposal.before.rows)
      || proposal.after.rowsSha256 !== hashJson(proposal.after.rows)) {
    throw new Error('Buff NPC infliction dedup proposal before/after snapshot is invalid');
  }
  const rebuilt = buildProposal({
    facts: normalizedFacts,
    source: proposal.source,
    currentBuffRows: proposal.maintSource?.rows,
    currentRows: proposal.before.rows,
    serverUuid: proposal.serverUuid,
    generatedAt: proposal.generatedAt
  });
  if (JSON.stringify(proposal.changes) !== JSON.stringify(rebuilt.changes)
      || JSON.stringify(proposal.maintSource) !== JSON.stringify(rebuilt.maintSource)
      || JSON.stringify(proposal.after) !== JSON.stringify(rebuilt.after)
      || JSON.stringify(proposal.summary) !== JSON.stringify(rebuilt.summary)) {
    throw new Error('Buff NPC infliction dedup retirement is invalid');
  }
  if (proposal.scopeSha256 !== rebuilt.scopeSha256
      || proposal.proposalSha256 !== hashJson(proposalPayload(proposal))) {
    throw new Error('Buff NPC infliction dedup proposal hashes do not match its contents');
  }
  return true;
}

export async function applyBuffNpcInflictionDedupMutation({ proposal, connection } = {}) {
  validateBuffNpcInflictionDedupProposal(proposal);
  if (!connection || typeof connection.execute !== 'function') {
    throw new TypeError('Buff NPC infliction dedup connection is required');
  }
  let retirementCount = 0;
  for (const change of proposal.changes.retirements) {
    const [result] = await connection.execute(
      'UPDATE `terria_v1_relation`.`npc_buff_relations` SET `status` = ?, `deleted` = ?, `updated_at` = `updated_at` WHERE `id` = ? AND `record_key` = ? AND `status` = 1 AND `deleted` = 0',
      [change.after.status, change.after.deleted, change.before.id, change.before.record_key]
    );
    if (Number(result?.affectedRows ?? 0) !== 1) {
      throw new Error(`NPC infliction duplicate retirement receipt is invalid: ${change.before.id}`);
    }
    retirementCount += 1;
  }
  return Object.freeze({ retirementCount });
}

export async function executeBuffNpcInflictionDedupTransaction({
  connection,
  proposal,
  packet = null,
  lockRuntime,
  readLockedMaintSourceRows,
  readLockedRows,
  consumeDispatchPermit,
  applyMutation,
  readAfterRows,
  journal = null
} = {}) {
  validateBuffNpcInflictionDedupProposal(proposal);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function' || typeof connection.rollback !== 'function') {
    throw new TypeError('Buff NPC infliction dedup transaction connection is required');
  }
  for (const [name, callback] of Object.entries({
    lockRuntime,
    readLockedMaintSourceRows,
    readLockedRows,
    consumeDispatchPermit,
    applyMutation,
    readAfterRows
  })) {
    if (typeof callback !== 'function') throw new TypeError(`Buff NPC infliction dedup ${name} callback is required`);
  }
  if (journal != null) {
    for (const name of ['prepared', 'rolledBack', 'commitUnknown', 'committed']) {
      if (typeof journal[name] !== 'function') throw new TypeError(`Buff NPC infliction dedup journal ${name} callback is required`);
    }
  }

  let begun = false;
  let commitAttempted = false;
  let journalPrepared = false;
  try {
    await connection.beginTransaction();
    begun = true;
    await lockRuntime({ packet, proposal });
    const lockedMaintSourceRows = normalizeMaintSourceRows(await readLockedMaintSourceRows({ packet, proposal }));
    if (hashJson(lockedMaintSourceRows) !== proposal.maintSource.rowsSha256) {
      throw new Error('NPC infliction dedup locked source snapshot drifted');
    }
    const beforeRows = await readLockedRows({ packet, proposal });
    if (!Array.isArray(beforeRows) || beforeRows.length !== proposal.before.rowCount
        || hashJson(beforeRows) !== proposal.before.rowsSha256) {
      throw new Error('NPC infliction dedup locked before-set drifted');
    }
    if (journal) {
      await journal.prepared({ packet, proposal });
      journalPrepared = true;
    }
    await consumeDispatchPermit({ packet, proposal });
    const mutationResult = await applyMutation({ connection, packet, proposal });
    if (mutationResult?.retirementCount !== proposal.summary.retirementCount) {
      throw new Error('NPC infliction dedup mutation receipt count drifted');
    }
    const afterRows = await readAfterRows({ packet, proposal });
    if (!Array.isArray(afterRows) || afterRows.length !== proposal.after.rowCount
        || hashJson(afterRows) !== proposal.after.rowsSha256) {
      throw new Error('NPC infliction dedup locked after-set drifted');
    }
    commitAttempted = true;
    try {
      await connection.commit();
    } catch (error) {
      if (journal) await journal.commitUnknown({ packet, proposal, error });
      throw error;
    }
    if (journal) {
      try {
        await journal.committed({ packet, proposal });
      } catch (error) {
        await journal.commitUnknown({ packet, proposal, error }).catch(() => {});
        throw error;
      }
    }
    return Object.freeze({
      status: 'completed',
      retirementCount: mutationResult.retirementCount,
      beforeRowsSha256: proposal.before.rowsSha256,
      afterRowsSha256: proposal.after.rowsSha256
    });
  } catch (error) {
    if (begun && !commitAttempted) {
      await connection.rollback();
      if (journal && journalPrepared) await journal.rolledBack({ packet, proposal, error });
    }
    throw error;
  }
}
