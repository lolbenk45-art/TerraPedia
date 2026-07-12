#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import {
  attachCrawlerAttemptIdentity,
  writeJsonFile
} from '../workflow/backend-refresh-runtime-state.mjs';
import { createWikiRequestGate } from '../lib/wiki-request-gate.mjs';
import {
  buildResumeProgressFields,
  computeInputFingerprint,
  createResumeState,
  derivePartialPath,
  loadResumeState,
  makeSkipChecker,
  markCompleted,
  resolveResumeDecision,
} from '../lib/crawler-resume-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const WIKI_ORIGIN = 'https://terraria.wiki.gg';
const ZH_WIKI_ORIGIN = 'https://terraria.wiki.gg/zh';
const ACTION_ID = 'domain-source-town-npc-maintenance';
const LATEST_FILE_NAME = 'wiki-town-npc-maintenance.latest.json';
const PROGRESS_FILE_NAME = 'domain-source-town-npc-maintenance-progress.latest.json';
const CLI_OPTIONS = ['--source', '--output', '--snapshot-output', '--progress-path', '--delay-ms', '--limit', '--resume-mode', '--resume-state'];
const RESUME_MODE_VALUE = 'keyed_items';
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_REQUEST_RETRIES = 3;

const SHOP_HEADING_TEXTS = ['出售物品', '商店', '商品'];
const LIVING_PREFERENCES_HEADING_TEXTS = ['Living preferences', '生活偏好', '生活喜好', '居住偏好'];
const LOCALIZED_PAGE_TITLE_OVERRIDES = new Map(Object.entries({
  Wizard: '巫师',
  Cyborg: '机器侠',
  Angler: '渔夫',
  TownSlimeRed: '暴躁史莱姆',
  Pirate: '海盗',
  Truffle: '松露人',
  SantaClaus: '圣诞老人',
  TownDog: '城镇狗狗',
  TownSlimeOld: '长者史莱姆'
}));
const HARDMODE_HINTS = [
  '困难模式', '困難模式', '肉山后', '肉山後', '血肉墙后', '血肉牆後',
  '机械骷髅王', '機械骷髏王', '机械毁灭者', '機械毀滅者', '双子魔眼', '雙子魔眼',
  '机械 boss', '机械boss', '機械 boss', '機械boss', '世纪之花', '世紀之花',
  '石巨人', '拜月教邪教徒', '月亮领主', '月亮領主', '火星暴乱', '火星暴亂',
  '光之女皇', '海盗入侵', '海盜入侵', '霜月', '南瓜月', '叶绿', '葉綠'
];

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const outputPath = path.resolve(String(args.output ?? path.join(repoRoot, 'data', 'generated', LATEST_FILE_NAME)));
  const snapshotPath = path.resolve(String(args['snapshot-output'] ?? path.join(repoRoot, 'reports', `wiki-town-npc-maintenance-${timestampForFile(new Date())}.json`)));
  const sourcePath = path.resolve(String(args.source ?? path.join(repoRoot, 'data', 'generated', 'npc-standardized-map.json')));
  const progressPath = resolveProgressPath(args['progress-path']);
  const canonicalProgressPath = canonicalProgressPathFor();
  const startedAt = new Date().toISOString();
  let lastResumeProgressFields = {};
  let lastProgressCurrent = 0;
  let lastProgressTotal = 0;

  try {
    let seeds = loadTownNpcSeeds(sourcePath);
    const limit = toNullableInteger(args.limit);
    if (limit != null) {
      seeds = seeds.slice(0, Math.max(0, limit));
    }

    const resumeMode = String(args['resume-mode'] ?? 'fresh');
    const statePath = path.resolve(String(args['resume-state'] ?? path.join(worktreeRoot(), 'data', 'generated', 'resume', `${ACTION_ID}.resume.json`)));
    const partialPath = derivePartialPath(statePath);
    const inputFingerprint = computeInputFingerprint(seeds);
    const priorState = loadResumeState(statePath);
    const priorPartialStore = fs.existsSync(partialPath) ? loadJsonObject(partialPath) : null;
    lastResumeProgressFields = buildResumeProgressFields(
      priorState ?? createResumeState({ actionId: ACTION_ID, resumeMode: RESUME_MODE_VALUE, inputFingerprint }),
      seeds.length
    );
    lastProgressCurrent = new Set((priorState?.completedKeys || []).map((key) => String(key))).size;
    lastProgressTotal = seeds.length;

    const decision = resolveResumeDecision({
      mode: resumeMode,
      state: priorState,
      actionId: ACTION_ID,
      resumeMode: RESUME_MODE_VALUE,
      inputFingerprint,
      partialStore: priorPartialStore,
      isValidRecord: isCompleteTownNpcPartialRecord,
      validKeys: seeds.map((seed) => seed.gameId),
    });
    if (decision.action === 'fail') {
      throw new Error(`resume 校验失败(${decision.reason})：请用 --resume-mode=fresh 重跑，或确认输入未变`);
    }

    const resuming = decision.action === 'resume';
    const state = resuming
      ? priorState
      : createResumeState({ actionId: ACTION_ID, resumeMode: RESUME_MODE_VALUE, inputFingerprint });
    const partialStore = resuming ? priorPartialStore : {};
    if (!resuming) {
      fs.rmSync(statePath, { force: true });
      fs.rmSync(partialPath, { force: true });
    }
    const shouldSkip = makeSkipChecker(state, partialStore, isCompleteTownNpcPartialRecord);
    const crashHookEnabled = process.env.TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK === '1';
    const crashAfter = crashHookEnabled ? toNullableInteger(process.env.TERRAPEDIA_TOWN_NPC_CRASH_AFTER) : null;
    const crashPoint = normalizeText(process.env.TERRAPEDIA_TOWN_NPC_CRASH_POINT) || 'after-mark';
    lastResumeProgressFields = buildResumeProgressFields(state, seeds.length);
    lastProgressCurrent = new Set((state.completedKeys || []).map((key) => String(key))).size;
    lastProgressTotal = seeds.length;

    writeProgress(progressPath, buildProgressPayload({
      status: 'running',
      phase: 'fetch',
      message: `starting town NPC maintenance fetch (${decision.action})`,
      current: lastProgressCurrent,
      total: seeds.length,
      outputPath,
      reportPath: snapshotPath,
      startedAt,
      nextStep: 'fetch town NPC wiki pages',
      ...lastResumeProgressFields
    }), canonicalProgressPath);

    const client = buildClient();
    const { records, scraped, skipped } = await crawlRecords({
      client,
      seeds,
      delayMs: Math.max(0, Number(args['delay-ms'] ?? 1600) || 0),
      resume: { state, statePath, partialPath, partialStore, shouldSkip, crashAfter, crashPoint },
      progressCallback: (current, total, seed) => {
        lastProgressCurrent = current;
        lastProgressTotal = total;
        lastResumeProgressFields = buildResumeProgressFields(state, seeds.length);
        writeProgress(progressPath, buildProgressPayload({
          status: 'running',
          phase: 'fetch',
          message: `fetching town NPC page ${seed.pageTitle}`,
          current,
          total,
          outputPath,
          reportPath: snapshotPath,
          startedAt,
          nextStep: 'continue town NPC wiki page fetch',
          ...lastResumeProgressFields
        }), canonicalProgressPath);
      }
    });

    const payload = {
      entity: 'wiki_town_npc_maintenance',
      generatedAt: new Date().toISOString(),
      sourceMode: 'wiki_zh_page_html',
      sourceOrigin: ZH_WIKI_ORIGIN,
      sourceSeedPath: sourcePath,
      totalTownNpcs: seeds.length,
      summary: buildSummary(records),
      records
    };

    writeJsonAtomic(outputPath, payload);
    writeJsonAtomic(snapshotPath, payload);
    writeProgress(progressPath, buildProgressPayload({
      status: 'completed',
      phase: 'write',
      message: 'finished town NPC maintenance fetch',
      current: seeds.length,
      total: seeds.length,
      outputPath,
      reportPath: snapshotPath,
      startedAt,
      ...buildResumeProgressFields(state, seeds.length)
    }), canonicalProgressPath);

    process.stdout.write(`${JSON.stringify({
      output: outputPath,
      snapshot: snapshotPath,
      progress: progressPath,
      seedCount: seeds.length,
      scrapedCount: payload.summary.scrapedCount,
      fetchedCount: scraped,
      skippedCount: skipped,
      errorCount: payload.summary.errorCount,
      shopItems: payload.summary.shopItemCount
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeProgress(progressPath, buildProgressPayload({
      status: 'failed',
      phase: 'error',
      message: `town NPC maintenance fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      current: lastProgressCurrent,
      total: lastProgressTotal,
      outputPath,
      reportPath: snapshotPath,
      startedAt,
      nextStep: 'inspect error and rerun the town NPC maintenance fetch',
      ...lastResumeProgressFields
    }), canonicalProgressPath);
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    return 1;
  }
}

