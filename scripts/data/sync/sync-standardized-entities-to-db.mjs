#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveAdminAuth, resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';
import { createMinioImageUploader, guessExtensionFromUrl } from '../lib/minio-image-upload.mjs';
import { resolveProjectileZhFromRecord } from '../lib/projectile-name-resolver.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const standardizedNpcPath = path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json');
const standardizedProjectilePath = path.join(process.cwd(), 'data', 'standardized', 'projectiles.standardized.json');
const generatedDir = path.join(process.cwd(), 'data', 'generated');
const generatedNpcMapPath = path.join(generatedDir, 'npc-standardized-map.json');

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export const __test__ = {
  resolveNpcLocalizedFields,
  buildGeneratedNpcRecord,
  loadNpcZhMapFromPayload,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === 'true';
  const apiBase = trimTrailingSlash(resolveBackendApiBase(args));
  const { username: adminUsername, password: adminPassword } = resolveAdminAuth(args, {
    usernameKey: 'adminUsername',
    passwordKey: 'adminPassword',
  });
  const scopes = new Set((args.scopes || 'npcs,projectiles').split(',').map((entry) => entry.trim()).filter(Boolean));

  const db = {
    host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
    user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
    database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
  };

  const connection = await mysql.createConnection(db);
  const { uploadImageUrl } = await createMinioImageUploader({
    apiBase,
    adminUsername,
    adminPassword,
  });

  try {
    const summary = {
      apply,
      scopes: [...scopes],
      npcs: { checked: 0, inserted: 0, updated: 0, failed: 0, samples: [] },
      projectiles: { checked: 0, inserted: 0, updated: 0, failed: 0, samples: [] },
    };

    if (apply) {
      await connection.beginTransaction();
    }

    if (scopes.has('npcs')) {
      await syncNpcs(summary.npcs, { apply, connection, uploadImageUrl });
    }
    if (scopes.has('projectiles')) {
      await syncProjectiles(summary.projectiles, { apply, connection, uploadImageUrl });
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
}

async function syncNpcs(stats, { apply, connection, uploadImageUrl }) {
  if (!fs.existsSync(standardizedNpcPath)) {
    stats.failed += 1;
    pushSample(stats, { reason: 'missing_standardized_file', path: standardizedNpcPath });
    return;
  }

  const raw = JSON.parse(fs.readFileSync(standardizedNpcPath, 'utf8'));
  const records = Array.isArray(raw.records) ? raw.records : [];
  const generatedMap = {};

  for (const record of records) {
    stats.checked += 1;
    try {
      const gameId = toInt(record?.id);
      const internalName = toText(record?.internalName);
      if (gameId == null || !internalName) {
        stats.failed += 1;
        pushSample(stats, { id: record?.id ?? null, internalName, reason: 'missing_identity' });
        continue;
      }

      const imageUrl = toText(record?.imageUrl);
      const minioImageUrl = imageUrl ? await uploadImageUrl(imageUrl, {
        entityDomain: 'npcs',
        fileName: `${slugify(internalName)}.png`,
        nameHint: internalName,
      }) : null;
      const effectiveImageUrl = minioImageUrl ?? imageUrl ?? null;

      const npcPayload = structuredClone(record);
      if (effectiveImageUrl) {
        npcPayload.imageUrl = effectiveImageUrl;
      }

      const [rows] = await connection.query('SELECT id, category_id, name, sub_name FROM npcs WHERE game_id = ? LIMIT 1', [gameId]);
      const existing = rows[0];
      const nextCategoryId = existing?.category_id ?? inferNpcCategoryId(record);
      const localized = resolveNpcLocalizedFields(record, existing, loadNpcZhMap());
      generatedMap[String(gameId)] = buildGeneratedNpcRecord(record, effectiveImageUrl, localized);

      if (apply) {
        if (existing) {
          const [result] = await connection.execute(
            `
            UPDATE npcs
            SET name = ?, name_zh = ?, sub_name = ?, sub_name_zh = ?, internal_name = ?, category_id = COALESCE(?, category_id),
                banner_source_item_id = ?, catch_source_item_id = ?, updated_at = NOW()
            WHERE id = ?
            `,
            [
              localized.nextName,
              localized.nextNameZh,
              localized.nextSubName,
              localized.nextSubNameZh,
              internalName,
              nextCategoryId,
              toInt(record?.banner),
              toInt(record?.extras?.catchItem),
              existing.id,
            ]
          );
          stats.updated += Number(result.affectedRows || 0);
        } else {
          const [result] = await connection.execute(
            `
            INSERT INTO npcs (
              game_id, name, name_zh, sub_name, sub_name_zh, internal_name, category_id, game_period_id, game_model_id,
              status, created_at, updated_at, banner_source_item_id, catch_source_item_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 1, NOW(), NOW(), ?, ?)
            `,
            [
              gameId,
              localized.nextName ?? internalName,
              localized.nextNameZh,
              localized.nextSubName,
              localized.nextSubNameZh,
              internalName,
              nextCategoryId,
              toInt(record?.banner),
              toInt(record?.extras?.catchItem),
            ]
          );
          stats.inserted += Number(result.affectedRows || 0);
        }
      }

      pushSample(stats, {
        gameId,
        internalName,
        imageUrl: effectiveImageUrl,
        reason: minioImageUrl
          ? (existing ? 'updated_minio' : 'inserted_minio')
          : (existing ? 'updated_source_fallback' : 'inserted_source_fallback'),
      });
    } catch (error) {
      stats.failed += 1;
      pushSample(stats, { id: record?.id ?? null, internalName: record?.internalName ?? null, reason: String(error.message || error) });
    }
  }

  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(generatedNpcMapPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: Object.keys(generatedMap).length,
    records: generatedMap,
  }, null, 2), 'utf8');
}

