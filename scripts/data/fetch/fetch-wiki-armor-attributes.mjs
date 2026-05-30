#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  fetchWikiPagePayload,
  parseCliArgs,
  shouldKeepSnapshot,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_ZH_WIKI_API_URL = 'https://terraria.wiki.gg/zh/api.php';
const DEFAULT_PAGE_TITLE = '盔甲属性表';
const ACTION_ID = 'domain-source-armor-attributes';
const DEFAULT_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'domain-source-armor-attributes-progress.latest.json');
const DEFAULT_OUTPUT_PATH = path.join(repoRoot, 'data', 'generated', 'wiki-armor-attributes.latest.json');

const SLOT_GROUPS = [
  { code: 'head', headings: ['头盔', 'helmets', 'helmet'] },
  { code: 'body', headings: ['胸甲', 'breastplates', 'breastplate', 'shirts'] },
  { code: 'legs', headings: ['护腿', 'leggings', 'greaves', 'pants'] }
];

const FIXED_REAL_TABLE_KEYS = [
  'image',
  'item',
  'meleeDamage',
  'rangedDamage',
  'magicDamage',
  'summonDamage',
  'meleeCritChance',
  'rangedCritChance',
  'magicCritChance',
  'meleeDamageCritChance',
  'rangedDamageCritChance',
  'magicDamageCritChance',
  'classSpecific',
  'meleeSpeed',
  'manaCost',
  'minionSlots',
  'sentrySlots',
  'defense',
  'otherBonus'
];

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
  const match = String(tag ?? '').match(pattern);
  return decodeHtmlEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? '');
}

function headingText(headingHtml) {
  return htmlToText(headingHtml).replace(/\s*\[\s*编辑\s*\]\s*$/u, '').trim();
}

function classifySectionCode(text) {
  const normalized = String(text ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('困难模式之前') || normalized.includes('pre-hardmode')) return 'pre-hardmode';
  if (normalized.includes('困难模式') || normalized.includes('hardmode')) return 'hardmode';
  if (normalized.includes('头盔') || normalized.includes('胸甲') || normalized.includes('护腿')) return null;
  return null;
}

function classifySlotGroup(text) {
  const normalized = String(text ?? '').trim().toLowerCase();
  for (const slot of SLOT_GROUPS) {
    if (slot.headings.some((heading) => normalized.includes(heading))) {
      return slot.code;
    }
  }
  return null;
}

