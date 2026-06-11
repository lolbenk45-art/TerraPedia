#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  extractDropSourcesFromHtml,
  extractIntroParagraphs,
  extractNarrativeSources,
  extractTypeRowSourcesFromHtml,
  extractVendorSourcesFromWikitext,
  normalizeText,
  parseRecipeTable
} from '../lib/wiki-page-utils.mjs';
import {
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline',
  'crawler',
  'fetch',
  'flyway',
  'delete'
]);

export function parseAuditRemainingSourceRawPageCandidatesArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only raw page candidate audit refuses mutation flag: --${key}`);
    }
  }
  return {
    closureReportPath: options.closure ?? options['closure-report'] ?? path.join(process.cwd(), 'data', 'reports', 'item-source-remaining-closure-2026-06-11-current.json'),
    rawItemPageDir: options['raw-dir'] ?? options.rawDir ?? '/home/lolben/data/terraPedia/raw/wiki/item-pages',
    npcParsedPath: options.npcs ?? sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
    standardizedNpcsPath: options['standardized-npcs'] ?? path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
    outputPath: options.output ?? null
  };
}

export function auditRemainingSourceRawPageCandidates({
  generatedAt = new Date().toISOString(),
  closureReportPath = path.join(process.cwd(), 'data', 'reports', 'item-source-remaining-closure-2026-06-11-current.json'),
  rawItemPageDir = '/home/lolben/data/terraPedia/raw/wiki/item-pages',
  npcLookup = null,
  npcParsedPath = sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
  standardizedNpcsPath = path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json')
} = {}) {
  const closureReport = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), closureReportPath), 'utf8'));
  const rows = Array.isArray(closureReport.rowsByLane?.needs_external_source_evidence)
    ? closureReport.rowsByLane.needs_external_source_evidence
    : [];
  npcLookup ??= loadNpcLookup(npcParsedPath, standardizedNpcsPath);

  const candidates = [];
  const rawPagesWithoutSources = [];
  const missingRawPages = [];
  const hardBlockedRows = [];

  for (const row of rows) {
    const rawResolution = findRawPageResolution(rawItemPageDir, row);
    if (!rawResolution.rawPath) {
      const missingRawPage = {
        ...toItemSummary(row),
        pageTitle: row.name ?? row.internalName,
        hardBlockLane: 'missing_raw_page',
        blockerReason: 'missing raw wiki page cache',
        specificBlockerReason: rawResolution.rejectedAliasReason ?? `missing raw wiki page cache for ${row.name ?? row.internalName}`,
        attemptedRawPath: expectedRawPagePath(rawItemPageDir, row.internalName),
        extractedSources: []
      };
      missingRawPages.push(missingRawPage);
      hardBlockedRows.push(missingRawPage);
      continue;
    }
    const rawPath = rawResolution.rawPath;
    const payload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const extractedSources = extractSourcesFromRawPayload(payload, npcLookup, row);
    const entry = {
      ...toItemSummary(row),
      rawPath,
      pageTitle: payload.pageTitle ?? null,
      sourceRevisionTimestamp: payload.revisionTimestamp ?? null,
      extractedSourceCount: extractedSources.length,
      extractedSources
    };
    if (extractedSources.length > 0) {
      candidates.push({
        ...entry,
        reviewLane: classifyCandidate(entry)
      });
    } else {
      const unresolvedEntry = {
        ...entry,
        unresolvedLane: classifyUnresolvedRawPage(entry, payload)
      };
      hardBlockedRows.push(toHardBlockedRawPage(unresolvedEntry, row, payload));
    }
  }

  const unresolvedLanes = Object.entries(countBy(rawPagesWithoutSources, (entry) => entry.unresolvedLane))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lane, count]) => ({
      lane,
      count,
      samples: rawPagesWithoutSources
        .filter((entry) => entry.unresolvedLane === lane)
        .slice(0, 20)
        .map(toUnresolvedSample)
    }));

  return {
    generatedAt,
    readOnly: true,
    entity: 'remaining_source_raw_page_candidates',
    inputs: {
      closureReportPath,
      rawItemPageDir,
      npcParsedPath,
      standardizedNpcsPath
    },
    summary: {
      totalRows: rows.length,
      rawPageFound: candidates.length + hardBlockedRows.filter((row) => row.hardBlockLane !== 'missing_raw_page').length + rawPagesWithoutSources.length,
      missingRawPage: missingRawPages.length,
      candidatesWithExtractedSources: candidates.length,
      candidateSourceRows: candidates.reduce((sum, candidate) => sum + candidate.extractedSourceCount, 0),
      hardBlockedRows: hardBlockedRows.length,
      rawPagesWithoutSources: rawPagesWithoutSources.length,
      unresolvedTotal: rawPagesWithoutSources.length,
      classificationCounts: countBy(candidates, (candidate) => classifyCandidate(candidate)),
      reviewLaneCounts: countBy(candidates, (candidate) => candidate.reviewLane),
      hardBlockLaneCounts: countBy(hardBlockedRows, (row) => row.hardBlockLane),
      unresolvedLaneCounts: {
        ...countBy(rawPagesWithoutSources, (entry) => entry.unresolvedLane)
      },
      sourceTypeCounts: countExtracted(candidates, (source) => source.sourceType),
      sourceRefTypeCounts: countExtracted(candidates, (source) => source.sourceRefType)
    },
    candidates,
    rawPagesWithoutSources,
    missingRawPages,
    hardBlockedRows,
    pageResolutionSummary: buildPageResolutionSummary(candidates, hardBlockedRows),
    unresolvedLanes
  };
}

function toHardBlockedRawPage(entry, row, payload) {
  const lane = hardBlockLaneForUnresolved(entry.unresolvedLane);
  const specificBlockerReason = specificHardBlockReasonForEntry(entry, row, payload, lane);
  return {
    itemId: entry.itemId,
    itemInternalName: entry.itemInternalName,
    internalName: entry.internalName,
    name: entry.name,
    categoryCode: entry.categoryCode,
    categoryName: entry.categoryName,
    pageTitle: entry.pageTitle,
    rawPath: entry.rawPath,
    sourceRevisionTimestamp: entry.sourceRevisionTimestamp ?? null,
    hardBlockLane: lane,
    blockerReason: hardBlockReasonForLane(lane),
    specificBlockerReason,
    priorUnresolvedLane: entry.unresolvedLane,
    extractedSources: []
  };
}

function hardBlockLaneForUnresolved(unresolvedLane) {
  if (unresolvedLane === 'source_taxonomy_extension_required') return 'requires_source_taxonomy_extension';
  if (unresolvedLane === 'family_page_recipe_table_unmatched') return 'requires_family_table_parser';
  if (unresolvedLane === 'exact_page_recipe_table_unmatched') return 'requires_page_specific_parser';
  if (unresolvedLane === 'family_or_shared_page_no_source_extracted') return 'requires_page_specific_parser';
  if (unresolvedLane === 'exact_page_no_source_extracted') return 'requires_page_specific_parser';
  return 'requires_page_specific_parser';
}

function hardBlockReasonForLane(lane) {
  if (lane === 'requires_family_table_parser') {
    return 'raw page has family/shared recipe table without safe item-specific source extraction';
  }
  if (lane === 'requires_source_taxonomy_extension') {
    return 'raw page source evidence uses an acquisition mechanism not represented by the current taxonomy';
  }
  return 'raw page exists but no supported source pattern was extracted';
}

export function runAuditRemainingSourceRawPageCandidates(options = {}) {
  const report = auditRemainingSourceRawPageCandidates(options);
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

function extractSourcesFromRawPayload(payload, npcLookup, row = null) {
  const introParagraphs = extractIntroParagraphs(payload.html);
  const targetAwareSources = extractTargetAwareSources(payload, row, npcLookup);
  return dedupeBy(
    preferSpecificSources([
      ...extractVendorSourcesFromWikitext(payload.wikitext),
      ...extractDropSourcesFromHtml(payload.html, npcLookup),
      ...extractTypeRowSourcesFromHtml(payload.html),
      ...filterNarrativeSourcesForTargetAwareOverlap(
        extractNarrativeSources(introParagraphs, payload.pageTitle),
        targetAwareSources
      ),
      ...targetAwareSources,
      ...extractExactRecipeSources(payload)
    ]).map((source) => ({
      sourceType: source.sourceType,
      sourceRefType: source.sourceRefType,
      sourceRefName: source.sourceRefName,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      notes: source.notes ?? null,
      sourceSectionTitle: source.sourceSectionTitle ?? null,
      sourceRowText: source.sourceRowText ?? null,
      sourceTargetItemName: source.sourceTargetItemName ?? null,
      matchedRecipeResultName: source.matchedRecipeResultName ?? null
    })),
    (source) => [
      source.sourceType,
      source.sourceRefType,
      source.sourceRefName,
      source.quantityText ?? '',
      source.chanceText ?? '',
      source.conditions ?? '',
      source.notes ?? '',
      source.sourceSectionTitle ?? '',
      source.sourceRowText ?? '',
      source.sourceTargetItemName ?? '',
      source.matchedRecipeResultName ?? ''
    ].join('|')
  );
}

function preferSpecificSources(sources) {
  const hasFishingJunkReplacement = sources.some((source) => (
    source.sourceType === 'unknown'
    && source.sourceRefType === 'world'
    && /fishing junk replacement/i.test(source.sourceRefName ?? '')
  ));
  const hasHardmodeBagExceptQueenSlime = sources.some((source) => (
    source.sourceType === 'treasure_bag'
    && source.sourceRefType === 'treasure_bag'
    && /except Queen Slime/i.test(source.sourceRefName ?? source.conditions ?? '')
  ));
  return sources.filter((source) => {
    if (hasFishingJunkReplacement && source.sourceType === 'fishing' && /fished up instead of a junk item/i.test(source.conditions ?? '')) {
      return false;
    }
    if (
      hasHardmodeBagExceptQueenSlime
      && source.sourceType === 'treasure_bag'
      && source.sourceRefType === 'treasure_bag'
      && /Treasure Bags dropped from Hardmode bosses/i.test(source.sourceRefName ?? '')
    ) {
      return false;
    }
    return true;
  });
}

function filterNarrativeSourcesForTargetAwareOverlap(narrativeSources, targetAwareSources) {
  const hasReviewedFishing = targetAwareSources.some((source) => source.sourceType === 'fishing');
  const hasReviewedCapture = targetAwareSources.some((source) => source.sourceType === 'capture');
  return narrativeSources.filter((source) => {
    if (hasReviewedFishing && source.sourceType === 'crate' && source.sourceRefType === 'world' && /\bfishing\b/i.test(source.sourceRefName ?? source.conditions ?? '')) {
      return false;
    }
    if (hasReviewedCapture && source.sourceType === 'unknown' && source.sourceRefType === 'world' && /\bBug Net\b/i.test(source.sourceRefName ?? source.conditions ?? '')) {
      return false;
    }
    return true;
  });
}

function extractTargetAwareSources(payload, row, npcLookup) {
  if (!row) return [];
  return [
    ...extractAnglerQuestFishSources(payload, row),
    ...extractMaskSources(payload, row, npcLookup),
    ...extractExpandedHtmlTargetRowSources(payload, row, npcLookup),
    ...extractReviewedFishingSources(payload, row),
    ...extractReviewedCaptureSources(payload, row),
    ...extractExactPageSpecificSources(payload, row),
    ...extractFamilyWikitextSources(payload, row, npcLookup)
  ];
}

function extractAnglerQuestFishSources(payload, row) {
  if (normalizeText(payload?.pageTitle) !== 'Angler/Quests') return [];
  const itemId = Number(row?.itemId);
  if (!Number.isFinite(itemId)) return [];
  const sources = [];
  for (const template of extractBalancedTemplates(String(payload?.wikitext ?? ''), ':Angler/Quests/row')) {
    const parts = splitTemplateArgs(template);
    if (Number(parts[1]) !== itemId) continue;
    const conditions = parts.slice(2).map(cleanWikiText).filter(Boolean).join('; ');
    sources.push({
      sourceType: 'unknown',
      sourceRefType: 'world',
      sourceRefName: 'Angler quest fish catch',
      sourceTargetItemName: row.name,
      sourceRowText: compactTemplateText(template),
      conditions: conditions ? `Caught for Angler quest: ${conditions}` : 'Caught for Angler quest'
    });
  }
  return sources;
}

function extractMaskSources(payload, row, npcLookup) {
  if (normalizeText(payload?.pageTitle) !== 'Masks') return [];
  const itemId = Number(row?.itemId);
  if (!Number.isFinite(itemId)) return [];
  const wikitext = String(payload?.wikitext ?? '');
  const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
  if (!template) return [];
  const link = cleanWikiText(template.match(/\|\s*link\s*=\s*([^|\n}]+)/i)?.[1]);
  if (!link) return [];
  const npcMeta = npcLookup?.get(link.toLowerCase()) ?? { boss: true };
  const genericChance = cleanWikiText(wikitext.match(/Each boss has a\s+\{\{chance\|([^}]+)\}\}/i)?.[1]);
  return [{
    sourceType: 'drop',
    sourceRefType: npcMeta.boss ? 'boss' : 'npc',
    sourceRefName: link,
    chanceText: genericChance || '1/7',
    conditions: firstMatchingSentence(payload, /Masks.+dropped by all non-.+bosses|Each boss has.+chance to drop its own mask/i),
    sourceRowText: compactTemplateText(template),
    sourceTargetItemName: row.name
  }];
}

function extractExactPageSpecificSources(payload, row) {
  const pageTitle = normalizeText(payload?.pageTitle);
  const itemName = normalizeText(row?.name);
  const sentences = extractSourceSentences(payload);
  const sources = [];

  if (pageTitle === 'Tombstones' && /Tombstone|Grave Marker|Headstone|Gravestone|Obelisk/i.test(itemName)) {
    const sentence = sentences.find((text) => /drops when a player.+dies/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'world',
        sourceRefName: 'player death',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Star' && /^(?:Star|Soul Cake|Sugar Plum)$/i.test(itemName)) {
    const sentence = sentences.find((text) => /Stars.+Soul Cakes.+Sugar Plums.+dropped by any enemy/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'npc_group',
        sourceRefName: 'any enemy',
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Heart' && /^(?:Heart|Candy Apple|Candy Cane)$/i.test(itemName)) {
    const sentence = sentences.find((text) => /Hearts.+Candy Apples.+Candy Canes.+dropped by slain enemies/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'npc_group',
        sourceRefName: 'slain enemies, pots, and slimes',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (/(?:Wall Skeleton|Hanging Skeleton|Catacomb)/i.test(itemName)) {
    const sentence = sentences.find((text) => /(?:obtained by looting|can be found).+Dungeon/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: 'Dungeon plunder',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Chippy\'s set' && itemName.startsWith('Chippy')) {
    const sentence = sentences.find((text) => /always dropped by.+Skeletron's Red Hat variant/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'boss_group',
        sourceRefName: "Skeletron's Red Hat variant",
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Wings' && itemName === 'Chippy\'s Cloak (Inactive)') {
    const sentence = sentences.find((text) => /inactive version of Chippy's Cloak is dropped by.+Skeletron's Red Hat variant/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'boss_group',
        sourceRefName: "Skeletron's Red Hat variant",
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Heroicis\' set' && itemName.startsWith('Heroicis')) {
    const sentence = sentences.find((text) => /obtained by throwing a Platinum Coin into water in an Oasis/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'Platinum Coin thrown into Oasis water',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  const anglerRewardSentence = pageTitle !== 'Angler/Quests'
    ? sentences.find((text) => (
      /\bAngler\b/i.test(text)
      && /\b(?:reward|rewarded|awarded|obtained|acquired|given|received|completing|finishing)\b/i.test(text)
      && /\b(?:fishing quest|quest|quests)\b/i.test(text)
    ))
    : null;
  if (anglerRewardSentence) {
    sources.push({
      sourceType: 'quest_reward',
      sourceRefType: 'npc',
      sourceRefName: 'Angler',
      chanceText: extractFirstChanceTextLocal(anglerRewardSentence),
      conditions: anglerRewardSentence,
      sourceTargetItemName: itemName
    });
  }

  const developerTreasureBagSentence = sentences.find((text) => (
    /Treasure Bags/i.test(text)
    && /Hardmode bosses|developer item|developer items/i.test(text)
    && /obtained|drop|chance/i.test(text)
  ));
  if (developerTreasureBagSentence) {
    sources.push({
      sourceType: 'treasure_bag',
      sourceRefType: 'treasure_bag',
      sourceRefName: 'Treasure Bags dropped from Hardmode bosses',
      chanceText: extractFirstChanceTextLocal(developerTreasureBagSentence),
      conditions: developerTreasureBagSentence,
      sourceTargetItemName: itemName
    });
  }

  if (/^Luminite (?:Axes|Chainsaws|Hammers)$/.test(pageTitle) && /(?:Vortex|Nebula|Solar Flare|Stardust)/i.test(itemName)) {
    const text = `${String(payload?.wikitext ?? '')} ${String(payload?.html ?? '')}`;
    if (/\bunobtainium\b|\bunobtainable\b/i.test(text)) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'unobtainable',
        conditions: cleanWikiText(firstMatchingSentence(payload, /unobtainable/i) ?? `${pageTitle} page marks ${itemName} as unobtainable`),
        sourceTargetItemName: itemName
      });
    }
  }

  const exactRules = [
    {
      pageTitle: 'Bone Block',
      pattern: /There is no way to obtain the block as an item/i,
      source: (sentence) => ({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'unobtainable as item',
        conditions: sentence
      })
    },
    {
      pageTitle: 'Cooked Marshmallow',
      pattern: /Cooked Marshmallow.+created by holding a Marshmallow on a Stick over a Campfire/i,
      source: (sentence) => ({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'Campfire cooking',
        conditions: sentence
      })
    },
    {
      pageTitle: 'Golden Bug Net',
      pattern: /Golden Bug Net.+chance.+obtained from the Angler.+fishing quests/i,
      source: (sentence) => ({
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: sentence
      })
    },
    {
      pageTitle: "Torch God's Favor",
      pattern: /Torch God's Favor.+obtained by surviving The Torch God.+at least 95 Torches/i,
      source: (sentence) => ({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'The Torch God event',
        conditions: sentence
      })
    },
    {
      pageTitle: 'Joja Cola',
      pattern: /Joja Cola.+chance.+fished up instead of a junk item when fishing/i,
      source: (sentence) => ({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'fishing junk replacement',
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: firstSentence(sentence)
      })
    },
    {
      pageTitle: 'Fuzzy Carrot',
      pattern: /Fuzzy Carrot.+obtained from the Angler.+5th.+fishing quest/i,
      source: (sentence) => ({
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        conditions: sentence
      })
    },
    {
      pageTitle: 'Bloody Machete',
      pattern: /Bloody Machete.+chance.+dropped by any weak enemy during the Halloween/i,
      source: (sentence) => ({
        sourceType: 'drop',
        sourceRefType: 'npc_group',
        sourceRefName: 'weak enemies during Halloween',
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: sentence
      })
    },
    {
      pageTitle: 'Joja Cola',
      pattern: /Joja Cola.+(?:fished up|junk item when fishing|fishing)/i,
      source: (sentence) => ({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'fishing junk replacement',
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: firstSentence(sentence)
      })
    },
    {
      pageTitle: "Abigail's Flower",
      pattern: /Abigail's Flower.+found as a plant growing on grass near a placed Tombstone/i,
      source: (sentence) => ({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: 'grass near a placed Tombstone',
        conditions: sentence
      })
    },
    {
      pageTitle: 'The Dirtiest Block',
      pattern: /Dirtiest Block.+found extremely rarely.+Dirt Blocks|world generation.+Dirt Blocks.+replaced with The Dirtiest Blocks/i,
      source: (sentence) => ({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: 'Dirt Block world generation',
        conditions: sentence
      })
    },
    {
      pageTitle: 'Lucky Clover',
      pattern: /Lucky Clover.+obtained from cutting tall grass|Lucky Clover.+drop from tall grass/i,
      source: (sentence) => ({
        sourceType: 'drop',
        sourceRefType: 'world',
        sourceRefName: 'tall grass',
        conditions: sentence
      })
    },
    {
      pageTitle: 'The Imploder',
      pattern: /Imploder.+unimplemented item|cannot be obtained or used through any means/i,
      source: (sentence) => ({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'unimplemented',
        conditions: sentence
      })
    }
  ];

  for (const rule of exactRules) {
    if (pageTitle !== rule.pageTitle) continue;
    const sentence = sentences.find((text) => rule.pattern.test(text));
    if (sentence) {
      sources.push({
        ...rule.source(sentence),
        sourceTargetItemName: itemName
      });
    }
  }

  const dyeSentence = sentences.find((text) => (
    /\bDye\b/i.test(itemName)
    && /Dye Trader/i.test(text)
    && /Strange Plant|random reward|special dye/i.test(text)
  ));
  if (dyeSentence) {
    sources.push({
      sourceType: 'quest_reward',
      sourceRefType: 'npc',
      sourceRefName: 'Dye Trader',
      conditions: dyeSentence,
      sourceTargetItemName: itemName
    });
  }

  if (pageTitle === 'Chillet' && /Chillet(?: Ignis)?/i.test(itemName)) {
    const sentence = sentences.find((text) => /Chillet and Chillet Ignis.+obtained from the Huge Dragon Egg.+50% chance/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'item',
        sourceRefName: 'Huge Dragon Egg',
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  const developerBagSentence = sentences.find((text) => (
    /obtained from any Hardmode boss'?s Treasure Bag/i.test(text)
    || /only obtainable through Hardmode Treasure Bags/i.test(text)
    || /Developer items.+obtained from Hardmode Treasure Bags.+except Queen Slime/i.test(text)
  ));
  if (developerBagSentence && /except Queen Slime/i.test(developerBagSentence)) {
    sources.push({
      sourceType: 'treasure_bag',
      sourceRefType: 'treasure_bag',
      sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)',
      conditions: developerBagSentence,
      sourceTargetItemName: itemName
    });
  }

  const targetTemplate = Number.isFinite(Number(row?.itemId))
    ? extractItemInfoboxTemplateByAuto(String(payload?.wikitext ?? ''), Number(row.itemId))
    : null;
  if (targetTemplate && /\btags\s*=[\s\S]*\bDeveloper\b[\s\S]*\bbag loot\b/i.test(targetTemplate)) {
    sources.push({
      sourceType: 'treasure_bag',
      sourceRefType: 'treasure_bag',
      sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)',
      conditions: 'Developer item infobox marks this item as Hardmode bag loot; Queen Slime is excluded by developer-item rules.',
      sourceRowText: compactTemplateText(targetTemplate),
      sourceTargetItemName: itemName
    });
  }

  if (targetTemplate && /\btags\s*=[\s\S]*\bunobtainable\b/i.test(targetTemplate)) {
    const sentence = sentences.find((text) => new RegExp(`${escapeRegex(itemName)}.+unobtainable|unobtainable.+${escapeRegex(itemName)}`, 'i').test(text))
      ?? sentences.find((text) => /\bunobtainable\b/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'unobtainable',
        conditions: sentence,
        sourceRowText: compactTemplateText(targetTemplate),
        sourceTargetItemName: itemName
      });
    }
  }

  const etherianManaSentence = sentences.find((text) => /Etherian Mana.+dropped by all of the event's enemies/i.test(text));
  if (pageTitle === 'Etherian Mana' && etherianManaSentence) {
    sources.push({
      sourceType: 'drop',
      sourceRefType: 'npc_group',
      sourceRefName: "Old One's Army enemies",
      conditions: etherianManaSentence,
      sourceTargetItemName: itemName
    });
  }

  if (pageTitle === 'Capricorn set' && itemName === 'Capricorn Hooves') {
    const sentence = sentences.find((text) => /switch from tail to legs and vice-versa/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'item',
        sourceRefName: 'Capricorn Tail',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Void Bag' && itemName === 'Closed Void Bag') {
    const sentence = sentences.find((text) => /Void Bag.+turns it into the Closed Void Bag/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'item',
        sourceRefName: 'Void Bag',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Guide to Peaceful Coexistence' && itemName === 'Guide to Peaceful Coexistence (Inactive)') {
    const sentence = sentences.find((text) => /toggle it between the Guide to Peaceful Coexistence and the Guide to Peaceful Coexistence \(Inactive\)/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'item',
        sourceRefName: 'Guide to Peaceful Coexistence',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  if (pageTitle === 'Shellphone' && /^Shellphone \((?:Spawn|Ocean|Underworld)\)$/i.test(itemName)) {
    const rows = extractHtmlRowsForItemId(payload?.html, Number(row?.itemId));
    const rowText = rows.map((rowHtml) => cleanWikiText(stripHtmlPreserve(rowHtml))).find((text) => /Right click to toggle destination/i.test(text));
    const sentence = sentences.find((text) => /Shellphone.+combines the functions of the Cell Phone.+Magic Conch.+Demon Conch/i.test(text));
    if (rowText && sentence) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'item',
        sourceRefName: 'Shellphone',
        conditions: `${sentence} ${rowText}`,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
    }
  }

  if (/unimplemented|cannot be obtained or used through any means/i.test(String(payload?.wikitext ?? '') + ' ' + String(payload?.html ?? ''))) {
    const sentence = sentences.find((text) => /unimplemented|cannot be obtained or used through any means/i.test(text));
    if (sentence) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'unimplemented',
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  const nebulaBoosterSentence = sentences.find((text) => /occasionally dropped when striking enemies while wearing a full set of Nebula armor/i.test(text));
  if (nebulaBoosterSentence) {
    sources.push({
      sourceType: 'drop',
      sourceRefType: 'npc_group',
      sourceRefName: 'enemies struck while wearing Nebula armor',
      conditions: nebulaBoosterSentence,
      sourceTargetItemName: itemName
    });
  }

  const crateSentences = [
    {
      pattern: /(?:Potted Lava Plants|They).+1\/2.+dropped when opening an Obsidian Crate or Hellstone Crate/i,
      sources: ['Obsidian Crate', 'Hellstone Crate']
    },
    {
      pattern: /Lava Serpent Bowl.+39\/200.+found inside Obsidian Crates and Hellstone Crates/i,
      sources: ['Obsidian Crate', 'Hellstone Crate']
    },
    {
      pattern: /(?:Moon Lord Legs|They).+1\/15.+found in Chests in Drunk or Zenith worlds/i,
      sources: ['Chest']
    }
  ];
  for (const rule of crateSentences) {
    const sentence = sentences.find((text) => rule.pattern.test(text));
    if (!sentence) continue;
    for (const sourceRefName of rule.sources) {
      sources.push({
        sourceType: sourceRefName === 'Chest' ? 'container' : 'crate',
        sourceRefType: sourceRefName === 'Chest' ? 'container' : 'crate',
        sourceRefName,
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: sentence,
        sourceTargetItemName: itemName
      });
    }
  }

  const stardropSentence = sentences.find((text) => /Stardrop.+obtained by .+purifying.+Joja Cola.+Dryad/i.test(text));
  if (stardropSentence) {
    sources.push({
      sourceType: 'unknown',
      sourceRefType: 'npc',
      sourceRefName: 'Dryad',
      conditions: stardropSentence,
      sourceTargetItemName: itemName
    });
  }

  const shimmerSentence = sentences.find((text) => (
    /obtained by throwing any type of fruit into Shimmer/i.test(text)
    || /throwing it into Shimmer, producing a new Gas Trap/i.test(text)
  ));
  if (shimmerSentence) {
    sources.push({
      sourceType: 'shimmer',
      sourceRefType: 'world',
      sourceRefName: 'Shimmer transmutation',
      conditions: shimmerSentence,
      sourceTargetItemName: itemName
    });
  }

  const palSpawnSentence = sentences.find((text) => new RegExp(`${escapeRegex(itemName)} has a rare chance to spawn`, 'i').test(text));
  if (palSpawnSentence) {
    sources.push({
      sourceType: 'capture',
      sourceRefType: 'world',
      sourceRefName: `${itemName} rescue encounter`,
      conditions: palSpawnSentence,
      sourceTargetItemName: itemName
    });
  }

  return sources;
}

function extractExpandedHtmlTargetRowSources(payload, row, npcLookup) {
  const itemId = Number(row?.itemId);
  const itemName = normalizeText(row?.name);
  if (!Number.isFinite(itemId) || !itemName) return [];
  const rows = extractHtmlRowsForItemId(payload?.html, itemId);
  const sources = [];
  for (const rowHtml of rows) {
    const rowText = cleanWikiText(stripHtmlPreserve(rowHtml));
    if (!rowText || !normalizeIdentity(rowText).includes(normalizeIdentity(itemName))) continue;
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]);
    const sourceCell = cells.find((cell) => /Dropped by|Treasure Bag|Sold by|Angler|Goodie Bag|Present|Fishing|fished|Found in|Crafted|Shimmer|Obtained by using|Pirate Invasion|Right click|toggle destination/i.test(stripHtmlPreserve(cell)));
    const sourceText = cleanWikiText(stripHtmlPreserve(sourceCell ?? rowHtml));
    const notesText = cleanWikiText(stripHtmlPreserve(cells.at(-1) ?? ''));
    const combinedText = cleanWikiText(`${sourceText} ${notesText} ${rowText}`);
    if (/Quest reward from Angler|Received as a quest reward from the Angler/i.test(combinedText)) {
      sources.push({
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        chanceText: extractFirstChanceTextLocal(combinedText),
        conditions: combinedText,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
      continue;
    }
    if (/Obtained by using a Minecart Upgrade Kit/i.test(combinedText)) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'item',
        sourceRefName: 'Minecart Upgrade Kit',
        conditions: combinedText,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
      continue;
    }
    if (pageTitleMatches(payload, 'Pylons') && /\b\d+\s*GC\b|When below the surface|including the Underworld/i.test(combinedText)) {
      sources.push({
        sourceType: 'shop',
        sourceRefType: 'npc_group',
        sourceRefName: 'eligible NPC vendors selling pylons',
        conditions: combinedText,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
      continue;
    }
    if (pageTitleMatches(payload, 'Chests') && /Pirate Invasion/i.test(combinedText)) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'world',
        sourceRefName: 'Pirate Invasion',
        conditions: combinedText,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
      continue;
    }
    if (/Hardmode.+Treasure Bag.+except.+Queen Slime/i.test(sourceText)) {
      sources.push({
        sourceType: 'treasure_bag',
        sourceRefType: 'treasure_bag',
        sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)',
        conditions: sourceText,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
      continue;
    }
    const droppedBy = sourceCell?.match(/Dropped by\s*<a\b[^>]*title="([^"]+)"/i)?.[1];
    if (droppedBy) {
      const sourceRefName = cleanWikiText(droppedBy);
      const npcMeta = npcLookup?.get(sourceRefName.toLowerCase()) ?? null;
      sources.push({
        sourceType: 'drop',
        sourceRefType: npcMeta?.boss ? 'boss' : 'npc',
        sourceRefName,
        chanceText: extractFirstChanceTextLocal(`${sourceText} ${notesText}`),
        conditions: sourceText,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
      continue;
    }
    if (/Found in\b/i.test(sourceText)) {
      sources.push({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: sourceText.replace(/^.*?\bFound in\s+/i, '').replace(/[.。]\s*$/u, '') || `${itemName} worldgen`,
        conditions: sourceText,
        sourceRowText: rowText,
        sourceTargetItemName: itemName
      });
      continue;
    }
  }
  return sources;
}

function pageTitleMatches(payload, expected) {
  return normalizeText(payload?.pageTitle) === expected;
}

function extractFamilyWikitextSources(payload, row, npcLookup = new Map()) {
  const pageTitle = normalizeText(payload?.pageTitle);
  const itemId = Number(row?.itemId);
  const itemName = normalizeText(row?.name);
  if (!Number.isFinite(itemId) || !itemName) return [];
  const wikitext = String(payload?.wikitext ?? '');

  if (pageTitle === 'Banners (decorative)') {
    const banner = [...wikitext.matchAll(/\{\{banner\|([^|}]+)([\s\S]*?)\}\}/gi)]
      .map((match) => ({ name: cleanWikiText(match[1]), template: match[0], args: match[2] }))
      .find((bannerRow) => normalizeIdentity(bannerRow.name) === normalizeIdentity(itemName) && new RegExp(`\\bid\\s*=\\s*${itemId}\\b`).test(bannerRow.args) && /\btags\s*=\s*plunder\b/i.test(bannerRow.args));
    if (banner) {
      return [{
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: 'Banners (decorative) plunder',
        conditions: 'Decorative banner plunder row in Banners (decorative)',
        sourceRowText: compactTemplateText(banner.template),
        sourceTargetItemName: itemName
      }];
    }
  }

  if (pageTitle && isFurnitureFamilyPage(pageTitle)) {
    const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
    if (template && /\btags\s*=\s*plunder\b/i.test(template)) {
      return [{
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: `${pageTitle} plunder`,
        conditions: `${pageTitle} item infobox row marks ${itemName} as plunder`,
        sourceRowText: compactTemplateText(template),
        sourceTargetItemName: itemName
      }];
    }
  }

  if (pageTitle === 'Hooks') {
    const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
    const source = template ? cleanWikiText(extractTemplateParam(template, 'col:source')) : null;
    if (template && source) {
      const sourceRow = buildSourceFromWikitextSourceCell(source, template, itemName, npcLookup);
      if (sourceRow) return [sourceRow];
    }
  }

  if (pageTitle === 'Sponges' || pageTitle === 'Bottomless Buckets') {
    const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
    if (template && /\bAngler\b/i.test(template) && /\bquest\b/i.test(template)) {
      return [{
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        chanceText: extractFirstChanceTextLocal(cleanWikiText(template)),
        conditions: cleanWikiText(extractTemplateParam(template, 'col:source')) || cleanWikiText(template),
        sourceRowText: compactTemplateText(template),
        sourceTargetItemName: itemName
      }];
    }
  }

  if (pageTitle === 'Fishing poles') {
    const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
    const source = template ? cleanWikiText(extractTemplateParam(template, 'col:source')) : null;
    const notes = template ? cleanWikiText(extractTemplateParam(template, 'col:notes')) : null;
    if (template && /\bAngler\b/i.test(source ?? '') && /\breward\b/i.test(source ?? '')) {
      return [{
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        chanceText: extractFirstChanceTextLocal(source),
        conditions: source,
        sourceRowText: compactTemplateText(template),
        sourceTargetItemName: itemName
      }];
    }
    if (template && /\bOasis\b.+\bMirage Crates?\b/i.test(notes ?? '')) {
      return [
        {
          sourceType: 'crate',
          sourceRefType: 'crate',
          sourceRefName: 'Oasis Crate',
          chanceText: extractFirstChanceTextLocal(notes),
          conditions: notes,
          sourceRowText: compactTemplateText(template),
          sourceTargetItemName: itemName
        },
        {
          sourceType: 'crate',
          sourceRefType: 'crate',
          sourceRefName: 'Mirage Crate',
          chanceText: extractFirstChanceTextLocal(notes),
          conditions: notes,
          sourceRowText: compactTemplateText(template),
          sourceTargetItemName: itemName
        }
      ];
    }
  }

  if (pageTitle === 'Flares') {
    const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
    const source = template ? cleanWikiText(extractTemplateParam(template, 'col:source')) : null;
    if (template && /\bShimmer\b/i.test(source ?? '')) {
      return [{
        sourceType: 'shimmer',
        sourceRefType: 'world',
        sourceRefName: 'Shimmer transmutation',
        conditions: source,
        sourceRowText: compactTemplateText(template),
        sourceTargetItemName: itemName
      }];
    }
  }

  if (pageTitle === 'Pearls') {
    const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
    const chance = template ? cleanWikiText(extractTemplateParam(template, 'col:chance')) : null;
    const sentence = extractSourceSentences(payload).find((text) => /Pearls.+obtained from opening Oysters/i.test(text));
    if (template && sentence) {
      return [{
        sourceType: 'drop',
        sourceRefType: 'item',
        sourceRefName: 'Oyster',
        chanceText: chance ? extractFirstChanceTextLocal(chance) : extractFirstChanceTextLocal(sentence),
        conditions: sentence,
        sourceRowText: compactTemplateText(template),
        sourceTargetItemName: itemName
      }];
    }
  }

  if (pageTitle === 'Legacy:Biome Key Molds') {
    const biome = biomeForKeyMold(itemName);
    const sentence = extractSourceSentences(payload).find((text) => /enemy killed within an eligible biome.+chance of dropping a Biome Key Mold/i.test(text));
    if (biome && sentence) {
      return [{
        sourceType: 'drop',
        sourceRefType: 'npc_group',
        sourceRefName: `enemies in ${biome} biome`,
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: sentence,
        sourceTargetItemName: itemName
      }];
    }
  }

  return [];
}

function extractReviewedFishingSources(payload, row) {
  const itemId = Number(row?.itemId);
  const itemName = normalizeText(row?.name);
  if (!itemName) return [];
  const wikitext = String(payload?.wikitext ?? '');
  const template = Number.isFinite(itemId) ? extractItemInfoboxTemplateByAuto(wikitext, itemId) : null;
  const sourceCell = template ? cleanWikiText(extractTemplateParam(template, 'col:source')) : null;
  const sentences = extractSourceSentences(payload);
  const exactSentenceIndex = sentences.findIndex((text) => (
    isFishingAcquisitionText(text)
    && !isAnglerQuestRewardText(text)
    && (
      normalizeIdentity(text).includes(normalizeIdentity(itemName))
      || normalizeIdentity(payload?.pageTitle) === normalizeIdentity(itemName)
      || (template && /\bfishing\b/i.test(sourceCell ?? ''))
    )
  ));
  const exactSentence = exactSentenceIndex >= 0 ? mergeFollowingChanceSentence(sentences, exactSentenceIndex) : null;
  const sourceText = sourceCell && /\bfishing\b/i.test(sourceCell) && !isAnglerQuestRewardText(sourceCell) ? sourceCell : exactSentence;
  if (!sourceText) {
    const tagsSource = buildFishingSourceFromInfoboxTags(payload, row, template, itemName);
    return tagsSource ? [tagsSource] : [];
  }
  return [{
    sourceType: 'fishing',
    sourceRefType: 'world',
    sourceRefName: /\blava\b/i.test(sourceText) ? 'Lava fishing' : 'Fishing',
    chanceText: extractFirstChanceTextLocal(sourceText),
    conditions: sourceText,
    sourceRowText: template ? compactTemplateText(template) : null,
    sourceTargetItemName: itemName
  }];
}

function buildFishingSourceFromInfoboxTags(payload, row, template, itemName) {
  if (!template || !/\btags\s*=[\s\S]*\bfished\b/i.test(template)) return null;
  const pageTitle = normalizeText(payload?.pageTitle);
  const sentences = extractSourceSentences(payload);
  if (pageTitle === 'Junk') {
    const sentence = sentences.find((text) => /\bJunk items are fished instead of regular fishing catches\b/i.test(text));
    if (sentence) {
      return {
        sourceType: 'fishing',
        sourceRefType: 'world',
        sourceRefName: 'Fishing junk catch',
        conditions: sentence,
        sourceRowText: compactTemplateText(template),
        sourceTargetItemName: itemName
      };
    }
  }
  const itemId = Number(row?.itemId);
  if (Number.isFinite(itemId) && /auto\s*=\s*\d+/i.test(template)) {
    const sentence = sentences.find((text) => isFishingAcquisitionText(text) && normalizeIdentity(text).includes(normalizeIdentity(itemName)));
    if (sentence) {
      return {
        sourceType: 'fishing',
        sourceRefType: 'world',
        sourceRefName: /\blava\b/i.test(sentence) ? 'Lava fishing' : 'Fishing',
        chanceText: extractFirstChanceTextLocal(sentence),
        conditions: sentence,
        sourceRowText: compactTemplateText(template),
        sourceTargetItemName: itemName
      };
    }
  }
  return null;
}

function isFishingAcquisitionText(text) {
  return /\b(?:fished|fishing|caught from fishing|caught by fishing|obtained via fishing|obtained by fishing)\b/i.test(text);
}

function isAnglerQuestRewardText(text) {
  return /\bAngler\b/i.test(text) && /\bquests?\b/i.test(text) && /\b(?:reward|obtained|received|completing)\b/i.test(text);
}

function mergeFollowingChanceSentence(sentences, index) {
  const sentence = sentences[index] ?? null;
  const next = sentences[index + 1] ?? null;
  if (sentence && next && /\bchance\b/i.test(next) && extractFirstChanceTextLocal(next)) {
    return `${sentence} ${next}`;
  }
  return sentence;
}

function extractReviewedCaptureSources(payload, row) {
  const itemName = normalizeText(row?.name);
  if (!itemName) return [];
  const sentences = extractSourceSentences(payload);
  const captureSentenceIndex = sentences.findIndex((text) => (
    /\bcaught with (?:a |any |the )?(?:Bug Net|Lavaproof Bug Net|Golden Bug Net)\b/i.test(text)
    || /\bcan only be caught with (?:the )?(?:Lavaproof Bug Net|Golden Bug Net)/i.test(text)
  ));
  const captureSentence = captureSentenceIndex >= 0 ? sentences[captureSentenceIndex] : null;
  if (!captureSentence) return [];
  const previous = sentences[captureSentenceIndex - 1] ?? null;
  const conditions = previous && /\b(?:spawn|spawns|found|Forests?|Underworld|daytime|night|Ash|grass)\b/i.test(previous)
    ? `${previous} ${captureSentence}`
    : captureSentence;
  const sourceRefName = /\bLavaproof Bug Net\b|\bGolden Bug Net\b/i.test(captureSentence)
    ? 'Lavaproof or Golden Bug Net capture'
    : 'Bug Net capture';
  return [{
    sourceType: 'capture',
    sourceRefType: 'world',
    sourceRefName,
    conditions,
    sourceTargetItemName: itemName
  }];
}

function buildSourceFromWikitextSourceCell(source, template, itemName, npcLookup = new Map()) {
  const sourceText = cleanWikiText(source);
  if (!sourceText) return null;
  if (/\bAngler\b/i.test(sourceText)) {
    return {
      sourceType: 'quest_reward',
      sourceRefType: 'npc',
      sourceRefName: 'Angler',
      chanceText: extractFirstChanceTextLocal(sourceText),
      conditions: sourceText,
      sourceRowText: compactTemplateText(template),
      sourceTargetItemName: itemName
    };
  }
  if (/\bPresent\b/i.test(sourceText)) {
    return {
      sourceType: 'drop',
      sourceRefType: 'item',
      sourceRefName: 'Present',
      chanceText: extractFirstChanceTextLocal(sourceText),
      conditions: sourceText,
      sourceRowText: compactTemplateText(template),
      sourceTargetItemName: itemName
    };
  }
  if (/\bGoodie Bag\b/i.test(sourceText)) {
    return {
      sourceType: 'drop',
      sourceRefType: 'item',
      sourceRefName: 'Goodie Bag',
      chanceText: extractFirstChanceTextLocal(sourceText),
      conditions: sourceText,
      sourceRowText: compactTemplateText(template),
      sourceTargetItemName: itemName
    };
  }
  const linkedLike = sourceText.match(/^([A-Z][A-Za-z' ]+?)(?:\s+\(|\s+\d|$)/)?.[1]?.trim();
  if (linkedLike && !/Crafted|Fishing|fished/i.test(linkedLike)) {
    const npcMeta = npcLookup?.get(linkedLike.toLowerCase()) ?? null;
    return {
      sourceType: 'drop',
      sourceRefType: npcMeta?.boss ? 'boss' : 'npc',
      sourceRefName: linkedLike,
      chanceText: extractFirstChanceTextLocal(sourceText),
      conditions: sourceText,
      sourceRowText: compactTemplateText(template),
      sourceTargetItemName: itemName
    };
  }
  return null;
}

function extractExactRecipeSources(payload) {
  const itemName = normalizeText(payload?.itemName);
  if (!itemName) return [];
  const recipes = parseRecipeTable(payload?.html);
  return recipes
    .filter((recipe) => normalizeRecipeResultName(recipe?.resultName) === normalizeRecipeResultName(itemName))
    .flatMap((recipe) => buildRecipeSourceRows(recipe));
}

function buildRecipeSourceRows(recipe) {
  const resultName = normalizeText(recipe?.resultName);
  if (!resultName || isUnsafeRecipeResultName(resultName)) {
    return [];
  }
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const resultQuantity = Number(recipe?.resultQuantity);
  const quantityText = Number.isFinite(resultQuantity) && resultQuantity > 0 ? String(resultQuantity) : '1';
  return ingredients
    .filter((ingredient) => normalizeText(ingredient?.ingredientName))
    .filter((ingredient) => normalizeText(ingredient?.ingredientGroupType) === 'item')
    .map((ingredient) => ({
      sourceType: 'craft',
      sourceRefType: 'item',
      sourceRefName: normalizeText(ingredient.ingredientName),
      quantityText,
      conditions: recipeConditionText(recipe),
      notes: recipeIngredientSummary(ingredients),
      matchedRecipeResultName: resultName
    }));
}

function recipeConditionText(recipe) {
  const stations = (Array.isArray(recipe?.stations) ? recipe.stations : [])
    .map((station) => normalizeText(station?.stationName ?? station?.stationNameRaw))
    .filter(Boolean);
  if (!stations.length || stations.every((station) => station === 'By Hand')) {
    return 'Crafted by hand';
  }
  return `Crafted at ${stations.join(' + ')}`;
}

function recipeIngredientSummary(ingredients) {
  const parts = ingredients
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

function isUnsafeRecipeResultName(value) {
  const text = normalizeRecipeResultName(value);
  return !text
    || text === 'Item IDs'
    || /^(?:Desktop|Console|Mobile|Old-gen console|Nintendo 3DS)(?: version)?$/i.test(text);
}

function findRawPageResolution(rawItemPageDir, row) {
  const attempted = [];
  const rejected = [];
  const candidates = rawPageLookupNames(row);
  for (const candidate of candidates) {
    const rawPath = expectedRawPagePath(rawItemPageDir, candidate);
    attempted.push(rawPath);
    if (!fs.existsSync(rawPath)) continue;
    const isDirect = normalizeIdentity(candidate) === normalizeIdentity(row.internalName);
    if (isDirect) return { rawPath, attempted };
    const payload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    if (payloadProvesRowIdentity(payload, row)) return { rawPath, attempted };
    rejected.push({ rawPath, pageTitle: payload.pageTitle ?? null });
  }
  const rejectedAlias = rejected[0];
  return {
    rawPath: null,
    attempted,
    rejectedAliasReason: rejectedAlias
      ? `alias raw page ${rejectedAlias.pageTitle ?? path.basename(rejectedAlias.rawPath)} does not prove identity for ${row.name ?? row.internalName}`
      : null
  };
}

function rawPageLookupNames(row) {
  const names = [
    row.internalName,
    row.name,
    stripParenthetical(row.name),
    stripPunctuation(row.name)
  ].filter(Boolean);
  return [...new Set(names)];
}

function payloadProvesRowIdentity(payload, row) {
  const rowName = normalizeIdentity(row?.name);
  const rowInternalName = normalizeIdentity(row?.internalName);
  const payloadInternalName = normalizeIdentity(payload?.itemInternalName);
  const payloadItemName = normalizeIdentity(payload?.itemName);
  const payloadPageTitle = normalizeIdentity(payload?.pageTitle);
  if (rowInternalName && payloadInternalName === rowInternalName) return true;
  if (rowName && payloadItemName === rowName) return true;
  if (rowName && payloadPageTitle === rowName) return true;
  const itemId = Number(row?.itemId);
  if (Number.isFinite(itemId) && new RegExp(`\\bauto\\s*=\\s*${itemId}\\b|\\bid\\s*=\\s*${itemId}\\b|\\|\\s*${itemId}\\b`).test(String(payload?.wikitext ?? ''))) {
    return true;
  }
  return false;
}

function findRawPagePath(rawItemPageDir, internalName) {
  const direct = expectedRawPagePath(rawItemPageDir, internalName);
  return fs.existsSync(direct) ? direct : null;
}

function expectedRawPagePath(rawItemPageDir, internalName) {
  return path.join(rawItemPageDir, `${normalizeIdentity(internalName)}.latest.json`);
}

function toItemSummary(row) {
  return {
    itemId: Number(row.itemId),
    itemInternalName: row.internalName,
    internalName: row.internalName,
    name: row.name,
    categoryCode: row.categoryCode ?? null,
    categoryName: row.categoryName ?? null
  };
}

function classifyCandidate(candidate) {
  if (candidate.extractedSources.some((source) => source.sourceRefType === 'unknown')) return 'needs_review_unknown_ref';
  if (
    candidate.extractedSources.some((source) => source.sourceType === 'craft' && source.matchedRecipeResultName)
    && candidate.pageTitle
    && candidate.name
    && normalizeIdentity(candidate.pageTitle) !== normalizeIdentity(candidate.name)
  ) {
    return 'family_recipe_exact_result_candidate';
  }
  if (candidate.pageTitle && candidate.name && normalizeIdentity(candidate.pageTitle) !== normalizeIdentity(candidate.name)) return 'family_or_shared_page_candidate';
  return 'direct_page_candidate';
}

function classifyUnresolvedRawPage(entry, payload) {
  const html = String(payload?.html ?? '');
  if (taxonomyExtensionReason(payload, entry)) {
    return 'source_taxonomy_extension_required';
  }
  if (entry.pageTitle && entry.name && normalizeIdentity(entry.pageTitle) !== normalizeIdentity(entry.name)) {
    if (/class="terraria cellborder recipes|<th[^>]*>\s*Result\s*<\/th>|<th[^>]*>\s*Ingredients\s*<\/th>/i.test(html)) {
      return 'family_page_recipe_table_unmatched';
    }
    return 'family_or_shared_page_no_source_extracted';
  }
  if (/class="terraria cellborder recipes|<th[^>]*>\s*Result\s*<\/th>|<th[^>]*>\s*Ingredients\s*<\/th>/i.test(html)) {
    return 'exact_page_recipe_table_unmatched';
  }
  return 'exact_page_no_source_extracted';
}

function specificHardBlockReasonForEntry(entry, row, payload, lane) {
  const pageTitle = normalizeText(entry.pageTitle) ?? row?.name ?? row?.internalName;
  const itemName = normalizeText(entry.name) ?? row?.name ?? row?.internalName;
  const target = `${itemName}`;
  const taxonomyReason = taxonomyExtensionReason(payload, row);
  if (taxonomyReason) {
    return taxonomyReason.reason;
  }
  if (lane === 'requires_source_taxonomy_extension') {
    return `${pageTitle} source for ${target} uses an unsupported source taxonomy`;
  }
  if (lane === 'requires_family_table_parser') {
    return `family/shared page ${pageTitle} has no supported target row parser for ${target}`;
  }
  return `exact page ${pageTitle} has no supported source pattern for ${target}`;
}

function taxonomyExtensionReason(payload, row) {
  const pageTitle = normalizeText(payload?.pageTitle);
  const itemName = normalizeText(row?.name);
  const itemId = Number(row?.itemId);
  const wikitext = String(payload?.wikitext ?? '');
  const text = extractSourceSentences(payload).join(' ');
  if (pageTitle === 'Butterflies' && /\bcaught with (?:a |any )?(?:Bug Net|Lavaproof Bug Net|Golden Bug Net)\b/i.test(text)) {
    return {
      lane: 'requires_source_taxonomy_extension',
      reason: `Butterflies source for ${itemName} is capture-only and current taxonomy has no capture source type`
    };
  }
  if (/\b(?:obtained via fishing|obtained by fishing|obtainable by fishing|can be fished|can be obtained via fishing|fished in|Fishing in)\b/i.test(text)) {
    return {
      lane: 'requires_source_taxonomy_extension',
      reason: `${pageTitle} source for ${itemName} is fishing-only and current taxonomy has no fishing source type`
    };
  }
  if (pageTitle === 'Junk' && /\bfished\b/i.test(text)) {
    return {
      lane: 'requires_source_taxonomy_extension',
      reason: `${pageTitle} source for ${itemName} is fishing-only and current taxonomy has no fishing source type`
    };
  }
  if ((pageTitle === 'Sponges' || pageTitle === 'Bottomless Buckets') && Number.isFinite(itemId)) {
    const template = extractItemInfoboxTemplateByAuto(wikitext, itemId);
    if (template && /\bFishing\b/i.test(template) && !/\bAngler\b/i.test(template)) {
      return {
        lane: 'requires_source_taxonomy_extension',
        reason: `${pageTitle} source for ${itemName} is fishing-only and current taxonomy has no fishing source type`
      };
    }
  }
  return null;
}

function toUnresolvedSample(entry) {
  return {
    itemId: entry.itemId,
    internalName: entry.internalName,
    name: entry.name,
    categoryCode: entry.categoryCode,
    pageTitle: entry.pageTitle,
    rawPath: entry.rawPath
  };
}

function buildPageResolutionSummary(candidates, hardBlockedRows) {
  const pages = new Map();
  const remember = (pageTitle, init = {}) => {
    const key = pageTitle ?? 'missing_raw_page';
    const current = pages.get(key) ?? {
      pageTitle: key,
      convertedToCandidate: 0,
      remainingHardBlocked: 0,
      hardBlockLanes: {},
      reviewLanes: {},
      reason: null,
      samples: []
    };
    pages.set(key, current);
    Object.assign(current, init);
    return current;
  };

  for (const candidate of candidates) {
    const page = remember(candidate.pageTitle ?? candidate.name ?? candidate.internalName);
    page.convertedToCandidate += 1;
    page.reviewLanes[candidate.reviewLane] = (page.reviewLanes[candidate.reviewLane] ?? 0) + 1;
    if (page.samples.length < 10) page.samples.push(toResolutionSample(candidate));
  }
  for (const row of hardBlockedRows) {
    const page = remember(row.pageTitle ?? row.name ?? row.internalName);
    page.remainingHardBlocked += 1;
    page.hardBlockLanes[row.hardBlockLane] = (page.hardBlockLanes[row.hardBlockLane] ?? 0) + 1;
    if (page.samples.length < 10) page.samples.push(toResolutionSample(row));
  }
  for (const page of pages.values()) {
    if (page.convertedToCandidate > 0 && page.remainingHardBlocked === 0) {
      page.reason = 'converted';
    } else if (page.remainingHardBlocked > 0) {
      page.reason = Object.entries(page.hardBlockLanes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'hard_blocked';
    } else {
      page.reason = 'no_rows';
    }
  }
  return [...pages.values()].sort((a, b) => {
    const countDiff = (b.convertedToCandidate + b.remainingHardBlocked) - (a.convertedToCandidate + a.remainingHardBlocked);
    return countDiff || a.pageTitle.localeCompare(b.pageTitle);
  });
}

function toResolutionSample(row) {
  return {
    itemId: row.itemId,
    internalName: row.internalName,
    name: row.name,
    lane: row.reviewLane ?? row.hardBlockLane ?? null,
    reason: row.specificBlockerReason ?? null
  };
}

function loadNpcLookup(filePath, fallbackFilePath) {
  const lookup = new Map();
  const resolvedFilePath = fs.existsSync(filePath) ? filePath : fallbackFilePath;
  if (!fs.existsSync(resolvedFilePath)) return lookup;
  const payload = JSON.parse(fs.readFileSync(resolvedFilePath, 'utf8'));
  const npcs = Array.isArray(payload?.npcs)
    ? payload.npcs
    : Array.isArray(payload?.records)
      ? payload.records
      : Array.isArray(payload)
        ? payload
        : [];
  for (const npc of npcs) {
    const meta = { boss: npc?.boss === true || npc?.boss === 1 || npc?.flags?.boss === true };
    rememberNpcLookupAlias(lookup, npc?.name, meta);
    rememberNpcLookupAlias(lookup, npc?.internalName ?? npc?.internal_name, meta);
    rememberNpcLookupAlias(lookup, normalizeImageFileTitleAlias(npc?.imageFileTitle ?? npc?.image_file_title), meta);
  }
  return lookup;
}

function rememberNpcLookupAlias(lookup, value, meta) {
  const text = String(value ?? '').trim();
  if (!text) return;
  lookup.set(text.toLowerCase(), meta);
  if (!text.toLowerCase().endsWith('s')) lookup.set(`${text}s`.toLowerCase(), meta);
}

function normalizeImageFileTitleAlias(value) {
  return String(value ?? '')
    .replace(/\.(?:gif|png|jpe?g|webp)$/i, '')
    .trim() || null;
}

function extractBalancedTemplates(wikitext, templateName) {
  const text = String(wikitext ?? '');
  const templates = [];
  const pattern = new RegExp(`\\{\\{\\s*${escapeRegex(templateName)}(?=\\s*(?:\\||\\}\\}))`, 'gi');
  for (const match of text.matchAll(pattern)) {
    let depth = 0;
    let index = match.index;
    for (; index < text.length - 1; index += 1) {
      const pair = text.slice(index, index + 2);
      if (pair === '{{') {
        depth += 1;
        index += 1;
        continue;
      }
      if (pair === '}}') {
        depth -= 1;
        index += 1;
        if (depth === 0) {
          templates.push(text.slice(match.index, index + 1));
          break;
        }
      }
    }
  }
  return templates;
}

function extractHtmlRowsForItemId(html, itemId) {
  const rows = [];
  for (const rowMatch of String(html ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    if (new RegExp(`Internal\\s*<a[^>]*>\\s*Item ID\\s*<\\/a>\\s*:\\s*${itemId}\\b|Internal\\s+Item ID\\s*:\\s*${itemId}\\b`, 'i').test(rowHtml)) {
      rows.push(rowHtml);
    }
  }
  return rows;
}

function splitTemplateArgs(template) {
  const inner = String(template ?? '').replace(/^\{\{/, '').replace(/\}\}$/, '');
  const args = [];
  let current = '';
  let depth = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const pair = inner.slice(index, index + 2);
    if (pair === '{{' || pair === '[[') {
      depth += 1;
      current += pair;
      index += 1;
      continue;
    }
    if ((pair === '}}' || pair === ']]') && depth > 0) {
      depth -= 1;
      current += pair;
      index += 1;
      continue;
    }
    if (inner[index] === '|' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += inner[index];
  }
  args.push(current.trim());
  return args;
}

function extractItemInfoboxTemplateByAuto(wikitext, itemId) {
  const templates = extractBalancedTemplates(wikitext, 'item infobox');
  const matches = templates.filter((template) => new RegExp(`\\|\\s*auto\\s*=\\s*${itemId}\\b`, 'i').test(template));
  return matches.find((template) => /\|\s*col:source\s*=/i.test(template))
    ?? matches.find((template) => /\|\s*tags\s*=/.test(template))
    ?? matches[0]
    ?? null;
}

function extractTemplateParam(template, paramName) {
  const parts = splitTemplateArgs(template);
  const pattern = new RegExp(`^\\s*${escapeRegex(paramName)}\\s*=\\s*([\\s\\S]*)$`, 'i');
  const found = parts.map((part) => part.match(pattern)?.[1]).find((value) => value != null);
  return found?.trim() ?? null;
}

function extractSourceSentences(payload) {
  const text = [
    ...extractIntroParagraphs(payload?.html),
    String(payload?.wikitext ?? '')
      .split(/\n{2,}/)
      .map(cleanWikiText)
      .filter(Boolean)
  ].flat().join(' ');
  return splitSentences(cleanWikiText(text));
}

function firstMatchingSentence(payload, pattern) {
  return extractSourceSentences(payload).find((sentence) => pattern.test(sentence)) ?? null;
}

function splitSentences(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const sentences = [];
  let current = '';
  for (const chunk of normalized.split(/(?<=\.)\s+/)) {
    current = current ? `${current} ${chunk}` : chunk;
    if (/[.!?]$/.test(chunk) || current.length > 300) {
      sentences.push(current.trim());
      current = '';
    }
  }
  if (current) sentences.push(current.trim());
  return sentences;
}

function firstSentence(text) {
  return splitSentences(text)[0] ?? normalizeText(text);
}

function cleanWikiText(value) {
  return normalizeText(String(value ?? '')
    .replace(/\{\{chance\|([^}|]+)(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{item\|([^}|]+)(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{eil\|([^}|]+)(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<!--[\s\S]*?-->/g, ''));
}

function stripHtmlPreserve(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#8201;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTemplateText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim() || null;
}

function extractFirstChanceTextLocal(text) {
  const chanceTemplate = String(text ?? '').match(/\{\{chance\|([^}|]+)(?:\|[^}]*)?\}\}/i)?.[1];
  if (chanceTemplate) return cleanWikiText(chanceTemplate);
  return normalizeText(String(text ?? '').match(/\d+\s*\/\s*\d+\s*\(\s*\d+(?:\.\d+)?%\s*\)|\d+\s*\/\s*\d+|\d+(?:\.\d+)?%/i)?.[0]) ?? null;
}

function isFurnitureFamilyPage(pageTitle) {
  return new Set([
    'Bathtubs',
    'Beds',
    'Candelabras',
    'Candles',
    'Chairs',
    'Chandeliers',
    'Doors',
    'Dressers',
    'Lamps',
    'Lanterns',
    'Sofas'
  ]).has(pageTitle);
}

function biomeForKeyMold(itemName) {
  const normalized = normalizeText(itemName) ?? '';
  if (/Jungle/i.test(normalized)) return 'Jungle';
  if (/Corruption/i.test(normalized)) return 'Corruption';
  if (/Crimson/i.test(normalized)) return 'Crimson';
  if (/Hallowed/i.test(normalized)) return 'Hallow';
  if (/Frozen/i.test(normalized)) return 'Snow';
  return null;
}

function stripParenthetical(value) {
  return normalizeText(value)?.replace(/\s*\([^)]*\)\s*$/g, '').trim() ?? null;
}

function stripPunctuation(value) {
  return normalizeText(value)?.replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() ?? null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countBy(values, keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countExtracted(candidates, keySelector) {
  const counts = {};
  for (const candidate of candidates) {
    for (const source of candidate.extractedSources) {
      const key = keySelector(source) ?? 'unknown';
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function dedupeBy(values, keySelector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keySelector(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runAuditRemainingSourceRawPageCandidates(parseAuditRemainingSourceRawPageCandidatesArgs());
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
