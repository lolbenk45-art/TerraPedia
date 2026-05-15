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

function parseRawJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonArrayOrNull(value) {
  return Array.isArray(value) ? JSON.stringify(value) : null;
}

export function buildBuffEntityRelations({ maintBuffs = [] } = {}) {
  return {
    relationBuffs: maintBuffs.map((row) => {
      const trace = normalizeTrace('maint_buffs', row);
      const raw = parseRawJson(row.raw_json);
      const flags = parseJsonObject(row.flags_json);
      const sourceItems = Array.isArray(raw.sourceItems)
        ? raw.sourceItems
        : Array.isArray(raw.source_items_json)
          ? raw.source_items_json
          : null;
      const immuneNpcs = Array.isArray(raw.immuneNpcs)
        ? raw.immuneNpcs
        : Array.isArray(raw.immune_npcs_json)
          ? raw.immune_npcs_json
          : null;
      const immuneNpcSample = Array.isArray(raw.immuneNpcSample)
        ? raw.immuneNpcSample
        : Array.isArray(raw.immune_npc_sample_json)
          ? raw.immune_npc_sample_json
          : null;
      return {
        recordKey: createRecordKey({
          type: 'maint_buffs',
          sourceMaintRecordKey: trace.sourceMaintRecordKey ?? null,
          sourceId: row.source_id ?? null,
          internalName: row.internal_name ?? null
        }),
        sourceId: toNullableNumber(row.source_id),
        internalName: normalizeText(row.internal_name),
        englishName: normalizeText(row.english_name),
        nameZh: normalizeText(row.name_zh),
        buffType: normalizeText(raw.type ?? flags.buffType),
        tooltipEn: normalizeText(raw.localized?.en?.tooltip),
        tooltipZh: normalizeText(raw.localized?.zh?.tooltip),
        sourceItemCount: toNullableNumber(row.major_value ?? raw.sourceItemCount ?? sourceItems?.length),
        immuneNpcCount: toNullableNumber(raw.immuneNpcCount ?? immuneNpcs?.length ?? row.combat_value),
        sourceItemsJson: jsonArrayOrNull(sourceItems),
        immuneNpcsJson: jsonArrayOrNull(immuneNpcs),
        immuneNpcSampleJson: jsonArrayOrNull(immuneNpcSample),
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'maint_buffs_mirrored',
        rawJson: row.raw_json ?? null,
        ...trace
      };
    })
  };
}