function splitHtmlRows(sectionHtml, { dataOnly = true } = {}) {
  return [...String(sectionHtml ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => match[1])
    .filter((row) => !dataOnly || /<td\b/i.test(row));
}

function splitHtmlCells(rowHtml) {
  return [...String(rowHtml ?? '').matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => ({
      tag: match[1].toLowerCase(),
      html: match[2],
      text: htmlToText(match[2])
    }));
}

function extractPrimaryLink(cellHtml) {
  const match = String(cellHtml ?? '').match(/<a\b[^>]*>[\s\S]*?<\/a>/i);
  if (!match) {
    return { href: '', title: '', text: '' };
  }
  const tag = match[0].match(/<a\b[^>]*>/i)?.[0] ?? '';
  return {
    href: getTagAttribute(tag, 'href'),
    title: getTagAttribute(tag, 'title'),
    text: htmlToText(match[0])
  };
}

function normalizeHeaderKey(value) {
  const text = String(value ?? '').replace(/\s+/g, '').toLowerCase();
  if (text.includes('物品') || text === 'item') return 'item';
  if (text.includes('伤害') || text === 'damage') return 'damage';
  if (text.includes('暴击') || text.includes('critical')) return 'critChance';
  if (text.includes('职业专属')) return 'classSpecific';
  if (text.includes('防御') || text === 'defense') return 'defense';
  if (text.includes('其他') || text.includes('bonus')) return 'otherBonus';
  return null;
}

function buildRawCells(cells, tableHeaderKeys = []) {
  const headerCells = cells.filter((cell) => cell.tag === 'th');
  const dataCells = cells.filter((cell) => cell.tag === 'td');
  const headerKeys = tableHeaderKeys.length > 0
    ? tableHeaderKeys
    : headerCells.map((cell) => normalizeHeaderKey(cell.text));
  if (headerKeys.length === dataCells.length && dataCells.length > 0) {
    const rawCells = {};
    for (let index = 0; index < dataCells.length; index += 1) {
      const key = headerKeys[index];
      if (key && key !== 'item' && key !== 'defense') {
        rawCells[key] = dataCells[index].text;
      }
    }
    if (Object.keys(rawCells).length > 0) {
      return rawCells;
    }
  }

  const rawCells = {};
  for (let index = 0; index < dataCells.length && index < FIXED_REAL_TABLE_KEYS.length; index += 1) {
    const key = FIXED_REAL_TABLE_KEYS[index];
    if (key !== 'image' && key !== 'item' && key !== 'defense') {
      rawCells[key] = dataCells[index].text;
    }
  }
  return rawCells;
}

function findItemCell(cells) {
  const dataCells = cells.filter((cell) => cell.tag === 'td');
  return dataCells.find((cell) => {
    const link = extractPrimaryLink(cell.html);
    return link.title || link.text;
  }) ?? null;
}

function parseDefense(rawCells) {
  const raw = rawCells.defense ?? rawCells.__defense ?? '';
  const match = String(raw).match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function extractDefenseValue(cells, tableHeaderKeys = []) {
  const dataCells = cells.filter((cell) => cell.tag === 'td');
  const defenseIndex = tableHeaderKeys.findIndex((key) => key === 'defense');
  if (tableHeaderKeys.length === dataCells.length && defenseIndex >= 0 && dataCells[defenseIndex]) {
    const match = dataCells[defenseIndex].text.match(/-?\d+/);
    return match ? Number(match[0]) : null;
  }
  const fixedDefenseIndex = FIXED_REAL_TABLE_KEYS.indexOf('defense');
  if (fixedDefenseIndex >= 0 && dataCells[fixedDefenseIndex]) {
    const match = dataCells[fixedDefenseIndex].text.match(/-?\d+/);
    return match ? Number(match[0]) : null;
  }
  return null;
}

export function parseWikiArmorAttributeRows({
  html,
  sourceRevisionTimestamp = null
} = {}) {
  const rows = [];
  let currentSectionCode = null;
  let currentSlotGroup = null;
  const tokens = [...String(html ?? '').matchAll(/<(h[23])\b[^>]*>[\s\S]*?<\/\1>|<table\b[^>]*>[\s\S]*?<\/table>/gi)];

  for (const token of tokens) {
    const fragment = token[0];
    if (/^<h[23]\b/i.test(fragment)) {
      const text = headingText(fragment);
      const sectionCode = classifySectionCode(text);
      const slotGroup = classifySlotGroup(text);
      if (sectionCode) {
        currentSectionCode = sectionCode;
      }
      if (slotGroup) {
        currentSlotGroup = slotGroup;
      }
      continue;
    }

    if (!currentSectionCode || !currentSlotGroup) {
      continue;
    }

    let tableHeaderKeys = [];
    for (const rowHtml of splitHtmlRows(fragment, { dataOnly: false })) {
      const cells = splitHtmlCells(rowHtml);
      if (cells.some((cell) => cell.tag === 'th') && !cells.some((cell) => cell.tag === 'td')) {
        const headerKeys = cells.map((cell) => normalizeHeaderKey(cell.text));
        if (headerKeys.some(Boolean)) {
          tableHeaderKeys = headerKeys;
        }
        continue;
      }
      const itemCell = findItemCell(cells);
      if (!itemCell) {
        continue;
      }
      const primaryLink = extractPrimaryLink(itemCell.html);
      const rawCells = buildRawCells(cells, tableHeaderKeys);
      if (Object.keys(rawCells).length === 0) {
        continue;
      }
      const itemNameZh = primaryLink.text || primaryLink.title || itemCell.text;
      if (!itemNameZh) {
        continue;
      }
      rows.push({
        sectionCode: currentSectionCode,
        slotGroup: currentSlotGroup,
        itemPageTitle: primaryLink.title || itemNameZh,
        itemHref: primaryLink.href || null,
        itemNameZh,
        defenseValue: extractDefenseValue(cells, tableHeaderKeys) ?? parseDefense(rawCells),
        rawCells,
        sourceRevisionTimestamp
      });
    }
  }

  return rows;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apiUrl = String(options['api-url'] ?? DEFAULT_ZH_WIKI_API_URL);
  const pageTitle = String(options.page ?? DEFAULT_PAGE_TITLE);
  const outputDir = path.resolve(process.cwd(), options['output-dir'] ?? path.dirname(DEFAULT_OUTPUT_PATH));
  const outputPath = path.join(outputDir, 'wiki-armor-attributes.latest.json');
  const progressPath = path.resolve(process.cwd(), options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH);
  const canonicalProgressPath = path.resolve(DEFAULT_PROGRESS_PATH);
  const keepSnapshot = shouldKeepSnapshot(options);
  const startedAt = new Date().toISOString();
  const writeProgress = (progress) => {
    const generatedAt = progress.generatedAt ?? new Date().toISOString();
    const payload = buildArmorAttributesProgressPayload({
      startedAt,
      outputPath,
      progressPath,
      ...progress,
      generatedAt
    });
    writeJsonFile(progressPath, payload);
    if (shouldMirrorProgressPath(progressPath, canonicalProgressPath)) {
      writeJsonFile(canonicalProgressPath, buildArmorAttributesProgressPayload({
        startedAt,
        outputPath,
        progressPath: canonicalProgressPath,
        ...progress,
        generatedAt
      }));
    }
  };

  writeProgress({
    status: 'running',
    phase: 'start',
    message: 'starting armor attribute source fetch',
    current: 0,
    total: 1
  });

  try {
    const payload = await fetchWikiPagePayload({ pageTitle, apiUrl });
    writeProgress({
      status: 'running',
      phase: 'parse',
      message: `parsing armor attribute rows from ${payload.pageTitle}`,
      current: 1,
      total: 1
    });

    const records = parseWikiArmorAttributeRows({
      html: payload.html,
      sourceRevisionTimestamp: payload.revisionTimestamp
    });
    const generatedAt = new Date().toISOString();
    const result = {
      source: 'terraria.wiki.gg/zh/wiki/盔甲属性表',
      sourceApi: apiUrl,
      sourcePageTitle: payload.pageTitle,
      sourceRevisionTimestamp: payload.revisionTimestamp,
      fetchedAt: payload.fetchedAt,
      generatedAt,
      total: records.length,
      records
    };

    ensureDir(outputDir);
    writeJson(outputPath, result);
    if (keepSnapshot) {
      writeJson(path.join(outputDir, `wiki-armor-attributes.${generatedAt.replaceAll(':', '-')}.json`), result);
    }
    writeProgress({
      status: 'completed',
      phase: 'write',
      message: `finished armor attribute source fetch; records=${records.length}`,
      current: 1,
      total: 1,
      generatedAt
    });
    console.log(`Fetched ${records.length} wiki armor attribute rows from ${payload.pageTitle}`);
  } catch (error) {
    writeProgress({
      status: 'failed',
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
      current: 0,
      total: 1,
      nextStep: 'check wiki armor attributes page source availability'
    });
    throw error;
  }
}

function buildArmorAttributesProgressPayload({
  status,
  phase,
  message,
  current,
  total,
  startedAt,
  progressPath,
  outputPath,
  nextStep = null,
  generatedAt = new Date().toISOString()
} = {}) {
  const payload = buildActionProgressPayload({
    actionId: ACTION_ID,
    status,
    phase,
    message,
    current,
    total,
    startedAt,
    overallCurrent: current,
    overallTotal: total,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath
  });
  payload.outputPath = outputPath ?? null;
  payload.reportPath = null;
  if (nextStep) payload.nextStep = nextStep;
  return payload;
}

function shouldMirrorProgressPath(progressPath, canonicalProgressPath) {
  if (path.resolve(progressPath) === path.resolve(canonicalProgressPath)) {
    return false;
  }
  return process.env.NODE_ENV !== 'test' || Boolean(process.env.WORKTREE_ROOT);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
