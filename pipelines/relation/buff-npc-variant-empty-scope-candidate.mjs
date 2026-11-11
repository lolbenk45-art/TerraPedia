import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 'buff-npc-variant-empty-scope-candidate/v1';
const SCOPE_SCHEMA_VERSION = 'buff-npc-variant-scope-contract/v1';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const EXPECTED_MISSING_BASELINE_IDS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => 389 + index),
);
const TARGET_TABLES = Object.freeze([
  'relation_buffs',
  'npc_buff_relations',
  'projection_buffs',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashValue(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function assertHash(value, label) {
  if (!HASH_PATTERN.test(String(value ?? ''))) throw new Error(`${label} must be a sha256 hash`);
}

function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function positiveId(value, label) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error(`${label} is invalid`);
  return Number(value);
}

function npcId(value, label) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) === 0) throw new Error(`${label} is invalid`);
  return Number(value);
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${label} is invalid`);
  return value;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function parseFacts(value, label) {
  let facts;
  try {
    facts = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error(`${label} JSON is invalid`);
  }
  if (!Array.isArray(facts)) throw new Error(`${label} must be an array`);
  return facts.map((fact, index) => {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
      throw new Error(`${label} fact ${index} is invalid`);
    }
    return clone(fact);
  });
}

function assertReadOnlyScope(scope) {
  if (!scope || scope.schemaVersion !== SCOPE_SCHEMA_VERSION
      || scope.databaseWrites !== false || scope.networkRequests !== 0
      || scope.executable !== false || scope.applyAllowed !== false
      || !Array.isArray(scope.statuses)) {
    throw new Error('variant empty-scope candidate requires a read-only scope contract');
  }
  const missing = scope.replay?.missingBaselineIds;
  if (JSON.stringify(missing) !== JSON.stringify(EXPECTED_MISSING_BASELINE_IDS)
      || Number(scope.replay?.baselineMissing) !== EXPECTED_MISSING_BASELINE_IDS.length) {
    throw new Error('variant empty-scope candidate missing-baseline fence drifted');
  }
  const byId = new Map();
  for (const row of scope.statuses) {
    const id = npcId(row?.npcId, 'variant scope NPC ID');
    const internalName = text(row?.internalName, 'variant scope internal name');
    if (byId.has(id)) throw new Error(`variant scope NPC ${id} is duplicated`);
    if (row.status === 'variant-owned-complete-empty') {
      if (row.preserveBaseline !== false
          || row.publication !== 'replacement-eligible-after-full-chain-review') {
        throw new Error(`complete-empty NPC ${id} is not replacement eligible`);
      }
      assertSource(row.source, `complete-empty NPC ${id} source`);
    } else if (row.status === 'unknown') {
      if (row.preserveBaseline !== true || row.publication !== 'preserve-baseline') {
        throw new Error(`unknown NPC ${id} must preserve its baseline`);
      }
    } else if (row.status !== 'variant-owned-positive' || row.preserveBaseline !== true) {
      throw new Error(`variant scope NPC ${id} has an unsupported status`);
    }
    byId.set(id, { id, internalName, status: row.status, row });
  }
  return byId;
}

function assertSource(source, label) {
  if (!source || !text(source.pageTitle, `${label} page title`)
      || !Number.isSafeInteger(Number(source.pageId)) || Number(source.pageId) <= 0
      || !Number.isSafeInteger(Number(source.revisionId)) || Number(source.revisionId) <= 0) {
    throw new Error(`${label} identity is invalid`);
  }
  timestamp(source.revisionTimestamp, `${label} revision timestamp`);
  assertHash(source.rawSha256, `${label} raw hash`);
}

function normalizeRelationRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} rows are required`);
  const bySourceId = new Map();
  const byKey = new Set();
  const normalized = rows.map((row) => {
    const sourceId = positiveId(row?.source_id, `${label} source ID`);
    const internalName = text(row?.internal_name, `${label} internal name`);
    const recordKey = text(row?.record_key, `${label} record key`);
    if (bySourceId.has(sourceId) || byKey.has(recordKey)) throw new Error(`${label} identity is duplicated`);
    if (!active(row)) throw new Error(`${label} row is not active`);
    bySourceId.set(sourceId, row);
    byKey.add(recordKey);
    return { ...row, source_id: sourceId, internal_name: internalName, record_key: recordKey };
  });
  return { rows: normalized, bySourceId };
}

