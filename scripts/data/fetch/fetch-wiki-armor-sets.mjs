#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  fetchWikiPagePayload,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_ZH_WIKI_API_URL = 'https://terraria.wiki.gg/zh/api.php';
const DEFAULT_ARMOR_PAGE_TITLE = '盔甲';

const WIKI_SECTIONS = [
  {
    code: 'pre-hardmode',
    compositionKind: 'traditional_set',
    wikiStart: '== [[{{tr|Pre-Hardmode}}]] ==',
    wikiEnd: '== [[{{tr|Hardmode}}]] ==',
    htmlHeadings: ['困难模式之前']
  },
  {
    code: 'hardmode',
    compositionKind: 'traditional_set',
    wikiStart: '== [[{{tr|Hardmode}}]] ==',
    wikiEnd: ['=== [[{{tr|Wizard set}}]] ===', '== [[{{tr|Wizard set}}]] =='],
    htmlHeadings: ['困难模式']
  },
  {
    code: 'wizard-set',
    compositionKind: 'single_piece_set',
    wikiStart: ['=== [[{{tr|Wizard set}}]] ===', '== [[{{tr|Wizard set}}]] =='],
    wikiEnd: ['== 其他盔甲 ==', '== Other armor =='],
    htmlHeadings: ['巫师套装']
  },
  {
    code: 'other-armor',
    compositionKind: 'nonstandard_piece_set',
    wikiStart: ['== 其他盔甲 ==', '== Other armor =='],
    wikiEnd: ['== 成就 ==', '== Vanity items =='],
    htmlHeadings: ['其他盔甲', 'Other armor']
  }
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(value) {
  return decodeHtmlEntities(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function getTagAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return decodeHtmlEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? '');
}

function splitHtmlRows(sectionHtml) {
  return [...String(sectionHtml ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => match[1])
    .filter((row) => /<td\b/i.test(row));
}

function splitHtmlCells(rowHtml) {
  return [...String(rowHtml ?? '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => match[1]);
}

function headingText(headingHtml) {
  return htmlToText(headingHtml).replace(/\s*\[\s*编辑\s*\]\s*$/u, '').trim();
}

function extractHtmlSection(html, heading) {
  const matches = [...String(html ?? '').matchAll(/<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi)];
  const start = matches.find((match) => headingText(match[0]) === heading);
  if (!start) {
    return '';
  }
  const startIndex = start.index + start[0].length;
  const end = matches.find((match) => match.index > start.index);
  return String(html).slice(startIndex, end ? end.index : undefined);
}

function extractHtmlSectionByHeadings(html, headings) {
  for (const heading of headings) {
    const sectionHtml = extractHtmlSection(html, heading);
    if (sectionHtml) {
      return sectionHtml;
    }
  }
  return '';
}

function classifyAppearanceImageRole(entry, seenRoles) {
  const title = String(entry.fileTitle ?? entry.alt ?? '').toLowerCase();
  if (title.includes('female')) return 'female';
  if (!seenRoles.has('male')) return 'male';
  if (title.includes('demo')) return 'demo';
  return 'other';
}

function extractHtmlImages(cellHtml) {
  const images = [];
  const seenRoles = new Set();
  for (const match of String(cellHtml ?? '').matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = getTagAttribute(tag, 'src');
    const alt = getTagAttribute(tag, 'alt');
    if (!src) {
      continue;
    }
    const entry = {
      fileTitle: alt,
      url: src,
      width: Number(getTagAttribute(tag, 'width')) || null,
      height: Number(getTagAttribute(tag, 'height')) || null
    };
    const role = classifyAppearanceImageRole(entry, seenRoles);
    seenRoles.add(role);
    images.push({
      ...entry,
      role,
      contentType: src.toLowerCase().includes('.gif') ? 'image/gif' : 'image/png'
    });
  }
  return images;
}

function extractPrimaryLinkTitle(cellHtml) {
  const match = String(cellHtml ?? '').match(/<a\b[^>]*>/i);
  return match ? getTagAttribute(match[0], 'title') : '';
}

function extractHtmlRows(html) {
  const rows = [];
  for (const section of WIKI_SECTIONS) {
    const sectionHtml = extractHtmlSectionByHeadings(html, section.htmlHeadings ?? [section.htmlHeading]);
    for (const rowHtml of splitHtmlRows(sectionHtml)) {
      const cells = splitHtmlCells(rowHtml);
      if (cells.length < 2) {
        continue;
      }
      const nameZh = extractPrimaryLinkTitle(cells[1]) || htmlToText(cells[1]);
      if (!nameZh) {
        continue;
      }
      rows.push({
        section: section.code,
        compositionKind: section.compositionKind,
        nameZh,
        images: extractHtmlImages(cells[0]),
        effectText: htmlToText(cells.length >= 8 ? cells[6] : cells[cells.length - 2]),
        sourceText: htmlToText(cells[cells.length - 1])
      });
    }
  }
  return rows;
}

function findMarkerIndex(text, markers, fromIndex = 0) {
  const candidates = (Array.isArray(markers) ? markers : [markers])
    .map((marker) => String(text ?? '').indexOf(marker, fromIndex))
    .filter((index) => index >= 0);
  return candidates.length ? Math.min(...candidates) : -1;
}

function extractWikiSection(wikitext, startMarker, endMarker) {
  const text = String(wikitext ?? '');
  const start = findMarkerIndex(text, startMarker);
  if (start < 0) {
    return '';
  }
  const end = findMarkerIndex(text, endMarker, start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

function splitWikiRows(sectionText) {
  return String(sectionText ?? '')
    .split(/\n\|-\s*\n/)
    .slice(1)
    .filter((row) => (
      /\{\{item\|[^{}]*mode=text[^{}]*\|[^{}|]+\}\}/.test(row)
      || /\[\[\{\{tr\|([^{}|]+)\}\}\]\]/.test(row)
    ));
}

function extractWikiSetTitle(rowText) {
  const itemMatch = String(rowText ?? '').match(/\{\{item\|[^{}]*mode=text[^{}]*\|([^{}|]+)\}\}/);
  if (itemMatch?.[1]) {
    return itemMatch[1].trim();
  }
  const trLinkMatch = String(rowText ?? '').match(/\[\[\{\{tr\|([^{}|]+)\}\}\]\]/);
  return trLinkMatch?.[1]?.trim() ?? null;
}

function extractInterchangeableSetTitles(rowText, pageTitle) {
  const text = String(rowText ?? '');
  if (!/\binterchange/i.test(text) && !text.includes('互换')) {
    return [];
  }
  return unique(
    [...text.matchAll(/\{\{tr\|([^{}|]+ armor)\}\}/gi)]
      .map((match) => match[1].trim())
      .filter((title) => title !== pageTitle)
  );
}

function extractWikiRows(wikitext) {
  const rows = [];
  for (const section of WIKI_SECTIONS) {
    const sectionText = extractWikiSection(wikitext, section.wikiStart, section.wikiEnd);
    for (const rowText of splitWikiRows(sectionText)) {
      const pageTitle = extractWikiSetTitle(rowText);
      if (!pageTitle) {
        continue;
      }
      rows.push({
        section: section.code,
        compositionKind: section.compositionKind,
        pageTitle,
        interchangeableSetTitles: extractInterchangeableSetTitles(rowText, pageTitle)
      });
    }
  }
  return rows;
}

export function parseWikiArmorSetRows({
  wikitext,
  html,
  sourceRevisionTimestamp = null
} = {}) {
  const wikiRows = extractWikiRows(wikitext);
  const htmlRows = extractHtmlRows(html);
  return wikiRows.map((row, index) => {
    const htmlRow = htmlRows[index] ?? {};
    return {
      section: row.section,
      entityType: 'armor_set',
      compositionKind: row.compositionKind,
      pageTitle: row.pageTitle,
      nameEn: row.pageTitle,
      nameZh: htmlRow.nameZh ?? row.pageTitle,
      images: htmlRow.images ?? [],
      effectText: htmlRow.effectText ?? '',
      sourceText: htmlRow.sourceText ?? '',
      interchangeableSetTitles: row.interchangeableSetTitles,
      sourceRevisionTimestamp
    };
  });
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apiUrl = String(options['api-url'] ?? DEFAULT_ZH_WIKI_API_URL);
  const pageTitle = String(options.page ?? DEFAULT_ARMOR_PAGE_TITLE);
  const outputDir = path.resolve(process.cwd(), options['output-dir'] ?? path.join(repoRoot, 'data', 'generated'));
  const payload = await fetchWikiPagePayload({ pageTitle, apiUrl });
  const records = parseWikiArmorSetRows({
    wikitext: payload.wikitext,
    html: payload.html,
    sourceRevisionTimestamp: payload.revisionTimestamp
  });
  const generatedAt = new Date().toISOString();
  const timestamp = generatedAt.replaceAll(':', '-');
  const result = {
    source: 'terraria.wiki.gg/zh/wiki/盔甲',
    sourceApi: apiUrl,
    sourcePageTitle: payload.pageTitle,
    sourceRevisionTimestamp: payload.revisionTimestamp,
    fetchedAt: payload.fetchedAt,
    generatedAt,
    total: records.length,
    records
  };

  ensureDir(outputDir);
  writeJson(path.join(outputDir, 'wiki-armor-sets.latest.json'), result);
  writeJson(path.join(outputDir, `wiki-armor-sets.${timestamp}.json`), result);
  console.log(`Fetched ${records.length} wiki armor sets from ${payload.pageTitle}`);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
