#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fetchWikiUrlJson } from '../lib/wiki-item-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(process.cwd());
const standardizedPath = path.join(root, 'data', 'standardized', 'npcs.standardized.json');
const outputPath = path.resolve(args.output || path.join(root, 'data', 'generated', 'npc-id-row-images.json'));
const reportPath = path.resolve(args.report || path.join(root, 'reports', `npc-id-row-images-${new Date().toISOString().slice(0, 10)}.json`));
const sourceUrl = args.sourceUrl || 'https://terraria.wiki.gg/zh/api.php?action=parse&page=NPC_ID&prop=text&format=json';

const standardized = readJson(standardizedPath);
const standardizedRecords = Array.isArray(standardized?.records) ? standardized.records : [];
const standardizedById = new Map(standardizedRecords.map((record) => [toFiniteNumber(record?.id), record]).filter(([id]) => id != null));
const standardizedByInternalName = new Map(standardizedRecords.map((record) => [toText(record?.internalName), record]).filter(([name]) => name));

const payload = await fetchWikiUrlJson({
  url: sourceUrl,
  profile: 'parse',
  sourceKey: 'npc-id-row-images'
});
const html = payload?.parse?.text?.['*'];
if (!html || typeof html !== 'string') {
  throw new Error('NPC_ID parse response does not contain HTML text.');
}

const tableHtml = extractNpcTable(html);
const rowMatches = [...tableHtml.matchAll(/<tr>\s*<td>(-?\d+)\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td><code>([^<]+)<\/code>\s*<\/td>\s*<\/tr>/g)];

const records = rowMatches.map((match) => toNpcRowRecord(match, standardizedById, standardizedByInternalName)).filter(Boolean);

const summary = {
  generatedAt: new Date().toISOString(),
  sourceUrl,
  totalRows: records.length,
  sampleIds: records.slice(0, 12).map((record) => record.id),
};

const output = {
  generatedAt: summary.generatedAt,
  sourceUrl,
  count: records.length,
  records,
};

writeJson(outputPath, output);
writeJson(reportPath, summary);

console.log(JSON.stringify({
  outputPath,
  reportPath,
  count: records.length,
  samples: records.slice(0, 6),
}, null, 2));

function extractNpcTable(htmlText) {
  const start = htmlText.indexOf('<table class="terraria sortable cellborder"');
  if (start < 0) {
    throw new Error('Failed to locate NPC_ID table in parsed HTML.');
  }
  const end = htmlText.indexOf('</table>', start);
  if (end < 0) {
    throw new Error('Failed to locate end of NPC_ID table in parsed HTML.');
  }
  return htmlText.slice(start, end + '</table>'.length);
}

function toNpcRowRecord(match, byId, byInternalName) {
  const id = toFiniteNumber(match[1]);
  const nameCell = match[2];
  const imageCell = match[3];
  const internalName = toText(decodeHtml(match[4]));
  if (id == null || !internalName) {
    return null;
  }

  const nameZh = extractAnchorText(nameCell);
  const subNameZh = extractNoteText(nameCell);
  const img = extractImage(imageCell);
  const standardized = byId.get(id) ?? byInternalName.get(internalName) ?? null;

  return {
    id,
    gameId: id,
    internalName,
    nameZh,
    subNameZh,
    nameEn: toText(standardized?.name),
    imageFileTitle: img.fileTitle,
    imageUrl: img.src,
    thumbUrl: img.thumbUrl,
    originalImageUrl: img.originalImageUrl,
    imageWidth: img.width,
    imageHeight: img.height,
    imageContentType: guessContentType(img.fileTitle),
  };
}

function extractAnchorText(cellHtml) {
  const match = cellHtml.match(/<a [^>]*>([^<]+)<\/a>/);
  return match ? toText(decodeHtml(stripTags(match[1]))) : null;
}

function extractNoteText(cellHtml) {
  const match = cellHtml.match(/<span class="note-text">([\s\S]*?)<\/span>/);
  if (!match) {
    return null;
  }
  return toText(decodeHtml(stripTags(match[1])).replace(/[（）()]/g, ''));
}

function extractImage(cellHtml) {
  const match = cellHtml.match(/<img [^>]*alt="([^"]+)" [^>]*src="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/);
  if (!match) {
    return {
      fileTitle: null,
      src: null,
      thumbUrl: null,
      originalImageUrl: null,
      width: null,
      height: null,
    };
  }

  const fileTitle = toText(decodeHtml(match[1]));
  const src = toAbsoluteWikiUrl(match[2]);
  const width = toFiniteNumber(match[3]);
  const height = toFiniteNumber(match[4]);
  const originalImageUrl = deriveOriginalImageUrl(src);

  return {
    fileTitle,
    src,
    thumbUrl: src && src.includes('/images/thumb/') ? src : null,
    originalImageUrl,
    width,
    height,
  };
}

function deriveOriginalImageUrl(url) {
  const text = toText(url);
  if (!text) {
    return null;
  }
  if (!text.includes('/images/thumb/')) {
    return text;
  }

  const marker = '/images/thumb/';
  const index = text.indexOf(marker);
  const prefix = text.slice(0, index) + '/images/';
  const rest = text.slice(index + marker.length);
  const firstSlash = rest.indexOf('/');
  if (firstSlash < 0) {
    return text;
  }
  const encodedName = rest.slice(0, firstSlash);
  const queryIndex = text.indexOf('?');
  const query = queryIndex >= 0 ? text.slice(queryIndex) : '';
  return `${prefix}${encodedName}${query}`;
}

function toAbsoluteWikiUrl(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return text;
  }
  if (text.startsWith('/')) {
    return `https://terraria.wiki.gg${text}`;
  }
  return text;
}

function guessContentType(fileTitle) {
  const text = String(fileTitle || '').toLowerCase();
  if (text.endsWith('.gif')) return 'image/gif';
  if (text.endsWith('.png')) return 'image/png';
  if (text.endsWith('.jpg') || text.endsWith('.jpeg')) return 'image/jpeg';
  if (text.endsWith('.webp')) return 'image/webp';
  if (text.endsWith('.svg')) return 'image/svg+xml';
  return null;
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

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
