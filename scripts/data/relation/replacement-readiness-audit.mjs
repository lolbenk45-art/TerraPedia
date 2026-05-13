#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = getProjectRoot();

export function resolveMysqlRequirePath(root = repoRoot) {
  return path.join(root, 'data-query-app', 'package.json');
}

const require = createRequire(resolveMysqlRequirePath());
const mysql = require('mysql2/promise');

export const DOMAIN_CONFIG = {
  items: {
    localTable: 'items',
    projectionTable: 'projection_items',
    key: 'internal_name',
    fieldPairs: [
      ['name', 'name'],
      ['name_zh', 'name_zh'],
      ['image', 'image'],
      ['damage', 'damage'],
      ['defense', 'defense'],
      ['knockback', 'knockback'],
      ['use_time', 'use_time'],
      ['buy', 'buy'],
      ['sell', 'sell'],
      ['tooltip', 'tooltip'],
      ['tooltip_zh', 'tooltip_zh'],
      ['rarity_id', 'rarity_id'],
      ['is_stackable', 'is_stackable'],
      ['stack_size', 'stack_size']
    ]
  },
  npcs: {
    localTable: 'npcs',
    projectionTable: 'projection_npcs',
    key: 'internal_name',
    fieldPairs: [
      ['name', 'name'],
      ['name_zh', 'name_zh'],
      ['sub_name', 'sub_name'],
      ['sub_name_zh', 'sub_name_zh'],
      ['image_url', 'image_url'],
      ['is_boss', 'is_boss'],
      ['is_friendly', 'is_friendly'],
      ['is_town_npc', 'is_town_npc'],
      ['damage', 'damage'],
      ['defense', 'defense'],
      ['life_max', 'life_max'],
      ['knock_back_resist', 'knock_back_resist'],
      ['scale', 'scale'],
      ['value', 'value'],
      ['buff_immune', 'buff_immune']
    ]
  },
  bosses: {
    localTable: 'boss_groups',
    projectionTable: 'projection_bosses',
    key: 'code',
    fieldPairs: [
      ['name_en', 'name_en'],
      ['name_zh', 'name_zh'],
      ['boss_type', 'boss_type'],
      ['image_url', 'image_url'],
      ['progression_order', 'progression_order'],
      ['notes', 'notes'],
      ['source_page', 'source_page'],
      ['source_revision_timestamp', 'source_revision_timestamp'],
      ['status', 'status'],
      ['deleted', 'deleted']
    ]
  },
  projectiles: {
    localTable: 'projectiles',
    projectionTable: 'projection_projectiles',
    key: 'internal_name',
    fieldPairs: [
      ['name', 'name'],
      ['name_zh', 'name_zh'],
      ['image_url', 'image_url'],
      ['ai_style', 'ai_style'],
      ['damage', 'damage'],
      ['knock_back', 'knock_back'],
      ['penetrate', 'penetrate'],
      ['time_left', 'time_left'],
      ['scale', 'scale'],
      ['friendly', 'friendly'],
      ['hostile', 'hostile'],
      ['tile_collide', 'tile_collide'],
      ['source_items_json', 'source_items_json'],
      ['source_npcs_json', 'source_npcs_json']
    ]
  },
  buffs: {
    localTable: 'buffs',
    projectionTable: 'projection_buffs',
    key: 'internal_name',
    fieldPairs: [
      ['english_name', 'english_name'],
      ['name_zh', 'name_zh'],
      ['tooltip_en', 'tooltip_en'],
      ['tooltip_zh', 'tooltip_zh'],
      ['image_cached_url', 'image'],
      ['buff_type', 'buff_type'],
      ['source_item_count', 'source_item_count'],
      ['immune_npc_count', 'immune_npc_count']
    ]
  }
};

function isPresent(value) {
  return value !== null && value !== undefined && value !== '';
}

function sampleList(values = [], limit = 10) {
  return values.slice(0, limit);
}

function isAcceptedLocalOnlyRow(domain, row = {}, key) {
  if (domain !== 'items') {
    return false;
  }
  return String(key ?? row.internal_name ?? '').startsWith('ZH_RECIPE_')
    && String(row.source_provider ?? '').trim() === 'wiki_zh_recipe_import';
}

function buildDomainAudit(name, config, localRows = [], projectionRows = []) {
  const localMap = new Map(localRows.map((row) => [row[config.key], row]));
  const projectionMap = new Map(projectionRows.map((row) => [row[config.key], row]));
  const localKeys = [...localMap.keys()].filter(Boolean);
  const projectionKeys = [...projectionMap.keys()].filter(Boolean);
  const sharedKeys = localKeys.filter((key) => projectionMap.has(key));
  const rawMissingInProjection = localKeys.filter((key) => !projectionMap.has(key));
  const acceptedLocalOnlyExceptions = rawMissingInProjection.filter((key) => (
    isAcceptedLocalOnlyRow(name, localMap.get(key), key)
  ));
  const missingInProjection = rawMissingInProjection.filter((key) => !acceptedLocalOnlyExceptions.includes(key));
  const extraInProjection = projectionKeys.filter((key) => !localMap.has(key));

  const blockingFields = [];
  for (const [localField, projectionField] of config.fieldPairs) {
    let localNonNull = 0;
    let projectionNonNull = 0;
    const missingExamples = [];
    for (const key of sharedKeys) {
      const localRow = localMap.get(key) ?? {};
      const projectionRow = projectionMap.get(key) ?? {};
      const localPresent = isPresent(localRow[localField]);
      const projectionPresent = isPresent(projectionRow[projectionField]);
      if (localPresent) localNonNull += 1;
      if (projectionPresent) projectionNonNull += 1;
      if (localPresent && !projectionPresent && missingExamples.length < 5) {
        missingExamples.push({
          key,
          localField,
          projectionField,
          localValue: localRow[localField],
          projectionValue: projectionRow[projectionField] ?? null
        });
      }
    }
    if (projectionNonNull < localNonNull) {
      blockingFields.push({
        field: localField === projectionField ? localField : `${localField}<=${projectionField}`,
        localField,
        projectionField,
        localNonNull,
        projectionNonNull,
        gap: localNonNull - projectionNonNull,
        missingExamples
      });
    }
  }

  return {
    domain: name,
    status: missingInProjection.length === 0 && extraInProjection.length === 0 && blockingFields.length === 0 ? 'switchable' : 'blocked',
    localRowCount: localRows.length,
    projectionRowCount: projectionRows.length,
    sharedRowCount: sharedKeys.length,
    missingInProjectionCount: missingInProjection.length,
    extraInProjectionCount: extraInProjection.length,
    missingInProjection: sampleList(missingInProjection),
    extraInProjection: sampleList(extraInProjection),
    acceptedLocalOnlyExceptions: sampleList(acceptedLocalOnlyExceptions),
    blockingFields
  };
}

