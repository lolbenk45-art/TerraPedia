#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveAdminAuth } from '../../lib/local-runtime-config.mjs';
import {
  createMinioImageUploader,
  DEFAULT_MANAGED_URL_PREFIX,
  isManagedUrl,
} from '../lib/minio-image-upload.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const strictMode = args.strict === 'true';
const apiBase = args.apiBase ?? 'http://127.0.0.1:8888/api';
const { username: adminUsername, password: adminPassword } = resolveAdminAuth(args, {
  usernameKey: 'adminUsername',
  passwordKey: 'adminPassword',
  requiredPassword: apply,
});
const managedUrlPrefixes = [args.managedUrlPrefix ?? DEFAULT_MANAGED_URL_PREFIX];
const output = path.resolve(args.output ?? path.join(process.cwd(), 'reports', `boss-images-localize-${new Date().toISOString().slice(0, 10)}.json`));
const generatedNpcMapPath = path.resolve(args['generated-npc-map'] ?? path.join(process.cwd(), 'data', 'generated', 'npc-standardized-map.json'));

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const generatedNpcMap = loadGeneratedNpcMap(generatedNpcMapPath);
const uploader = apply
  ? await createMinioImageUploader({
      apiBase,
      adminUsername,
      adminPassword,
      managedUrlPrefixes,
      userAgent: 'TerraPedia-boss-image-localize/1.0',
    })
  : null;
const connection = await mysql.createConnection(db);

