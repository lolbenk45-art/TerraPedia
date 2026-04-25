import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';
import { normalizeSourceConditionFields } from './source-condition-normalizer.mjs';

const CONDITION_SIGNAL_PATTERN = /\b(pre-hardmode|hardmode|night|day|daytime|blood moon|solar eclipse|new moon|waning crescent|waxing crescent|full moon|snow biome|ice biome|jungle|corruption|crimson|hallow|desert|ocean|forest|rain|windy day|after plantera has been defeated|post-\s*plantera|mechanical bosses? has been defeated|one of the mechanical bosses has been defeated|any mechanical boss|martian madness event has been defeated|bestiary)\b/i;
const CONDITION_STATUS_RANK = Object.freeze({
  parsed: 4,
  source_fields_only: 3,
  unparsed: 2,
  no_condition_text: 1
});

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toSortOrder(value, fallbackOrder) {
  const numeric = toNullableNumber(value);
  if (numeric == null) {
    return fallbackOrder;
  }
  return Number.isInteger(numeric) ? numeric : Math.trunc(numeric);
}

function pickText(value, fallback) {
  return normalizeText(value) ?? normalizeText(fallback);
}

export function parseRawJson(row = {}) {
  const value = row?.raw_json ?? row?.rawJson;
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
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

export function normalizeSourceRefName(value) {
  const rawText = normalizeText(value);
  if (!rawText) {
    return null;
  }

  const collapsed = rawText.replace(/\s+/g, ' ').trim();
  let cleaned = collapsed.replace(/[,:;]+$/g, '').trim();
  if (/\sfor$/i.test(cleaned) && !/\sand\s/i.test(cleaned)) {
    cleaned = cleaned.replace(/\sfor$/i, '').trim();
  }
  if (/\sduring\s/i.test(cleaned) && !/\sand\s/i.test(cleaned)) {
    cleaned = cleaned.split(/\sduring\s/i)[0].trim();
  }
  return cleaned || null;
}

export function isPollutedSourceRefName(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }
  return /\sfor$/i.test(text);
}

function findPhraseIndex(text, phrases) {
  if (!text) return -1;
  const lowered = text.toLowerCase();
  let best = -1;
  for (const phrase of phrases) {
    const index = lowered.indexOf(phrase);
    if (index >= 0 && (best < 0 || index < best)) {
      best = index;
    }
  }
  return best;
}

function extractRelevantNotes(sourceType, notes) {
  const text = normalizeText(notes);
  if (!text) return null;

  const phraseIndex =
    sourceType === 'shop'
      ? findPhraseIndex(text, ['purchased from', 'bought from', 'sold by'])
      : findPhraseIndex(text, ['dropped by', 'dropped from', 'drops from', 'obtained from', 'can drop']);

  return phraseIndex >= 0 ? text.slice(phraseIndex).trim() : text;
}

function extractConditionTextFromChanceText(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return CONDITION_SIGNAL_PATTERN.test(text) ? text : null;
}

function countEvidenceFields(row) {
  return [
    row.conditionSourceText,
    row.conditionBiomeCode,
    row.conditionGamePeriodCode,
    row.conditionTimeCode,
    row.conditionWeatherCode,
    row.conditionEventsJson,
    row.specialFlagsJson,
    row.conditions,
    row.priceText,
    row.quantityText,
    row.chanceText
  ].filter((value) => normalizeText(value) != null).length;
}

function compareRelationRowQuality(left, right) {
  const leftRank = CONDITION_STATUS_RANK[left.conditionParseStatus] ?? 0;
  const rightRank = CONDITION_STATUS_RANK[right.conditionParseStatus] ?? 0;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftEvidence = countEvidenceFields(left);
  const rightEvidence = countEvidenceFields(right);
  if (leftEvidence !== rightEvidence) {
    return leftEvidence - rightEvidence;
  }

  const leftTextLength = String(left.conditionSourceText ?? '').length;
  const rightTextLength = String(right.conditionSourceText ?? '').length;
  if (leftTextLength !== rightTextLength) {
    return leftTextLength - rightTextLength;
  }

  const leftSourceId = toNullableNumber(left.sourceMaintId) ?? -1;
  const rightSourceId = toNullableNumber(right.sourceMaintId) ?? -1;
  return leftSourceId - rightSourceId;
}

