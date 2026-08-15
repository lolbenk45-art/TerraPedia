#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { ensureDir, parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { extractIntroParagraphs } from '../lib/wiki-page-utils.mjs';
import { buildShimmerGeneration } from './shimmer-generation-builder.mjs';

const repoRoot = process.cwd();
const options = parseCliArgs(process.argv.slice(2));

assertNoDatabaseLookup(options);

const generatedAt = requireTimestamp(options['generated-at'] ?? options.generatedAt ?? new Date().toISOString());
const dateTag = generatedAt.slice(0, 10);
const inputPath = path.resolve(options.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-shimmer.latest.json'));
const outputDir = path.resolve(options.output ?? path.join(repoRoot, 'data', 'generated', 'shimmer'));
const reportPath = path.resolve(options['report-output'] ?? path.join(repoRoot, 'reports', `wiki-shimmer-importable-summary-${dateTag}.md`));
const itemsPath = path.resolve(options.items ?? path.join(repoRoot, 'data', 'standardized', 'items.standardized.json'));
const npcsPath = path.resolve(options.npcs ?? path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json'));
const langlinksPath = requireLanglinksPath(options);
const sourceProvider = options.provider ?? 'wiki_zh';
const sourceFile = path.relative(repoRoot, inputPath).replaceAll('\\', '/');

const raw = readJson(inputPath, 'shimmer raw page');
const generation = buildShimmerGeneration({
  raw,
  itemRecords: readJson(itemsPath, 'standardized items').records ?? [],
  npcRecords: readJson(npcsPath, 'standardized NPCs').records ?? [],
  langlinkEvidence: readLanglinkEvidence(langlinksPath),
  generatedAt
});

const page = {
  sourcePage: raw.pageTitle ?? null,
  sourceRevisionTimestamp: raw.revisionTimestamp ?? null,
  sourcePageId: raw.pageId ?? null
};

const contextPayload = {
  ...envelope('wiki_shimmer_context_importable'),
  page,
  worldContext: buildWorldContext(raw)
};
const itemTransformsPayload = { ...envelope('wiki_shimmer_item_transforms_importable'), records: generation.itemTransforms };
const decraftRulesPayload = { ...envelope('wiki_shimmer_decraft_rules_importable'), records: generation.decraftRules };
const entityTransformsPayload = { ...envelope('wiki_shimmer_entity_transforms_importable'), records: generation.entityTransforms };
const npcTransformsPayload = { ...envelope('wiki_shimmer_npc_transforms_importable'), records: generation.npcTransforms };
const manifestPayload = buildManifestPayload();

ensureDir(outputDir);
writeJson(path.join(outputDir, 'wiki-shimmer-context.importable.latest.json'), contextPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-item-transforms.importable.latest.json'), itemTransformsPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-decraft-rules.importable.latest.json'), decraftRulesPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-entity-transforms.importable.latest.json'), entityTransformsPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-npc-transforms.importable.latest.json'), npcTransformsPayload);
writeJson(path.join(outputDir, 'wiki-shimmer-manifest.latest.json'), manifestPayload);
ensureDir(path.dirname(reportPath));
fs.writeFileSync(reportPath, buildMarkdownSummary(), 'utf8');

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

function envelope(entity) {
  return { entity, generatedAt, sourceProvider, sourceFile };
}

function assertNoDatabaseLookup(cliOptions) {
  const supplied = cliOptions['use-db-lookup'] ?? cliOptions.useDbLookup;
  if (supplied === undefined) return;
  const text = String(supplied).trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') {
    throw new Error(
      '--use-db-lookup is no longer supported: the shimmer transform is offline and resolves identity only from '
      + '--items, --npcs, and frozen --langlinks evidence'
    );
  }
}

function requireLanglinksPath(cliOptions) {
  const supplied = cliOptions.langlinks ?? cliOptions['langlink-evidence'];
  const text = typeof supplied === 'string' ? supplied.trim() : '';
  if (!text) {
    throw new Error('--langlinks=<frozen-evidence.json> is required: live langlink resolution is not available offline');
  }
  return path.resolve(repoRoot, text);
}

