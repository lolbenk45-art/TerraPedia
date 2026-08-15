import {
  getNpcCoverageEntityId,
  getNpcCoveragePageTitle
} from '../domains/npc-source-mapping.mjs';

const RESOLVED_ENTITY_IDS_BY_TARGET_ENTITY_ID = new Map([
  ['statue', ['statues']]
]);

export function buildNpcCoverageTargets({
  standardizedPayload,
  crawledEntityIds
} = {}) {
  const standardizedRecords = Array.isArray(standardizedPayload?.records) ? standardizedPayload.records : [];
  const crawledIds = new Set((Array.isArray(crawledEntityIds) ? crawledEntityIds : []).map((value) => toEntityId(value)).filter(Boolean));
  const groups = new Map();

  for (const record of standardizedRecords) {
    const pageTitle = getNpcCoveragePageTitle(record);
    if (!pageTitle) {
      continue;
    }

    const key = normalizeKey(pageTitle);
    const current = groups.get(key) ?? {
      pageTitle,
      entityId: '',
      targetEntityIds: [],
      standardizedRecords: []
    };

    const targetEntityId = getNpcCoverageEntityId(record);
    if (targetEntityId) {
      current.targetEntityIds.push(targetEntityId);
    }
    current.standardizedRecords.push({
      id: record?.id ?? null,
      internalName: record?.internalName ?? '',
      name: toText(record?.name) ?? pageTitle
    });

    groups.set(key, current);
  }

  const targets = [...groups.values()]
    .map((target) => {
      const targetEntityIds = [...new Set(target.targetEntityIds)].sort();
      const priority = inferPriority(target.standardizedRecords, standardizedRecords);
      return {
        ...target,
        entityId: targetEntityIds.length === 1 ? targetEntityIds[0] : toEntityId(target.pageTitle),
        targetEntityIds,
        standardizedRecords: [...target.standardizedRecords].sort(compareStandardizedRecord),
        variantCount: target.standardizedRecords.length,
        alreadyCrawled: targetEntityIds.length > 0 && targetEntityIds.every((entityId) => isTargetEntityIdCrawled(entityId, crawledIds)),
        priority
      };
    })
    .sort(compareTarget);

  const duplicateNameGroups = targets.filter((target) => target.variantCount > 1).length;

  return {
    targets,
    summary: {
      totalStandardized: standardizedRecords.length,
      totalTargets: targets.length,
      duplicateNameGroups,
      alreadyCrawledTargets: targets.filter((target) => target.alreadyCrawled).length,
      priorityCounts: countByPriority(targets)
    }
  };
}

function inferPriority(targetRecords, sourceRecords) {
  const targetInternalNames = new Set(targetRecords.map((record) => String(record?.internalName ?? '').trim()).filter(Boolean));
  const matchedSource = sourceRecords.filter((record) => targetInternalNames.has(String(record?.internalName ?? '').trim()));

  if (matchedSource.some((record) => record?.extras?.townNPC === true || record?.extras?.townNPC === 1)) {
    return 'p0_town';
  }
  if (matchedSource.some((record) => record?.flags?.boss === true || record?.flags?.boss === 1)) {
    return 'p0_boss';
  }
  if (matchedSource.some((record) => record?.flags?.friendly === true || record?.flags?.friendly === 1)) {
    return 'p1_friendly';
  }
  return 'p1_enemy';
}

function countByPriority(targets) {
  const counts = {};
  for (const target of targets) {
    const key = String(target?.priority ?? 'unknown');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function compareTarget(left, right) {
  const priorityDiff = priorityRank(left?.priority) - priorityRank(right?.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  return String(left?.pageTitle ?? '').localeCompare(String(right?.pageTitle ?? ''));
}

function compareStandardizedRecord(left, right) {
  return Number(left?.id ?? 0) - Number(right?.id ?? 0);
}

function isTargetEntityIdCrawled(entityId, crawledIds) {
  if (crawledIds.has(entityId)) {
    return true;
  }

  const resolvedEntityIds = RESOLVED_ENTITY_IDS_BY_TARGET_ENTITY_ID.get(entityId) ?? [];
  return resolvedEntityIds.some((resolvedEntityId) => crawledIds.has(resolvedEntityId));
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

function toEntityId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}
