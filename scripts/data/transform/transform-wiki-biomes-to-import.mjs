#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { isOverviewFallbackBiomeRecord } from './biome-transform-filters.mjs';

const repoRoot = process.cwd();
const generatedAt = new Date().toISOString();
const dateTag = generatedAt.slice(0, 10);

const inputPath = path.join(repoRoot, 'data', 'generated', 'wiki-biomes.latest.json');
const outputPath = path.join(repoRoot, 'data', 'generated', 'wiki-biomes.importable.latest.json');
const reportPath = path.join(repoRoot, 'reports', `wiki-biomes-importable-summary-${dateTag}.md`);

const layerTypeMap = new Map([
  ['Space', 'space'],
  ['Surface and Underground', 'surface'],
  ['Cavern', 'cavern'],
  ['Underworld', 'underworld'],
  ['Hardmode', 'hardmode'],
  ['Mini-biomes', 'mini_biome'],
]);

const biomeTypeMap = new Map([
  ['Space', 'space'],
  ['Forest', 'pure'],
  ['Snow biome', 'snow'],
  ['Desert', 'desert'],
  ['The Corruption', 'evil'],
  ['The Crimson', 'evil'],
  ['Jungle', 'jungle'],
  ['Dungeon', 'dungeon'],
  ['Ocean', 'ocean'],
  ['Glowing Mushroom biome', 'mushroom'],
  ['Ice biome', 'snow'],
  ['Underground Desert', 'desert'],
  ['Underground Jungle', 'jungle'],
  ['The Underworld', 'underworld'],
  ['The Hallow', 'holy'],
  ['Underground Hallow', 'holy'],
  ['Underground Corruption', 'evil'],
  ['Underground Crimson', 'evil'],
]);

const codeOverrideMap = new Map([
  ['Snow biome', 'snow'],
  ['Glowing Mushroom biome', 'glowing_mushroom'],
  ['Ice biome', 'ice'],
  ['The Underworld', 'underworld'],
  ['The Hallow', 'hallow'],
  ['The Corruption', 'corruption'],
  ['The Crimson', 'crimson'],
]);

const zhNameMap = new Map([
  ['Space', '太空'],
  ['Forest', '森林'],
  ['Snow biome', '雪原'],
  ['Desert', '沙漠'],
  ['The Corruption', '腐化之地'],
  ['The Crimson', '猩红之地'],
  ['Jungle', '丛林'],
  ['Dungeon', '地牢'],
  ['Ocean', '海洋'],
  ['Glowing Mushroom biome', '发光蘑菇群系'],
  ['Ice biome', '冰雪群系'],
  ['Underground Desert', '地下沙漠'],
  ['Underground Jungle', '地下丛林'],
  ['The Underworld', '地狱'],
  ['The Hallow', '神圣之地'],
  ['Underground Hallow', '地下神圣之地'],
  ['Underground Corruption', '地下腐化之地'],
  ['Underground Crimson', '地下猩红之地'],
  ['Oasis', '绿洲'],
  ['Granite Cave', '花岗岩洞穴'],
  ['Marble Cave', '大理石洞穴'],
  ['Spider Nest', '蜘蛛巢'],
  ['Bee Hive', '蜂巢'],
  ['Glowing moss biome', '发光苔藓群系'],
  ['Ash forest', '灰烬森林'],
  ['Jungle Temple', '丛林神庙'],
  ['Meteorite', '陨石群系'],
  ['Town', '城镇'],
  ['Graveyard', '墓地'],
  ['Aether', '以太'],
]);

const zhAliasMap = new Map([
  ['Snow biome', '雪地|苔原'],
  ['The Underworld', '地狱|冥界'],
  ['The Hallow', '神圣'],
  ['The Corruption', '腐化'],
  ['The Crimson', '猩红'],
  ['Ice biome', '地下雪原|地下冰雪群系'],
  ['Glowing Mushroom biome', '蘑菇群系|发光蘑菇地'],
  ['Town', 'NPC 城镇'],
]);

const relationRules = [
  ['The Corruption', 'The Crimson', 'counterpart'],
  ['The Crimson', 'The Corruption', 'counterpart'],
  ['Snow biome', 'Ice biome', 'surface_to_underground'],
  ['Desert', 'Underground Desert', 'surface_to_underground'],
  ['Jungle', 'Underground Jungle', 'surface_to_underground'],
  ['The Hallow', 'Underground Hallow', 'surface_to_underground'],
  ['The Corruption', 'Underground Corruption', 'surface_to_underground'],
  ['The Crimson', 'Underground Crimson', 'surface_to_underground'],
];

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const biomeByTitle = new Map();
for (const record of payload.records || []) {
  biomeByTitle.set(record.title, record);
}

