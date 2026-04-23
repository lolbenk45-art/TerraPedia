import { decodeHtmlEntities, stripHtml } from '../lib/wiki-page-utils.mjs';

const TABLE_ROLE_SEQUENCE = [
  { role: 'item_transforms', label: '物品嬗变' },
  { role: 'decraft_multi_recipe', label: '有多个配方的物品' },
  { role: 'decraft_evil_branch', label: '有两种邪恶生物群系配方的物品' },
  { role: 'decraft_unique', label: '有独特拆解的物品' },
  { role: 'decraft_random_partial', label: '拆解为随机部分材料的物品' },
  { role: 'decraft_locked_skeletron', label: '直到骷髅王被击败才可拆解的物品' },
  { role: 'decraft_locked_golem', label: '直到石巨人被击败才可拆解的物品' },
  { role: 'decraft_not_allowed', label: '不可拆解的物品' },
  { role: 'critter_to_item', label: '嬗变为物品的小动物' },
  { role: 'enemy_transforms', label: '敌怪嬗变' },
  { role: 'critter_to_faeling', label: '嬗变为飞灵的小动物' },
  { role: 'slime_to_shimmer_slime', label: '嬗变为微光史莱姆的史莱姆' },
  { role: 'npc_transforms', label: 'NPC 微光形态' },
];

const FIXED_NPC_OUTPUTS = {
  critter_to_faeling: { nameZh: '飞灵', nameEn: 'Faeling', internalName: 'Shimmerfly' },
  slime_to_shimmer_slime: { nameZh: '微光史莱姆', nameEn: 'Shimmer Slime', internalName: 'ShimmerSlime' },
};

const ITEM_GROUP_ALIASES = new Set(['Any Fruit', 'Any Torch', 'Any Pylon', 'Recorded Music Boxes']);
const MOON_PHASES = [
  { code: 'FULL_MOON', nameZh: '满月', nameEn: 'Full Moon' },
  { code: 'WANING_GIBBOUS', nameZh: '亏凸月', nameEn: 'Waning Gibbous' },
  { code: 'LAST_QUARTER', nameZh: '下弦月', nameEn: 'Last Quarter' },
  { code: 'THIRD_QUARTER', nameZh: '下弦月', nameEn: 'Third Quarter' },
  { code: 'WANING_CRESCENT', nameZh: '残月', nameEn: 'Waning Crescent' },
  { code: 'NEW_MOON', nameZh: '新月', nameEn: 'New Moon' },
  { code: 'WAXING_CRESCENT', nameZh: '娥眉月', nameEn: 'Waxing Crescent' },
  { code: 'FIRST_QUARTER', nameZh: '上弦月', nameEn: 'First Quarter' },
  { code: 'WAXING_GIBBOUS', nameZh: '盈凸月', nameEn: 'Waxing Gibbous' },
];
const BOSS_REQUIREMENTS = [
  { code: 'MOON_LORD', nameZh: '月亮领主', nameEn: 'Moon Lord' },
  { code: 'SKELETRON', nameZh: '骷髅王', nameEn: 'Skeletron' },
  { code: 'GOLEM', nameZh: '石巨人', nameEn: 'Golem' },
];

export function extractShimmerStructuredRecords(rawPayload) {
  const tables = extractTables(rawPayload?.html);
  if (tables.length < TABLE_ROLE_SEQUENCE.length) {
    throw new Error(`Unexpected shimmer table count: expected at least ${TABLE_ROLE_SEQUENCE.length}, got ${tables.length}`);
  }

  return {
    itemTransforms: buildItemTransformRecords(rawPayload, tables[0]),
    decraftRules: buildDecraftRuleRecords(rawPayload, tables.slice(1, 8)),
    entityTransforms: buildEntityTransformRecords(rawPayload, tables.slice(8, 12)),
    npcTransforms: buildNpcTransformRecords(rawPayload, tables[12]),
  };
}

function buildItemTransformRecords(rawPayload, table) {
  return extractDataRows(table.html).map((cells, index) => {
    const input = resolveReference(parsePrimaryCellEntity(cells[0]), 'item');
    const output = resolveReference(parsePrimaryCellEntity(cells[1]), 'item');
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
      ...buildSourceMeta(rawPayload),
    };
  });
}

function buildDecraftRuleRecords(rawPayload, tablesSubset) {
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
          input: resolveReference(parsePrimaryCellEntity(cells[0]), 'item'),
          outputs: parseCellEntities(cells[1]).map((entry) => resolveReference(entry, 'item')),
          conditions: [],
          notes: null,
          sourceSection: TABLE_ROLE_SEQUENCE[index + 1].label,
          ...buildSourceMeta(rawPayload),
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
          input: resolveReference(parsePrimaryCellEntity(cells[0]), 'item'),
          outputs: [
            ...parseCellEntities(cells[1]).map((entry) => ({ branch: 'corruption', ...resolveReference(entry, 'item') })),
            ...parseCellEntities(cells[2]).map((entry) => ({ branch: 'crimson', ...resolveReference(entry, 'item') })),
          ],
          conditions: [],
          notes: null,
          sourceSection: TABLE_ROLE_SEQUENCE[index + 1].label,
          ...buildSourceMeta(rawPayload),
        });
      }
      continue;
    }
    for (const entry of parseSingleCellListTable(table.html)) {
      records.push({
        code: buildDecraftCode(role, records.length + 1),
        ruleType: role,
        groupLabel: caption,
        input: resolveReference(entry, 'item'),
        outputs: [],
        conditions: deriveConditions(caption),
        notes: null,
        sourceSection: TABLE_ROLE_SEQUENCE[index + 1].label,
        ...buildSourceMeta(rawPayload),
      });
    }
  }
  return records;
}

