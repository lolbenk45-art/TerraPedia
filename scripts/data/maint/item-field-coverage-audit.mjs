#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const FIELD_CONFIG = {
  image: {
    rawPath: 'image',
    normalizedFromItem: () => false,
    normalizedFromPage: () => false,
    normalizedFromImage: () => true,
  },
  damage: {
    rawPath: 'damage',
    normalizedFromItem: (row) => row.combat_value !== null && row.combat_value !== undefined,
  },
  defense: {
    rawPath: 'defense',
    normalizedFromItem: (row) => row.defense_value !== null && row.defense_value !== undefined,
  },
  knockback: {
    rawPath: 'knockBack',
    normalizedFromItem: (row) => readRawField(row, 'knockBack') !== undefined,
  },
  useTime: {
    rawPath: 'useTime',
    normalizedFromItem: (row) => row.use_time !== null && row.use_time !== undefined,
  },
  buy: {
    rawPath: 'value',
    normalizedFromItem: (row) => row.major_value !== null && row.major_value !== undefined,
  },
  sell: {
    rawPath: null,
    normalizedFromPage: (row) => row.sell_value !== null && row.sell_value !== undefined,
  },
  rarityId: {
    rawPath: 'rare',
    normalizedFromItem: (row) => readRawField(row, 'rare') !== undefined,
  },
  stackSize: {
    rawPath: 'maxStack',
    normalizedFromItem: (row) => row.stack_size !== null && row.stack_size !== undefined,
  },
  tooltip: {
    rawPath: 'tooltip',
    normalizedFromItem: () => false,
  },
  tooltipZh: {
    rawPath: 'tooltipZh',
    normalizedFromItem: () => false,
  },
  description: {
    rawPath: 'description',
    normalizedFromItem: () => false,
  },
  descriptionZh: {
    rawPath: 'descriptionZh',
    normalizedFromItem: () => false,
  },
};

function parseArgs(argv = []) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }
  return {
    database: raw.database ?? 'terria_v1_maint',
    output: raw.output ?? path.join(repoRoot, 'reports', 'relation', `item-cutover-baseline-${new Date().toISOString().slice(0, 10)}.json`),
  };
}

function parseJsonObject(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readRawField(row, fieldName) {
  return parseJsonObject(row.raw_json)[fieldName];
}

function createFieldResult() {
  return {
    rawPresent: 0,
    normalizedPresent: 0,
    rawOnlyCount: 0,
    normalizedOnlyCount: 0,
    sampleRawOnlyItems: [],
    sampleNormalizedOnlyItems: [],
  };
}

function pushSample(target, value, limit = 10) {
  if (!value || target.length >= limit || target.includes(value)) return;
  target.push(value);
}

export function buildItemFieldCoverageAudit({
  maintItems = [],
  maintItemPages = [],
  maintItemImages = [],
} = {}) {
  const pagesByInternalName = new Map(
    maintItemPages
      .filter((row) => row?.item_internal_name)
      .map((row) => [row.item_internal_name, row])
  );
  const imagesByInternalName = new Set(
    maintItemImages
      .map((row) => row?.item_internal_name)
      .filter(Boolean)
  );

  const fields = Object.fromEntries(
    Object.keys(FIELD_CONFIG).map((name) => [name, createFieldResult()])
  );

  for (const row of maintItems) {
    const internalName = row.internal_name ?? null;
    const pageRow = pagesByInternalName.get(internalName) ?? null;
    const hasImageRow = imagesByInternalName.has(internalName);

    for (const [fieldName, config] of Object.entries(FIELD_CONFIG)) {
      const result = fields[fieldName];
      const rawPresent = config.rawPath != null && readRawField(row, config.rawPath) !== undefined;
      const normalizedPresent = Boolean(
        (config.normalizedFromItem && config.normalizedFromItem(row))
        || (config.normalizedFromPage && pageRow && config.normalizedFromPage(pageRow))
        || (config.normalizedFromImage && hasImageRow && config.normalizedFromImage(hasImageRow))
      );

      if (rawPresent) result.rawPresent += 1;
      if (normalizedPresent) result.normalizedPresent += 1;
      if (rawPresent && !normalizedPresent) {
        result.rawOnlyCount += 1;
        pushSample(result.sampleRawOnlyItems, internalName);
      }
      if (!rawPresent && normalizedPresent) {
        result.normalizedOnlyCount += 1;
        pushSample(result.sampleNormalizedOnlyItems, internalName);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      itemCount: maintItems.length,
      itemPageCount: maintItemPages.length,
      itemImageCount: imagesByInternalName.size,
    },
    fields,
  };
}

function buildMarkdown(audit) {
  const lines = [
    '# Item Field Coverage Audit',
    '',
    `Generated At: ${audit.generatedAt}`,
    `Item Count: ${audit.summary.itemCount}`,
    `Item Page Count: ${audit.summary.itemPageCount}`,
    `Item Image Count: ${audit.summary.itemImageCount}`,
  ];

  for (const [fieldName, result] of Object.entries(audit.fields)) {
    lines.push('');
    lines.push(`## ${fieldName}`);
    lines.push(`- raw present: ${result.rawPresent}`);
    lines.push(`- normalized present: ${result.normalizedPresent}`);
    lines.push(`- raw only count: ${result.rawOnlyCount}`);
    lines.push(`- normalized only count: ${result.normalizedOnlyCount}`);
    lines.push(`- sample raw only items: ${result.sampleRawOnlyItems.join(', ') || 'none'}`);
    lines.push(`- sample normalized only items: ${result.sampleNormalizedOnlyItems.join(', ') || 'none'}`);
  }

  return `${lines.join('\n')}\n`;
}

export async function runItemFieldCoverageAudit({ database = 'terria_v1_maint', output } = {}) {
  const config = loadLocalStackConfig(repoRoot);
  const connection = await mysql.createConnection({
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database,
  });

  try {
    const [maintItems] = await connection.query('SELECT internal_name, raw_json, combat_value, defense_value, use_time, stack_size, major_value FROM maint_items WHERE deleted = 0');
    const [maintItemPages] = await connection.query('SELECT item_internal_name, sell_value FROM maint_item_pages WHERE deleted = 0');
    const [maintItemImages] = await connection.query('SELECT item_internal_name FROM maint_item_images WHERE deleted = 0');
    const audit = buildItemFieldCoverageAudit({ maintItems, maintItemPages, maintItemImages });
    const resolvedOutput = output ?? path.join(repoRoot, 'reports', 'relation', `item-cutover-baseline-${new Date().toISOString().slice(0, 10)}.json`);
    const markdownPath = resolvedOutput.replace(/\.json$/i, '.md');
    await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
    await fs.writeFile(resolvedOutput, JSON.stringify(audit, null, 2));
    await fs.writeFile(markdownPath, buildMarkdown(audit));
    return { audit, outputPath: resolvedOutput, markdownPath };
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runItemFieldCoverageAudit(options);
  console.log(`Item field coverage report: ${result.outputPath}`);
}