function normalizeProjectionRows(rows) {
  if (!Array.isArray(rows)) throw new Error('projection Buff rows are required');
  const bySourceId = new Map();
  const byId = new Set();
  const normalized = rows.map((row) => {
    const sourceId = positiveId(row?.source_id, 'projection Buff source ID');
    const id = positiveId(row?.id, 'projection Buff ID');
    const internalName = text(row?.internal_name, 'projection Buff internal name');
    if (bySourceId.has(sourceId) || byId.has(id)) throw new Error('projection Buff identity is duplicated');
    if (!active(row)) throw new Error('projection Buff row is not active');
    bySourceId.set(sourceId, row);
    byId.add(id);
    return { ...row, source_id: sourceId, id, internal_name: internalName };
  });
  return { rows: normalized, bySourceId };
}

function normalizeReverseRows(rows) {
  if (!Array.isArray(rows)) throw new Error('NPC Buff relation rows are required');
  const byKey = new Set();
  const normalized = rows.map((row) => {
    const recordKey = text(row?.record_key, 'NPC Buff relation record key');
    if (byKey.has(recordKey)) throw new Error('NPC Buff relation identity is duplicated');
    byKey.add(recordKey);
    npcId(row?.npc_source_id, 'NPC Buff relation NPC source ID');
    positiveId(row?.buff_source_id, 'NPC Buff relation Buff source ID');
    text(row?.npc_internal_name, 'NPC Buff relation NPC internal name');
    text(row?.buff_internal_name, 'NPC Buff relation Buff internal name');
    if (row?.relation_type !== 'inflicts' && row?.relation_type !== 'immune') {
      throw new Error('NPC Buff relation type is invalid');
    }
    if (!Number.isInteger(Number(row?.status)) || !Number.isInteger(Number(row?.deleted))) {
      throw new Error('NPC Buff relation lifecycle flags are invalid');
    }
    return { ...row };
  });
  return { rows: normalized, byKey };
}

function factMatchesTarget(fact, target) {
  return Number(fact?.npcId) === target.id && String(fact?.internalName ?? '') === target.internalName;
}

function assertFactIdMatchesTarget(fact, target) {
  if (Number(fact?.npcId) === target.id && String(fact?.internalName ?? '') !== target.internalName) {
    throw new Error(`Buff fact NPC ${target.id} stable identity drifted`);
  }
}

function buildBuffJsonUpdate(row, targetById, displayOnlyFacts, buffSourceId) {
  const facts = parseFacts(row.inflicting_npcs_json, `Buff ${buffSourceId} inflicting NPC`);
  const kept = [];
  const removed = [];
  const seenRemoved = new Set();
  for (const fact of facts) {
    for (const target of targetById.values()) assertFactIdMatchesTarget(fact, target);
    const target = [...targetById.values()].find((candidate) => factMatchesTarget(fact, candidate));
    if (target) {
      const key = `${target.id}:${target.internalName}`;
      if (seenRemoved.has(key)) throw new Error(`Buff ${buffSourceId} has duplicate empty-scope fact ${key}`);
      seenRemoved.add(key);
      removed.push({ npcId: target.id, internalName: target.internalName });
      continue;
    }
    const displayTarget = [...targetById.values()].find((candidate) => String(fact?.internalName ?? '') === candidate.internalName);
    if (displayTarget) {
      displayOnlyFacts.push({
        buffSourceId,
        npcId: fact?.npcId != null && Number.isSafeInteger(Number(fact.npcId)) ? Number(fact.npcId) : null,
        internalName: displayTarget.internalName,
      });
    }
    kept.push(fact);
  }
  return { facts, kept, removed };
}

