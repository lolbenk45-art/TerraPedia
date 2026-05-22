#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import {
  fetchWikiApiJson,
  parseCliArgs
} from '../lib/wiki-item-utils.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const API_URL = 'https://terraria.wiki.gg/api.php';
const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_WIKI_SYNC_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

let progressPath = null;
let progressActionId = 'biomes-refresh';
let progressStartedAt = null;

const sectionTitleOverrides = new Map([
  ['Underworld', ['The Underworld']],
  ['The Hallow', ['The Hallow']],
  ['Corruption and Crimson', ['The Corruption', 'The Crimson']],
  ['Corrupted, Crimson, and Hallowed Desert', ['Corrupted Desert', 'Crimson Desert', 'Hallowed Desert']],
  ['Corrupted, Crimson, and Hallowed Ice', ['Corrupted Ice', 'Crimson Ice', 'Hallowed Ice']],
  ['Underground Mushroom', ['Glowing Mushroom biome']],
]);

const derivedVariantDefinitions = new Map([
  ['Corrupted Ice', {
    displayName: 'Corrupted Ice',
    baseBiomeTitle: 'Ice biome',
    infectionSourceTitle: 'The Corruption',
    variantType: 'infected',
  }],
  ['Crimson Ice', {
    displayName: 'Crimson Ice',
    baseBiomeTitle: 'Ice biome',
    infectionSourceTitle: 'The Crimson',
    variantType: 'infected',
  }],
  ['Hallowed Ice', {
    displayName: 'Hallowed Ice',
    baseBiomeTitle: 'Ice biome',
    infectionSourceTitle: 'The Hallow',
    variantType: 'infected',
  }],
  ['Corrupted Desert', {
    displayName: 'Corrupted Desert',
    baseBiomeTitle: 'Desert',
    infectionSourceTitle: 'The Corruption',
    variantType: 'infected',
  }],
  ['Crimson Desert', {
    displayName: 'Crimson Desert',
    baseBiomeTitle: 'Desert',
    infectionSourceTitle: 'The Crimson',
    variantType: 'infected',
  }],
  ['Hallowed Desert', {
    displayName: 'Hallowed Desert',
    baseBiomeTitle: 'Desert',
    infectionSourceTitle: 'The Hallow',
    variantType: 'infected',
  }],
]);

const skipTopLevelGroups = new Set([
  'Notes',
  'Trivia',
  'History',
  'References',
  'Hybrid biomes',
  'Biome existence requirements',
  'Removed biomes',
  'Other biomes',
]);

