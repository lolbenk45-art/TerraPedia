import { matchNpcBridgeRecords } from './npc-bridge-match.mjs';

export const REVIEWED_PAGE_LEVEL_SHARED_LOOT_BY_PAGE = new Map([
  ['scarecrow', {
    evidenceSource: 'docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md',
    sourceRefName: 'Scarecrow',
    sourceRevisionTimestamp: '2026-04-01T07:29:09Z',
    requiredLeadPattern: /ten varieties of Scarecrow/i,
    requiredItemNames: ['Heart', 'Scarecrow Hat', 'Scarecrow Shirt', 'Scarecrow Pants'],
    targetInternalNames: [
      'Scarecrow1',
      'Scarecrow2',
      'Scarecrow3',
      'Scarecrow4',
      'Scarecrow5',
      'Scarecrow6',
      'Scarecrow7',
      'Scarecrow8',
      'Scarecrow9',
      'Scarecrow10',
    ],
  }],
  ['zombieelf', {
    evidenceSource: 'docs/audits/2026-05-12_npc-r43-zombie-elf-page-shared-loot-review.md',
    sourceRefName: 'Zombie Elf',
    sourceRevisionTimestamp: '2025-03-18T07:10:16Z',
    requiredLeadPattern: /Zombie Elf is a Hardmode, post-Plantera enemy/i,
    requiredItemNames: ['Elf Hat', 'Elf Shirt', 'Elf Pants', 'Heart'],
    targetInternalNames: [
      'ZombieElfBeard',
      'ZombieElfGirl',
    ],
  }],
  ['zombie', {
    evidenceSource: 'docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md',
    sourceRefName: 'Zombie',
    sourceRevisionTimestamp: '2026-04-08T00:43:54Z',
    sourceInfobox: { autoId: '3', image: 'Zombie.gif' },
    requiredItemNames: ['Shackle', 'Zombie Arm', 'Spiffo Plush'],
    targetInternalNames: [
      'BaldZombie',
      'FemaleZombie',
      'SwampZombie',
      'TwiggyZombie',
    ],
  }],
  ['skeleton', {
    evidenceSource: 'docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md',
    sourceRefName: 'Skeleton',
    sourceRevisionTimestamp: '2026-05-10T13:23:02Z',
    requiredLeadPattern: /as one of many variants/i,
    sourceInfobox: { autoId: '21', image: 'Skeleton.gif' },
    requiredItemNames: ['Carton of Milk', 'Ancient Iron Helmet', 'Ancient Gold Helmet', 'Bone Sword', 'Skull', 'Hook'],
    targetInternalNames: [
      'HeadacheSkeleton',
      'MisassembledSkeleton',
      'PantlessSkeleton',
    ],
  }],
]);

const REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION = 'reviewed_page_level_shared_loot';

export function buildNpcStandardizedBridge({
  standardizedPayload,
  crawlerNormalizedRecords
} = {}) {
  const payload = standardizedPayload ?? {};
  const standardizedRecords = Array.isArray(payload.records) ? payload.records : [];
  const crawlerRecords = Array.isArray(crawlerNormalizedRecords) ? crawlerNormalizedRecords : [];

  const nextRecords = standardizedRecords.map((record) => ({ ...record }));
  let matched = 0;
  const matchedKeys = new Set();
  let unmatchedCrawler = 0;
  const unmatchedSamples = [];

  for (const rawCrawlerRecord of crawlerRecords) {
    const crawlerRecord = normalizeCrawlerRecordSourceInfoboxes(rawCrawlerRecord);
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

    for (const record of match.records) {
      matchedKeys.add(buildStandardizedKey(record));
      record.__bridgeMatchCount = match.records.length;
      record.__bridgeMatchReason = match.reason;
      record.wikiCrawler = buildWikiCrawlerPayload({
        crawlerRecord,
        record,
        shopRows: normalizeShopRows(crawlerRecord?.shop),
      });
      delete record.__bridgeMatchCount;
      delete record.__bridgeMatchReason;
    }

    const reviewedSharedLoot = resolveReviewedPageLevelSharedLoot(crawlerRecord);
    if (reviewedSharedLoot) {
      for (const internalName of reviewedSharedLoot.targetInternalNames) {
        const record = nextRecords.find((entry) => toText(entry?.internalName) === internalName);
        if (!record) continue;
        matchedKeys.add(buildStandardizedKey(record));
        record.wikiCrawler = buildWikiCrawlerPayload({
          crawlerRecord,
          record,
          shopRows: normalizeShopRows(crawlerRecord?.shop),
          lootRows: normalizeReviewedSharedLootRows(crawlerRecord?.loot, reviewedSharedLoot),
          reviewedSharedLoot,
        });
      }
    }
  }

  return {
    ...payload,
    records: nextRecords,
    summary: {
      crawlerNpcTotal: crawlerRecords.length,
      matched: matchedKeys.size,
      unmatchedCrawler,
      unmatchedSamples
    }
  };
}

