export function buildNpcCoverageShard({
  coverageAuditPayload,
  priority,
  limit
} = {}) {
  const eligibleRows = Array.isArray(coverageAuditPayload?.eligibleBatchTargets)
    ? coverageAuditPayload.eligibleBatchTargets
    : [];
  const requestedPriority = String(priority ?? '').trim();
  const filtered = requestedPriority
    ? eligibleRows.filter((row) => String(row?.priority ?? '').trim() === requestedPriority)
    : eligibleRows;

  const sorted = [...filtered].sort(compareShardTarget);
  const normalizedLimit = Number(limit);
  const selected = Number.isFinite(normalizedLimit) && normalizedLimit > 0
    ? sorted.slice(0, normalizedLimit)
    : sorted;
  const standardizedRowsCovered = selected.reduce((total, row) => total + Number(row?.variantCount ?? row?.standardizedRecords?.length ?? 0), 0);

  return {
    summary: {
      priority: requestedPriority || null,
      inputTargets: filtered.length,
      selectedTargets: selected.length,
      standardizedRowsCovered
    },
    eligibleBatchTargets: selected
  };
}

function compareShardTarget(left, right) {
  const variantDiff = Number(right?.variantCount ?? right?.standardizedRecords?.length ?? 0)
    - Number(left?.variantCount ?? left?.standardizedRecords?.length ?? 0);
  if (variantDiff !== 0) {
    return variantDiff;
  }
  return String(left?.pageTitle ?? '').localeCompare(String(right?.pageTitle ?? ''));
}
