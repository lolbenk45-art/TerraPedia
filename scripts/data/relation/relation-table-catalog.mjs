#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { RELATION_DATABASE_NAME } from './relation-schema.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_OUTPUT_PATH = path.join(
  repoRoot,
  'docs',
  'superpowers',
  'specs',
  '2026-04-25-relation-table-catalog.md'
);

const STATUS_ZH = {
  kept: '保留',
  removed: '已移除'
};

const LAYER_ZH = {
  system: '系统层',
  entity: '实体层',
  asset: '资源层',
  taxonomy: '分类层',
  relation: '关系层',
  fact: '事实层',
  detail: '明细层',
  expansion: '展开层',
  audit: '审计层',
  projection: '投影视图层',
  deprecated: '废弃层'
};

const TABLE_ZH = {
  relation_runs: {
    purposeZh: 'relation 同步运行台账，记录范围、状态和汇总信息。',
    notesZh: '系统表，不承载游戏事实数据。'
  },
  relation_run_reports: {
    purposeZh: '记录每次 relation 同步生成的审计报告索引。',
    notesZh: '系统表，是 relation_runs 的子表。'
  },
  relation_items: {
    purposeZh: '规范化后的 item 基础实体主表。',
    notesZh: '是 relation 与 projection 的 item 身份主层，并保留 rare/value/sell 的原始事实。'
  },
  relation_npcs: {
    purposeZh: '规范化后的 NPC 基础实体主表。',
    notesZh: '是掉落、商店、boss、系列关系的 NPC 身份主层。'
  },
  relation_projectiles: {
    purposeZh: '规范化后的 projectile 基础实体主表。',
    notesZh: '是 projectile 相关关系和 projection 的基础身份层。'
  },
  relation_buffs: {
    purposeZh: '规范化后的 buff 基础实体主表，并保留 tooltip 与来源物品摘要。',
    notesZh: '当前替代 local 的 readiness 在 buff 域最完整。'
  },
  relation_bosses: {
    purposeZh: 'boss 领域实体表，把 boss 页面信息映射到 NPC 身份和流程顺序。',
    notesZh: '位于原始 NPC 行之上的 boss 实体层。'
  },
  relation_item_rarities: {
    purposeZh: 'item 品质展示语义维表，承接 rarity 代码、名称与排序。',
    notesZh: '这是 support domain 维表，不替代 item 上的 rare 原始事实。'
  },
  relation_item_images: {
    purposeZh: 'item 图片资源表，保存原始 URL、缓存 URL 和主图标记。',
    notesZh: 'item 图片覆盖率仍低于 legacy local。'
  },
  relation_npc_images: {
    purposeZh: 'NPC 图片资源表，保存源文件标题与缓存 URL。',
    notesZh: '相对 relation_npcs 已接近全覆盖。'
  },
  relation_projectile_images: {
    purposeZh: 'projectile 图片资源表。',
    notesZh: '供 projection_projectiles 使用。'
  },
  relation_buff_images: {
    purposeZh: 'buff 图片资源表。',
    notesZh: '覆盖率与 relation_buffs 对齐。'
  },
  category_nodes: {
    purposeZh: '标准化后的分类层级节点表。',
    notesZh: '是共用的分类树主层。'
  },
  item_category_assignments: {
    purposeZh: 'item 到分类节点的归属桥表。',
    notesZh: '是 item 与 category_nodes 的多对多桥接层。'
  },
  item_recipe_heads: {
    purposeZh: '规范化配方头表，每条配方实例一行。',
    notesZh: '是配方域的根表。'
  },
  item_recipe_ingredients: {
    purposeZh: '配方材料表，保留显式材料与分组占位材料。',
    notesZh: '保留了规范化的 grouped recipe 表达。'
  },
  item_recipe_stations: {
    purposeZh: '配方制作站需求表。',
    notesZh: '支持一条配方对应多个制作站。'
  },
  item_recipe_group_expansions: {
    purposeZh: '配方材料组展开表，把占位组成员展开成可查询行。',
    notesZh: '这是兼容层，不是最原始的 canonical recipe source。'
  },
  item_source_facts: {
    purposeZh: '从 maint_item_sources 解析出的 item 来源事实主表。',
    notesZh: '是商店和掉落正式关系表的父事实层。'
  },
  item_source_details: {
    purposeZh: 'item 来源事实的补充明细表。',
    notesZh: '即使与 item_source_facts 行数一致，也不是重复表。'
  },
  item_npc_shop_relations: {
    purposeZh: 'NPC 售卖关系正式表，带结构化条件字段。',
    notesZh: '这是唯一保留的 canonical NPC shop 表。'
  },
  item_npc_loot_relations: {
    purposeZh: 'NPC 掉落关系正式表，带结构化条件字段。',
    notesZh: '这是唯一保留的 canonical NPC loot 表。'
  },
  item_buff_relations: {
    purposeZh: 'item 与 buff 的施加关系桥表。',
    notesZh: '属于次级效果关系层。'
  },
  item_biome_relations: {
    purposeZh: 'item 与 biome 的关系表。',
    notesZh: '属于次级领域关系层。'
  },
  item_projectile_relations: {
    purposeZh: 'Formal item-to-projectile firing relation rows.',
    notesZh: 'Canonical relation promoted from explicit item raw_json projectile fields.'
  },
  npc_projectile_relations: {
    purposeZh: 'Formal NPC-to-projectile firing relation rows.',
    notesZh: 'Canonical relation promoted only from explicit NPC crawler projectile evidence.'
  },
  npc_projectile_audits: {
    purposeZh: 'NPC projectile evidence audit rows.',
    notesZh: 'Records crawl and backfill candidates for NPC projectile evidence.'
  },
  item_projectile_audits: {
    purposeZh: 'item 与 projectile 证据交叉审计表，记录抽取状态。',
    notesZh: '是审计辅助表，不是正式游戏事实关系。'
  },
  boss_item_reward_relations: {
    purposeZh: 'boss 到奖励 item 的桥表。',
    notesZh: '属于派生出来的 boss 奖励层。'
  },
  boss_effect_relations: {
    purposeZh: 'boss 相关结构化效果表，如流程推进或世界状态影响。',
    notesZh: '来自 boss 备注的结构化整理结果。'
  },
  npc_series_nodes: {
    purposeZh: 'NPC 系列或家族节点表。',
    notesZh: '是系列分类树的根层。'
  },
  npc_series_memberships: {
    purposeZh: 'NPC 到系列节点的成员关系桥表。',
    notesZh: '是多对多桥接层。'
  },
  npc_series_item_relations: {
    purposeZh: '按 NPC 系列聚合后的 item 关系表。',
    notesZh: '位于单个 NPC 正式关系之上的派生便利层。'
  },
  projection_items: {
    purposeZh: '由 relation 派生出的 local 兼容 item 投影视图表。',
    notesZh: '是兼容层，不是原始事实层。'
  },
  projection_npcs: {
    purposeZh: '由 relation 派生出的 local 兼容 NPC 投影视图表。',
    notesZh: '是兼容层，但当前仍受字段覆盖缺口阻塞。'
  },
  projection_projectiles: {
    purposeZh: '由 relation 派生出的 local 兼容 projectile 投影视图表。',
    notesZh: '是兼容层，但当前仍受字段覆盖缺口阻塞。'
  },
  projection_buffs: {
    purposeZh: '由 relation 派生出的 local 兼容 buff 投影视图表。',
    notesZh: '是兼容层，当前 readiness 报告认为这一域已可切换。'
  },
  item_npc_shop_candidates: {
    purposeZh: '旧版 NPC 售卖候选镜像表。',
    notesZh: '因与正式 shop relation 重复且语义更弱，已移除。'
  },
  item_npc_loot_candidates: {
    purposeZh: '旧版 NPC 掉落候选镜像表。',
    notesZh: '因与正式 loot relation 重复且语义更弱，已移除。'
  }
};

