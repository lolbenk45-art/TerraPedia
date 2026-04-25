import {
  confidence,
  createRecordKey,
  normalizeText,
  relationStatus
} from './relation-trace.mjs';

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toJsonOrNull(values = []) {
  const normalized = unique(values);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function toSeriesKey(name) {
  const text = normalizeText(name);
  if (!text) return null;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function groupSeries(relationNpcRows = []) {
  const groups = new Map();
  for (const row of relationNpcRows) {
    const englishName = normalizeText(row.englishName);
    if (!englishName) continue;
    if (!groups.has(englishName)) groups.set(englishName, []);
    groups.get(englishName).push(row);
  }
  return [...groups.entries()].filter(([, members]) => members.length > 1);
}

export function buildNpcSeriesRelations({
  relationNpcRows = [],
  itemNpcShopRelations = [],
  itemNpcLootRelations = []
} = {}) {
  const npcSeriesNodes = [];
  const npcSeriesMemberships = [];
  const npcSeriesItemRelations = [];

  const memberToSeries = new Map();

  for (const [englishName, members] of groupSeries(relationNpcRows)) {
    const seriesKey = toSeriesKey(englishName);
    const memberNames = members.map((row) => normalizeText(row.internalName));

    npcSeriesNodes.push({
      recordKey: createRecordKey({ type: 'npc_series_node', seriesKey }),
      seriesKey,
      seriesNameEn: englishName,
      memberCount: members.length,
      memberInternalNamesJson: toJsonOrNull(memberNames),
      reviewStatus: relationStatus.resolved,
      confidence: confidence.high,
      reason: 'npc_series_grouped_by_english_name',
      rawJson: JSON.stringify({
        sourceMaintRecordKeys: unique(members.map((row) => row.sourceMaintRecordKey))
      })
    });

    for (const member of members) {
      const npcInternalName = normalizeText(member.internalName);
      memberToSeries.set(npcInternalName, { seriesKey, seriesNameEn: englishName });
      npcSeriesMemberships.push({
        recordKey: createRecordKey({ type: 'npc_series_membership', seriesKey, npcInternalName }),
        seriesKey,
        npcInternalName,
        npcSourceId: Number.isFinite(Number(member.sourceId)) ? Number(member.sourceId) : null,
        npcEnglishName: englishName,
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'npc_series_membership_resolved',
        rawJson: member.rawJson ?? null,
        sourceMaintTable: normalizeText(member.sourceMaintTable),
        sourceMaintRecordKey: normalizeText(member.sourceMaintRecordKey),
        sourceMaintId: Number.isFinite(Number(member.sourceMaintId)) ? Number(member.sourceMaintId) : null,
        landingSourceId: Number.isFinite(Number(member.landingSourceId)) ? Number(member.landingSourceId) : null,
        landingSourceKey: normalizeText(member.landingSourceKey),
        landingContentHash: normalizeText(member.landingContentHash),
        sourceProvider: normalizeText(member.sourceProvider),
        sourcePage: normalizeText(member.sourcePage),
        sourceRevisionTimestamp: member.sourceRevisionTimestamp ?? null
      });
    }
  }

  const groupedItemRelations = new Map();
  const pushItemRelation = (relationType, row) => {
    const npcInternalName = normalizeText(row.npcInternalName);
    const series = memberToSeries.get(npcInternalName);
    if (!series) return;
    const itemInternalName = normalizeText(row.itemInternalName);
    if (!itemInternalName) return;
    const key = JSON.stringify([series.seriesKey, relationType, itemInternalName]);
    if (!groupedItemRelations.has(key)) {
      groupedItemRelations.set(key, {
        seriesKey: series.seriesKey,
        seriesNameEn: series.seriesNameEn,
        relationType,
        itemInternalName,
        npcMembers: [],
        sourceFactKeys: [],
        chanceTexts: [],
        quantityTexts: [],
        conditionSourceTexts: []
      });
    }
    const entry = groupedItemRelations.get(key);
    entry.npcMembers.push(npcInternalName);
    entry.sourceFactKeys.push(normalizeText(row.sourceFactKey));
    entry.chanceTexts.push(normalizeText(row.chanceText));
    entry.quantityTexts.push(normalizeText(row.quantityText));
    entry.conditionSourceTexts.push(normalizeText(row.conditionSourceText));
  };

  for (const row of itemNpcShopRelations) pushItemRelation('shop', row);
  for (const row of itemNpcLootRelations) pushItemRelation('loot', row);

  for (const entry of groupedItemRelations.values()) {
    npcSeriesItemRelations.push({
      recordKey: createRecordKey({
        type: 'npc_series_item_relation',
        seriesKey: entry.seriesKey,
        relationType: entry.relationType,
        itemInternalName: entry.itemInternalName
      }),
      seriesKey: entry.seriesKey,
      seriesNameEn: entry.seriesNameEn,
      relationType: entry.relationType,
      itemInternalName: entry.itemInternalName,
      npcMemberCount: unique(entry.npcMembers).length,
      npcMemberInternalNamesJson: toJsonOrNull(entry.npcMembers),
      sourceFactKeysJson: toJsonOrNull(entry.sourceFactKeys),
      chanceTextsJson: toJsonOrNull(entry.chanceTexts),
      quantityTextsJson: toJsonOrNull(entry.quantityTexts),
      conditionSourceTextsJson: toJsonOrNull(entry.conditionSourceTexts),
      reviewStatus: relationStatus.resolved,
      confidence: confidence.high,
      reason: 'npc_series_item_relation_aggregated',
      rawJson: JSON.stringify({ relationRowCount: entry.sourceFactKeys.length })
    });
  }

  return {
    npcSeriesNodes,
    npcSeriesMemberships,
    npcSeriesItemRelations,
    issues: [],
    summary: {
      nodes: npcSeriesNodes.length,
      memberships: npcSeriesMemberships.length,
      itemRelations: npcSeriesItemRelations.length
    }
  };
}