async function syncProjectiles(stats, { apply, connection, uploadImageUrl }) {
  if (!fs.existsSync(standardizedProjectilePath)) {
    stats.failed += 1;
    pushSample(stats, { reason: 'missing_standardized_file', path: standardizedProjectilePath });
    return;
  }

  const raw = JSON.parse(fs.readFileSync(standardizedProjectilePath, 'utf8'));
  const records = Array.isArray(raw.records) ? raw.records : [];
  const projectileZhLookup = buildProjectileZhLookup(records);

  for (const record of records) {
    stats.checked += 1;
    try {
      const sourceId = toInt(record?.id);
      const internalName = toText(record?.internalName);
      if (sourceId == null || !internalName) {
        stats.failed += 1;
        pushSample(stats, { id: record?.id ?? null, internalName, reason: 'missing_identity' });
        continue;
      }

      const projectilePayload = structuredClone(record);
      const imageUrl = toText(projectilePayload?.imageUrl);
      if (imageUrl) {
        const minioImageUrl = await uploadImageUrl(imageUrl, {
          entityDomain: 'projectiles',
          nameHint: internalName,
          fileName: `${slugify(internalName)}${guessExtensionFromUrl(imageUrl)}`,
        });
        if (minioImageUrl) projectilePayload.imageUrl = minioImageUrl;
      }
      const effectiveImageUrl = toText(projectilePayload?.imageUrl ?? projectilePayload?.image_url ?? projectilePayload?.image);

      const [rows] = await connection.query('SELECT id FROM projectiles WHERE source_id = ? LIMIT 1', [sourceId]);
      const existing = rows[0];

      const values = [
        sourceId,
        internalName,
        toText(projectilePayload?.name),
        toText(resolveProjectileZhFromRecord(projectilePayload, projectileZhLookup)),
        effectiveImageUrl,
        toInt(projectilePayload?.aiStyle),
        toInt(projectilePayload?.combat?.damage),
        toDecimal(projectilePayload?.combat?.knockBack),
        toInt(projectilePayload?.combat?.penetrate),
        toInt(projectilePayload?.lifecycle?.timeLeft),
        toInt(projectilePayload?.dimensions?.width),
        toInt(projectilePayload?.dimensions?.height),
        toDecimal(projectilePayload?.dimensions?.scale),
        toBoolean(projectilePayload?.flags?.friendly),
        toBoolean(projectilePayload?.flags?.hostile),
        projectilePayload?.flags?.tileCollide == null ? 1 : toBoolean(projectilePayload?.flags?.tileCollide),
        JSON.stringify(projectilePayload),
      ];

      if (apply) {
        if (existing) {
          const [result] = await connection.execute(
            `
            UPDATE projectiles
            SET internal_name = ?, name = ?, name_zh = ?, image_url = ?, ai_style = ?, damage = ?, knock_back = ?, penetrate = ?, time_left = ?,
                width = ?, height = ?, scale = ?, friendly = ?, hostile = ?, tile_collide = ?, raw_json = ?, status = 1, deleted = 0, updated_at = NOW()
            WHERE source_id = ?
            `,
            [
              values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8],
              values[9], values[10], values[11], values[12], values[13], values[14], values[15], values[16], sourceId,
            ]
          );
          stats.updated += Number(result.affectedRows || 0);
        } else {
          const [result] = await connection.execute(
            `
            INSERT INTO projectiles (
              source_id, internal_name, name, name_zh, ai_style, damage, knock_back, penetrate, time_left, width, height, scale,
              friendly, hostile, tile_collide, image_url, raw_json, status, deleted, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())
            `,
            [
              values[0], values[1], values[2], values[3], values[5], values[6], values[7], values[8],
              values[9], values[10], values[11], values[12], values[13], values[14], values[15], values[4], values[16],
            ]
          );
          stats.inserted += Number(result.affectedRows || 0);
        }
      }

      pushSample(stats, { sourceId, internalName, reason: existing ? 'updated' : 'inserted' });
    } catch (error) {
      stats.failed += 1;
      pushSample(stats, { id: record?.id ?? null, internalName: record?.internalName ?? null, reason: String(error.message || error) });
    }
  }
}

