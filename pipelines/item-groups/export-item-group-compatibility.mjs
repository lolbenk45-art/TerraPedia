import crypto from 'node:crypto';

export const ITEM_GROUP_COMPATIBILITY_EXPORTER_VERSION = '1';

function text(value) {
  return String(value ?? '').trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function deepClone(value) {
  return structuredClone(value);
}

function sortBy(rows, key) {
  return [...rows].sort((left, right) => String(key(left)).localeCompare(String(key(right))));
}

function normalizeGroup(group) {
  const canonicalKey = text(group?.canonicalKey ?? group?.canonical_key);
  if (!canonicalKey) throw new Error('canonical compatibility group canonicalKey is required');
  const members = sortBy((Array.isArray(group.members) ? group.members : []).map(deepClone), (member) => (
    member.internalName ?? member.memberKey ?? member.member_key
  ));
  return stableValue({
    ...deepClone(group),
    canonicalKey,
    aliases: [...(Array.isArray(group.aliases) ? group.aliases : [])].sort(),
    domains: [...(Array.isArray(group.domains) ? group.domains : [])].sort(),
    members,
  });
}

function normalizeExclusion(exclusion) {
  const canonicalKey = text(exclusion?.canonicalKey ?? exclusion?.canonical_key);
  const memberKey = text(exclusion?.memberKey ?? exclusion?.member_key);
  if (!canonicalKey || !memberKey) {
    throw new Error('canonical compatibility exclusion canonicalKey and memberKey are required');
  }
  return stableValue({ ...deepClone(exclusion), canonicalKey, memberKey });
}

function snapshotBody({ schemaVersion = '1.0.0', landingRevision, groups, exclusions }) {
  const revision = text(landingRevision);
  if (!revision) throw new Error('canonical compatibility snapshot landingRevision is required');
  return {
    schemaVersion: text(schemaVersion) || '1.0.0',
    landingRevision: revision,
    groups: sortBy((Array.isArray(groups) ? groups : []).map(normalizeGroup), (group) => (
      `${group.canonicalKey}:${group.sourceLayer ?? ''}`
    )),
    exclusions: sortBy((Array.isArray(exclusions) ? exclusions : []).map(normalizeExclusion), (row) => (
      `${row.canonicalKey}:${row.memberKey}`
    )),
  };
}

export function buildItemGroupCompatibilitySnapshot(input = {}) {
  const body = snapshotBody(input);
  return { ...body, snapshotHash: hash(body) };
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('read-only canonical item group snapshot is required');
  }
  const normalized = buildItemGroupCompatibilitySnapshot(snapshot);
  if (text(snapshot.snapshotHash) !== normalized.snapshotHash) {
    throw new Error('canonical item group snapshot hash mismatch');
  }
  return normalized;
}

function commonMetadata(snapshot, exportRunKey) {
  const runKey = text(exportRunKey);
  if (!runKey) throw new Error('item group compatibility exportRunKey is required');
  return {
    artifactRole: 'compat_export',
    canonicalSnapshotHash: snapshot.snapshotHash,
    exportRunKey: runKey,
    exporterVersion: ITEM_GROUP_COMPATIBILITY_EXPORTER_VERSION,
    landingRevision: snapshot.landingRevision,
  };
}

function requireRecipeEvidence(recipeEvidence, landingRevision) {
  if (!recipeEvidence || typeof recipeEvidence !== 'object') {
    throw new Error('recipe non-group evidence is required');
  }
  if (text(recipeEvidence.landingRevision) !== landingRevision) {
    throw new Error('recipe compatibility landing revision mismatch');
  }
  const requiredArrays = [
    'sourceUrls',
    'recipeSourcePages',
    'sourcePageSnapshots',
    'supplementalRecipes',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(recipeEvidence[key])) {
      throw new Error(`recipe non-group evidence ${key} is required`);
    }
  }
  if (!text(recipeEvidence.sourceType) || !text(recipeEvidence.generatedAt)) {
    throw new Error('recipe non-group evidence sourceType and generatedAt are required');
  }
  return deepClone(recipeEvidence);
}