const TABLE_DEFINITIONS = [
  {
    tableName: 'relation_runs',
    status: 'kept',
    layer: 'system',
    purpose: 'Relation sync run ledger with scope and summary metadata.',
    source: 'sync-maint-to-relation runtime metadata',
    primaryKeys: ['id', 'run_key'],
    notes: 'System table, not a gameplay fact source.'
  },
  {
    tableName: 'relation_run_reports',
    status: 'kept',
    layer: 'system',
    purpose: 'Generated report index for each relation sync run.',
    source: 'writeRelationReports output metadata',
    primaryKeys: ['id', 'run_key', 'report_kind'],
    notes: 'System table, child of relation_runs.'
  },
  {
    tableName: 'relation_items',
    status: 'kept',
    layer: 'entity',
    purpose: 'Canonical item base entity table.',
    source: 'maint_items',
    primaryKeys: ['record_key', 'source_id', 'internal_name'],
    notes: 'Primary item identity layer for relation and projection; now also carries source-backed rare/value/sell raw facts.'
  },
  {
    tableName: 'relation_npcs',
    status: 'kept',
    layer: 'entity',
    purpose: 'Canonical NPC base entity table.',
    source: 'maint_npcs',
    primaryKeys: ['record_key', 'source_id', 'internal_name'],
    notes: 'Primary NPC identity layer for loot, shop, boss, and series relations.'
  },
  {
    tableName: 'relation_projectiles',
    status: 'kept',
    layer: 'entity',
    purpose: 'Canonical projectile base entity table.',
    source: 'maint_projectiles',
    primaryKeys: ['record_key', 'source_id', 'internal_name'],
    notes: 'Primary projectile identity layer.'
  },
  {
    tableName: 'relation_buffs',
    status: 'kept',
    layer: 'entity',
    purpose: 'Canonical buff base entity table with tooltip and source-item summaries.',
    source: 'maint_buffs',
    primaryKeys: ['record_key', 'source_id', 'internal_name'],
    notes: 'Current replacement readiness is best in this domain.'
  },
  {
    tableName: 'relation_bosses',
    status: 'kept',
    layer: 'entity',
    purpose: 'Boss domain table mapped onto NPC identities and progression order.',
    source: 'maint_bosses + relation_npcs + item_npc_loot_relations',
    primaryKeys: ['record_key', 'boss_title_en', 'npc_internal_name'],
    notes: 'Boss identity layer above raw NPC rows.'
  },
  {
    tableName: 'relation_item_rarities',
    status: 'kept',
    layer: 'taxonomy',
    purpose: 'Item rarity support dimension with display names and sort order.',
    source: 'TerraPedia support-domain rarity dictionary snapshot',
    primaryKeys: ['id', 'record_key', 'code'],
    notes: 'Support-domain dictionary for projection_items.rarity_id. This is not the raw source fact; item rare raw values stay on relation_items.'
  },
  {
    tableName: 'relation_item_images',
    status: 'kept',
    layer: 'asset',
    purpose: 'Item image asset table with original and cached URLs.',
    source: 'maint_item_images',
    primaryKeys: ['record_key', 'item_internal_name', 'cached_url'],
    notes: 'Item image coverage is still below legacy local.'
  },
  {
    tableName: 'relation_npc_images',
    status: 'kept',
    layer: 'asset',
    purpose: 'NPC image asset table with source file title and cache URL.',
    source: 'maint_npc_images',
    primaryKeys: ['record_key', 'npc_internal_name', 'cached_url'],
    notes: 'Near-complete coverage against relation_npcs.'
  },
  {
    tableName: 'relation_projectile_images',
    status: 'kept',
    layer: 'asset',
    purpose: 'Projectile image asset table.',
    source: 'maint_projectiles image fields',
    primaryKeys: ['record_key', 'projectile_internal_name', 'cached_url'],
    notes: 'Used by projection_projectiles.'
  },
  {
    tableName: 'relation_buff_images',
    status: 'kept',
    layer: 'asset',
    purpose: 'Buff image asset table.',
    source: 'maint_buffs image fields',
    primaryKeys: ['record_key', 'buff_internal_name', 'cached_url'],
    notes: 'Coverage matches relation_buffs.'
  },
  {
    tableName: 'category_nodes',
    status: 'kept',
    layer: 'taxonomy',
    purpose: 'Normalized category hierarchy nodes.',
    source: 'maint_categories + maint_item_categories',
    primaryKeys: ['record_key', 'node_key'],
    notes: 'Shared taxonomy layer.'
  },
  {
    tableName: 'item_category_assignments',
    status: 'kept',
    layer: 'relation',
    purpose: 'Item-to-category assignment bridge.',
    source: 'maint_item_categories',
    primaryKeys: ['record_key', 'item_internal_name', 'node_key'],
    notes: 'Many-to-many bridge into category_nodes.'
  },
  {
    tableName: 'item_recipe_heads',
    status: 'kept',
    layer: 'fact',
    purpose: 'Canonical recipe head rows, one per recipe instance.',
    source: 'maint_item_recipes + maint_item_page_recipes + maint_recipe_page_recipes',
    primaryKeys: ['record_key', 'recipe_key'],
    notes: 'Recipe root table.'
  },
  {
    tableName: 'item_recipe_ingredients',
    status: 'kept',
    layer: 'relation',
    purpose: 'Recipe ingredient rows, including grouped placeholders.',
    source: 'item_recipe_heads derivation',
    primaryKeys: ['record_key', 'recipe_key', 'ingredient_record_key'],
    notes: 'Keeps canonical grouped representation.'
  },
  {
    tableName: 'item_recipe_stations',
    status: 'kept',
    layer: 'relation',
    purpose: 'Recipe crafting-station requirement rows.',
    source: 'item_recipe_heads derivation',
    primaryKeys: ['record_key', 'recipe_key', 'station_record_key'],
    notes: 'Supports multi-station recipes.'
  },
  {
    tableName: 'item_recipe_group_expansions',
    status: 'kept',
    layer: 'expansion',
    purpose: 'Expanded material-group members for recipe placeholders.',
    source: 'item_recipe_ingredients + data/generated/recipe-material-reference.json',
    primaryKeys: ['record_key', 'recipe_key', 'ingredient_record_key', 'member_internal_name'],
    notes: 'Compatibility expansion layer; not the canonical recipe source.'
  },
  {
    tableName: 'item_source_facts',
    status: 'kept',
    layer: 'fact',
    purpose: 'Canonical item source facts parsed from maint source rows.',
    source: 'maint_item_sources',
    primaryKeys: ['record_key', 'item_internal_name', 'source_type'],
    notes: 'Parent fact table for shop and loot relations.'
  },
  {
    tableName: 'item_source_details',
    status: 'kept',
    layer: 'detail',
    purpose: 'Supporting detail rows for item source facts.',
    source: 'maint_item_sources',
    primaryKeys: ['record_key', 'source_fact_key'],
    notes: 'Not a duplicate even when row count matches item_source_facts.'
  },
  {
    tableName: 'item_npc_shop_relations',
    status: 'kept',
    layer: 'fact',
    purpose: 'Formal NPC shop facts with structured condition fields.',
    source: 'maint_item_sources -> item_source_facts',
    primaryKeys: ['record_key', 'source_fact_key', 'item_internal_name', 'npc_internal_name'],
    notes: 'Canonical NPC shop table.'
  },
  {
    tableName: 'item_npc_loot_relations',
    status: 'kept',
    layer: 'fact',
    purpose: 'Formal NPC loot/drop facts with structured condition fields.',
    source: 'maint_item_sources -> item_source_facts',
    primaryKeys: ['record_key', 'source_fact_key', 'item_internal_name', 'npc_internal_name'],
    notes: 'Canonical NPC loot table.'
  },
  {
    tableName: 'item_buff_relations',
    status: 'kept',
    layer: 'relation',
    purpose: 'Item-to-buff application bridge.',
    source: 'maint_buffs + maint_items',
    primaryKeys: ['record_key', 'item_internal_name', 'buff_internal_name'],
    notes: 'Secondary effect relation layer.'
  },
  {
    tableName: 'item_biome_relations',
    status: 'kept',
    layer: 'relation',
    purpose: 'Item-to-biome relation rows.',
    source: 'maint_item_biomes',
    primaryKeys: ['record_key', 'item_internal_name', 'biome_key'],
    notes: 'Secondary domain relation layer.'
  },
  {
    tableName: 'item_projectile_relations',
    status: 'kept',
    layer: 'fact',
    purpose: 'Formal item-to-projectile firing facts.',
    source: 'maint_items.raw_json explicit projectile fields + relation_projectiles',
    primaryKeys: ['record_key', 'item_internal_name', 'projectile_internal_name'],
    notes: 'Canonical projectile source relation for items; item_projectile_audits remains the extraction audit.'
  },
  {
    tableName: 'npc_projectile_relations',
    status: 'kept',
    layer: 'fact',
    purpose: 'Formal NPC-to-projectile firing facts.',
    source: 'maint_npcs.raw_json explicit crawler projectile fields + relation_projectiles',
    primaryKeys: ['record_key', 'npc_internal_name', 'projectile_internal_name'],
    notes: 'Canonical projectile source relation for NPCs; aiStyle is intentionally not inferred.'
  },
  {
    tableName: 'item_projectile_audits',
    status: 'kept',
    layer: 'audit',
    purpose: 'Crosswalk rows linking items to projectile evidence and extraction status.',
    source: 'maint_items + maint_projectiles + maint_item_images',
    primaryKeys: ['record_key', 'item_internal_name', 'projectile_internal_name'],
    notes: 'Audit helper, not a canonical gameplay relation.'
  },
  {
    tableName: 'npc_projectile_audits',
    status: 'kept',
    layer: 'audit',
    purpose: 'NPC-to-projectile evidence audit rows for crawl and backfill candidates.',
    source: 'maint_npcs + maint_projectiles',
    primaryKeys: ['record_key', 'npc_internal_name', 'projectile_internal_name'],
    notes: 'Audit helper for explicit NPC projectile fields; aiStyle is still not inferred.'
  },
  {
    tableName: 'boss_item_reward_relations',
    status: 'kept',
    layer: 'relation',
    purpose: 'Boss-to-item reward bridge.',
    source: 'relation_bosses + item_npc_loot_relations',
    primaryKeys: ['record_key', 'boss_record_key', 'item_internal_name'],
    notes: 'Derived boss reward layer.'
  },
  {
    tableName: 'boss_effect_relations',
    status: 'kept',
    layer: 'relation',
    purpose: 'Structured boss domain effects such as progression or world-state impacts.',
    source: 'maint_bosses',
    primaryKeys: ['record_key', 'boss_record_key', 'effect_type', 'target_type'],
    notes: 'Curated structured effects from boss notes.'
  },
  {
    tableName: 'npc_series_nodes',
    status: 'kept',
    layer: 'taxonomy',
    purpose: 'NPC series or family nodes.',
    source: 'relation_npcs + npc domain processors',
    primaryKeys: ['record_key', 'series_key'],
    notes: 'Series taxonomy root.'
  },
  {
    tableName: 'npc_series_memberships',
    status: 'kept',
    layer: 'relation',
    purpose: 'NPC-to-series membership bridge.',
    source: 'npc_series_nodes + relation_npcs',
    primaryKeys: ['record_key', 'series_key', 'npc_internal_name'],
    notes: 'Many-to-many bridge.'
  },
  {
    tableName: 'npc_series_item_relations',
    status: 'kept',
    layer: 'relation',
    purpose: 'Series-level aggregated item relations across NPC groups.',
    source: 'npc_series_nodes + npc_series_memberships + NPC item relations',
    primaryKeys: ['record_key', 'series_key', 'item_internal_name', 'relation_type'],
    notes: 'Derived convenience layer above per-NPC facts.'
  },
  {
    tableName: 'projection_items',
    status: 'kept',
    layer: 'projection',
    purpose: 'Local-compatible item projection derived from relation.',
    source: 'relation_items + relation_item_images',
    primaryKeys: ['id', 'internal_name', 'relation_record_key'],
    notes: 'Derived compatibility table, not a raw fact layer.'
  },
  {
    tableName: 'projection_npcs',
    status: 'kept',
    layer: 'projection',
    purpose: 'Local-compatible NPC projection derived from relation.',
    source: 'relation_npcs + relation_npc_images',
    primaryKeys: ['id', 'internal_name', 'relation_record_key'],
    notes: 'Derived compatibility table; replacement still blocked by coverage gaps.'
  },
  {
    tableName: 'projection_projectiles',
    status: 'kept',
    layer: 'projection',
    purpose: 'Local-compatible projectile projection derived from relation.',
    source: 'relation_projectiles + relation_projectile_images',
    primaryKeys: ['id', 'internal_name', 'relation_record_key'],
    notes: 'Derived compatibility table; replacement still blocked by field gaps.'
  },
  {
    tableName: 'projection_buffs',
    status: 'kept',
    layer: 'projection',
    purpose: 'Local-compatible buff projection derived from relation.',
    source: 'relation_buffs + relation_buff_images',
    primaryKeys: ['id', 'internal_name', 'relation_record_key'],
    notes: 'Derived compatibility table; current readiness report marks this domain switchable.'
  },
  {
    tableName: 'item_npc_shop_candidates',
    status: 'removed',
    layer: 'deprecated',
    purpose: 'Legacy candidate mirror of NPC shop relations.',
    source: 'maint_item_sources',
    primaryKeys: ['record_key', 'source_fact_key', 'item_internal_name', 'npc_internal_name'],
    notes: 'Removed because it duplicated the formal shop relation with lower-signal semantics.'
  },
  {
    tableName: 'item_npc_loot_candidates',
    status: 'removed',
    layer: 'deprecated',
    purpose: 'Legacy candidate mirror of NPC loot relations.',
    source: 'maint_item_sources',
    primaryKeys: ['record_key', 'source_fact_key', 'item_internal_name', 'npc_internal_name'],
    notes: 'Removed because it duplicated the formal loot relation with lower-signal semantics.'
  }
];

