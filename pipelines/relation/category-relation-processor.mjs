import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';

function normalizeKeySegment(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || null;
}

function toPathSegments(row = {}) {
  return [row.top_level, row.section_title, row.group_name, row.item_name]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function toCategoryNodeKey(segments, depthIndex) {
  const scopedSegments = segments.slice(0, depthIndex + 1).map((segment) => normalizeKeySegment(segment));
  if (scopedSegments.some((segment) => !segment)) {
    return null;
  }
  return scopedSegments.join('/');
}

function isGroupDepth(segments, depthIndex) {
  return segments.length >= 3 && depthIndex === 2;
}

function upsertCategoryNodes(nodeMap, row, sourceMaintTable) {
  const segments = toPathSegments(row);
  if (segments.length === 0) {
    return;
  }

  for (let depthIndex = 0; depthIndex < segments.length; depthIndex += 1) {
    const nodeKey = toCategoryNodeKey(segments, depthIndex);
    if (!nodeKey || nodeMap.has(nodeKey)) {
      continue;
    }

    const parentNodeKey = depthIndex > 0 ? toCategoryNodeKey(segments, depthIndex - 1) : null;
    const pathText = segments.slice(0, depthIndex + 1).join(' > ');
    const trace = normalizeTrace(sourceMaintTable, row);

    nodeMap.set(nodeKey, {
      recordKey: createRecordKey({ nodeKey }),
      nodeKey,
      parentNodeKey,
      topLevel: normalizeText(row.top_level),
      sectionTitle: normalizeText(row.section_title),
      groupName: normalizeText(row.group_name),
      nodeName: segments[depthIndex],
      pathText,
      depth: depthIndex,
      isGroupNode: isGroupDepth(segments, depthIndex),
      ...trace
    });
  }
}

function buildAssignmentCandidate(row) {
  const itemInternalName = normalizeText(row.item_internal_name);
  if (!itemInternalName) {
    return null;
  }

  const segments = toPathSegments(row);
  if (segments.length === 0) {
    return null;
  }

  const categoryNodeKey = toCategoryNodeKey(segments, segments.length - 1);
  if (!categoryNodeKey) {
    return null;
  }
  const categoryPathText = segments.join(' > ');
  const trace = normalizeTrace('maint_item_categories', row);
  const isGroupNode = Boolean(row.is_group_node);

  return {
    itemInternalName,
    itemName: normalizeText(row.item_name) ?? normalizeText(row.item_english_name),
    categoryNodeKey,
    categoryPathText,
    isGroupNode,
    depth: segments.length - 1,
    assignmentReason: 'derived_from_maint_item_categories',
    trace,
    sourceRow: row
  };
}

function compareAssignmentCandidates(left, right) {
  if (left.isGroupNode !== right.isGroupNode) {
    return Number(left.isGroupNode) - Number(right.isGroupNode);
  }
  if (left.depth !== right.depth) {
    return right.depth - left.depth;
  }
  const pathCompare = left.categoryPathText.localeCompare(right.categoryPathText);
  if (pathCompare !== 0) {
    return pathCompare;
  }
  const leftRecordKey = normalizeText(left.sourceRow?.record_key) ?? '';
  const rightRecordKey = normalizeText(right.sourceRow?.record_key) ?? '';
  return leftRecordKey.localeCompare(rightRecordKey);
}

export function buildCategoryRelations({ categoryRows = [], itemCategoryRows = [] } = {}) {
  const nodeMap = new Map();
  const issueRows = [];
  const assignmentCandidatesByItem = new Map();
  const assignmentCandidatesByPair = new Map();

  for (const row of categoryRows) {
    upsertCategoryNodes(nodeMap, row, 'maint_categories');
  }

  for (const row of itemCategoryRows) {
    upsertCategoryNodes(nodeMap, row, 'maint_item_categories');
    const candidate = buildAssignmentCandidate(row);

    if (!candidate) {
      issueRows.push({
        issueKey: createRecordKey({
          reason: 'item_category_unmatched',
          id: row.id ?? null,
          recordKey: row.record_key ?? null
        }),
        reason: 'item_category_unmatched',
        reviewStatus: relationStatus.unresolved,
        confidence: confidence.none,
        itemInternalName: normalizeText(row.item_internal_name),
        itemName: normalizeText(row.item_name),
        categoryPathText: toPathSegments(row).join(' > '),
        ...normalizeTrace('maint_item_categories', row)
      });
      continue;
    }

    const pairKey = `${candidate.itemInternalName}::${candidate.categoryNodeKey}`;
    const existing = assignmentCandidatesByPair.get(pairKey);
    if (!existing || compareAssignmentCandidates(candidate, existing) < 0) {
      assignmentCandidatesByPair.set(pairKey, candidate);
    }
  }

  for (const candidate of assignmentCandidatesByPair.values()) {
    if (!assignmentCandidatesByItem.has(candidate.itemInternalName)) {
      assignmentCandidatesByItem.set(candidate.itemInternalName, []);
    }
    assignmentCandidatesByItem.get(candidate.itemInternalName).push(candidate);
  }

  const itemCategoryAssignments = [];
  for (const [itemInternalName, candidates] of assignmentCandidatesByItem.entries()) {
    candidates.sort(compareAssignmentCandidates);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const isPrimary = index === 0;
      itemCategoryAssignments.push({
        recordKey: createRecordKey({
          itemInternalName,
          categoryNodeKey: candidate.categoryNodeKey
        }),
        itemInternalName,
        itemName: candidate.itemName,
        categoryNodeKey: candidate.categoryNodeKey,
        categoryPathText: candidate.categoryPathText,
        isPrimary,
        assignmentReason: isPrimary ? 'ranked_primary_assignment' : 'ranked_secondary_assignment',
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        ...candidate.trace
      });
    }
  }

  const categoryNodes = Array.from(nodeMap.values()).sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }
    return left.pathText.localeCompare(right.pathText);
  });

  const primaryAssignments = itemCategoryAssignments.filter((row) => row.isPrimary).length;
  const secondaryAssignments = itemCategoryAssignments.length - primaryAssignments;

  return {
    categoryNodes,
    itemCategoryAssignments,
    issues: issueRows,
    summary: {
      categoryNodes: categoryNodes.length,
      itemCategoryAssignments: itemCategoryAssignments.length,
      unmatchedItems: issueRows.length,
      primaryAssignments,
      secondaryAssignments
    }
  };
}
