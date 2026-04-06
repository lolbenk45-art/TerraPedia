#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { resolveAdminAuth } from '../lib/local-runtime-config.mjs';

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const apiBase = trimTrailingSlash(args.apiBase || 'http://127.0.0.1:8888/api');
const { username: adminUsername, password: adminPassword } = resolveAdminAuth(args, {
  usernameKey: 'adminUsername',
  passwordKey: 'adminPassword',
  requiredPassword: !skipUpload,
});
const managedUrlPrefix = trimTrailingSlash(args.managedUrlPrefix || 'http://localhost:9000/terrapedia-images') + '/';
const limit = Math.max(0, Number(args.limit || '0'));
const skipUpload = args.skipUpload === 'true';
const standardizedPath = path.join(process.cwd(), 'data', 'standardized', 'projectiles.standardized.json');
const generatedMapPath = path.join(process.cwd(), 'data', 'generated', 'projectile-zh-map.json');
const output = args.output || path.join(process.cwd(), 'reports', `projectile-zh-image-backfill-${new Date().toISOString().slice(0, 10)}.json`);

if (!fs.existsSync(standardizedPath)) {
  throw new Error(`Missing standardized projectiles file: ${standardizedPath}`);
}

const payload = JSON.parse(fs.readFileSync(standardizedPath, 'utf8'));
const allRecords = Array.isArray(payload?.records) ? payload.records : [];
const records = limit > 0 ? allRecords.slice(0, limit) : allRecords;
const zhMap = await fetchProjectileZhMap();
const uploadCache = new Map();
const authHeader = skipUpload ? null : await loginAndBuildAuthHeader();

const summary = {
  generatedAt: new Date().toISOString(),
  apply,
  apiBase,
  managedUrlPrefix,
  skipUpload,
  standardizedPath,
  languageSourceTitle: 'Terraria Wiki:语言包/.Projectiles.json/ProjectileName',
  sourceMapCount: zhMap.size,
  total: records.length,
  totalAvailable: allRecords.length,
  zhMatched: 0,
  zhUpdated: 0,
  imageResolved: 0,
  imageUploadedToMinio: 0,
  imageAlreadyManaged: 0,
  recordsChanged: 0,
  unresolvedZh: 0,
  unresolvedImage: 0,
  samples: [],
};

for (const record of records) {
  const internalName = toText(record?.internalName);
  if (!internalName) continue;

  let changed = false;
  const zhEntry = zhMap.get(internalName) ?? null;
  const existingZh = toText(record?.localized?.zh?.name ?? record?.nameZh);
  const nextZh = toText(zhEntry?.nameZh) ?? existingZh;
  if (zhEntry?.nameZh) {
    summary.zhMatched += 1;
  } else if (!existingZh) {
    summary.unresolvedZh += 1;
  }
  if (nextZh && nextZh !== existingZh) {
    if (!record.localized || typeof record.localized !== 'object' || Array.isArray(record.localized)) {
      record.localized = {};
    }
    const localizedZh = record.localized.zh && typeof record.localized.zh === 'object' && !Array.isArray(record.localized.zh)
      ? record.localized.zh
      : {};
    localizedZh.name = nextZh;
    localizedZh.namesub = localizedZh.namesub ?? null;
    localizedZh.page = localizedZh.page ?? null;
    localizedZh.tooltip = localizedZh.tooltip ?? null;
    record.localized.zh = localizedZh;
    record.nameZh = nextZh;
    summary.zhUpdated += 1;
    changed = true;
  } else if (nextZh && record.nameZh !== nextZh) {
    record.nameZh = nextZh;
    changed = true;
  }

  const sourceImageUrl = resolveProjectileImageSourceUrl(record);
  if (!sourceImageUrl) {
    summary.unresolvedImage += 1;
  } else {
    summary.imageResolved += 1;
    const currentImageUrl = toText(record?.imageUrl);
    if (isManagedUrl(currentImageUrl, managedUrlPrefix)) {
      summary.imageAlreadyManaged += 1;
    } else if (skipUpload) {
      pushSample(summary.samples, {
        internalName,
        name: toText(record?.name),
        nameZh: toText(record?.nameZh ?? record?.localized?.zh?.name),
        imageUrl: currentImageUrl,
        pendingImageSourceUrl: sourceImageUrl,
      });
    } else {
      const uploaded = await uploadFromUrl(sourceImageUrl, internalName);
      if (uploaded?.url) {
        if (uploaded.url !== currentImageUrl) {
          record.imageUrl = uploaded.url;
          changed = true;
        }
        summary.imageUploadedToMinio += 1;
      } else if (!currentImageUrl) {
        summary.unresolvedImage += 1;
      }
    }
  }

  if (changed) {
    summary.recordsChanged += 1;
    pushSample(summary.samples, {
      internalName,
      name: toText(record?.name),
      nameZh: toText(record?.nameZh ?? record?.localized?.zh?.name),
      imageUrl: toText(record?.imageUrl),
    });
  }
}

