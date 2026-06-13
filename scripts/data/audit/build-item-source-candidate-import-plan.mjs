#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  auditItemSourceGapCandidates
} from './audit-item-source-gap-candidates.mjs';
import {
  isFamilyPageAllowedForSharedSource
} from './item-source-family-page-policy.mjs';
import {
  numericOption,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { normalizeText } from '../lib/wiki-page-utils.mjs';

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline'
]);

const ALLOWED_SOURCE_TYPES = new Set([
  'drop',
  'shop',
  'container',
  'crate',
  'treasure_bag',
  'shimmer',
  'worldgen',
  'mining',
  'fishing',
  'capture',
  'event',
  'transformation',
  'quest_reward',
  'craft',
  'unknown'
]);

const ALLOWED_SOURCE_REF_TYPES = new Set([
  'npc',
  'boss',
  'item',
  'container',
  'crate',
  'treasure_bag',
  'npc_group',
  'boss_group',
  'event',
  'world',
  'unknown'
]);

const ITEM_BACKED_SOURCE_REF_TYPES = new Set(['item', 'container', 'crate', 'treasure_bag']);
const NPC_BACKED_SOURCE_REF_TYPES = new Set(['npc', 'boss']);
const TEXT_ONLY_SOURCE_REF_TYPES = new Set(['world', 'npc_group', 'boss_group']);
const CONTAINER_LIKE_NPC_POLLUTION = /\b(chest|crate|treasure\s+bag|lock\s*box|present|bag)\b/i;
const PROMOTION_SCOPES = new Set(['family', 'polluted', 'all']);
const REVIEWED_CRITTER_CAPTURE_PAGES = new Set([
  'Birds',
  'Cockatiels',
  'Ducks',
  'Fairies',
  'Gem Bunnies',
  'Gem Squirrels',
  'Macaws',
  'Squirrels'
]);
const GOODIE_BAG_POLLUTED_PAGES = new Set([
  'Cat set',
  'Creeper set',
  'Fox set',
  'Karate Tortoise set',
  'Leprechaun set',
  'Princess set',
  'Pumpkin set',
  'Robot set',
  'Space Creature set',
  'Unicorn set',
  'Vampire set',
  'Witch set',
  'Wolf set',
  'Bride of Frankenstein set',
  'Ghost set',
  'Pixie set',
  'Reaper set',
  'Treasure Hunter set'
]);
const MUMMY_SET_SOURCE_NPCS = [
  'Blood Mummy',
  'Dark Mummy',
  'Light Mummy',
  'Mummy'
];
const REVIEWED_EXACT_FAMILY_SOURCE_SETS = new Map([
  ['Pearls', [['drop', 'item', 'Oyster']]],
  ['Angler armor', [['quest_reward', 'npc', 'Angler']]],
  ['Mermaid set', [['quest_reward', 'npc', 'Angler']]],
  ['Fish Costume set', [['quest_reward', 'npc', 'Angler']]],
  ['Junk', [['fishing', 'world', 'Fishing junk catch']]],
  ['Heart', [['drop', 'npc_group', 'slain enemies, pots, and slimes']]],
  ['Star', [['drop', 'npc_group', 'any enemy']]],
  ['Potted Lava Plants', [
    ['crate', 'crate', 'Obsidian Crate'],
    ['crate', 'crate', 'Hellstone Crate']
  ]],
  ['Fish Bowls', [
    ['crate', 'crate', 'Obsidian Crate'],
    ['crate', 'crate', 'Hellstone Crate']
  ]],
  ['Fishing poles', [
    ['quest_reward', 'npc', 'Angler'],
    ['fishing', 'world', 'Lava fishing'],
    ['crate', 'crate', 'Oasis Crate'],
    ['crate', 'crate', 'Mirage Crate']
  ]],
  ['Sponges', [
    ['quest_reward', 'npc', 'Angler'],
    ['fishing', 'world', 'Lava fishing']
  ]],
  ['Bottomless Buckets', [
    ['quest_reward', 'npc', 'Angler'],
    ['fishing', 'world', 'Lava fishing']
  ]],
  ['Fishing Bobbers', [
    ['fishing', 'world', 'Fishing'],
    ['quest_reward', 'npc', 'Angler']
  ]],
  ['Banners (decorative)', [['worldgen', 'world', 'Banners (decorative) plunder']]],
  ['Legacy:Biome Key Molds', [
    ['drop', 'npc_group', 'enemies in Jungle biome'],
    ['drop', 'npc_group', 'enemies in Corruption biome'],
    ['drop', 'npc_group', 'enemies in Crimson biome'],
    ['drop', 'npc_group', 'enemies in Hallow biome'],
    ['drop', 'npc_group', 'enemies in Snow biome']
  ]],
  ['Hooks', [
    ['drop', 'npc', 'Skeletron'],
    ['drop', 'npc', 'Mourning Wood'],
    ['drop', 'item', 'Present'],
    ['drop', 'npc', 'Everscream'],
    ['fishing', 'world', 'Fishing'],
    ['quest_reward', 'npc', 'Angler']
  ]],
  ['Wings', [
    ['drop', 'npc', 'Everscream'],
    ['quest_reward', 'npc', 'Angler'],
    ['drop', 'npc', 'Betsy']
  ]],
  ['Present', [['drop', 'world', 'Christmas seasonal event']]],
  ['Chillet', [['drop', 'item', 'Huge Dragon Egg']]]
]);
const REVIEWED_FURNITURE_FAMILY_PAGES = new Set([
  'Doors',
  'Chairs',
  'Candles',
  'Beds',
  'Lamps',
  'Chandeliers',
  'Candelabras',
  'Sofas',
  'Bathtubs',
  'Dressers',
  'Lanterns'
]);
const REVIEWED_SMALL_FAMILY_PAGES = new Set([
  'Logic Gates',
  'Team Blocks'
]);
const REVIEWED_REMAINING_FAMILY_PAGES = new Set([
  'Dragonflies',
  'Scorpions',
  'Vases',
  'Moss',
  'Altars',
  'Planter Boxes',
  'Magic Droppers',
  'Sandstone Walls',
  'Paintings',
  'Music Boxes',
  'Statues'
]);
const REVIEWED_RAW_FAMILY_MECHANISM_PAGES = new Set([
  'Shellphone',
  'Capricorn set',
  'Void Bag',
  'Guide to Peaceful Coexistence',
  'Minecarts',
  'Toilets',
  'Sinks',
  'Chests',
  'Pylons',
  'Gas Trap',
  'Flares',
  "Heroicis' set",
  "Chippy's set",
  'Wings',
  'Masks',
  'Treasure Bag',
  'Relics'
]);
const BOSS_FAMILY_NAME_OVERRIDES = new Map([
  ['Destroyer', 'The Destroyer'],
  ['Twins', 'The Twins'],
  ['Twin', 'The Twins'],
  ['Ancient Cultist', 'Lunatic Cultist'],
  ['Lunatic Cultist', 'Lunatic Cultist'],
  ['Martian Saucer', 'Martian Saucer'],
  ['UFO', 'Martian Saucer'],
  ['Flying Dutchman', 'Flying Dutchman'],
  ['Moon Lord', 'Moon Lord'],
  ['Betsy', 'Betsy'],
  ['SantaNK1', 'Santa-NK1'],
  ['Santank', 'Santa-NK1'],
  ['Fishron', 'Duke Fishron'],
  ['Cultist', 'Lunatic Cultist'],
  ['Eye', 'Eye of Cthulhu'],
  ['Eye of Cthulhu', 'Eye of Cthulhu'],
  ['Eater of Worlds', 'Eater of Worlds'],
  ['Brain of Cthulhu', 'Brain of Cthulhu'],
  ['Wall of Flesh', 'Wall of Flesh']
]);
const ANGLER_TROPHY_NAMES = new Set([
  'Goldfish Trophy',
  'Bunnyfish Trophy',
  'Swordfish Trophy',
  'Sharkteeth Trophy'
]);
const REVIEWED_ENEMY_BANNER_NPC_ALIASES = new Map([
  ['Blue Cultist Archer', { sourceRefName: 'Cultist Archer', sourceRefInternalNameHint: 'CultistArcherBlue' }],
  ['White Cultist Archer', { sourceRefName: 'Cultist Archer', sourceRefInternalNameHint: 'CultistArcherWhite' }],
  ['Martian Brain Scrambler', { sourceRefName: 'Brain Scrambler', sourceRefInternalNameHint: 'BrainScrambler' }],
  ['Martian Gigazapper', { sourceRefName: 'Gigazapper', sourceRefInternalNameHint: 'GigaZapper' }],
  ['Martian Gray Grunt', { sourceRefName: 'Gray Grunt', sourceRefInternalNameHint: 'GrayGrunt' }],
  ['Martian Ray Gunner', { sourceRefName: 'Ray Gunner', sourceRefInternalNameHint: 'RayGunner' }],
  ['Martian Scutlix Gunner', { sourceRefName: 'Scutlix Gunner', sourceRefInternalNameHint: 'ScutlixRider' }],
  ['Martian Tesla Turret', { sourceRefName: 'Tesla Turret', sourceRefInternalNameHint: 'MartianTurret' }],
  ['Present Mimic', { sourceRefName: 'Present Mimic', sourceRefInternalNameHint: 'PresentMimic' }]
]);

