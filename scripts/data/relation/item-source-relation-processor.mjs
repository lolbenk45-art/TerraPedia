import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';
import { normalizeSourceConditionFields } from './source-condition-normalizer.mjs';
import { classifyNpcLootSource } from '../lib/npc-loot-source-taxonomy.mjs';

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
  if (normalizeLootConditionKey(text) == null) return null;

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
    const key = lootRelationStableKey(row, { includeInheritedProvenance: true, includeChance: true });
    const current = bestByKey.get(key);
    if (!current || compareRelationRowQuality(row, current) > 0) {
      bestByKey.set(key, row);
    }
  }
  return dedupeLootRelationsByChanceContainment([...bestByKey.values()]);
}

function lootRelationStableKey(row = {}, { includeInheritedProvenance = false, includeChance = true } = {}) {
  const sourceOnlyBiomeCode = hasSourceOnlyBiomeCondition(row);
  return JSON.stringify([
    row.itemInternalName ?? null,
    row.npcInternalName ?? null,
    row.quantityText ?? null,
    includeChance ? normalizeLootChanceKey(row.chanceText) : null,
    normalizeLootConditionKey(row.conditions),
    sourceOnlyBiomeCode ? null : row.conditionBiomeCode ?? null,
    row.conditionGamePeriodCode ?? null,
    row.conditionTimeCode ?? null,
    row.conditionWeatherCode ?? null,
    row.conditionEventsJson ?? null,
    row.specialFlagsJson ?? null,
    includeInheritedProvenance ? lootProvenanceDedupeKey(row) : null
  ]);
}

function dedupeLootRelationsByChanceContainment(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = lootRelationStableKey(row, { includeInheritedProvenance: true, includeChance: false });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const deduped = [];
  for (const groupRows of groups.values()) {
    for (const row of groupRows) {
      const rowChances = parseLootChanceTokens(row.chanceText);
      const isCovered = rowChances.length > 0 && groupRows.some((candidate) => {
        if (candidate === row) return false;
        if (!canDedupeLootChanceSubset(row, candidate)) return false;
        const candidateChances = parseLootChanceTokens(candidate.chanceText);
        return isStrictChanceSuperset(candidateChances, rowChances);
      });
      if (!isCovered) {
        deduped.push(row);
      }
    }
  }
  return deduped;
}

function canDedupeLootChanceSubset(row = {}, candidate = {}) {
  return (
    hasNoSemanticLootConditions(row)
    && hasNoSemanticLootConditions(candidate)
    && hasDefaultModeRowEvidence(candidate)
  );
}

function hasNoSemanticLootConditions(row = {}) {
  const hasOnlySourceFieldBiome = hasSourceOnlyBiomeCondition(row);
  return (
    normalizeLootConditionKey(row.conditions) == null
    && row.conditionSourceText == null
    && (row.conditionBiomeCode == null || hasOnlySourceFieldBiome)
    && row.conditionGamePeriodCode == null
    && row.conditionTimeCode == null
    && row.conditionWeatherCode == null
    && row.conditionEventsJson == null
    && row.specialFlagsJson == null
  );
}

function hasSourceOnlyBiomeCondition(row = {}) {
  return (
    row.conditionParseStatus === 'source_fields_only'
    && row.conditionSourceText == null
    && normalizeLootConditionKey(row.conditions) == null
  );
}

function hasDefaultModeRowEvidence(row = {}) {
  const raw = parseRelationRawJson(row.rawJson);
  return [
    row.conditions,
    row.conditionSourceText,
    raw.conditions,
    raw.conditionText,
    raw.condition_text,
    raw.notes
  ].some((value) => /^normal mode row$/i.test(normalizeText(value) ?? ''));
}

function normalizeLootChanceKey(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const withoutTemplates = text
    .replace(/\{\{\s*modes\s*\|([^{}]+)\}\}/gi, (_match, body) => (
      String(body)
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')
    ));
  return withoutTemplates.replace(/\s+/g, ' ').trim().toLowerCase() || null;
}

function parseLootChanceTokens(value) {
  const normalized = normalizeLootChanceKey(value);
  if (!normalized) return [];
  return normalized.match(/\d+(?:\.\d+)?%/g) ?? [];
}

