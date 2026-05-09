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
    ...(Array.isArray(crawler.buffInflictions) ? crawler.buffInflictions : []),
    ...(Array.isArray(crawler.loot) ? crawler.loot : [])
  ]);

  if (scopedAutoIds.length) {
    const scopedMatches = records.filter((record) => scopedAutoIds.includes(toText(record?.id)));
    if (scopedMatches.length) {
      return { records: scopedMatches, reason: 'sourceInfoboxAutoId' };
    }
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