const filteredRecords = (payload.records || []).filter(record => !isOverviewFallbackBiomeRecord(record));

const biomes = filteredRecords.map(record => {
  const code = deriveCode(record.title);
  const aliasEn = dedupe(record.aliases || [])
    .filter(alias => alias !== record.title)
    .join('|') || null;

  return {
    code,
    nameEn: record.title,
    nameZh: zhNameMap.get(record.title) || null,
    aliasEn,
    aliasZh: zhAliasMap.get(record.title) || null,
    layerType: deriveLayerType(record),
    biomeType: biomeTypeMap.get(record.title) || deriveFallbackBiomeType(record),
    description: record.intro || null,
    iconUrl: toNullableString(record.iconUrl),
    sourceProvider: 'wiki_gg',
    sourcePage: record.title,
    sourceRevisionTimestamp: record.revisionTimestamp || null,
    lastSyncedAt: payload.generatedAt || generatedAt,
    status: 1,
    relations: [],
    resources: [],
  };
});

const biomeCodeByTitle = new Map(biomes.map(biome => [biome.nameEn, biome.code]));
for (const [title, relatedTitle, relationType] of relationRules) {
  const biome = biomes.find(entry => entry.nameEn === title);
  const relatedCode = biomeCodeByTitle.get(relatedTitle);
  if (!biome || !relatedCode) continue;
  biome.relations.push({
    relatedBiomeCode: relatedCode,
    relationType,
    notes: null,
  });
}

for (const derived of payload.derivedRecords || []) {
  const baseCode = biomeCodeByTitle.get(derived.baseBiomeTitle);
  const infectionCode = biomeCodeByTitle.get(derived.infectionSourceTitle);
  if (baseCode && infectionCode) {
    const biome = biomes.find(entry => entry.code === baseCode);
    biome?.relations.push({
      relatedBiomeCode: infectionCode,
      relationType: `${derived.variantType}_variant_source`,
      notes: derived.displayName,
    });
  }
}

const importable = {
  entity: 'wiki_biomes_importable',
  generatedAt,
  sourceFile: path.relative(repoRoot, inputPath).replaceAll('\\', '/'),
  sourceProvider: 'wiki_gg',
  biomes,
  itemBiomes: [],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(importable, null, 2)}\n`, 'utf8');
fs.writeFileSync(reportPath, buildMarkdown(importable, payload), 'utf8');

console.log(JSON.stringify({
  outputPath,
  reportPath,
  biomeCount: biomes.length,
  derivedBiomeCount: (payload.derivedRecords || []).length,
}, null, 2));

function deriveCode(title) {
  if (codeOverrideMap.has(title)) return codeOverrideMap.get(title);
  return String(title)
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/\bbiome\b/gi, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function deriveLayerType(record) {
  if (record.topGroup === 'Hardmode') {
    if (String(record.title).startsWith('Underground ')) return 'cavern_hardmode';
    return 'surface_hardmode';
  }
  return layerTypeMap.get(record.topGroup) || null;
}

function deriveFallbackBiomeType(record) {
  if (record.topGroup === 'Mini-biomes') return 'mini_biome';
  return 'unknown';
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function buildMarkdown(importable, source) {
  const lines = [];
  lines.push('# Wiki 群系导入结构汇总');
  lines.push('');
  lines.push(`- 生成时间: \`${importable.generatedAt}\``);
  lines.push(`- 来源文件: \`${importable.sourceFile}\``);
  lines.push(`- 主群系记录数: \`${importable.biomes.length}\``);
  lines.push(`- 派生感染态数: \`${(source.derivedRecords || []).length}\``);
  lines.push(`- 未解析项数: \`${(source.unresolved || []).length}\``);
  lines.push('');
  lines.push('## 示例');
  lines.push('');
  for (const biome of importable.biomes.slice(0, 12)) {
    lines.push(`- ${biome.code} | ${biome.nameEn} | layer=${biome.layerType ?? 'null'} | type=${biome.biomeType ?? 'null'}`);
  }
  lines.push('');
  lines.push('## 派生感染态');
  lines.push('');
  for (const derived of source.derivedRecords || []) {
    lines.push(`- ${derived.displayName}: base=\`${derived.baseBiomeTitle}\`, infection=\`${derived.infectionSourceTitle}\``);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
