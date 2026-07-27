import crypto from 'node:crypto';

function text(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeAlias(value) {
  return text(value).replace(/\s+/g, ' ').toLowerCase();
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableSort(rows, key) {
  return [...rows].sort((left, right) => String(key(left)).localeCompare(String(key(right))));
}

function landingValue(row, camelName, snakeName) {
  return row?.[camelName] ?? row?.[snakeName] ?? null;
}

function landingPayload(row) {
  const value = row?.payload ?? row?.payload_json ?? {};
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function groupRecordKey(group, sourceKey) {
  return hash({
    type: 'maint_item_group',
    canonicalKey: group.canonicalKey,
    sourceLayer: group.sourceLayer,
    sourceKey,
  });
}

function normalizeMaintGroup(group, landingRow) {
  const canonicalKey = text(group?.canonicalKey ?? group?.canonical_key);
  const canonicalName = text(group?.canonicalName ?? group?.canonical_name);
  const sourceLayer = text(group?.sourceLayer ?? group?.source_layer);
  const sourceKey = text(landingValue(landingRow, 'sourceKey', 'source_key'));
  if (!canonicalKey || !canonicalName || !sourceLayer || !sourceKey) {
    throw new Error('canonical item group requires canonicalKey, canonicalName, sourceLayer, and sourceKey');
  }
  return {
    scope: 'item_groups',
    tableName: 'maint_item_groups',
    recordKey: groupRecordKey({ canonicalKey, sourceLayer }, sourceKey),
    canonicalKey,
    canonicalName,
    displayName: text(group?.displayNameEn ?? group?.display_name) || null,
    displayNameZh: text(group?.displayNameZh ?? group?.display_name_zh) || null,
    normalizedDomainsJson: JSON.stringify(group?.domains ?? []),
    sourceLayer,
    sourcePriority: Number(group?.sourcePriority ?? group?.source_priority ?? 0),
    sourceProvider: text(group?.sourceProvider ?? group?.source_provider)
      || text(landingValue(landingRow, 'provider', 'provider'))
      || null,
    sourceKey,
    sourcePage: text(group?.sourcePage ?? group?.source_page)
      || text(landingValue(landingRow, 'sourcePage', 'source_page'))
      || null,
    sourceLocator: text(landingValue(landingRow, 'sourceLocator', 'source_locator')) || null,
    sourceRevisionTimestamp: group?.sourceRevisionTimestamp ?? group?.source_revision_timestamp ?? null,
    landingSourceId: numberOrNull(landingValue(landingRow, 'id', 'id')),
    landingContentHash: text(landingValue(landingRow, 'contentHash', 'content_hash')) || null,
    provenanceMode: text(group?.sourceKind ?? group?.source_kind) || 'canonical_group',
    adminAuditRecordKey: group?.adminAuditRecordKey ?? null,
    status: text(group?.status) || 'ACTIVE',
    blockReason: text(group?.blockReason ?? group?.block_reason) || null,
    sourceMetadataJson: JSON.stringify(group?.sourceMetadata ?? {}),
    canonicalVersion: Number(group?.canonicalVersion ?? 1),
    deleted: 0,
  };
}

function buildMaintChildren(group, groupRow) {
  const members = (Array.isArray(group?.members) ? group.members : []).map((member, index) => {
    const memberKey = text(member?.memberKey ?? member?.internalName ?? member?.name);
    if (!memberKey) throw new Error(`canonical item group ${groupRow.canonicalName} has an empty member key`);
    return {
      scope: 'item_groups',
      tableName: 'maint_item_group_members',
      recordKey: hash({ type: 'maint_item_group_member', groupRecordKey: groupRow.recordKey, memberKey }),
      groupRecordKey: groupRow.recordKey,
      sourceItemId: numberOrNull(member?.sourceItemId ?? member?.itemId),
      internalName: text(member?.internalName) || null,
      name: text(member?.name) || null,
      nameZh: text(member?.nameZh) || null,
      memberKey,
      sortOrder: Number(member?.sortOrder ?? index),
      sourceMetadataJson: JSON.stringify(member?.sourceMetadata ?? {}),
      resolutionHint: text(member?.resolutionHint) || null,
      deleted: 0,
    };
  });
  const aliases = (Array.isArray(group?.aliases) ? group.aliases : []).map((alias, index) => {
    const aliasText = text(alias?.aliasText ?? alias);
    const normalizedAlias = normalizeAlias(alias?.normalizedAlias ?? aliasText);
    if (!normalizedAlias) throw new Error(`canonical item group ${groupRow.canonicalName} has an empty alias`);
    return {
      scope: 'item_groups',
      tableName: 'maint_item_group_aliases',
      recordKey: hash({ type: 'maint_item_group_alias', groupRecordKey: groupRow.recordKey, normalizedAlias }),
      groupRecordKey: groupRow.recordKey,
      aliasText,
      normalizedAlias,
      aliasKind: text(alias?.aliasKind) || 'explicit',
      aliasLanguage: text(alias?.aliasLanguage) || null,
      sortOrder: Number(alias?.sortOrder ?? index),
      deleted: 0,
    };
  });
  return { members, aliases };
}

function normalizeExclusion(exclusion, landingRow) {
  const canonicalKey = text(exclusion?.canonicalKey ?? exclusion?.canonical_key);
  const memberKey = text(exclusion?.memberKey ?? exclusion?.member_key);
  if (!canonicalKey || !memberKey) throw new Error('canonical item group exclusion requires canonicalKey and memberKey');
  return {
    scope: 'item_groups',
    tableName: 'maint_item_group_member_exclusions',
    recordKey: hash({ type: 'maint_item_group_member_exclusion', canonicalKey, memberKey }),
    canonicalKey,
    canonicalName: text(exclusion?.canonicalName) || null,
    memberKey,
    reason: text(exclusion?.reason) || 'canonical exclusion',
    actor: text(exclusion?.actor) || 'canonical.item-group-sync',
    evidenceReference: text(exclusion?.evidenceReference)
      || text(landingValue(landingRow, 'sourceLocator', 'source_locator'))
      || text(landingValue(landingRow, 'sourceKey', 'source_key')),
    deleted: 0,
  };
}

export function buildItemGroupMaintProjection({ landingRows = [], currentRows = [] } = {}) {
  const groups = [];
  const members = [];
  const aliases = [];
  const exclusions = [];
  for (const landingRow of landingRows) {
    const payload = landingPayload(landingRow);
    const sourceKey = text(landingValue(landingRow, 'sourceKey', 'source_key'));
    const payloadGroups = sourceKey === 'admin.recipe_group_overrides'
      ? []
      : [
        ...(Array.isArray(payload?.groups) ? payload.groups : []),
        ...(Array.isArray(payload?.blockedGroups) ? payload.blockedGroups : []),
      ];
    for (const group of payloadGroups) {
      const groupRow = normalizeMaintGroup(group, landingRow);
      const children = buildMaintChildren(group, groupRow);
      groups.push(groupRow);
      members.push(...children.members);
      aliases.push(...children.aliases);
    }
    for (const exclusion of Array.isArray(payload?.exclusions) ? payload.exclusions : []) {
      exclusions.push(normalizeExclusion(exclusion, landingRow));
    }
  }

  const incomingByKey = new Map(groups.map((row) => [row.recordKey, row]));
  const currentByKey = new Map(currentRows.map((row) => [row.recordKey ?? row.record_key, row]));
  const updatedRecordKeys = [];
  for (const [recordKey, incoming] of incomingByKey) {
    const current = currentByKey.get(recordKey);
    if (current && text(current.landingContentHash ?? current.landing_content_hash) !== incoming.landingContentHash) {
      updatedRecordKeys.push(recordKey);
    }
  }
  const retiredRecordKeys = [...currentByKey.keys()].filter((recordKey) => !incomingByKey.has(recordKey));

  return {
    groups: stableSort(groups, (row) => row.recordKey),
    members: stableSort(members, (row) => row.recordKey),
    aliases: stableSort(aliases, (row) => row.recordKey),
    exclusions: stableSort(exclusions, (row) => row.recordKey),
    rotation: {
      updatedRecordKeys: updatedRecordKeys.sort(),
      retiredRecordKeys: retiredRecordKeys.sort(),
    },
  };
}

function groupImplicitAliases(group) {
  return [group.canonicalName, group.displayName, group.displayNameZh]
    .map(normalizeAlias)
    .filter(Boolean);
}

function assertAliasAndRecipeIdentityContracts(maintProjection) {
  const aliasOwners = new Map();
  const explicitByGroup = new Map();
  for (const alias of maintProjection.aliases) {
    const list = explicitByGroup.get(alias.groupRecordKey) ?? [];
    list.push(alias.normalizedAlias);
    explicitByGroup.set(alias.groupRecordKey, list);
  }
  for (const group of maintProjection.groups) {
    const aliases = [...groupImplicitAliases(group), ...(explicitByGroup.get(group.recordKey) ?? [])];
    for (const alias of aliases) {
      const owner = aliasOwners.get(alias);
      if (owner && owner.canonicalKey !== group.canonicalKey) {
        throw new Error(`item group alias collision: ${alias} maps to ${owner.canonicalKey} and ${group.canonicalKey}`);
      }
      aliasOwners.set(alias, group);
    }
  }
  const protectedKeys = new Set(maintProjection.groups
    .filter((group) => group.sourceLayer === 'recipe_reference')
    .map((group) => group.canonicalKey));
  for (const group of maintProjection.groups) {
    if (group.sourceLayer !== 'recipe_reference' && protectedKeys.has(group.canonicalKey)) {
      throw new Error(`protected recipe identity cannot be overridden: ${group.canonicalKey}`);
    }
  }
}

function buildItemIndexes(items) {
  const byInternalName = new Map();
  const bySourceId = new Map();
  for (const item of items) {
    const internalName = text(item?.internalName ?? item?.internal_name);
    const sourceId = numberOrNull(item?.sourceId ?? item?.source_id);
    if (internalName) {
      const list = byInternalName.get(internalName) ?? [];
      list.push(item);
      byInternalName.set(internalName, list);
    }
    if (sourceId != null) {
      const list = bySourceId.get(sourceId) ?? [];
      list.push(item);
      bySourceId.set(sourceId, list);
    }
  }
  return { byInternalName, bySourceId };
}

export function buildItemGroupRelationProjection({ maintProjection, items = [] } = {}) {
  if (!maintProjection) throw new Error('maintProjection is required');
  assertAliasAndRecipeIdentityContracts(maintProjection);
  const itemIndexes = buildItemIndexes(items);
  const groupByRecordKey = new Map(maintProjection.groups.map((row) => [row.recordKey, row]));
  const exclusionByKey = new Map(maintProjection.exclusions.map((row) => [
    `${row.canonicalKey}:${row.memberKey}`,
    row,
  ]));
  const matchedExclusions = new Set();
  const relationMembers = [];

  for (const member of maintProjection.members) {
    const group = groupByRecordKey.get(member.groupRecordKey);
    if (!group) throw new Error(`item group member ${member.recordKey} has no parent group`);
    const exclusionKey = `${group.canonicalKey}:${member.memberKey}`;
    const exclusion = exclusionByKey.get(exclusionKey);
    let candidates = [];
    let resolutionState = 'UNRESOLVED';
    let resolutionReason = 'item identity not found';
    if (exclusion) {
      matchedExclusions.add(exclusionKey);
      resolutionState = 'REJECTED';
      resolutionReason = exclusion.reason;
    } else {
      candidates = member.internalName ? itemIndexes.byInternalName.get(member.internalName) ?? [] : [];
      if (candidates.length === 0 && member.sourceItemId != null) {
        candidates = itemIndexes.bySourceId.get(Number(member.sourceItemId)) ?? [];
      }
      if (candidates.length === 1) {
        resolutionState = 'RESOLVED';
        resolutionReason = 'matched canonical item identity';
      } else if (candidates.length > 1) {
        resolutionState = 'AMBIGUOUS';
        resolutionReason = 'multiple canonical item identities matched';
      }
    }
    relationMembers.push({
      recordKey: hash({ type: 'relation_item_group_member', sourceMaintRecordKey: member.recordKey }),
      groupRecordKey: group.recordKey,
      memberKey: member.memberKey,
      itemId: candidates.length === 1 ? Number(candidates[0].id) : null,
      sourceItemId: member.sourceItemId,
      internalName: member.internalName,
      name: member.name,
      nameZh: member.nameZh,
      sortOrder: member.sortOrder,
      resolutionState,
      resolutionReason,
      sourceMetadataJson: member.sourceMetadataJson,
      deleted: 0,
    });
  }
  const unmatchedExclusion = [...exclusionByKey.keys()].find((key) => !matchedExclusions.has(key));
  if (unmatchedExclusion) throw new Error(`item group exclusion does not match a resolved group member: ${unmatchedExclusion}`);

  const relationGroups = maintProjection.groups.map((group) => {
    const children = relationMembers.filter((member) => member.groupRecordKey === group.recordKey);
    const counts = {
      resolved: children.filter((member) => member.resolutionState === 'RESOLVED').length,
      unresolved: children.filter((member) => member.resolutionState === 'UNRESOLVED').length,
      ambiguous: children.filter((member) => member.resolutionState === 'AMBIGUOUS').length,
      rejected: children.filter((member) => member.resolutionState === 'REJECTED').length,
    };
    if (group.status !== 'BLOCKED' && counts.resolved === 0) {
      throw new Error(`zero resolved members for active item group ${group.canonicalName}`);
    }
    return {
      recordKey: hash({ type: 'relation_item_group', sourceMaintRecordKey: group.recordKey }),
      canonicalKey: group.canonicalKey,
      canonicalName: group.canonicalName,
      displayName: group.displayName,
      displayNameZh: group.displayNameZh,
      normalizedDomainsJson: group.normalizedDomainsJson,
      sourceLayer: group.sourceLayer,
      sourcePriority: group.sourcePriority,
      sourceMaintRecordKey: group.recordKey,
      landingSourceId: group.landingSourceId,
      landingSourceKey: group.sourceKey,
      landingContentHash: group.landingContentHash,
      resolvedMemberCount: counts.resolved,
      unresolvedMemberCount: counts.unresolved,
      ambiguousMemberCount: counts.ambiguous,
      rejectedMemberCount: counts.rejected,
      status: group.status === 'BLOCKED' || counts.unresolved > 0 || counts.ambiguous > 0 ? 'BLOCKED' : 'ACTIVE',
      blockReason: group.blockReason,
      canonicalVersion: group.canonicalVersion,
      sourceMetadataJson: group.sourceMetadataJson,
      deleted: 0,
    };
  });
  const relationGroupByMaintKey = new Map(relationGroups.map((row) => [row.sourceMaintRecordKey, row]));
  for (const member of relationMembers) {
    member.groupRecordKey = relationGroupByMaintKey.get(member.groupRecordKey).recordKey;
  }
  const relationAliases = maintProjection.aliases.map((alias) => ({
    recordKey: hash({ type: 'relation_item_group_alias', sourceMaintRecordKey: alias.recordKey }),
    groupRecordKey: relationGroupByMaintKey.get(alias.groupRecordKey).recordKey,
    aliasText: alias.aliasText,
    normalizedAlias: alias.normalizedAlias,
    aliasKind: alias.aliasKind,
    aliasLanguage: alias.aliasLanguage,
    sortOrder: alias.sortOrder,
    deleted: 0,
  }));
  const sorted = {
    groups: stableSort(relationGroups, (row) => row.recordKey),
    members: stableSort(relationMembers, (row) => row.recordKey),
    aliases: stableSort(relationAliases, (row) => row.recordKey),
  };
  return {
    ...sorted,
    snapshotHash: hash(sorted),
  };
}

export function selectWinner(rows = [], allowedLayers = []) {
  const allowed = new Set(allowedLayers);
  return rows
    .filter((row) => allowed.has(row.sourceLayer ?? row.source_layer))
    .sort((left, right) => Number(right.sourcePriority ?? right.source_priority ?? 0)
      - Number(left.sourcePriority ?? left.source_priority ?? 0))[0] ?? null;
}

export function buildItemGroupRuntimeProjection(relationProjection) {
  const groups = relationProjection.groups.filter((group) => (
    group.status === 'ACTIVE'
    && group.resolvedMemberCount > 0
    && group.unresolvedMemberCount === 0
    && group.ambiguousMemberCount === 0
  ));
  const activeKeys = new Set(groups.map((group) => group.recordKey));
  const runtimeGroups = groups.map((group) => ({
    ...group,
    recordKey: hash({ type: 'local_item_group', relationRecordKey: group.recordKey }),
    relationRecordKey: group.recordKey,
    sourceContentHash: group.landingContentHash,
  }));
  const runtimeKeyByRelationKey = new Map(runtimeGroups.map((group) => [group.relationRecordKey, group.recordKey]));
  const members = relationProjection.members
    .filter((member) => activeKeys.has(member.groupRecordKey) && member.resolutionState === 'RESOLVED')
    .map((member) => ({ ...member, groupRecordKey: runtimeKeyByRelationKey.get(member.groupRecordKey) }));
  const aliases = relationProjection.aliases
    .filter((alias) => activeKeys.has(alias.groupRecordKey))
    .map((alias) => ({ ...alias, groupRecordKey: runtimeKeyByRelationKey.get(alias.groupRecordKey) }));
  const sorted = {
    groups: stableSort(runtimeGroups, (row) => row.recordKey),
    members: stableSort(members, (row) => row.recordKey),
    aliases: stableSort(aliases, (row) => row.recordKey),
  };
  return { ...sorted, snapshotHash: hash(sorted) };
}

export async function runItemGroupCanonicalSync({
  landingRows = [],
  currentMaintRows = [],
  items = [],
  canonicalVersion,
  relationRunKey,
  adapter,
} = {}) {
  if (!adapter?.replaceMaintProjection || !adapter?.replaceRelationProjection || !adapter?.withLocalTransaction) {
    throw new Error('item group canonical sync requires an injected maint/relation/local adapter');
  }
  const maint = buildItemGroupMaintProjection({ landingRows, currentRows: currentMaintRows });
  const relation = buildItemGroupRelationProjection({ maintProjection: maint, items });
  const runtime = buildItemGroupRuntimeProjection(relation);
  const state = {
    singletonKey: 1,
    canonicalSnapshotHash: runtime.snapshotHash,
    canonicalVersion: Number(canonicalVersion),
    relationRunKey: text(relationRunKey),
    groupCount: runtime.groups.length,
    memberCount: runtime.members.length,
    aliasCount: runtime.aliases.length,
    publicationStatus: 'PUBLISHED',
  };
  await adapter.replaceMaintProjection(maint);
  await adapter.replaceRelationProjection(relation);
  await adapter.withLocalTransaction(async (transaction) => {
    await transaction.replaceRuntimeProjection(runtime);
    await transaction.publishProjectionState(state);
  });
  return { maint, relation, runtime, state };
}
