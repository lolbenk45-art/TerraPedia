#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { buildEntityFieldAudit } from './entity-field-audit.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }
  return {
    localDatabase: raw['local-database'] ?? 'terria_v1_local',
    maintDatabase: raw['maint-database'] ?? 'terria_v1_maint',
    relationDatabase: raw['relation-database'] ?? 'terria_v1_relation'
  };
}

function toDateTag(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstRow(rows) {
  return rows?.[0] ?? {};
}

function formatDomainLine(name, summary = {}) {
  return `- ${name}: local=${summary.localTotal ?? 0}, maint=${summary.maintTotal ?? 0}, relation=${summary.relationTotal ?? 0}`;
}

function buildMarkdown(payload) {
  const lines = [
    '# Entity Coverage Baseline',
    '',
    `Generated At: ${payload.generatedAt}`,
    '',
    '## Domain Totals'
  ];

  for (const [name, summary] of Object.entries(payload.domains)) {
    lines.push(formatDomainLine(name, summary));
  }

  lines.push('', '## Field Gaps');
  for (const [domain, summary] of Object.entries(payload.fieldAudit.domains ?? {})) {
    lines.push(`### ${domain}`);
    for (const [field, detail] of Object.entries(summary.fields ?? {})) {
      lines.push(
        `- ${field}: local=${detail.localCoverage}, relation=${detail.relationCoverage}, gap=${detail.gap}`
      );
    }
    if (Object.keys(summary.fields ?? {}).length === 0) {
      lines.push('- none');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function queryOne(connection, sql) {
  const [rows] = await connection.query(sql);
  return firstRow(rows);
}

async function run(options, dependencies = {}) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root'
  };

  const local = await mysql.createConnection({ ...mysqlOptions, database: options.localDatabase });
  const maint = await mysql.createConnection({ ...mysqlOptions, database: options.maintDatabase });
  const relation = await mysql.createConnection({ ...mysqlOptions, database: options.relationDatabase });

  try {
    const [
      localItems,
      localNpcs,
      localProjectiles,
      localBuffs,
      maintItems,
      maintNpcs,
      maintProjectiles,
      maintBuffs,
      relationItems,
      relationNpcs,
      relationProjectiles,
      relationBuffs,
      relationItemImages,
      relationNpcImages,
      relationProjectileImages,
      relationBuffImages
    ] = await Promise.all([
      queryOne(local, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh, SUM(image IS NOT NULL AND TRIM(image) <> \'\') image, SUM(description_zh IS NOT NULL AND TRIM(description_zh) <> \'\') descriptionZh, SUM(tooltip_zh IS NOT NULL AND TRIM(tooltip_zh) <> \'\') tooltipZh FROM items WHERE deleted=0'),
      queryOne(local, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh, SUM(sub_name_zh IS NOT NULL AND TRIM(sub_name_zh) <> \'\') subNameZh FROM npcs WHERE deleted=0'),
      queryOne(local, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh FROM projectiles WHERE deleted=0'),
      queryOne(local, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh, SUM(image IS NOT NULL AND TRIM(image) <> \'\') image, SUM(tooltip_zh IS NOT NULL AND TRIM(tooltip_zh) <> \'\') tooltipZh FROM buffs WHERE deleted=0'),
      queryOne(maint, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh FROM maint_items WHERE deleted=0'),
      queryOne(maint, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh FROM maint_npcs WHERE deleted=0'),
      queryOne(maint, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh FROM maint_projectiles WHERE deleted=0'),
      queryOne(maint, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh FROM maint_buffs WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh FROM relation_items WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh, SUM(sub_name_zh IS NOT NULL AND TRIM(sub_name_zh) <> \'\') subNameZh FROM relation_npcs WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh FROM relation_projectiles WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(*) total, SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> \'\') nameZh, SUM(tooltip_zh IS NOT NULL AND TRIM(tooltip_zh) <> \'\') tooltipZh FROM relation_buffs WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(DISTINCT item_internal_name) total FROM relation_item_images WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(DISTINCT npc_internal_name) total FROM relation_npc_images WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(DISTINCT projectile_internal_name) total FROM relation_projectile_images WHERE deleted=0'),
      queryOne(relation, 'SELECT COUNT(DISTINCT buff_internal_name) total FROM relation_buff_images WHERE deleted=0')
    ]);

    const localSummary = {
      items: { total: Number(localItems.total ?? 0), nameZh: Number(localItems.nameZh ?? 0), image: Number(localItems.image ?? 0), descriptionZh: Number(localItems.descriptionZh ?? 0), tooltipZh: Number(localItems.tooltipZh ?? 0) },
      npcs: { total: Number(localNpcs.total ?? 0), nameZh: Number(localNpcs.nameZh ?? 0), subNameZh: Number(localNpcs.subNameZh ?? 0) },
      projectiles: { total: Number(localProjectiles.total ?? 0), nameZh: Number(localProjectiles.nameZh ?? 0) },
      buffs: { total: Number(localBuffs.total ?? 0), nameZh: Number(localBuffs.nameZh ?? 0), image: Number(localBuffs.image ?? 0), tooltipZh: Number(localBuffs.tooltipZh ?? 0) }
    };

    const relationSummary = {
      items: { total: Number(relationItems.total ?? 0), nameZh: Number(relationItems.nameZh ?? 0), image: Number(relationItemImages.total ?? 0), descriptionZh: 0, tooltipZh: 0 },
      npcs: { total: Number(relationNpcs.total ?? 0), nameZh: Number(relationNpcs.nameZh ?? 0), image: Number(relationNpcImages.total ?? 0), subNameZh: Number(relationNpcs.subNameZh ?? 0) },
      projectiles: { total: Number(relationProjectiles.total ?? 0), nameZh: Number(relationProjectiles.nameZh ?? 0), image: Number(relationProjectileImages.total ?? 0) },
      buffs: { total: Number(relationBuffs.total ?? 0), nameZh: Number(relationBuffs.nameZh ?? 0), image: Number(relationBuffImages.total ?? 0), tooltipZh: Number(relationBuffs.tooltipZh ?? 0) }
    };

    const payload = {
      generatedAt: new Date().toISOString(),
      databases: options,
      domains: {
        items: { localTotal: localSummary.items.total, maintTotal: Number(maintItems.total ?? 0), relationTotal: relationSummary.items.total },
        npcs: { localTotal: localSummary.npcs.total, maintTotal: Number(maintNpcs.total ?? 0), relationTotal: relationSummary.npcs.total },
        projectiles: { localTotal: localSummary.projectiles.total, maintTotal: Number(maintProjectiles.total ?? 0), relationTotal: relationSummary.projectiles.total },
        buffs: { localTotal: localSummary.buffs.total, maintTotal: Number(maintBuffs.total ?? 0), relationTotal: relationSummary.buffs.total }
      },
      fieldAudit: buildEntityFieldAudit({
        localSummary,
        relationSummary
      })
    };

    const dateTag = toDateTag();
    const reportsDir = path.join(repoRoot, 'reports', 'relation');
    await fs.mkdir(reportsDir, { recursive: true });
    const jsonPath = path.join(reportsDir, `entity-coverage-baseline-${dateTag}.json`);
    const mdPath = path.join(reportsDir, `entity-coverage-baseline-${dateTag}.md`);
    await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));
    await fs.writeFile(mdPath, buildMarkdown(payload));

    return { payload, jsonPath, mdPath };
  } finally {
    await Promise.all([local.end(), maint.end(), relation.end()]);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = await run(options);
  console.log(JSON.stringify({
    jsonPath: result.jsonPath,
    mdPath: result.mdPath,
    domains: result.payload.domains,
    totalGaps: result.payload.fieldAudit.summary.totalGaps
  }, null, 2));
}

export { run as runEntityCoverageBaseline };