function normalizeCrawlerRecordSourceInfoboxes(crawlerRecord = {}) {
  return {
    ...crawlerRecord,
    sourceInfoboxes: normalizeSourceInfoboxArray(crawlerRecord.sourceInfoboxes),
    buffInflictions: normalizeScopedRowsSourceInfoboxes(crawlerRecord.buffInflictions),
    loot: normalizeScopedRowsSourceInfoboxes(crawlerRecord.loot),
  };
}

function normalizeScopedRowsSourceInfoboxes(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => ({
    ...row,
    ...(row?.sourceInfobox
      ? { sourceInfobox: normalizeSourceInfobox(row.sourceInfobox) }
      : {}),
    ...(row?.raw?.sourceInfobox
      ? { raw: { ...row.raw, sourceInfobox: normalizeSourceInfobox(row.raw.sourceInfobox) } }
      : {}),
  }));
}

function normalizeSourceInfoboxArray(sourceInfoboxes) {
  return Array.isArray(sourceInfoboxes)
    ? sourceInfoboxes.map((sourceInfobox) => normalizeSourceInfobox(sourceInfobox))
    : sourceInfoboxes;
}

function normalizeSourceInfobox(sourceInfobox = {}) {
  return {
    ...sourceInfobox,
    autoId: normalizeInfoboxAutoId(sourceInfobox.autoId),
  };
}

function normalizeInfoboxAutoId(value) {
  return String(value ?? '').replace(/<!--[\s\S]*?-->/g, '').split('<!--')[0].trim();
}

function filterBuffInflictionsForRecord(buffInflictions, record, crawlerRecord) {
  const rows = Array.isArray(buffInflictions) ? buffInflictions : [];
  const scopedRows = rows.filter((row) => hasSourceInfoboxScope(row));
  if (!scopedRows.length) {
    return rows;
  }

  const matchedScopedRows = scopedRows.filter((row) =>
    sourceInfoboxMatchesRecord(row?.sourceInfobox, record, {
      allowImageTitleMatch: record?.__bridgeMatchReason === 'sourceInfoboxImageTitle' || record?.__bridgeMatchCount === 1,
      allowNameMatch: record?.__bridgeMatchCount === 1,
      validateImageOnAutoIdMatch: true,
    })
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
    return canAssignUnscopedLootRows(record)
      ? rows.map((row) => addExactSourceScope(row, record))
      : [];
  }

  const matchedScopedRows = scopedRows.filter((row) =>
    sourceInfoboxMatchesRecord(row?.sourceInfobox, record, {
      allowImageTitleMatch: record?.__bridgeMatchReason === 'sourceInfoboxImageTitle' || record?.__bridgeMatchCount === 1,
      allowNameMatch: record?.__bridgeMatchCount === 1,
      validateImageOnAutoIdMatch: true,
    })
  )
    .map((row) => ({
      ...row,
      sourceRefInternalName: row.sourceRefInternalName ?? record?.internalName ?? null,
      sourceRefResolution: row.sourceRefResolution ?? (record?.internalName ? 'exact_internal_name' : null)
    }));
  const unscopedRows = rows.filter((row) => !hasSourceInfoboxScope(row));
  if (matchedScopedRows.length) {
    return canAssignUnscopedLootRows(record)
      ? [...matchedScopedRows, ...unscopedRows.map((row) => addExactSourceScope(row, record))]
      : matchedScopedRows;
  }

  return [];
}