function resolvedRecipeOverrideGroups(snapshot) {
  const exclusionKeys = new Set(snapshot.exclusions.map((row) => `${row.canonicalKey}:${row.memberKey}`));
  const affectedKeys = new Set(snapshot.exclusions.map((row) => row.canonicalKey));
  return snapshot.groups
    .filter((group) => group.sourceLayer === 'recipe_reference' && affectedKeys.has(group.canonicalKey))
    .map((group) => ({
      ...deepClone(group),
      members: group.members.filter((member) => !exclusionKeys.has(
        `${group.canonicalKey}:${member.internalName ?? member.memberKey ?? member.member_key}`,
      )),
    }));
}

export function exportItemGroupCompatibility(options = {}) {
  const {
    snapshot,
    recipeEvidence,
    exportRunKey,
    ...unexpected
  } = options;
  if (Object.keys(unexpected).length > 0) {
    throw new Error(`item group compatibility writer credentials are forbidden: ${Object.keys(unexpected).join(', ')}`);
  }
  const normalized = validateSnapshot(snapshot);
  const evidence = requireRecipeEvidence(recipeEvidence, normalized.landingRevision);
  const metadata = commonMetadata(normalized, exportRunKey);
  const recipeGroups = normalized.groups.filter((group) => group.sourceLayer === 'recipe_reference');
  const nonRecipeGroups = normalized.groups.filter((group) => (
    group.sourceLayer !== 'recipe_reference' && group.status !== 'BLOCKED'
  ));
  const blockedGroups = normalized.groups.filter((group) => group.status === 'BLOCKED');
  const {
    landingRevision: ignoredRevision,
    ...nonGroupEvidence
  } = evidence;

  return stableValue({
    recipeMaterialReference: {
      ...nonGroupEvidence,
      ...metadata,
      schemaVersion: normalized.schemaVersion,
      groups: recipeGroups,
    },
    recipeGroupOverrides: {
      ...metadata,
      schemaVersion: normalized.schemaVersion,
      groups: resolvedRecipeOverrideGroups(normalized),
      exclusions: normalized.exclusions,
    },
    itemGroupOverrides: {
      ...metadata,
      schemaVersion: normalized.schemaVersion,
      groups: nonRecipeGroups,
      blockedGroups,
    },
  });
}

function validateArtifactSet(artifacts) {
  const entries = [
    artifacts?.recipeMaterialReference,
    artifacts?.recipeGroupOverrides,
    artifacts?.itemGroupOverrides,
  ];
  if (entries.some((entry) => !entry || entry.artifactRole !== 'compat_export')) {
    throw new Error('three canonical item group compatibility exports are required');
  }
  const hashes = new Set(entries.map((entry) => text(entry.canonicalSnapshotHash)));
  const revisions = new Set(entries.map((entry) => text(entry.landingRevision)));
  if (hashes.size !== 1 || revisions.size !== 1) {
    throw new Error('item group compatibility export metadata mismatch');
  }
  return entries;
}

export function parseItemGroupCompatibilityExports(artifacts = {}) {
  const entries = validateArtifactSet(artifacts);
  const recipe = artifacts.recipeMaterialReference;
  const item = artifacts.itemGroupOverrides;
  const snapshot = buildItemGroupCompatibilitySnapshot({
    schemaVersion: recipe.schemaVersion,
    landingRevision: recipe.landingRevision,
    groups: [
      ...(Array.isArray(recipe.groups) ? recipe.groups : []),
      ...(Array.isArray(item.groups) ? item.groups : []),
      ...(Array.isArray(item.blockedGroups) ? item.blockedGroups : []),
    ],
    exclusions: artifacts.recipeGroupOverrides.exclusions ?? [],
  });
  if (snapshot.snapshotHash !== entries[0].canonicalSnapshotHash) {
    throw new Error('item group compatibility round-trip snapshot hash mismatch');
  }
  return snapshot;
}
