import crypto from 'node:crypto';

import { ITEM_GROUP_SOURCE_PRIORITIES } from './item-group-contract.mjs';

export const ITEM_GROUP_BOOTSTRAP_PARSER_VERSION = '1';

const ARTIFACT_KEYS = Object.freeze([
  'recipeReference',
  'recipeOverrides',
  'itemOverrides',
]);

const LANDING_PAYLOAD_KEYS = new Set([
  'groups',
  'blockedGroups',
  'reconciliation',
  'exclusions',
]);

function text(value) {
  return String(value ?? '').trim();
}

function normalizeAlias(value) {
  return text(value).replace(/\s+/g, ' ').toLowerCase();
}

function canonicalKey(value) {
  return normalizeAlias(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function artifactBytes(artifact) {
  return artifact.raw ?? JSON.stringify(artifact.payload ?? null);
}

function validateArtifact(key, artifact) {
  if (!artifact || typeof artifact !== 'object' || !artifact.payload || typeof artifact.payload !== 'object') {
    throw new Error(`item group bootstrap artifact ${key} is required`);
  }
  const raw = artifactBytes(artifact);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`item group bootstrap artifact ${key} is invalid JSON: ${error.message}`);
  }
  if (JSON.stringify(parsed) !== JSON.stringify(artifact.payload)) {
    throw new Error(`item group bootstrap artifact ${key} payload does not match its full-file bytes`);
  }
  if (text(artifact.payload.artifactRole) === 'compat_export') {
    throw new Error(`compat_export artifact ${key} cannot be bootstrap input`);
  }
}

function normalizeMembers(members, canonicalName, { allowEmpty = false } = {}) {
  if (!Array.isArray(members)) {
    throw new Error(`item group ${canonicalName} members must be an array`);
  }
  const byInternalName = new Map();
  for (const candidate of members) {
    const internalName = text(candidate?.internalName);
    if (!internalName) {
      throw new Error(`item group ${canonicalName} contains a member without internalName`);
    }
    const previous = byInternalName.get(internalName);
    const previousNameZh = text(previous?.nameZh);
    const candidateNameZh = text(candidate?.nameZh);
    if (previousNameZh && candidateNameZh && previousNameZh !== candidateNameZh) {
      throw new Error(`item group ${canonicalName} has ambiguous nameZh for ${internalName}`);
    }
    byInternalName.set(internalName, {
      ...(previous ?? {}),
      ...candidate,
      internalName,
      name: text(candidate?.name) || text(previous?.name) || null,
      nameZh: candidateNameZh || previousNameZh || null,
    });
  }
  const normalized = [...byInternalName.values()];
  if (!allowEmpty && normalized.length === 0) {
    throw new Error(`active group ${canonicalName} has no members`);
  }
  const missingNameZh = normalized.find((member) => !text(member.nameZh));
  if (missingNameZh) {
    throw new Error(`item group ${canonicalName} member ${missingNameZh.internalName} has no nameZh`);
  }
  return normalized;
}

function normalizeGroupAliases(group, canonicalName) {
  const implicit = new Map();
  for (const value of [canonicalName, group.displayNameEn, group.displayNameZh]) {
    const normalized = normalizeAlias(value);
    if (normalized) implicit.set(normalized, text(value));
  }
  const aliases = [];
  const explicit = new Set();
  for (const value of Array.isArray(group.aliases) ? group.aliases : []) {
    const aliasText = text(value);
    const normalized = normalizeAlias(aliasText);
    if (!normalized) continue;
    if (implicit.has(normalized) || explicit.has(normalized)) {
      throw new Error(`duplicate normalized alias ${normalized} in item group ${canonicalName}`);
    }
    explicit.add(normalized);
    aliases.push(aliasText);
  }
  return {
    aliases,
    normalizedAliases: [...implicit.keys(), ...explicit],
  };
}

function normalizeGroup(group, { sourceLayer, status = 'ACTIVE', sourceKind }) {
  const canonicalName = text(group?.canonicalName);
  if (!canonicalName) throw new Error('item group canonicalName is required');
  const aliasResult = normalizeGroupAliases(group, canonicalName);
  return {
    canonicalKey: canonicalKey(canonicalName),
    canonicalName,
    displayNameEn: text(group.displayNameEn) || canonicalName,
    displayNameZh: text(group.displayNameZh) || null,
    aliases: aliasResult.aliases,
    normalizedAliases: aliasResult.normalizedAliases,
    domains: [...new Set((Array.isArray(group.domains) ? group.domains : []).map(text).filter(Boolean))],
    sourceLayer,
    sourcePriority: ITEM_GROUP_SOURCE_PRIORITIES[sourceLayer],
    sourceKind,
    sourceProvider: text(group.sourceProvider) || null,
    sourcePage: text(group.sourcePage) || null,
    sourceRevisionTimestamp: group.sourceRevisionTimestamp ?? null,
    sourceMetadata: {
      sourceFile: text(group.sourceFile) || null,
      sourceUrls: Array.isArray(group.sourceUrls) ? group.sourceUrls.map(text).filter(Boolean) : [],
      sourceLabel: text(group.sourceLabel) || null,
    },
    status,
    blockReason: status === 'BLOCKED' ? text(group.blockReason) || null : null,
    members: normalizeMembers(group.members ?? [], canonicalName, { allowEmpty: status === 'BLOCKED' }),
  };
}

