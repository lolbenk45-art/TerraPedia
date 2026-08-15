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

const REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION = 'reviewed_page_level_shared_loot';

const REVIEWED_PAGE_LEVEL_SHARED_LOOT_TARGETS = new Map([
  ['scarecrow', new Set([
    'Scarecrow1',
    'Scarecrow2',
    'Scarecrow3',
    'Scarecrow4',
    'Scarecrow5',
    'Scarecrow6',
    'Scarecrow7',
    'Scarecrow8',
    'Scarecrow9',
    'Scarecrow10',
  ])],
  ['zombie elf', new Set([
    'ZombieElfBeard',
    'ZombieElfGirl',
  ])],
  ['zombie', new Set([
    'BaldZombie',
    'FemaleZombie',
    'SwampZombie',
    'TwiggyZombie',
  ])],
  ['skeleton', new Set([
    'HeadacheSkeleton',
    'MisassembledSkeleton',
    'PantlessSkeleton',
  ])],
]);

const ORDINARY_SLIME_BONUS_DROP_NPC_INTERNAL_NAMES = new Set([
  'BabySlime',
  'BlackSlime',
  'BlueSlime',
  'GreenSlime',
  'JungleSlime',
  'Pinky',
  'PurpleSlime',
  'RedSlime',
  'YellowSlime',
]);

const SLIME_BONUS_DROP_ITEM_INTERNAL_NAMES = new Set([
  'Bomb',
  'CopperCoin',
  'CopperOre',
  'GoldCoin',
  'GoldOre',
  'Heart',
  'IronOre',
  'IronskinPotion',
  'LeadOre',
  'MiningPotion',
  'PlatinumOre',
  'RecallPotion',
  'Rope',
  'SilverCoin',
  'SilverOre',
  'SpelunkerPotion',
  'SwiftnessPotion',
  'TinOre',
  'Torch',
  'TungstenOre',
  'WormholePotion',
]);

export function classifyNpcLootSource(input = {}, options = {}) {
  const itemInternalName = normalizeText(input.itemInternalName ?? input.item_internal_name);
  const itemName = normalizeText(input.itemName ?? input.item_name);
  const sourceRefName = normalizeText(input.sourceRefName ?? input.source_ref_name);
  const sourceRefInternalName = normalizeText(input.sourceRefInternalName ?? input.source_ref_internal_name);
  const sourceRefResolution = normalizeText(input.sourceRefResolution ?? input.source_ref_resolution);
  const sourceType = normalizeText(options.sourceType ?? input.sourceType ?? input.source_type)?.toLowerCase();
  const sourceRefType = normalizeText(options.sourceRefType ?? input.sourceRefType ?? input.source_ref_type)?.toLowerCase();
  const landingSourceKey = normalizeText(input.landingSourceKey ?? input.landing_source_key);
  const sourceKey = sourceRefName?.toLowerCase() ?? '';
  const reviewedExclusion = findReviewedNonNpcSourceExclusion({
    sourceType,
    sourceRefType,
    sourceRefName,
  }, options.reviewedNonNpcSourceExclusions);

  if (reviewedExclusion) {
    return buildResult(
      'reviewed_non_npc_source_exclusion',
      false,
      null,
      reviewedExclusion.reason,
      'reviewed_non_npc_source_exclusion'
    );
  }

  if (itemName?.toLowerCase().startsWith('bonusdrop:')) {
    return buildResult(
      'reviewed_non_npc_source_exclusion',
      false,
      null,
      'mode_or_bonus_bucket',
      'reviewed_non_npc_source_exclusion'
    );
  }

  if (isReviewedOrdinarySlimeBonusMirror({ itemInternalName, sourceRefInternalName, landingSourceKey })) {
    return buildResult(
      'reviewed_non_npc_source_exclusion',
      false,
      null,
      'reviewed_slime_bonus_drop_source_only',
      'reviewed_non_npc_source_exclusion'
    );
  }

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
    if (
      sourceKey === 'mimic'
      && sourceRefInternalName === ORDINARY_MIMIC_TARGET
      && sourceRefResolution === 'exact_internal_name'
      && WRONG_EXACT_MIMIC_ITEM_INTERNAL_NAMES.has(itemInternalName)
      && isGeneratedItemRelationsBundleRow(input)
    ) {
      return buildResult(
        'reviewed_mimic_contract_rejected',
        false,
        null,
        'ordinary_mimic_contract_mismatch',
        'reviewed_mimic_contract_rejected'
      );
    }
    const reason = MIMIC_CONTRACT_ITEM_INTERNAL_NAMES.has(itemInternalName)
      ? 'ordinary_mimic_exact_promotion_forbidden'
      : 'ordinary_mimic_contract_mismatch';
    return buildResult('contract_mismatch', false, null, reason);
  }

  if (COLLECTIVE_BUCKET_NAMES.has(sourceKey)) {
    return buildResult('generic_bucket', false, null, 'collective_bucket_requires_reviewed_mapping');
  }

  if (sourceRefResolution === REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION && sourceRefInternalName) {
    if (!isReviewedPageLevelSharedLootTarget(sourceKey, sourceRefInternalName)) {
      return buildResult(
        'contract_mismatch',
        false,
        null,
        'reviewed_page_level_shared_loot_requires_pinned_target',
        REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION
      );
    }
    return buildResult(
      'accepted',
      true,
      sourceRefInternalName,
      REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION,
      REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION
    );
  }

  if (!isAuthoritativeNpcResolution(sourceRefResolution, sourceRefInternalName) && isUnknownGroupLikeSource(sourceRefName)) {
    return buildResult('generic_bucket', false, null, 'unknown_group_like_bucket_requires_reviewed_mapping');
  }

  return buildResult('accepted', true, sourceRefInternalName, 'not_taxonomy_restricted', sourceRefResolution);
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
  return ['resolved', 'exact_internal_name', 'positive_id_fallback', REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION].includes(String(sourceRefResolution ?? '').trim());
}

