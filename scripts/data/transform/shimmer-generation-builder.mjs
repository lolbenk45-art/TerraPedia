import { extractShimmerStructuredRecords } from '../maint/shimmer-structured-parser.mjs';

const ITEM_GROUP_ALIASES = new Set(['Any Fruit', 'Any Torch', 'Any Pylon', 'Recorded Music Boxes']);

export const SHIMMER_TITLE_META_OVERRIDES = new Map([
  ['录音后的八音盒', { kind: 'item_group', nameEn: 'Recorded Music Boxes', internalName: null }],
  ['天后史莱姆', { kind: 'npc', nameEn: 'Diva Slime', internalName: 'TownSlimeRainbow' }],
  ['史莱姆僵尸', { kind: 'npc', nameEn: 'Slimed Zombie', internalName: 'SlimedZombie' }],
  ['沼泽僵尸', { kind: 'npc', nameEn: 'Swamp Zombie', internalName: 'SwampZombie' }],
  ['中箭僵尸', { kind: 'npc', nameEn: 'Pincushion Zombie', internalName: 'PincushionZombie' }],
  ['秃头僵尸', { kind: 'npc', nameEn: 'Bald Zombie', internalName: 'BaldZombie' }],
  ['畸形骷髅', { kind: 'npc', nameEn: 'Misassembled Skeleton', internalName: 'MisassembledSkeleton' }],
  ['纤瘦僵尸', { kind: 'npc', nameEn: 'Twiggy Zombie', internalName: 'TwiggyZombie' }],
  ['女性僵尸', { kind: 'npc', nameEn: 'Female Zombie', internalName: 'FemaleZombie' }],
  ['无裤骷髅', { kind: 'npc', nameEn: 'Pantless Skeleton', internalName: 'PantlessSkeleton' }],
  ['武装僵尸', { kind: 'npc', nameEn: 'Armed Zombie', internalName: 'ArmedZombie' }],
  ['武装史莱姆僵尸', { kind: 'npc', nameEn: 'Armed Slimed Zombie', internalName: 'ArmedZombieSlimed' }],
  ['武装沼泽僵尸', { kind: 'npc', nameEn: 'Armed Swamp Zombie', internalName: 'ArmedZombieSwamp' }],
  ['武装火把僵尸', { kind: 'npc', nameEn: 'Armed Torch Zombie', internalName: 'ArmedTorchZombie' }],
  ['武装中箭僵尸', { kind: 'npc', nameEn: 'Armed Pincushion Zombie', internalName: 'ArmedZombiePincussion' }],
  ['骨头投掷头痛骷髅', { kind: 'npc', nameEn: 'Bone Throwing Skeleton', internalName: 'BoneThrowingSkeleton2' }],
  ['骨头投掷畸形骷髅', { kind: 'npc', nameEn: 'Bone Throwing Skeleton', internalName: 'BoneThrowingSkeleton3' }],
  ['史莱姆兔兔', { kind: 'npc', nameEn: 'Slime Bunny', internalName: 'BunnySlimed' }],
  ['兔兔史莱姆', { kind: 'npc', nameEn: 'Bunny Slime', internalName: 'SlimeMasked' }],
  ['绿礼物史莱姆', { kind: 'npc', nameEn: 'Green Present Slime', internalName: 'SlimeRibbonGreen' }],
  ['红礼物史莱姆', { kind: 'npc', nameEn: 'Red Present Slime', internalName: 'SlimeRibbonRed' }],
  ['黄礼物史莱姆', { kind: 'npc', nameEn: 'Yellow Present Slime', internalName: 'SlimeRibbonYellow' }],
  ['白礼物史莱姆', { kind: 'npc', nameEn: 'White Present Slime', internalName: 'SlimeRibbonWhite' }]
]);