try {
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    strictMode,
    apiBase,
    db,
    generatedNpcMapPath,
    bossGroups: {
      total: 0,
      candidates: 0,
      alreadyManaged: 0,
      localized: 0,
      pending: 0,
      failed: 0,
      missingSource: 0,
      remainingWiki: 0,
    },
    bossMembers: {
      total: 0,
      candidates: 0,
      alreadyManaged: 0,
      localized: 0,
      patchedMapRows: 0,
      pending: 0,
      failed: 0,
      missingSource: 0,
      missingMapRecord: 0,
      remainingWiki: 0,
    },
    generatedNpcMapWritten: false,
    samples: [],
  };

  const [bossGroupRows] = await connection.query(`
    SELECT id, code, name_en, image_url
    FROM boss_groups
    WHERE deleted = 0
    ORDER BY id ASC
  `);
  const [bossMemberRows] = await connection.query(`
    SELECT id, game_id, internal_name, boss_group_id, boss_role
    FROM npcs
    WHERE boss_group_id IS NOT NULL
    ORDER BY boss_group_id ASC, id ASC
  `);

  summary.bossGroups.total = bossGroupRows.length;
  summary.bossMembers.total = bossMemberRows.length;

  let generatedNpcMapDirty = false;

  if (apply) {
    await connection.beginTransaction();
  }

  try {
    for (const bossGroup of bossGroupRows) {
      const currentUrl = toText(bossGroup.image_url);
      if (!currentUrl) {
        summary.bossGroups.missingSource += 1;
        continue;
      }

      summary.bossGroups.candidates += 1;
      let nextUrl = currentUrl;
      if (isManagedUrl(currentUrl, managedUrlPrefixes)) {
        summary.bossGroups.alreadyManaged += 1;
      } else if (!uploader) {
        summary.bossGroups.pending += 1;
        summary.bossGroups.remainingWiki += 1;
      } else {
        const uploadedUrl = await uploader.uploadImageUrl(currentUrl, {
          nameHint: bossGroup.code || bossGroup.name_en || `boss-${bossGroup.id}`,
        });
        if (!uploadedUrl) {
          summary.bossGroups.failed += 1;
          summary.bossGroups.remainingWiki += 1;
        } else {
          nextUrl = uploadedUrl;
          summary.bossGroups.localized += 1;
          await connection.execute(
            'UPDATE boss_groups SET image_url = ?, updated_at = NOW() WHERE id = ?',
            [nextUrl, bossGroup.id]
          );
        }
      }

      pushSample(summary.samples, {
        scope: 'bossGroup',
        id: bossGroup.id,
        code: bossGroup.code,
        sourceUrl: currentUrl,
        imageUrl: nextUrl,
      });
    }

    for (const member of bossMemberRows) {
      const generatedRecord = generatedNpcMap?.records?.[String(member.game_id)] ?? null;
      if (!generatedRecord) {
        summary.bossMembers.missingMapRecord += 1;
        continue;
      }

      const rawJson = parseJsonObject(generatedRecord.rawJson);
      const sourceUrl = toText(generatedRecord.imageUrl)
        ?? toText(rawJson?.imageUrl)
        ?? toText(rawJson?.image_url);

      if (!sourceUrl) {
        summary.bossMembers.missingSource += 1;
        continue;
      }

      summary.bossMembers.candidates += 1;
      let nextUrl = sourceUrl;
      if (isManagedUrl(sourceUrl, managedUrlPrefixes)) {
        summary.bossMembers.alreadyManaged += 1;
      } else if (!uploader) {
        summary.bossMembers.pending += 1;
        summary.bossMembers.remainingWiki += 1;
      } else {
        const uploadedUrl = await uploader.uploadImageUrl(sourceUrl, {
          nameHint: member.internal_name || `boss-member-${member.id}`,
        });
        if (!uploadedUrl) {
          summary.bossMembers.failed += 1;
          summary.bossMembers.remainingWiki += 1;
        } else {
          nextUrl = uploadedUrl;
          summary.bossMembers.localized += 1;
        }
      }

      if (applyManagedUrlToGeneratedNpcMapRecord(generatedRecord, nextUrl)) {
        generatedNpcMapDirty = true;
        summary.bossMembers.patchedMapRows += 1;
      }

      pushSample(summary.samples, {
        scope: 'bossMember',
        npcId: member.id,
        gameId: member.game_id,
        internalName: member.internal_name,
        sourceUrl,
        imageUrl: nextUrl,
      });
    }

    if (strictMode && (
      summary.bossGroups.remainingWiki > 0 ||
      summary.bossMembers.remainingWiki > 0 ||
      summary.bossGroups.failed > 0 ||
      summary.bossMembers.failed > 0 ||
      summary.bossMembers.missingSource > 0 ||
      summary.bossMembers.missingMapRecord > 0
    )) {
      throw new Error(
        `Strict mode failed: remainingWikiBossGroups=${summary.bossGroups.remainingWiki}, remainingWikiBossMembers=${summary.bossMembers.remainingWiki}, `
        + `failedBossGroups=${summary.bossGroups.failed}, failedBossMembers=${summary.bossMembers.failed}, `
        + `missingBossMemberSource=${summary.bossMembers.missingSource}, missingBossMemberMapRecord=${summary.bossMembers.missingMapRecord}`
      );
    }

    if (apply) {
      await connection.commit();
      if (generatedNpcMapDirty && generatedNpcMap) {
        writeJsonFile(generatedNpcMapPath, generatedNpcMap);
        summary.generatedNpcMapWritten = true;
      }
    }
  } catch (error) {
    if (apply) {
      await connection.rollback();
    }
    throw error;
  }

  writeJsonFile(output, summary);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await connection.end();
}

function loadGeneratedNpcMap(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  if (!payload.records || typeof payload.records !== 'object' || Array.isArray(payload.records)) {
    payload.records = {};
  }
  return payload;
}

function applyManagedUrlToGeneratedNpcMapRecord(record, managedUrl) {
  const nextImageUrl = toText(managedUrl);
  if (!record || !nextImageUrl) {
    return false;
  }

  let changed = false;
  if (toText(record.imageUrl) !== nextImageUrl) {
    record.imageUrl = nextImageUrl;
    changed = true;
  }

  const rawJson = parseJsonObject(record.rawJson);
  if (!rawJson) {
    return changed;
  }

  if (toText(rawJson.imageUrl) !== nextImageUrl) {
    rawJson.imageUrl = nextImageUrl;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(rawJson, 'image_url') && toText(rawJson.image_url) !== nextImageUrl) {
    rawJson.image_url = nextImageUrl;
    changed = true;
  }

  if (changed) {
    record.rawJson = JSON.stringify(rawJson);
  }
  return changed;
}

function parseJsonObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function pushSample(samples, sample) {
  if (samples.length < 80) {
    samples.push(sample);
  }
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