export function parseBuildItemSourceCandidateImportPlanArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key) && value !== false && value !== 'false') {
      throw new Error(`read-only import plan refuses mutation flag: --${key}`);
    }
  }

  return {
    rawItemPageDir: options['raw-dir'] ?? options.rawDir ?? '/home/lolben/data/terraPedia/raw/wiki/item-pages',
    npcParsedPath: options.npcs ?? sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
    standardizedNpcsPath: options['standardized-npcs'] ?? path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
    standardizedItemsPath: options.items ?? options['standardized-items'] ?? path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
    itemSourcesDir: options['item-sources-dir'] ?? options.itemSourcesDir ?? path.join(process.cwd(), 'data', 'standardized-view', 'item_relations', 'itemSources'),
    sample: options.sample ?? null,
    limit: numericOption(options.limit, null),
    outputPath: options.output ?? null,
    bundleRoot: options['bundle-root'] ?? options.bundleRoot ?? null,
    promotionScope: normalizePromotionScope(options['promotion-scope'] ?? options.promotionScope ?? 'all')
  };
}

export function buildItemSourceCandidateImportPlan({
  auditSummary = null,
  rawItemPageDir = '/home/lolben/data/terraPedia/raw/wiki/item-pages',
  npcParsedPath = sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
  standardizedNpcsPath = path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
  standardizedItemsPath = path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
  itemSourcesDir = path.join(process.cwd(), 'data', 'standardized-view', 'item_relations', 'itemSources'),
  sample = null,
  limit = null,
  promotionScope = 'all'
} = {}) {
  const normalizedPromotionScope = normalizePromotionScope(promotionScope);
  const summary = auditSummary ?? auditItemSourceGapCandidates({
    rawItemPageDir,
    npcParsedPath,
    standardizedNpcsPath,
    standardizedItemsPath,
    itemSourcesDir,
    sample,
    limit
  });
  const itemLookup = buildEntityLookup(loadEntityRecords(standardizedItemsPath), {
    includePlural: false
  });
  const npcLookup = buildEntityLookup(loadEntityRecords(fs.existsSync(npcParsedPath) ? npcParsedPath : standardizedNpcsPath), {
    includePlural: true
  });

  const eligibleCandidates = [];
  const blockedCandidates = [];
  const explicitSourceExemptionCandidates = [];
  let plannedSourceRows = 0;
  let blockedSourceRows = 0;
  let explicitSourceExemptionRows = 0;

  for (const candidate of Array.isArray(summary.candidates) ? summary.candidates : []) {
    const classification = normalizeText(candidate.classification) ?? 'unknown';
    const itemResolution = resolveEntityRef(itemLookup, candidate.itemInternalName, candidate.itemName);
    const sourcePlans = dedupeSourcePlans(normalizeCandidateSourcesForPlanning(candidate, candidate.extractedSources)
      .map((source, sourceIndex) => buildSourcePlan({
        candidate,
        source,
        sourceIndex,
        itemLookup,
        npcLookup
      })));
    const candidateBlockReason = classifyCandidateBlockReason(candidate, itemResolution, sourcePlans, {
      promotionScope: normalizedPromotionScope
    });

    const explicitExemption = classifyExplicitSourceExemption(candidate, itemResolution, sourcePlans);
    if (explicitExemption) {
      explicitSourceExemptionRows += sourcePlans.length;
      explicitSourceExemptionCandidates.push({
        itemInternalName: candidate.itemInternalName,
        itemName: candidate.itemName,
        pageTitle: candidate.pageTitle,
        rawPath: candidate.rawPath,
        classification,
        exemptionReason: explicitExemption.exemptionReason,
        itemResolution,
        rawSourceCount: candidate.rawSourceCount,
        standardizedSourceCount: candidate.standardizedSourceCount,
        sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
        importableAsSource: false,
        nextAction: '显式不可获得/未实现来源，保留为豁免，不导入普通 item source。',
        exemptedSources: sourcePlans.map((source) => ({
          ...source,
          exemptionStatus: classifySourceExemptionStatus(source)
        }))
      });
      continue;
    }

    const blockedSources = sourcePlans.filter((source) => source.blockedReason);
    if (candidateBlockReason || blockedSources.length > 0) {
      const blockedReason = candidateBlockReason ?? 'blocked_source_rows';
      blockedSourceRows += sourcePlans.length;
      blockedCandidates.push({
        itemInternalName: candidate.itemInternalName,
        itemName: candidate.itemName,
        pageTitle: candidate.pageTitle,
        rawPath: candidate.rawPath,
        classification,
        blockedReason,
        itemResolution,
        rawSourceCount: candidate.rawSourceCount,
        standardizedSourceCount: candidate.standardizedSourceCount,
        sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
        blockedSources: sourcePlans.map((source) => ({
          ...source,
          blockedReason: source.blockedReason ?? blockedReason
        }))
      });
      continue;
    }

    plannedSourceRows += sourcePlans.length;
    eligibleCandidates.push({
      itemInternalName: candidate.itemInternalName,
      itemName: candidate.itemName,
      itemResolution,
      pageTitle: candidate.pageTitle,
      rawPath: candidate.rawPath,
      classification,
      rawSourceCount: candidate.rawSourceCount,
      standardizedSourceCount: candidate.standardizedSourceCount,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      plannedSources: sourcePlans
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mode: 'candidate_import_plan',
    inputs: {
      rawItemPageDir,
      npcParsedPath,
      standardizedNpcsPath,
      standardizedItemsPath,
      itemSourcesDir,
      sample,
      limit,
      promotionScope: normalizedPromotionScope
    },
    sourceAudit: {
      generatedAt: summary.generatedAt,
      readOnly: summary.readOnly,
      parsedRawItemPages: summary.parsedRawItemPages,
      inspectedRawPages: summary.inspectedRawPages,
      rawPagesWithExtractedSources: summary.rawPagesWithExtractedSources,
      rawExtractedButStandardizedZeroCandidates: summary.rawExtractedButStandardizedZeroCandidates
    },
    summary: {
      totalCandidates: Number(summary.totalCandidates ?? 0),
      eligibleCandidates: eligibleCandidates.length,
      blockedCandidates: blockedCandidates.length,
      explicitSourceExemptionCandidates: explicitSourceExemptionCandidates.length,
      plannedSourceRows,
      blockedSourceRows,
      explicitSourceExemptionRows,
      classificationCounts: summary.classificationCounts ?? {},
      blockedReasonCounts: countBy(blockedCandidates, (candidate) => candidate.blockedReason),
      plannedSourceRefTypeCounts: countBy(
        eligibleCandidates.flatMap((candidate) => candidate.plannedSources),
        (source) => source.sourceRefType ?? 'unknown'
      )
    },
    eligibleCandidates,
    explicitSourceExemptionCandidates,
    blockedCandidates
  };
}

export function buildItemSourceCandidateBundle(plan) {
  const itemSources = (Array.isArray(plan?.eligibleCandidates) ? plan.eligibleCandidates : [])
    .flatMap((candidate) => Array.isArray(candidate.plannedSources) ? candidate.plannedSources : [])
    .map((source) => ({ ...source.landingRow }));

  return {
    source: 'terraria.wiki.gg:item-source-gap-repair',
    generatedAt: plan?.generatedAt ?? new Date().toISOString(),
    overwriteExisting: false,
    itemImages: [],
    recipes: [],
    itemSources,
    biomes: [],
    itemBiomes: [],
    snapshots: [],
    importPlanSummary: plan?.summary ?? null
  };
}

function classifyCandidateBlockReason(candidate, itemResolution, sourcePlans = [], { promotionScope = 'all' } = {}) {
  const classification = normalizeText(candidate.classification) ?? 'unknown';
  if (itemResolution.status !== 'resolved') return 'item_unresolved';
  if (classification === 'high_confidence') return null;
  if (classification === 'family_page_candidate') {
    if (!['family', 'all'].includes(promotionScope)) return 'family_page_candidate';
    return isAllowedFamilyCandidate(candidate, sourcePlans) ? null : 'family_page_candidate';
  }
  if (classification === 'polluted_candidate') {
    if (!['polluted', 'all'].includes(promotionScope)) return 'polluted_candidate';
    return isAllowedPollutedCandidate(candidate, sourcePlans) ? null : 'polluted_candidate';
  }
  if (classification !== 'high_confidence') return classification;
  return null;
}

function normalizePromotionScope(value) {
  const normalized = normalizeText(value)?.toLowerCase() ?? 'all';
  if (!PROMOTION_SCOPES.has(normalized)) {
    throw new Error(`invalid promotion scope: ${value}`);
  }
  return normalized;
}

function classifyExplicitSourceExemption(candidate, itemResolution, sourcePlans) {
  if (itemResolution.status !== 'resolved') return null;
  if (!Array.isArray(sourcePlans) || sourcePlans.length === 0) return null;
  if (isExplicitUnobtainableEnemyBanner(candidate, sourcePlans)) {
    return {
      exemptionReason: 'explicit_unobtainable_enemy_banner_source'
    };
  }
  if (!sourcePlans.every((source) => classifySourceExemptionStatus(source))) return null;
  return {
    exemptionReason: 'explicit_unobtainable_or_unimplemented_source'
  };
}

function isExplicitUnobtainableEnemyBanner(candidate, sourcePlans) {
  if (normalizeText(candidate?.pageTitle) !== 'Banners (enemy)') return false;
  return sourcePlans.some((source) =>
    classifySourceExemptionStatus(source) === 'unobtainable'
    && /\btags\s*=\s*[^}]*unobtainable[^}]*enemy banner/i.test(source.sourceRowText ?? ''));
}