function classifyItemOverrideGroup(group, status) {
  const sourceKind = text(group?.sourceKind);
  if (status === 'BLOCKED') {
    if (sourceKind !== 'blocked_consumer_reference') {
      throw new Error(`unknown item group sourceKind ${sourceKind || '<empty>'} for blocked group`);
    }
    return normalizeGroup(group, { sourceLayer: 'source_group', status, sourceKind });
  }
  if (sourceKind === 'curated_wiki_item_group') {
    return normalizeGroup(group, { sourceLayer: 'source_group', sourceKind });
  }
  if (sourceKind === 'manual_wiki_source') {
    return normalizeGroup(group, { sourceLayer: 'central_override', sourceKind });
  }
  throw new Error(`unknown item group sourceKind ${sourceKind || '<empty>'} for active group`);
}

function assertUniqueGroupsAndAliases(groups) {
  const layerKeys = new Set();
  const aliases = new Map();
  for (const group of groups) {
    const layerKey = `${group.canonicalKey}:${group.sourceLayer}`;
    if (layerKeys.has(layerKey)) {
      throw new Error(`duplicate item group ${group.canonicalName} in source layer ${group.sourceLayer}`);
    }
    layerKeys.add(layerKey);
    for (const alias of group.normalizedAliases) {
      const owner = aliases.get(alias);
      if (owner && owner !== group.canonicalKey) {
        throw new Error(`duplicate normalized alias ${alias} resolves to ${owner} and ${group.canonicalKey}`);
      }
      aliases.set(alias, group.canonicalKey);
    }
  }
}

function reconcileRecipeOverrides(recipeGroups, overridePayload, evidenceReference) {
  if (!Array.isArray(overridePayload?.groups)) {
    throw new Error('recipe group override payload must contain groups');
  }
  const referenceByName = new Map(recipeGroups.map((group) => [group.canonicalName, group]));
  const normalizedOverrideGroups = [];
  const exclusions = [];
  let redundantOverrideCount = 0;

  for (const candidate of overridePayload.groups) {
    const canonicalName = text(candidate?.canonicalName);
    const reference = referenceByName.get(canonicalName);
    if (!reference) {
      throw new Error(`recipe override has no matching reference group: ${canonicalName || '<empty>'}`);
    }
    const members = normalizeMembers(candidate.members, canonicalName);
    normalizedOverrideGroups.push({
      canonicalName,
      members,
    });
    const referenceNames = new Set(reference.members.map((member) => member.internalName));
    const overrideNames = new Set(members.map((member) => member.internalName));
    const added = [...overrideNames].filter((name) => !referenceNames.has(name));
    if (added.length > 0) {
      throw new Error(`recipe override ${canonicalName} adds members absent from reference: ${added.join(', ')}`);
    }
    const omitted = reference.members.filter((member) => !overrideNames.has(member.internalName));
    if (omitted.length === 0) {
      redundantOverrideCount += 1;
      continue;
    }
    for (const member of omitted) {
      exclusions.push({
        canonicalKey: reference.canonicalKey,
        canonicalName,
        memberKey: member.internalName,
        reason: 'frozen recipe-group-overrides omission',
        actor: 'bootstrap.recipe_group_overrides',
        evidenceReference,
      });
    }
  }

  return {
    normalizedOverrideGroups,
    exclusions,
    reconciliation: {
      redundantOverrideCount,
      exclusionCount: exclusions.length,
      addedMemberGroupCount: 0,
      orphanOverrideGroupCount: 0,
    },
  };
}

export function validateItemGroupLandingPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('item group landing payload must be an object');
  }
  const nonGroupSections = Object.keys(payload).filter((key) => !LANDING_PAYLOAD_KEYS.has(key));
  if (nonGroupSections.length > 0) {
    throw new Error(`item group landing payload contains non-group section(s): ${nonGroupSections.join(', ')}`);
  }
  return true;
}

function buildLandingEntry({
  artifact,
  manifestHash,
  producerRunKey,
  sourceKey,
  sourcePage,
  provider,
  sourceKind,
  payload,
  generatedAt,
}) {
  validateItemGroupLandingPayload(payload);
  const raw = artifactBytes(artifact);
  const contentHash = sha256(JSON.stringify(payload));
  return {
    datasetType: 'item_groups_raw',
    provider,
    sourceKind,
    sourceKey,
    sourcePage,
    sourceLocator: artifact.sourceLocator ?? null,
    sourceRevisionTimestamp: null,
    fetchedAt: generatedAt ?? null,
    parsedAt: generatedAt ?? null,
    parseStatus: 'ok',
    payloadBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
    contentHash,
    payload,
    artifactRole: 'bootstrap_input',
    producerId: 'bootstrap.item-groups',
    producerVersion: ITEM_GROUP_BOOTSTRAP_PARSER_VERSION,
    producerRunKey,
    bootstrapManifestHash: manifestHash,
    fullFileContentHash: sha256(raw),
    fullFileByteSize: Buffer.byteLength(raw, 'utf8'),
  };
}