const containerOnlyTopLevelGroups = new Set([
  'Surface and Underground',
  'Hardmode',
  'Mini-biomes',
  'Micro-biomes',
  'Treasure rooms',
  'Cavern',
]);

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  const outputJsonPath = path.resolve(process.cwd(), options['output-json'] ?? path.join(repoRoot, 'data', 'generated', 'wiki-biomes.latest.json'));
  const outputMdPath = path.resolve(process.cwd(), options['report-md'] ?? path.join(repoRoot, 'reports', `wiki-biomes-summary-${dateTag}.md`));
  progressPath = path.resolve(process.cwd(), options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_WIKI_SYNC_PROGRESS_PATH);
  progressActionId = process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? 'biomes-refresh';
  progressStartedAt = generatedAt;

  writeBiomeFetchProgress({
    status: 'running',
    phase: 'overview',
    message: 'fetching Biomes overview metadata',
    current: 0,
    total: 0
  });

  const overview = await fetchPageRevision('Biomes');
  const overviewRendered = await fetchRenderedHtml('Biomes');
  const overviewSections = await fetchPageSections('Biomes');
  const discoveredBiomes = applyOverviewSectionLinks(discoverBiomeTargets(overviewSections), overviewRendered);
  const records = [];
  const derivedRecords = [];
  const unresolved = [];

  writeBiomeFetchProgress({
    status: 'running',
    phase: 'discover',
    message: `discovered ${discoveredBiomes.length} biome target(s)`,
    current: 0,
    total: discoveredBiomes.length
  });

  for (let index = 0; index < discoveredBiomes.length; index += 1) {
    const entry = discoveredBiomes[index];
    const current = index + 1;
    const derivedDefinition = derivedVariantDefinitions.get(entry.pageTitle);
    if (derivedDefinition) {
      derivedRecords.push({
        topGroup: entry.topGroup,
        sectionGroup: entry.sectionGroup,
        requestedTitle: entry.pageTitle,
        displayName: derivedDefinition.displayName,
        sourceType: 'derived_from_biomes_section',
        variantType: derivedDefinition.variantType,
        baseBiomeTitle: derivedDefinition.baseBiomeTitle,
        infectionSourceTitle: derivedDefinition.infectionSourceTitle,
        sourcePageTitle: 'Biomes',
        sourceSectionTitle: entry.sectionGroup ?? entry.topGroup,
        sourceSectionAnchor: entry.sectionAnchor,
        sourceSectionIndex: entry.sectionIndex,
        sourceRevisionTimestamp: overview.revisionTimestamp,
        aliases: [derivedDefinition.displayName],
      });
      writeBiomeFetchProgress({
        status: 'running',
        phase: 'fetch',
        message: `recorded derived biome ${current}/${discoveredBiomes.length}: ${entry.pageTitle}`,
        current,
        total: discoveredBiomes.length
      });
      continue;
    }
    try {
      const page = await fetchPageRevision(entry.fetchPageTitle ?? entry.pageTitle);
      if (shouldUseOverviewSectionRecord(entry, page.title)) {
        records.push(buildOverviewSectionRecord(entry, overview, overviewRendered));
      } else {
        const rendered = await fetchRenderedHtml(page.title);
        records.push({
          topGroup: entry.topGroup,
          sectionGroup: entry.sectionGroup,
          requestedTitle: entry.pageTitle,
          title: page.title,
          pageId: page.pageId,
          revisionId: page.revisionId,
          revisionTimestamp: page.revisionTimestamp,
          sourceUrl: `https://terraria.wiki.gg/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`,
          sourceSectionAnchor: entry.sectionAnchor,
          sourceSectionIndex: entry.sectionIndex,
          intro: extractIntro(rendered),
          iconUrl: extractRepresentativeImageUrl(rendered),
          aliases: buildAliases(entry.pageTitle, page.title),
        });
      }
    } catch (error) {
      if (isMissingWikiPageError(error) && canBuildOverviewSectionRecord(entry, overviewRendered)) {
        records.push(buildOverviewSectionRecord(entry, overview, overviewRendered));
        writeBiomeFetchProgress({
          status: 'running',
          phase: 'fetch',
          message: `fetched biome ${current}/${discoveredBiomes.length}: ${entry.pageTitle}`,
          current,
          total: discoveredBiomes.length
        });
        continue;
      }
      unresolved.push({
        topGroup: entry.topGroup,
        sectionGroup: entry.sectionGroup,
        requestedTitle: entry.pageTitle,
        error: String(error),
      });
    }
    writeBiomeFetchProgress({
      status: 'running',
      phase: 'fetch',
      message: `fetched biome ${current}/${discoveredBiomes.length}: ${entry.pageTitle}`,
      current,
      total: discoveredBiomes.length
    });
  }

  const payload = {
    entity: 'wiki_biomes',
    generatedAt,
    schemaVersion: '1.0.0',
    sourceApi: API_URL,
    overview: {
      title: overview.title,
      pageId: overview.pageId,
      revisionId: overview.revisionId,
      revisionTimestamp: overview.revisionTimestamp,
      discoveredBiomeCount: records.length,
    },
    derivedRecords,
    unresolved,
    records,
  };

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(outputMdPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMdPath, buildMarkdown(payload, outputJsonPath), 'utf8');

  writeBiomeFetchProgress({
    status: unresolved.length > 0 ? 'failed' : 'completed',
    phase: 'write',
    message: `finished biome fetch; records=${records.length}; derived=${derivedRecords.length}; unresolved=${unresolved.length}`,
    current: discoveredBiomes.length,
    total: discoveredBiomes.length,
    outputPath: outputJsonPath,
    reportPath: outputMdPath
  });

  console.log(JSON.stringify({
    outputJsonPath,
    outputMdPath,
    discoveredBiomeCount: records.length,
    derivedBiomeCount: derivedRecords.length,
    unresolvedCount: unresolved.length,
    sample: records.slice(0, 8).map(record => ({
      topGroup: record.topGroup,
      title: record.title,
      revisionTimestamp: record.revisionTimestamp,
    })),
  }, null, 2));
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    writeBiomeFetchProgress({
      status: 'failed',
      phase: 'error',
      message: error?.message ?? String(error),
      current: 0,
      total: 0
    });
    process.exitCode = 1;
  });
}

