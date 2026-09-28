#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  fetchWikiPagePayload,
  parseCliArgs,
  shouldKeepSnapshot,
  writeJson,
  writeJsonNoOverwrite
} from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
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
  { code: 'body', headings: ['胸甲', '上衣', 'breastplates', 'breastplate', 'shirts'] },
  { code: 'legs', headings: ['护腿', '裤装', 'leggings', 'greaves', 'pants'] }
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
  return [...String(rowHtml ?? '').matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)]
    .map((match) => ({
      tag: match[1].toLowerCase(),
      html: match[3],
      text: htmlToText(match[3]),
      rowspan: Number(getTagAttribute(match[2], 'rowspan') || 1),
      colspan: Number(getTagAttribute(match[2], 'colspan') || 1)
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
  if (text === '') return 'image';
  if (text === '近战速度') return 'classSpecific';
  if (text === '最大魔力') return 'maxMana';
  if (text === '魔力消耗') return 'manaCost';
  if (text === '仆从容量') return 'minionSlots';
  if (text === '哨兵容量') return 'sentrySlots';
  if (text === 'movementspeed' || text === '移动速度') return 'movementSpeed';
  if (text.includes('物品') || text === 'item') return 'item';
  if (text.includes('伤害') || text === 'damage') return 'damage';
  if (text.includes('暴击') || text.includes('critical')) return 'critChance';
  if (text.includes('职业专属')) return 'classSpecific';
  if (text.includes('防御') || text === 'defense') return 'defense';
  if (text.includes('其他') || text.includes('bonus')) return 'otherBonus';
  return null;
}

function expandedHeaderKeys(rows) {
  if (!rows.length) throw new Error('Armor table requires declared column headers');
  const grid = [];
  rows.forEach((cells, rowIndex) => {
    grid[rowIndex] ??= [];
    let column = 0;
    for (const cell of cells) {
      while (grid[rowIndex][column]) column += 1;
      if (![cell.rowspan, cell.colspan].every(span => Number.isSafeInteger(span) && span > 0 && span <= 64)) {
        throw new Error('Armor table header span is invalid');
      }
      for (let r = rowIndex; r < rowIndex + cell.rowspan; r += 1) {
        grid[r] ??= [];
        for (let c = column; c < column + cell.colspan; c += 1) {
          if (grid[r][c]) throw new Error('Armor table header cells overlap');
          grid[r][c] = cell;
        }
      }
      column += cell.colspan;
    }
  });
  const width = grid[0].length;
  if (grid.length !== rows.length || grid.some(row => row.length !== width || Array.from({ length: width }, (_, c) => row[c]).some(cell => !cell))) {
    throw new Error('Armor table header grid is incomplete');
  }
  const keys = grid[0].map((_, column) => {
    const path = [...new Set(grid.map(row => row[column]))].map(cell => cell.text.replace(/\s+/g, ''));
    const leaf = path.at(-1);
    const role = { 近战: 'melee', 远程: 'ranged', 魔法: 'magic', 召唤: 'summon' }[leaf];
    if (role && path.length > 1) {
      if (path[0] === '伤害+暴击率') return `${role}DamageCritChance`;
      if (path[0] === '暴击率') return `${role}CritChance`;
      if (path[0] === '伤害') return `${role}Damage`;
    }
    return normalizeHeaderKey(leaf);
  });
  if (keys.some(key => !key) || new Set(keys).size !== keys.length || !keys.includes('item')) {
    throw new Error('Armor table column headers are unknown or ambiguous');
  }
  return keys;
}

export function parseWikiArmorAttributeRows({
  html,
  sourceRevisionTimestamp = null
} = {}) {
  const rows = [];
  let currentSectionCode = null;
  let currentSlotGroup = null;
  const tokens = [...String(html ?? '').matchAll(/<(h[234])\b[^>]*>[\s\S]*?<\/\1>|<table\b[^>]*>[\s\S]*?<\/table>/gi)];

  for (const token of tokens) {
    const fragment = token[0];
    if (/^<h[234]\b/i.test(fragment)) {
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

    const headerRows = [];
    let tableHeaderKeys = null;
    for (const rowHtml of splitHtmlRows(fragment, { dataOnly: false })) {
      const cells = splitHtmlCells(rowHtml);
      if (cells.some((cell) => cell.tag === 'th') && !cells.some((cell) => cell.tag === 'td')) {
        if (tableHeaderKeys) throw new Error('Armor table headers changed between data rows');
        headerRows.push(cells);
        continue;
      }
      if (!cells.length) continue;
      tableHeaderKeys ??= expandedHeaderKeys(headerRows);
      if (cells.length !== tableHeaderKeys.length || cells.some(cell => cell.tag !== 'td' || cell.rowspan !== 1 || cell.colspan !== 1)) {
        throw new Error('Armor data cell count does not match declared column headers');
      }
      const itemCell = cells[tableHeaderKeys.indexOf('item')];
      if (!itemCell) {
        continue;
      }
      const primaryLink = extractPrimaryLink(itemCell.html);
      const rawCells = Object.fromEntries(tableHeaderKeys.flatMap((key, index) =>
        ['image', 'item', 'defense'].includes(key) ? [] : [[key, cells[index].text]]));
      if (Object.keys(rawCells).length === 0) {
        continue;
      }
      const itemNameZh = primaryLink.text || primaryLink.title || itemCell.text;
      if (!itemNameZh) {
        continue;
      }
      const defenseMatch = cells[tableHeaderKeys.indexOf('defense')]?.text.match(/-?\d+/);
      rows.push({
        sectionCode: currentSectionCode,
        slotGroup: currentSlotGroup,
        itemPageTitle: primaryLink.title || itemNameZh,
        itemHref: primaryLink.href || null,
        itemNameZh,
        defenseValue: defenseMatch ? Number(defenseMatch[0]) : null,
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
  const rawOutputPath = options['raw-output'] ? path.resolve(process.cwd(), options['raw-output']) : null;
  const identityPage = options['identity-page'] ? String(options['identity-page']) : null;
  const identityRawPath = options['identity-raw-output'] ? path.resolve(process.cwd(), options['identity-raw-output']) : null;
  const totalRequests = identityPage ? 2 : 1;
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

  // Reject path aliases before even the first progress write can replace evidence.
  for (const target of [rawOutputPath, identityRawPath].filter(Boolean)) {
    if ([outputPath, progressPath, canonicalProgressPath].includes(target)) {
      throw new Error('Raw source output must not overlap parsed output or progress');
    }
  }
  const heartbeat = createCrawlerProgressHeartbeat({ writeProgress });
  heartbeat.publish({
    status: 'running',
    phase: 'start',
    message: 'starting armor attribute source fetch',
    current: 0,
    total: totalRequests
  });

  try {
    if (Boolean(identityPage) !== Boolean(identityRawPath)) throw new Error('Identity page and immutable raw output must be supplied together');
    const payload = await fetchWikiPagePayload({ pageTitle, apiUrl, requireRevisionBinding: true });
    const rawSourceArtifact = rawOutputPath ? freezeRawPage(rawOutputPath, payload) : null;
    let identitySourceArtifact = null;
    if (identityPage) {
      heartbeat.publish({ status: 'running', phase: 'identity-source',
        message: `capturing independent identity source ${identityPage}`, current: 1, total: totalRequests });
      const identity = await fetchWikiPagePayload({ pageTitle: identityPage, apiUrl, requireRevisionBinding: true });
      identitySourceArtifact = freezeRawPage(identityRawPath, identity);
    }
    heartbeat.publish({
      status: 'running',
      phase: 'parse',
      message: `parsing armor attribute rows from ${payload.pageTitle}`,
      current: totalRequests,
      total: totalRequests
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
      sourceRevisionId: payload.revisionId,
      fetchedAt: payload.fetchedAt,
      generatedAt,
      total: records.length,
      records,
      ...(rawSourceArtifact ? { rawSourceArtifact } : {}),
      ...(identitySourceArtifact ? { identitySourceArtifact } : {})
    };

    ensureDir(outputDir);
    writeJson(outputPath, result);
    if (keepSnapshot) {
      writeJson(path.join(outputDir, `wiki-armor-attributes.${generatedAt.replaceAll(':', '-')}.json`), result);
    }
    heartbeat.publish({
      status: 'completed',
      phase: 'write',
      message: `finished armor attribute source fetch; records=${records.length}`,
      current: totalRequests,
      total: totalRequests,
      generatedAt
    });
    console.log(`Fetched ${records.length} wiki armor attribute rows from ${payload.pageTitle}`);
  } catch (error) {
    heartbeat.publish({
      status: 'failed',
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
      current: 0,
      total: totalRequests,
      nextStep: 'check wiki armor attributes page source availability'
    });
    throw error;
  } finally {
    heartbeat.stop();
  }
}

function freezeRawPage(outputPath, payload) {
  writeJsonNoOverwrite(outputPath, payload);
  return { path: outputPath, sha256: `sha256:${createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex')}` };
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