function buildClient() {
  const mockHtmlPath = normalizeText(process.env.TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML);
  if (mockHtmlPath) {
    return {
      async get(pageUrl) {
        return {
          text: fs.readFileSync(path.resolve(mockHtmlPath), 'utf8'),
          url: pageUrl,
          status: 200,
          statusText: 'OK'
        };
      }
    };
  }

  const gate = createWikiRequestGate();
  return {
    async get(pageUrl) {
      const text = await gate.runTextRequest(pageUrl, {
        method: 'GET',
        profile: 'page',
        sourceKey: pageUrl,
        timeoutMs: 60_000
      });
      return {
        text,
        url: pageUrl,
        status: 200,
        statusText: 'OK'
      };
    }
  };
}

function resolveProgressPath(rawProgressPath) {
  const configuredPath = rawProgressPath || process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH;
  if (configuredPath) {
    return path.resolve(String(configuredPath));
  }
  return path.join(worktreeRoot(), 'data', 'generated', PROGRESS_FILE_NAME);
}

function canonicalProgressPathFor() {
  return path.join(worktreeRoot(), 'data', 'generated', PROGRESS_FILE_NAME);
}

function worktreeRoot() {
  return path.resolve(process.env.WORKTREE_ROOT || repoRoot);
}

function buildProgressPayload({
  status,
  phase,
  message,
  current,
  total,
  outputPath,
  reportPath,
  startedAt,
  nextStep = null,
  resume = null
}) {
  const generatedAt = new Date().toISOString();
  const payload = {
    actionId: ACTION_ID,
    status,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: '',
    phase,
    message,
    current,
    total,
    outputPath,
    reportPath,
    startedAt
  };
  if (nextStep) {
    payload.nextStep = nextStep;
  }
  if (resume) {
    payload.resume = resume;
  }
  return attachCrawlerAttemptIdentity(payload);
}

