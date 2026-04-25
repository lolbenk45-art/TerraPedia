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

function normalizeBiomePairKey(itemInternalName, biomeCode) {
  const item = normalizeText(itemInternalName);
  const biome = normalizeText(biomeCode);
  if (!item || !biome) {
    return null;
  }
  return `${item}::${biome}`;
}

function extractShootValue(rawJson) {
  try {
    const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return toNullableNumber(parsed.shoot ?? parsed.projectileId ?? parsed.projectile_id);
  } catch {
    return null;
  }
}

export function buildSecondaryRelations({
  itemBiomeRows = [],
  maintBuffRows = [],
  maintProjectileRows = [],
  maintItemRows = [],
  itemImageRows = []
} = {}) {
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

  const itemBuffRelations = maintBuffRows.flatMap((row) => {
    let parsed = {};
    try {
      parsed = typeof row.raw_json === 'string' ? JSON.parse(row.raw_json) : row.raw_json ?? {};
    } catch {
      parsed = {};
    }

    const sourceItems = Array.isArray(parsed.sourceItems) ? parsed.sourceItems : [];
    const trace = normalizeTrace('maint_buffs', row);

    return sourceItems.map((sourceItem, index) => ({
      recordKey: createRecordKey({
        type: 'item_buff_relation',
        buffSourceId: row.source_id ?? null,
        itemInternalName: sourceItem.internalName ?? null,
        sortOrder: index
      }),
      itemSourceId: toNullableNumber(sourceItem.itemId),
      itemInternalName: normalizeText(sourceItem.internalName),
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
    }));
  });

  const projectilesBySourceId = new Map(
    maintProjectileRows
      .map((row) => [toNullableNumber(row.source_id), row])
      .filter(([key]) => key != null)
  );

  const itemProjectileAudits = maintItemRows
    .map((row) => {
      const shootValue = extractShootValue(row.raw_json);
      if (shootValue == null) {
        return null;
      }
      const projectile = projectilesBySourceId.get(shootValue) ?? null;
      const trace = normalizeTrace('maint_items', {
        ...row,
        record_key: row.record_key ?? null
      });
      return {
        recordKey: createRecordKey({
          type: 'item_projectile_audit',
          itemSourceId: row.source_id ?? null,
          projectileSourceId: shootValue
        }),
        itemSourceId: toNullableNumber(row.source_id),
        itemInternalName: normalizeText(row.internal_name ?? row.item_internal_name),
        projectileSourceId: shootValue,
        projectileInternalName: normalizeText(projectile?.internal_name),
        auditStatus: 'not_promoted_first_stage',
        availableFieldsJson: JSON.stringify({
          itemShoot: shootValue,
          projectileFound: Boolean(projectile)
        }),
        reviewStatus: relationStatus.candidateLowConfidence,
        confidence: confidence.low,
        reason: 'projectile_audit_only_first_stage',
        ...trace
      };
    })
    .filter(Boolean);

  return {
    itemBiomeRelations,
    itemBuffRelations,
    itemProjectileAudits,
    summary: {
      biomeRows: itemBiomeRelations.length,
      localBiomeMissing: 0,
      buffCrossCheckRows: 0,
      buffRows: itemBuffRelations.length,
      projectileAuditRows: itemProjectileAudits.length,
      imageCoverageRows: itemImageRows.length
    }
  };
}