function buildEntityTransformRecords(rawPayload, tablesSubset) {
  const records = [];
  for (const [index, table] of tablesSubset.entries()) {
    const role = TABLE_ROLE_SEQUENCE[index + 8].role;
    if (role === 'critter_to_item' || role === 'enemy_transforms') {
      for (const cells of extractDataRows(table.html)) {
        records.push({
          code: `shimmer_entity_transform_${String(records.length + 1).padStart(4, '0')}`,
          transformGroup: role,
          input: resolveReference(parsePrimaryCellEntity(cells[0]), 'npc'),
          output: resolveReference(parsePrimaryCellEntity(cells[1]), role === 'critter_to_item' ? 'item' : 'npc'),
          sourceSection: TABLE_ROLE_SEQUENCE[index + 8].label,
          ...buildSourceMeta(rawPayload),
        });
      }
      continue;
    }
    const fixedOutput = FIXED_NPC_OUTPUTS[role];
    for (const entry of parseSingleCellListTable(table.html)) {
      records.push({
        code: `shimmer_entity_transform_${String(records.length + 1).padStart(4, '0')}`,
        transformGroup: role,
        input: resolveReference(entry, 'npc'),
        output: {
          kind: 'npc',
          nameZh: fixedOutput.nameZh,
          nameEn: fixedOutput.nameEn,
          internalName: fixedOutput.internalName,
          quantityText: null,
        },
        sourceSection: TABLE_ROLE_SEQUENCE[index + 8].label,
        ...buildSourceMeta(rawPayload),
      });
    }
  }
  return records;
}

function buildNpcTransformRecords(rawPayload, table) {
  return extractDataRows(table.html).map((cells, index) => {
    const shimmerImage = extractFirstImage(cells[1] ?? '');
    return {
      code: `shimmer_npc_transform_${String(index + 1).padStart(4, '0')}`,
      npc: resolveReference(parsePrimaryCellEntity(cells[0]), 'npc'),
      appearanceVariant: 'shimmer',
      effectType: 'visual_only',
      variantImageUrl: shimmerImage?.src ?? null,
      variantImageAlt: shimmerImage?.alt ?? null,
      notes: '仅影响外观',
      sourceSection: TABLE_ROLE_SEQUENCE[12].label,
      ...buildSourceMeta(rawPayload),
    };
  });
}

function buildDecraftCode(ruleType, index) {
  return `shimmer_${ruleType}_${String(index).padStart(4, '0')}`;
}

function resolveReference(entry, hint) {
  const nameZh = normalizeWhitespace(entry?.nameZh);
  const nameEn = looksAscii(nameZh) ? nameZh : null;
  return {
    kind: inferEntityKind(nameZh, hint),
    nameZh,
    nameEn,
    internalName: null,
    quantityText: entry?.quantityText ?? null,
  };
}

function inferEntityKind(name, hint) {
  if (hint === 'npc') return 'npc';
  if (hint === 'item_group') return 'item_group';
  if (isItemGroupName(name)) return 'item_group';
  return 'item';
}

function isItemGroupName(name) {
  const value = normalizeWhitespace(name) ?? '';
  return value.startsWith('Any ') || value.startsWith('任何') || value.startsWith('任意') || ITEM_GROUP_ALIASES.has(value);
}

function extractTables(html) {
  return [...String(html ?? '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => ({
    html: match[0],
    caption: normalizeWhitespace(stripHtml(match[0].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1] ?? '')),
  }));
}

function extractDataRows(tableHtml) {
  return [...String(tableHtml ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => ({
      rowHtml: rowMatch[1],
      cells: [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]),
    }))
    .filter((row) => /<td\b/i.test(row.rowHtml))
    .map((row) => row.cells);
}

function parsePrimaryCellEntity(cellHtml) {
  return parseCellEntities(cellHtml)[0] ?? { nameZh: normalizeWhitespace(stripHtml(cellHtml)) ?? null, quantityText: null };
}

function parseCellEntities(cellHtml) {
  const itemBlocks = extractItemBlocks(cellHtml);
  if (itemBlocks.length === 0) {
    return extractAnchorTitles(cellHtml).map((title) => ({ nameZh: title, quantityText: null }));
  }
  return itemBlocks
    .map((block, index) => {
      const nextStart = itemBlocks[index + 1]?.start ?? String(cellHtml ?? '').length;
      return {
        nameZh: extractAnchorTitles(block.html)[0] ?? normalizeWhitespace(stripHtml(block.html)) ?? null,
        quantityText: normalizeQuantityText(String(cellHtml ?? '').slice(block.end, nextStart)),
      };
    })
    .filter((entry) => entry.nameZh);
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
    alt: normalizeWhitespace(decodeHtmlEntities(attrs.alt ?? '')) || null,
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

function buildSourceMeta(rawPayload) {
  return {
    sourcePage: rawPayload?.pageTitle ?? null,
    sourceRevisionTimestamp: rawPayload?.revisionTimestamp ?? null,
    sourcePageId: rawPayload?.pageId ?? null,
  };
}

function normalizeWhitespace(value) {
  const decoded = decodeHtmlEntities(String(value ?? '')).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return decoded || null;
}

function looksAscii(value) {
  return /^[\x00-\x7F]+$/.test(String(value ?? ''));
}