function writeProgress(filePath, payload, canonicalPath = null) {
  const progressPayload = { ...payload, childStatusPath: filePath };
  writeJsonAtomic(filePath, progressPayload);
  if (canonicalPath && shouldMirrorProgressPath(filePath, canonicalPath)) {
    writeJsonAtomic(canonicalPath, { ...progressPayload, childStatusPath: canonicalPath });
  }
}

function shouldMirrorProgressPath(progressPath, canonicalPath) {
  if (path.resolve(progressPath) === path.resolve(canonicalPath)) {
    return false;
  }
  return process.env.NODE_ENV !== 'test' || Boolean(process.env.WORKTREE_ROOT);
}

function loadTownNpcSeeds(sourcePath) {
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const records = payload?.records && typeof payload.records === 'object' ? payload.records : {};
  const seeds = [];
  for (const [rawGameId, rawRecord] of Object.entries(records)) {
    if (!rawRecord || typeof rawRecord !== 'object') {
      continue;
    }
    const rawJson = parseJsonObject(rawRecord.rawJson);
    const extras = rawJson.extras && typeof rawJson.extras === 'object' ? rawJson.extras : {};
    if (!truthy(extras.townNPC)) {
      continue;
    }

    const gameId = toNullableInteger(rawRecord.gameId) ?? toNullableInteger(rawGameId);
    const internalName = normalizeText(rawRecord.internalName);
    const nameEn = normalizeText(rawJson.name);
    const nameZh = normalizeText(rawRecord.nameZh);
    const pageTitle = normalizeText(rawJson.name) || internalName;
    if (gameId == null || !internalName || !pageTitle) {
      continue;
    }
    seeds.push({ gameId, internalName, pageTitle, nameEn, nameZh });
  }
  return seeds.sort((first, second) => first.gameId - second.gameId);
}

