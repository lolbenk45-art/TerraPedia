const ORDINARY_MIMIC_TARGET = 'Mimic';

const UNREVIEWED_MIMIC_VARIANT_INTERNAL_NAMES = new Set([
  'PresentMimic',
  'BigMimicCorruption',
  'BigMimicCrimson',
  'BigMimicHallow',
  'BigMimicJungle',
]);

const UNREVIEWED_MIMIC_VARIANT_SOURCE_NAMES = new Set([
  'present mimic',
  'corrupt mimic',
  'crimson mimic',
  'hallowed mimic',
  'jungle mimic',
]);

export const MIMIC_CONTRACT_ITEM_INTERNAL_NAMES = new Set([
  'DualHook',
  'MagicDagger',
  'PhilosophersStone',
  'TitanGlove',
  'StarCloak',
  'CrossNecklace',
]);

export const WRONG_EXACT_MIMIC_ITEM_INTERNAL_NAMES = new Set([
  'BandofRegeneration',
  'CloudinaBottle',
  'Extractinator',
  'FlareGun',
  'HermesBoots',
  'Mace',
  'ShoeSpikes',
]);

const COLLECTIVE_BUCKET_NAMES = new Set([
  'mimics',
  'pigrons',
  'mummies',
  'ghouls',
  'jellyfish',
  'sand sharks',
  'slimes',
  'the twins',
  'celestial pillars',
]);

const NON_NPC_PATTERNS = Object.freeze([
  /^bonus\s+drop$/i,
  /^expert\s+mode$/i,
  /^geode$/i,
  /^pigronata$/i,
  /^shadow\s+hammer$/i,
  /\bchest\b/i,
  /\bcrate\b/i,
  /\btreasure\s+bag\b/i,
  /\block\s+box\b/i,
  /^present$/i,
  /\btree\b/i,
  /\bheart\b/i,
  /\borb\b/i,
  /\bbag\b/i,
]);

export function classifyNpcLootSource(input = {}) {
  const itemInternalName = normalizeText(input.itemInternalName ?? input.item_internal_name);
  const sourceRefName = normalizeText(input.sourceRefName ?? input.source_ref_name);
  const sourceRefInternalName = normalizeText(input.sourceRefInternalName ?? input.source_ref_internal_name);
  const sourceRefResolution = normalizeText(input.sourceRefResolution ?? input.source_ref_resolution);
  const sourceKey = sourceRefName?.toLowerCase() ?? '';

  if (isNonNpcSource(sourceRefName)) {
    return buildResult('non_npc_source_misclassified', false, null, 'source_ref_is_not_npc');
  }

  if (UNREVIEWED_MIMIC_VARIANT_INTERNAL_NAMES.has(sourceRefInternalName)) {
    if (sourceRefResolution === 'exact_internal_name') {
      return buildResult('accepted', true, sourceRefInternalName, 'variant_exact_npc_source', 'exact_internal_name');
    }
    return buildResult('contract_mismatch', false, null, 'mimic_variant_requires_exact_npc_source');
  }

  if (UNREVIEWED_MIMIC_VARIANT_SOURCE_NAMES.has(sourceKey)) {
    return buildResult('contract_mismatch', false, null, 'mimic_variant_requires_exact_npc_source');
  }

  if (sourceKey === 'mimics') {
    if (MIMIC_CONTRACT_ITEM_INTERNAL_NAMES.has(itemInternalName)) {
      return buildResult('accepted', true, ORDINARY_MIMIC_TARGET, 'reviewed_mimic_contract', 'reviewed_mimic_contract');
    }
    return buildResult('generic_bucket', false, null, 'collective_bucket_requires_reviewed_mapping');
  }

  if (sourceKey === 'mimic' || sourceRefInternalName === ORDINARY_MIMIC_TARGET) {
    const reason = MIMIC_CONTRACT_ITEM_INTERNAL_NAMES.has(itemInternalName)
      ? 'ordinary_mimic_exact_promotion_forbidden'
      : 'ordinary_mimic_contract_mismatch';
    return buildResult('contract_mismatch', false, null, reason);
  }

  if (COLLECTIVE_BUCKET_NAMES.has(sourceKey)) {
    return buildResult('generic_bucket', false, null, 'collective_bucket_requires_reviewed_mapping');
  }

  if (!isAuthoritativeNpcResolution(sourceRefResolution, sourceRefInternalName) && isUnknownGroupLikeSource(sourceRefName)) {
    return buildResult('generic_bucket', false, null, 'unknown_group_like_bucket_requires_reviewed_mapping');
  }

  return buildResult('accepted', true, sourceRefInternalName, 'not_taxonomy_restricted');
}

export function isNpcLootSourceMaterializable(input = {}) {
  return classifyNpcLootSource(input).materializable;
}

export function isCollectiveBucketSourceName(value) {
  const key = normalizeText(value)?.toLowerCase();
  return key ? COLLECTIVE_BUCKET_NAMES.has(key) : false;
}

export function isNonNpcSource(value) {
  const text = normalizeText(value);
  return text ? NON_NPC_PATTERNS.some((pattern) => pattern.test(text)) : false;
}

export function isUnknownGroupLikeSource(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (/\b(army|variants?|family|group|pack|horde)\b/i.test(text)) return true;
  if (/\b(alias|[A-Za-z]+(?:as|is|us|ss))\b$/i.test(text)) return false;
  return /\b[A-Za-z]{3,}s\b$/.test(text);
}

export function isAuthoritativeNpcResolution(sourceRefResolution, sourceRefInternalName) {
  if (!sourceRefInternalName) return false;
  return ['resolved', 'exact_internal_name', 'positive_id_fallback'].includes(String(sourceRefResolution ?? '').trim());
}

function buildResult(status, materializable, targetNpcInternalName, reason, sourceRefResolution = null) {
  return {
    status,
    materializable,
    targetNpcInternalName,
    reason,
    sourceRefResolution,
  };
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}
