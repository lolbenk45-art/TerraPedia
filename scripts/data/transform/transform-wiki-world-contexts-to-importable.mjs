#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();

const CONTEXT_DEFINITIONS = [
  { code: 'DAY', nameEn: 'Day', nameZh: '白天', contextType: 'TIME', sourcePage: 'Day and night cycle', sortOrder: 205 },
  { code: 'NIGHT', nameEn: 'Night', nameZh: '夜晚', contextType: 'TIME', sourcePage: 'Day and night cycle', sortOrder: 210 },
  { code: 'NEW_MOON', nameEn: 'New Moon', nameZh: '新月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 110 },
  { code: 'WAXING_CRESCENT', nameEn: 'Waxing Crescent', nameZh: '娥眉月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 120 },
  { code: 'FIRST_QUARTER', nameEn: 'First Quarter', nameZh: '上弦月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 130 },
  { code: 'WAXING_GIBBOUS', nameEn: 'Waxing Gibbous', nameZh: '盈凸月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 140 },
  { code: 'FULL_MOON', nameEn: 'Full Moon', nameZh: '满月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 150 },
  { code: 'WANING_GIBBOUS', nameEn: 'Waning Gibbous', nameZh: '亏凸月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 160 },
  { code: 'LAST_QUARTER', nameEn: 'Last Quarter', nameZh: '下弦月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 170 },
  { code: 'WANING_CRESCENT', nameEn: 'Waning Crescent', nameZh: '残月', contextType: 'MOON_PHASE', sourcePage: 'Moon phase', sortOrder: 180 },
  { code: 'RAIN', nameEn: 'Rain', nameZh: '雨', contextType: 'WEATHER', sourcePage: 'Rain', sortOrder: 215 },
  { code: 'SANDSTORM', nameEn: 'Sandstorm', nameZh: '沙尘暴', contextType: 'WEATHER', sourcePage: 'Sandstorm', sortOrder: 225 },
  { code: 'WINDY_DAY', nameEn: 'Windy Day', nameZh: '大风天', contextType: 'WEATHER', sourcePage: 'Windy Day', sortOrder: 230 },
  { code: 'THUNDERSTORM', nameEn: 'Thunderstorm', nameZh: '雷雨', contextType: 'WEATHER', sourcePage: 'Thunderstorm', sortOrder: 235 },
  { code: 'STARFALL', nameEn: 'Starfall', nameZh: '落星雨', contextType: 'EVENT', sourcePage: 'Starfall', sortOrder: 238 },
  { code: 'BLOOD_MOON', nameEn: 'Blood Moon', nameZh: '血月', contextType: 'EVENT', sourcePage: 'Blood Moon', sortOrder: 220 },
  { code: 'PARTY', nameEn: 'Party', nameZh: '派对', contextType: 'EVENT', sourcePage: 'Party', sortOrder: 240 },
  { code: 'LANTERN_NIGHT', nameEn: 'Lantern Night', nameZh: '灯笼夜', contextType: 'EVENT', sourcePage: 'Lantern Night', sortOrder: 245 },
  { code: 'GOBLIN_ARMY', nameEn: 'Goblin Army', nameZh: '哥布林军队', contextType: 'EVENT', sourcePage: 'Goblin Army', sortOrder: 246 },
  { code: 'SLIME_RAIN', nameEn: 'Slime Rain', nameZh: '史莱姆雨', contextType: 'EVENT', sourcePage: 'Slime Rain', sortOrder: 247 },
  { code: 'SOLAR_ECLIPSE', nameEn: 'Solar Eclipse', nameZh: '日食', contextType: 'EVENT', sourcePage: 'Solar Eclipse', sortOrder: 248 },
  { code: 'OLD_ONES_ARMY', nameEn: "Old One's Army", nameZh: '撒旦军队', contextType: 'EVENT', sourcePage: "Old One's Army", sortOrder: 249 },
  { code: 'HALLOWEEN', nameEn: 'Halloween', nameZh: '万圣节', contextType: 'EVENT', sourcePage: 'Events', sortOrder: 250 },
  { code: 'CHRISTMAS', nameEn: 'Christmas', nameZh: '圣诞节', contextType: 'EVENT', sourcePage: 'Events', sortOrder: 260 },
  { code: 'VALENTINES_DAY', nameEn: "Valentine's Day", nameZh: '情人节', contextType: 'EVENT', sourcePage: 'Events', sortOrder: 270 },
  { code: 'THANKSGIVING', nameEn: 'Thanksgiving', nameZh: '感恩节', contextType: 'EVENT', sourcePage: 'Events', sortOrder: 280 },
  { code: 'OKTOBERFEST', nameEn: 'Oktoberfest', nameZh: '十月啤酒节', contextType: 'EVENT', sourcePage: 'Events', sortOrder: 290 },
  { code: 'TORCH_GOD', nameEn: 'The Torch God', nameZh: '火把神', contextType: 'EVENT', sourcePage: 'The Torch God', sortOrder: 291 },
  { code: 'FROST_LEGION', nameEn: 'Frost Legion', nameZh: '雪人军团', contextType: 'EVENT', sourcePage: 'Frost Legion', sortOrder: 292 },
  { code: 'PIRATE_INVASION', nameEn: 'Pirate Invasion', nameZh: '海盗入侵', contextType: 'EVENT', sourcePage: 'Pirate Invasion', sortOrder: 293 },
  { code: 'PUMPKIN_MOON', nameEn: 'Pumpkin Moon', nameZh: '南瓜月', contextType: 'EVENT', sourcePage: 'Pumpkin Moon', sortOrder: 294 },
  { code: 'FROST_MOON', nameEn: 'Frost Moon', nameZh: '霜月', contextType: 'EVENT', sourcePage: 'Frost Moon', sortOrder: 295 },
  { code: 'MARTIAN_MADNESS', nameEn: 'Martian Madness', nameZh: '火星暴乱', contextType: 'EVENT', sourcePage: 'Martian Madness', sortOrder: 296 },
  { code: 'LUNAR_EVENTS', nameEn: 'Lunar Events', nameZh: '月亮事件', contextType: 'EVENT', sourcePage: 'Lunar Events', sortOrder: 297 },
  { code: 'ECTO_MIST', nameEn: 'Ecto Mist', nameZh: '灵雾', contextType: 'ENVIRONMENT', sourcePage: 'Graveyard', sortOrder: 10 },
  { code: 'SNOW', nameEn: 'Snow', nameZh: '雪原', contextType: 'ENVIRONMENT', sourcePage: 'Snow biome', sortOrder: 20 },
  { code: 'SHIMMER', nameEn: 'Shimmer', nameZh: '微光', contextType: 'ENVIRONMENT', sourcePage: 'Shimmer', sortOrder: 30 }
];

export function buildWorldContextImportable(payload, {
  generatedAt = new Date().toISOString(),
  sourceFile = null
} = {}) {
  const definitionCountBySourcePage = countDefinitionsBySourcePage(CONTEXT_DEFINITIONS);
  const pageByRequestedTitle = new Map(
    (Array.isArray(payload?.pages) ? payload.pages : [])
      .map(page => [String(page?.requestedTitle ?? page?.title ?? '').trim(), page])
      .filter(([title]) => title)
  );

  const worldContexts = CONTEXT_DEFINITIONS.map(definition => {
    const page = pageByRequestedTitle.get(definition.sourcePage) ?? null;
    const sourceRevisionTimestamp = page?.revisionTimestamp ?? null;
    return {
      code: definition.code,
      nameEn: definition.nameEn,
      nameZh: definition.nameZh,
      contextType: definition.contextType,
      description: buildDescription(definition, page),
      iconUrl: resolveTrustedIconUrl(definition, page, definitionCountBySourcePage),
      sourceProvider: 'wiki_gg',
      sourcePage: definition.sourcePage,
      sourceRevisionTimestamp,
      lastSyncedAt: generatedAt,
      rawJson: JSON.stringify({
        classification: 'wiki_world_context',
        sourcePage: definition.sourcePage,
        sourceTitle: page?.title ?? definition.sourcePage,
        sourceUrl: page?.sourceUrl ?? null,
        sourceIconUrl: page?.iconUrl ?? null,
        sourceRevisionTimestamp,
        sourceIntro: page?.intro ?? null,
        sourceSections: Array.isArray(page?.sections) ? page.sections : []
      }),
      sortOrder: definition.sortOrder,
      status: 1
    };
  });

  return {
    entity: 'wiki_world_contexts_importable',
    generatedAt,
    sourceFile,
    sourceProvider: 'wiki_gg',
    worldContexts,
    summary: {
      worldContextCount: worldContexts.length,
      sourcePageCount: pageByRequestedTitle.size
    }
  };
}

function countDefinitionsBySourcePage(definitions) {
  const counts = new Map();
  for (const definition of definitions) {
    counts.set(definition.sourcePage, (counts.get(definition.sourcePage) ?? 0) + 1);
  }
  return counts;
}

function resolveTrustedIconUrl(definition, page, definitionCountBySourcePage) {
  if ((definitionCountBySourcePage.get(definition.sourcePage) ?? 0) !== 1) {
    return null;
  }
  const iconUrl = typeof page?.iconUrl === 'string' ? page.iconUrl.trim() : '';
  if (!isTrustedWorldContextIconUrl(iconUrl)) {
    return null;
  }
  return iconUrl;
}

function isTrustedWorldContextIconUrl(value) {
  const text = String(value ?? '').trim();
  if (!/\.(?:png|jpg|jpeg|webp|gif)(?:[?#]|$)/i.test(text)) return false;
  return !/(?:Desktop_only|Console_only|Mobile_only|Old-gen_console_version|Nintendo_Switch_version|tModLoader|Journey_Mode|Classic_Mode|Expert_Mode|Master_Mode|Hardmode|Pre-Hardmode|Info_icon|Notice|Question|Achievement|Map_Icon|Bestiary|Icon_|Disambig|Disambiguation|Minecart)/i.test(text);
}

function buildDescription(definition, page) {
  const intro = typeof page?.intro === 'string' ? page.intro.trim() : '';
  if (intro) {
    return intro.length > 500 ? `${intro.slice(0, 497)}...` : intro;
  }
  return `${definition.nameEn} world context sourced from ${definition.sourcePage}.`;
}

function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  const inputPath = path.resolve(process.cwd(), options.input ?? options['input-json'] ?? sharedDataPath('generated', 'wiki-world-contexts.latest.json'));
  const outputPath = path.resolve(process.cwd(), options.output ?? options['output-json'] ?? sharedDataPath('generated', 'wiki-world-contexts.importable.latest.json'));
  const reportPath = path.resolve(process.cwd(), options['report-md'] ?? path.join(repoRoot, 'reports', `wiki-world-contexts-importable-summary-${dateTag}.md`));

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const importable = buildWorldContextImportable(payload, {
    generatedAt,
    sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/')
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(importable, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, buildMarkdown(importable), 'utf8');

  console.log(JSON.stringify({
    outputPath,
    reportPath,
    worldContextCount: importable.worldContexts.length
  }, null, 2));
}

function buildMarkdown(importable) {
  const lines = [
    '# Wiki World Context Importable Summary',
    '',
    `- Generated At: \`${importable.generatedAt}\``,
    `- World Contexts: \`${importable.worldContexts.length}\``,
    ''
  ];
  for (const context of importable.worldContexts) {
    lines.push(`- ${context.code} | ${context.nameEn} | type=${context.contextType} | source=${context.sourcePage}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