function dedupeShopRelations(rows = []) {
  const bestByKey = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.itemInternalName ?? null,
      row.npcInternalName ?? null
    ]);
    const current = bestByKey.get(key);
    if (!current || compareRelationRowQuality(row, current) > 0) {
      bestByKey.set(key, row);
    }
  }
  return [...bestByKey.values()];
}

function dedupeLootRelations(rows = []) {
  const bestByKey = new Map();
  for (const row of rows) {
    const key = JSON.stringify([
      row.itemInternalName ?? null,
      row.npcInternalName ?? null,
      row.quantityText ?? null,
      row.chanceText ?? null,
      row.conditions ?? null,
      row.conditionBiomeCode ?? null,
      row.conditionGamePeriodCode ?? null,
      row.conditionTimeCode ?? null,
      row.conditionWeatherCode ?? null,
      row.conditionEventsJson ?? null,
      row.specialFlagsJson ?? null
    ]);
    const current = bestByKey.get(key);
    if (!current || compareRelationRowQuality(row, current) > 0) {
      bestByKey.set(key, row);
    }
  }
  return [...bestByKey.values()];
}

function buildShopCandidateFromRelation(row) {
  const {
    conditionSourceText,
    conditionParseStatus,
    conditionBiomeCode,
    conditionGamePeriodCode,
    conditionTimeCode,
    conditionWeatherCode,
    conditionEventsJson,
    specialFlagsJson,
    ...candidateBase
  } = row;

  return {
    ...candidateBase,
    recordKey: createRecordKey({
      type: 'npc_shop_candidate',
      sourceFactKey: row.sourceFactKey
    }),
    reason: 'npc_shop_source_resolved'
  };
}

function buildLootCandidateFromRelation(row) {
  const {
    conditionSourceText,
    conditionParseStatus,
    conditionBiomeCode,
    conditionGamePeriodCode,
    conditionTimeCode,
    conditionWeatherCode,
    conditionEventsJson,
    specialFlagsJson,
    ...candidateBase
  } = row;

  return {
    ...candidateBase,
    recordKey: createRecordKey({
      type: 'npc_loot_candidate',
      sourceFactKey: row.sourceFactKey
    }),
    reason: 'npc_drop_source_resolved'
  };
}

export function resolveNpcRef(row = {}, npcIndex = new Map()) {
  const raw = parseRawJson(row);
  const sourceRefName = pickText(row.source_ref_name, raw.sourceRefName);
  const normalizedRefName = normalizeSourceRefName(sourceRefName);
  const rawResolution = normalizeText(raw.sourceRefResolution ?? raw.source_ref_resolution);
  const rawInternalName = normalizeText(raw.sourceRefInternalName ?? raw.source_ref_internal_name);

  if (!(npcIndex instanceof Map) || !normalizedRefName) {
    return {
      status: relationStatus.unresolved,
      npcSourceId: null,
      npcInternalName: null,
      npcName: null,
      sourceRefName,
      sourceRefNormalized: normalizedRefName,
      sourceRefResolution: 'no_match',
      confidence: confidence.none,
      reason: 'npc_source_unresolved'
    };
  }

  let match = npcIndex.get(normalizedRefName) ?? null;
  if (!match && rawResolution === 'resolved' && rawInternalName) {
    for (const candidate of npcIndex.values()) {
      if (normalizeText(candidate?.internal_name ?? candidate?.internalName) === rawInternalName) {
        match = candidate;
        break;
      }
    }
  }
  if (!match) {
    const lowered = normalizedRefName.toLowerCase();
    for (const [name, candidate] of npcIndex.entries()) {
      if (normalizeText(name)?.toLowerCase() === lowered) {
        match = candidate;
        break;
      }
    }
  }

  if (!match) {
    return {
      status: relationStatus.unresolved,
      npcSourceId: null,
      npcInternalName: null,
      npcName: null,
      sourceRefName,
      sourceRefNormalized: normalizedRefName,
      sourceRefResolution: 'no_match',
      confidence: confidence.none,
      reason: 'npc_source_unresolved'
    };
  }

  return {
    status: relationStatus.resolved,
    npcSourceId: toNullableNumber(match.source_id ?? match.sourceId),
    npcInternalName: normalizeText(match.internal_name ?? match.internalName),
    npcName: normalizeText(match.name) ?? normalizeText(match.internal_name ?? match.internalName),
    sourceRefName,
    sourceRefNormalized: normalizedRefName,
    sourceRefResolution: 'resolved',
    confidence: confidence.high,
    reason: 'npc_source_resolved'
  };
}