export function buildItemGroupBootstrap({ artifacts, producerRunKey } = {}) {
  for (const key of ARTIFACT_KEYS) validateArtifact(key, artifacts?.[key]);

  const recipePayload = artifacts.recipeReference.payload;
  const recipeOverridePayload = artifacts.recipeOverrides.payload;
  const itemOverridePayload = artifacts.itemOverrides.payload;
  if (!Array.isArray(recipePayload.groups)) {
    throw new Error('recipe material reference payload must contain groups');
  }
  if (!Array.isArray(itemOverridePayload.groups) || !Array.isArray(itemOverridePayload.blockedGroups)) {
    throw new Error('item group override payload must contain groups and blockedGroups');
  }

  const recipeGroups = recipePayload.groups.map((group) => normalizeGroup(group, {
    sourceLayer: 'recipe_reference',
    sourceKind: 'generated_recipe_reference',
  }));
  const sourceAndAdminGroups = itemOverridePayload.groups.map((group) => classifyItemOverrideGroup(group, 'ACTIVE'));
  const blockedGroups = itemOverridePayload.blockedGroups.map((group) => classifyItemOverrideGroup(group, 'BLOCKED'));
  const groups = [...recipeGroups, ...sourceAndAdminGroups, ...blockedGroups];
  assertUniqueGroupsAndAliases(groups);

  const overrideResult = reconcileRecipeOverrides(
    recipeGroups,
    recipeOverridePayload,
    artifacts.recipeOverrides.sourceLocator ?? 'data/generated/recipe-group-overrides.json',
  );
  const fullFileHashes = Object.fromEntries(ARTIFACT_KEYS.map((key) => [
    key,
    sha256(artifactBytes(artifacts[key])),
  ]));
  const manifestHash = sha256(JSON.stringify({
    parserVersion: ITEM_GROUP_BOOTSTRAP_PARSER_VERSION,
    fullFileHashes,
  }));
  const resolvedProducerRunKey = text(producerRunKey) || `bootstrap-${manifestHash.slice(0, 32)}`;
  const sourceGroups = sourceAndAdminGroups.filter((group) => group.sourceLayer === 'source_group');
  const adminGroups = sourceAndAdminGroups.filter((group) => group.sourceLayer === 'central_override');

  const landingEntries = [
    buildLandingEntry({
      artifact: artifacts.itemOverrides,
      manifestHash,
      producerRunKey: resolvedProducerRunKey,
      sourceKey: 'admin.item_group_overrides',
      sourcePage: 'item-group-overrides',
      provider: 'terrapedia.bootstrap',
      sourceKind: 'bootstrap_reconciliation',
      payload: { groups: adminGroups },
      generatedAt: itemOverridePayload.generatedAt,
    }),
    buildLandingEntry({
      artifact: artifacts.recipeOverrides,
      manifestHash,
      producerRunKey: resolvedProducerRunKey,
      sourceKey: 'admin.recipe_group_overrides',
      sourcePage: 'recipe-group-overrides',
      provider: 'terrapedia.bootstrap',
      sourceKind: 'bootstrap_reconciliation',
      payload: {
        groups: overrideResult.normalizedOverrideGroups,
        reconciliation: overrideResult.reconciliation,
        exclusions: overrideResult.exclusions,
      },
      generatedAt: recipeOverridePayload.updatedAt,
    }),
    buildLandingEntry({
      artifact: artifacts.recipeReference,
      manifestHash,
      producerRunKey: resolvedProducerRunKey,
      sourceKey: 'wiki.recipe_material_groups',
      sourcePage: 'recipe-material-reference',
      provider: 'terraria.wiki.gg',
      sourceKind: 'generated_recipe_reference',
      payload: { groups: recipeGroups },
      generatedAt: recipePayload.generatedAt,
    }),
    buildLandingEntry({
      artifact: artifacts.itemOverrides,
      manifestHash,
      producerRunKey: resolvedProducerRunKey,
      sourceKey: 'wiki.shimmer_item_groups',
      sourcePage: 'item-group-overrides',
      provider: 'terraria.wiki.gg',
      sourceKind: 'canonical_group_bundle',
      payload: { groups: sourceGroups, blockedGroups },
      generatedAt: itemOverridePayload.generatedAt,
    }),
  ];

  return {
    groups,
    exclusions: overrideResult.exclusions,
    reconciliation: overrideResult.reconciliation,
    unresolvedCount: 0,
    ambiguousCount: 0,
    manifestHash,
    landingEntries,
  };
}