function classifySourceExemptionStatus(source) {
  if (source?.sourceType !== 'unknown' || source?.sourceRefType !== 'world') return null;
  const key = normalizeIdentity(source.sourceRefName);
  if (key === 'unobtainableasitem') return 'unobtainable_as_item';
  if (key === 'unobtainable') return 'unobtainable';
  if (key === 'unimplemented') return 'unimplemented';
  return null;
}

function isAllowedFamilyCandidate(candidate, sourcePlans) {
  if (isAllowedReviewedFamilyCandidate(candidate, sourcePlans)) {
    return true;
  }
  return sourcePlans.length > 0
    && sourcePlans.every((source) =>
      !source.blockedReason
      && isFamilyPageAllowedForSharedSource({
        pageTitle: candidate.pageTitle,
        sourceType: source.sourceType,
        sourceRefType: source.sourceRefType
      }));
}

function isAllowedReviewedFamilyCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate.pageTitle);
  if (pageTitle === 'Tombstones') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'world'
        && normalizeIdentity(source.sourceRefName) === 'playerdeath');
  }
  if (pageTitle === 'Butterflies' || REVIEWED_CRITTER_CAPTURE_PAGES.has(pageTitle)) {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'capture'
        && source.sourceRefType === 'world'
        && normalizeIdentity(source.sourceRefName) === 'bugnetcapture');
  }
  if (pageTitle === 'Angler/Quests') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'quest_reward'
        && source.sourceRefType === 'npc'
        && source.sourceRefName === 'Angler');
  }
  if (pageTitle === 'Banners (enemy)') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'npc'
        && source.notes?.includes('Enemy banner kill source'));
  }
  if (sourcePlans.length > 0 && sourcePlans.every((source) => isReviewedDeveloperTreasureBagSource(source))) {
    return true;
  }
  if (isReviewedBossFamilyCandidate(candidate, sourcePlans)) {
    return true;
  }
  if (isReviewedFurnitureFamilyCandidate(candidate, sourcePlans)) {
    return true;
  }
  if (isReviewedSmallFamilyCandidate(candidate, sourcePlans)) {
    return true;
  }
  if (isReviewedRemainingFamilyCandidate(candidate, sourcePlans)) {
    return true;
  }
  if (isReviewedRawFamilyMechanismCandidate(candidate, sourcePlans)) {
    return true;
  }
  if (sourcePlans.length > 0 && sourcePlans.every((source) => isReviewedExactFamilySource(candidate, source))) {
    return true;
  }
  return false;
}

function isReviewedDeveloperTreasureBagSource(source) {
  return !source.blockedReason
    && source.sourceType === 'treasure_bag'
    && source.sourceRefType === 'boss_group'
    && source.sourceRefName === 'Hardmode Treasure Bag (except Queen Slime)';
}

function isReviewedExactFamilySource(candidate, source) {
  if (source.blockedReason) return false;
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (pageTitle === 'Wings' && !isReviewedWingSource(candidate, source)) {
    return false;
  }
  const allowed = REVIEWED_EXACT_FAMILY_SOURCE_SETS.get(pageTitle);
  if (!allowed) return false;
  return allowed.some(([sourceType, sourceRefType, sourceRefName]) =>
    source.sourceType === sourceType
    && source.sourceRefType === sourceRefType
    && source.sourceRefName === sourceRefName);
}

function isReviewedWingSource(candidate, source) {
  const itemInternalName = normalizeText(candidate?.itemInternalName);
  const itemName = normalizeText(candidate?.itemName);
  if (itemInternalName === 'FestiveWings') {
    return source.sourceType === 'drop' && source.sourceRefType === 'npc' && source.sourceRefName === 'Everscream';
  }
  if (itemInternalName === 'FinWings') {
    return source.sourceType === 'quest_reward' && source.sourceRefType === 'npc' && source.sourceRefName === 'Angler';
  }
  if (itemInternalName === 'BetsyWings' || itemName === "Betsy's Wings") {
    return source.sourceType === 'drop' && source.sourceRefType === 'npc' && source.sourceRefName === 'Betsy';
  }
  return false;
}

function isReviewedBossFamilyCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (!['Trophies', 'Relics', 'Masks', 'Treasure Bag'].includes(pageTitle)) return false;
  if (sourcePlans.length !== 1) return false;
  const [source] = sourcePlans;
  if (source.blockedReason) return false;
  if (pageTitle === 'Trophies') {
    return (
      source.sourceType === 'drop'
      && source.sourceRefType === 'boss'
    ) || (
      source.sourceType === 'quest_reward'
      && source.sourceRefType === 'npc'
      && source.sourceRefName === 'Angler'
      && ANGLER_TROPHY_NAMES.has(normalizeText(candidate?.itemName))
    );
  }
  return source.sourceType === 'drop' && source.sourceRefType === 'boss';
}

function isReviewedFurnitureFamilyCandidate(candidate, sourcePlans) {
  if (!REVIEWED_FURNITURE_FAMILY_PAGES.has(normalizeText(candidate?.pageTitle))) return false;
  return sourcePlans.length === 1
    && sourcePlans.every((source) =>
      !source.blockedReason
      && (
        (source.sourceType === 'worldgen' && source.sourceRefType === 'world')
        || (source.sourceType === 'drop' && source.sourceRefType === 'npc' && source.sourceRefName === 'Pirates')
      ));
}

function isReviewedSmallFamilyCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (!REVIEWED_SMALL_FAMILY_PAGES.has(pageTitle)) return false;
  if (pageTitle === 'Logic Gates') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'shop'
        && source.sourceRefType === 'npc'
        && source.sourceRefName === 'Steampunker');
  }
  if (pageTitle === 'Team Blocks') {
    if (isDullTeamBlockCandidate(candidate)) {
      return sourcePlans.length === 1
        && sourcePlans.every((source) =>
          !source.blockedReason
          && source.sourceType === 'shimmer'
          && source.sourceRefType === 'item'
          && normalizeText(source.sourceRefName) === deriveNormalTeamBlockName(candidate));
    }
    return sourcePlans.length === 1
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'shop'
        && source.sourceRefType === 'npc'
        && source.sourceRefName === 'Traveling Merchant');
  }
  return false;
}

function isReviewedRemainingFamilyCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (!REVIEWED_REMAINING_FAMILY_PAGES.has(pageTitle)) return false;
  if (!sourcePlans.length || sourcePlans.some((source) => source.blockedReason)) return false;
  if (pageTitle === 'Dragonflies' || pageTitle === 'Scorpions') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) =>
        source.sourceType === 'capture'
        && source.sourceRefType === 'world'
        && normalizeIdentity(source.sourceRefName) === 'bugnetcapture');
  }
  if (pageTitle === 'Music Boxes') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) =>
        source.sourceType === 'transformation'
        && source.sourceRefType === 'item'
        && source.sourceRefName === 'Music Box');
  }
  if (pageTitle === 'Moss') {
    return sourcePlans.every((source) =>
      (source.sourceType === 'drop' && source.sourceRefType === 'npc' && source.sourceRefName === 'Moss Zombie')
      || (source.sourceType === 'worldgen' && source.sourceRefType === 'world' && source.sourceRefName === 'Moss worldgen'));
  }
  if (pageTitle === 'Planter Boxes') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) =>
        source.sourceType === 'shop'
        && source.sourceRefType === 'npc'
        && source.sourceRefName === 'Dryad');
  }
  if (pageTitle === 'Vases' || pageTitle === 'Magic Droppers') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) => source.sourceType === 'mining' && source.sourceRefType === 'world');
  }
  if (pageTitle === 'Altars' || pageTitle === 'Sandstone Walls' || pageTitle === 'Paintings' || pageTitle === 'Statues') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) => source.sourceType === 'worldgen' && source.sourceRefType === 'world');
  }
  return false;
}

function isReviewedRawFamilyMechanismCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (!REVIEWED_RAW_FAMILY_MECHANISM_PAGES.has(pageTitle)) return false;
  if (isReviewedRemainingRawFamilyCandidate(candidate, sourcePlans)) {
    return true;
  }
  if (['Sinks', "Chippy's set", 'Wings', 'Masks', 'Treasure Bag', 'Relics'].includes(pageTitle)) {
    return false;
  }
  return sourcePlans.length > 0 && sourcePlans.every((source) => !source.blockedReason);
}

function isReviewedRemainingRawFamilyCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  const itemInternalName = normalizeText(candidate?.itemInternalName);
  if (pageTitle === 'Sinks') {
    return itemInternalName === 'GoldenSink'
      && sourcePlans.length === 1
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'npc'
        && source.sourceRefName === 'Pirates');
  }
  if (['Masks', 'Treasure Bag', 'Relics'].includes(pageTitle)) {
    return ['TwinMask', 'TwinsBossBag', 'TwinsMasterTrophy'].includes(itemInternalName)
      && sourcePlans.length === 1
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'boss_group'
        && source.sourceRefName === 'The Twins');
  }
  if (pageTitle === "Chippy's set" || pageTitle === 'Wings') {
    return [
      'ChippysHead',
      'ChippysBody',
      'ChippysLegs',
      'ChippysHeadband',
      'ChippysWingsInactive'
    ].includes(itemInternalName)
      && sourcePlans.length === 1
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'boss_group'
        && source.sourceRefName === "Skeletron's Red Hat variant");
  }
  return false;
}

function isAllowedPollutedCandidate(candidate, sourcePlans) {
  const pageTitle = normalizeText(candidate.pageTitle);
  if (GOODIE_BAG_POLLUTED_PAGES.has(pageTitle)) {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'item'
        && source.sourceRefName === 'Goodie Bag');
  }
  if (pageTitle === 'Flairon') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && (
          (source.sourceType === 'drop' && source.sourceRefType === 'boss' && source.sourceRefName === 'Duke Fishron')
          || (source.sourceType === 'treasure_bag' && source.sourceRefType === 'treasure_bag' && source.sourceRefName === 'Treasure Bag (Duke Fishron)')
        ))
      && sourcePlans.some((source) => source.sourceRefType === 'boss' && source.sourceRefName === 'Duke Fishron')
      && sourcePlans.some((source) => source.sourceRefType === 'treasure_bag' && source.sourceRefName === 'Treasure Bag (Duke Fishron)');
  }
  if (pageTitle === 'Shucked Oyster') {
    return sourcePlans.length === 1
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'item'
        && source.sourceRefName === 'Oyster');
  }
  if (pageTitle === 'Mummy set') {
    const expected = new Set(MUMMY_SET_SOURCE_NPCS);
    return sourcePlans.length === expected.size
      && sourcePlans.every((source) =>
        !source.blockedReason
        && source.sourceType === 'drop'
        && source.sourceRefType === 'npc'
        && expected.has(source.sourceRefName));
  }
  if (pageTitle === 'Block-placing wands') {
    const itemName = normalizeText(candidate.itemName);
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && normalizeText(source.sourceSectionTitle) === itemName);
  }
  if (pageTitle === 'Torches') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && ['drop', 'container', 'shop', 'craft', 'shimmer'].includes(source.sourceType)
        && source.sourceRefType !== 'unknown');
  }
  if (pageTitle === 'Ropes') {
    return sourcePlans.length > 0
      && sourcePlans.every((source) =>
        !source.blockedReason
        && ['drop', 'container', 'shop', 'craft'].includes(source.sourceType)
        && source.sourceRefType !== 'unknown');
  }
  return false;
}

function normalizeCandidateSourcesForPlanning(candidate, sources) {
  const normalized = (Array.isArray(sources) ? sources : [])
    .flatMap((source) => normalizeSourceForPlanning(candidate, source))
    .filter((source) => !isDroppedPollutedNoiseSource(candidate, source));
  const withoutReviewedMechanicNoise = dropReviewedMechanicNoiseSources(candidate, normalized);
  if (normalizeText(candidate?.pageTitle) === 'Torches') {
    return normalizeTorchSources(candidate, withoutReviewedMechanicNoise);
  }
  if (normalizeText(candidate?.pageTitle) === 'Ropes') {
    return normalizeRopeSources(candidate, withoutReviewedMechanicNoise);
  }
  if (normalizeText(candidate?.pageTitle) === 'Block-placing wands') {
    return normalizeBlockPlacingWandSources(candidate, withoutReviewedMechanicNoise);
  }
  const reviewedBossFamilySources = normalizeReviewedBossFamilySources(candidate, withoutReviewedMechanicNoise);
  if (reviewedBossFamilySources) {
    return reviewedBossFamilySources;
  }
  const reviewedFurnitureFamilySources = normalizeReviewedFurnitureFamilySources(candidate, withoutReviewedMechanicNoise);
  if (reviewedFurnitureFamilySources) {
    return reviewedFurnitureFamilySources;
  }
  const reviewedSmallFamilySources = normalizeReviewedSmallFamilySources(candidate, withoutReviewedMechanicNoise);
  if (reviewedSmallFamilySources) {
    return reviewedSmallFamilySources;
  }
  const reviewedRemainingFamilySources = normalizeReviewedRemainingFamilySources(candidate, withoutReviewedMechanicNoise);
  if (reviewedRemainingFamilySources) {
    return reviewedRemainingFamilySources;
  }
  if (normalizeText(candidate?.pageTitle) === 'Present') {
    return withoutReviewedMechanicNoise.filter((source) =>
      source.sourceType === 'drop'
      && source.sourceRefType === 'world'
      && normalizeIdentity(source.sourceRefName) === 'christmasseasonalevent');
  }
  if (normalizeText(candidate?.pageTitle) !== 'Flairon') {
    return withoutReviewedMechanicNoise;
  }

  const expertModeSources = withoutReviewedMechanicNoise.filter((source) =>
    source.sourceType === 'drop'
    && source.sourceRefType === 'unknown'
    && source.sourceRefName === 'Expert Mode');
  if (!expertModeSources.length) {
    return withoutReviewedMechanicNoise;
  }

  return withoutReviewedMechanicNoise
    .filter((source) => !expertModeSources.includes(source))
    .map((source) => {
      if (source.sourceRefType !== 'treasure_bag') return source;
      return {
        ...source,
        conditions: mergeText(source.conditions, 'Expert Mode')
      };
    });
}

function normalizeReviewedSmallFamilySources(candidate, sources) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (pageTitle === 'Logic Gates') {
    const steampunkerSource = sources.find((source) =>
      source.sourceType === 'shop'
      && source.sourceRefType === 'npc'
      && normalizeIdentity(source.sourceRefName) === 'steampunker');
    return steampunkerSource ? [{
      ...steampunkerSource,
      sourceType: 'shop',
      sourceRefType: 'npc',
      sourceRefName: 'Steampunker'
    }] : [];
  }
  if (pageTitle !== 'Team Blocks') return null;
  if (isDullTeamBlockCandidate(candidate)) {
    const recipeSources = buildExactRecipeSources(candidate).filter((source) =>
      source.sourceType === 'shimmer'
      && source.sourceRefType === 'item');
    if (recipeSources.length) return recipeSources.slice(0, 1);
    const normalTeamBlockName = deriveNormalTeamBlockName(candidate);
    return normalTeamBlockName ? [{
      sourceType: 'shimmer',
      sourceRefType: 'item',
      sourceRefName: normalTeamBlockName,
      quantityText: '1',
      chanceText: null,
      conditions: 'Shimmer transmutation',
      notes: `Dull Team Block variant from ${normalTeamBlockName}`
    }] : [];
  }
  const travelingMerchantSource = sources.find((source) =>
    source.sourceType === 'shop'
    && source.sourceRefType === 'npc'
    && normalizeIdentity(source.sourceRefName) === 'travelingmerchant');
  return travelingMerchantSource ? [{
    ...travelingMerchantSource,
    sourceType: 'shop',
    sourceRefType: 'npc',
    sourceRefName: 'Traveling Merchant'
  }] : [];
}

