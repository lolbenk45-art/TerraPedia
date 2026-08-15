function text(value) {
  return String(value ?? '').trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sortedStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))].sort();
}

function normalizeMembers(members = []) {
  const byKey = new Map();
  let duplicateMembersCollapsed = 0;
  let memberNameZhEnriched = 0;
  for (const candidate of Array.isArray(members) ? members : []) {
    const memberKey = text(candidate?.internalName ?? candidate?.memberKey ?? candidate?.member_key);
    if (!memberKey) throw new Error('item group shadow member identity is required');
    const existing = byKey.get(memberKey);
    if (!existing) {
      byKey.set(memberKey, { ...candidate, internalName: memberKey });
      continue;
    }
    duplicateMembersCollapsed += 1;
    const previousNameZh = text(existing.nameZh ?? existing.memberNameZh);
    const candidateNameZh = text(candidate?.nameZh ?? candidate?.memberNameZh);
    if (previousNameZh && candidateNameZh && previousNameZh !== candidateNameZh) {
      throw new Error(`item group shadow has conflicting duplicate memberNameZh for ${memberKey}`);
    }
    if (!previousNameZh && candidateNameZh) {
      memberNameZhEnriched += 1;
    }
    byKey.set(memberKey, {
      ...existing,
      ...candidate,
      internalName: memberKey,
      nameZh: candidateNameZh || previousNameZh || null,
    });
  }
  return {
    rows: [...byKey.values()].sort((left, right) => left.internalName.localeCompare(right.internalName)),
    duplicateMembersCollapsed,
    memberNameZhEnriched,
  };
}

function groupKey(group) {
  return text(group?.canonicalKey ?? group?.canonical_key ?? group?.canonicalName ?? group?.canonical_name);
}

function comparableGroup(group) {
  return {
    canonicalName: group?.canonicalName ?? group?.canonical_name ?? null,
    displayNameEn: group?.displayNameEn ?? group?.display_name ?? null,
    displayNameZh: group?.displayNameZh ?? group?.display_name_zh ?? null,
    aliases: sortedStrings(group?.aliases),
    domains: sortedStrings(group?.domains),
    sourceLayer: group?.sourceLayer ?? group?.source_layer ?? null,
    sourceMetadata: stableValue(group?.sourceMetadata ?? group?.source_metadata ?? {}),
    status: group?.status ?? 'ACTIVE',
    blockReason: group?.blockReason ?? group?.block_reason ?? null,
  };
}

function memberNameZh(member) {
  const value = text(member?.nameZh ?? member?.memberNameZh);
  return value || null;
}

function comparableMember(member) {
  const copy = { ...member };
  delete copy.nameZh;
  delete copy.memberNameZh;
  delete copy.memberKey;
  delete copy.member_key;
  copy.internalName = text(member?.internalName ?? member?.memberKey ?? member?.member_key);
  return stableValue(copy);
}

function compareGroupFields(groupKeyValue, legacy, canonical, differences) {
  const left = comparableGroup(legacy);
  const right = comparableGroup(canonical);
  const fields = [
    ['canonicalName', 'canonical_name_changed'],
    ['displayNameEn', 'display_name_en_changed'],
    ['displayNameZh', 'display_name_zh_changed'],
    ['aliases', 'aliases_changed'],
    ['domains', 'domains_changed'],
    ['sourceLayer', 'source_layer_changed'],
    ['sourceMetadata', 'source_metadata_changed'],
    ['status', 'status_changed'],
    ['blockReason', 'block_reason_changed'],
  ];
  for (const [field, kind] of fields) {
    if (stableJson(left[field]) !== stableJson(right[field])) {
      differences.push({ kind, groupKey: groupKeyValue, legacy: left[field], canonical: right[field] });
    }
  }
}

function compareMembers(groupKeyValue, legacyGroup, canonicalGroup, differences, normalizations) {
  const legacy = normalizeMembers(legacyGroup?.members);
  const canonical = normalizeMembers(canonicalGroup?.members);
  normalizations.duplicateMembersCollapsed += legacy.duplicateMembersCollapsed;
  normalizations.memberNameZhEnriched += legacy.memberNameZhEnriched;
  const legacyByKey = new Map(legacy.rows.map((row) => [row.internalName, row]));
  const canonicalByKey = new Map(canonical.rows.map((row) => [row.internalName, row]));
  for (const [memberKey, legacyMember] of legacyByKey) {
    const canonicalMember = canonicalByKey.get(memberKey);
    if (!canonicalMember) {
      differences.push({ kind: 'member_missing', groupKey: groupKeyValue, memberKey });
      continue;
    }
    if (stableJson(comparableMember(legacyMember)) !== stableJson(comparableMember(canonicalMember))) {
      differences.push({
        kind: 'member_changed',
        groupKey: groupKeyValue,
        memberKey,
        legacy: comparableMember(legacyMember),
        canonical: comparableMember(canonicalMember),
      });
    }
    const legacyNameZh = memberNameZh(legacyMember);
    const canonicalNameZh = memberNameZh(canonicalMember);
    if (legacyNameZh === canonicalNameZh) continue;
    if (legacyNameZh == null && canonicalNameZh != null) {
      normalizations.memberNameZhEnriched += 1;
      continue;
    }
    differences.push({
      kind: canonicalNameZh == null ? 'member_name_zh_removed' : 'member_name_zh_changed',
      groupKey: groupKeyValue,
      memberKey,
      legacy: legacyNameZh,
      canonical: canonicalNameZh,
    });
  }
  for (const memberKey of canonicalByKey.keys()) {
    if (!legacyByKey.has(memberKey)) {
      differences.push({ kind: 'member_added', groupKey: groupKeyValue, memberKey });
    }
  }
}

export function compareItemGroupShadow({
  consumer,
  legacySnapshot,
  canonicalSnapshot,
} = {}) {
  if (!text(consumer)) throw new Error('item group shadow consumer is required');
  if (!legacySnapshot || !canonicalSnapshot) throw new Error('both item group shadow snapshots are required');
  const differences = [];
  const normalizations = {
    duplicateMembersCollapsed: 0,
    memberNameZhEnriched: 0,
  };
  const legacyGroups = new Map((legacySnapshot.groups ?? []).map((group) => [groupKey(group), group]));
  const canonicalGroups = new Map((canonicalSnapshot.groups ?? []).map((group) => [groupKey(group), group]));
  for (const [key, legacyGroup] of legacyGroups) {
    const canonicalGroup = canonicalGroups.get(key);
    if (!canonicalGroup) {
      differences.push({ kind: 'group_missing', groupKey: key });
      continue;
    }
    compareGroupFields(key, legacyGroup, canonicalGroup, differences);
    compareMembers(key, legacyGroup, canonicalGroup, differences, normalizations);
  }
  for (const key of canonicalGroups.keys()) {
    if (!legacyGroups.has(key)) differences.push({ kind: 'group_added', groupKey: key });
  }
  if (stableJson(legacySnapshot.exclusions ?? []) !== stableJson(canonicalSnapshot.exclusions ?? [])) {
    differences.push({
      kind: 'exclusions_changed',
      legacy: stableValue(legacySnapshot.exclusions ?? []),
      canonical: stableValue(canonicalSnapshot.exclusions ?? []),
    });
  }
  return {
    consumer: text(consumer),
    status: differences.length === 0 ? 'PASS' : 'BLOCKED',
    differences,
    normalizations,
  };
}