function addExactSourceScope(row, record) {
  return {
    ...row,
    sourceRefInternalName: row?.sourceRefInternalName ?? record?.internalName ?? null,
    sourceRefResolution: row?.sourceRefResolution ?? (record?.internalName ? 'exact_internal_name' : null)
  };
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

function sourceInfoboxMatchesRecord(
  sourceInfobox,
  record,
  { allowImageTitleMatch = true, allowNameMatch = true, validateImageOnAutoIdMatch = true } = {}
) {
  const autoId = toText(sourceInfobox?.autoId);
  const imageTitles = collectFileTitles(sourceInfobox?.image);
  const imageMatchesRecord = imageTitlesMatchRecord(imageTitles, record, { allowImageTitleMatch });
  if (autoId) {
    const recordId = toText(record?.id);
    const autoIdMatchesRecord = Boolean(recordId && recordId === autoId);
    if (autoIdMatchesRecord) {
      if (validateImageOnAutoIdMatch) {
        const recordImageTitle = normalizeFileTitle(record?.imageFileTitle);
        const sourceImageTitle = imageTitles.length === 1 ? normalizeFileTitle(imageTitles[0]) : '';
        if (sourceImageTitle && recordImageTitle && normalizeKey(sourceImageTitle) !== normalizeKey(recordImageTitle)) {
          return false;
        }
      }
      return true;
    }
    return imageTitles.length > 1 && imageMatchesRecord;
  }

  const sourceNames = [
    ...imageTitles.map((imageTitle) => stripImageVariant(imageTitle)),
    ...(allowImageTitleMatch ? imageTitles : [])
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
    record?.internalName,
    ...(allowImageTitleMatch ? [record?.imageFileTitle] : [])
  ].map((value) => normalizeKey(value)).filter(Boolean);
  return sourceNames.some((sourceName) => recordNames.includes(sourceName));
}

function buildWikiCrawlerPayload({
  crawlerRecord,
  record,
  shopRows,
  lootRows,
  reviewedSharedLoot = null,
}) {
  return {
    pageTitle: crawlerRecord?.source?.pageTitle ?? '',
    groupMember: crawlerRecord?.groupMember ?? null,
    sourceInfoboxes: filterSourceInfoboxesForRecord(crawlerRecord?.sourceInfoboxes, record),
    summary: crawlerRecord?.summary ?? {},
    combat: crawlerRecord?.combat ?? {},
    buffInflictions: filterBuffInflictionsForRecord(crawlerRecord?.buffInflictions, record, crawlerRecord),
    profile: crawlerRecord?.profile ?? {},
    shop: shopRows,
    sourceLootRowsTotal: Array.isArray(crawlerRecord?.loot) ? crawlerRecord.loot.length : 0,
    loot: lootRows ?? filterLootRowsForRecord(crawlerRecord?.loot, record, crawlerRecord),
    ...(reviewedSharedLoot ? { reviewedSharedLoot } : {}),
    backfillCandidates: Array.isArray(crawlerRecord?.backfillCandidates) ? crawlerRecord.backfillCandidates : [],
    happiness: crawlerRecord?.happiness ?? { sourceTemplatePresent: false, notes: [] },
    relationships: crawlerRecord?.relationships ?? { relatedNpcs: [], relatedItems: [], relatedBiomes: [] },
    contentBlocks: crawlerRecord?.contentBlocks ?? { dialogue: '', tips: '', history: '' },
    audit: crawlerRecord?.audit ?? { status: 'fail', reasons: ['missing audit payload'] },
    sourceMetadata: crawlerRecord?.sourceMetadata ?? {}
  };
}

function filterSourceInfoboxesForRecord(sourceInfoboxes, record) {
  const rows = Array.isArray(sourceInfoboxes) ? sourceInfoboxes : [];
  return rows.filter((sourceInfobox) =>
    sourceInfoboxMatchesRecord(sourceInfobox, record, {
      allowImageTitleMatch: record?.__bridgeMatchReason === 'sourceInfoboxImageTitle' || record?.__bridgeMatchCount === 1,
      allowNameMatch: record?.__bridgeMatchCount === 1,
      validateImageOnAutoIdMatch: false,
    })
  );
}

function normalizeShopRows(shop) {
  return Array.isArray(shop)
    ? shop
    : Array.isArray(shop?.normalizedRows)
      ? shop.normalizedRows
      : Array.isArray(shop?.items)
        ? shop.items
        : [];
}

function buildStandardizedKey(record) {
  const internalName = toText(record?.internalName);
  if (internalName) return `internal:${internalName.toLowerCase()}`;
  const name = toText(record?.name);
  if (name) return `name:${name.toLowerCase()}`;
  return `id:${toText(record?.id) ?? ''}`;
}

export function resolveReviewedPageLevelSharedLoot(crawlerRecord) {
  const pageTitle = normalizeKey(crawlerRecord?.source?.pageTitle);
  const rule = REVIEWED_PAGE_LEVEL_SHARED_LOOT_BY_PAGE.get(pageTitle);
  if (!rule) return null;

  const revisionTimestamp = toText(crawlerRecord?.sourceMetadata?.revisionTimestamp);
  if (revisionTimestamp !== rule.sourceRevisionTimestamp) return null;

  const lootRows = Array.isArray(crawlerRecord?.loot) ? crawlerRecord.loot : [];
  if (!hasReviewedSharedLootEvidence(crawlerRecord, lootRows, rule)) return null;

  return {
    evidenceSource: rule.evidenceSource,
    sourceRefName: rule.sourceRefName,
    sourceRevisionTimestamp: rule.sourceRevisionTimestamp,
    requiredItemNames: [...rule.requiredItemNames],
    sourceInfobox: rule.sourceInfobox ? { ...rule.sourceInfobox } : null,
    targetInternalNames: [...rule.targetInternalNames],
  };
}

function hasReviewedSharedLootEvidence(crawlerRecord, lootRows, rule) {
  const leadText = normalizeWikiText(toText(crawlerRecord?.summary?.leadText) ?? toText(crawlerRecord?.source?.pageDescription) ?? '');
  if (rule.requiredLeadPattern && !rule.requiredLeadPattern.test(leadText)) return false;

  const itemNames = new Set(filterReviewedSharedLootRows(lootRows, rule)
    .map((row) => toText(row?.itemName))
    .filter(Boolean));
  return rule.requiredItemNames
    .every((itemName) => itemNames.has(itemName));
}

function normalizeWikiText(value) {
  return String(value ?? '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeReviewedSharedLootRows(lootRows, reviewedSharedLoot = {}) {
  const sourceRefName = toText(reviewedSharedLoot.sourceRefName);
  return filterReviewedSharedLootRows(lootRows, reviewedSharedLoot).map((row) => ({
    ...row,
    sourceRefName,
    sourceRefResolution: REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION,
    raw: {
      ...(row?.raw ?? row),
      sourceRefName,
      sourceRefResolution: REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION,
    },
  }));
}

function filterReviewedSharedLootRows(lootRows, reviewedSharedLoot = {}) {
  const rows = Array.isArray(lootRows) ? lootRows : [];
  const requiredItemNames = Array.isArray(reviewedSharedLoot.requiredItemNames)
    ? new Set(reviewedSharedLoot.requiredItemNames.map((value) => toText(value)).filter(Boolean))
    : null;
  return rows.filter((row) => {
    if (requiredItemNames && !requiredItemNames.has(toText(row?.itemName))) return false;
    return reviewedSharedLootRowMatchesInfobox(row, reviewedSharedLoot.sourceInfobox);
  });
}

function reviewedSharedLootRowMatchesInfobox(row, sourceInfobox) {
  if (!sourceInfobox) return true;
  const rowInfobox = row?.sourceInfobox;
  const expectedAutoId = toText(sourceInfobox.autoId);
  if (expectedAutoId && toText(rowInfobox?.autoId) !== expectedAutoId) return false;
  const expectedImage = normalizeFileTitle(sourceInfobox.image);
  if (expectedImage) {
    const rowImages = collectFileTitles(rowInfobox?.image).map((value) => normalizeFileTitle(value));
    if (!rowImages.some((value) => normalizeKey(value) === normalizeKey(expectedImage))) return false;
  }
  return true;
}

function imageTitlesMatchRecord(imageTitles, record, { allowImageTitleMatch = true } = {}) {
  const titles = Array.isArray(imageTitles) ? imageTitles : [];
  if (!titles.length) {
    return false;
  }
  const sourceNames = [
    ...titles.map((imageTitle) => stripImageVariant(imageTitle)),
    ...(allowImageTitleMatch ? titles : [])
  ].map((value) => normalizeKey(value)).filter(Boolean);
  const recordNames = [
    record?.internalName,
    ...(allowImageTitleMatch ? [record?.imageFileTitle] : [])
  ].map((value) => normalizeKey(value)).filter(Boolean);
  return sourceNames.some((sourceName) => recordNames.includes(sourceName));
}

function normalizeFileTitle(value) {
  let text = toText(value);
  if (!text) {
    return '';
  }
  const fileMatch = /\[\[\s*File:([^|\]]+)/i.exec(text);
  if (fileMatch?.[1]) {
    text = fileMatch[1];
  }
  return text.replace(/^File:/i, '').trim();
}

function collectFileTitles(value) {
  const text = toText(value);
  if (!text) {
    return [];
  }
  const matches = [...text.matchAll(/\[\[\s*File:([^|\]]+)/gi)]
    .map((match) => normalizeFileTitle(match[1]))
    .filter(Boolean);
  return matches.length ? matches : [normalizeFileTitle(text)].filter(Boolean);
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