function normalizeReviewedRemainingFamilySources(candidate, sources) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (!REVIEWED_REMAINING_FAMILY_PAGES.has(pageTitle)) return null;
  if (pageTitle === 'Dragonflies' || pageTitle === 'Scorpions') {
    const source = sources.find((row) => row.sourceRefType === 'world');
    return source ? [{
      ...source,
      sourceType: 'capture',
      sourceRefType: 'world',
      sourceRefName: 'Bug Net capture',
      conditions: mergeText(source.conditions, 'Caught with a Bug Net')
    }] : [];
  }
  if (pageTitle === 'Music Boxes') {
    return [{
      sourceType: 'transformation',
      sourceRefType: 'item',
      sourceRefName: 'Music Box',
      quantityText: '1',
      chanceText: null,
      conditions: 'Recorded while equipped',
      notes: 'Recorded Music Box variant from a blank Music Box'
    }];
  }
  if (pageTitle === 'Moss') {
    const rows = [];
    const mossZombieSource = sources.find((source) =>
      source.sourceType === 'drop'
      && source.sourceRefType === 'npc'
      && normalizeIdentity(source.sourceRefName) === 'mosszombie');
    if (mossZombieSource) {
      rows.push({
        ...mossZombieSource,
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: 'Moss Zombie'
      });
    }
    const worldgenSource = sources.find((source) =>
      source.sourceType === 'worldgen'
      && source.sourceRefType === 'world'
      && normalizeIdentity(source.sourceRefName) === 'mossworldgen');
    if (worldgenSource) {
      rows.push({
        ...worldgenSource,
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: 'Moss worldgen'
      });
    }
    return rows;
  }
  if (pageTitle === 'Altars') {
    return firstMatchingReviewedFamilySource(sources, 'worldgen', 'world', 'Altars worldgen');
  }
  if (pageTitle === 'Statues') {
    return firstMatchingReviewedFamilySource(sources, 'worldgen', 'world', 'Statues worldgen');
  }
  if (pageTitle === 'Paintings') {
    return firstMatchingReviewedFamilySource(sources, 'worldgen', 'world', 'Paintings worldgen');
  }
  if (pageTitle === 'Planter Boxes') {
    return firstMatchingReviewedFamilySource(sources, 'shop', 'npc', 'Dryad');
  }
  if (pageTitle === 'Vases') {
    return firstMatchingReviewedFamilySource(sources, 'mining', 'world', 'Vases vein');
  }
  if (pageTitle === 'Magic Droppers') {
    return firstMatchingReviewedFamilySource(sources, 'mining', 'world', 'Magic Droppers vein');
  }
  if (pageTitle === 'Sandstone Walls') {
    return firstMatchingReviewedFamilySource(sources, 'worldgen', 'world', 'Sandstone Walls worldgen');
  }
  return null;
}

function firstMatchingReviewedFamilySource(sources, sourceType, sourceRefType, sourceRefName) {
  const source = sources.find((row) =>
    row.sourceType === sourceType
    && row.sourceRefType === sourceRefType
    && normalizeIdentity(row.sourceRefName) === normalizeIdentity(sourceRefName));
  return source ? [{
    ...source,
    sourceType,
    sourceRefType,
    sourceRefName
  }] : [];
}

function normalizeReviewedFurnitureFamilySources(candidate, sources) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (!REVIEWED_FURNITURE_FAMILY_PAGES.has(pageTitle)) return null;
  const itemName = normalizeText(candidate?.itemName) ?? '';
  if (/^Golden\b/i.test(itemName)) {
    const goldenSource = sources.find((source) =>
      source.sourceType === 'drop'
      && source.sourceRefType === 'npc'
      && ['pirateinvasion', 'pirates'].includes(normalizeIdentity(source.sourceRefName)));
    return goldenSource ? [{
      ...goldenSource,
      sourceRefName: 'Pirates'
    }] : null;
  }
  if (/^Obsidian\b/i.test(itemName)) {
    return sources.filter((source) =>
      source.sourceType === 'worldgen'
      && source.sourceRefType === 'world'
      && /\bRuined\s+houses?\b/i.test(source.sourceRefName ?? ''));
  }
  if (/\bDungeon\b/i.test(itemName)) {
    return sources.filter((source) =>
      source.sourceType === 'worldgen'
      && source.sourceRefType === 'world'
      && /\bDungeon\b/i.test(source.sourceRefName ?? '')
      && !/\bplunder\b/i.test(source.sourceRefName ?? ''));
  }
  return null;
}

function normalizeReviewedBossFamilySources(candidate, sources) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  if (pageTitle === 'Trophies') {
    if (ANGLER_TROPHY_NAMES.has(normalizeText(candidate?.itemName))) {
      return sources
        .filter((source) => source.sourceType === 'quest_reward' && source.sourceRefType === 'npc' && source.sourceRefName === 'Angler')
        .slice(0, 1);
    }
    const bossName = deriveBossFamilySourceName(candidate, 'Trophy');
    if (!bossName) return null;
    const source = sources.find((row) =>
      row.sourceType === 'drop'
      && row.sourceRefType === 'boss_group'
      && normalizeIdentity(row.sourceRefName) === 'mostbosses');
    return source ? [{
      ...source,
      sourceType: 'drop',
      sourceRefType: 'boss',
      sourceRefName: bossName
    }] : null;
  }

  if (pageTitle === 'Relics') {
    const bossName = deriveBossFamilySourceName(candidate, 'Relic');
    if (!bossName) return null;
    const source = sources.find((row) =>
      row.sourceType === 'drop'
      && row.sourceRefType === 'boss_group'
      && normalizeIdentity(row.sourceRefName) === 'bossesandminibosses');
    return source ? [{
      ...source,
      sourceType: 'drop',
      sourceRefType: bossName === 'The Twins' ? 'boss_group' : 'boss',
      sourceRefName: bossName
    }] : null;
  }

  if (pageTitle === 'Masks') {
    const bossName = deriveBossFamilySourceName(candidate, 'Mask');
    if (!bossName) return null;
    const source = sources.find((row) =>
      row.sourceType === 'drop'
      && row.sourceRefType === 'boss'
      && (normalizeIdentity(row.sourceRefName) === 'tr' || normalizeIdentity(row.sourceRefName) === 'thetwins'));
    return source ? [{
      ...source,
      sourceType: 'drop',
      sourceRefType: bossName === 'The Twins' ? 'boss_group' : 'boss',
      sourceRefName: bossName
    }] : null;
  }

  if (pageTitle === 'Treasure Bag') {
    const bossName = deriveTreasureBagBossName(candidate);
    if (!bossName) return null;
    const source = sources.find((row) =>
      row.sourceType === 'treasure_bag'
      && row.sourceRefType === 'boss_group'
      && normalizeIdentity(row.sourceRefName) === 'defeatingbosses');
    return source ? [{
      ...source,
      sourceType: 'drop',
      sourceRefType: bossName === 'The Twins' ? 'boss_group' : 'boss',
      sourceRefName: bossName
    }] : null;
  }

  return null;
}

function deriveTreasureBagBossName(candidate) {
  const itemName = normalizeText(candidate?.itemName);
  const match = itemName?.match(/^Treasure Bag\s+\((.+)\)$/i);
  if (match) {
    return normalizeBossFamilyName(match[1]);
  }
  const internalName = normalizeText(candidate?.itemInternalName);
  if (internalName?.endsWith('BossBag')) {
    return normalizeBossFamilyName(internalName.replace(/BossBag$/i, ''));
  }
  if (internalName?.startsWith('BossBag')) {
    return normalizeBossFamilyName(internalName.replace(/^BossBag/i, ''));
  }
  return null;
}

function deriveBossFamilySourceName(candidate, suffix) {
  const itemName = normalizeText(candidate?.itemName);
  if (itemName?.endsWith(` ${suffix}`)) {
    return normalizeBossFamilyName(itemName.replace(new RegExp(`\\s+${suffix}$`, 'i'), ''));
  }
  const internalName = normalizeText(candidate?.itemInternalName);
  if (!internalName) return null;
  let stem = internalName;
  if (suffix === 'Relic') {
    stem = stem.replace(/MasterTrophy$/i, '');
  } else {
    stem = stem.replace(new RegExp(`${suffix}$`, 'i'), '');
  }
  stem = stem.replace(/^BossTrophy/i, '').replace(/^BossMask/i, '');
  return normalizeBossFamilyName(splitCamelCaseIdentifier(stem));
}

function normalizeBossFamilyName(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const direct = BOSS_FAMILY_NAME_OVERRIDES.get(text);
  if (direct) return direct;
  const transclusionName = text.match(/\{\{\s*tr\s*\|\s*([^}|]+)(?:[|}].*)?$/i)?.[1];
  if (transclusionName) {
    return normalizeBossFamilyName(transclusionName);
  }
  const spaced = splitCamelCaseIdentifier(text);
  return BOSS_FAMILY_NAME_OVERRIDES.get(spaced) ?? spaced;
}

function splitCamelCaseIdentifier(value) {
  return normalizeText(value)
    ?.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim() ?? null;
}

function dropReviewedMechanicNoiseSources(candidate, sources) {
  if (normalizeText(candidate?.pageTitle) !== "Torch God's Favor") {
    return sources;
  }
  const hasTorchGodEvent = sources.some((source) =>
    source.sourceType === 'event'
    && source.sourceRefType === 'world'
    && normalizeIdentity(source.sourceRefName) === 'thetorchgodevent');
  if (!hasTorchGodEvent) {
    return sources;
  }
  return sources.filter((source) =>
    !(source.sourceType === 'fishing'
      && source.sourceRefType === 'world'
      && normalizeIdentity(source.sourceRefName) === 'fishing'));
}

function normalizeTorchSources(candidate, sources) {
  const itemName = normalizeText(candidate.itemName);
  const recipeSources = buildExactRecipeSources(candidate);
  const exactTypeSources = sources.filter((source) => normalizeText(source.sourceTargetItemName) === itemName);
  if (itemName !== 'Torch') {
    return [...exactTypeSources, ...recipeSources];
  }
  return [
    ...normalizeBaseMatrixItemSources(sources),
    ...recipeSources
  ];
}

