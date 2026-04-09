#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_WIKI_API_URL,
  chunkArray,
  ensureDir,
  fetchWikiApiJson,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { decodeHtmlEntities, extractIntroParagraphs, stripHtml } from '../lib/wiki-page-utils.mjs';

const repoRoot = process.cwd();
const options = parseCliArgs(process.argv.slice(2));
const generatedAt = new Date().toISOString();
const dateTag = generatedAt.slice(0, 10);
const inputPath = path.resolve(options.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-shimmer.latest.json'));
const outputDir = path.resolve(options.output ?? path.join(repoRoot, 'data', 'generated', 'shimmer'));
const reportPath = path.resolve(options['report-output'] ?? path.join(repoRoot, 'reports', `wiki-shimmer-importable-summary-${dateTag}.md`));
const apiUrl = options.api ?? DEFAULT_WIKI_API_URL.replace('/api.php', '/zh/api.php');
const sourceProvider = options.provider ?? 'wiki_zh';
const itemsPath = path.resolve(options.items ?? path.join(repoRoot, 'data', 'standardized', 'items.standardized.json'));
const npcsPath = path.resolve(options.npcs ?? path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'));

const TABLE_ROLE_SEQUENCE = [
  { role: 'item_transforms', label: '\u7269\u54c1\u5b17\u53d8' },
  { role: 'decraft_multi_recipe', label: '\u6709\u591a\u4e2a\u914d\u65b9\u7684\u7269\u54c1' },
  { role: 'decraft_evil_branch', label: '\u6709\u4e24\u79cd\u90aa\u6076\u751f\u7269\u7fa4\u7cfb\u914d\u65b9\u7684\u7269\u54c1' },
  { role: 'decraft_unique', label: '\u6709\u72ec\u7279\u62c6\u89e3\u7684\u7269\u54c1' },
  { role: 'decraft_random_partial', label: '\u62c6\u89e3\u4e3a\u968f\u673a\u90e8\u5206\u6750\u6599\u7684\u7269\u54c1' },
  { role: 'decraft_locked_skeletron', label: '\u76f4\u5230 \u9ab7\u9ac5\u738b \u88ab\u51fb\u8d25\u624d\u53ef\u62c6\u89e3\u7684\u7269\u54c1' },
  { role: 'decraft_locked_golem', label: '\u76f4\u5230 \u77f3\u5de8\u4eba \u88ab\u51fb\u8d25\u624d\u53ef\u62c6\u89e3\u7684\u7269\u54c1' },
  { role: 'decraft_not_allowed', label: '\u4e0d\u53ef\u62c6\u89e3\u7684\u7269\u54c1' },
  { role: 'critter_to_item', label: '\u5b17\u53d8\u4e3a\u7269\u54c1\u7684\u5c0f\u52a8\u7269' },
  { role: 'enemy_transforms', label: '\u654c\u602a\u5b17\u53d8' },
  { role: 'critter_to_faeling', label: '\u5b17\u53d8\u4e3a \u98de\u7075 \u7684\u5c0f\u52a8\u7269' },
  { role: 'slime_to_shimmer_slime', label: '\u5b17\u53d8\u4e3a \u5fae\u5149\u53f2\u83b1\u59c6 \u7684\u53f2\u83b1\u59c6' },
  { role: 'npc_transforms', label: 'NPC \u5fae\u5149\u5f62\u6001' }
];

const FIXED_NPC_OUTPUTS = {
  critter_to_faeling: { nameZh: '\u98de\u7075', nameEn: 'Faeling', internalName: 'Shimmerfly' },
  slime_to_shimmer_slime: { nameZh: '\u5fae\u5149\u53f2\u83b1\u59c6', nameEn: 'Shimmer Slime', internalName: 'ShimmerSlime' }
};

const ITEM_GROUP_ALIASES = new Set(['Any Fruit', 'Any Torch', 'Any Pylon', 'Recorded Music Boxes']);
const MOON_PHASES = [
  { code: 'FULL_MOON', nameZh: '\u6ee1\u6708', nameEn: 'Full Moon' },
  { code: 'WANING_GIBBOUS', nameZh: '\u4e8f\u51f8\u6708', nameEn: 'Waning Gibbous' },
  { code: 'LAST_QUARTER', nameZh: '\u4e0b\u5f26\u6708', nameEn: 'Last Quarter' },
  { code: 'WANING_CRESCENT', nameZh: '\u6b8b\u6708', nameEn: 'Waning Crescent' },
  { code: 'NEW_MOON', nameZh: '\u65b0\u6708', nameEn: 'New Moon' },
  { code: 'WAXING_CRESCENT', nameZh: '\u5a25\u7709\u6708', nameEn: 'Waxing Crescent' },
  { code: 'FIRST_QUARTER', nameZh: '\u4e0a\u5f26\u6708', nameEn: 'First Quarter' },
  { code: 'WAXING_GIBBOUS', nameZh: '\u76c8\u51f8\u6708', nameEn: 'Waxing Gibbous' }
];
const BOSS_REQUIREMENTS = [
  { code: 'MOON_LORD', nameZh: '\u6708\u4eae\u9886\u4e3b', nameEn: 'Moon Lord' },
  { code: 'SKELETRON', nameZh: '\u9ab7\u9ac5\u738b', nameEn: 'Skeletron' },
  { code: 'GOLEM', nameZh: '\u77f3\u5de8\u4eba', nameEn: 'Golem' }
];

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const itemLookup = buildEntityLookup(JSON.parse(fs.readFileSync(itemsPath, 'utf8')).records ?? []);
const npcLookup = buildEntityLookup(JSON.parse(fs.readFileSync(npcsPath, 'utf8')).records ?? []);
const tables = extractTables(raw.html);

if (tables.length < TABLE_ROLE_SEQUENCE.length) {
  throw new Error(`Unexpected shimmer table count: expected at least ${TABLE_ROLE_SEQUENCE.length}, got ${tables.length}`);
}

const titleMeta = await resolveTitleMeta(collectLinkedTitlesFromTables(tables), apiUrl, itemLookup, npcLookup);
const contextPayload = buildContextPayload(raw, sourceProvider);
const itemTransformsPayload = buildItemTransformPayload(raw, tables[0], sourceProvider, titleMeta);
const decraftRulesPayload = buildDecraftRulesPayload(raw, tables.slice(1, 8), sourceProvider, titleMeta);
const entityTransformsPayload = buildEntityTransformsPayload(raw, tables.slice(8, 12), sourceProvider, titleMeta);
const npcTransformsPayload = buildNpcTransformsPayload(raw, tables[12], sourceProvider, titleMeta);
const manifestPayload = buildManifestPayload(raw, titleMeta, itemTransformsPayload, decraftRulesPayload, entityTransformsPayload, npcTransformsPayload);

ensureDir(outputDir);
writeJson(path.join(outputDir, 'wiki-shimmer-context.importable.latest.json'), contextPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-item-transforms.importable.latest.json'), itemTransformsPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-decraft-rules.importable.latest.json'), decraftRulesPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-entity-transforms.importable.latest.json'), entityTransformsPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-npc-transforms.importable.latest.json'), npcTransformsPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-manifest.latest.json'), manifestPayload);
ensureDir(path.dirname(reportPath));
fs.writeFileSync(reportPath, buildMarkdownSummary(raw, outputDir, manifestPayload, itemTransformsPayload, decraftRulesPayload, entityTransformsPayload, npcTransformsPayload), 'utf8');

console.log(JSON.stringify({
  outputDir,
  reportPath,
  contextRecords: 1,
  itemTransforms: itemTransformsPayload.records.length,
  decraftRules: decraftRulesPayload.records.length,
  entityTransforms: entityTransformsPayload.records.length,
  npcTransforms: npcTransformsPayload.records.length,
  unresolvedTitles: manifestPayload.resolution.unresolvedCount
}, null, 2));

function buildContextPayload(rawPayload, provider) {
  const introParagraphs = extractIntroParagraphs(extractIntroHtml(rawPayload.html));
  return {
    entity: 'wiki_shimmer_context_importable',
    generatedAt,
    sourceProvider: provider,
    sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
    page: buildSourceMeta(rawPayload),
    worldContext: {
      code: 'SHIMMER',
      nameEn: 'Shimmer',
      nameZh: '\u5fae\u5149',
      contextType: 'ENVIRONMENT',
      description: introParagraphs.slice(0, 2).join(' ').trim() || null,
      biomeCode: 'aether',
      biomeNameEn: 'Aether',
      biomeNameZh: '\u4ee5\u592a',
      layerHints: ['underground', 'cavern'],
      sideRule: 'same_side_as_jungle',
      occurrenceRule: 'one_per_world',
      acquisition: [
        { kind: 'natural_spawn', notes: introParagraphs[0] ?? null },
        { kind: 'post_boss_unlock', itemNameEn: 'Bottomless Shimmer Bucket', itemNameZh: '\u65e0\u5e95\u5fae\u5149\u6876', bossCode: 'MOON_LORD', notes: introParagraphs[0] ?? null }
      ],
      mechanics: [
        { code: 'ITEM_TRANSMUTATION', description: '\u5fae\u5149\u53ef\u5c06\u7269\u54c1\u5b17\u53d8\u6216\u62c6\u89e3\u4e3a\u6750\u6599\u3002' },
        { code: 'NPC_APPEARANCE_SWAP', description: '\u57ce\u9547 NPC \u6d78\u6ca1\u540e\u4f1a\u53d8\u4e3a\u5fae\u5149\u5f62\u6001\uff0c\u4ec5\u5f71\u54cd\u5916\u89c2\u3002' },
        { code: 'CRITTER_AND_ENEMY_TRANSFORM', description: '\u7279\u5b9a\u5c0f\u52a8\u7269\u548c\u654c\u602a\u5728\u5fae\u5149\u4e2d\u4f1a\u5b17\u53d8\u3002' },
        { code: 'SHIMMERING_DEBUFF', description: '\u73a9\u5bb6\u5728\u5fae\u5149\u4e2d\u4f1a\u89e6\u53d1\u5fae\u5149\u95ea\u70c1 debuff\u3002' },
        { code: 'LIQUID_MIX_RESULT', description: '\u5fae\u5149\u4e0e\u5176\u4ed6\u6db2\u4f53\u63a5\u89e6\u65f6\u4f1a\u5f62\u6210 Aetherium Block\u3002', outputItemNameEn: 'Aetherium Block', outputItemNameZh: '\u4ee5\u592a\u5757' },
        { code: 'PUMP_SUPPORTED', description: '\u5fae\u5149\u65e0\u6cd5\u88ab\u6876\u76f4\u63a5\u76db\u53d6\uff0c\u4f46\u53ef\u88ab pumps \u79fb\u52a8\u3002' }
      ]
    }
  };
}

function buildItemTransformPayload(rawPayload, table, provider, titleMeta) {
  return {
    entity: 'wiki_shimmer_item_transforms_importable',
    generatedAt,
    sourceProvider: provider,
    sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
    records: extractDataRows(table.html).map((cells, index) => {
      const input = resolveReference(parsePrimaryCellEntity(cells[0]), titleMeta, 'item');
      const output = resolveReference(parsePrimaryCellEntity(cells[1]), titleMeta, 'item');
      const notes = normalizeWhitespace(stripHtml(cells[2] ?? '')) || null;
      return {
        code: `shimmer_item_transform_${String(index + 1).padStart(4, '0')}`,
        inputKind: input.kind,
        inputNameZh: input.nameZh,
        inputNameEn: input.nameEn,
        inputInternalName: input.internalName,
        outputKind: output.kind,
        outputNameZh: output.nameZh,
        outputNameEn: output.nameEn,
        outputInternalName: output.internalName,
        conditions: deriveConditions(notes),
        notes,
        sourceSection: TABLE_ROLE_SEQUENCE[0].label,
        ...buildSourceMeta(rawPayload)
      };
    })
  };
}

function buildDecraftRulesPayload(rawPayload, tablesSubset, provider, titleMeta) {
  const records = [];
  for (const [index, table] of tablesSubset.entries()) {
    const role = TABLE_ROLE_SEQUENCE[index + 1].role;
    const caption = normalizeWhitespace(table.caption) || TABLE_ROLE_SEQUENCE[index + 1].label;
    if (role === 'decraft_multi_recipe' || role === 'decraft_unique') {
      for (const cells of extractDataRows(table.html)) {
        records.push({
          code: buildDecraftCode(role, records.length + 1),
          ruleType: role,
          groupLabel: caption,
          input: formatResolved(parsePrimaryCellEntity(cells[0]), titleMeta, 'item'),
          outputs: parseCellEntities(cells[1]).map((entry) => formatResolved(entry, titleMeta, 'item')),
          conditions: [],
          notes: null,
          sourceSection: TABLE_ROLE_SEQUENCE[1].label,
          ...buildSourceMeta(rawPayload)
        });
      }
      continue;
    }
    if (role === 'decraft_evil_branch') {
      for (const cells of extractDataRows(table.html)) {
        records.push({
          code: buildDecraftCode(role, records.length + 1),
          ruleType: role,
          groupLabel: caption,
          input: formatResolved(parsePrimaryCellEntity(cells[0]), titleMeta, 'item'),
          outputs: [
            ...parseCellEntities(cells[1]).map((entry) => ({ branch: 'corruption', ...formatResolved(entry, titleMeta, 'item') })),
            ...parseCellEntities(cells[2]).map((entry) => ({ branch: 'crimson', ...formatResolved(entry, titleMeta, 'item') }))
          ],
          conditions: [],
          notes: null,
          sourceSection: TABLE_ROLE_SEQUENCE[1].label,
          ...buildSourceMeta(rawPayload)
        });
      }
      continue;
    }
    for (const entry of parseSingleCellListTable(table.html)) {
      records.push({
        code: buildDecraftCode(role, records.length + 1),
        ruleType: role,
        groupLabel: caption,
        input: formatResolved(entry, titleMeta, 'item'),
        outputs: [],
        conditions: deriveConditions(caption),
        notes: null,
        sourceSection: TABLE_ROLE_SEQUENCE[1].label,
        ...buildSourceMeta(rawPayload)
      });
    }
  }
  return {
    entity: 'wiki_shimmer_decraft_rules_importable',
    generatedAt,
    sourceProvider: provider,
    sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
    records
  };
}

function buildEntityTransformsPayload(rawPayload, tablesSubset, provider, titleMeta) {
  const records = [];
  for (const [index, table] of tablesSubset.entries()) {
    const role = TABLE_ROLE_SEQUENCE[index + 8].role;
    if (role === 'critter_to_item' || role === 'enemy_transforms') {
      for (const cells of extractDataRows(table.html)) {
        records.push({
          code: `shimmer_entity_transform_${String(records.length + 1).padStart(4, '0')}`,
          transformGroup: role,
          input: formatResolved(parsePrimaryCellEntity(cells[0]), titleMeta, 'npc'),
          output: formatResolved(parsePrimaryCellEntity(cells[1]), titleMeta, role === 'critter_to_item' ? 'item' : 'npc'),
          sourceSection: TABLE_ROLE_SEQUENCE[8].label,
          ...buildSourceMeta(rawPayload)
        });
      }
      continue;
    }
    const fixedOutput = FIXED_NPC_OUTPUTS[role];
    for (const entry of parseSingleCellListTable(table.html)) {
      records.push({
        code: `shimmer_entity_transform_${String(records.length + 1).padStart(4, '0')}`,
        transformGroup: role,
        input: formatResolved(entry, titleMeta, 'npc'),
        output: {
          kind: 'npc',
          nameZh: fixedOutput.nameZh,
          nameEn: fixedOutput.nameEn,
          internalName: fixedOutput.internalName,
          quantityText: null
        },
        sourceSection: TABLE_ROLE_SEQUENCE[8].label,
        ...buildSourceMeta(rawPayload)
      });
    }
  }
  return {
    entity: 'wiki_shimmer_entity_transforms_importable',
    generatedAt,
    sourceProvider: provider,
    sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
    records
  };
}

function buildNpcTransformsPayload(rawPayload, table, provider, titleMeta) {
  return {
    entity: 'wiki_shimmer_npc_transforms_importable',
    generatedAt,
    sourceProvider: provider,
    sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
    records: extractDataRows(table.html).map((cells, index) => {
      const shimmerImage = extractFirstImage(cells[1] ?? '');
      return {
        code: `shimmer_npc_transform_${String(index + 1).padStart(4, '0')}`,
        npc: formatResolved(parsePrimaryCellEntity(cells[0]), titleMeta, 'npc'),
        appearanceVariant: 'shimmer',
        effectType: 'visual_only',
        variantImageUrl: shimmerImage?.src ?? null,
        variantImageAlt: shimmerImage?.alt ?? null,
        notes: '\u4ec5\u5f71\u54cd\u5916\u89c2',
        sourceSection: TABLE_ROLE_SEQUENCE[12].label,
        ...buildSourceMeta(rawPayload)
      };
    })
  };
}

function buildManifestPayload(rawPayload, titleMeta, itemTransforms, decraftRules, entityTransforms, npcTransforms) {
  const unresolvedEntries = [...titleMeta.values()].filter((entry) => entry.kind === 'unresolved').map((entry) => ({ titleZh: entry.nameZh, titleEn: entry.nameEn, hint: entry.hint }));
  return {
    entity: 'wiki_shimmer_manifest',
    generatedAt,
    sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
    page: buildSourceMeta(rawPayload),
    outputs: {
      contextRecords: 1,
      itemTransforms: itemTransforms.records.length,
      decraftRules: decraftRules.records.length,
      entityTransforms: entityTransforms.records.length,
      npcTransforms: npcTransforms.records.length
    },
    resolution: {
      totalResolvedTitles: titleMeta.size - unresolvedEntries.length,
      unresolvedCount: unresolvedEntries.length,
      unresolvedEntries
    }
  };
}

function buildMarkdownSummary(rawPayload, outDir, manifest, itemTransforms, decraftRules, entityTransforms, npcTransforms) {
  return [
    '# Wiki Shimmer Importable Summary',
    '',
    `- Generated at: \`${generatedAt}\``,
    `- Source page: \`${rawPayload.pageTitle}\``,
    `- Revision timestamp: \`${rawPayload.revisionTimestamp}\``,
    `- Output dir: \`${path.relative(repoRoot, outDir).replaceAll('\\', '/')}\``,
    `- Unresolved titles: \`${manifest.resolution.unresolvedCount}\``,
    '',
    '## Counts',
    '',
    `- context: \`1\``,
    `- item transforms: \`${itemTransforms.records.length}\``,
    `- decraft rules: \`${decraftRules.records.length}\``,
    `- entity transforms: \`${entityTransforms.records.length}\``,
    `- npc transforms: \`${npcTransforms.records.length}\``,
    ''
  ].join('\n') + '\n';
}

function extractTables(html) {
  return [...String(html ?? '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => ({
    html: match[0],
    caption: normalizeWhitespace(stripHtml(match[0].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1] ?? '')),
    headers: [...match[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((header) => normalizeWhitespace(stripHtml(header[1]))).filter(Boolean)
  }));
}

function extractDataRows(tableHtml) {
  return [...String(tableHtml ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]))
    .filter((cells) => cells.some((cell) => /<td\b/i.test(`<td>${cell}</td>`)));
}