if (apply) {
  fs.writeFileSync(standardizedPath, JSON.stringify(payload, null, 2), 'utf8');
}

writeJson(generatedMapPath, {
  generatedAt: new Date().toISOString(),
  count: zhMap.size,
  records: Object.fromEntries(
    [...zhMap.entries()].map(([internalName, value]) => [internalName, value])
  ),
});
writeJson(output, summary);
console.log(JSON.stringify(summary, null, 2));

async function fetchProjectileZhMap() {
  const apiUrl = new URL('https://terraria.wiki.gg/zh/api.php');
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('titles', 'Terraria Wiki:语言包/.Projectiles.json/ProjectileName');
  apiUrl.searchParams.set('prop', 'revisions');
  apiUrl.searchParams.set('rvslots', 'main');
  apiUrl.searchParams.set('rvprop', 'content');
  apiUrl.searchParams.set('format', 'json');
  apiUrl.searchParams.set('formatversion', '2');

  const response = await fetch(apiUrl, {
    headers: { 'user-agent': 'TerraPedia-projectile-zh/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch projectile zh map: HTTP ${response.status}`);
  }
  const data = await response.json();
  const content = data?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (!toText(content)) {
    throw new Error('Projectile zh language page did not return content');
  }
  return parseProjectileZhTable(content);
}

function parseProjectileZhTable(content) {
  const map = new Map();
  const rows = String(content).match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const headerMatch = row.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    if (!headerMatch) continue;
    const internalName = cleanCellText(headerMatch[1]);
    if (!internalName || internalName === '内部名称') continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cleanCellText(match[1]));
    const nameEn = toText(cells[0]);
    const builtInZh = toText(cells[1]);
    const langPackZh = toText(cells[2]);
    const nameZh = langPackZh || builtInZh;
    map.set(internalName, { internalName, nameEn, nameZh, builtInZh, langPackZh });
  }
  return map;
}

function cleanCellText(value) {
  return decodeHtmlEntities(
    String(value ?? '')
      .replace(/<code[^>]*>[\s\S]*?<\/code>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function resolveProjectileImageSourceUrl(record) {
  const current = toText(record?.imageUrl);
  if (current && !isManagedUrl(current, managedUrlPrefix)) return current;

  const fileTitle = normalizeFileTitle(record?.imageFileTitle ?? record?.extras?.image ?? record?.image);
  if (!fileTitle) return current;
  return `https://terraria.wiki.gg/images/${encodeURIComponent(fileTitle.replace(/ /g, '_'))}`;
}

function normalizeFileTitle(value) {
  const text = toText(value);
  if (!text) return null;
  return text.replace(/^File:/i, '').trim();
}

function isManagedUrl(value, prefix) {
  const text = toText(value);
  return Boolean(text && text.startsWith(prefix));
}

async function uploadFromUrl(sourceUrl, nameHint) {
  if (skipUpload) {
    return null;
  }
  if (uploadCache.has(sourceUrl)) {
    return uploadCache.get(sourceUrl);
  }

  let upstream;
  try {
    upstream = await fetch(sourceUrl, {
      headers: { 'user-agent': 'TerraPedia-projectile-image-backfill/1.0' },
    });
  } catch {
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

  const response = await fetch(`${apiBase}/files/images`, {
    method: 'POST',
    headers: authHeader ?? undefined,
    body: formData,
  });
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
  let rawName = '';
  try {
    rawName = new URL(sourceUrl).pathname.split('/').pop() || '';
  } catch {
    rawName = '';
  }
  if (!rawName) {
    rawName = `${slug(nameHint)}${guessExtension(contentType)}`;
  }
  rawName = decodeURIComponent(rawName);
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

function slug(value) {
  const text = toText(value) || 'asset';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function trimTrailingSlash(value) {
  let text = String(value || '');
  while (text.endsWith('/')) text = text.slice(0, -1);
  return text;
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

function pushSample(samples, sample) {
  if (samples.length < 50) samples.push(sample);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}