export function getRelationTableDefinitions() {
  return TABLE_DEFINITIONS.map((entry) => ({ ...entry, primaryKeys: [...entry.primaryKeys] }));
}

export function buildRelationTableCatalogMarkdown({ generatedAt, tables }) {
  const lines = [
    '# Relation Table Catalog',
    '',
    `generated_at: ${generatedAt}`,
    '',
    'This catalog explains the purpose and status of each relation-side table so later tasks can reuse the right layer.',
    '这份目录用于说明 relation 侧每张表保存的内容、当前状态，以及后续任务应该复用哪一层。',
    ''
  ];

  for (const table of tables) {
    const tableZh = TABLE_ZH[table.tableName] ?? {};
    lines.push(`## ${table.tableName}`);
    lines.push('');
    lines.push(`- status: ${table.status}`);
    lines.push(`- status_zh: ${STATUS_ZH[table.status] ?? table.status}`);
    lines.push(`- layer: ${table.layer}`);
    lines.push(`- layer_zh: ${LAYER_ZH[table.layer] ?? table.layer}`);
    if (table.rows != null) {
      lines.push(`- rows: ${table.rows}`);
    }
    lines.push(`- source: ${table.source}`);
    lines.push(`- source_zh: 来源链保留原始英文表名，避免数据链歧义。`);
    lines.push(`- primary_keys: ${table.primaryKeys.join(', ')}`);
    lines.push(`- purpose: ${table.purpose}`);
    lines.push(`- purpose_zh: ${tableZh.purposeZh ?? table.purpose}`);
    lines.push(`- notes: ${table.notes}`);
    lines.push(`- notes_zh: ${tableZh.notesZh ?? table.notes}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export async function generateRelationTableCatalog({
  relationDatabase = RELATION_DATABASE_NAME,
  outputPath = DEFAULT_OUTPUT_PATH,
  config = loadLocalStackConfig(repoRoot)
} = {}) {
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: relationDatabase
  };

  const connection = await mysql.createConnection(mysqlOptions);
  try {
    const definitions = getRelationTableDefinitions();
    const existingRows = await connection.query(
      `SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = ?`,
      [relationDatabase]
    );
    const existingTableNames = new Set((existingRows[0] ?? []).map((row) => row.tableName ?? row.TABLENAME ?? row.TABLE_NAME));
    const counts = new Map();
    for (const entry of definitions) {
      if (!existingTableNames.has(entry.tableName)) {
        counts.set(entry.tableName, 0);
        continue;
      }
      const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${relationDatabase}\`.\`${entry.tableName}\``);
      counts.set(entry.tableName, Number(rows[0]?.row_count ?? rows[0]?.ROW_COUNT ?? 0));
    }
    const tables = definitions.map((entry) => ({
      ...entry,
      rows: counts.has(entry.tableName) ? counts.get(entry.tableName) : 0
    }));
    const markdown = buildRelationTableCatalogMarkdown({
      generatedAt: new Date().toISOString(),
      tables
    });
    fs.writeFileSync(outputPath, markdown, 'utf8');
    return { outputPath, tables, markdown };
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await generateRelationTableCatalog();
  console.log(`Catalog written: ${result.outputPath}`);
  console.log(`Tables documented: ${result.tables.length}`);
}
