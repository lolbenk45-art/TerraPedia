#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

export const RELATION_COMPAT_VIEWS = {
  items: {
    sourceTable: 'projection_items',
    columns: ['id', 'name', 'name_zh', 'internal_name', 'slug', 'image', 'category_id', 'description', 'description_zh', 'damage', 'defense', 'knockback', 'use_time', 'width', 'height', 'buy', 'sell', 'tooltip', 'tooltip_zh', 'source_provider', 'source_page', 'source_revision_timestamp', 'last_synced_at', 'rarity_id', 'game_period_id', 'game_model_id', 'is_stackable', 'stack_size', 'status', 'deleted', 'created_at', 'updated_at'],
  },
  npcs: {
    sourceTable: 'projection_npcs',
    columns: ['id', 'game_id', 'source_id', 'internal_name', 'name', 'name_zh', 'sub_name', 'sub_name_zh', 'category_id', 'game_period_id', 'game_model_id', 'is_boss', 'boss_group_id', 'boss_role', 'is_friendly', 'is_town_npc', 'behavior_notes', 'net_id', 'npc_type', 'ai_style', 'damage', 'defense', 'life_max', 'knock_back_resist', 'width', 'height', 'scale', 'value', 'banner_source_item_id', 'banner_item_id', 'catch_source_item_id', 'catch_item_id', 'buff_immune', 'raw_json', 'status', 'deleted', 'created_at', 'updated_at'],
  },
  projectiles: {
    sourceTable: 'projection_projectiles',
    columns: ['id', 'source_id', 'internal_name', 'name', 'name_zh', 'image_url', 'ai_style', 'damage', 'knock_back', 'penetrate', 'time_left', 'width', 'height', 'scale', 'friendly', 'hostile', 'tile_collide', 'source_items_json', 'source_npcs_json', 'raw_json', 'status', 'deleted', 'created_at', 'updated_at'],
  },
  buffs: {
    sourceTable: 'projection_buffs',
    columns: ['id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'tooltip_en', 'tooltip_zh', 'image', 'buff_type', 'source_item_count', 'immune_npc_count', 'source_items_json', 'immune_npc_sample_json', 'status', 'deleted', 'created_at', 'updated_at'],
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
  return raw;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function buildCreateViewSql({ targetDatabase, viewName, sourceTable, columns } = {}) {
  const selectList = columns.map((column) => `\`${column}\``).join(', ');
  return `CREATE OR REPLACE VIEW \`${targetDatabase}\`.\`${viewName}\` AS SELECT ${selectList} FROM \`${targetDatabase}\`.\`${sourceTable}\``;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const config = loadLocalStackConfig(process.cwd());
  const targetDatabase = args.database ?? 'terria_v1_relation';
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `local-compat-layer-${new Date().toISOString().slice(0, 10)}.json`));
  const connection = await mysql.createConnection({
    host: args.host ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? config.database?.port ?? 3306),
    user: args.user ?? config.database?.username ?? 'root',
    password: args.password ?? config.database?.password ?? 'root',
  });

  try {
    const views = [];
    for (const [viewName, configEntry] of Object.entries(RELATION_COMPAT_VIEWS)) {
      const sql = buildCreateViewSql({
        targetDatabase,
        viewName,
        sourceTable: configEntry.sourceTable,
        columns: configEntry.columns,
      });
      if (apply) {
        await connection.query(sql);
      }
      views.push({
        viewName,
        sourceTable: configEntry.sourceTable,
        sql,
      });
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      targetDatabase,
      views,
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  await run();
}