async function fetchPageRevision(title) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'timestamp|ids|content');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const json = await fetchJson(url);
  const page = json?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  if (!page || page.missing) {
    throw new Error(`Wiki page not found: ${title}`);
  }
  return {
    title: page.title,
    pageId: page.pageid ?? null,
    revisionId: revision?.revid ?? null,
    revisionTimestamp: revision?.timestamp ?? null,
    content: String(revision?.content ?? ''),
  };
}

async function fetchPageSections(title) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title);
  url.searchParams.set('prop', 'sections');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const json = await fetchJson(url);
  return Array.isArray(json?.parse?.sections) ? json.parse.sections : [];
}

async function fetchRenderedHtml(title) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const json = await fetchJson(url);
  return String(json?.parse?.text ?? '');
}

function discoverBiomeTargets(sections) {
  const targets = [];
  let currentTopGroup = null;

  for (const section of sections) {
    const level = Number(section.level || 0);
    const line = clean(section.line);
    if (!line) continue;

    if (level === 2) {
      currentTopGroup = line;
      if (skipTopLevelGroups.has(line)) continue;
      const titles = sectionTitleOverrides.get(line) || [line];
      for (const title of titles) {
        if (!containerOnlyTopLevelGroups.has(title)) {
          targets.push({
            topGroup: line,
            sectionGroup: null,
            pageTitle: title,
            sectionAnchor: section.anchor ?? toWikiAnchor(line),
            sectionIndex: section.index ?? null,
            sectionLevel: level,
          });
        }
      }
      continue;
    }

    if (level === 3 && currentTopGroup && !skipTopLevelGroups.has(currentTopGroup)) {
      const titles = sectionTitleOverrides.get(line) || [line];
      for (const title of titles) {
        targets.push({
          topGroup: currentTopGroup,
          sectionGroup: line,
          pageTitle: title,
          sectionAnchor: section.anchor ?? toWikiAnchor(line),
          sectionIndex: section.index ?? null,
          sectionLevel: level,
        });
      }
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const target of targets) {
    const key = target.pageTitle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(target);
  }
  return deduped;
}

function applyOverviewSectionLinks(targets, overviewRendered) {
  return targets.map((target) => {
    if (!target?.sectionAnchor) return target;
    const sectionHtml = extractSectionHtml(overviewRendered, target.sectionAnchor, Number(target.sectionLevel || 3)) ?? '';
    const linkedPageTitle = extractPrimaryBiomePageTitle(sectionHtml, target.pageTitle);
    if (!linkedPageTitle || !isEquivalentBiomePageTitle(target.pageTitle, linkedPageTitle)) {
      return target;
    }
    return {
      ...target,
      pageTitle: target.pageTitle,
      fetchPageTitle: linkedPageTitle,
      overviewLinkedPageTitle: linkedPageTitle,
    };
  });
}

function isOverviewPageFallback(requestedTitle, resolvedTitle) {
  return normalizeTitle(resolvedTitle) === 'biomes' && normalizeTitle(requestedTitle) !== 'biomes';
}

function shouldUseOverviewSectionRecord(entry, resolvedTitle) {
  if (isOverviewPageFallback(entry.pageTitle, resolvedTitle)) return true;
  if (entry.overviewLinkedPageTitle) return false;
  if (isEquivalentBiomePageTitle(entry.pageTitle, resolvedTitle)) return false;
  if (!entry.sectionAnchor) return false;
  return true;
}

function isEquivalentBiomePageTitle(requestedTitle, resolvedTitle) {
  return normalizeBiomeLinkTitle(requestedTitle) === normalizeBiomeLinkTitle(resolvedTitle);
}

function buildOverviewSectionRecord(entry, overview, overviewRendered) {
  const sectionHtml = extractSectionHtml(overviewRendered, entry.sectionAnchor, Number(entry.sectionLevel || 3)) ?? '';
  return {
    topGroup: entry.topGroup,
    sectionGroup: entry.sectionGroup,
    requestedTitle: entry.pageTitle,
    title: entry.pageTitle,
    pageId: overview.pageId,
    revisionId: overview.revisionId,
    revisionTimestamp: overview.revisionTimestamp,
    sourceType: 'overview_section',
    sourcePageTitle: 'Biomes',
    sourceSectionTitle: entry.sectionGroup ?? entry.pageTitle,
    sourceSectionAnchor: entry.sectionAnchor,
    sourceSectionIndex: entry.sectionIndex,
    sourceUrl: buildOverviewSectionUrl(entry.sectionAnchor),
    intro: extractIntro(sectionHtml),
    iconUrl: extractRepresentativeImageUrl(sectionHtml),
    aliases: buildAliases(entry.pageTitle, entry.pageTitle),
  };
}

function canBuildOverviewSectionRecord(entry, overviewRendered) {
  return Boolean(entry.sectionAnchor && extractSectionHtml(overviewRendered, entry.sectionAnchor, Number(entry.sectionLevel || 3)));
}

function isMissingWikiPageError(error) {
  return String(error?.message ?? error).startsWith('Wiki page not found:');
}

function buildOverviewSectionUrl(anchor) {
  const suffix = anchor ? `#${encodeURIComponent(anchor)}` : '';
  return `https://terraria.wiki.gg/wiki/Biomes${suffix}`;
}

function extractSectionHtml(html, anchor, level = 3) {
  const source = String(html ?? '');
  if (!source || !anchor) return null;
  const escapedAnchor = escapeRegExp(anchor);
  const anchorPattern = new RegExp(`\\bid\\s*=\\s*(?:"${escapedAnchor}"|'${escapedAnchor}')`, 'i');
  const anchorMatch = anchorPattern.exec(source);
  if (!anchorMatch) return null;
  const headingStart = findHeadingStart(source, anchorMatch.index);
  if (headingStart === -1) return source.slice(anchorMatch.index);
  const headingEnd = source.indexOf('>', headingStart);
  const headingMatch = /^<h([1-6])\b/i.exec(source.slice(headingStart, headingEnd + 1));
  const currentLevel = Number(headingMatch?.[1] ?? level);
  const endIndex = findNextHeadingAtSameOrHigherLevel(source, headingEnd + 1, currentLevel);
  return source.slice(headingStart, endIndex === -1 ? source.length : endIndex);
}

function findHeadingStart(source, index) {
  for (let level = 1; level <= 6; level += 1) {
    const headingStart = source.lastIndexOf(`<h${level}`, index);
    if (headingStart !== -1) {
      const headingEnd = source.indexOf(`</h${level}>`, headingStart);
      if (headingEnd !== -1 && headingEnd >= index) {
        return headingStart;
      }
    }
  }
  return -1;
}

function findNextHeadingAtSameOrHigherLevel(source, startIndex, currentLevel) {
  const headingRegex = /<h([1-6])\b/gi;
  headingRegex.lastIndex = startIndex;
  let match = headingRegex.exec(source);
  while (match) {
    if (Number(match[1]) <= currentLevel) {
      return match.index;
    }
    match = headingRegex.exec(source);
  }
  return -1;
}

function extractIntro(html) {
  const parserOutput = extractBlockByClass(html, 'div', 'mw-parser-output') || html;
  const paragraphs = [...parserOutput.matchAll(/<p>([\s\S]*?)<\/p>/gi)]
    .map(match => clean(stripTags(match[1])))
    .filter(text => text && !text.startsWith('('));
  return paragraphs[0] ?? null;
}

function extractPrimaryBiomePageTitle(html, sectionTitle) {
  const source = String(html ?? '');
  const sectionTokens = buildTitleTokens(sectionTitle);
  const candidates = [];
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const href = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '');
    const title = extractAttribute(match[0], 'title') ?? '';
    const label = clean(stripTags(match[4] ?? ''));
    const pageTitle = extractWikiPageTitleFromHref(href, title);
    if (!pageTitle || isNonBiomePageTitle(pageTitle)) continue;
    const tokens = [
      ...buildTitleTokens(pageTitle),
      ...buildTitleTokens(title),
      ...buildTitleTokens(label),
    ];
    const matchesSection = sectionTokens.length > 0 && sectionTokens.some(token => tokens.includes(token));
    const explicitBiome = /\bbiome\b/i.test(`${pageTitle} ${title} ${label}`);
    if (!matchesSection && !explicitBiome) continue;
    const before = source.slice(Math.max(0, match.index - 500), match.index);
    const linkedImageScore = findLinkedImageScoreForPage(source, pageTitle);
    candidates.push({
      pageTitle,
      score: (explicitBiome ? 10 : 0)
        + (matchesSection ? 6 : 0)
        + (pageTitle.includes('(') ? 2 : 0)
        + linkedImageScore
        - (/Bestiary|navbox|biome-list/i.test(before) ? 20 : 0),
    });
  }
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.pageTitle ?? null;
}