function normalizeRopeSources(candidate, sources) {
  const itemName = normalizeText(candidate.itemName);
  if (itemName === 'Vine Rope') {
    return [{
      sourceType: 'drop',
      sourceRefType: 'world',
      sourceRefName: 'Vines',
      quantityText: '1',
      chanceText: null,
      conditions: 'Guide to Plant Fiber Cordage equipped',
      notes: 'Vine Rope is acquired by destroying vines while the Guide to Plant Fiber Cordage is equipped.'
    }];
  }
  const recipeSources = buildExactRecipeSources(candidate);
  if (itemName !== 'Rope') {
    return recipeSources;
  }
  return [
    ...normalizeBaseMatrixItemSources(sources),
    ...splitCompositeMerchantSource({
      sourceType: 'shop',
      sourceRefType: 'npc',
      sourceRefName: 'Merchant and Skeleton Merchant',
      quantityText: null,
      chanceText: null,
      conditions: null,
      notes: 'Rope can be purchased from the Merchant and Skeleton Merchant.'
    })
  ];
}

function normalizeBaseMatrixItemSources(sources) {
  return sources
    .filter((source) => !normalizeText(source.sourceTargetItemName))
    .filter((source) => !isBonusDropMarker(source))
    .flatMap(splitCompositeMerchantSource);
}

function isBonusDropMarker(source) {
  return source.sourceType === 'drop'
    && source.sourceRefType === 'unknown'
    && normalizeText(source.sourceRefName) === 'Bonus drop';
}

function splitCompositeMerchantSource(source) {
  if (
    source.sourceType !== 'shop'
    || source.sourceRefType !== 'npc'
    || !/Merchant\s+(?:or|and)\s+Skeleton Merchant/i.test(source.sourceRefName ?? '')
  ) {
    return [source];
  }
  return ['Merchant', 'Skeleton Merchant'].map((sourceRefName) => ({
    ...source,
    sourceRefName,
    conditions: null
  }));
}

function buildExactRecipeSources(candidate) {
  const itemName = normalizeText(candidate.itemName);
  const recipes = Array.isArray(candidate.extractedRecipes) ? candidate.extractedRecipes : [];
  return recipes
    .filter((recipe) => normalizeRecipeResultName(recipe?.resultName) === itemName)
    .flatMap((recipe) => buildRecipeSourceRows(candidate, recipe));
}

function buildRecipeSourceRows(candidate, recipe) {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const resultQuantity = Number(recipe?.resultQuantity);
  const quantityText = Number.isFinite(resultQuantity) && resultQuantity > 0 ? String(resultQuantity) : '1';
  const sourceType = inferRecipeSourceType(candidate, recipe);
  const conditions = sourceType === 'shimmer' ? 'Shimmer transmutation' : recipeConditionText(recipe);
  const notes = recipeIngredientSummary(ingredients);
  return ingredients
    .filter((ingredient) => normalizeText(ingredient?.ingredientName))
    .map((ingredient) => {
      const sourceRefType = normalizeText(ingredient.ingredientGroupType) === 'item' ? 'item' : 'world';
      return {
        sourceType,
        sourceRefType,
        sourceRefName: normalizeText(ingredient.ingredientName),
        quantityText,
        chanceText: null,
        conditions,
        notes
      };
    });
}

function inferRecipeSourceType(candidate, recipe) {
  const itemName = normalizeText(candidate.itemName);
  const ingredientNames = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : [])
    .map((ingredient) => normalizeText(ingredient?.ingredientName))
    .filter(Boolean);
  if (normalizeText(candidate.pageTitle) === 'Torches' && itemName === 'Aether Torch' && ingredientNames.includes('Any Torch')) {
    return 'shimmer';
  }
  if (normalizeText(candidate.pageTitle) === 'Team Blocks' && isDullTeamBlockCandidate(candidate)) {
    const normalTeamBlockName = deriveNormalTeamBlockName(candidate);
    if (normalTeamBlockName && ingredientNames.includes(normalTeamBlockName)) {
      return 'shimmer';
    }
  }
  return 'craft';
}

function isDullTeamBlockCandidate(candidate) {
  const itemName = normalizeText(candidate?.itemName);
  return normalizeText(candidate?.pageTitle) === 'Team Blocks'
    && /^Dull\s+.+\s+Team Block$/i.test(itemName ?? '');
}

function deriveNormalTeamBlockName(candidate) {
  const itemName = normalizeText(candidate?.itemName);
  if (!itemName) return null;
  return itemName.replace(/^Dull\s+/i, '').trim() || null;
}

function recipeConditionText(recipe) {
  const stations = (Array.isArray(recipe?.stations) ? recipe.stations : [])
    .map((station) => normalizeText(station?.stationName ?? station?.stationNameRaw))
    .filter(Boolean);
  if (!stations.length || stations.every((station) => station === 'By Hand')) {
    return 'Crafted by hand';
  }
  return stations.length ? `Crafted at ${stations.join(' + ')}` : 'Crafted by hand';
}

function recipeIngredientSummary(ingredients) {
  const parts = (Array.isArray(ingredients) ? ingredients : [])
    .map((ingredient) => {
      const name = normalizeText(ingredient?.ingredientName);
      if (!name) return null;
      const quantity = normalizeText(ingredient?.quantityText);
      return quantity ? `${name} x${quantity}` : name;
    })
    .filter(Boolean);
  return parts.length ? `Recipe ingredients: ${parts.join(', ')}` : null;
}

function normalizeRecipeResultName(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text
    .replace(/^only:\s*/i, '')
    .replace(/\s*\([^)]*versions?\)/gi, '')
    .replace(/\s+\d+(?:\.\d+)?$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceForPlanning(candidate, source) {
  const sourceType = normalizeText(source?.sourceType)?.toLowerCase() ?? 'unknown';
  let sourceRefType = normalizeText(source?.sourceRefType)?.toLowerCase() ?? 'unknown';
  const sourceRefName = normalizeSourceRefNameForPlanning(sourceRefType, source?.sourceRefName);
  const reviewedFamilySource = normalizeReviewedFamilySource(candidate, source, {
    sourceType,
    sourceRefType,
    sourceRefName
  });
  if (reviewedFamilySource) {
    return reviewedFamilySource;
  }
  const reviewedBlockedSource = normalizeReviewedBlockedSource(candidate, source, {
    sourceType,
    sourceRefType,
    sourceRefName
  });
  if (reviewedBlockedSource) {
    return reviewedBlockedSource;
  }
  if (
    GOODIE_BAG_POLLUTED_PAGES.has(normalizeText(candidate?.pageTitle))
    && sourceType === 'drop'
    && sourceRefType === 'unknown'
    && sourceRefName === 'Goodie Bag'
  ) {
    sourceRefType = 'item';
  }
  const reviewedRawFamilyMechanismSource = normalizeReviewedRawFamilyMechanismSource(candidate, source, {
    sourceType,
    sourceRefType,
    sourceRefName
  });
  if (reviewedRawFamilyMechanismSource) {
    return reviewedRawFamilyMechanismSource;
  }
  if (
    normalizeText(candidate?.pageTitle) === 'Shucked Oyster'
    && sourceType === 'drop'
    && sourceRefType === 'unknown'
    && sourceRefName === 'Oyster'
  ) {
    sourceRefType = 'item';
  }
  if (
    normalizeText(candidate?.pageTitle) === 'Mummy set'
    && sourceType === 'drop'
    && sourceRefType === 'unknown'
    && sourceRefName === 'Mummies'
  ) {
    return MUMMY_SET_SOURCE_NPCS.map((name) => ({
      ...source,
      sourceType,
      sourceRefType: 'npc',
      sourceRefName: name
    }));
  }
  return {
    ...source,
    sourceType,
    sourceRefType,
    sourceRefName
  };
}

function normalizeReviewedFamilySource(candidate, source, normalizedSource) {
  if (
    normalizeText(candidate?.pageTitle) === 'Banners (enemy)'
    && normalizedSource.sourceType === 'drop'
    && normalizedSource.sourceRefType === 'npc_group'
    && normalizeIdentity(normalizedSource.sourceRefName) === 'killingmostenemiesandafewcritters'
  ) {
    const npcName = deriveEnemyBannerNpcName(candidate);
    if (npcName) {
      const alias = REVIEWED_ENEMY_BANNER_NPC_ALIASES.get(npcName);
      return {
        ...source,
        sourceType: 'drop',
        sourceRefType: 'npc',
        sourceRefName: alias?.sourceRefName ?? npcName,
        sourceRefInternalNameHint: alias?.sourceRefInternalNameHint ?? deriveEnemyBannerNpcInternalNameHint(candidate),
        notes: mergeText(source.notes, 'Enemy banner kill source')
      };
    }
  }
  if (
    normalizeText(candidate?.pageTitle) === 'Angler/Quests'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'world'
    && normalizeIdentity(normalizedSource.sourceRefName) === 'anglerquestfishcatch'
  ) {
    return {
      ...source,
      sourceType: 'quest_reward',
      sourceRefType: 'npc',
      sourceRefName: 'Angler',
      notes: mergeText(source.notes, 'Angler quest fish catch')
    };
  }
  return null;
}

function deriveEnemyBannerNpcName(candidate) {
  const itemName = normalizeText(candidate?.itemName);
  if (!itemName || !/\sBanner$/i.test(itemName)) {
    return null;
  }
  return itemName.replace(/\sBanner$/i, '').trim() || null;
}

function deriveEnemyBannerNpcInternalNameHint(candidate) {
  const itemInternalName = normalizeText(candidate?.itemInternalName);
  if (!itemInternalName || !/Banner$/i.test(itemInternalName)) {
    return null;
  }
  return itemInternalName.replace(/Banner$/i, '').trim() || null;
}

function normalizeReviewedBlockedSource(candidate, source, normalizedSource) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  const sourceRefKey = normalizeIdentity(normalizedSource.sourceRefName);
  if (
    pageTitle === 'Carrot'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'world'
    && sourceRefKey === 'terrariacollectorsedition'
  ) {
    return {
      ...source,
      sourceType: 'worldgen',
      sourceRefType: 'world',
      sourceRefName: "Terraria Collector's Edition",
      notes: mergeText(source.notes, "Collector's Edition starting inventory")
    };
  }
  if (
    pageTitle === 'Cooked Marshmallow'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'world'
    && sourceRefKey === 'campfirecooking'
  ) {
    return {
      ...source,
      sourceType: 'craft',
      sourceRefType: 'item',
      sourceRefName: 'Marshmallow on a Stick',
      notes: mergeText(source.notes, 'Campfire cooking')
    };
  }
  if (
    normalizedSource.sourceType === 'treasure_bag'
    && normalizedSource.sourceRefType === 'treasure_bag'
    && normalizedSource.sourceRefName === 'Hardmode Treasure Bag (except Queen Slime)'
  ) {
    return {
      ...source,
      sourceType: 'treasure_bag',
      sourceRefType: 'boss_group',
      sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)'
    };
  }
  if (
    pageTitle === 'Joja Cola'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'world'
    && sourceRefKey === 'fishingjunkreplacement'
  ) {
    return {
      ...source,
      sourceType: 'fishing',
      sourceRefType: 'world',
      sourceRefName: 'Fishing junk replacement'
    };
  }
  if (
    pageTitle === 'Garden Gnome'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'npc'
    && sourceRefKey === 'gnomesunlighttransformation'
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'npc',
      sourceRefName: 'Gnome',
      notes: mergeText(source.notes, 'Sunlight transformation')
    };
  }
  if (
    pageTitle === "Torch God's Favor"
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'world'
    && sourceRefKey === 'thetorchgodevent'
  ) {
    return {
      ...source,
      sourceType: 'event',
      sourceRefType: 'world',
      sourceRefName: 'The Torch God event'
    };
  }
  if (
    pageTitle === 'Stardrop'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'npc'
    && sourceRefKey === 'dryad'
    && /purif/i.test(`${source.conditions ?? ''} ${source.notes ?? ''}`)
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'npc',
      sourceRefName: 'Dryad',
      notes: mergeText(source.notes, 'Dryad purification')
    };
  }
  return null;
}

