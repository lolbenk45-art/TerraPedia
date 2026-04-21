#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveAdminAuth, resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';
import { resolveArmorSetDetailPath } from './entity-audit-api-path.mjs';
import { getBuffAuditStatsSql } from './entity-audit-sql.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const output = args.output || path.join(process.cwd(), 'reports', '实体数据完整性审计_2026-03-30.json');
const apiBase = trimTrailingSlash(resolveBackendApiBase(args));
const { username, password } = resolveAdminAuth(args);

const standardizedFiles = {
  items: path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
  buffs: path.join(process.cwd(), 'data', 'standardized', 'buffs.standardized.json'),
  npcs: path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
  projectiles: path.join(process.cwd(), 'data', 'standardized', 'projectiles.standardized.json'),
  armorSets: path.join(process.cwd(), 'data', 'standardized', 'armor_sets.standardized.json'),
  biomes: path.join(process.cwd(), 'data', 'standardized', 'biomes.standardized.json'),
};

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const conn = await mysql.createConnection(db);
const authHeader = await loginAndBuildAuthHeader();

try {
  const report = {
    generatedAt: new Date().toISOString(),
    apiBase,
    db,
    modules: {
      items: await auditItems(),
      buffs: await auditBuffs(),
      npcs: await auditNpcs(),
      projectiles: await auditProjectiles(),
      armorSets: await auditArmorSets(),
      biomes: await auditBiomes(),
    },
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ output, modules: Object.keys(report.modules) }, null, 2));
} finally {
  await conn.end();
}

async function auditItems() {
  const standardized = readStandardized(standardizedFiles.items);
  const [dbStats] = await conn.query(`
    SELECT COUNT(*) AS total,
           SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> '') AS zh_name,
           SUM(description_zh IS NOT NULL AND TRIM(description_zh) <> '') AS zh_description,
           SUM(tooltip_zh IS NOT NULL AND TRIM(tooltip_zh) <> '') AS zh_tooltip,
           SUM(image LIKE 'http://localhost:9000/%') AS minio_image
    FROM items
    WHERE deleted = 0
  `);
  const api = await fetchJson('/items?page=1&limit=1');
  return summarizeModule('items', standardized, dbStats[0], api, {
    zhFields: ['nameZh', 'descriptionZh', 'tooltipZh'],
    enFields: ['name', 'description', 'tooltip'],
    imageFields: ['image'],
  });
}

async function auditBuffs() {
  const standardized = readStandardized(standardizedFiles.buffs);
  const [dbStats] = await conn.query(getBuffAuditStatsSql());
  const api = await fetchJson('/admin/buffs?page=1&limit=1', true);
  return summarizeModule('buffs', standardized, dbStats[0], api, {
    zhFields: ['nameZh'],
    enFields: ['englishName'],
    imageFields: ['image', 'imagePath'],
  });
}

async function auditNpcs() {
  const standardized = readStandardized(standardizedFiles.npcs);
  const [dbStats] = await conn.query(`
    SELECT COUNT(*) AS total,
           SUM(name IS NOT NULL AND TRIM(name) <> '') AS zh_name,
           SUM(sub_name IS NOT NULL AND TRIM(sub_name) <> '') AS zh_sub_name
    FROM npcs
  `);
  const api = await fetchJson('/admin/npcs/1', true);
  return summarizeModule('npcs', standardized, dbStats[0], api, {
    zhFields: ['nameZh', 'subNameZh'],
    enFields: ['nameEn', 'subNameEn'],
    imageFields: ['imageUrl'],
  });
}

async function auditProjectiles() {
  const standardized = readStandardized(standardizedFiles.projectiles);
  const [dbStats] = await conn.query(`
    SELECT COUNT(*) AS total,
           SUM(raw_json LIKE '%\"imageUrl\":\"http://localhost:9000/%') AS minio_image
    FROM projectiles
    WHERE deleted = 0
  `);
  const api = await fetchJson('/admin/projectiles/2', true);
  return summarizeModule('projectiles', standardized, dbStats[0], api, {
    zhFields: ['nameZh'],
    enFields: ['nameEn'],
    imageFields: ['imageUrl'],
  });
}

async function auditArmorSets() {
  const standardized = readStandardized(standardizedFiles.armorSets);
  const [dbStats] = await conn.query(`
    SELECT COUNT(*) AS total,
           SUM(male_images LIKE '%http://localhost:9000/%') AS male_minio,
           SUM(female_images LIKE '%http://localhost:9000/%') AS female_minio
    FROM armor_sets
  `);
  const listApi = await fetchJson('/admin/armor-sets?page=1&limit=1', true);
  const detailPath = resolveArmorSetDetailPath(listApi?.data ?? listApi);
  const api = detailPath ? await fetchJson(detailPath, true) : listApi;
  return summarizeModule('armorSets', standardized, dbStats[0], api, {
    zhFields: ['nameZh', 'textZh', 'benefitZh'],
    enFields: ['nameEn', 'textEn', 'benefitEn'],
    imageFields: ['maleImages', 'femaleImages', 'specialImages'],
  });
}

async function auditBiomes() {
  const standardized = readStandardized(standardizedFiles.biomes);
  const [dbStats] = await conn.query(`
    SELECT COUNT(*) AS total,
           SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> '') AS zh_name,
           SUM(alias_zh IS NOT NULL AND TRIM(alias_zh) <> '') AS zh_alias,
           SUM(icon_url LIKE 'http://localhost:9000/%') AS minio_image
    FROM biomes
    WHERE deleted = 0
  `);
  const api = await fetchJson('/admin/biomes/1', true);
  return summarizeModule('biomes', standardized, dbStats[0], api, {
    zhFields: ['nameZh', 'aliasZh'],
    enFields: ['nameEn', 'aliasEn'],
    imageFields: ['iconUrl'],
  });
}

function summarizeModule(name, standardized, dbStats, api, contract) {
  const raw = api?.data ?? api ?? {};
  const sample = Array.isArray(raw) ? (raw[0] ?? {}) : raw;
  return {
    standardizedCount: standardized.count,
    standardizedKeys: standardized.keys,
    dbStats,
    apiSampleFields: Object.keys(sample),
    zhFields: contract.zhFields.map(field => ({ field, present: field in sample, value: sample[field] ?? null })),
    enFields: contract.enFields.map(field => ({ field, present: field in sample, value: sample[field] ?? null })),
    imageFields: contract.imageFields.map(field => ({ field, present: field in sample, value: sample[field] ?? null })),
  };
}

function readStandardized(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const records = Array.isArray(raw.records) ? raw.records : [];
  return {
    count: records.length,
    keys: Object.keys(records[0] || {}).sort(),
  };
}

async function loginAndBuildAuthHeader() {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  const payload = await response.json();
  return { Authorization: `Bearer ${payload.data.token}` };
}

async function fetchJson(pathname, auth = false) {
  const response = await fetch(`${apiBase}${pathname}`, {
    headers: auth ? authHeader : undefined,
  });
  if (!response.ok) {
    return { status: response.status };
  }
  return response.json();
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function trimTrailingSlash(value) {
  let result = value;
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}
