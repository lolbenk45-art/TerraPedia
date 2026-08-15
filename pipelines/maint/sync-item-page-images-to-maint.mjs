#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

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

function toText(value) {
  return String(value ?? '').trim();
}

function toNullableText(value) {
  const text = toText(value);
  return text ? text : null;
}

function slug(value) {
  return toText(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizeWikiAssetUrl(value) {
  const text = toText(value);
  if (!text) return null;
  if (text.startsWith('http://') || text.startsWith('https://')) return text;
  if (text.startsWith('//')) return `https:${text}`;
  if (text.startsWith('/')) return `https://terraria.wiki.gg${text}`;
  return null;
}

function normalizeImageStem(value) {
  const text = toText(value);
  if (!text) return '';
  let stem = text;
  try {
    stem = new URL(text).pathname.split('/').pop() || text;
  } catch {
    stem = text.split('/').pop() || text;
  }
  return decodeURIComponent(stem)
    .replace(/\?.*$/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

function extractImageCandidates(html) {
  const text = toText(html);
  if (!text) return [];
  const ignored = ['desktop_only', 'console_only', 'mobile_only', 'stack_digit_', 'rarity_', 'journey_mode', 'map_icon'];
  const results = [];
  for (const match of text.matchAll(/<img[^>]+src="([^"]+)"/ig)) {
    const normalized = normalizeWikiAssetUrl(match[1]);
    if (!normalized) continue;
    const candidateSlug = slug(normalized);
    if (ignored.some((keyword) => candidateSlug.includes(keyword))) continue;
    results.push(normalized);
  }
  return [...new Set(results)];
}

function scoreCandidate(candidate, itemName) {
  const candidateSlug = normalizeImageStem(candidate);
  const itemSlug = normalizeImageStem(itemName);
  if (!itemSlug) return 0;
  if (candidateSlug === itemSlug) return 1000;
  if (candidateSlug === `${itemSlug}placed`) return 950;
  if (candidateSlug === `${itemSlug}demo`) return 940;

  let score = 0;
  if (candidateSlug.includes(itemSlug)) score += 200;
  if (candidateSlug.startsWith(itemSlug)) score += 60;

  const tokens = itemSlug.match(/[a-z0-9]+/g) || [];
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (candidateSlug.includes(token)) score += 15;
  }

  if (/(placed|demo|old|icon|map|banner|render|gif)$/.test(candidateSlug)) score -= 25;
  if (/^(any|placed)/.test(candidateSlug)) score -= 40;
  return score;
}

export function selectBestItemImageUrlFromPageHtml({ html, itemName, internalName }) {
  const candidates = extractImageCandidates(html);
  if (!candidates.length) return null;
  const label = toText(itemName) || toText(internalName);
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, label) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.candidate ?? null;
}

function inferContentType(url) {
  const lower = normalizeWikiAssetUrl(url)?.toLowerCase() ?? '';
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.svg')) return 'image/svg+xml';
  return null;
}

function buildRecordKey(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function fileTitleFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').pop() || '');
  } catch {
    return null;
  }
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)] = value;
  }
  return mapped;
}

async function upsertRows(connection, tableName, rows) {
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
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const output = path.resolve(process.cwd(), args.output ?? path.join('reports', 'relation', `item-page-image-sync-${new Date().toISOString().slice(0, 10)}.json`));
  const connection = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_maint',
  });

  try {
    const limit = Number(args.limit ?? 200);
    const [rows] = await connection.query(
      `SELECT p.item_internal_name, p.item_name, p.page_title, p.html
       FROM maint_item_pages p
       LEFT JOIN maint_item_images i ON i.item_internal_name = p.item_internal_name AND i.deleted = 0
       WHERE p.deleted = 0
         AND i.id IS NULL
         AND p.html IS NOT NULL
       ORDER BY p.id ASC
       LIMIT ?`,
      [limit]
    );

    const updates = rows
      .map((row) => {
        const imageUrl = selectBestItemImageUrlFromPageHtml({
          html: row.html,
          itemName: row.item_name,
          internalName: row.item_internal_name,
        });
        if (!imageUrl) return null;
        const fileTitle = fileTitleFromUrl(imageUrl);
        return {
          recordKey: buildRecordKey(`maint_item_images:page-html:${row.item_internal_name}:${imageUrl}`),
          itemInternalName: row.item_internal_name,
          itemName: row.item_name,
          role: 'icon',
          sourceProvider: 'terraria.wiki.gg',
          sourceFileTitle: fileTitle,
          sourcePage: row.page_title,
          sourceRevisionTimestamp: null,
          originalUrl: imageUrl,
          cachedUrl: imageUrl,
          width: null,
          height: null,
          contentType: inferContentType(imageUrl),
          isPrimary: 1,
          sortOrder: 0,
          landingSourceId: 0,
          landingSourceKey: 'maint_item_pages.html',
          landingSourcePage: row.page_title,
          landingContentHash: buildRecordKey(`maint-item-pages:${row.item_internal_name}:${imageUrl}`),
          landingFetchedAt: null,
          landingParsedAt: null,
          rawJson: JSON.stringify({
            itemInternalName: row.item_internal_name,
            pageTitle: row.page_title,
            imageUrl,
          }),
          status: 1,
          deleted: 0,
        };
      })
      .filter(Boolean);

    if (apply && updates.length > 0) {
      await connection.beginTransaction();
      try {
        await upsertRows(connection, 'maint_item_images', updates);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      scannedCount: rows.length,
      updateCount: updates.length,
      sampleUpdates: updates.slice(0, 20).map((row) => ({
        itemInternalName: row.itemInternalName,
        sourcePage: row.sourcePage,
        sourceFileTitle: row.sourceFileTitle,
        originalUrl: row.originalUrl,
      })),
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