function isStrictChanceSuperset(candidateChances = [], rowChances = []) {
  if (candidateChances.length <= rowChances.length) return false;
  const candidateSet = new Set(candidateChances);
  return rowChances.every((chance) => candidateSet.has(chance));
}

function normalizeLootConditionKey(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return /^normal mode row$/i.test(text) ? null : text;
}

function lootProvenanceDedupeKey(row = {}) {
  if (row.reason !== 'contract_backed_inherited_loot') return null;
  const raw = parseRelationRawJson(row.rawJson);
  return JSON.stringify([
    row.reason,
    raw.inheritedFromNpcInternalName ?? null,
    raw.inheritanceKind ?? null,
    raw.inheritedSourceFactKey ?? null,
  ]);
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

function stripNpcDisambiguationSuffix(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.replace(/\s+\((?:npc|enemy|boss)\)$/i, '').trim() || text;
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
  return value === 'resolved' || value === 'exact_internal_name' || value === 'reviewed_page_level_shared_loot';
}

function isPositiveIdFallbackResolution(value) {
  return value === 'positive_id_fallback';
}

const REPRESENTATIVE_SAFE_NPC_SUFFIXES = Object.freeze(['Head', 'Body', 'Tail', 'Legs']);
const REPRESENTATIVE_UNSAFE_NPC_SUFFIX_TOKENS = Object.freeze([
  'Corruption',
  'Crimson',
  'Hallow',
  'Hallowed',
  'Jungle',
  'Desert',
  'Light',
  'Dark',
  'T1',
  'T2',
  'T3',
  'Axe',
  'Flail',
  'Sword',
  'Spear',
  'Gun',
  'Snow',
  'Frozen'
]);

const REVIEWED_POSITIVE_ID_FALLBACK_NPC_INTERNAL_NAMES = new Set([
  'DesertLamiaLight',
  'DesertScorpionWalk',
  'DiabolistRed',
  'DD2DarkMageT1',
  'DD2OgreT2',
  'PigronCorruption',
  'RustyArmoredBonesAxe',
  'ZombieEskimo',
]);

const REVIEWED_BOSS_KIND_NPC_LOOT_EXCEPTION_INTERNAL_NAMES = new Set([
  'DD2DarkMageT1',
  'DD2DarkMageT3',
  'DD2OgreT2',
  'DD2OgreT3',
]);

const ALLOWED_INHERITANCE_KINDS = new Set([
  'segment_family',
  'prototype_variant',
  'same_name_variant',
]);

function commonPrefix(values) {
  if (!values.length) return '';
  let prefix = values[0] ?? '';
  for (const value of values.slice(1)) {
    while (prefix && !String(value ?? '').startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function isRepresentativeSafeNpcFamily(candidates, rawInternalName) {
  const internalNames = dedupeCandidates(candidates).map(candidateInternalName).filter(Boolean);
  if (!rawInternalName || !internalNames.includes(rawInternalName)) return false;
  if (internalNames.filter((name) => name === rawInternalName).length !== 1) return false;
  if (internalNames.length < 2) return false;

  const prefix = commonPrefix(internalNames);
  if (!prefix) return false;
  const suffixes = internalNames.map((name) => name.slice(prefix.length));
  if (suffixes.some((suffix) => !suffix)) return false;
  if (suffixes.some((suffix) => REPRESENTATIVE_UNSAFE_NPC_SUFFIX_TOKENS.some((token) => suffix.includes(token)))) {
    return false;
  }
  return suffixes.every((suffix) =>
    REPRESENTATIVE_SAFE_NPC_SUFFIXES.some((token) => suffix === token || new RegExp(`^${token}\\d+$`).test(suffix))
  );
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

function isGeneratedNpcLootSourceRow(row = {}, raw = {}, sourceType, sourceRefType) {
  if (sourceType !== 'drop' || sourceRefType !== 'npc') return false;
  const relationType = normalizeText(raw.relationType ?? raw.relation_type)?.toLowerCase();
  const sourceSection = normalizeText(raw.sourceSection ?? raw.source_section)?.toLowerCase();
  const recordKey = normalizeText(row.record_key ?? raw.recordKey ?? raw.record_key);
  return (
    (relationType === 'loot' && sourceSection === 'drops') ||
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

function buildAuthoritativeNpcLootRefItemKeys(itemSourceRows = [], itemIndex = new Map()) {
  const keys = new Set();
  for (const row of itemSourceRows) {
    const raw = parseRawJson(row);
    const sourceType = normalizeText(row.source_type)?.toLowerCase() ?? null;
    const sourceRefType = normalizeText(row.source_ref_type)?.toLowerCase() ?? null;
    if (!isGeneratedNpcLootSourceRow(row, raw, sourceType, sourceRefType)) continue;
    const sourceRefKey = normalizeLookupKey(raw.sourceRefInternalName ?? raw.source_ref_internal_name)
      ?? normalizeLookupKey(normalizeSourceRefName(pickText(row.source_ref_name, raw.sourceRefName)));
    const itemInternalName = resolveItemRef(row, raw, itemIndex).itemInternalName;
    const itemKey = normalizeLookupKey(itemInternalName);
    if (sourceRefKey && itemKey) {
      keys.add(JSON.stringify([sourceRefKey, itemKey]));
    }
  }
  return keys;
}

function hasUpstreamLootConditionContribution(row = {}, raw = {}) {
  const notes = normalizeText(row.notes ?? raw.notes);
  return (
    normalizeText(row.biome_code ?? raw.biomeCode ?? raw.biome_code) != null ||
    normalizeText(row.conditions ?? raw.conditions) != null ||
    normalizeText(row.condition_text ?? raw.conditionText ?? raw.condition_text) != null ||
    (notes != null && CONDITION_SIGNAL_PATTERN.test(notes))
  );
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

function findNpcCandidateByInternalName(npcIndex, internalName) {
  if (!(npcIndex instanceof Map) || !internalName) return null;
  for (const candidateValue of npcIndex.values()) {
    for (const candidate of asCandidateList(candidateValue)) {
      if (candidateInternalName(candidate) === internalName) {
        return candidate;
      }
    }
  }
  return null;
}

function findNpcCandidatesByInternalName(npcIndex, internalName) {
  if (!(npcIndex instanceof Map) || !internalName) return [];
  const candidates = [];
  for (const candidateValue of npcIndex.values()) {
    for (const candidate of asCandidateList(candidateValue)) {
      if (candidateInternalName(candidate) === internalName) {
        candidates.push(candidate);
      }
    }
  }
  return dedupeCandidates(candidates);
}

function parseJsonObject(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function isBossNpcCandidate(candidate = {}) {
  const flags = parseJsonObject(candidate.flags_json ?? candidate.flagsJson ?? candidate.flags);
  return isTruthyFlag(flags.boss ?? candidate.is_boss ?? candidate.isBoss ?? candidate.boss);
}

function isItemBundleCollectiveBucketSourceRow(row = {}, raw = {}, classification = {}) {
  const landingSourceKey = normalizeText(row.landing_source_key ?? row.landingSourceKey);
  if (!landingSourceKey?.startsWith('generated.item_relations_bundle')) return false;
  if (normalizeText(row.record_key ?? raw.recordKey)?.startsWith('npc-item:')) return false;
  return classification.status === 'generic_bucket';
}

function applyNpcLootTaxonomy({
  row = {},
  raw = {},
  sourceType,
  sourceRefType,
  npcResolution,
  npcIndex = new Map(),
  reviewedNonNpcSourceExclusions = [],
}) {
  if (sourceType !== 'drop' || sourceRefType !== 'npc') return npcResolution;

  const classification = classifyNpcLootSource(
    {
      itemInternalName: row.item_internal_name,
      itemName: row.item_name,
      sourceType,
      sourceRefType,
      sourceRefName: row.source_ref_name ?? raw.sourceRefName,
      sourceRefInternalName: npcResolution?.npcInternalName ?? raw.sourceRefInternalName ?? raw.source_ref_internal_name,
      sourceRefResolution: npcResolution?.sourceRefResolution ?? raw.sourceRefResolution ?? raw.source_ref_resolution,
      landingSourceKey: row.landing_source_key,
    },
    {
      sourceType,
      sourceRefType,
      reviewedNonNpcSourceExclusions,
    }
  );

  if (classification.status === 'accepted' && classification.targetNpcInternalName === 'Mimic') {
    const mimicCandidate = findNpcCandidateByInternalName(npcIndex, 'Mimic');
    if (!mimicCandidate) {
      return {
        ...(npcResolution ?? {}),
        status: 'blocked',
        npcSourceId: null,
        npcInternalName: null,
        npcName: null,
        sourceRefResolution: 'reviewed_mimic_contract_target_missing',
        confidence: confidence.none,
        reason: 'reviewed_mimic_target_missing',
        taxonomyStatus: 'blocked',
        taxonomyReason: 'reviewed_mimic_target_missing',
      };
    }
    return {
      status: relationStatus.resolved,
      npcSourceId: toNullableNumber(mimicCandidate?.source_id ?? mimicCandidate?.sourceId),
      npcInternalName: 'Mimic',
      npcName: normalizeText(mimicCandidate?.name) ?? 'Mimic',
      sourceRefName: row.source_ref_name ?? raw.sourceRefName,
      sourceRefNormalized: 'Mimic',
      sourceRefResolution: classification.sourceRefResolution ?? 'reviewed_mimic_contract',
      confidence: confidence.high,
      reason: 'npc_source_resolved',
      taxonomyStatus: classification.status,
      taxonomyReason: classification.reason,
    };
  }

  if (npcResolution?.status === relationStatus.resolved) {
    const resolvedCandidate = findNpcCandidateByInternalName(npcIndex, npcResolution.npcInternalName);
    if (isBossNpcCandidate(resolvedCandidate) && !isReviewedBossKindNpcLootException(npcResolution)) {
      return {
        ...(npcResolution ?? {}),
        status: 'blocked',
        npcSourceId: null,
        npcInternalName: null,
        npcName: null,
        sourceRefResolution: 'reviewed_non_npc_source_exclusion',
        confidence: confidence.none,
        reason: 'boss_reward_domain_separated',
        taxonomyStatus: 'reviewed_non_npc_source_exclusion',
        taxonomyReason: 'boss_reward_domain_separated',
      };
    }
  }

  if (isItemBundleCollectiveBucketSourceRow(row, raw, classification)) {
    return {
      ...(npcResolution ?? {}),
      status: 'excluded',
      npcSourceId: null,
      npcInternalName: null,
      npcName: null,
      sourceRefResolution: 'item_bundle_collective_bucket_excluded',
      confidence: confidence.none,
      reason: 'item_bundle_collective_bucket_not_npc_domain_source',
      taxonomyStatus: 'item_bundle_collective_bucket_excluded',
      taxonomyReason: 'item_bundle_collective_bucket_not_npc_domain_source',
    };
  }

  if (classification.status === 'reviewed_mimic_contract_rejected') {
    return {
      ...(npcResolution ?? {}),
      status: 'excluded',
      npcSourceId: null,
      npcInternalName: null,
      npcName: null,
      sourceRefResolution: classification.sourceRefResolution,
      confidence: confidence.none,
      reason: classification.reason,
      taxonomyStatus: classification.status,
      taxonomyReason: classification.reason,
    };
  }

  if (!classification.materializable) {
    return {
      ...(npcResolution ?? {}),
      status: 'blocked',
      npcSourceId: null,
      npcInternalName: null,
      npcName: null,
      sourceRefResolution: classification.status,
      confidence: confidence.none,
      reason: classification.reason,
      taxonomyStatus: classification.status,
      taxonomyReason: classification.reason,
    };
  }

  return {
    ...(npcResolution ?? {}),
    taxonomyStatus: classification.status,
    taxonomyReason: classification.reason,
  };
}

function isReviewedBossKindNpcLootException(npcResolution = {}) {
  return REVIEWED_BOSS_KIND_NPC_LOOT_EXCEPTION_INTERNAL_NAMES.has(npcResolution.npcInternalName)
    && (
      npcResolution.sourceRefResolution === 'exact_internal_name'
      || npcResolution.sourceRefResolution === 'positive_id_fallback'
    );
}

export function resolveNpcRef(row = {}, npcIndex = new Map()) {
  const raw = parseRawJson(row);
  const sourceRefName = pickText(row.source_ref_name, raw.sourceRefName);
  const normalizedRefName = normalizeSourceRefName(sourceRefName);
  const disambiguatedRefName = stripNpcDisambiguationSuffix(normalizedRefName);
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

  const authoritativeInternalNameCandidates =
    isAuthoritativeNpcInternalNameResolution(rawResolution) && rawInternalName
      ? findNpcCandidatesByInternalName(npcIndex, rawInternalName)
      : [];

  let candidates = authoritativeInternalNameCandidates.length === 1
    ? authoritativeInternalNameCandidates
    : dedupeCandidates(asCandidateList(npcIndex.get(normalizedRefName)));
  if (!candidates.length && disambiguatedRefName && disambiguatedRefName !== normalizedRefName) {
    candidates = dedupeCandidates(asCandidateList(npcIndex.get(disambiguatedRefName)));
  }
  if (candidates.length && isAuthoritativeNpcInternalNameResolution(rawResolution) && rawInternalName) {
    const exactCandidates = dedupeCandidates(candidates.filter((candidate) => candidateInternalName(candidate) === rawInternalName));
    if (exactCandidates.length === 1) {
      candidates = exactCandidates;
    }
  }
  if (candidates.length && isPositiveIdFallbackResolution(rawResolution) && rawInternalName) {
    const exactCandidates = dedupeCandidates(candidates.filter((candidate) => candidateInternalName(candidate) === rawInternalName));
    if (
      exactCandidates.length === 1 &&
      (isRepresentativeSafeNpcFamily(candidates, rawInternalName) || REVIEWED_POSITIVE_ID_FALLBACK_NPC_INTERNAL_NAMES.has(rawInternalName))
    ) {
      candidates = exactCandidates;
    }
  }
  if (!candidates.length && authoritativeInternalNameCandidates.length) {
    candidates = authoritativeInternalNameCandidates;
  }
  if (!candidates.length) {
    const lookupNames = [normalizedRefName, disambiguatedRefName].filter(Boolean);
    const lowered = new Set(lookupNames.map((name) => name.toLowerCase()));
    for (const [name, candidate] of npcIndex.entries()) {
      if (lowered.has(normalizeText(name)?.toLowerCase())) {
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
    sourceRefResolution:
      isAuthoritativeNpcInternalNameResolution(rawResolution)
        ? rawResolution
        : isPositiveIdFallbackResolution(rawResolution)
          ? 'positive_id_fallback'
          : 'resolved',
    confidence: confidence.high,
    reason: 'npc_source_resolved'
  };
}

export function buildItemSourceRelations({
  itemSourceRows = [],
  npcIndex = new Map(),
  itemIndex = new Map(),
  reviewedNonNpcSourceExclusions = [],
  inheritanceRules = [],
} = {}) {
  const sourceFacts = [];
  const sourceDetails = [];
  const npcShopRelationRows = [];
  const npcLootRelationRows = [];
  const itemNpcRelationAudits = [];
  const issues = [];
  const authoritativeNpcShopRefKeys = buildAuthoritativeNpcShopRefKeys(itemSourceRows);
  const authoritativeNpcLootRefItemKeys = buildAuthoritativeNpcLootRefItemKeys(itemSourceRows, itemIndex);

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
    const isGeneratedNpcLootSource = isGeneratedNpcLootSourceRow(row, raw, sourceType, sourceRefType);
    const itemKey = normalizeLookupKey(itemInternalName);
    const sourceFactKey = createRecordKey({
      type: 'item_source_fact',
      rowRecordKey: trace.sourceMaintRecordKey,
      sortOrder: row.sort_order ?? index
    });

    const npcResolution =
      sourceRefType === 'npc'
        ? applyNpcLootTaxonomy({
            row: effectiveRow,
            raw,
            sourceType,
            sourceRefType,
            npcResolution: resolveNpcRef({ ...row, raw_json: raw }, npcIndex),
            npcIndex,
            reviewedNonNpcSourceExclusions,
          })
        : null;
    const npcLootSupersedeSourceKey = normalizeLookupKey(npcResolution?.npcInternalName)
      ?? sourceRefKey;
    const isSupersededNpcLootSource =
      sourceType === 'drop'
      && sourceRefType === 'npc'
      && !isGeneratedNpcLootSource
      && npcLootSupersedeSourceKey != null
      && itemKey != null
      && !hasUpstreamLootConditionContribution(row, raw)
      && authoritativeNpcLootRefItemKeys.has(JSON.stringify([npcLootSupersedeSourceKey, itemKey]));

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
        auditStatus: npcResolution?.status === 'excluded' ? 'excluded' : npcResolution?.status === 'ambiguous' ? 'ambiguous' : npcResolution?.status === 'blocked' ? 'blocked' : 'unresolved',
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
      && isSupersededNpcLootSource
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
        reasonCode: 'npc_loot_source_superseded_by_npc_page',
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

    if (sourceRefType === 'npc' && npcResolution?.status === relationStatus.resolved && itemInternalName && sourceType === 'drop' && !isSupersededNpcLootSource) {
      const explicitLootConditions = normalizeLootConditionKey(
        pickText(raw.conditions, row.conditions)
        ?? pickText(raw.conditionText ?? raw.condition_text, row.condition_text)
      );
      const normalizedConditions = normalizeSourceConditionFields({
        conditions:
          explicitLootConditions
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
        conditions: explicitLootConditions,
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
  const directNpcLootRelations = dedupeLootRelations(npcLootRelationRows);
  const npcLootRelations = dedupeLootRelations([
    ...directNpcLootRelations,
    ...buildInheritedLootRelations({
      npcLootRelationRows: directNpcLootRelations,
      inheritanceRules,
      npcIndex,
    }),
  ]);

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

function buildInheritedLootRelations({
  npcLootRelationRows = [],
  inheritanceRules = [],
  npcIndex = new Map(),
} = {}) {
  const bySourceNpc = new Map();
  for (const row of npcLootRelationRows) {
    const sourceNpcInternalName = normalizeText(row.npcInternalName);
    if (!sourceNpcInternalName) continue;
    if (!bySourceNpc.has(sourceNpcInternalName)) bySourceNpc.set(sourceNpcInternalName, []);
    bySourceNpc.get(sourceNpcInternalName).push(row);
  }
  const directStableKeys = new Set(
    npcLootRelationRows.map((row) => lootRelationStableKey(row))
  );

  const inheritedRows = [];
  for (const rule of Array.isArray(inheritanceRules) ? inheritanceRules : []) {
    const targetNpcInternalName = normalizeText(rule.targetNpcInternalName ?? rule.target_npc_internal_name);
    const sourceNpcInternalName = normalizeText(rule.sourceNpcInternalName ?? rule.source_npc_internal_name);
    const inheritanceKind = normalizeText(rule.inheritanceKind ?? rule.inheritance_kind);
    const evidenceSource = normalizeText(rule.evidenceSource ?? rule.evidence_source);
    if (
      !targetNpcInternalName
      || !sourceNpcInternalName
      || targetNpcInternalName === sourceNpcInternalName
      || !ALLOWED_INHERITANCE_KINDS.has(inheritanceKind)
      || !evidenceSource
    ) {
      continue;
    }
    const targetCandidate = findNpcCandidateByInternalName(npcIndex, targetNpcInternalName);
    if (!targetCandidate) continue;
    const sourceRows = bySourceNpc.get(sourceNpcInternalName) ?? [];
    for (const sourceRow of sourceRows) {
      const inheritedRow = buildInheritedLootRelation({
        sourceRow,
        rule,
        targetNpcInternalName,
        targetCandidate,
        sourceNpcInternalName,
      });
      if (directStableKeys.has(lootRelationStableKey(inheritedRow))) continue;
      inheritedRows.push(inheritedRow);
    }
  }
  return inheritedRows;
}

function buildInheritedLootRelation({
  sourceRow,
  rule,
  targetNpcInternalName,
  targetCandidate,
  sourceNpcInternalName,
}) {
  const raw = {
    ...parseRelationRawJson(sourceRow.rawJson),
    inheritanceKind: normalizeText(rule.inheritanceKind ?? rule.inheritance_kind),
    inheritedFromNpcInternalName: sourceNpcInternalName,
    inheritanceEvidenceSource: normalizeText(rule.evidenceSource ?? rule.evidence_source),
    inheritedSourceFactKey: sourceRow.sourceFactKey,
  };
  return {
    ...sourceRow,
    recordKey: createRecordKey({
      type: 'npc_loot_relation_inherited',
      sourceRecordKey: sourceRow.recordKey,
      targetNpcInternalName,
    }),
    npcSourceId: toNullableNumber(targetCandidate?.source_id ?? targetCandidate?.sourceId),
    npcInternalName: targetNpcInternalName,
    npcName: normalizeText(targetCandidate?.name) ?? normalizeText(targetCandidate?.english_name) ?? targetNpcInternalName,
    reason: 'contract_backed_inherited_loot',
    rawJson: JSON.stringify(raw),
  };
}

function parseRelationRawJson(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
