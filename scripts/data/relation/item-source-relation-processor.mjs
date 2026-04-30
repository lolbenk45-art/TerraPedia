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

function asCandidateList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return value ? [value] : [];
}

function candidateIdentity(candidate) {
  return JSON.stringify([
    toNullableNumber(candidate?.source_id ?? candidate?.sourceId),
    normalizeText(candidate?.internal_name ?? candidate?.internalName)
  ]);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  for (const candidate of candidates) {
    const key = candidateIdentity(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function candidateInternalName(candidate) {
  return normalizeText(candidate?.internal_name ?? candidate?.internalName);
}

function normalizeLookupKey(value) {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

function itemCandidateIdentity(candidate) {
  return JSON.stringify([
    toNullableNumber(candidate?.source_id ?? candidate?.sourceId),
    normalizeText(candidate?.internal_name ?? candidate?.internalName)
  ]);
}

function itemCandidateInternalName(candidate) {
  return normalizeText(candidate?.internal_name ?? candidate?.internalName);
}

function dedupeItemCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  for (const candidate of candidates) {
    const key = itemCandidateIdentity(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function lookupItemCandidates(itemIndex, value) {
  if (!(itemIndex instanceof Map)) return [];
  const text = normalizeText(value);
  if (!text) return [];

  const candidates = [];
  const exact = itemIndex.get(text);
  candidates.push(...asCandidateList(exact));

  const normalized = normalizeLookupKey(text);
  if (normalized && normalized !== text) {
    candidates.push(...asCandidateList(itemIndex.get(normalized)));
  }

  return dedupeItemCandidates(candidates);
}

function resolveItemRef(row = {}, raw = {}, itemIndex = new Map()) {
  const directInternalName = normalizeText(row.item_internal_name ?? raw.itemInternalName ?? raw.item_internal_name);
  if (directInternalName) {
    return {
      status: relationStatus.resolved,
      itemInternalName: directInternalName,
      confidence: confidence.high,
      reason: 'item_source_captured'
    };
  }

  const candidateNames = [
    row.item_name,
    raw.itemName,
    raw.item_name,
    raw.raw?.name
  ];
  const candidates = dedupeItemCandidates(candidateNames.flatMap((name) => lookupItemCandidates(itemIndex, name)));

  if (candidates.length === 1) {
    return {
      status: relationStatus.resolved,
      itemInternalName: itemCandidateInternalName(candidates[0]),
      confidence: confidence.high,
      reason: 'item_resolved_by_name'
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      itemInternalName: null,
      confidence: confidence.low,
      reason: 'item_ambiguous'
    };
  }

  return {
    status: relationStatus.unresolved,
    itemInternalName: null,
    confidence: confidence.none,
    reason: 'item_unresolved'
  };
}

function isAuthoritativeNpcInternalNameResolution(value) {
  return value === 'resolved' || value === 'exact_internal_name';
}

function relationKindForSourceType(sourceType) {
  if (sourceType === 'shop') return 'shop';
  if (sourceType === 'drop' || sourceType === 'loot') return 'loot';
  if (sourceType === 'reward') return 'reward';
  return 'source_item';
}

function isGeneratedNpcShopSourceRow(row = {}, raw = {}, sourceType, sourceRefType) {
  if (sourceType !== 'shop' || sourceRefType !== 'npc') return false;
  const relationType = normalizeText(raw.relationType ?? raw.relation_type)?.toLowerCase();
  const sourceSection = normalizeText(raw.sourceSection ?? raw.source_section)?.toLowerCase();
  const recordKey = normalizeText(row.record_key ?? raw.recordKey ?? raw.record_key);
  return (
    (relationType === 'shop' && sourceSection === 'shop') ||
    /^npc-item:/i.test(recordKey ?? '')
  );
}

function buildAuthoritativeNpcShopRefKeys(itemSourceRows = []) {
  const keys = new Set();
  for (const row of itemSourceRows) {
    const raw = parseRawJson(row);
    const sourceType = normalizeText(row.source_type)?.toLowerCase() ?? null;
    const sourceRefType = normalizeText(row.source_ref_type)?.toLowerCase() ?? null;
    if (!isGeneratedNpcShopSourceRow(row, raw, sourceType, sourceRefType)) continue;
    const sourceRefName = pickText(row.source_ref_name, raw.sourceRefName);
    const normalized = normalizeLookupKey(normalizeSourceRefName(sourceRefName));
    if (normalized) keys.add(normalized);
  }
  return keys;
}

function buildRelationEvidence({
  raw,
  row,
  sourceType,
  sourceRefType,
  sourceRefName,
  sourceRefNormalized,
  npcResolution
}) {
  return JSON.stringify({
    sourceType,
    sourceRefType,
    sourceRefName,
    sourceRefNormalized,
    sourceRefResolution: npcResolution?.sourceRefResolution ?? null,
    candidateNpcInternalNames: npcResolution?.candidateNpcInternalNames ?? [],
    row: {
      id: row.id ?? null,
      recordKey: row.record_key ?? null,
      sourcePage: row.source_page ?? null
    },
    raw
  });
}

function buildItemNpcRelationAudit({
  row,
  raw,
  sourceType,
  sourceRefType,
  sourceFactKey,
  sourceRefName,
  sourceRefNormalized,
  npcResolution,
  auditStatus,
  reasonCode,
  trace
}) {
  return {
    auditKey: createRecordKey({
      type: 'item_npc_relation_audit',
      sourceFactKey,
      auditStatus,
      reasonCode
    }),
    relationKind: relationKindForSourceType(sourceType),
    sourceFactKey,
    itemInternalName: normalizeText(row.item_internal_name),
    itemName: normalizeText(row.item_name),
    sourceRefName,
    sourceRefNormalized,
    candidateNpcInternalName:
      npcResolution?.npcInternalName
      ?? npcResolution?.candidateNpcInternalNames?.[0]
      ?? null,
    auditStatus,
    reasonCode,
    evidenceJson: buildRelationEvidence({
      raw,
      row,
      sourceType,
      sourceRefType,
      sourceRefName,
      sourceRefNormalized,
      npcResolution
    }),
    ...trace
  };
}

function buildRelationRawJson(raw, sourceRefName, npcResolution) {
  return JSON.stringify({
    ...raw,
    sourceRefOriginalName: sourceRefName ?? raw.sourceRefName ?? null,
    sourceRefName: npcResolution?.sourceRefNormalized ?? sourceRefName ?? raw.sourceRefName ?? null,
    sourceRefInternalName: npcResolution?.npcInternalName ?? raw.sourceRefInternalName ?? null,
    sourceRefResolution: npcResolution?.sourceRefResolution ?? raw.sourceRefResolution ?? null
  });
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

  let candidates = dedupeCandidates(asCandidateList(npcIndex.get(normalizedRefName)));
  if (candidates.length && isAuthoritativeNpcInternalNameResolution(rawResolution) && rawInternalName) {
    const exactCandidates = dedupeCandidates(candidates.filter((candidate) => candidateInternalName(candidate) === rawInternalName));
    if (exactCandidates.length === 1) {
      candidates = exactCandidates;
    }
  }
  if (!candidates.length && isAuthoritativeNpcInternalNameResolution(rawResolution) && rawInternalName) {
    for (const candidateValue of npcIndex.values()) {
      for (const candidate of asCandidateList(candidateValue)) {
        if (candidateInternalName(candidate) === rawInternalName) {
          candidates.push(candidate);
        }
      }
    }
  }
  if (!candidates.length) {
    const lowered = normalizedRefName.toLowerCase();
    for (const [name, candidate] of npcIndex.entries()) {
      if (normalizeText(name)?.toLowerCase() === lowered) {
        candidates.push(...asCandidateList(candidate));
      }
    }
  }

  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      npcSourceId: null,
      npcInternalName: null,
      npcName: null,
      sourceRefName,
      sourceRefNormalized: normalizedRefName,
      sourceRefResolution: 'ambiguous',
      candidateNpcInternalNames: candidates.map(candidateInternalName).filter(Boolean),
      confidence: confidence.low,
      reason: 'npc_source_ambiguous'
    };
  }

  const match = candidates[0] ?? null;
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
    sourceRefResolution: rawResolution === 'exact_internal_name' ? 'exact_internal_name' : 'resolved',
    confidence: confidence.high,
    reason: 'npc_source_resolved'
  };
}

export function buildItemSourceRelations({ itemSourceRows = [], npcIndex = new Map(), itemIndex = new Map() } = {}) {
  const sourceFacts = [];
  const sourceDetails = [];
  const npcShopRelationRows = [];
  const npcLootRelationRows = [];
  const itemNpcRelationAudits = [];
  const issues = [];
  const authoritativeNpcShopRefKeys = buildAuthoritativeNpcShopRefKeys(itemSourceRows);

  for (let index = 0; index < itemSourceRows.length; index += 1) {
    const row = itemSourceRows[index] ?? {};
    const raw = parseRawJson(row);
    const trace = normalizeTrace('maint_item_sources', row);
    const sourceType = normalizeText(row.source_type)?.toLowerCase() ?? null;
    const sourceRefType = normalizeText(row.source_ref_type)?.toLowerCase() ?? null;
    const itemResolution = resolveItemRef(row, raw, itemIndex);
    const itemInternalName = itemResolution.itemInternalName;
    const effectiveRow = { ...row, item_internal_name: itemInternalName };
    const sourceRefName = pickText(row.source_ref_name, raw.sourceRefName);
    const sourceRefNormalized = normalizeSourceRefName(sourceRefName);
    const sourceRefKey = normalizeLookupKey(sourceRefNormalized);
    const isGeneratedNpcShopSource = isGeneratedNpcShopSourceRow(row, raw, sourceType, sourceRefType);
    const isSupersededNpcShopSource =
      sourceType === 'shop'
      && sourceRefType === 'npc'
      && !isGeneratedNpcShopSource
      && sourceRefKey != null
      && authoritativeNpcShopRefKeys.has(sourceRefKey);
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
      itemInternalName,
      itemName: normalizeText(row.item_name),
      sourceType,
      sourceRefType,
      sourceRefName,
      sourceRefNormalized,
      biomeCode: normalizeText(row.biome_code),
      sortOrder: toSortOrder(row.sort_order, index),
      reviewStatus: !itemInternalName
        ? relationStatus.unresolved
        : sourceRefType === 'npc'
          ? npcResolution?.status ?? relationStatus.unresolved
          : relationStatus.resolved,
      confidence: !itemInternalName
        ? itemResolution.confidence
        : sourceRefType === 'npc'
          ? npcResolution?.confidence ?? confidence.none
          : confidence.high,
      reason: !itemInternalName
        ? itemResolution.reason
        : sourceRefType === 'npc'
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
        itemInternalName,
        sourceType,
        sourceRefType,
        sourceRefName,
        sourceRefNormalized,
        reviewStatus: relationStatus.candidateLowConfidence,
        confidence: confidence.low,
        reason: 'source_ref_text_polluted',
        ...trace
      });
      itemNpcRelationAudits.push(buildItemNpcRelationAudit({
        row: effectiveRow,
        raw,
        sourceType,
        sourceRefType,
        sourceFactKey,
        sourceRefName,
        sourceRefNormalized,
        npcResolution,
        auditStatus: 'polluted',
        reasonCode: 'source_text_polluted',
        trace
      }));
    }

    if (sourceRefType === 'npc' && npcResolution?.status !== relationStatus.resolved) {
      issues.push({
        issueKey: createRecordKey({
          type: 'item_source_issue',
          reason: 'npc_source_unresolved',
          sourceFactKey
        }),
        sourceFactKey,
        itemInternalName,
        sourceType,
        sourceRefType,
        sourceRefName,
        sourceRefNormalized,
        reviewStatus: relationStatus.unresolved,
        confidence: confidence.none,
        reason: 'npc_source_unresolved',
        ...trace
      });
      itemNpcRelationAudits.push(buildItemNpcRelationAudit({
        row: effectiveRow,
        raw,
        sourceType,
        sourceRefType,
        sourceFactKey,
        sourceRefName,
        sourceRefNormalized,
        npcResolution,
        auditStatus: npcResolution?.status === 'ambiguous' ? 'ambiguous' : 'unresolved',
        reasonCode: npcResolution?.reason ?? 'npc_source_unresolved',
        trace
      }));
    }

    if (sourceRefType === 'npc' && npcResolution?.status === relationStatus.resolved && !itemInternalName) {
      issues.push({
        issueKey: createRecordKey({
          type: 'item_source_issue',
          reason: 'item_unresolved',
          sourceFactKey
        }),
        sourceFactKey,
        itemInternalName,
        sourceType,
        sourceRefType,
        sourceRefName,
        sourceRefNormalized,
        reviewStatus: relationStatus.unresolved,
        confidence: itemResolution.confidence,
        reason: itemResolution.reason,
        ...trace
      });
      itemNpcRelationAudits.push(buildItemNpcRelationAudit({
        row: effectiveRow,
        raw,
        sourceType,
        sourceRefType,
        sourceFactKey,
        sourceRefName,
        sourceRefNormalized,
        npcResolution,
        auditStatus: 'unresolved',
        reasonCode: itemResolution.reason,
        trace
      }));
    }

    if (
      sourceRefType === 'npc'
      && npcResolution?.status === relationStatus.resolved
      && itemInternalName
      && isSupersededNpcShopSource
    ) {
      itemNpcRelationAudits.push(buildItemNpcRelationAudit({
        row: effectiveRow,
        raw,
        sourceType,
        sourceRefType,
        sourceFactKey,
        sourceRefName,
        sourceRefNormalized,
        npcResolution,
        auditStatus: 'superseded',
        reasonCode: 'npc_shop_source_superseded_by_npc_page',
        trace
      }));
    }

    if (
      sourceRefType === 'npc'
      && npcResolution?.status === relationStatus.resolved
      && itemInternalName
      && sourceType === 'shop'
      && !isSupersededNpcShopSource
    ) {
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
        itemInternalName,
        itemName: normalizeText(row.item_name),
        npcSourceId: npcResolution.npcSourceId,
        npcInternalName: npcResolution.npcInternalName,
        npcName: npcResolution.npcName,
        priceText: pickText(raw.priceText ?? raw.price_text, row.price_text),
        conditions: pickText(raw.conditions, row.conditions),
        ...normalizedConditions,
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'npc_shop_relation_resolved',
        rawJson: buildRelationRawJson(raw, sourceRefName, npcResolution),
        ...trace
      };
      npcShopRelationRows.push(relationRow);
    }

    if (sourceRefType === 'npc' && npcResolution?.status === relationStatus.resolved && itemInternalName && sourceType === 'drop') {
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
        itemInternalName,
        itemName: normalizeText(row.item_name),
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
        rawJson: buildRelationRawJson(raw, sourceRefName, npcResolution),
        ...trace
      };
      npcLootRelationRows.push(relationRow);
    }
  }

  const npcShopRelations = dedupeShopRelations(npcShopRelationRows);
  const npcLootRelations = dedupeLootRelations(npcLootRelationRows);

  return {
    sourceFacts,
    sourceDetails,
    npcShopRelations,
    npcLootRelations,
    itemNpcRelationAudits,
    issues,
    summary: {
      inputRows: itemSourceRows.length,
      sourceFacts: sourceFacts.length,
      sourceDetails: sourceDetails.length,
      npcShopRelations: npcShopRelations.length,
      npcLootRelations: npcLootRelations.length,
      itemNpcRelationAudits: itemNpcRelationAudits.length,
      unresolvedNpcSources: issues.filter((issue) => issue.reason === 'npc_source_unresolved').length,
      pollutedSourceRefs: issues.filter((issue) => issue.reason === 'source_ref_text_polluted').length
    }
  };
}
