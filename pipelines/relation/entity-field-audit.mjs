function toFiniteNumber(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function buildEntityFieldAudit({ localSummary = {}, relationSummary = {} } = {}) {
  const domainNames = [...new Set([
    ...Object.keys(localSummary),
    ...Object.keys(relationSummary)
  ])];

  const domains = {};
  let totalGaps = 0;

  for (const domain of domainNames) {
    const local = localSummary[domain] ?? {};
    const relation = relationSummary[domain] ?? {};
    const fieldNames = [...new Set([
      ...Object.keys(local),
      ...Object.keys(relation)
    ])].filter((field) => field !== 'total');

    const fields = {};
    for (const field of fieldNames) {
      const localCoverage = toFiniteNumber(local[field]);
      const relationCoverage = toFiniteNumber(relation[field]);
      const gap = Math.max(localCoverage - relationCoverage, 0);
      totalGaps += gap;
      fields[field] = {
        localCoverage,
        relationCoverage,
        gap
      };
    }

    domains[domain] = {
      localTotal: toFiniteNumber(local.total),
      relationTotal: toFiniteNumber(relation.total),
      fields
    };
  }

  return {
    summary: {
      domainCount: domainNames.length,
      totalGaps
    },
    domains
  };
}