export function buildReplacementReadinessAudit({ localData = {}, projectionData = {} } = {}) {
  const domainResults = {};
  for (const [name, config] of Object.entries(DOMAIN_CONFIG)) {
    domainResults[name] = buildDomainAudit(
      name,
      config,
      localData[config.localTable] ?? [],
      projectionData[config.projectionTable] ?? []
    );
  }

  const switchableDomains = Object.values(domainResults)
    .filter((entry) => entry.status === 'switchable')
    .map((entry) => entry.domain);
  const blockedDomains = Object.values(domainResults)
    .filter((entry) => entry.status !== 'switchable')
    .map((entry) => entry.domain);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      switchableDomains,
      blockedDomains
    },
    domainResults
  };
}

function buildMarkdown(audit) {
  const lines = [
    '# Replacement Readiness',
    '',
    `Generated At: ${audit.generatedAt}`,
    '',
    `Switchable Domains: ${audit.summary.switchableDomains.join(', ') || 'none'}`,
    `Blocked Domains: ${audit.summary.blockedDomains.join(', ') || 'none'}`
  ];

  for (const domain of Object.keys(audit.domainResults)) {
    const entry = audit.domainResults[domain];
    lines.push('');
    lines.push(`## ${domain}`);
    lines.push(`- status: ${entry.status}`);
    lines.push(`- local rows: ${entry.localRowCount}`);
    lines.push(`- projection rows: ${entry.projectionRowCount}`);
    lines.push(`- shared rows: ${entry.sharedRowCount}`);
    lines.push(`- missing in projection: ${entry.missingInProjection.join(', ') || 'none'}`);
    lines.push(`- extra in projection: ${entry.extraInProjection.join(', ') || 'none'}`);
    lines.push(`- accepted local-only exceptions: ${(entry.acceptedLocalOnlyExceptions ?? []).join(', ') || 'none'}`);
    if (entry.blockingFields.length === 0) {
      lines.push('- blocking fields: none');
    } else {
      lines.push(`- blocking fields: ${entry.blockingFields.map((field) => `${field.field}(gap=${field.gap})`).join(', ')}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function loadTable(connection, table) {
  const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
  return rows;
}

export async function loadFourDomainData({ localConn, relationConn }) {
  const localData = {};
  const projectionData = {};
  for (const configEntry of Object.values(DOMAIN_CONFIG)) {
    localData[configEntry.localTable] = await loadTable(localConn, configEntry.localTable);
    projectionData[configEntry.projectionTable] = await loadTable(relationConn, configEntry.projectionTable);
  }
  return { localData, projectionData };
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null,
    writeMarkdown: booleanOption(raw['write-markdown'] ?? raw.writeMarkdown, true)
  };
}

export async function runReplacementReadinessAudit({
  localDatabase = 'terria_v1_local',
  relationDatabase = 'terria_v1_relation',
  dateTag = new Date().toISOString().slice(0, 10),
  writeMarkdown = true
} = {}) {
  const config = loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root'
  };
  const localConn = await mysql.createConnection({ ...mysqlOptions, database: localDatabase });
  const relationConn = await mysql.createConnection({ ...mysqlOptions, database: relationDatabase });

  try {
    const { localData, projectionData } = await loadFourDomainData({ localConn, relationConn });
    const audit = buildReplacementReadinessAudit({ localData, projectionData });
    const reportsDir = path.join(repoRoot, 'reports', 'relation');
    await fs.mkdir(reportsDir, { recursive: true });
    const jsonPath = path.join(reportsDir, `replacement-readiness-${dateTag}.json`);
    const mdPath = path.join(reportsDir, `replacement-readiness-${dateTag}.md`);
    await fs.writeFile(jsonPath, JSON.stringify(audit, null, 2));
    if (writeMarkdown) {
      await fs.writeFile(mdPath, buildMarkdown(audit));
    }
    return { audit, jsonPath, mdPath };
  } finally {
    await localConn.end();
    await relationConn.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cliOptions = parseArgs(process.argv.slice(2));
  const result = await runReplacementReadinessAudit({
    ...cliOptions,
    dateTag: cliOptions.dateTag ?? new Date().toISOString().slice(0, 10)
  });
  console.log(`Replacement readiness report: ${result.jsonPath}`);
}