function readLanglinkEvidence(filePath) {
  const payload = readJson(filePath, 'frozen langlink evidence');
  const records = Array.isArray(payload) ? payload : payload.records;
  if (!Array.isArray(records)) {
    throw new Error(`frozen langlink evidence must contain a records array: ${filePath}`);
  }
  return records;
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireTimestamp(value) {
  const text = String(value ?? '').trim();
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new Error('--generated-at must be an ISO timestamp');
  }
  return text;
}

function buildManifestPayload() {
  const unresolvedEntries = generation.titleResolution
    .filter((entry) => entry.kind === 'unresolved')
    .map((entry) => ({ titleZh: entry.nameZh, titleEn: entry.nameEn, hint: entry.hint }));
  return {
    entity: 'wiki_shimmer_manifest',
    generatedAt,
    sourceFile,
    page,
    tableRoleVersion: generation.context.tableRoleVersion,
    outputs: {
      contextRecords: 1,
      itemTransforms: generation.itemTransforms.length,
      decraftRules: generation.decraftRules.length,
      entityTransforms: generation.entityTransforms.length,
      npcTransforms: generation.npcTransforms.length
    },
    resolution: {
      totalResolvedTitles: generation.titleResolution.length - unresolvedEntries.length,
      unresolvedCount: unresolvedEntries.length,
      unresolvedEntries
    }
  };
}

function buildWorldContext(rawPayload) {
  const introParagraphs = extractIntroParagraphs(extractIntroHtml(rawPayload.html));
  return {
    code: 'SHIMMER',
    nameEn: 'Shimmer',
    nameZh: '微光',
    contextType: 'ENVIRONMENT',
    description: introParagraphs.slice(0, 2).join(' ').trim() || null,
    biomeCode: 'aether',
    biomeNameEn: 'Aether',
    biomeNameZh: '以太',
    layerHints: ['underground', 'cavern'],
    sideRule: 'same_side_as_jungle',
    occurrenceRule: 'one_per_world',
    acquisition: [
      { kind: 'natural_spawn', notes: introParagraphs[0] ?? null },
      {
        kind: 'post_boss_unlock',
        itemNameEn: 'Bottomless Shimmer Bucket',
        itemNameZh: '无底微光桶',
        bossCode: 'MOON_LORD',
        notes: introParagraphs[0] ?? null
      }
    ],
    mechanics: [
      { code: 'ITEM_TRANSMUTATION', description: '微光可将物品嬗变或拆解为材料。' },
      { code: 'NPC_APPEARANCE_SWAP', description: '城镇 NPC 浸没后会变为微光形态，仅影响外观。' },
      { code: 'CRITTER_AND_ENEMY_TRANSFORM', description: '特定小动物和敌怪在微光中会嬗变。' },
      { code: 'SHIMMERING_DEBUFF', description: '玩家在微光中会触发微光闪烁 debuff。' },
      {
        code: 'LIQUID_MIX_RESULT',
        description: '微光与其他液体接触时会形成 Aetherium Block。',
        outputItemNameEn: 'Aetherium Block',
        outputItemNameZh: '以太块'
      },
      { code: 'PUMP_SUPPORTED', description: '微光无法被桶直接盛取，但可被 pumps 移动。' }
    ]
  };
}

function extractIntroHtml(html) {
  const text = String(html ?? '');
  const firstHeadingIndex = text.search(/<h2\b/i);
  return firstHeadingIndex === -1 ? text : text.slice(0, firstHeadingIndex);
}

function buildMarkdownSummary() {
  return [
    '# Wiki Shimmer Importable Summary',
    '',
    `- Generated at: \`${generatedAt}\``,
    `- Source page: \`${page.sourcePage}\``,
    `- Revision timestamp: \`${page.sourceRevisionTimestamp}\``,
    `- Table role version: \`${generation.context.tableRoleVersion}\``,
    `- Output dir: \`${path.relative(repoRoot, outputDir).replaceAll('\\', '/')}\``,
    `- Unresolved titles: \`${manifestPayload.resolution.unresolvedCount}\``,
    '',
    '## Counts',
    '',
    '- context: `1`',
    `- item transforms: \`${generation.itemTransforms.length}\``,
    `- decraft rules: \`${generation.decraftRules.length}\``,
    `- entity transforms: \`${generation.entityTransforms.length}\``,
    `- npc transforms: \`${generation.npcTransforms.length}\``,
    ''
  ].join('\n') + '\n';
}
