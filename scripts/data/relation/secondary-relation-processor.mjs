import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseJsonObject(value) {
  if (value == null) {
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeBiomePairKey(itemInternalName, biomeCode) {
  const item = normalizeText(itemInternalName);
  const biome = normalizeText(biomeCode);
  if (!item || !biome) {
    return null;
  }
  return `${item}::${biome}`;
}

const BLOCKED_BUFF_FACT_RESOLVE_STATUSES = new Set(['unresolved', 'ambiguous']);

function normalizeLookupKey(value) {
  const text = normalizeText(value);
  return text == null ? null : text.toLowerCase();
}

function appendUniqueIdentity(map, value, identity) {
  const key = normalizeLookupKey(value);
  if (!key) {
    return;
  }
  const rows = map.get(key) ?? [];
  if (!rows.some((row) => row.sourceId === identity.sourceId && row.internalName === identity.internalName)) {
    rows.push(identity);
  }
  map.set(key, rows);
}

function getUniqueIdentity(map, value) {
  const key = normalizeLookupKey(value);
  if (!key) {
    return null;
  }
  const rows = map.get(key) ?? [];
  return rows.length === 1 ? rows[0] : null;
}

function hasResolvedBuffFactIdentity(row, idKeys, internalNameKeys, displayNameKeys = []) {
  const resolveStatus = normalizeText(row?.resolveStatus ?? row?.resolve_status)?.toLowerCase() ?? null;
  if (BLOCKED_BUFF_FACT_RESOLVE_STATUSES.has(resolveStatus)) {
    return false;
  }
  return idKeys.some((key) => toNullableNumber(row?.[key]) != null)
    || internalNameKeys.some((key) => normalizeText(row?.[key]) != null)
    || displayNameKeys.some((key) => normalizeText(row?.[key]) != null);
}

function buildMaintIdentityIndex(rows = []) {
  const bySourceId = new Map();
  const byInternalName = new Map();
  const byInternalNameLower = new Map();
  const byDisplayName = new Map();
  for (const row of rows ?? []) {
    const sourceId = toNullableNumber(row?.source_id ?? row?.sourceId);
    const internalName = normalizeText(row?.internal_name ?? row?.internalName);
    const identity = {
      sourceId,
      internalName,
      name: normalizeText(row?.english_name ?? row?.name ?? row?.name_en),
      nameZh: normalizeText(row?.name_zh ?? row?.nameZh),
      pageTitle: normalizeText(row?.page_title ?? row?.pageTitle)
    };
    if (sourceId != null && !bySourceId.has(sourceId)) {
      bySourceId.set(sourceId, identity);
    }
    if (internalName && !byInternalName.has(internalName)) {
      byInternalName.set(internalName, identity);
    }
    appendUniqueIdentity(byInternalNameLower, internalName, identity);
    appendUniqueIdentity(byDisplayName, identity.name, identity);
    appendUniqueIdentity(byDisplayName, identity.nameZh, identity);
    appendUniqueIdentity(byDisplayName, identity.pageTitle, identity);
  }
  return { bySourceId, byInternalName, byInternalNameLower, byDisplayName };
}

function resolveBuffFactIdentity(row, {
  idKeys,
  internalNameKeys,
  displayNameKeys = [],
  index
} = {}) {
  if (!hasResolvedBuffFactIdentity(row, idKeys, internalNameKeys, displayNameKeys)) {
    return null;
  }
  for (const key of idKeys ?? []) {
    const sourceId = toNullableNumber(row?.[key]);
    if (sourceId == null) continue;
    const match = index.bySourceId.get(sourceId);
    if (match) return match;
  }
  for (const key of internalNameKeys ?? []) {
    const internalName = normalizeText(row?.[key]);
    if (!internalName) continue;
    const match = index.byInternalName.get(internalName);
    if (match) return match;
  }
  for (const key of internalNameKeys ?? []) {
    const internalName = normalizeText(row?.[key]);
    if (!internalName) continue;
    const match = getUniqueIdentity(index.byInternalNameLower, internalName);
    if (match) return match;
  }
  for (const key of displayNameKeys ?? []) {
    const displayName = normalizeText(row?.[key]);
    if (!displayName) continue;
    const match = getUniqueIdentity(index.byDisplayName, displayName);
    if (match) return match;
  }
  return null;
}

function buildBuffFactIssue({
  buffRow,
  factRow,
  factGroup,
  relationType,
  reason,
  idKeys,
  internalNameKeys,
  displayNameKeys,
  trace,
  sortOrder
}) {
  const sourceId = idKeys.map((key) => toNullableNumber(factRow?.[key])).find((value) => value != null) ?? null;
  const sourceInternalName = internalNameKeys.map((key) => normalizeText(factRow?.[key])).find(Boolean) ?? null;
  const sourceName = displayNameKeys.map((key) => normalizeText(factRow?.[key])).find(Boolean) ?? null;
  return {
    recordKey: createRecordKey({
      type: 'buff_fact_unresolved',
      factGroup,
      buffSourceId: buffRow.source_id ?? null,
      buffInternalName: buffRow.internal_name ?? null,
      sourceId,
      sourceInternalName,
      sourceName,
      sortOrder
    }),
    factGroup,
    relationType,
    buffSourceId: toNullableNumber(buffRow.source_id),
    buffInternalName: normalizeText(buffRow.internal_name),
    sourceId,
    sourceInternalName,
    sourceName,
    sourcePageTitle: normalizeText(factRow?.pageTitle ?? factRow?.page_title),
    sourceKind: normalizeText(factRow?.sourceKind ?? factRow?.source_kind),
    sourceSection: normalizeText(factRow?.sourceSection ?? factRow?.source_section),
    reviewStatus: relationStatus.unresolved,
    confidence: confidence.none,
    reason,
    evidenceJson: JSON.stringify(factRow ?? {}),
    ...trace
  };
}

const ITEM_PROJECTILE_FIELD_CANDIDATES = [
  { path: ['shoot'] },
  { path: ['projectileId'] },
  { path: ['projectile_id'] }
];

const NPC_PROJECTILE_FIELD_CANDIDATES = [
  { path: ['wikiCrawler', 'combat', 'projectileId'] },
  { path: ['combat', 'projectileId'] },
  { path: ['projectileId'] },
  { path: ['projectile_id'] }
];

function expectedRawJsonFields(candidates) {
  return candidates.map((candidate) => `raw_json.${candidate.path.join('.')}`);
}

function availableRawJsonFields(rawJson) {
  return Object.keys(parseJsonObject(rawJson));
}

function parseProjectileIdValues(value) {
  if (value == null || value === '') {
    return [];
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? [value] : [];
  }
  const text = String(value);
  const matches = text.match(/\d+/g) ?? [];
  const seen = new Set();
  const values = [];
  for (const match of matches) {
    const numeric = Number(match);
    if (!Number.isFinite(numeric) || numeric <= 0 || seen.has(numeric)) {
      continue;
    }
    seen.add(numeric);
    values.push(numeric);
  }
  return values;
}

function extractProjectileFields(rawJson, candidates) {
  const parsed = parseJsonObject(rawJson);
  for (const candidate of candidates) {
    let current = parsed;
    for (const segment of candidate.path) {
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
        current = undefined;
        break;
      }
      current = current[segment];
    }
    const values = parseProjectileIdValues(current);
    if (values.length > 0) {
      return values.map((value) => ({
        value,
        sourceField: `raw_json.${candidate.path.join('.')}`,
        sourceValue: String(current)
      }));
    }
  }
  return [];
}

function extractProjectileField(rawJson, candidates) {
  const fields = extractProjectileFields(rawJson, candidates);
  if (fields.length > 0) {
    return fields[0];
  }
  return null;
}

function extractShootValue(rawJson) {
  return extractProjectileField(rawJson, ITEM_PROJECTILE_FIELD_CANDIDATES);
}

function extractNpcProjectileValue(rawJson) {
  return extractProjectileField(rawJson, NPC_PROJECTILE_FIELD_CANDIDATES);
}

function extractNpcProjectileValues(rawJson) {
  return extractProjectileFields(rawJson, NPC_PROJECTILE_FIELD_CANDIDATES);
}

function buildMissingProjectileFieldAudit({
  entityType,
  row,
  sourceMaintTable,
  candidates
}) {
  const trace = normalizeTrace(sourceMaintTable, {
    ...row,
    record_key: row.record_key ?? null
  });
  const identity = entityType === 'item'
    ? {
        itemSourceId: toNullableNumber(row.source_id),
        itemInternalName: normalizeText(row.internal_name ?? row.item_internal_name),
        type: 'item_projectile_audit',
        sourceIdKey: 'itemSourceId',
        internalNameKey: 'itemInternalName',
        reason: 'item_projectile_field_missing'
      }
    : {
        npcSourceId: toNullableNumber(row.source_id),
        npcInternalName: normalizeText(row.internal_name ?? row.npc_internal_name),
        type: 'npc_projectile_audit',
        sourceIdKey: 'npcSourceId',
        internalNameKey: 'npcInternalName',
        reason: 'npc_projectile_field_missing'
      };

  const {
    type,
    sourceIdKey,
    internalNameKey,
    reason,
    ...entityColumns
  } = identity;

  return {
    recordKey: createRecordKey({
      type,
      [sourceIdKey]: row.source_id ?? null,
      [internalNameKey]: row.internal_name ?? row.item_internal_name ?? row.npc_internal_name ?? null,
      auditStatus: 'crawl_candidate'
    }),
    ...entityColumns,
    projectileSourceId: null,
    projectileInternalName: null,
    auditStatus: 'crawl_candidate',
    availableFieldsJson: JSON.stringify({
      candidateKind: 'crawl_candidate',
      entityType,
      availableFields: availableRawJsonFields(row.raw_json),
      expectedFields: expectedRawJsonFields(candidates)
    }),
    reviewStatus: relationStatus.unresolved,
    confidence: confidence.none,
    reason,
    ...trace
  };
}

export function buildSecondaryRelations({
  itemBiomeRows = [],
  maintBuffRows = [],
  maintProjectileRows = [],
  maintItemRows = [],
  maintNpcRows = [],
  itemImageRows = []
} = {}) {
  const maintItemIndex = buildMaintIdentityIndex(maintItemRows);
  const maintNpcIndex = buildMaintIdentityIndex(maintNpcRows);
  const itemBiomeRelations = itemBiomeRows.map((row) => {
    const trace = normalizeTrace('maint_item_biomes', row);
    return {
      recordKey: createRecordKey({
        type: 'item_biome_relation',
        sourceMaintRecordKey: trace.sourceMaintRecordKey ?? row.record_key ?? null
      }),
      itemSourceId: toNullableNumber(row.item_source_id ?? row.source_id),
      itemInternalName: normalizeText(row.item_internal_name),
      biomeCode: normalizeText(row.biome_code),
      relationType: normalizeText(row.relation_type),
      reviewStatus: relationStatus.resolved,
      confidence: confidence.high,
      reason: 'maint_item_biome',
      ...trace
    };
  });

  const itemBuffFactIssues = [];
  const itemBuffRelations = maintBuffRows.flatMap((row) => {
    let parsed = {};
    try {
      parsed = typeof row.raw_json === 'string' ? JSON.parse(row.raw_json) : row.raw_json ?? {};
    } catch {
      parsed = {};
    }

    const sourceItems = Array.isArray(parsed.sourceItems) ? parsed.sourceItems : [];
    const inflictingNpcs = Array.isArray(parsed.inflictingNpcs) ? parsed.inflictingNpcs : [];
    const trace = normalizeTrace('maint_buffs', row);

    return sourceItems
      .map((sourceItem) => ({
        sourceItem,
        identity: resolveBuffFactIdentity(sourceItem, {
          idKeys: ['itemId', 'itemSourceId', 'sourceId'],
          internalNameKeys: ['internalName', 'itemInternalName'],
          displayNameKeys: ['pageTitle', 'name', 'nameZh', 'title'],
          index: maintItemIndex
        })
      }))
      .flatMap(({ sourceItem, identity }, index) => {
        if (identity == null) {
          itemBuffFactIssues.push(buildBuffFactIssue({
            buffRow: row,
            factRow: sourceItem,
            factGroup: 'sourceItems',
            relationType: 'buff_source_item',
            reason: 'buff_source_item_unresolved',
            idKeys: ['itemId', 'itemSourceId', 'sourceId'],
            internalNameKeys: ['internalName', 'itemInternalName'],
            displayNameKeys: ['pageTitle', 'name', 'nameZh', 'title'],
            trace,
            sortOrder: index
          }));
          return [];
        }
        return [{
          recordKey: createRecordKey({
            type: 'item_buff_relation',
            buffSourceId: row.source_id ?? null,
            itemInternalName: identity.internalName ?? sourceItem.internalName ?? sourceItem.itemInternalName ?? null,
            itemSourceId: identity.sourceId ?? sourceItem.itemId ?? sourceItem.itemSourceId ?? sourceItem.sourceId ?? null,
            sortOrder: index
          }),
          itemSourceId: toNullableNumber(identity.sourceId ?? sourceItem.itemId ?? sourceItem.itemSourceId ?? sourceItem.sourceId),
          itemInternalName: normalizeText(identity.internalName ?? sourceItem.internalName ?? sourceItem.itemInternalName),
          buffSourceId: toNullableNumber(row.source_id),
          buffInternalName: normalizeText(row.internal_name),
          relationType: 'buff_source_item',
          durationTicks: toNullableNumber(sourceItem.buffTime),
          chanceValue: null,
          chanceText: null,
          conditions: null,
          reviewStatus: relationStatus.resolved,
          confidence: confidence.high,
          reason: 'maint_buff_source_item',
          ...trace
        }];
      });
  });

  const npcBuffFactIssues = [];
  const npcBuffRelations = maintBuffRows.flatMap((row) => {
    let parsed = {};
    try {
      parsed = typeof row.raw_json === 'string' ? JSON.parse(row.raw_json) : row.raw_json ?? {};
    } catch {
      parsed = {};
    }

    const inflictingNpcs = Array.isArray(parsed.inflictingNpcs) ? parsed.inflictingNpcs : [];
    const trace = normalizeTrace('maint_buffs', row);

    return inflictingNpcs
      .map((inflictingNpc) => ({
        inflictingNpc,
        identity: resolveBuffFactIdentity(inflictingNpc, {
          idKeys: ['npcId', 'npcSourceId', 'sourceId'],
          internalNameKeys: ['internalName', 'npcInternalName'],
          displayNameKeys: ['pageTitle', 'name', 'nameZh', 'title'],
          index: maintNpcIndex
        })
      }))
      .flatMap(({ inflictingNpc, identity }, index) => {
        if (identity == null) {
          npcBuffFactIssues.push(buildBuffFactIssue({
            buffRow: row,
            factRow: inflictingNpc,
            factGroup: 'inflictingNpcs',
            relationType: 'inflicts',
            reason: 'buff_inflicting_npc_unresolved',
            idKeys: ['npcId', 'npcSourceId', 'sourceId'],
            internalNameKeys: ['internalName', 'npcInternalName'],
            displayNameKeys: ['pageTitle', 'name', 'nameZh', 'title'],
            trace,
            sortOrder: index
          }));
          return [];
        }
        return [{
          recordKey: createRecordKey({
            type: 'npc_buff_relation',
            buffSourceId: row.source_id ?? null,
            npcInternalName: identity.internalName ?? inflictingNpc.internalName ?? inflictingNpc.npcInternalName ?? null,
            npcSourceId: identity.sourceId ?? inflictingNpc.npcId ?? inflictingNpc.npcSourceId ?? inflictingNpc.sourceId ?? null,
            sortOrder: index
          }),
          npcSourceId: toNullableNumber(identity.sourceId ?? inflictingNpc.npcId ?? inflictingNpc.npcSourceId ?? inflictingNpc.sourceId),
          npcInternalName: normalizeText(identity.internalName ?? inflictingNpc.internalName ?? inflictingNpc.npcInternalName),
          npcName: normalizeText(identity.name ?? inflictingNpc.name),
          buffSourceId: toNullableNumber(row.source_id),
          buffInternalName: normalizeText(row.internal_name),
          relationType: 'inflicts',
          durationTicks: toNullableNumber(inflictingNpc.buffTime),
          chanceValue: null,
          chanceText: null,
          conditions: null,
          reviewStatus: relationStatus.resolved,
          confidence: confidence.high,
          reason: 'maint_buff_inflicting_npc',
          ...trace
        }];
      });
  });

  const projectilesBySourceId = new Map(
    maintProjectileRows
      .map((row) => [toNullableNumber(row.source_id), row])
      .filter(([key]) => key != null)
  );

  const itemProjectileRelations = [];
  const itemProjectileAudits = maintItemRows
    .map((row) => {
      const projectileField = extractShootValue(row.raw_json);
      if (projectileField == null) {
        return buildMissingProjectileFieldAudit({
          entityType: 'item',
          row,
          sourceMaintTable: 'maint_items',
          candidates: ITEM_PROJECTILE_FIELD_CANDIDATES
        });
      }
      const projectile = projectilesBySourceId.get(projectileField.value) ?? null;
      const trace = normalizeTrace('maint_items', {
        ...row,
        record_key: row.record_key ?? null
      });
      if (projectile) {
        itemProjectileRelations.push({
          recordKey: createRecordKey({
            type: 'item_projectile_relation',
            itemSourceId: row.source_id ?? null,
            projectileSourceId: projectileField.value,
            sourceField: projectileField.sourceField
          }),
          itemSourceId: toNullableNumber(row.source_id),
          itemInternalName: normalizeText(row.internal_name ?? row.item_internal_name),
          itemName: normalizeText(row.english_name ?? row.name ?? row.item_name),
          projectileSourceId: projectileField.value,
          projectileInternalName: normalizeText(projectile.internal_name),
          projectileName: normalizeText(projectile.english_name ?? projectile.name),
          relationType: 'item_direct_shoot',
          sourceField: projectileField.sourceField,
          sourceValue: projectileField.sourceValue,
          reviewStatus: relationStatus.resolved,
          confidence: confidence.high,
          reason: 'maint_item_raw_json_shoot',
          ...trace
        });
      }
      return {
        recordKey: createRecordKey({
          type: 'item_projectile_audit',
          itemSourceId: row.source_id ?? null,
          projectileSourceId: projectileField.value
        }),
        itemSourceId: toNullableNumber(row.source_id),
        itemInternalName: normalizeText(row.internal_name ?? row.item_internal_name),
        projectileSourceId: projectileField.value,
        projectileInternalName: normalizeText(projectile?.internal_name),
        auditStatus: projectile ? 'promoted_to_relation' : 'projectile_missing',
        availableFieldsJson: JSON.stringify({
          itemShoot: projectileField.value,
          sourceField: projectileField.sourceField,
          projectileFound: Boolean(projectile)
        }),
        reviewStatus: projectile ? relationStatus.resolved : relationStatus.unresolved,
        confidence: projectile ? confidence.high : confidence.none,
        reason: projectile ? 'projectile_relation_promoted' : 'projectile_not_found',
        ...trace
      };
    })
    .filter(Boolean);

  const npcProjectileAudits = [];
  const npcProjectileRelations = maintNpcRows
    .flatMap((row) => {
      const projectileFields = extractNpcProjectileValues(row.raw_json);
      if (projectileFields.length === 0) {
        npcProjectileAudits.push(buildMissingProjectileFieldAudit({
          entityType: 'npc',
          row,
          sourceMaintTable: 'maint_npcs',
          candidates: NPC_PROJECTILE_FIELD_CANDIDATES
        }));
        return [];
      }
      const trace = normalizeTrace('maint_npcs', {
        ...row,
        record_key: row.record_key ?? null
      });
      const relations = [];
      for (const projectileField of projectileFields) {
        const projectile = projectilesBySourceId.get(projectileField.value) ?? null;
        npcProjectileAudits.push({
          recordKey: createRecordKey({
            type: 'npc_projectile_audit',
            npcSourceId: row.source_id ?? null,
            projectileSourceId: projectileField.value
          }),
          npcSourceId: toNullableNumber(row.source_id),
          npcInternalName: normalizeText(row.internal_name ?? row.npc_internal_name),
          projectileSourceId: projectileField.value,
          projectileInternalName: normalizeText(projectile?.internal_name),
          auditStatus: projectile ? 'promoted_to_relation' : 'projectile_missing',
          availableFieldsJson: JSON.stringify({
            candidateKind: projectile ? 'audit' : 'backfill_candidate',
            npcProjectile: projectileField.value,
            sourceField: projectileField.sourceField,
            projectileFound: Boolean(projectile)
          }),
          reviewStatus: projectile ? relationStatus.resolved : relationStatus.unresolved,
          confidence: projectile ? confidence.high : confidence.none,
          reason: projectile ? 'projectile_relation_promoted' : 'projectile_not_found',
          ...trace
        });
        if (!projectile) {
          continue;
        }
        relations.push({
          recordKey: createRecordKey({
            type: 'npc_projectile_relation',
            npcSourceId: row.source_id ?? null,
            projectileSourceId: projectileField.value,
            sourceField: projectileField.sourceField
          }),
          npcSourceId: toNullableNumber(row.source_id),
          npcInternalName: normalizeText(row.internal_name ?? row.npc_internal_name),
          npcName: normalizeText(row.english_name ?? row.name ?? row.npc_name),
          projectileSourceId: projectileField.value,
          projectileInternalName: normalizeText(projectile.internal_name),
          projectileName: normalizeText(projectile.english_name ?? projectile.name),
          relationType: 'npc_infobox_projectile',
          sourceField: projectileField.sourceField,
          sourceValue: projectileField.sourceValue,
          reviewStatus: relationStatus.resolved,
          confidence: confidence.high,
          reason: 'npc_infobox_projectile_id',
          ...trace
        });
      }
      return relations;
    })
    .filter(Boolean);

  return {
    itemBiomeRelations,
    itemBuffRelations,
    npcBuffRelations,
    itemProjectileRelations,
    npcProjectileRelations,
    itemProjectileAudits,
    npcProjectileAudits,
    issues: [
      ...itemBuffFactIssues,
      ...npcBuffFactIssues
    ],
    summary: {
      biomeRows: itemBiomeRelations.length,
      localBiomeMissing: 0,
      buffCrossCheckRows: 0,
      buffRows: itemBuffRelations.length,
      npcBuffRows: npcBuffRelations.length,
      buffFactIssueRows: itemBuffFactIssues.length + npcBuffFactIssues.length,
      itemProjectileRows: itemProjectileRelations.length,
      npcProjectileRows: npcProjectileRelations.length,
      itemProjectileAuditRows: itemProjectileAudits.length,
      npcProjectileAuditRows: npcProjectileAudits.length,
      projectileAuditRows: itemProjectileAudits.length + npcProjectileAudits.length,
      imageCoverageRows: itemImageRows.length
    }
  };
}