function findLinkedImageScoreForPage(source, pageTitle) {
  const titleHref = `/wiki/${encodeURIComponent(String(pageTitle).replaceAll(' ', '_')).replaceAll('%28', '(').replaceAll('%29', ')')}`;
  const titlePattern = new RegExp(`href\\s*=\\s*(?:"${escapeRegExp(titleHref)}"|'${escapeRegExp(titleHref)}')`, 'i');
  let best = 0;
  for (const imgMatch of source.matchAll(/<img\b[^>]*>/gi)) {
    const before = source.slice(Math.max(0, imgMatch.index - 700), imgMatch.index);
    if (!titlePattern.test(before)) continue;
    const candidate = buildImageCandidate(source, imgMatch.index, imgMatch[0]);
    if (!candidate.url || !isValidBiomeImageUrl(candidate.url)) continue;
    best = Math.max(best, candidate.score > 0 ? 20 : 0);
  }
  return best;
}

function extractWikiPageTitleFromHref(href, title) {
  const text = String(href ?? '').trim();
  if (!text.startsWith('/wiki/')) return null;
  if (/[?&]action=edit\b/i.test(text)) return null;
  if (text.startsWith('/wiki/File:') || text.startsWith('/wiki/Category:') || text.includes(':')) return null;
  const rawTitle = text.slice('/wiki/'.length).split('#')[0].split('?')[0];
  if (!rawTitle) return null;
  return clean(decodeURIComponent(rawTitle).replaceAll('_', ' ')) || clean(title) || null;
}

