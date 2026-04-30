#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function slug(value) {
  return String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function wikiPageUrl(pageTitle, apiUrl) {
  const title = String(pageTitle ?? '').trim();
  if (!title) return null;
  const wikiPath = String(apiUrl ?? '').includes('/zh/api.php') ? '/zh/wiki/' : '/wiki/';
  return `https://terraria.wiki.gg${wikiPath}${encodeURIComponent(title).replaceAll('%20', '_')}`;
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.normalizedRows)) return value.normalizedRows;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function buildRelationRecord({ npc, row, relationType, sortOrder }) {
  const npcInternalName = npc.internalName ?? row.npcInternalName ?? null;
  const npcName = npc.name ?? row.npcName ?? npcInternalName;
  const itemName = row.itemName ?? row.item ?? row.name ?? null;
  const pageTitle = npc.wikiCrawler?.pageTitle ?? npcName;
  const sourceMetadata = npc.wikiCrawler?.sourceMetadata ?? {};
  return {
    recordKey: `npc-item:${slug(npcInternalName ?? npcName)}:${relationType}:${slug(itemName)}`,
    relationType,
    npcInternalName,
    npcName,
    itemName,
    priceText: row.priceText ?? row.price ?? row.valueText ?? null,
    chanceText: row.chanceText ?? null,
    quantityText: row.quantityText ?? null,
    conditionText: row.conditionText ?? row.condition ?? row.availabilityNote ?? null,
    sourceUrl: row.sourceUrl ?? wikiPageUrl(pageTitle, sourceMetadata.apiUrl),
    sourceSection: row.sourceSection ?? (relationType === 'shop' ? 'shop' : 'drops'),
    sourceRowIndex: row.sourceRowIndex ?? sortOrder,
    raw: row.raw ?? row
  };
}

export function buildNpcItemRelationsBundle({
  standardizedPayload,
  generatedAt = new Date().toISOString()
} = {}) {
  const records = [];
  const backfillCandidates = [];
  const npcs = Array.isArray(standardizedPayload?.records) ? standardizedPayload.records : [];

  for (const npc of npcs) {
    const wikiCrawler = npc.wikiCrawler ?? {};
    const shopRows = normalizeRows(wikiCrawler.shop);
    const lootRows = normalizeRows(wikiCrawler.loot);

    for (let index = 0; index < shopRows.length; index += 1) {
      if (!String(shopRows[index]?.itemName ?? shopRows[index]?.item ?? shopRows[index]?.name ?? '').trim()) continue;
      records.push(buildRelationRecord({
        npc,
        row: shopRows[index],
        relationType: 'shop',
        sortOrder: index
      }));
    }

    for (let index = 0; index < lootRows.length; index += 1) {
      if (!String(lootRows[index]?.itemName ?? lootRows[index]?.item ?? lootRows[index]?.name ?? '').trim()) continue;
      records.push(buildRelationRecord({
        npc,
        row: lootRows[index],
        relationType: 'loot',
        sortOrder: index
      }));
    }

    for (const candidate of Array.isArray(wikiCrawler.backfillCandidates) ? wikiCrawler.backfillCandidates : []) {
      backfillCandidates.push({
        ...candidate,
        entityInternalName: candidate.entityInternalName ?? npc.internalName ?? null,
        entitySourceId: candidate.entitySourceId ?? npc.id ?? null
      });
    }
  }

  return {
    schemaVersion: 1,
    source: 'wiki-crawler:npc',
    generatedAt,
    records,
    backfillCandidates
  };
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) args[body.slice(0, index)] = body.slice(index + 1);
    else args[body] = 'true';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(
    repoRoot,
    args.input ?? path.join('data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json')
  );
  const outputPath = path.resolve(
    repoRoot,
    args.output ?? path.join('data', 'generated', 'npc-item-relations.bundle.json')
  );
  const standardizedPayload = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const bundle = buildNpcItemRelationsBundle({
    standardizedPayload,
    generatedAt: args['generated-at'] ?? args.generatedAt ?? new Date().toISOString()
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(bundle, null, 2));
  console.log(`NPC item relations bundle: ${outputPath}`);
  console.log(`records=${bundle.records.length} backfillCandidates=${bundle.backfillCandidates.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
