export function isOverviewFallbackBiomeRecord(record) {
  if (record?.sourceType === 'overview_section') {
    return false;
  }
  const requestedTitle = normalizeTitle(record?.requestedTitle);
  const resolvedTitle = normalizeTitle(record?.title);
  return resolvedTitle === 'biomes' && requestedTitle !== 'biomes';
}

function normalizeTitle(value) {
  return String(value ?? '').trim().toLowerCase();
}
