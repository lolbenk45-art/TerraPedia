#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const force = args.force === 'true';
const managedUrlPrefix = trimTrailingSlash(args.managedUrlPrefix || 'http://localhost:9000/terrapedia-images') + '/';
const output = args.output || path.join(process.cwd(), 'reports', `items-image-report-replay-${new Date().toISOString().slice(0, 10)}.json`);
const reportFiles = (args.reports || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => path.resolve(process.cwd(), entry));

if (reportFiles.length === 0) {
  throw new Error('No report files provided. Pass --reports=reports/a.json,reports/b.json');
}

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const summary = {
  generatedAt: new Date().toISOString(),
  apply,
  force,
  database: db.database,
  managedUrlPrefix,
  reportFiles,
  reportsScanned: 0,
  sampleRowsScanned: 0,
  reusableCandidates: 0,
  uniqueCandidates: 0,
  updated: 0,
  skippedExistingImage: 0,
  skippedMissingItem: 0,
  skippedInvalidSample: 0,
  sampleUpdates: [],
};

const candidateById = loadCandidates(reportFiles, managedUrlPrefix, summary);
summary.uniqueCandidates = candidateById.size;

const conn = await mysql.createConnection(db);

try {
  if (apply) {
    await conn.beginTransaction();
  }

  for (const [itemId, candidate] of candidateById.entries()) {
    const [rows] = await conn.execute(
      `SELECT id, internal_name, name, image
         FROM items
        WHERE id = ?
          AND deleted = 0
        LIMIT 1`,
      [itemId],
    );

    if (rows.length === 0) {
      summary.skippedMissingItem += 1;
      continue;
    }

    const row = rows[0];
    const currentImage = toText(row.image);
    if (!force && currentImage) {
      summary.skippedExistingImage += 1;
      continue;
    }

    if (apply) {
      const [result] = await conn.execute(
        'UPDATE items SET image = ?, updated_at = NOW() WHERE id = ?',
        [candidate.url, itemId],
      );
      summary.updated += Number(result.affectedRows || 0);
    } else {
      summary.updated += 1;
    }

    pushSample(summary.sampleUpdates, {
      id: itemId,
      internalName: row.internal_name,
      name: row.name,
      url: candidate.url,
      report: candidate.report,
    });
  }

  if (apply) {
    await conn.commit();
  }
} catch (error) {
  if (apply) {
    await conn.rollback();
  }
  throw error;
} finally {
  await conn.end();
  persistSummary(output, summary);
}

console.log(JSON.stringify(summary, null, 2));

function loadCandidates(files, managedPrefix, summary) {
  const candidateById = new Map();

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Report file not found: ${filePath}`);
    }

    summary.reportsScanned += 1;
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const samples = Array.isArray(payload.samples) ? payload.samples : [];

    for (const sample of samples) {
      summary.sampleRowsScanned += 1;
      const itemId = Number(sample?.id);
      const reason = toText(sample?.reason);
      const url = resolveManagedUrl(sample, managedPrefix);
      if (!Number.isFinite(itemId) || reason !== 'updated' || !url) {
        summary.skippedInvalidSample += 1;
        continue;
      }

      summary.reusableCandidates += 1;
      if (!candidateById.has(itemId)) {
        candidateById.set(itemId, { url, report: path.relative(process.cwd(), filePath) });
      }
    }
  }

  return candidateById;
}

function resolveManagedUrl(sample, managedPrefix) {
  const candidates = [
    sample?.managedUrl,
    sample?.sourceUrl,
    sample?.url,
  ].map(toText).filter(Boolean);

  return candidates.find((value) => value.startsWith(managedPrefix)) || null;
}

function persistSummary(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function pushSample(target, entry) {
  if (target.length >= 50) return;
  target.push(entry);
}

function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex >= 0) {
      result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
    } else {
      result[body] = 'true';
    }
  }
  return result;
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
