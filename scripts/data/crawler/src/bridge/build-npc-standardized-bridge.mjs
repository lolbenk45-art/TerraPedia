import { matchNpcBridgeRecords } from './npc-bridge-match.mjs';

export function buildNpcStandardizedBridge({
  standardizedPayload,
  crawlerNormalizedRecords
} = {}) {
  const payload = standardizedPayload ?? {};
  const standardizedRecords = Array.isArray(payload.records) ? payload.records : [];
  const crawlerRecords = Array.isArray(crawlerNormalizedRecords) ? crawlerNormalizedRecords : [];

  const nextRecords = standardizedRecords.map((record) => ({ ...record }));
  let matched = 0;
  let unmatchedCrawler = 0;
  const unmatchedSamples = [];

  for (const crawlerRecord of crawlerRecords) {
    const match = matchNpcBridgeRecords({
      crawlerRecord,
      standardizedRecords: nextRecords
    });

    if (match.records.length === 0) {
      unmatchedCrawler += 1;
      if (unmatchedSamples.length < 20) {
        unmatchedSamples.push({
          entityId: crawlerRecord?.entityId ?? '',
          pageTitle: crawlerRecord?.source?.pageTitle ?? crawlerRecord?.display?.name ?? '',
          reason: match.reason
        });
      }
      continue;
    }

    matched += match.records.length;
    for (const record of match.records) {
      record.__bridgeMatchCount = match.records.length;
      const shopRows = Array.isArray(crawlerRecord?.shop)
        ? crawlerRecord.shop
        : Array.isArray(crawlerRecord?.shop?.normalizedRows)
          ? crawlerRecord.shop.normalizedRows
          : Array.isArray(crawlerRecord?.shop?.items)
            ? crawlerRecord.shop.items
            : [];
      record.wikiCrawler = {
        pageTitle: crawlerRecord?.source?.pageTitle ?? '',
        groupMember: crawlerRecord?.groupMember ?? null,
        summary: crawlerRecord?.summary ?? {},
        combat: crawlerRecord?.combat ?? {},
        buffInflictions: filterBuffInflictionsForRecord(crawlerRecord?.buffInflictions, record, crawlerRecord),
        profile: crawlerRecord?.profile ?? {},
        shop: shopRows,
        loot: filterLootRowsForRecord(crawlerRecord?.loot, record, crawlerRecord),
        backfillCandidates: Array.isArray(crawlerRecord?.backfillCandidates) ? crawlerRecord.backfillCandidates : [],
        happiness: crawlerRecord?.happiness ?? { sourceTemplatePresent: false, notes: [] },
        relationships: crawlerRecord?.relationships ?? { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
        contentBlocks: crawlerRecord?.contentBlocks ?? { dialogue: '', tips: '', history: '' },
        audit: crawlerRecord?.audit ?? { status: 'fail', reasons: ['missing audit payload'] },
        sourceMetadata: crawlerRecord?.sourceMetadata ?? {}
      };
      delete record.__bridgeMatchCount;
    }
  }

  return {
    ...payload,
    records: nextRecords,
    summary: {
      crawlerNpcTotal: crawlerRecords.length,
      matched,
      unmatchedCrawler,
      unmatchedSamples
    }
  };
}

function filterBuffInflictionsForRecord(buffInflictions, record, crawlerRecord) {
  const rows = Array.isArray(buffInflictions) ? buffInflictions : [];
  const scopedRows = rows.filter((row) => hasSourceInfoboxScope(row));
  if (!scopedRows.length) {
    return rows;
  }

  const matchedScopedRows = scopedRows.filter((row) =>
    sourceInfoboxMatchesRecord(row?.sourceInfobox, record, { allowNameMatch: record?.__bridgeMatchCount === 1 })
  );
  const unscopedRows = rows.filter((row) => !hasSourceInfoboxScope(row));
  if (matchedScopedRows.length) {
    return canAssignUnscopedBuffRows(record, crawlerRecord)
      ? [...matchedScopedRows, ...unscopedRows]
      : matchedScopedRows;
  }

  return [];
}

function filterLootRowsForRecord(lootRows, record, crawlerRecord) {
  const rows = Array.isArray(lootRows) ? lootRows : [];
  const scopedRows = rows.filter((row) => hasSourceInfoboxScope(row));
  if (!scopedRows.length) {
    return canAssignUnscopedLootRows(record) ? rows : [];
  }

  const matchedScopedRows = scopedRows.filter((row) =>
    sourceInfoboxMatchesRecord(row?.sourceInfobox, record, { allowNameMatch: record?.__bridgeMatchCount === 1 })
  )
    .map((row) => ({
      ...row,
      sourceRefInternalName: row.sourceRefInternalName ?? record?.internalName ?? null,
      sourceRefResolution: row.sourceRefResolution ?? (record?.internalName ? 'exact_internal_name' : null)
    }));
  const unscopedRows = rows.filter((row) => !hasSourceInfoboxScope(row));
  if (matchedScopedRows.length) {
    return canAssignUnscopedLootRows(record)
      ? [...matchedScopedRows, ...unscopedRows]
      : matchedScopedRows;
  }

  return [];
}

function canAssignUnscopedLootRows(record) {
  return record?.__bridgeMatchCount === 1;
}

function canAssignUnscopedBuffRows(record, crawlerRecord) {
  if (record?.__bridgeMatchCount !== 1) {
    return false;
  }

  const entityLabel = normalizeKey(denormalizeEntityId(crawlerRecord?.entityId));
  if (!entityLabel) {
    return false;
  }

  const pageLabel = normalizeKey(crawlerRecord?.source?.pageTitle);
  const displayLabel = normalizeKey(crawlerRecord?.display?.name);
  const recordLabels = [
    record?.name,
    record?.internalName
  ].map((value) => normalizeKey(value)).filter(Boolean);
  if (!recordLabels.includes(entityLabel)) {
    return false;
  }

  return entityLabel !== pageLabel && entityLabel !== displayLabel;
}

function hasSourceInfoboxScope(row) {
  const sourceInfobox = row?.sourceInfobox;
  return Boolean(
    toText(sourceInfobox?.autoId)
      || toText(sourceInfobox?.name)
      || toText(sourceInfobox?.image)
  );
}

function sourceInfoboxMatchesRecord(sourceInfobox, record, { allowNameMatch = true } = {}) {
  const autoId = toText(sourceInfobox?.autoId);
  if (autoId) {
    const recordIds = [
      record?.id,
      record?.type,
      record?.netID,
      record?.gameId
    ].map((value) => toText(value)).filter(Boolean);
    if (recordIds.includes(autoId)) {
      return true;
    }
  }

  const sourceNames = [
    stripImageVariant(sourceInfobox?.image)
  ].map((value) => normalizeKey(value)).filter(Boolean);
  if (allowNameMatch) {
    const name = normalizeKey(sourceInfobox?.name);
    if (name) {
      sourceNames.push(name);
    }
  }
  if (!sourceNames.length) {
    return false;
  }
  const recordNames = [
    ...(allowNameMatch ? [record?.name] : []),
    record?.internalName
  ].map((value) => normalizeKey(value)).filter(Boolean);
  return sourceNames.some((sourceName) => recordNames.includes(sourceName));
}

function stripImageVariant(value) {
  let text = toText(value);
  if (!text) {
    return '';
  }
  text = text.replace(/\.[a-z0-9]+$/i, '');
  text = text.replace(/\s*\([^)]*\)\s*$/g, '');
  return text.trim();
}

function normalizeKey(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function denormalizeEntityId(value) {
  const text = toText(value);
  if (!text) {
    return '';
  }
  return text
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toText(value) {
  if (value == null) {
    return '';
  }
  const text = String(value).trim();
  return text.length ? text : '';
}
