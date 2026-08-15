export function matchNpcBridgeRecord({
  crawlerRecord,
  standardizedRecords
} = {}) {
  const match = matchNpcBridgeRecords({
    crawlerRecord,
    standardizedRecords
  });
  return {
    record: match.records[0] ?? null,
    reason: match.reason
  };
}

export function matchNpcBridgeRecords({
  crawlerRecord,
  standardizedRecords
} = {}) {
  const records = Array.isArray(standardizedRecords) ? standardizedRecords : [];
  const crawler = crawlerRecord ?? {};
  const scopedAutoIds = collectScopedAutoIds([
    ...(Array.isArray(crawler.sourceInfoboxes) ? crawler.sourceInfoboxes.map((sourceInfobox) => ({ sourceInfobox })) : []),
    ...(Array.isArray(crawler.buffInflictions) ? crawler.buffInflictions : []),
    ...(Array.isArray(crawler.loot) ? crawler.loot : [])
  ]);

  const scopedImageTitles = collectScopedImageTitles([
    ...(Array.isArray(crawler.sourceInfoboxes) ? crawler.sourceInfoboxes.map((sourceInfobox) => ({ sourceInfobox })) : []),
    ...(Array.isArray(crawler.buffInflictions) ? crawler.buffInflictions : []),
    ...(Array.isArray(crawler.loot) ? crawler.loot : [])
  ]);

  const scopedAutoIdMatches = scopedAutoIds.length
    ? records.filter((record) => scopedAutoIds.includes(toText(record?.id)))
    : [];

  if (scopedImageTitles.length) {
    const matchesByImageTitle = buildUniqueImageTitleMatches(records);
    const scopedMatches = scopedImageTitles
      .flatMap((imageTitle) => matchesByImageTitle.get(imageTitle) ?? []);
    if (scopedMatches.length) {
      return {
        records: uniqueRecords([...scopedAutoIdMatches, ...scopedMatches]),
        reason: hasAdditionalRecord(scopedAutoIdMatches, scopedMatches)
          ? 'sourceInfoboxImageTitle'
          : 'sourceInfoboxAutoId'
      };
    }
  }

  if (scopedAutoIdMatches.length) {
    return { records: scopedAutoIdMatches, reason: 'sourceInfoboxAutoId' };
  }

  const pageTitle = toText(crawler.source?.pageTitle);
  const displayName = toText(crawler.display?.name);
  const entityId = toText(crawler.entityId);
  const internalNameCandidate = pageTitle ? normalizeInternalNameCandidate(pageTitle) : null;

  if (internalNameCandidate) {
    const directInternal = records.filter((record) => normalizeKey(record?.internalName) === normalizeKey(internalNameCandidate));
    if (directInternal.length) {
      return { records: directInternal, reason: 'internalName' };
    }
  }

  if (displayName || pageTitle || entityId) {
    const nameCandidates = [displayName, pageTitle, denormalizeEntityId(entityId)]
      .map((value) => normalizeKey(value))
      .filter(Boolean);
    const nameMatched = records.filter((record) => nameCandidates.includes(normalizeKey(record?.name)));
    if (nameMatched.length) {
      return { records: nameMatched, reason: 'name' };
    }
  }

  return { records: [], reason: 'unmatched' };
}

function normalizeInternalNameCandidate(value) {
  const text = toText(value);
  if (!text) return null;
  return text.replace(/[^A-Za-z0-9]+/g, '');
}

function collectScopedAutoIds(buffInflictions) {
  const rows = Array.isArray(buffInflictions) ? buffInflictions : [];
  return [...new Set(rows
    .map((row) => toText(row?.sourceInfobox?.autoId))
    .filter(Boolean))];
}

function collectScopedImageTitles(rows) {
  return [...new Set((Array.isArray(rows) ? rows : [])
    .flatMap((row) => {
      const imageTitles = collectFileTitles(row?.sourceInfobox?.image);
      if (!toText(row?.sourceInfobox?.autoId)) return imageTitles;
      return imageTitles.length > 1 ? imageTitles : [];
    })
    .filter(Boolean))];
}

function buildUniqueImageTitleMatches(records) {
  const byImageTitle = new Map();
  for (const record of records) {
    const imageTitle = normalizeFileTitle(record?.imageFileTitle);
    if (!imageTitle) continue;
    if (!byImageTitle.has(imageTitle)) {
      byImageTitle.set(imageTitle, []);
    }
    byImageTitle.get(imageTitle).push(record);
  }

  return new Map([...byImageTitle].filter(([, matches]) => matches.length === 1));
}

function normalizeFileTitle(value) {
  let text = toText(value);
  if (!text) return '';
  const fileMatch = /\[\[\s*File:([^|\]]+)/i.exec(text);
  if (fileMatch?.[1]) {
    text = fileMatch[1];
  }
  return text.replace(/^File:/i, '').trim().toLowerCase();
}

function collectFileTitles(value) {
  const text = toText(value);
  if (!text) return [];
  const matches = [...text.matchAll(/\[\[\s*File:([^|\]]+)/gi)]
    .map((match) => normalizeFileTitle(match[1]))
    .filter(Boolean);
  return matches.length ? matches : [normalizeFileTitle(text)].filter(Boolean);
}

function uniqueRecords(records) {
  const seen = new Set();
  const unique = [];
  for (const record of records) {
    const key = toText(record?.internalName) || toText(record?.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
  }
  return unique;
}

function hasAdditionalRecord(baseRecords, candidateRecords) {
  const baseKeys = new Set(baseRecords.map((record) => toText(record?.internalName) || toText(record?.id)).filter(Boolean));
  return candidateRecords.some((record) => {
    const key = toText(record?.internalName) || toText(record?.id);
    return key && !baseKeys.has(key);
  });
}

function denormalizeEntityId(value) {
  const text = toText(value);
  if (!text) return null;
  return text
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeKey(value) {
  const text = toText(value);
  if (!text) return '';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}