function sortBySourceId(left, right) {
  return Number(left.source_id) - Number(right.source_id);
}

function sortByNpcId(left, right) {
  return Number(left.npc_source_id) - Number(right.npc_source_id)
    || Number(left.buff_source_id) - Number(right.buff_source_id);
}

export function buildBuffNpcVariantEmptyScopeCandidate({
  scopeContract,
  relationBuffRows,
  projectionBuffRows,
  npcBuffRelationRows,
} = {}) {
  const scopeById = assertReadOnlyScope(scopeContract);
  const emptyById = new Map([...scopeById.entries()]
    .filter(([, value]) => value.status === 'variant-owned-complete-empty'));
  if (emptyById.size === 0) throw new Error('variant empty-scope candidate has no complete-empty rows');

  const relation = normalizeRelationRows(relationBuffRows, 'relation Buff');
  const projection = normalizeProjectionRows(projectionBuffRows);
  const reverse = normalizeReverseRows(npcBuffRelationRows);
  const displayOnlyFacts = [];
  const relationUpdates = [];
  const projectionUpdates = [];
  const relationRemovalsBySourceId = new Map();
  const relationAfter = relation.rows.map((row) => {
    const result = buildBuffJsonUpdate(row, emptyById, displayOnlyFacts, row.source_id);
    relationRemovalsBySourceId.set(row.source_id, result.removed);
    if (result.removed.length === 0) return clone(row);
    const after = { ...row, inflicting_npcs_json: JSON.stringify(result.kept) };
    relationUpdates.push({
      key: row.record_key,
      before: clone(row),
      after: clone(after),
      changedColumns: ['inflicting_npcs_json'],
      removedFacts: result.removed,
    });
    return after;
  });

  const projectionAfter = projection.rows.map((row) => {
    const relationRow = relation.bySourceId.get(row.source_id);
    if (!relationRow) throw new Error(`projection Buff ${row.source_id} has no relation lineage`);
    if (String(row.relation_record_key) !== String(relationRow.record_key)
        || row.internal_name !== relationRow.internal_name) {
      throw new Error(`projection Buff ${row.source_id} lineage drifted`);
    }
    const result = buildBuffJsonUpdate(row, emptyById, [], row.source_id);
    const relationRemoved = relationRemovalsBySourceId.get(row.source_id) ?? [];
    if (JSON.stringify(result.removed) !== JSON.stringify(relationRemoved)) {
      throw new Error(`relation/projection Buff ${row.source_id} target scope drifted`);
    }
    if (result.removed.length === 0) return clone(row);
    const after = { ...row, inflicting_npcs_json: JSON.stringify(result.kept) };
    projectionUpdates.push({
      key: row.id,
      before: clone(row),
      after: clone(after),
      changedColumns: ['inflicting_npcs_json'],
      removedFacts: result.removed,
    });
    return after;
  });

  const retirements = [];
  const preservedReverse = [];
  const retiredIdentityKeys = new Set();
  for (const row of reverse.rows) {
    const target = emptyById.get(Number(row.npc_source_id));
    if (!target || row.relation_type !== 'inflicts' || !active(row)) {
      preservedReverse.push(clone(row));
      continue;
    }
    if (row.npc_internal_name !== target.internalName) {
      throw new Error(`NPC Buff relation ${row.record_key} stable identity drifted`);
    }
    const identityKey = `${row.npc_source_id}:${row.buff_source_id}`;
    if (retiredIdentityKeys.has(identityKey)) throw new Error(`duplicate empty-scope reverse fact ${identityKey}`);
    retiredIdentityKeys.add(identityKey);
    const after = { ...row, status: 0, deleted: 1 };
    retirements.push({
      key: row.record_key,
      before: clone(row),
      after: clone(after),
      changedColumns: ['status', 'deleted'],
      source: clone(target.row.source),
    });
  }

  const sortedDisplayFacts = [...new Map(displayOnlyFacts
    .map((row) => [`${row.buffSourceId}:${row.npcId}:${row.internalName}`, row])).values()]
    .sort((left, right) => left.buffSourceId - right.buffSourceId || left.npcId - right.npcId);
  const targetNpcIds = [...emptyById.keys()].sort((left, right) => left - right);
  const before = {
    relation_buffs: relation.rows.map(clone).sort(sortBySourceId),
    projection_buffs: projection.rows.map(clone).sort(sortBySourceId),
    npc_buff_relations: reverse.rows.map(clone).sort(sortByNpcId),
  };
  const after = {
    relation_buffs: relationAfter.map(clone).sort(sortBySourceId),
    projection_buffs: projectionAfter.map(clone).sort(sortBySourceId),
    npc_buff_relations: reverse.rows.map((row) => {
      const retirement = retirements.find((change) => change.key === row.record_key);
      return clone(retirement?.after ?? row);
    }).sort(sortByNpcId),
  };
  const proposal = {
    schemaVersion: SCHEMA_VERSION,
    operationId: 'canonical-buff-npc-variant-empty-scope-candidate',
    databaseWrites: false,
    networkRequests: 0,
    executable: false,
    applyAllowed: false,
    destructiveClear: false,
    tables: [...TARGET_TABLES],
    scope: {
      completeEmptyNpcIds: targetNpcIds,
      unknownNpcIds: [...scopeById.values()].filter((row) => row.status === 'unknown')
        .map((row) => row.id).sort((left, right) => left - right),
      missingBaselineIds: [...EXPECTED_MISSING_BASELINE_IDS],
      contractSha256: hashValue(scopeContract),
    },
    changes: {
      relation_buffs: {
        inserts: [],
        updates: relationUpdates.sort((left, right) => Number(left.after.source_id) - Number(right.after.source_id)),
        preserved: relation.rows.filter((row) => !relationUpdates.some((change) => change.key === row.record_key))
          .map(clone).sort(sortBySourceId),
      },
      projection_buffs: {
        inserts: [],
        updates: projectionUpdates.sort((left, right) => Number(left.after.source_id) - Number(right.after.source_id)),
        preserved: projection.rows.filter((row) => !projectionUpdates.some((change) => change.key === row.id))
          .map(clone).sort(sortBySourceId),
      },
      npc_buff_relations: {
        inserts: [],
        retirements: retirements.sort((left, right) => sortByNpcId(left.before, right.before)),
        preserved: preservedReverse.sort(sortByNpcId),
      },
    },
    preserved: {
      unknownNpcIds: [...scopeById.values()].filter((row) => row.status === 'unknown')
        .map((row) => row.id).sort((left, right) => left - right),
      displayOnlyFacts: sortedDisplayFacts,
    },
    summary: {
      targetNpcIds: targetNpcIds.length,
      reverseRetirements: retirements.length,
      relationBuffUpdates: relationUpdates.length,
      projectionBuffUpdates: projectionUpdates.length,
      inserts: 0,
      databaseWrites: 0,
    },
    beforeSha256: hashValue(before),
    afterSha256: hashValue(after),
    before,
    after,
    blockedBy: [
      'Buff IDs 389-400 have no historical baseline',
      'canonical landing/maint/relation/projection publication requires independent owner authorization',
    ],
  };
  proposal.scopeSha256 = hashValue({
    operationId: proposal.operationId,
    scope: proposal.scope,
    targetNpcIds,
    beforeSha256: proposal.beforeSha256,
    afterSha256: proposal.afterSha256,
  });
  proposal.contractSha256 = hashValue({ ...proposal, contractSha256: undefined });
  return proposal;
}

export const buffNpcVariantEmptyScopeCandidateSchema = SCHEMA_VERSION;
