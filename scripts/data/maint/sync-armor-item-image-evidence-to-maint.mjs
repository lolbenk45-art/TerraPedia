#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const moduleRequire = createRequire(import.meta.url);
let mysqlModule = null;

function loadMysqlModule() {
  if (mysqlModule) return mysqlModule;
  try {
    mysqlModule = moduleRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    mysqlModule = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

export function parseArgs(argv = []) {
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
    evidencePath: raw.evidence ?? raw['evidence-path'] ?? path.join('reports', `armor-item-image-evidence-${new Date().toISOString().slice(0, 10)}.json`),
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? 'terria_v1_maint',
    output: raw.output ?? path.join('reports', 'relation', `armor-item-image-evidence-maint-sync-${new Date().toISOString().slice(0, 10)}.json`)
  };
}

export function buildMaintArmorItemImageRows({
  evidenceCandidates = [],
  existingMaintImages = []
} = {}) {
  const existing = new Set(
    existingMaintImages
      .map((row) => toNullableText(row.item_internal_name ?? row.itemInternalName))
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  );

  return evidenceCandidates
    .filter((candidate) => {
      const internalName = toNullableText(candidate.internalName);
      return internalName
        && toNullableText(candidate.cachedUrl)
        && toNullableText(candidate.sourceUrl)
        && toNullableText(candidate.imageFileTitle)
        && !existing.has(internalName.toLowerCase());
    })
    .map((candidate) => {
      const internalName = toNullableText(candidate.internalName);
      const sourceUrl = toNullableText(candidate.sourceUrl);
      const cachedUrl = toNullableText(candidate.cachedUrl);
      const sourceFileTitle = toNullableText(candidate.imageFileTitle);
      return {
        recordKey: buildRecordKey(`armor-item-image-evidence:${internalName}:${cachedUrl}`),
        itemInternalName: internalName,
        itemName: toNullableText(candidate.name),
        role: 'icon',
        sourceProvider: 'terraria.wiki.gg',
        sourceFileTitle,
        sourcePage: toNullableText(candidate.pageTitle ?? candidate.requestedPageTitle),
        sourceRevisionTimestamp: null,
        originalUrl: sourceUrl,
        cachedUrl,
        width: toNullableNumber(candidate.width),
        height: toNullableNumber(candidate.height),
        contentType: toNullableText(candidate.contentType) ?? 'image/png',
        isPrimary: 1,
        sortOrder: 0,
        landingSourceId: 0,
        landingSourceKey: 'armor-item-image-evidence',
        landingSourcePage: 'armor-item-image-evidence',
        landingContentHash: buildRecordKey(`landing:armor-item-image-evidence:${internalName}:${sourceUrl}:${cachedUrl}`),
        landingFetchedAt: null,
        landingParsedAt: null,
        rawJson: JSON.stringify(candidate),
        status: 1,
        deleted: 0
      };
    });
}

function readEvidenceCandidates(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload?.candidates) ? payload.candidates : [];
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)] = value;
  }
  return mapped;
}

async function upsertRows(connection, tableName, rows) {
  let total = 0;
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(', ');
    await connection.execute(
      `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      columns.map((column) => mapped[column])
    );
    total += 1;
  }
  return total;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const evidencePath = path.resolve(process.cwd(), options.evidencePath);
  const output = path.resolve(process.cwd(), options.output);
  const config = loadLocalStackConfig(repoRoot);
  const databaseConfig = config.database ?? {};
  const mysql = loadMysqlModule();
  const connection = await mysql.createConnection({
    host: process.env.TERRAPEDIA_DB_HOST ?? databaseConfig.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? databaseConfig.port ?? 3306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? databaseConfig.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? databaseConfig.password ?? 'root',
    database: options.maintDatabase
  });

  try {
    const evidenceCandidates = readEvidenceCandidates(evidencePath);
    const [existingMaintImages] = await connection.query('SELECT item_internal_name FROM maint_item_images WHERE deleted = 0');
    const rows = buildMaintArmorItemImageRows({ evidenceCandidates, existingMaintImages });
    const summary = {
      generatedAt: new Date().toISOString(),
      apply: options.apply,
      evidencePath,
      maintDatabase: options.maintDatabase,
      evidenceCandidateCount: evidenceCandidates.length,
      existingMaintImageCount: existingMaintImages.length,
      insertedCandidateCount: rows.length,
      sampleRows: rows.slice(0, 20).map((row) => ({
        itemInternalName: row.itemInternalName,
        sourceFileTitle: row.sourceFileTitle,
        cachedUrl: row.cachedUrl
      })),
      upsertedCount: 0
    };

    if (options.apply && rows.length > 0) {
      await connection.beginTransaction();
      try {
        summary.upsertedCount = await upsertRows(connection, 'maint_item_images', rows);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.end();
  }
}

function buildRecordKey(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await run();
}