function isReviewedPageLevelSharedLootTarget(sourceKey, sourceRefInternalName) {
  return Boolean(REVIEWED_PAGE_LEVEL_SHARED_LOOT_TARGETS.get(sourceKey)?.has(sourceRefInternalName));
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

function findReviewedNonNpcSourceExclusion(row, exclusions = []) {
  if (!Array.isArray(exclusions)) return null;
  const sourceRefName = normalizeText(row.sourceRefName);
  if (!sourceRefName) return null;
  const sourceType = normalizeText(row.sourceType)?.toLowerCase();
  const sourceRefType = normalizeText(row.sourceRefType)?.toLowerCase();
  for (const exclusion of exclusions) {
    if (normalizeText(exclusion.sourceType)?.toLowerCase() !== sourceType) continue;
    if (normalizeText(exclusion.sourceRefType)?.toLowerCase() !== sourceRefType) continue;
    if (!reviewedExclusionMatches(sourceRefName, exclusion)) continue;
    return exclusion;
  }
  return null;
}

function reviewedExclusionMatches(sourceRefName, exclusion) {
  const matchType = normalizeText(exclusion.matchType ?? exclusion.match_type);
  const pattern = normalizeText(exclusion.sourceRefName ?? exclusion.source_ref_name);
  if (!matchType || !pattern) return false;
  if (matchType === 'exact') return sourceRefName.toLowerCase() === pattern.toLowerCase();
  if (matchType !== 'regex') return false;
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) return false;
  try {
    return new RegExp(pattern, 'i').test(sourceRefName);
  } catch {
    return false;
  }
}

function isGeneratedItemRelationsBundleRow(input = {}) {
  const landingSourceKey = normalizeText(input.landingSourceKey ?? input.landing_source_key);
  return landingSourceKey?.startsWith('generated.item_relations_bundle') === true;
}

function isReviewedOrdinarySlimeBonusMirror({ itemInternalName, sourceRefInternalName, landingSourceKey }) {
  return landingSourceKey?.startsWith('generated.item_relations_bundle') === true
    && ORDINARY_SLIME_BONUS_DROP_NPC_INTERNAL_NAMES.has(sourceRefInternalName)
    && SLIME_BONUS_DROP_ITEM_INTERNAL_NAMES.has(itemInternalName);
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}