async function crawlRecords({ client, seeds, delayMs, progressCallback, resume }) {
  const partialStore = resume.partialStore;
  let scraped = 0;
  let skipped = 0;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const key = seed.gameId;

    if (resume.shouldSkip(key)) {
      skipped += 1;
      progressCallback?.(new Set((resume.state.completedKeys || []).map((doneKey) => String(doneKey))).size, seeds.length, seed);
      continue;
    }

    if (scraped > 0) {
      await sleep(delayMs + Math.floor(Math.random() * 400));
    }
    progressCallback?.(new Set((resume.state.completedKeys || []).map((doneKey) => String(doneKey))).size, seeds.length, seed);
    let record;
    try {
      record = await fetchTownNpcRecord(client, seed);
    } catch (error) {
      record = {
        gameId: seed.gameId,
        internalName: seed.internalName,
        pageTitle: seed.pageTitle,
        pageUrl: buildPageUrl(seed.pageTitle),
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        shopItems: [],
        shopItemCount: 0,
        livingPreferences: [],
        moveInConditions: [],
        suggestedGamePeriodId: null,
        suggestedGamePeriodReason: null
      };
    }

    partialStore[String(key)] = record;
    writeJsonAtomic(resume.partialPath, partialStore);
    const attempted = scraped + 1;
    if (resume.crashPoint === 'after-partial-before-mark' && resume.crashAfter != null && attempted >= resume.crashAfter) {
      crashForTest('test crash after partial before markCompleted');
    }
    markCompleted({ statePath: resume.statePath, state: resume.state, key });
    scraped += 1;
    progressCallback?.(new Set((resume.state.completedKeys || []).map((doneKey) => String(doneKey))).size, seeds.length, seed);
    if ((resume.crashPoint == null || resume.crashPoint === 'after-mark') && resume.crashAfter != null && scraped >= resume.crashAfter) {
      crashForTest('test crash after markCompleted');
    }
  }

  const missingOutputKeys = seeds
    .map((seed) => String(seed.gameId))
    .filter((key) => !Object.prototype.hasOwnProperty.call(partialStore, key));
  if (missingOutputKeys.length > 0) {
    throw new Error(`partial store missing fetched records: ${missingOutputKeys.join(', ')}`);
  }

  const records = seeds.map((seed) => partialStore[String(seed.gameId)]);
  return { records, scraped, skipped };
}

function crashForTest(message) {
  throw new Error(message);
}

async function fetchTownNpcRecord(client, seed) {
  let response = null;
  let lastError = null;
  const candidateTitles = [seed.pageTitle];
  const localizedTitle = LOCALIZED_PAGE_TITLE_OVERRIDES.get(seed.internalName);
  if (localizedTitle && !candidateTitles.includes(localizedTitle)) {
    candidateTitles.push(localizedTitle);
  }
  if (seed.nameZh && !candidateTitles.includes(seed.nameZh)) {
    candidateTitles.push(seed.nameZh);
  }

  for (const candidateTitle of candidateTitles) {
    const pageUrl = buildPageUrl(candidateTitle);
    try {
      response = await getWithRetry(client, pageUrl);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!response) {
    throw lastError ?? new Error(`Failed to resolve wiki page for ${seed.internalName}`);
  }

  const html = response.text;
  const parserOutputHtml = resolveMainParserOutput(html);
  if (!parserOutputHtml) {
    throw new Error(`Parser output not found for ${seed.pageTitle}`);
  }

  const [introParagraph, moveInConditions] = extractIntroAndConditions(parserOutputHtml);
  const shopItems = extractShopItems(parserOutputHtml);
  const wikiDetails = extractWikiDetails(parserOutputHtml);
  const livingPreferences = extractLivingPreferences(parserOutputHtml);
  const pageTitle = extractTitleText(html) || seed.pageTitle;
  const pageId = extractWgNumber(html, 'wgArticleId');
  const revisionId = extractWgNumber(html, 'wgRevisionId');
  const [suggestedGamePeriodId, suggestedGamePeriodReason] = inferGamePeriod(introParagraph, moveInConditions);

  return {
    gameId: seed.gameId,
    internalName: seed.internalName,
    pageTitle,
    pageUrl: String(response.url),
    pageId,
    revisionId,
    nameEn: seed.nameEn,
    nameZh: pageTitle,
    functionSummary: introParagraph,
    moveInConditions: moveInConditions.map((text) => ({ text })),
    moveInSummary: moveInConditions.length > 0 ? moveInConditions.join('；') : null,
    suggestedGamePeriodId,
    suggestedGamePeriodReason,
    shopItems,
    shopItemCount: shopItems.length,
    livingPreferences,
    wikiDetails,
    fetchedAt: new Date().toISOString(),
    error: null
  };
}

async function getWithRetry(client, pageUrl) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_REQUEST_RETRIES; attempt += 1) {
    try {
      return await client.get(pageUrl, { profile: 'page', sourceKey: pageUrl });
    } catch (error) {
      lastError = error;
      const statusCode = extractStatusCode(error);
      if (!RETRYABLE_STATUS_CODES.has(statusCode) || attempt >= MAX_REQUEST_RETRIES) {
        throw error;
      }
      await sleep((800 * attempt) + Math.floor(Math.random() * 300));
    }
  }
  throw lastError ?? new Error(`Failed to fetch page: ${pageUrl}`);
}

