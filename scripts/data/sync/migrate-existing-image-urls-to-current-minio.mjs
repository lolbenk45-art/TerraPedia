#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveAdminAuth } from '../../lib/local-runtime-config.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const apiBase = trimTrailingSlash(args.apiBase || 'http://127.0.0.1:8891/api');
const managedUrlPrefix = trimTrailingSlash(args.managedUrlPrefix || 'http://localhost:9000/terrapedia-images') + '/';
const scopes = new Set((args.scopes || 'items,buffs,biomes,armor_sets').split(',').map((entry) => entry.trim()).filter(Boolean));
const { username: adminUsername, password: adminPassword } = resolveAdminAuth(args, {
  usernameKey: 'adminUsername',
  passwordKey: 'adminPassword',
});

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const connection = await mysql.createConnection(db);
const uploadCache = new Map();
const authHeader = await loginAndBuildAuthHeader();

try {
  const summary = {
    apply,
    apiBase,
    managedUrlPrefix,
    scopes: [...scopes],
    items: { checked: 0, updated: 0, skipped: 0, failed: 0, samples: [] },
    buffs: { checked: 0, updated: 0, skipped: 0, failed: 0, samples: [] },
    biomes: { checked: 0, updated: 0, skipped: 0, failed: 0, samples: [] },
    armor_sets: { checked: 0, updated: 0, skipped: 0, failed: 0, samples: [] },
  };

  if (apply) {
    await connection.beginTransaction();
  }

  if (scopes.has('items')) {
    await migrateItems(connection, summary.items);
  }
  if (scopes.has('buffs')) {
    await migrateBuffs(connection, summary.buffs);
  }
  if (scopes.has('biomes')) {
    await migrateBiomes(connection, summary.biomes);
  }
  if (scopes.has('armor_sets')) {
    await migrateArmorSets(connection, summary.armor_sets);
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

async function migrateItems(conn, stats) {
  const [rows] = await conn.query(`
    SELECT id, internal_name, image
    FROM items
    WHERE deleted = 0
      AND image IS NOT NULL
      AND TRIM(image) <> ''
    ORDER BY id ASC
  `);

  for (const row of rows) {
    stats.checked += 1;
    const currentValue = toText(row.image);
    if (!currentValue || isManagedUrl(currentValue)) {
      stats.skipped += 1;
      continue;
    }

    const sourceUrl = normalizeSourceUrl(currentValue);
    if (!sourceUrl) {
      stats.failed += 1;
      pushSample(stats, { id: row.id, internalName: row.internal_name, reason: 'unsupported_url', value: currentValue });
      continue;
    }

    const upload = await uploadFromUrl(sourceUrl, row.internal_name || `item-${row.id}`);
    if (!upload) {
      stats.failed += 1;
      pushSample(stats, { id: row.id, internalName: row.internal_name, reason: 'upload_failed', value: sourceUrl });
      continue;
    }

    if (apply) {
      const [result] = await conn.execute('UPDATE items SET image = ?, updated_at = NOW() WHERE id = ?', [upload.url, row.id]);
      stats.updated += Number(result.affectedRows || 0);
    } else {
      stats.updated += 1;
    }
    pushSample(stats, { id: row.id, internalName: row.internal_name, value: upload.url, reason: 'updated' });
  }
}

async function migrateBuffs(conn, stats) {
  const [rows] = await conn.query(`
    SELECT id, internal_name, image_path
    FROM buffs
    WHERE image_path IS NOT NULL
      AND TRIM(image_path) <> ''
    ORDER BY id ASC
  `);

  for (const row of rows) {
    stats.checked += 1;
    const currentValue = toText(row.image_path);
    if (!currentValue || isManagedUrl(currentValue)) {
      stats.skipped += 1;
      continue;
    }

    const sourceUrl = normalizeSourceUrl(currentValue);
    if (!sourceUrl) {
      stats.failed += 1;
      pushSample(stats, { id: row.id, internalName: row.internal_name, reason: 'unsupported_url', value: currentValue });
      continue;
    }

    const upload = await uploadFromUrl(sourceUrl, row.internal_name || `buff-${row.id}`);
    if (!upload) {
      stats.failed += 1;
      pushSample(stats, { id: row.id, internalName: row.internal_name, reason: 'upload_failed', value: sourceUrl });
      continue;
    }

    if (apply) {
      const [result] = await conn.execute('UPDATE buffs SET image_path = ?, updated_at = NOW() WHERE id = ?', [upload.url, row.id]);
      stats.updated += Number(result.affectedRows || 0);
    } else {
      stats.updated += 1;
    }
    pushSample(stats, { id: row.id, internalName: row.internal_name, value: upload.url, reason: 'updated' });
  }
}

async function migrateBiomes(conn, stats) {
  const [rows] = await conn.query(`
    SELECT id, code, icon_url
    FROM biomes
    WHERE icon_url IS NOT NULL
      AND TRIM(icon_url) <> ''
    ORDER BY id ASC
  `);

  for (const row of rows) {
    stats.checked += 1;
    const currentValue = toText(row.icon_url);
    if (!currentValue || isManagedUrl(currentValue)) {
      stats.skipped += 1;
      continue;
    }

    const sourceUrl = normalizeSourceUrl(currentValue);
    if (!sourceUrl) {
      stats.failed += 1;
      pushSample(stats, { id: row.id, code: row.code, reason: 'unsupported_url', value: currentValue });
      continue;
    }

    const upload = await uploadFromUrl(sourceUrl, row.code || `biome-${row.id}`);
    if (!upload) {
      stats.failed += 1;
      pushSample(stats, { id: row.id, code: row.code, reason: 'upload_failed', value: sourceUrl });
      continue;
    }

    if (apply) {
      const [result] = await conn.execute('UPDATE biomes SET icon_url = ?, updated_at = NOW() WHERE id = ?', [upload.url, row.id]);
      stats.updated += Number(result.affectedRows || 0);
    } else {
      stats.updated += 1;
    }
    pushSample(stats, { id: row.id, code: row.code, value: upload.url, reason: 'updated' });
  }
}

async function migrateArmorSets(conn, stats) {
  const [rows] = await conn.query(`
    SELECT id, internal_code, male_images, female_images, special_images
    FROM armor_sets
    ORDER BY id ASC
  `);

  for (const row of rows) {
    stats.checked += 1;
    let changed = false;
    const nextMale = await remapCsvField(row.male_images, row.internal_code || `armor-set-${row.id}`);
    const nextFemale = await remapCsvField(row.female_images, row.internal_code || `armor-set-${row.id}`);
    const nextSpecial = await remapCsvField(row.special_images, row.internal_code || `armor-set-${row.id}`);

    if (nextMale.changed || nextFemale.changed || nextSpecial.changed) {
      changed = true;
    }

    if (!changed) {
      stats.skipped += 1;
      continue;
    }

    if (apply) {
      const [result] = await conn.execute(
        'UPDATE armor_sets SET male_images = ?, female_images = ?, special_images = ?, updated_at = NOW() WHERE id = ?',
        [nextMale.value, nextFemale.value, nextSpecial.value, row.id]
      );
      stats.updated += Number(result.affectedRows || 0);
    } else {
      stats.updated += 1;
    }
    pushSample(stats, { id: row.id, internalCode: row.internal_code, reason: 'updated' });
  }
}

async function remapCsvField(value, nameHint) {
  const entries = splitCsv(value);
  if (entries.length === 0) {
    return { changed: false, value: value ?? '' };
  }

  let changed = false;
  const next = [];
  for (const entry of entries) {
    if (isManagedUrl(entry)) {
      next.push(entry);
      continue;
    }
    const sourceUrl = normalizeSourceUrl(entry);
    if (!sourceUrl) {
      next.push(entry);
      continue;
    }
    const upload = await uploadFromUrl(sourceUrl, nameHint);
    if (!upload) {
      next.push(entry);
      continue;
    }
    next.push(upload.url);
    changed = true;
  }

  return { changed, value: next.join(',') };
}

async function uploadFromUrl(sourceUrl, nameHint) {
  if (uploadCache.has(sourceUrl)) {
    return uploadCache.get(sourceUrl);
  }

  let upstream;
  try {
    upstream = await fetch(sourceUrl, {
      headers: { 'user-agent': 'TerraPedia-migrate/1.0' }
    });
  } catch (error) {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  if (!upstream.ok) {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await upstream.arrayBuffer();
  const fileName = buildFileName(sourceUrl, nameHint, contentType);
  const formData = new FormData();
  formData.append('file', new File([arrayBuffer], fileName, { type: contentType }));

  let response;
  try {
    response = await fetch(`${apiBase}/files/images`, {
      method: 'POST',
      headers: authHeader,
      body: formData,
    });
  } catch (error) {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  if (!response.ok) {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  const payload = await response.json();
  const result = payload?.data?.url ? { url: String(payload.data.url) } : null;
  uploadCache.set(sourceUrl, result);
  return result;
}

async function loginAndBuildAuthHeader() {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  if (!response.ok) {
    throw new Error(`Failed to login before upload: ${response.status}`);
  }
  const payload = await response.json();
  const token = payload?.data?.token;
  if (!token) {
    throw new Error('Login response does not contain token');
  }
  return { Authorization: `Bearer ${token}` };
}

function buildFileName(sourceUrl, nameHint, contentType) {
  const pathname = new URL(sourceUrl).pathname;
  const rawName = pathname.split('/').pop() || `${slugify(nameHint)}${guessExtension(contentType)}`;
  if (rawName.includes('.')) return rawName;
  return `${rawName}${guessExtension(contentType)}`;
}

function guessExtension(contentType) {
  const value = String(contentType).split(';')[0].trim().toLowerCase();
  switch (value) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    case 'image/avif': return '.avif';
    default: return '.bin';
  }
}

function normalizeSourceUrl(value) {
  const text = toText(value);
  if (!text) return null;
  if (text.startsWith('http://') || text.startsWith('https://')) return text;
  if (text.startsWith('localhost:') || text.startsWith('127.0.0.1:')) return `http://${text}`;
  return null;
}

function splitCsv(value) {
  const text = toText(value);
  if (!text) return [];
  return text.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function isManagedUrl(value) {
  const text = toText(value);
  return Boolean(text && text.startsWith(managedUrlPrefix));
}

function slugify(value) {
  const text = toText(value) || 'asset';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

function pushSample(stats, sample) {
  if (stats.samples.length < 30) stats.samples.push(sample);
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

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}