function parsePrimaryCellEntity(cellHtml) {
  return parseCellEntities(cellHtml)[0] ?? { nameZh: normalizeWhitespace(stripHtml(cellHtml)) ?? null, quantityText: null };
}

function parseCellEntities(cellHtml) {
  const itemBlocks = extractItemBlocks(cellHtml);
  if (itemBlocks.length === 0) {
    return extractAnchorTitles(cellHtml).map((title) => ({ nameZh: title, quantityText: null }));
  }
  return itemBlocks.map((block, index) => {
    const nextStart = itemBlocks[index + 1]?.start ?? String(cellHtml ?? '').length;
    return {
      nameZh: extractAnchorTitles(block.html)[0] ?? normalizeWhitespace(stripHtml(block.html)) ?? null,
      quantityText: normalizeQuantityText(String(cellHtml ?? '').slice(block.end, nextStart))
    };
  }).filter((entry) => entry.nameZh);
}

function parseSingleCellListTable(tableHtml) {
  const rows = extractDataRows(tableHtml);
  return rows.length === 0 ? [] : parseCellEntities(rows[0][0] ?? '');
}

function extractItemBlocks(cellHtml) {
  const html = String(cellHtml ?? '');
  const blocks = [];
  const tagPattern = /<\/?span\b[^>]*>/gi;
  let currentStart = -1;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[0];
    if (!tag.startsWith('</')) {
      const tokens = ((tag.match(/\bclass="([^"]+)"/i)?.[1]) ?? '').split(/\s+/).filter(Boolean);
      const isItemSpan = tokens.includes('i');
      if (currentStart === -1 && isItemSpan) {
        currentStart = match.index;
        depth = 1;
      } else if (currentStart !== -1) {
        depth += 1;
      }
      continue;
    }
    if (currentStart !== -1) {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ html: html.slice(currentStart, tagPattern.lastIndex), start: currentStart, end: tagPattern.lastIndex });
        currentStart = -1;
      }
    }
  }
  return blocks;
}