function resolveMainParserOutput(html) {
  const blocks = [...String(html ?? '').matchAll(/<div\b([^>]*\bclass=["'][^"']*\bmw-parser-output\b[^"']*["'][^>]*)>([\s\S]*?)<\/div>\s*<\/body>/gi)]
    .map((match) => match[2]);
  if (blocks.length === 0) {
    const match = String(html ?? '').match(/<div\b([^>]*\bclass=["'][^"']*\bmw-parser-output\b[^"']*["'][^>]*)>([\s\S]*)<\/div>/i);
    return match?.[2] ?? null;
  }
  return blocks.sort((a, b) => stripHtml(b).length - stripHtml(a).length)[0];
}

function extractIntroAndConditions(parserOutputHtml) {
  const tokens = immediateChildBlocks(parserOutputHtml);
  let introParagraph = null;
  const moveInConditions = [];
  for (const token of tokens) {
    if (token.tag === 'p' && introParagraph == null) {
      const text = cleanText(stripHtml(token.html));
      if (text) {
        introParagraph = text;
      }
      continue;
    }
    if (token.tag === 'ul' && introParagraph != null) {
      for (const item of token.html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        const text = cleanText(stripHtml(item[1]));
        if (text) {
          moveInConditions.push(text);
        }
      }
      if (moveInConditions.length > 0) {
        break;
      }
    }
    if (token.tag === 'h2' && introParagraph != null) {
      break;
    }
  }
  return [introParagraph, moveInConditions];
}

function extractShopItems(parserOutputHtml) {
  const heading = findHeading(parserOutputHtml, ['h2'], (html) => {
    const text = cleanText(stripHtml(html));
    return text && SHOP_HEADING_TEXTS.some((key) => text.includes(key));
  });
  if (!heading) {
    return [];
  }
  const tableHtml = firstTagAfter(parserOutputHtml, heading.end, 'table');
  if (!tableHtml) {
    return [];
  }
  const rows = extractRows(tableHtml.html);
  const items = [];
  for (const rowHtml of rows.slice(1)) {
    const cells = extractCells(rowHtml);
    if (cells.length < 3) {
      continue;
    }
    const anchor = extractFirstAnchor(cells[0]);
    if (!anchor) {
      continue;
    }
    const nameZh = cleanText(stripHtml(anchor.innerHtml)) || cleanText(anchor.attrs.title);
    const hrefTitle = extractTitleFromHref(anchor.attrs.href);
    const nameEn = normalizeTitleSlug(hrefTitle);
    const priceText = cleanText(stripHtml(cells[1]));
    const availability = cleanText(stripHtml(cells[2]));
    if (!nameZh && !nameEn) {
      continue;
    }
    items.push({ nameZh, nameEn, priceText, availability });
  }
  return items;
}

function extractLivingPreferences(parserOutputHtml) {
  const heading = findHeading(parserOutputHtml, ['h2', 'h3'], (html) => {
    const headingId = extractHeadingId(html);
    const text = cleanText(stripHtml(html));
    return headingId === 'Living_preferences'
      || (text && LIVING_PREFERENCES_HEADING_TEXTS.some((key) => text.includes(key)));
  });
  if (!heading) {
    return [];
  }
  const tableHtml = firstTagAfter(parserOutputHtml, heading.end, 'table');
  if (!tableHtml) {
    return [];
  }

  const preferences = [];
  for (const rowHtml of extractRows(tableHtml.html, true)) {
    const cells = extractCells(rowHtml);
    if (cells.length < 2) {
      continue;
    }
    const rowClass = parseAttributes(rowHtml.match(/^<tr\b([^>]*)>/i)?.[1] ?? '').class ?? '';
    const preference = normalizePreferenceValue(`${rowClass} ${stripHtml(cells[0])}`);
    if (!preference) {
      continue;
    }
    const preferenceLabel = cleanText(stripHtml(cells[0])) || preference;
    for (let index = 1; index < cells.length; index += 1) {
      const targetType = index === 1 ? 'biome' : 'npc';
      for (const target of extractLivingPreferenceTargets(cells[index])) {
        preferences.push({
          targetType,
          preference,
          targetName: target.targetName,
          targetNameZh: target.targetNameZh,
          sourceText: cleanText(`${preferenceLabel} ${target.targetNameZh || target.targetName}`)
        });
      }
    }
  }
  return preferences;
}

function extractLivingPreferenceTargets(cellHtml) {
  const anchors = extractAnchors(cellHtml);
  const targets = [];
  if (anchors.length > 0) {
    for (const anchor of anchors) {
      const visibleText = cleanText(stripHtml(anchor.innerHtml));
      if (!visibleText || ['n/a', 'na', '不适用', '无'].includes(visibleText.toLowerCase())) {
        continue;
      }
      const title = cleanText(anchor.attrs.title);
      const hrefTitle = extractTitleFromHref(anchor.attrs.href);
      const targetName = normalizeTitleSlug(hrefTitle) || title || visibleText;
      targets.push({
        targetName,
        targetNameZh: visibleText !== targetName ? visibleText : null
      });
    }
    return targets;
  }

  const visibleText = cleanText(stripHtml(cellHtml));
  if (!visibleText || ['n/a', 'na', '不适用', '无'].includes(visibleText.toLowerCase())) {
    return [];
  }
  return [{ targetName: visibleText, targetNameZh: null }];
}

function extractWikiDetails(parserOutputHtml) {
  const detail = {
    types: [],
    environments: [],
    aiType: null,
    damage: null,
    lifeMax: null,
    defense: null,
    knockBackResist: null,
    sounds: [],
    spriteImage: null,
    mapIconImage: null,
    dialogPortraitImage: null
  };

  const infobox = findTagWithClass(parserOutputHtml, 'table', 'infobox');
  if (infobox?.html && /\bnpc\b/i.test(parseAttributes(infobox.openAttrs).class ?? '')) {
    const imagesSection = findTagWithClass(infobox.html, 'div', 'section images');
    if (imagesSection?.html) {
      for (const image of extractImages(imagesSection.html)) {
        const alt = cleanText(image.alt) || '';
        if (alt.toLowerCase().includes('old') || alt.includes('前代')) {
          continue;
        }
        const src = normalizeImageSrc(image.src);
        if (src) {
          detail.spriteImage = src;
          break;
        }
      }
    }
  }

  const statTables = findTagsWithClass(parserOutputHtml, 'table', 'stat');
  if (statTables[0]) {
    for (const rowHtml of extractRows(statTables[0].html)) {
      const cells = extractCells(rowHtml);
      if (cells.length < 2) {
        continue;
      }
      const key = cleanText(stripHtml(cells[0]));
      const valueText = cleanText(stripHtml(cells[1]));
      if (!key || !valueText) {
        continue;
      }
      if (['类型', '類型'].includes(key)) {
        detail.types = extractClassText(cells[1], ['tag', 'nowrap']);
        if (detail.types.length === 0) detail.types = [valueText];
      } else if (['环境', '環境'].includes(key)) {
        detail.environments = extractClassText(cells[1], ['tag', 'nowrap']);
        if (detail.environments.length === 0) detail.environments = [valueText];
      } else if (key.includes('AI 类型') || key.includes('AI 類型') || key.includes('AI類型')) {
        detail.aiType = valueText;
      } else if (['伤害', '傷害'].includes(key)) {
        detail.damage = valueText;
      } else if (key.includes('最大生命值')) {
        detail.lifeMax = valueText;
      } else if (key.includes('防御') || key.includes('防禦')) {
        detail.defense = valueText;
      } else if (key.includes('击退') || key.includes('擊退')) {
        detail.knockBackResist = valueText;
      }
    }
  }

  if (statTables[1]) {
    for (const rowHtml of extractRows(statTables[1].html)) {
      const cells = extractCells(rowHtml);
      if (cells.length < 2) continue;
      const label = cleanText(stripHtml(cells[0]));
      if (label) detail.sounds.push(label);
    }
  }

  detail.types = detail.types.filter(Boolean);
  detail.environments = detail.environments.filter(Boolean);
  return detail;
}

function inferGamePeriod(introParagraph, moveInConditions) {
  const text = [introParagraph, ...moveInConditions].filter(Boolean).join(' ');
  if (!text) {
    return [null, null];
  }
  const lowered = text.toLowerCase();
  if (HARDMODE_HINTS.some((keyword) => text.includes(keyword)) || lowered.includes('hardmode')) {
    return [2, '条件或说明中命中困难模式、机械 Boss、世纪之花等后期关键词。'];
  }
  return [1, '未命中困难模式关键词，默认归为前期或困难模式前可出现的城镇 NPC。'];
}

function buildSummary(records) {
  const scrapedCount = records.filter((row) => !row.error).length;
  const errorCount = records.filter((row) => row.error).length;
  const shopItemCount = records.reduce((sum, row) => sum + (row.shopItems?.length ?? 0), 0);
  const livingPreferenceCount = records.reduce((sum, row) => sum + (row.livingPreferences?.length ?? 0), 0);
  const hardmodeSuggestions = records.filter((row) => row.suggestedGamePeriodId === 2).length;
  const prehardmodeSuggestions = records.filter((row) => row.suggestedGamePeriodId === 1).length;
  return {
    recordCount: records.length,
    scrapedCount,
    errorCount,
    shopItemCount,
    livingPreferenceCount,
    hardmodeSuggestions,
    prehardmodeSuggestions
  };
}

function findHeading(html, tags, predicate) {
  const pattern = new RegExp(`<(${tags.join('|')})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, 'gi');
  for (const match of html.matchAll(pattern)) {
    if (predicate(match[0])) {
      return { html: match[0], index: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

function firstTagAfter(html, startIndex, tagName) {
  const rest = html.slice(startIndex);
  const found = findFirstBalancedTag(rest, tagName);
  return found ? { ...found, index: startIndex + found.index, end: startIndex + found.end } : null;
}

function findTagWithClass(html, tagName, classNeedle) {
  return findTagsWithClass(html, tagName, classNeedle)[0] ?? null;
}

function findTagsWithClass(html, tagName, classNeedle) {
  const tags = [];
  const openPattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  for (const match of html.matchAll(openPattern)) {
    const attrs = parseAttributes(match[1]);
    if (!classContains(attrs.class, classNeedle)) {
      continue;
    }
    const balanced = findFirstBalancedTag(html.slice(match.index), tagName);
    if (balanced) {
      tags.push({ ...balanced, index: match.index, end: match.index + balanced.end, openAttrs: match[1] });
    }
  }
  return tags;
}

function findFirstBalancedTag(html, tagName) {
  const pattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  let depth = 0;
  let start = -1;
  for (const match of html.matchAll(pattern)) {
    const token = match[0];
    const closing = token.startsWith('</');
    if (!closing) {
      if (depth === 0) {
        start = match.index;
      }
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const end = match.index + token.length;
        return { html: html.slice(start, end), innerHtml: html.slice(start + html.slice(start).match(new RegExp(`^<${tagName}\\b[^>]*>`, 'i'))[0].length, match.index), index: start, end };
      }
    }
  }
  return null;
}

function immediateChildBlocks(html) {
  const blocks = [];
  const pattern = /<(p|ul|h2)\b[^>]*>[\s\S]*?<\/\1>/gi;
  for (const match of html.matchAll(pattern)) {
    blocks.push({ tag: match[1].toLowerCase(), html: match[0], index: match.index });
  }
  return blocks.sort((first, second) => first.index - second.index);
}

function extractRows(tableHtml, includeOpenTag = false) {
  return [...String(tableHtml ?? '').matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map((match) => includeOpenTag ? match[0] : match[0]);
}

function extractCells(rowHtml) {
  return [...String(rowHtml ?? '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => match[1]);
}

function extractFirstAnchor(html) {
  return extractAnchors(html)[0] ?? null;
}

function extractAnchors(html) {
  return [...String(html ?? '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ attrs: parseAttributes(match[1]), innerHtml: match[2] }));
}

function extractImages(html) {
  return [...String(html ?? '').matchAll(/<img\b([^>]*?)>/gi)]
    .map((match) => parseAttributes(match[1]));
}

function extractHeadingId(html) {
  const outerAttrs = html.match(/^<h[23]\b([^>]*)>/i)?.[1] ?? '';
  const outerId = normalizeText(parseAttributes(outerAttrs).id);
  if (outerId) return outerId;
  const childAttrs = html.match(/<[^>]+\bid=["']([^"']+)["'][^>]*>/i)?.[1] ?? '';
  return normalizeText(childAttrs);
}

function extractClassText(html, classNames) {
  const values = [];
  for (const className of classNames) {
    const pattern = new RegExp(`<[^>]+\\bclass=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'gi');
    for (const match of html.matchAll(pattern)) {
      const text = cleanText(stripHtml(match[1]));
      if (text) values.push(text);
    }
  }
  return [...new Set(values)];
}

function classContains(classValue, needle) {
  const haystack = ` ${String(classValue ?? '').replace(/\s+/g, ' ')} `;
  return needle.split(/\s+/).every((part) => haystack.includes(` ${part} `));
}

function parseAttributes(raw) {
  const attrs = {};
  for (const match of String(raw ?? '').matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[match[1]] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&thinsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&ndash;', '–')
    .replaceAll('&mdash;', '—')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function normalizePreferenceValue(value) {
  const text = (normalizeText(value) || '').toLowerCase();
  if (!text) return null;
  if (['love', 'loves', '最爱', '最喜爱', '最喜欢'].some((token) => text.includes(token))) return 'love';
  if (['dislike', 'dislikes', '不喜欢', '不喜爱', '反感'].some((token) => text.includes(token))) return 'dislike';
  if (['hate', 'hates', '讨厌', '厌恶'].some((token) => text.includes(token))) return 'hate';
  if (['like', 'likes', '喜欢', '喜爱'].some((token) => text.includes(token))) return 'like';
  return null;
}

function buildPageUrl(pageTitle) {
  const encoded = encodeURIComponent(String(pageTitle).replaceAll(' ', '_'))
    .replaceAll('%2F', '/')
    .replaceAll('%3A', ':')
    .replaceAll('%28', '(')
    .replaceAll('%29', ')')
    .replaceAll('%27', "'")
    .replaceAll('%21', '!')
    .replaceAll('%2C', ',');
  return `${ZH_WIKI_ORIGIN}/wiki/${encoded}`;
}

function extractTitleText(html) {
  const title = stripHtml(String(html ?? '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  return cleanText(title.split(' - ', 1)[0]);
}

function extractTitleFromHref(href) {
  if (!href) return null;
  let parsed;
  try {
    parsed = new URL(href, WIKI_ORIGIN);
  } catch {
    return null;
  }
  const marker = '/wiki/';
  if (!parsed.pathname.includes(marker)) return null;
  return decodeURIComponent(parsed.pathname.split(marker, 2)[1]);
}

function normalizeTitleSlug(value) {
  const text = normalizeText(value);
  return text ? text.replaceAll('_', ' ') : null;
}

function extractWgNumber(html, key) {
  const quoted = String(html ?? '').match(new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*(-?\\d+)`));
  const assigned = String(html ?? '').match(new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*(-?\\d+)`));
  return toNullableInteger(quoted?.[1] ?? assigned?.[1]);
}

function normalizeImageSrc(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.startsWith('//')) return `https:${text}`;
  if (text.startsWith('/')) return `${WIKI_ORIGIN}${text}`;
  return text;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function loadJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isCompleteTownNpcPartialRecord(record, key) {
  return Boolean(
    record
      && typeof record === 'object'
      && !Array.isArray(record)
      && String(record.gameId ?? '') === String(key)
      && typeof record.internalName === 'string'
      && typeof record.pageTitle === 'string'
      && typeof record.pageUrl === 'string'
      && typeof record.fetchedAt === 'string'
      && Array.isArray(record.shopItems)
      && typeof record.shopItemCount === 'number'
      && Array.isArray(record.livingPreferences)
      && Array.isArray(record.moveInConditions)
      && Object.prototype.hasOwnProperty.call(record, 'suggestedGamePeriodId')
      && Object.prototype.hasOwnProperty.call(record, 'suggestedGamePeriodReason')
  );
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonFile(filePath, payload);
}

function cleanText(value) {
  return normalizeText(value)?.replace(/\s+/g, ' ').trim() || null;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function truthy(value) {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function toNullableInteger(value) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractStatusCode(error) {
  const match = String(error?.message ?? error).match(/HTTP\s+(\d+)/);
  return match ? Number(match[1]) : null;
}

function timestampForFile(date) {
  return date.toISOString().replace(/\..*$/, '').replaceAll(':', '').replace('T', '-');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}

export {
  main,
  loadTownNpcSeeds,
  extractLivingPreferences,
  extractShopItems,
  extractWikiDetails
};
