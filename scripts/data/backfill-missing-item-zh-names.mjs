#!/usr/bin/env node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wikiItemIdUrl = 'https://terraria.wiki.gg/zh/wiki/%E7%89%A9%E5%93%81_ID';
const wikiLanglinkCache = new Map();
let wikiLanglinkRateLimited = false;

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: resolveDefaultDatabaseName(),
};

const connection = await mysql.createConnection(db);

try {
  const wikiItemIdMap = await fetchWikiItemIdMap();
  const pageTitleByInternalName = loadItemPageTitlesByInternalName();
  const [rows] = await connection.query(`
    SELECT id, internal_name, name, name_zh
    FROM items
    WHERE deleted = 0
      AND (name_zh IS NULL OR TRIM(name_zh) = '')
    ORDER BY id ASC
  `);

  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    dbName: db.database,
    sources: {
      wikiItemIdPage: wikiItemIdUrl,
      wikiItemPageSnapshots: path.relative(workspaceRoot, path.join(workspaceRoot, 'data', 'standardized-view', 'item_pages')),
    },
    checked: rows.length,
    updated: 0,
    skipped: 0,
    reasons: {
      copied_from_existing_chinese_name: 0,
      wiki_item_id_page_internal_name: 0,
      wiki_item_id_page_id: 0,
      wiki_langlink_zh: 0,
      placeholder_or_unimplemented: 0,
      no_safe_zh_source: 0,
    },
    samples: [],
  };

  if (apply) {
    await connection.beginTransaction();
  }

  for (const row of rows) {
    const name = toText(row.name);
    const currentZh = toText(row.name_zh);
    if (currentZh) {
      summary.skipped += 1;
      continue;
    }

    let nextZh = null;
    let reason = '';

    if (isPlaceholderName(name)) {
      reason = 'placeholder_or_unimplemented';
    } else if (containsChinese(name)) {
      nextZh = name;
      reason = 'copied_from_existing_chinese_name';
    } else {
      const matchedFromWikiItemId = resolveZhNameFromWikiItemIdMap(wikiItemIdMap, row);
      if (matchedFromWikiItemId) {
        nextZh = matchedFromWikiItemId.value;
        reason = matchedFromWikiItemId.reason;
      } else {
        const pageTitle = pageTitleByInternalName.get(normalizeKey(row.internal_name));
        nextZh = await fetchChineseTitleFromWiki(pageTitle || name);
        reason = nextZh ? 'wiki_langlink_zh' : 'no_safe_zh_source';
      }
    }

    if (!nextZh) {
      summary.skipped += 1;
      summary.reasons[reason] += 1;
      pushSample(summary.samples, {
        id: row.id,
        internalName: row.internal_name,
        name,
        reason,
      });
      continue;
    }

    if (apply) {
      const [result] = await connection.execute(
        'UPDATE items SET name_zh = ?, updated_at = NOW() WHERE id = ?',
        [nextZh, row.id],
      );
      summary.updated += Number(result.affectedRows || 0);
    } else {
      summary.updated += 1;
    }

    summary.reasons[reason] += 1;
    pushSample(summary.samples, {
      id: row.id,
      internalName: row.internal_name,
      name,
      nameZhAfter: nextZh,
      reason,
    });
  }

  if (apply) {
    await connection.commit();
  }

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (apply) {
    await connection.rollback();
  }
  throw error;
} finally {
  await connection.end();
}

function resolveDefaultDatabaseName() {
  if (toText(process.env.TERRAPEDIA_DB_NAME)) return process.env.TERRAPEDIA_DB_NAME;
  return 'terria_v1_local';
}

function resolveZhNameFromWikiItemIdMap(wikiItemIdMap, row) {
  const internalNameKey = normalizeKey(row.internal_name);
  const idKey = Number.isFinite(Number(row.id)) ? Number(row.id) : null;
  const byInternalName = internalNameKey ? wikiItemIdMap.byInternalName.get(internalNameKey) : null;
  if (byInternalName) {
    return { value: byInternalName.nameZh, reason: 'wiki_item_id_page_internal_name' };
  }
  const byId = idKey == null ? null : wikiItemIdMap.byId.get(idKey);
  if (byId) {
    return { value: byId.nameZh, reason: 'wiki_item_id_page_id' };
  }
  return null;
}

async function fetchChineseTitleFromWiki(title) {
  const normalized = toText(title);
  if (!normalized) return null;
  if (wikiLanglinkCache.has(normalized)) {
    return wikiLanglinkCache.get(normalized);
  }
  if (wikiLanglinkRateLimited) {
    return null;
  }
  const url = `https://terraria.wiki.gg/api.php?action=query&titles=${encodeURIComponent(normalized)}&prop=langlinks&lllang=zh&format=json`;
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 TerraPedia/1.0' } });
    if (response.status === 429) {
      wikiLanglinkRateLimited = true;
      wikiLanglinkCache.set(normalized, null);
      return null;
    }
    if (!response.ok) {
      wikiLanglinkCache.set(normalized, null);
      return null;
    }
    const payload = await response.json();
    const pages = payload?.query?.pages ?? {};
    const page = Object.values(pages)[0];
    const zhTitle = toText(page?.langlinks?.[0]?.['*']);
    wikiLanglinkCache.set(normalized, zhTitle);
    return zhTitle;
  } catch {
    wikiLanglinkCache.set(normalized, null);
    return null;
  }
}

async function fetchWikiItemIdMap() {
  const response = await fetch(wikiItemIdUrl, { headers: { 'user-agent': 'Mozilla/5.0 TerraPedia/1.0' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch wiki item id page: ${response.status}`);
  }
  const html = await response.text();
  const byInternalName = new Map();
  const byId = new Map();
  const rowPattern = /<tr><td>(\d+)<\/td><td>([\s\S]*?)<\/td><td><code>([^<]+)<\/code><\/td><\/tr>/g;
  let match = rowPattern.exec(html);
  while (match) {
    const id = Number(match[1]);
    const nameZh = toText(decodeHtml(stripTags(match[2])));
    const internalName = toText(decodeHtml(stripTags(match[3])));
    if (nameZh && internalName) {
      byInternalName.set(normalizeKey(internalName), { id, internalName, nameZh });
      byId.set(id, { id, internalName, nameZh });
    }
    match = rowPattern.exec(html);
  }
  return { byInternalName, byId };
}

function loadItemPageTitlesByInternalName() {
  const out = new Map();
  const dir = path.join(workspaceRoot, 'data', 'standardized-view', 'item_pages');
  if (!fs.existsSync(dir)) return out;
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.records) ? payload.records : [];
    for (const entry of entries) {
      const internalName = normalizeKey(entry?.itemInternalName);
      const pageTitle = toText(entry?.pageTitle) || toText(entry?.requestedPageTitle) || toText(entry?.itemName);
      if (internalName && pageTitle && !out.has(internalName)) {
        out.set(internalName, pageTitle);
      }
    }
  }
  return out;
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

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeKey(value) {
  const text = toText(value);
  return text ? text.toLowerCase() : null;
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

function isPlaceholderName(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return text.includes('未实现') || text === '1' || /^\[\[\|\]\]/.test(text);
}

function pushSample(samples, sample) {
  if (samples.length < 40) {
    samples.push(sample);
  }
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