function extractAnchorTitles(html) {
  const titles = [];
  for (const match of String(html ?? '').matchAll(/<a\b[^>]*title="([^"]+)"[^>]*>/gi)) {
    const title = normalizeWhitespace(decodeHtmlEntities(match[1]));
    if (title && !title.startsWith('File:') && !titles.includes(title)) {
      titles.push(title);
    }
  }
  return titles;
}

function extractFirstImage(html) {
  const match = String(html ?? '').match(/<img\b([^>]*?)>/i);
  if (!match) return null;
  const attrs = parseAttributes(match[1]);
  return {
    src: attrs.src ? (attrs.src.startsWith('http') ? attrs.src : `https://terraria.wiki.gg${attrs.src}`) : null,
    alt: normalizeWhitespace(decodeHtmlEntities(attrs.alt ?? '')) || null
  };
}

function parseAttributes(raw) {
  const attrs = {};
  for (const match of String(raw ?? '').matchAll(/([A-Za-z_:][A-Za-z0-9_:\-.]*)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function normalizeQuantityText(html) {
  const text = normalizeWhitespace(stripHtml(html));
  return text ? text.replace(/^×\s*/, '').trim() || null : null;
}

function buildEntityLookup(records) {
  const lookup = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const nameKey = normalizeKey(record?.name);
    const internalKey = normalizeKey(record?.internalName);
    if (nameKey && !lookup.has(nameKey)) lookup.set(nameKey, record);
    if (internalKey && !lookup.has(internalKey)) lookup.set(internalKey, record);
  }
  return lookup;
}

async function resolveTitleMeta(zhTitles, wikiApiUrl, itemLookup, npcLookup) {
  const langlinks = await fetchEnglishLanglinks(zhTitles, wikiApiUrl);
  const titleMeta = new Map();
  for (const titleZh of zhTitles) {
    const nameZh = normalizeWhitespace(titleZh);
    if (!nameZh) continue;
    const nameEn = langlinks.get(nameZh) ?? (looksAscii(nameZh) ? nameZh : null);
    const key = normalizeKey(nameEn);
    const item = key ? itemLookup.get(key) ?? null : null;
    const npc = key ? npcLookup.get(key) ?? null : null;
    if (isItemGroupName(nameZh, nameEn)) {
      titleMeta.set(nameZh, { kind: 'item_group', nameZh, nameEn, internalName: null, hint: 'item_group' });
    } else if (item && !npc) {
      titleMeta.set(nameZh, { kind: 'item', nameZh, nameEn: item.name, internalName: item.internalName, hint: 'item' });
    } else if (npc && !item) {
      titleMeta.set(nameZh, { kind: 'npc', nameZh, nameEn: npc.name, internalName: npc.internalName, hint: 'npc' });
    } else if (item && npc) {
      titleMeta.set(nameZh, { kind: 'ambiguous', nameZh, nameEn, internalName: null, hint: 'ambiguous' });
    } else {
      titleMeta.set(nameZh, { kind: 'unresolved', nameZh, nameEn, internalName: null, hint: 'unresolved' });
    }
  }
  return titleMeta;
}

async function fetchEnglishLanglinks(titles, wikiApiUrl) {
  const mapping = new Map();
  for (const batch of chunkArray([...titles], 8)) {
    const url = new URL(wikiApiUrl);
    const form = new URLSearchParams();
    form.set('action', 'query');
    form.set('titles', batch.join('|'));
    form.set('prop', 'langlinks');
    form.set('lllang', 'en');
    form.set('redirects', '1');
    form.set('formatversion', '2');
    form.set('format', 'json');
    const body = await fetchWikiApiJson({
      url,
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: form,
      profile: 'revision',
      sourceKey: `shimmer-langlinks:${batch[0]}`
    });
    for (const page of body?.query?.pages ?? []) {
      const zhTitle = normalizeWhitespace(page?.title);
      const enTitle = normalizeWhitespace(page?.langlinks?.[0]?.title);
      if (zhTitle && enTitle) mapping.set(zhTitle, enTitle);
    }
  }
  return mapping;
}

function collectLinkedTitlesFromTables(tables) {
  const titles = new Set();
  for (const table of tables) {
    for (const title of extractAnchorTitles(table.html)) titles.add(title);
  }
  return titles;
}

function isItemGroupName(nameZh, nameEn) {
  const zh = normalizeWhitespace(nameZh) ?? '';
  const en = normalizeWhitespace(nameEn) ?? '';
  return zh.startsWith('\u4efb\u4f55') || zh.startsWith('\u4efb\u610f') || ITEM_GROUP_ALIASES.has(en);
}

function deriveConditions(text) {
  const notes = normalizeWhitespace(text);
  if (!notes) return [];
  const conditions = [];
  for (const boss of BOSS_REQUIREMENTS) {
    if (notes.includes(boss.nameZh) || notes.includes(boss.nameEn)) {
      conditions.push({ type: 'boss_defeated', code: boss.code, nameZh: boss.nameZh, nameEn: boss.nameEn });
    }
  }
  for (const phase of MOON_PHASES) {
    if (notes.includes(phase.nameZh) || notes.includes(phase.nameEn)) {
      conditions.push({ type: 'moon_phase', code: phase.code, nameZh: phase.nameZh, nameEn: phase.nameEn });
    }
  }
  return conditions;
}

function formatResolved(entry, titleMeta, hint) {
  const resolved = resolveReference(entry, titleMeta, hint);
  return { kind: resolved.kind, nameZh: resolved.nameZh, nameEn: resolved.nameEn, internalName: resolved.internalName, quantityText: entry?.quantityText ?? null };
}

function resolveReference(entry, titleMeta, hint) {
  const nameZh = entry?.nameZh ?? null;
  const meta = titleMeta.get(nameZh) ?? { kind: hint === 'npc' ? 'npc' : 'item', nameZh: normalizeWhitespace(nameZh), nameEn: null, internalName: null };
  return meta;
}

function buildSourceMeta(rawPayload) {
  return { sourcePage: rawPayload.pageTitle, sourceRevisionTimestamp: rawPayload.revisionTimestamp, sourcePageId: rawPayload.pageId };
}

function extractIntroHtml(html) {
  const firstHeadingIndex = String(html ?? '').search(/<h2\b/i);
  return firstHeadingIndex === -1 ? String(html ?? '') : String(html ?? '').slice(0, firstHeadingIndex);
}

function buildDecraftCode(ruleType, index) {
  return `shimmer_${ruleType}_${String(index).padStart(4, '0')}`;
}

function normalizeWhitespace(value) {
  const decoded = decodeHtmlEntities(String(value ?? '')).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return decoded || null;
}

function normalizeKey(value) {
  const text = normalizeWhitespace(value);
  return text ? text.toLowerCase().replace(/\s+/g, ' ').trim() : '';
}

function looksAscii(value) {
  return /^[\x00-\x7F]+$/.test(String(value ?? ''));
}