function buildProjectileZhLookup(records) {
  const byInternalName = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const internalName = toText(record?.internalName);
    if (!internalName) continue;
    byInternalName.set(internalName, record);
  }
  return (internalName) => {
    const record = byInternalName.get(internalName);
    return record ? (record?.localized?.zh?.name ?? record?.nameZh) : null;
  };
}

function inferNpcCategoryId(record) {
  return record?.flags?.friendly ? 20 : 21;
}

function resolveNpcLocalizedFields(record, existing, npcZhMap) {
  const nextName = existing?.name ?? toText(record?.name);
  const nextNameZh = resolveNpcZhName(record, npcZhMap);
  const nextSubName = existing?.sub_name ?? toText(record?.localized?.zh?.namesub) ?? toText(record?.localized?.en?.namesub) ?? '';
  const nextSubNameZh = resolveNpcSubNameZh(record, npcZhMap);
  return { nextName, nextNameZh, nextSubName, nextSubNameZh };
}

function resolveNpcSubNameZh(record, npcZhMap) {
  const internalName = toText(record?.internalName);
  if (internalName) {
    const direct = npcZhMap.get(internalName);
    if (direct?.subNameZh) return direct.subNameZh;
    const stripped = stripNpcVariantPrefix(internalName);
    if (stripped) {
      const variantFallback = npcZhMap.get(stripped);
      if (variantFallback?.subNameZh) return variantFallback.subNameZh;
    }
  }
  return toText(record?.localized?.zh?.namesub);
}

function buildGeneratedNpcRecord(record, effectiveImageUrl, localized) {
  const npcPayload = structuredClone(record);
  if (effectiveImageUrl) {
    npcPayload.imageUrl = effectiveImageUrl;
  }
  return {
    gameId: toInt(record?.id),
    internalName: toText(record?.internalName),
    imageUrl: effectiveImageUrl,
    nameZh: localized.nextNameZh,
    subNameZh: localized.nextSubNameZh,
    rawJson: JSON.stringify(npcPayload),
    combat: npcPayload.combat ?? null,
    dimensions: npcPayload.dimensions ?? null,
    economy: npcPayload.economy ?? null,
    buffImmune: toText(npcPayload.buffImmune),
  };
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

function slugify(value) {
  const text = toText(value) || 'asset';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

function toDecimal(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toBoolean(value) {
  if (value == null) return 0;
  return value ? 1 : 0;
}

function pushSample(stats, sample) {
  if (stats.samples.length < 40) stats.samples.push(sample);
}

function loadNpcZhMap() {
  const mapPath = path.join(process.cwd(), 'data', 'generated', 'npc-id-row-images.json');
  if (!fs.existsSync(mapPath)) {
    return new Map();
  }
  return loadNpcZhMapFromPayload(JSON.parse(fs.readFileSync(mapPath, 'utf8')));
}

function loadNpcZhMapFromPayload(payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return new Map(
    records
      .map((record) => [
        toText(record?.internalName),
        {
          nameZh: toText(record?.nameZh),
          subNameZh: toText(record?.subNameZh),
        },
      ])
      .filter(([internalName, zh]) => internalName && (zh?.nameZh || zh?.subNameZh))
  );
}

function stripNpcVariantPrefix(internalName) {
  const text = toText(internalName);
  if (!text) return null;
  return text
    .replace(/^(Big|Little|Large|Small)/, '')
    .replace(/(Fatty|Honey|Leafy|Spikey|Stingy)$/, '');
}

function resolveNpcZhName(record, npcZhMap) {
  const internalName = toText(record?.internalName);
  if (internalName) {
    const direct = npcZhMap.get(internalName);
    if (direct?.nameZh) return direct.nameZh;
    const stripped = stripNpcVariantPrefix(internalName);
    if (stripped) {
      const variantFallback = npcZhMap.get(stripped);
      if (variantFallback?.nameZh) return variantFallback.nameZh;
    }
  }
  return toText(record?.localized?.zh?.name) ?? toText(record?.nameZh);
}