function isNonBiomePageTitle(value) {
  return /^(?:File|Category|Template|Help|Special):/i.test(String(value ?? ''));
}

function buildTitleTokens(value) {
  const normalized = normalizeLooseTitle(value)
    .replace(/\([^)]*\)/g, '')
    .replace(/\bbiomes?\b/g, '')
    .replace(/\bcabins?\b/g, 'cabin')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
  const tokens = normalized ? normalized.split(/\s+/).filter(token => token.length > 2) : [];
  if (normalized) tokens.push(normalized.replace(/\s+/g, ''));
  return [...new Set(tokens)];
}

function extractRepresentativeImageUrl(html) {
  const parserOutput = extractBlockByClass(html, 'div', 'mw-parser-output') || html;
  const infobox = extractBlockByClass(parserOutput, 'table', 'infobox') || parserOutput;
  const candidates = [...infobox.matchAll(/<img\b[^>]*>/gi)]
    .map(match => buildImageCandidate(infobox, match.index, match[0]))
    .filter(candidate => candidate.url && isValidBiomeImageUrl(candidate.url))
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.url ?? null;
}

function buildImageCandidate(html, index, tag) {
  const url = extractImageUrlFromTag(tag);
  const alt = extractAttribute(tag, 'alt') ?? '';
  const width = Number(extractAttribute(tag, 'width') ?? 0);
  const height = Number(extractAttribute(tag, 'height') ?? 0);
  const before = html.slice(Math.max(0, index - 500), index);
  const after = html.slice(index, Math.min(html.length, index + 300));
  let score = 0;
  if (/BiomeBanner/i.test(url) || /BiomeBanner/i.test(alt)) score += 100;
  if (/class\s*=\s*["'][^"']*(?:floatright|floatnone|center|thumb|gallerybox|gallery)[^"']*["']/i.test(before)) score += 30;
  if (/\/wiki\/File:/i.test(before) || /class\s*=\s*["'][^"']*image[^"']*["']/i.test(before + after)) score += 16;
  if (width >= 160 || height >= 80) score += 24;
  if (width >= 250 || height >= 120) score += 16;
  if (width > 0 && height > 0 && width <= 64 && height <= 64) score -= 90;
  if (/message-box|noexcerpt|hat-note|dotlist|itemlist|navbox|infocard|recipes?|Unique Drops|Music/i.test(before)) score -= 45;
  if (isLikelyItemOrUiImage(url, alt)) score -= 80;
  score -= Math.floor(index / 10000);
  return { url, score };
}

function extractImageUrlFromTag(tag) {
  const src = extractAttribute(tag, 'src');
  const srcset = extractAttribute(tag, 'srcset');
  const rawUrl = src || srcset?.split(',')[0]?.trim().split(/\s+/)[0] || null;
  return normalizeWikiImageUrl(rawUrl);
}

function extractAttribute(tag, attributeName) {
  const regex = new RegExp(`\\b${escapeRegExp(attributeName)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = regex.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function normalizeWikiImageUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const withoutQuery = raw.split('#')[0].split('?')[0];
  if (withoutQuery.startsWith('//')) return `https:${withoutQuery}`;
  if (withoutQuery.startsWith('/')) return `https://terraria.wiki.gg${withoutQuery}`;
  return withoutQuery;
}

function isValidBiomeImageUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (!/\.(?:png|jpg|jpeg|webp|gif)$/i.test(text)) return false;
  return !/(?:Desktop_only|Console_only|Mobile_only|Old-gen_console_version|Nintendo_Switch_version|tModLoader|Journey_Mode|Classic_Mode|Expert_Mode|Master_Mode|Hardmode|Pre-Hardmode|Info_icon|Notice|Question|Achievement|Map_Icon|Bestiary|Icon_|Auto_icon|Stack_digit|Pickaxe_mask|Rarity_color)/i.test(text);
}

function isLikelyItemOrUiImage(url, alt) {
  const text = `${url ?? ''} ${alt ?? ''}`;
  return /(?:Paint_Roller|Music_Box|Otherworldly_Music_Box|Meteor_Head|Meteorite\.png|Ice_Chest|Torches?|Chests?|Potion|Pickaxe|Sword|Banner|Trophy|Mask|Icon|Bestiary)/i.test(text)
    && !/BiomeBanner/i.test(text)
    && !/(?:Cabin|Cave|Tree|Island|Pyramid|Shrine|House|Mosaic|Campsite|Temple|Meteorite_\(biome\))/i.test(text);
}

function buildAliases(requestedTitle, resolvedTitle) {
  const aliases = new Set([requestedTitle, resolvedTitle]);
  if (resolvedTitle === 'The Underworld') aliases.add('Underworld').add('Hell');
  if (resolvedTitle === 'The Hallow') aliases.add('Hallow');
  if (resolvedTitle === 'The Crimson') aliases.add('Crimson');
  if (resolvedTitle === 'The Corruption') aliases.add('Corruption');
  return [...aliases];
}

function buildMarkdown(payload, outputJsonPath) {
  const lines = [];
  lines.push('# Wiki 群系来源汇总');
  lines.push('');
  lines.push(`- 生成时间: \`${payload.generatedAt}\``);
  lines.push(`- 来源 API: \`${payload.sourceApi}\``);
  lines.push(`- 发现页: \`${payload.overview.title}\``);
  lines.push(`- 发现页修订时间: \`${payload.overview.revisionTimestamp}\``);
  lines.push(`- 抓取到的群系页数: \`${payload.records.length}\``);
  lines.push(`- 派生群系数: \`${payload.derivedRecords.length}\``);
  lines.push(`- 未解析页数: \`${payload.unresolved.length}\``);
  lines.push(`- JSON 输出: \`${path.relative(repoRoot, outputJsonPath).replaceAll('\\', '/')}\``);
  lines.push('');

  if (payload.derivedRecords.length > 0) {
    lines.push('## 派生群系');
    lines.push('');
    for (const record of payload.derivedRecords) {
      lines.push(`- ${record.displayName} | base: \`${record.baseBiomeTitle}\` | infection: \`${record.infectionSourceTitle}\` | 来源小节: \`${record.sourceSectionTitle}\``);
    }
    lines.push('');
  }

  if (payload.unresolved.length > 0) {
    lines.push('## 未解析页');
    lines.push('');
    for (const entry of payload.unresolved) {
      lines.push(`- ${entry.requestedTitle} | 分组: \`${entry.topGroup}\`${entry.sectionGroup ? ` | 小节: \`${entry.sectionGroup}\`` : ''}`);
    }
    lines.push('');
  }

  const grouped = new Map();
  for (const record of payload.records) {
    const groupKey = record.topGroup || 'Ungrouped';
    const bucket = grouped.get(groupKey) || [];
    bucket.push(record);
    grouped.set(groupKey, bucket);
  }

  for (const [group, records] of grouped.entries()) {
    lines.push(`## ${group}`);
    lines.push('');
    for (const record of records) {
      lines.push(`### ${record.title}`);
      lines.push('');
      lines.push(`- 上级分组: \`${record.topGroup}\``);
      if (record.sectionGroup) {
        lines.push(`- 来源小节: \`${record.sectionGroup}\``);
      }
      lines.push(`- 页面标题: \`${record.title}\``);
      lines.push(`- 修订时间: \`${record.revisionTimestamp ?? 'unknown'}\``);
      lines.push(`- 别名: ${record.aliases.map(alias => `\`${alias}\``).join('、')}`);
      lines.push(`- 页面链接: ${record.sourceUrl}`);
      if (record.intro) {
        lines.push(`- 摘要: ${record.intro}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function fetchJson(url) {
  return fetchWikiApiJson({
    url,
    profile: 'parse',
    sourceKey: 'Biomes'
  });
}

function writeBiomeFetchProgress({
  status,
  phase,
  message,
  current,
  total,
  outputPath = null,
  reportPath = null
} = {}) {
  if (!progressPath) {
    return;
  }
  const generatedAt = new Date().toISOString();
  const payload = buildActionProgressPayload({
    actionId: progressActionId,
    status,
    phase,
    message,
    current,
    total,
    startedAt: progressStartedAt,
    overallCurrent: current,
    overallTotal: total,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  });
  if (outputPath) {
    payload.outputPath = outputPath;
  }
  if (reportPath) {
    payload.reportPath = reportPath;
  }
  payload.queue = 'wiki biomes refresh';
  payload.dataStage = 'wiki biomes -> generated biome source';
  payload.nextStep = 'transform wiki-biomes.latest.json to importable biome data';
  writeJsonFile(progressPath, payload);
  if (path.resolve(progressPath) !== DEFAULT_WIKI_SYNC_PROGRESS_PATH) {
    writeJsonFile(DEFAULT_WIKI_SYNC_PROGRESS_PATH, {
      ...payload,
      childStatusPath: DEFAULT_WIKI_SYNC_PROGRESS_PATH
    });
  }
}

function extractBlockByClass(html, tagName, className) {
  const regex = new RegExp(`<${tagName}\\b[^>]*class="[^"]*${escapeRegExp(className)}[^"]*"[^>]*>`, 'i');
  const match = regex.exec(html);
  if (!match) return null;
  return extractTagBlock(html, tagName, match.index);
}

function extractTagBlock(html, tagName, startIndex) {
  let depth = 0;
  let index = startIndex;
  while (index < html.length) {
    const nextOpen = html.indexOf(`<${tagName}`, index);
    const nextClose = html.indexOf(`</${tagName}>`, index);
    if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
      depth += 1;
      index = html.indexOf('>', nextOpen);
      if (index === -1) break;
      index += 1;
      continue;
    }
    if (nextClose !== -1) {
      depth -= 1;
      index = nextClose + tagName.length + 3;
      if (depth === 0) {
        return html.slice(startIndex, index);
      }
      continue;
    }
    break;
  }
  return html.slice(startIndex);
}

function stripTags(html) {
  return decodeHtmlEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value) {
  return clean(value).toLowerCase();
}

function normalizeLooseTitle(value) {
  return normalizeTitle(value).replace(/^the\s+/, '');
}

function normalizeBiomeLinkTitle(value) {
  return normalizeLooseTitle(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bbiomes?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function toWikiAnchor(value) {
  return clean(value).replaceAll(' ', '_');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