export function buildItemSourceRelations({ itemSourceRows = [], npcIndex = new Map() } = {}) {
  const sourceFacts = [];
  const sourceDetails = [];
  const npcShopRelationRows = [];
  const npcLootRelationRows = [];
  const issues = [];

  for (let index = 0; index < itemSourceRows.length; index += 1) {
    const row = itemSourceRows[index] ?? {};
    const raw = parseRawJson(row);
    const trace = normalizeTrace('maint_item_sources', row);
    const sourceType = normalizeText(row.source_type)?.toLowerCase() ?? null;
    const sourceRefType = normalizeText(row.source_ref_type)?.toLowerCase() ?? null;
    const sourceRefName = pickText(row.source_ref_name, raw.sourceRefName);
    const sourceRefNormalized = normalizeSourceRefName(sourceRefName);
    const sourceFactKey = createRecordKey({
      type: 'item_source_fact',
      rowRecordKey: trace.sourceMaintRecordKey,
      sortOrder: row.sort_order ?? index
    });

    const npcResolution =
      sourceRefType === 'npc'
        ? resolveNpcRef({ ...row, raw_json: raw }, npcIndex)
        : null;

    sourceFacts.push({
      recordKey: sourceFactKey,
      itemSourceId: toNullableNumber(row.item_source_id ?? row.item_id ?? row.source_id),
      itemInternalName: normalizeText(row.item_internal_name),
      itemName: normalizeText(row.item_name),
      sourceType,
      sourceRefType,
      sourceRefName,
      sourceRefNormalized,
      biomeCode: normalizeText(row.biome_code),
      sortOrder: toSortOrder(row.sort_order, index),
      reviewStatus:
        sourceRefType === 'npc'
          ? npcResolution?.status ?? relationStatus.unresolved
          : relationStatus.resolved,
      confidence:
        sourceRefType === 'npc'
          ? npcResolution?.confidence ?? confidence.none
          : confidence.high,
      reason:
        sourceRefType === 'npc'
          ? npcResolution?.reason ?? 'npc_source_unresolved'
          : 'item_source_captured',
      rawJson: row.raw_json ?? null,
      ...trace
    });

    const sourceRefResolutionText =
      normalizeText(raw.sourceRefResolution ?? raw.source_ref_resolution) ??
      (sourceRefType === 'npc' ? npcResolution?.sourceRefResolution ?? 'no_match' : null);

    sourceDetails.push({
      recordKey: createRecordKey({
        type: 'item_source_detail',
        sourceFactKey
      }),
      sourceFactKey,
      sourceRefName,
      quantityMin: toNullableNumber(raw.quantityMin ?? raw.quantity_min),
      quantityMax: toNullableNumber(raw.quantityMax ?? raw.quantity_max),
      quantityText: pickText(raw.quantityText ?? raw.quantity_text, row.quantity_text),
      chanceValue: toNullableNumber(raw.chanceValue ?? raw.chance_value),
      chanceText: pickText(raw.chanceText ?? raw.chance_text, row.chance_text),
      sourceRefInternalName:
        npcResolution?.status === relationStatus.resolved
          ? npcResolution.npcInternalName
          : normalizeText(raw.sourceRefInternalName ?? raw.source_ref_internal_name) ?? null,
      sourceRefResolution:
        npcResolution?.status === relationStatus.resolved
          ? npcResolution.sourceRefResolution
          : sourceRefResolutionText,
      notes: pickText(raw.notes, row.notes),
      rawJson: row.raw_json ?? null,
      ...trace
    });

    if (isPollutedSourceRefName(sourceRefName)) {
      issues.push({
        issueKey: createRecordKey({
          type: 'item_source_issue',
          reason: 'source_ref_text_polluted',
          sourceFactKey
        }),
        sourceFactKey,
        itemInternalName: normalizeText(row.item_internal_name),
        sourceType,
        sourceRefType,
        sourceRefName,
        sourceRefNormalized,
        reviewStatus: relationStatus.candidateLowConfidence,
        confidence: confidence.low,
        reason: 'source_ref_text_polluted',
        ...trace
      });
    }

    if (sourceRefType === 'npc' && npcResolution?.status !== relationStatus.resolved) {
      issues.push({
        issueKey: createRecordKey({
          type: 'item_source_issue',
          reason: 'npc_source_unresolved',
          sourceFactKey
        }),
        sourceFactKey,
        itemInternalName: normalizeText(row.item_internal_name),
        sourceType,
        sourceRefType,
        sourceRefName,
        sourceRefNormalized,
        reviewStatus: relationStatus.unresolved,
        confidence: confidence.none,
        reason: 'npc_source_unresolved',
        ...trace
      });
    }

    if (sourceRefType === 'npc' && npcResolution?.status === relationStatus.resolved && sourceType === 'shop') {
      const normalizedConditions = normalizeSourceConditionFields({
        conditions: pickText(raw.conditions, row.conditions),
        notes: extractRelevantNotes(sourceType, pickText(raw.notes, row.notes)),
        biomeCode: row.biome_code,
        allowUpstreamBiomeCode: false
      });
      const relationRow = {
        recordKey: createRecordKey({
          type: 'npc_shop_relation',
          sourceFactKey
        }),
        sourceFactKey,
        itemInternalName: normalizeText(row.item_internal_name),
        npcSourceId: npcResolution.npcSourceId,
        npcInternalName: npcResolution.npcInternalName,
        npcName: npcResolution.npcName,
        priceText: pickText(raw.priceText ?? raw.price_text, row.price_text),
        conditions: pickText(raw.conditions, row.conditions),
        ...normalizedConditions,
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'npc_shop_relation_resolved',
        ...trace
      };
      npcShopRelationRows.push(relationRow);
    }

    if (sourceRefType === 'npc' && npcResolution?.status === relationStatus.resolved && sourceType === 'drop') {
      const normalizedConditions = normalizeSourceConditionFields({
        conditions:
          pickText(raw.conditions, row.conditions)
          ?? extractConditionTextFromChanceText(pickText(raw.chanceText ?? raw.chance_text, row.chance_text)),
        notes: extractRelevantNotes(sourceType, pickText(raw.notes, row.notes)),
        biomeCode: row.biome_code
      });
      const relationRow = {
        recordKey: createRecordKey({
          type: 'npc_loot_relation',
          sourceFactKey
        }),
        sourceFactKey,
        itemInternalName: normalizeText(row.item_internal_name),
        npcSourceId: npcResolution.npcSourceId,
        npcInternalName: npcResolution.npcInternalName,
        npcName: npcResolution.npcName,
        quantityMin: toNullableNumber(raw.quantityMin ?? raw.quantity_min),
        quantityMax: toNullableNumber(raw.quantityMax ?? raw.quantity_max),
        quantityText: pickText(raw.quantityText ?? raw.quantity_text, row.quantity_text),
        chanceValue: toNullableNumber(raw.chanceValue ?? raw.chance_value),
        chanceText: pickText(raw.chanceText ?? raw.chance_text, row.chance_text),
        conditions: pickText(raw.conditions, row.conditions),
        ...normalizedConditions,
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'npc_loot_relation_resolved',
        ...trace
      };
      npcLootRelationRows.push(relationRow);
    }
  }

  const npcShopRelations = dedupeShopRelations(npcShopRelationRows);
  const npcLootRelations = dedupeLootRelations(npcLootRelationRows);
  const npcShopCandidates = npcShopRelations.map((row) => buildShopCandidateFromRelation(row));
  const npcLootCandidates = npcLootRelations.map((row) => buildLootCandidateFromRelation(row));

  return {
    sourceFacts,
    sourceDetails,
    npcShopRelations,
    npcLootRelations,
    npcShopCandidates,
    npcLootCandidates,
    issues,
    summary: {
      inputRows: itemSourceRows.length,
      sourceFacts: sourceFacts.length,
      sourceDetails: sourceDetails.length,
      npcShopRelations: npcShopRelations.length,
      npcLootRelations: npcLootRelations.length,
      npcShopCandidates: npcShopCandidates.length,
      npcLootCandidates: npcLootCandidates.length,
      unresolvedNpcSources: issues.filter((issue) => issue.reason === 'npc_source_unresolved').length,
      pollutedSourceRefs: issues.filter((issue) => issue.reason === 'source_ref_text_polluted').length
    }
  };
}
