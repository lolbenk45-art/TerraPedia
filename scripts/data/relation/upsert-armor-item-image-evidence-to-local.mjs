#!/usr/bin/env node

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
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    output: raw.output ?? path.join('reports', 'relation', `armor-item-image-evidence-local-upsert-${new Date().toISOString().slice(0, 10)}.json`)
  };
}

export function buildLocalArmorItemImageRows({
  evidenceCandidates = [],
  localItems = []
} = {}) {
  const itemByInternalName = new Map(
    localItems
      .map((item) => [toNullableText(item.internal_name ?? item.internalName)?.toLowerCase(), item])
      .filter(([key]) => key)
  );

  const rows = [];
  const skipped = [];
  for (const candidate of evidenceCandidates) {
    const internalName = toNullableText(candidate.internalName);
    const item = internalName ? itemByInternalName.get(internalName.toLowerCase()) : null;
    const cachedUrl = toNullableText(candidate.cachedUrl);
    const originalUrl = toNullableText(candidate.sourceUrl);
    const sourceFileTitle = toNullableText(candidate.imageFileTitle);
    if (!item || !cachedUrl || !originalUrl || !sourceFileTitle) {
      skipped.push({
        internalName,
        reason: !item ? 'missing_local_item' : 'missing_required_image_field'
      });
      continue;
    }
    rows.push({
      itemId: Number(item.id),
      internalName,
      role: 'icon',
      provider: 'wiki_gg',
      sourceFileTitle,
      sourcePage: toNullableText(candidate.pageTitle ?? candidate.requestedPageTitle),
      sourceRevisionTimestamp: null,
      originalUrl,
      cachedUrl,
      width: toNullableNumber(candidate.width),
      height: toNullableNumber(candidate.height),
      contentType: toNullableText(candidate.contentType) ?? 'image/png',
      isPrimary: 1,
      sortOrder: 0
    });
  }
  return { rows, skipped };
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
    database: options.localDatabase
  });

  try {
    const evidenceCandidates = readEvidenceCandidates(evidencePath);
    const [localItems] = await connection.query('SELECT id, internal_name FROM items WHERE deleted = 0');
    const { rows, skipped } = buildLocalArmorItemImageRows({ evidenceCandidates, localItems });
    const summary = {
      generatedAt: new Date().toISOString(),
      apply: options.apply,
      evidencePath,
      localDatabase: options.localDatabase,
      evidenceCandidateCount: evidenceCandidates.length,
      plannedUpsertCount: rows.length,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 100),
      insertedCount: 0,
      updatedCount: 0,
      itemImageUpdatedCount: 0,
      sampleRows: rows.slice(0, 20).map((row) => ({
        itemId: row.itemId,
        internalName: row.internalName,
        sourceFileTitle: row.sourceFileTitle,
        cachedUrl: row.cachedUrl
      }))
    };

    if (options.apply && rows.length > 0) {
      await connection.beginTransaction();
      try {
        for (const row of rows) {
          const result = await upsertLocalItemImage(connection, row);
          summary.insertedCount += result.inserted ? 1 : 0;
          summary.updatedCount += result.updated ? 1 : 0;
          const [itemUpdate] = await connection.execute(
            `UPDATE items
                SET image = ?,
                    updated_at = NOW()
              WHERE id = ?
                AND deleted = 0
                AND (
                  image IS NULL
                  OR TRIM(image) = ''
                  OR image <> ?
                )`,
            [row.cachedUrl, row.itemId, row.cachedUrl]
          );
          summary.itemImageUpdatedCount += Number(itemUpdate.affectedRows ?? 0);
        }
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

async function upsertLocalItemImage(connection, row) {
  const [existingRows] = await connection.execute(
    `SELECT id
       FROM item_images
      WHERE item_id = ?
        AND role = ?
        AND provider = ?
        AND source_file_title = ?
        AND deleted = 0
      LIMIT 1`,
    [row.itemId, row.role, row.provider, row.sourceFileTitle]
  );
  const existing = existingRows[0] ?? null;
  if (existing) {
    await connection.execute(
      `UPDATE item_images
          SET source_page = ?,
              source_revision_timestamp = ?,
              original_url = ?,
              cached_url = ?,
              width = ?,
              height = ?,
              content_type = ?,
              is_primary = ?,
              sort_order = ?,
              status = 1,
              deleted = 0,
              updated_at = NOW()
        WHERE id = ?`,
      [
        row.sourcePage,
        row.sourceRevisionTimestamp,
        row.originalUrl,
        row.cachedUrl,
        row.width,
        row.height,
        row.contentType,
        row.isPrimary,
        row.sortOrder,
        existing.id
      ]
    );
    return { inserted: false, updated: true };
  }
  await connection.execute(
    `INSERT INTO item_images
      (item_id, role, provider, source_file_title, source_page, source_revision_timestamp, original_url, cached_url, width, height, content_type, is_primary, sort_order, status, deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
    [
      row.itemId,
      row.role,
      row.provider,
      row.sourceFileTitle,
      row.sourcePage,
      row.sourceRevisionTimestamp,
      row.originalUrl,
      row.cachedUrl,
      row.width,
      row.height,
      row.contentType,
      row.isPrimary,
      row.sortOrder
    ]
  );
  return { inserted: true, updated: false };
}

function readEvidenceCandidates(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload?.candidates) ? payload.candidates : [];
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
