import { fetchWikiPageMetadataBatch } from '../../../lib/wiki-item-utils.mjs';

export async function auditNpcCoverageTargets({
  targets,
  fetchWikiPageMetadataBatchImpl = fetchWikiPageMetadataBatch
} = {}) {
  const targetRows = Array.isArray(targets) ? targets : [];
  const requestedTitles = targetRows.map((target) => String(target?.pageTitle ?? '').trim()).filter(Boolean);
  const pages = requestedTitles.length
    ? await fetchWikiPageMetadataBatchImpl({ titles: requestedTitles })
    : [];
  const pageByRequested = new Map(
    pages.map((page) => [normalizeKey(page?.requestedTitle ?? page?.pageTitle), page])
  );

  const auditedTargets = targetRows.map((target) => {
    const requestedTitle = String(target?.pageTitle ?? '').trim();
    const page = pageByRequested.get(normalizeKey(requestedTitle)) ?? null;
    const resolvedTitle = toText(page?.pageTitle);
    const missing = Boolean(page?.missing) || !resolvedTitle;
    const resolutionStatus = missing
      ? 'missing'
      : normalizeKey(resolvedTitle) === normalizeKey(requestedTitle)
        ? 'resolved'
        : 'redirect';

    return {
      ...target,
      requestedTitle,
      pageTitle: resolvedTitle ?? requestedTitle,
      resolvedPageTitle: resolvedTitle,
      pageId: page?.pageId ?? null,
      missing,
      resolutionStatus,
      eligibleBatch: !target?.alreadyCrawled && !missing
    };
  });

  const eligibleBatchTargets = dedupeEligibleTargets(auditedTargets.filter((target) => target.eligibleBatch));

  return {
    summary: {
      totalTargets: auditedTargets.length,
      resolvedTargets: auditedTargets.filter((target) => !target.missing).length,
      redirectTargets: auditedTargets.filter((target) => target.resolutionStatus === 'redirect').length,
      missingTargets: auditedTargets.filter((target) => target.missing).length,
      alreadyCrawledTargets: auditedTargets.filter((target) => target.alreadyCrawled).length,
      eligibleBatchTargets: eligibleBatchTargets.length
    },
    targets: auditedTargets,
    eligibleBatchTargets
  };
}

function dedupeEligibleTargets(targets) {
  const merged = new Map();

  for (const target of targets) {
    const pageTitle = toText(target?.pageTitle);
    if (!pageTitle) {
      continue;
    }
    const key = normalizeKey(pageTitle);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        pageTitle,
        requestedTitles: [String(target?.requestedTitle ?? '').trim()].filter(Boolean),
        priority: target?.priority ?? 'p1_enemy',
        standardizedRecords: Array.isArray(target?.standardizedRecords) ? [...target.standardizedRecords] : [],
        variantCount: Number(target?.variantCount ?? 0) || (Array.isArray(target?.standardizedRecords) ? target.standardizedRecords.length : 0),
        pageId: target?.pageId ?? null
      });
      continue;
    }

    existing.requestedTitles = [...new Set([...existing.requestedTitles, String(target?.requestedTitle ?? '').trim()].filter(Boolean))];
    existing.standardizedRecords = mergeStandardizedRecords(existing.standardizedRecords, target?.standardizedRecords);
    existing.variantCount = existing.standardizedRecords.length;
    if (priorityRank(target?.priority) < priorityRank(existing.priority)) {
      existing.priority = target?.priority ?? existing.priority;
    }
    if (existing.pageId == null && target?.pageId != null) {
      existing.pageId = target.pageId;
    }
  }

  return [...merged.values()].sort(compareEligibleTarget);
}

function mergeStandardizedRecords(left, right) {
  const merged = new Map();
  for (const record of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    const key = String(record?.internalName ?? record?.id ?? '');
    if (!key) {
      continue;
    }
    merged.set(key, record);
  }
  return [...merged.values()].sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0));
}

function compareEligibleTarget(left, right) {
  const priorityDiff = priorityRank(left?.priority) - priorityRank(right?.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  return String(left?.pageTitle ?? '').localeCompare(String(right?.pageTitle ?? ''));
}

function priorityRank(priority) {
  switch (String(priority ?? '')) {
    case 'p0_town':
      return 0;
    case 'p0_boss':
      return 1;
    case 'p1_friendly':
      return 2;
    default:
      return 3;
  }
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}