export function buildShimmerGeneration(input = {}) {
  const generatedAt = requireTimestamp(input.generatedAt);
  const raw = input.raw ?? null;
  if (!raw || typeof raw !== 'object') {
    throw new Error('shimmer generation requires a raw page payload');
  }
  const parsed = extractShimmerStructuredRecords(raw);
  const titleMeta = resolveFrozenTitleMeta({
    parsed,
    itemRecords: input.itemRecords,
    npcRecords: input.npcRecords,
    langlinkEvidence: input.langlinkEvidence
  });

  return {
    context: buildContextPayload(raw, parsed, generatedAt),
    itemTransforms: buildItemTransforms(parsed, titleMeta),
    decraftRules: buildDecraftRules(parsed, titleMeta),
    entityTransforms: buildEntityTransforms(parsed, titleMeta),
    npcTransforms: buildNpcTransforms(parsed, titleMeta),
    titleResolution: buildTitleResolutionEvidence(titleMeta)
  };
}

export function resolveFrozenTitleMeta({ parsed, itemRecords, npcRecords, langlinkEvidence } = {}) {
  const langlinks = normalizeLanglinkEvidence(langlinkEvidence);
  const itemLookup = buildEntityLookup(itemRecords);
  const npcLookup = buildEntityLookup(npcRecords);
  const meta = new Map();

  for (const nameZh of collectCandidateTitles(parsed)) {
    const override = SHIMMER_TITLE_META_OVERRIDES.get(nameZh) ?? null;
    if (override) {
      meta.set(nameZh, {
        kind: override.kind,
        nameZh,
        nameEn: override.nameEn,
        internalName: override.internalName,
        hint: 'override'
      });
      continue;
    }
    const nameEn = langlinks.has(nameZh)
      ? langlinks.get(nameZh)
      : (looksAscii(nameZh) ? nameZh : null);
    const candidates = buildLookupCandidates(nameZh, nameEn);
    const item = findLookupRecord(itemLookup, candidates);
    const npc = findLookupRecord(npcLookup, candidates);

    if (isItemGroupName(nameZh, nameEn)) {
      meta.set(nameZh, { kind: 'item_group', nameZh, nameEn, internalName: null, hint: 'item_group' });
    } else if (item && npc) {
      meta.set(nameZh, { kind: 'ambiguous', nameZh, nameEn, internalName: null, hint: 'ambiguous' });
    } else if (item) {
      meta.set(nameZh, { kind: 'item', nameZh, nameEn: item.name, internalName: item.internalName, hint: 'item' });
    } else if (npc) {
      meta.set(nameZh, { kind: 'npc', nameZh, nameEn: npc.name, internalName: npc.internalName, hint: 'npc' });
    } else {
      meta.set(nameZh, { kind: 'unresolved', nameZh, nameEn, internalName: null, hint: 'unresolved' });
    }
  }
  return meta;
}

function normalizeLanglinkEvidence(evidence) {
  const rows = Array.isArray(evidence)
    ? evidence
    : (evidence instanceof Map ? [...evidence].map(([nameZh, nameEn]) => ({ nameZh, nameEn })) : []);
  const map = new Map();
  for (const row of rows) {
    const nameZh = normalizeWhitespace(row?.nameZh);
    if (!nameZh) continue;
    if (map.has(nameZh)) {
      throw new Error(`duplicate langlink evidence title: ${nameZh}`);
    }
    map.set(nameZh, normalizeWhitespace(row?.nameEn) ?? null);
  }
  return map;
}

