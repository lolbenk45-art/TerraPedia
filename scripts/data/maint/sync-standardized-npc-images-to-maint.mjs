#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { buildMaintSchemaSql } from './maint-schema.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();

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
    apply: booleanOption(raw.apply, false),
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? 'terria_v1_maint',
    standardizedPath: raw['standardized-path'] ?? raw.standardizedPath ?? path.join('data', 'standardized', 'npcs.standardized.json')
  };
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function createRecordKey(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeFileTitle(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.replace(/^File:/i, '');
}

function toWikiImageUrl(fileTitle) {
  const normalizedTitle = normalizeFileTitle(fileTitle);
  if (!normalizedTitle) return null;
  return `https://terraria.wiki.gg/images/${encodeURIComponent(normalizedTitle)}`;
}

function extractMaintNpcImagesDdl() {
  const sql = buildMaintSchemaSql();
  const match = sql.match(/CREATE TABLE IF NOT EXISTS `maint_npc_images` \([\s\S]*?\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;/);
  if (!match) {
    throw new Error('Failed to locate maint_npc_images DDL in maint schema.');
  }
  return match[0];
}

export function buildMaintNpcImageRows({ standardizedRecords = [], maintNpcRows = [] } = {}) {
  const maintNpcByInternalName = new Map(
    maintNpcRows
      .map((row) => [normalizeText(row.internal_name), row])
      .filter(([internalName]) => internalName)
  );

  return standardizedRecords
    .map((record) => {
      const internalName = normalizeText(record?.internalName);
      const standardizedName = normalizeText(record?.name);
      const fileTitle = normalizeFileTitle(record?.imageFileTitle);
      const cachedUrl = normalizeText(record?.imageUrl);
      const originalUrl = toWikiImageUrl(fileTitle) ?? cachedUrl;
      if (!internalName || (!fileTitle && !cachedUrl)) {
        return null;
      }

      const maintNpc = maintNpcByInternalName.get(internalName) ?? null;
      return {
        recordKey: createRecordKey({
          type: 'standardized_npc_image',
          internalName,
          fileTitle,
          cachedUrl
        }),
        npcInternalName: internalName,
        npcName: normalizeText(maintNpc?.english_name) ?? standardizedName,
        role: 'icon',
        sourceProvider: 'terraria.wiki.gg',
        sourceFileTitle: fileTitle,
        sourcePage: 'NPC_ID',
        sourceRevisionTimestamp: null,
        originalUrl,
        cachedUrl: cachedUrl ?? originalUrl,
        width: toNullableNumber(record?.imageWidth),
        height: toNullableNumber(record?.imageHeight),
        contentType: normalizeText(record?.imageContentType),
        isPrimary: true,
        sortOrder: 0,
        rawJson: JSON.stringify(record)
      };
    })
    .filter(Boolean);
}

function camelToSnake(name) {
  return String(name).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[camelToSnake(key)] = value;
  }
  return mapped;
}

async function upsertNpcImageRows(connection, rows) {
  let affected = 0;
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(', ');
    const sql = `
INSERT INTO \`maint_npc_images\` (${columns.map((column) => `\`${column}\``).join(', ')}, \`status\`, \`deleted\`)
VALUES (${placeholders}, 1, 0)
ON DUPLICATE KEY UPDATE ${updates}, \`status\` = 1, \`deleted\` = 0
`.trim();
    await connection.execute(sql, columns.map((column) => mapped[column]));
    affected += 1;
  }
  return affected;
}

async function retireStaleNpcImageRows(connection, rows) {
  const activeInternalNames = [...new Set(
    rows
      .map((row) => normalizeText(row.npcInternalName))
      .filter(Boolean)
  )];
  if (activeInternalNames.length === 0) {
    return 0;
  }

  let retired = 0;
  for (const internalName of activeInternalNames) {
    const [result] = await connection.execute(
      `
UPDATE \`maint_npc_images\`
SET \`deleted\` = 1,
    \`status\` = 0,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`npc_internal_name\` = ?
  AND \`record_key\` NOT IN (${rows
    .filter((row) => normalizeText(row.npcInternalName) === internalName)
    .map(() => '?')
    .join(', ')})
  AND \`deleted\` = 0
      `.trim(),
      [
        internalName,
        ...rows
          .filter((row) => normalizeText(row.npcInternalName) === internalName)
          .map((row) => row.recordKey)
      ]
    );
    retired += Number(result?.affectedRows ?? 0);
  }
  return retired;
}

export async function runSync(options, dependencies = {}) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: options.maintDatabase
  };

  const standardizedPath = path.resolve(repoRoot, options.standardizedPath);
  const standardizedPayload = dependencies.standardizedPayload
    ?? JSON.parse(fs.readFileSync(standardizedPath, 'utf8'));
  const standardizedRecords = Array.isArray(standardizedPayload?.records)
    ? standardizedPayload.records
    : [];

  const connection = dependencies.connection ?? await mysql.createConnection(mysqlOptions);
  const ownsConnection = !dependencies.connection;

  try {
    await connection.query(extractMaintNpcImagesDdl());
    const [maintNpcRows] = await connection.query('SELECT internal_name, english_name FROM `maint_npcs`');
    const rows = buildMaintNpcImageRows({ standardizedRecords, maintNpcRows });
    let written = 0;
    let retired = 0;
    if (options.apply) {
      written = await upsertNpcImageRows(connection, rows);
      retired = await retireStaleNpcImageRows(connection, rows);
    }
    return {
      apply: options.apply,
      maintDatabase: options.maintDatabase,
      standardizedPath,
      totalStandardizedRecords: standardizedRecords.length,
      relationCandidateRows: rows.length,
      writtenRows: written,
      retiredRows: retired
    };
  } finally {
    if (ownsConnection) {
      await connection.end();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSync(options);
  console.log(JSON.stringify(result, null, 2));
}
