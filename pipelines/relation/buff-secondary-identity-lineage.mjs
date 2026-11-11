const SOURCE_ID_KEYS = Object.freeze(['itemId', 'itemSourceId', 'sourceId']);
const NPC_SOURCE_ID_KEYS = Object.freeze(['npcId', 'npcSourceId', 'sourceId']);

/**
 * Compare Buff secondary facts with independent Iteminfo/Npcinfo identities and
 * current maint snapshots. This is intentionally a pure diagnostic: local
 * compatibility IDs are reported as evidence only and never become source IDs.
 */
export function buildBuffSecondaryIdentityLineage({
  payload,
  iteminfoAssertions = [],
  maintItemRows = [],
  localItemRows = [],
  maintNpcRows = [],
} = {}) {
  if (!payload || !Array.isArray(payload.buffs)) throw new Error('Buff payload is required');
  if (!Array.isArray(iteminfoAssertions) || !Array.isArray(maintItemRows)
      || !Array.isArray(localItemRows) || !Array.isArray(maintNpcRows)) {
    throw new Error('identity lineage inputs must be arrays');
  }

  const iteminfo = buildIteminfoIndexes(iteminfoAssertions);
  const maintItems = buildMaintIndexes(maintItemRows, 'item');
  const localItems = buildMaintIndexes(localItemRows, 'item');
  const maintNpcs = buildMaintIndexes(maintNpcRows, 'npc');
  const sourceItems = [];
  const immuneNpcs = [];
  const inflictingNpcs = [];

  for (const buff of payload.buffs) {
    const buffId = toSourceId(buff?.id);
    const buffInternalName = normalize(buff?.internalName);
    if (buffId == null || !buffInternalName) throw new Error('Buff payload identity is invalid');

    for (const [index, fact] of (Array.isArray(buff.sourceItems) ? buff.sourceItems : []).entries()) {
      sourceItems.push(resolveItemFact({
        buffId, buffInternalName, fact, index, iteminfo, maintItems, localItems
      }));
    }
    for (const [index, fact] of (Array.isArray(buff.immuneNpcs) ? buff.immuneNpcs : []).entries()) {
      immuneNpcs.push(resolveNpcFact({
        buffId, buffInternalName, fact, index, maintNpcs, factGroup: 'immuneNpcs'
      }));
    }
    for (const [index, fact] of (Array.isArray(buff.inflictingNpcs) ? buff.inflictingNpcs : []).entries()) {
      inflictingNpcs.push(resolveNpcFact({
        buffId, buffInternalName, fact, index, maintNpcs, factGroup: 'inflictingNpcs'
      }));
    }
  }

  const summary = {
    sourceItems: summarizeItemFacts(sourceItems),
    immuneNpcs: summarizeNpcFacts(immuneNpcs),
    inflictingNpcs: summarizeNpcFacts(inflictingNpcs),
  };
  const blockedBy = [];
  if (sourceItems.some(row => row.classification === 'unresolved-source-identity')) {
    blockedBy.push('source item identity remains unresolved');
  }
  if (sourceItems.some(row => row.classification === 'stable-source-id-maint-missing')) {
    blockedBy.push('stable source item IDs have no maint identity');
  }
  if (sourceItems.some(row => row.classification === 'resolved-maint-source-id-with-source-name-drift')) {
    blockedBy.push('source item identity drift requires owner review');
  }
  if ([...immuneNpcs, ...inflictingNpcs].some(row => row.classification === 'display-only-npc-source-id-missing')) {
    blockedBy.push('NPC secondary facts have no stable source ID');
  }
  if ([...immuneNpcs, ...inflictingNpcs].some(row => row.classification === 'stable-source-id-maint-missing')) {
    blockedBy.push('stable source NPC IDs have no maint identity');
  }

  return {
    schemaVersion: 'buff-secondary-identity-lineage/v1',
    readOnly: true,
    databaseWrites: false,
    executable: false,
    applyAllowed: false,
    sourceItems,
    immuneNpcs,
    inflictingNpcs,
    summary,
    blockedBy,
    verdict: blockedBy.length === 0 ? 'closed' : 'blocked',
  };
}

function resolveItemFact({ buffId, buffInternalName, fact, index, iteminfo, maintItems, localItems }) {
  const sourceInternalName = firstText(fact, ['internalName', 'itemInternalName']);
  const sourceName = firstText(fact, ['pageTitle', 'name', 'title']);
  const rawSourceId = firstSourceId(fact, SOURCE_ID_KEYS);
  const evidence = rawSourceId == null
    ? iteminfo.byInternalName.get(lower(sourceInternalName)) ?? null
    : iteminfo.byId.get(rawSourceId) ?? null;
  const stableSourceId = rawSourceId ?? toSourceId(evidence?.itemId);
  const canonicalInternalName = normalize(evidence?.internalName);
  const maint = stableSourceId == null
    ? uniqueByInternalName(maintItems, sourceInternalName)
    : maintItems.bySourceId.get(stableSourceId) ?? null;
  const local = uniqueByInternalName(localItems, sourceInternalName);
  let classification = 'unresolved-source-identity';
  let promotable = false;
  if (maint && stableSourceId != null) {
    const sourceNameDrift = Boolean(sourceInternalName && maint.internalName
      && sourceInternalName !== maint.internalName);
    classification = sourceNameDrift
      ? 'resolved-maint-source-id-with-source-name-drift'
      : 'resolved-maint-source-id';
    promotable = !sourceNameDrift;
  } else if (maint && stableSourceId == null) {
    classification = 'resolved-maint-internal-name';
    promotable = true;
  } else if (stableSourceId != null) {
    classification = 'stable-source-id-maint-missing';
  }
  return {
    buffSourceId: buffId,
    buffInternalName,
    sourceInternalName: sourceInternalName || null,
    sourceName: sourceName || null,
    stableSourceId: stableSourceId ?? null,
    evidenceInternalName: canonicalInternalName || null,
    evidenceItemId: toSourceId(evidence?.itemId),
    maintSourceId: toSourceId(maint?.sourceId),
    maintInternalName: maint?.internalName ?? null,
    localRowId: toSourceId(local?.rowId),
    classification,
    promotable,
    sourceOrder: index,
    evidenceKind: evidence ? 'iteminfo-revision-bound' : null,
  };
}