function normalizeReviewedRawFamilyMechanismSource(candidate, source, normalizedSource) {
  const pageTitle = normalizeText(candidate?.pageTitle);
  const itemInternalName = normalizeText(candidate?.itemInternalName);
  const sourceRefKey = normalizeIdentity(normalizedSource.sourceRefName);
  if (
    pageTitle === 'Sinks'
    && itemInternalName === 'GoldenSink'
    && normalizedSource.sourceType === 'drop'
    && normalizedSource.sourceRefType === 'npc'
    && ['pirateinvasion', 'pirates'].includes(sourceRefKey)
  ) {
    return {
      ...source,
      sourceType: 'drop',
      sourceRefType: 'npc',
      sourceRefName: 'Pirates'
    };
  }
  if (
    ['Masks', 'Treasure Bag', 'Relics'].includes(pageTitle)
    && ['TwinMask', 'TwinsBossBag', 'TwinsMasterTrophy'].includes(itemInternalName)
    && normalizedSource.sourceType === 'drop'
    && normalizedSource.sourceRefType === 'boss'
    && sourceRefKey === 'thetwins'
  ) {
    return {
      ...source,
      sourceType: 'drop',
      sourceRefType: 'boss_group',
      sourceRefName: 'The Twins',
      notes: mergeText(source.notes, 'The Twins aggregate boss source')
    };
  }
  if (
    (pageTitle === "Chippy's set" || pageTitle === 'Wings')
    && [
      'ChippysHead',
      'ChippysBody',
      'ChippysLegs',
      'ChippysHeadband',
      'ChippysWingsInactive'
    ].includes(itemInternalName)
    && normalizedSource.sourceType === 'drop'
    && normalizedSource.sourceRefType === 'boss_group'
    && sourceRefKey === 'skeletronsredhatvariant'
  ) {
    return {
      ...source,
      sourceType: 'drop',
      sourceRefType: 'boss_group',
      sourceRefName: "Skeletron's Red Hat variant",
      notes: mergeText(source.notes, 'Skeletron Red Hat variant source')
    };
  }
  if (
    pageTitle === 'Shellphone'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'item'
    && sourceRefKey === 'shellphone'
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'item',
      sourceRefName: 'Shellphone (Home)',
      notes: mergeText(source.notes, 'Shellphone destination toggle')
    };
  }
  if (
    pageTitle === 'Capricorn set'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'item'
    && sourceRefKey === 'capricorntail'
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'item',
      sourceRefName: 'Capricorn Tail',
      notes: mergeText(source.notes, 'Capricorn tail/legs toggle')
    };
  }
  if (
    pageTitle === 'Void Bag'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'item'
    && sourceRefKey === 'voidbag'
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'item',
      sourceRefName: 'Void Bag',
      notes: mergeText(source.notes, 'Void Bag open/closed toggle')
    };
  }
  if (
    pageTitle === 'Guide to Peaceful Coexistence'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'item'
    && sourceRefKey === 'guidetopeacefulcoexistence'
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'item',
      sourceRefName: 'Guide to Peaceful Coexistence',
      notes: mergeText(source.notes, 'Guide to Peaceful Coexistence active/inactive toggle')
    };
  }
  if (
    pageTitle === 'Minecarts'
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'item'
    && sourceRefKey === 'minecartupgradekit'
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'item',
      sourceRefName: 'Minecart Upgrade Kit',
      notes: mergeText(source.notes, 'Minecart Upgrade Kit use')
    };
  }
  if (
    pageTitle === "Heroicis' set"
    && normalizedSource.sourceType === 'unknown'
    && normalizedSource.sourceRefType === 'world'
    && sourceRefKey === 'platinumcointhrownintooasiswater'
  ) {
    return {
      ...source,
      sourceType: 'transformation',
      sourceRefType: 'item',
      sourceRefName: 'Platinum Coin',
      notes: mergeText(source.notes, 'Thrown into Oasis water')
    };
  }
  return null;
}

function isDroppedPollutedNoiseSource(candidate, source) {
  return normalizeText(candidate?.pageTitle) === 'Witch set'
    && source.sourceType === 'worldgen'
    && source.sourceRefType === 'world'
    && source.sourceRefName === 'Witch set worldgen'
    && /\bVampirism worlds?\b/i.test(source.conditions ?? '');
}

function normalizeBlockPlacingWandSources(candidate, sources) {
  const itemName = normalizeText(candidate.itemName);
  const matching = sources.filter((source) => normalizeText(source.sourceSectionTitle) === itemName);
  const hasTreeSource = new Set(matching
    .filter((source) => isBlockPlacingWandTreeSource(source))
    .map((source) => blockPlacingWandSourceRowKey(source)));

  return matching
    .filter((source) => {
      if (normalizeText(source.sourceRefName) !== 'Shaking') return true;
      return !hasTreeSource.has(blockPlacingWandSourceRowKey(source));
    })
    .map((source) => {
      if (!isBlockPlacingWandTreeSource(source)) return source;
      return {
        ...source,
        sourceType: 'drop',
        sourceRefType: 'world',
        conditions: mergeText(source.conditions, 'Shaking')
      };
    });
}

function isBlockPlacingWandTreeSource(source) {
  return source.sourceType === 'drop'
    && source.sourceRefType === 'unknown'
    && /^(?:Forest|Mahogany) tree$/i.test(normalizeText(source.sourceRefName) ?? '');
}

function blockPlacingWandSourceRowKey(source) {
  return JSON.stringify([
    normalizeText(source.sourceSectionTitle),
    source.quantityText ?? null,
    source.chanceText ?? null,
    source.sourceRowText ?? null
  ]);
}