function collectCandidateTitles(parsed) {
  const titles = new Set();
  const add = (value) => {
    const text = normalizeWhitespace(value);
    if (text) titles.add(text);
  };
  for (const record of parsed.itemTransforms) {
    add(record.inputNameZh);
    add(record.outputNameZh);
  }
  for (const record of parsed.decraftRules) {
    add(record.input?.nameZh);
    for (const output of record.outputs ?? []) add(output?.nameZh);
  }
  for (const record of parsed.entityTransforms) {
    add(record.input?.nameZh);
    add(record.output?.nameZh);
  }
  for (const record of parsed.npcTransforms) {
    add(record.npc?.nameZh);
  }
  return [...titles].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function buildContextPayload(raw, parsed, generatedAt) {
  return {
    generatedAt,
    sourcePage: raw.pageTitle ?? null,
    sourcePageId: raw.pageId ?? null,
    sourceRevisionTimestamp: raw.revisionTimestamp ?? null,
    tableRoleVersion: parsed.tableRoleVersion
  };
}

function buildItemTransforms(parsed, titleMeta) {
  return parsed.itemTransforms.map((record) => {
    const input = resolveReference({ nameZh: record.inputNameZh }, titleMeta, 'item');
    const output = resolveReference({ nameZh: record.outputNameZh }, titleMeta, 'item');
    return {
      ...record,
      inputKind: input.kind,
      inputNameEn: input.nameEn,
      inputInternalName: input.internalName,
      outputKind: output.kind,
      outputNameEn: output.nameEn,
      outputInternalName: output.internalName
    };
  });
}

function buildDecraftRules(parsed, titleMeta) {
  return parsed.decraftRules.map((record) => ({
    ...record,
    input: resolveReference(record.input, titleMeta, 'item'),
    outputs: (record.outputs ?? []).map((output) => ({
      ...(output.branch ? { branch: output.branch } : {}),
      ...resolveReference(output, titleMeta, 'item')
    }))
  }));
}

function buildEntityTransforms(parsed, titleMeta) {
  return parsed.entityTransforms.map((record) => ({
    ...record,
    input: resolveReference(record.input, titleMeta, 'npc'),
    output: record.output?.internalName
      ? record.output
      : resolveReference(record.output, titleMeta, record.transformGroup === 'critter_to_item' ? 'item' : 'npc')
  }));
}

function buildNpcTransforms(parsed, titleMeta) {
  return parsed.npcTransforms.map((record) => ({
    ...record,
    npc: resolveReference(record.npc, titleMeta, 'npc')
  }));
}

function buildTitleResolutionEvidence(titleMeta) {
  return [...titleMeta.values()].map((entry) => ({
    nameZh: entry.nameZh,
    nameEn: entry.nameEn,
    kind: entry.kind,
    internalName: entry.internalName,
    hint: entry.hint
  }));
}

function resolveReference(entry, titleMeta, hint) {
  const nameZh = normalizeWhitespace(entry?.nameZh);
  const quantityText = entry?.quantityText ?? null;
  const meta = nameZh ? titleMeta.get(nameZh) : null;
  if (!meta) {
    return { kind: 'unresolved', nameZh, nameEn: null, internalName: null, quantityText };
  }
  return {
    kind: meta.kind,
    nameZh: meta.nameZh,
    nameEn: meta.nameEn,
    internalName: meta.internalName,
    quantityText
  };
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

function buildLookupCandidates(nameZh, nameEn) {
  const candidates = [normalizeKey(nameZh), normalizeKey(nameEn)];
  const singular = singularizeEnglishLabel(nameEn);
  if (singular) candidates.push(normalizeKey(singular));
  return [...new Set(candidates.filter(Boolean))];
}

function findLookupRecord(lookup, candidates) {
  for (const key of candidates) {
    if (lookup.has(key)) return lookup.get(key);
  }
  return null;
}

function isItemGroupName(nameZh, nameEn) {
  const zh = normalizeWhitespace(nameZh) ?? '';
  const en = normalizeWhitespace(nameEn) ?? '';
  return zh.startsWith('任何') || zh.startsWith('任意') || ITEM_GROUP_ALIASES.has(en);
}

function singularizeEnglishLabel(value) {
  const text = normalizeWhitespace(value);
  if (!text) return null;
  if (text.endsWith('ies')) return `${text.slice(0, -3)}y`;
  if (text.endsWith('es')) return text.slice(0, -2);
  if (text.endsWith('s')) return text.slice(0, -1);
  return null;
}

function requireTimestamp(value) {
  const text = normalizeWhitespace(value);
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new Error('shimmer generation requires an explicit ISO generatedAt');
  }
  return text;
}

function normalizeKey(value) {
  const text = normalizeWhitespace(value);
  return text ? text.toLowerCase().replace(/\s+/g, ' ').trim() : '';
}

function normalizeWhitespace(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function looksAscii(value) {
  return /^[\x00-\x7F]+$/.test(String(value ?? ''));
}
