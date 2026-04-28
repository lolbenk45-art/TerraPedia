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

function extractProjectileField(rawJson, candidates) {
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
    const numeric = toNullableNumber(current);
    if (numeric != null && numeric > 0) {
      return {
        value: numeric,
        sourceField: `raw_json.${candidate.path.join('.')}`,
        sourceValue: String(current)
      };
    }
  }
  return null;
}

function extractShootValue(rawJson) {
  return extractProjectileField(rawJson, [
    { path: ['shoot'] },
    { path: ['projectileId'] },
    { path: ['projectile_id'] }
  ]);
}

function extractNpcProjectileValue(rawJson) {
  return extractProjectileField(rawJson, [
    { path: ['wikiCrawler', 'combat', 'projectileId'] },
    { path: ['combat', 'projectileId'] },
    { path: ['projectileId'] },
    { path: ['projectile_id'] }
  ]);
}

export function buildSecondaryRelations({
  itemBiomeRows = [],
  maintBuffRows = [],
  maintProjectileRows = [],
  maintItemRows = [],
  maintNpcRows = [],
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

  const itemProjectileRelations = [];
  const itemProjectileAudits = maintItemRows
    .map((row) => {
      const projectileField = extractShootValue(row.raw_json);
      if (projectileField == null) {
        return null;
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

  const npcProjectileRelations = maintNpcRows
    .map((row) => {
      const projectileField = extractNpcProjectileValue(row.raw_json);
      if (projectileField == null) {
        return null;
      }
      const projectile = projectilesBySourceId.get(projectileField.value) ?? null;
      if (!projectile) {
        return null;
      }
      const trace = normalizeTrace('maint_npcs', {
        ...row,
        record_key: row.record_key ?? null
      });
      return {
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
      };
    })
    .filter(Boolean);

  return {
    itemBiomeRelations,
    itemBuffRelations,
    itemProjectileRelations,
    npcProjectileRelations,
    itemProjectileAudits,
    summary: {
      biomeRows: itemBiomeRelations.length,
      localBiomeMissing: 0,
      buffCrossCheckRows: 0,
      buffRows: itemBuffRelations.length,
      itemProjectileRows: itemProjectileRelations.length,
      npcProjectileRows: npcProjectileRelations.length,
      projectileAuditRows: itemProjectileAudits.length,
      imageCoverageRows: itemImageRows.length
    }
  };
}