function buildSourcePlan({
  candidate,
  source,
  sourceIndex,
  itemLookup,
  npcLookup
}) {
  const sourceType = normalizeText(source.sourceType)?.toLowerCase() ?? 'unknown';
  const sourceRefType = normalizeText(source.sourceRefType)?.toLowerCase() ?? 'unknown';
  const sourceRefName = normalizeSourceRefNameForPlanning(sourceRefType, source.sourceRefName);
  const sourceRefInternalNameHint = normalizeText(source.sourceRefInternalNameHint);
  const base = {
    importPlanKey: createImportPlanKey(candidate, source, sourceIndex),
    sourceType,
    sourceRefType,
    sourceRefName,
    quantityText: source.quantityText ?? null,
    chanceText: source.chanceText ?? null,
    conditions: source.conditions ?? null,
    notes: source.notes ?? null,
    sourcePage: candidate.pageTitle ?? null,
    sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
    sourceSectionTitle: source.sourceSectionTitle ?? null,
    sourceRowText: source.sourceRowText ?? null,
    sourceRefInternalNameHint,
    sortOrder: sourceIndex,
    landingRow: {
      itemInternalName: candidate.itemInternalName,
      itemName: candidate.itemName,
      sourceType,
      sourceRefType,
      sourceRefName,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      notes: source.notes ?? null,
      sourceProvider: 'wiki_gg',
      sourcePage: candidate.pageTitle ?? null,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      sortOrder: sourceIndex
    }
  };

  const blockedReason = validateSourceContract({ sourceType, sourceRefType, sourceRefName });
  if (blockedReason) {
    return {
      ...base,
      resolutionStatus: 'blocked',
      resolvedRef: null,
      blockedReason
    };
  }

  if (TEXT_ONLY_SOURCE_REF_TYPES.has(sourceRefType)) {
    return {
      ...base,
      resolutionStatus: sourceRefType === 'world' ? 'world_text_ref' : 'text_only_ref',
      resolvedRef: null,
      blockedReason: null
    };
  }

  if (ITEM_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) {
    const resolvedRef = resolveEntityRef(itemLookup, sourceRefName);
    if (resolvedRef.status !== 'resolved') {
      return {
        ...base,
        resolutionStatus: resolvedRef.status,
        resolvedRef,
        blockedReason: 'source_item_ref_unresolved'
      };
    }
    return {
      ...base,
      resolutionStatus: 'resolved_item_ref',
      resolvedRef,
      blockedReason: null
    };
  }

  if (NPC_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) {
    const resolvedRef = resolveEntityRef(npcLookup, sourceRefInternalNameHint, sourceRefName);
    if (resolvedRef.status !== 'resolved') {
      return {
        ...base,
        resolutionStatus: resolvedRef.status,
        resolvedRef,
        blockedReason: sourceRefType === 'boss' ? 'source_boss_ref_unresolved' : 'source_npc_ref_unresolved'
      };
    }
    return {
      ...base,
      resolutionStatus: sourceRefType === 'boss' ? 'resolved_boss_ref' : 'resolved_npc_ref',
      resolvedRef,
      blockedReason: null
    };
  }

  return {
    ...base,
    resolutionStatus: 'blocked',
    resolvedRef: null,
    blockedReason: 'unsupported_source_ref_type'
  };
}

function dedupeSourcePlans(sourcePlans) {
  const deduped = new Map();
  for (const source of sourcePlans) {
    const key = JSON.stringify([
      source.sourceType,
      source.sourceRefType,
      source.sourceRefName,
      source.quantityText ?? null,
      source.chanceText ?? null,
      source.conditions ?? null
    ]);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, source);
      continue;
    }
    deduped.set(key, mergeSourcePlan(existing, source));
  }
  return reindexSourcePlans(dropCoveredCompositeNpcRows([...deduped.values()]));
}

function reindexSourcePlans(sourcePlans) {
  return sourcePlans.map((source, index) => ({
    ...source,
    sortOrder: index,
    landingRow: {
      ...source.landingRow,
      sortOrder: index
    }
  }));
}

function dropCoveredCompositeNpcRows(sourcePlans) {
  return sourcePlans.flatMap((source) => {
    const components = compositeNpcComponents(source);
    if (!components.length) return [source];

    const coveredRows = components.map((name) => sourcePlans.find((candidate) =>
      !candidate.blockedReason
      && candidate.sourceType === source.sourceType
      && candidate.sourceRefType === source.sourceRefType
      && candidate.sourceRefName === name
    ));
    if (coveredRows.some((row) => !row)) return [source];

    for (const row of coveredRows) {
      row.notes = mergeText(row.notes, source.notes);
      row.landingRow = {
        ...row.landingRow,
        notes: row.notes
      };
    }
    return [];
  });
}

function compositeNpcComponents(source) {
  if (
    source.sourceRefType !== 'npc'
    || source.blockedReason !== 'source_npc_ref_unresolved'
    || !/\s+and\s+/i.test(source.sourceRefName ?? '')
  ) {
    return [];
  }
  return String(source.sourceRefName)
    .split(/\s+and\s+/i)
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function mergeSourcePlan(primary, fallback) {
  const notes = mergeText(primary.notes, fallback.notes);
  return {
    ...primary,
    notes,
    landingRow: {
      ...primary.landingRow,
      notes
    }
  };
}

function mergeText(primary, fallback) {
  const first = normalizeText(primary);
  const second = normalizeText(fallback);
  if (!first) return second ?? null;
  if (!second || first === second) return first;
  return `${first} ${second}`;
}

function normalizeSourceRefNameForPlanning(sourceRefType, value) {
  const text = normalizeText(value);
  if (!text || !NPC_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) return text;
  const withoutNpcSuffix = text.replace(/\s+NPC\s+for$/i, '').trim();
  const duringMatch = withoutNpcSuffix.match(/^(.+?)\s+during\b.+\s+for(?:\b.*)?$/i);
  if (duringMatch) return duringMatch[1].trim();
  const withoutForTail = withoutNpcSuffix.replace(/\s+for(?:\b.*)?$/i, '').trim();
  return withoutForTail || text;
}

function validateSourceContract({ sourceType, sourceRefType, sourceRefName }) {
  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) return 'invalid_source_type';
  if (!ALLOWED_SOURCE_REF_TYPES.has(sourceRefType)) return 'invalid_source_ref_type';
  if (sourceType === 'unknown' || sourceRefType === 'unknown') return 'unknown_source_contract';
  if (
    sourceRefType === 'npc'
    && CONTAINER_LIKE_NPC_POLLUTION.test(sourceRefName ?? '')
    && !/\bMimic\b/i.test(sourceRefName ?? '')
  ) {
    return 'forbidden_npc_container_mapping';
  }
  return null;
}

function createImportPlanKey(candidate, source, sourceIndex) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      itemInternalName: candidate.itemInternalName ?? null,
      sourceType: source.sourceType ?? null,
      sourceRefType: source.sourceRefType ?? null,
      sourceRefName: source.sourceRefName ?? null,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      sourceIndex
    }))
    .digest('hex');
}

function loadEntityRecords(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload?.records)
    ? payload.records
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.npcs)
        ? payload.npcs
        : Array.isArray(payload)
          ? payload
          : [];
}

function buildEntityLookup(records, { includePlural = false } = {}) {
  const byKey = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    rememberEntity(byKey, record?.internalName ?? record?.internal_name, record);
  }
  for (const record of Array.isArray(records) ? records : []) {
    rememberEntity(byKey, record?.name, record);
    rememberEntity(byKey, record?.nameZh ?? record?.name_zh, record);
    if (includePlural && typeof record?.name === 'string' && !record.name.toLowerCase().endsWith('s')) {
      rememberEntity(byKey, `${record.name}s`, record);
    }
  }
  return byKey;
}

function rememberEntity(byKey, value, record) {
  const key = normalizeIdentity(value);
  if (!key || byKey.has(key)) {
    return;
  }
  byKey.set(key, record);
}

function resolveEntityRef(lookup, ...names) {
  for (const name of names) {
    const key = normalizeIdentity(name);
    if (!key) continue;
    const record = lookup.get(key);
    if (record) {
      return {
        status: 'resolved',
        id: record.id ?? record.sourceId ?? record.source_id ?? null,
        internalName: record.internalName ?? record.internal_name ?? null,
        name: record.name ?? null
      };
    }
  }
  return {
    status: 'unresolved',
    id: null,
    internalName: null,
    name: normalizeText(names.find((value) => normalizeText(value))) ?? null
  };
}

function countBy(values, keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isDirectRun(metaUrl) {
  return process.argv[1] && metaUrl === new URL(`file://${path.resolve(process.argv[1])}`).href;
}

if (isDirectRun(import.meta.url)) {
  try {
    const options = parseBuildItemSourceCandidateImportPlanArgs();
    const outputPath = options.outputPath;
    const bundleRoot = options.bundleRoot;
    const plan = buildItemSourceCandidateImportPlan(options);
    if (outputPath) {
      writeJson(path.resolve(process.cwd(), outputPath), plan);
    }
    if (bundleRoot) {
      writeJson(
        path.resolve(process.cwd(), bundleRoot, 'normalized', 'item-relations.bundle.json'),
        buildItemSourceCandidateBundle(plan)
      );
    }
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