function resolveNpcFact({ buffId, buffInternalName, fact, index, maintNpcs, factGroup }) {
  const sourceInternalName = firstText(fact, ['internalName', 'npcInternalName']);
  const sourceName = firstText(fact, ['pageTitle', 'name', 'title']);
  const stableSourceId = firstSourceId(fact, NPC_SOURCE_ID_KEYS);
  const maint = stableSourceId == null
    ? uniqueByInternalName(maintNpcs, sourceInternalName)
    : maintNpcs.bySourceId.get(stableSourceId) ?? null;
  let classification = 'display-only-npc-source-id-missing';
  let promotable = false;
  if (stableSourceId != null && maint) {
    const sourceNameDrift = Boolean(sourceInternalName && maint.internalName
      && sourceInternalName !== maint.internalName);
    classification = sourceNameDrift
      ? 'resolved-maint-source-id-with-source-name-drift'
      : 'resolved-maint-source-id';
    promotable = !sourceNameDrift;
  } else if (stableSourceId != null) {
    classification = 'stable-source-id-maint-missing';
  }
  return {
    factGroup,
    buffSourceId: buffId,
    buffInternalName,
    sourceInternalName: sourceInternalName || null,
    sourceName: sourceName || null,
    stableSourceId: stableSourceId ?? null,
    maintSourceId: toSourceId(maint?.sourceId),
    maintInternalName: maint?.internalName ?? null,
    classification,
    promotable,
    sourceOrder: index,
  };
}

function buildIteminfoIndexes(assertions) {
  const byId = new Map();
  const byInternalName = new Map();
  for (const assertion of assertions) {
    const itemId = toSourceId(assertion?.itemId);
    const internalName = normalize(assertion?.internalName);
    if (itemId == null || !internalName) continue;
    const row = { itemId, internalName, name: normalize(assertion?.name), buffId: toSourceId(assertion?.buffId) };
    byId.set(itemId, row);
    const key = lower(internalName);
    if (!byInternalName.has(key)) byInternalName.set(key, row);
    else byInternalName.set(key, null);
  }
  return { byId, byInternalName };
}

function buildMaintIndexes(rows, kind) {
  const bySourceId = new Map();
  const byInternalName = new Map();
  for (const row of rows) {
    const sourceId = toSourceId(row?.source_id ?? row?.sourceId ?? row?.id);
    const internalName = normalize(row?.internal_name ?? row?.internalName ?? row?.npc_internal_name);
    const entry = {
      sourceId,
      internalName,
      name: normalize(row?.english_name ?? row?.name ?? row?.npc_name),
      rowId: toSourceId(row?.id),
      kind,
    };
    if (sourceId != null) bySourceId.set(sourceId, entry);
    if (internalName) {
      const key = lower(internalName);
      if (!byInternalName.has(key)) byInternalName.set(key, entry);
      else byInternalName.set(key, null);
    }
  }
  return { bySourceId, byInternalName };
}

function uniqueByInternalName(index, value) {
  const key = lower(value);
  return key ? index.byInternalName.get(key) ?? null : null;
}

function summarizeItemFacts(rows) {
  return {
    factCount: rows.length,
    stableSourceIdCount: rows.filter(row => row.stableSourceId != null).length,
    missingMaintCount: rows.filter(row => row.classification === 'stable-source-id-maint-missing').length,
    unresolvedCount: rows.filter(row => row.classification === 'unresolved-source-identity').length,
    sourceNameDriftCount: rows.filter(row => row.classification.endsWith('source-name-drift')).length,
    promotableCount: rows.filter(row => row.promotable).length,
  };
}

function summarizeNpcFacts(rows) {
  return {
    factCount: rows.length,
    sourceIdCount: rows.filter(row => row.stableSourceId != null).length,
    sourceIdMissingCount: rows.filter(row => row.classification === 'display-only-npc-source-id-missing').length,
    missingMaintCount: rows.filter(row => row.classification === 'stable-source-id-maint-missing').length,
    sourceNameDriftCount: rows.filter(row => row.classification.endsWith('source-name-drift')).length,
    promotableCount: rows.filter(row => row.promotable).length,
  };
}

function firstSourceId(row, keys) {
  for (const key of keys) {
    const value = toSourceId(row?.[key]);
    if (value != null) return value;
  }
  return null;
}

function firstText(row, keys) {
  for (const key of keys) {
    const value = normalize(row?.[key]);
    if (value) return value;
  }
  return '';
}

function toSourceId(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function normalize(value) {
  return value == null ? '' : String(value).trim();
}

function lower(value) {
  const text = normalize(value);
  return text ? text.toLocaleLowerCase('en-US') : '';
}
