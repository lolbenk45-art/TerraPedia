#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveAdminAuth } from '../lib/local-runtime-config.mjs';
import {
  createMinioImageUploader,
  DEFAULT_MANAGED_URL_PREFIX,
  isManagedUrl,
} from './lib/minio-image-upload.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-bosses.latest.json'));
const dateTag = new Date().toISOString().slice(0, 10);
const reportPath = path.resolve(args['report-json'] ?? path.join(repoRoot, 'reports', `wiki-bosses-import-${dateTag}.json`));
const dryRun = booleanOption(args['dry-run'], false);
const strictMode = booleanOption(args.strict, false);
const apiBase = args.apiBase ?? 'http://127.0.0.1:8888/api';
const { username: adminUsername, password: adminPassword } = resolveAdminAuth(args, {
  usernameKey: 'adminUsername',
  passwordKey: 'adminPassword',
  repoRoot,
  requiredPassword: !dryRun,
});
const managedUrlPrefixes = [args.managedUrlPrefix ?? DEFAULT_MANAGED_URL_PREFIX];
const generatedNpcMapPath = path.resolve(args['generated-npc-map'] ?? path.join(repoRoot, 'data', 'generated', 'npc-standardized-map.json'));

const EXPLICIT_MEMBER_DEFS = {
  'Eater of Worlds': [
    { internalName: 'EaterofWorldsHead', role: 'primary' },
    { internalName: 'EaterofWorldsBody', role: 'part' },
    { internalName: 'EaterofWorldsTail', role: 'part' },
  ],
  'Skeletron': [
    { internalName: 'SkeletronHead', role: 'primary' },
    { internalName: 'SkeletronHand', role: 'part' },
  ],
  'The Twins': [
    { internalName: 'Retinazer', role: 'primary' },
    { internalName: 'Spazmatism', role: 'part' },
  ],
  'Skeletron Prime': [
    { internalName: 'SkeletronPrime', role: 'primary' },
    { internalName: 'PrimeCannon', role: 'part' },
    { internalName: 'PrimeSaw', role: 'part' },
    { internalName: 'PrimeVice', role: 'part' },
    { internalName: 'PrimeLaser', role: 'part' },
  ],
  'Golem': [
    { internalName: 'Golem', role: 'primary' },
    { internalName: 'GolemHead', role: 'part' },
    { internalName: 'GolemFistLeft', role: 'part' },
    { internalName: 'GolemFistRight', role: 'part' },
    { internalName: 'GolemHeadFree', role: 'part' },
  ],
  'Martian Saucer': [
    { internalName: 'MartianSaucerCore', role: 'primary' },
    { internalName: 'MartianSaucer', role: 'part' },
    { internalName: 'MartianSaucerTurret', role: 'part' },
    { internalName: 'MartianSaucerCannon', role: 'part' },
  ],
  'Moon Lord': [
    { internalName: 'MoonLordCore', role: 'primary' },
    { internalName: 'MoonLordHead', role: 'part' },
    { internalName: 'MoonLordHand', role: 'part' },
  ],
  'Lunatic Cultist': [
    { internalName: 'CultistBoss', role: 'primary' },
  ],
  'Queen Slime': [
    { internalName: 'QueenSlimeBoss', role: 'primary' },
  ],
  'Empress of Light': [
    { internalName: 'HallowBoss', role: 'primary' },
  ],
  'Flying Dutchman': [
    { internalName: 'PirateShip', role: 'primary' },
  ],
  'Solar Pillar': [
    { internalName: 'LunarTowerSolar', role: 'primary' },
  ],
  'Nebula Pillar': [
    { internalName: 'LunarTowerNebula', role: 'primary' },
  ],
  'Vortex Pillar': [
    { internalName: 'LunarTowerVortex', role: 'primary' },
  ],
  'Stardust Pillar': [
    { internalName: 'LunarTowerStardust', role: 'primary' },
  ],
  'Wall of Flesh': [
    { internalName: 'WallofFlesh', role: 'primary' },
  ],
  'The Destroyer': [
    { internalName: 'TheDestroyer', role: 'primary' },
  ],
  'Queen Bee': [
    { internalName: 'QueenBee', role: 'primary' },
  ],
  'Brain of Cthulhu': [
    { internalName: 'BrainofCthulhu', role: 'primary' },
  ],
  'Eye of Cthulhu': [
    { internalName: 'EyeofCthulhu', role: 'primary' },
  ],
  'King Slime': [
    { internalName: 'KingSlime', role: 'primary' },
  ],
};

const NEGATIVE_FALLBACK_INTERNAL_PATTERNS = [
  /blade/i,
  /clone/i,
  /minion/i,
  /freeeye/i,
  /leechblob/i,
  /devote/i,
  /tablet/i,
  /spit/i,
];

main().catch((error) => {
  console.error('[import-wiki-bosses-to-db] failed');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});

async function main() {
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length === 0) {
    throw new Error(`No boss records found in ${inputPath}`);
  }
  const generatedNpcMap = loadGeneratedNpcMap(generatedNpcMapPath);
  let generatedNpcMapDirty = false;
  const uploader = dryRun
    ? null
    : await createMinioImageUploader({
        apiBase,
        adminUsername,
        adminPassword,
        managedUrlPrefixes,
        userAgent: 'TerraPedia-wiki-boss-import/1.0',
      });

  const conn = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
    multipleStatements: true,
  });

  assertPrimaryDb(conn.config.database, args['allow-non-primary-db'] === 'true' || process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB === 'true');

  const summary = {
    generatedAt: new Date().toISOString(),
    inputPath,
    reportPath,
    database: conn.config.database,
    apiBase,
    dryRun,
    strictMode,
    generatedNpcMapPath,
    totalBosses: records.length,
    createdBossGroups: 0,
    updatedBossGroups: 0,
    mappedBosses: 0,
    unmappedBosses: 0,
    totalMemberAssignments: 0,
    bossImageCandidates: 0,
    bossImagesAlreadyManaged: 0,
    localizedBossImages: 0,
    pendingBossImages: 0,
    failedBossImages: 0,
    bossMemberImageCandidates: 0,
    bossMemberImagesAlreadyManaged: 0,
    localizedBossMemberImages: 0,
    pendingBossMemberImages: 0,
    failedBossMemberImages: 0,
    patchedBossMemberMapRows: 0,
    bossMemberMapMissing: 0,
    bossMemberImageMissingSource: 0,
    remainingWikiBossImages: 0,
    remainingWikiBossMemberImages: 0,
    generatedNpcMapWritten: false,
    unresolvedBosses: [],
    samples: [],
  };

  try {
    await conn.query('SET NAMES utf8mb4');
    await ensureSchema(conn);
    const npcLookup = await loadNpcLookup(conn);

    await conn.beginTransaction();

    for (const record of records) {
      const memberMapping = mapBossMembers(record, npcLookup);
      const localizedBossImageUrl = await localizeBossImage(record, uploader, summary);
      if (await reconcileBossMemberImages(memberMapping.members, generatedNpcMap, uploader, summary)) {
        generatedNpcMapDirty = true;
      }

      const imageUrl = resolveBossImageUrl({ ...record, imageUrl: localizedBossImageUrl }, memberMapping.members);
      const bossGroupResult = await upsertBossGroup(conn, record, imageUrl);
      if (bossGroupResult.created) summary.createdBossGroups += 1;
      else summary.updatedBossGroups += 1;

      await clearExistingMembersForGroup(conn, bossGroupResult.id);
      for (const member of memberMapping.members) {
        await conn.execute(
          `UPDATE npcs
             SET is_boss = 1,
                 boss_group_id = ?,
                 boss_role = ?,
                 updated_at = NOW()
           WHERE id = ?`,
          [bossGroupResult.id, member.role, member.id]
        );
      }

      if (memberMapping.members.length > 0) {
        summary.mappedBosses += 1;
        summary.totalMemberAssignments += memberMapping.members.length;
      } else {
        summary.unmappedBosses += 1;
      }

      if (memberMapping.unresolved.length > 0 || memberMapping.members.length === 0) {
        summary.unresolvedBosses.push({
          titleEn: record.titleEn,
          titleZh: record.titleZh ?? null,
          bossType: record.groupType,
          unresolved: memberMapping.unresolved,
          matchedMembers: memberMapping.members.map((member) => ({
            id: member.id,
            gameId: member.gameId,
            internalName: member.internalName,
            name: member.name,
            role: member.role,
            imageUrl: member.imageUrl ?? null,
          })),
        });
      }

      if (summary.samples.length < 12) {
        summary.samples.push({
          titleEn: record.titleEn,
          titleZh: record.titleZh ?? null,
          bossType: record.groupType,
          imageUrl,
          memberCount: memberMapping.members.length,
          memberInternalNames: memberMapping.members.map((member) => member.internalName),
        });
      }
    }

    if (strictMode && (
      summary.unresolvedBosses.length > 0 ||
      summary.remainingWikiBossImages > 0 ||
      summary.remainingWikiBossMemberImages > 0 ||
      summary.bossMemberImageMissingSource > 0 ||
      summary.failedBossImages > 0 ||
      summary.failedBossMemberImages > 0
    )) {
      throw new Error(
        `Strict mode failed: unresolvedBosses=${summary.unresolvedBosses.length}, remainingWikiBossImages=${summary.remainingWikiBossImages}, `
        + `remainingWikiBossMemberImages=${summary.remainingWikiBossMemberImages}, missingBossMemberImageSource=${summary.bossMemberImageMissingSource}, `
        + `failedBossImages=${summary.failedBossImages}, failedBossMemberImages=${summary.failedBossMemberImages}`
      );
    }

    if (dryRun) {
      await conn.rollback();
    } else {
      await conn.commit();
      if (generatedNpcMapDirty && generatedNpcMap) {
        writeJsonFile(generatedNpcMapPath, generatedNpcMap);
        summary.generatedNpcMapWritten = true;
      }
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

async function ensureSchema(conn) {
  const migrationNames = [
    'V16__create_independent_entity_tables.sql',
    'V17__add_npc_item_link_columns.sql',
    'V29__align_npc_table_with_admin_schema.sql',
    'V30__add_npc_zh_columns.sql',
    'V31__add_projectile_zh_column.sql',
    'V32__add_admin_adaptation_world_npc_boss_tables.sql',
    'V33__add_boss_group_metadata_columns.sql',
  ];
  for (const migrationName of migrationNames) {
    const sqlPath = path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', migrationName);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await conn.query(sql);
  }
}

async function loadNpcLookup(conn) {
  const [rows] = await conn.query(
    `SELECT id, game_id, internal_name, name, name_zh, is_boss, raw_json
       FROM npcs
      WHERE COALESCE(deleted, 0) = 0`
  );
  const all = rows.map((row) => ({
    id: Number(row.id),
    gameId: row.game_id == null ? null : Number(row.game_id),
    internalName: toText(row.internal_name) ?? '',
    name: toText(row.name) ?? '',
    nameZh: toText(row.name_zh) ?? '',
    isBoss: toBoolean(row.is_boss),
    rawJson: parseJsonObject(row.raw_json),
  }));
  const byInternal = new Map(all.map((row) => [normalizeKey(row.internalName), row]));
  const byNormalizedName = new Map();
  for (const row of all) {
    for (const key of [normalizeKey(row.name), normalizeKey(row.nameZh)]) {
      if (!key) continue;
      if (!byNormalizedName.has(key)) byNormalizedName.set(key, []);
      byNormalizedName.get(key).push(row);
    }
  }
  return { all, byInternal, byNormalizedName };
}

function mapBossMembers(record, npcLookup) {
  const titleEn = toText(record.titleEn) ?? '';
  const explicitDefs = EXPLICIT_MEMBER_DEFS[titleEn] ?? null;
  if (explicitDefs) {
    const members = [];
    const unresolved = [];
    for (const def of explicitDefs) {
      const match = npcLookup.byInternal.get(normalizeKey(def.internalName));
      if (!match) {
        unresolved.push({ reason: 'explicit_member_not_found', internalName: def.internalName });
        continue;
      }
      members.push(toMember(match, def.role));
    }
    return { members: dedupeMembers(members), unresolved };
  }

  const titleKey = normalizeKey(titleEn);
  let candidates = filterFallbackCandidates(npcLookup.byNormalizedName.get(titleKey) ?? []);

  if (candidates.length === 0) {
    candidates = filterFallbackCandidates(
      npcLookup.all.filter((row) =>
        normalizeKey(row.internalName).includes(titleKey) ||
        normalizeKey(row.name).includes(titleKey)
      )
    );
  }

  candidates = dedupeCandidateRows(candidates).sort((a, b) => scoreCandidate(b, titleKey) - scoreCandidate(a, titleKey) || a.id - b.id);
  const members = candidates.map((candidate, index) => toMember(candidate, index === 0 ? 'primary' : 'part'));
  return {
    members,
    unresolved: members.length === 0 ? [{ reason: 'no_candidate_members_found', titleEn }] : [],
  };
}

function filterFallbackCandidates(candidates) {
  return candidates.filter((candidate) => !NEGATIVE_FALLBACK_INTERNAL_PATTERNS.some((pattern) => pattern.test(candidate.internalName)));
}

function dedupeCandidateRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function scoreCandidate(row, titleKey) {
  let score = 0;
  const nameKey = normalizeKey(row.name);
  const internalKey = normalizeKey(row.internalName);
  if (nameKey === titleKey) score += 100;
  if (internalKey === titleKey) score += 95;
  if (internalKey.includes(titleKey)) score += 70;
  if (nameKey.includes(titleKey)) score += 60;
  if (row.isBoss) score += 10;
  return score;
}

function toMember(row, role) {
  return {
    id: row.id,
    gameId: row.gameId,
    internalName: row.internalName,
    name: row.name,
    nameZh: row.nameZh,
    role,
    imageUrl: extractNpcImageUrl(row.rawJson),
  };
}

function dedupeMembers(members) {
  const seen = new Set();
  const out = [];
  for (const member of members) {
    if (!member || seen.has(member.id)) continue;
    seen.add(member.id);
    out.push(member);
  }
  return out;
}

async function localizeBossImage(record, uploader, summary) {
  const sourceUrl = toText(record?.imageUrl);
  if (!sourceUrl) {
    return null;
  }

  summary.bossImageCandidates += 1;
  if (isManagedUrl(sourceUrl, managedUrlPrefixes)) {
    summary.bossImagesAlreadyManaged += 1;
    return sourceUrl;
  }

  if (!uploader) {
    summary.pendingBossImages += 1;
    summary.remainingWikiBossImages += 1;
    return sourceUrl;
  }

  const managedUrl = await uploader.uploadImageUrl(sourceUrl, {
    nameHint: buildBossCode(record?.titleEn),
  });
  if (!managedUrl) {
    summary.failedBossImages += 1;
    summary.remainingWikiBossImages += 1;
    return sourceUrl;
  }

  summary.localizedBossImages += 1;
  return managedUrl;
}

async function reconcileBossMemberImages(members, generatedNpcMap, uploader, summary) {
  if (!members.length) {
    return false;
  }

  let changed = false;
  const records = generatedNpcMap?.records && typeof generatedNpcMap.records === 'object'
    ? generatedNpcMap.records
    : null;

  for (const member of members) {
    const generatedRecord = records?.[String(member.gameId)] ?? null;
    if (!generatedRecord) {
      summary.bossMemberMapMissing += 1;
      continue;
    }

    const generatedRawJson = parseJsonObject(generatedRecord.rawJson);
    const sourceUrl = toText(generatedRecord.imageUrl)
      ?? extractNpcImageUrl(generatedRawJson)
      ?? toText(member.imageUrl);

    if (!sourceUrl) {
      summary.bossMemberImageMissingSource += 1;
      continue;
    }

    summary.bossMemberImageCandidates += 1;
    let managedUrl = sourceUrl;

    if (isManagedUrl(sourceUrl, managedUrlPrefixes)) {
      summary.bossMemberImagesAlreadyManaged += 1;
    } else if (!uploader) {
      summary.pendingBossMemberImages += 1;
      summary.remainingWikiBossMemberImages += 1;
    } else {
      const uploadedUrl = await uploader.uploadImageUrl(sourceUrl, {
        nameHint: member.internalName || member.name || `boss-member-${member.id}`,
      });
      if (!uploadedUrl) {
        summary.failedBossMemberImages += 1;
        summary.remainingWikiBossMemberImages += 1;
      } else {
        managedUrl = uploadedUrl;
        summary.localizedBossMemberImages += 1;
      }
    }

    member.imageUrl = managedUrl;
    if (applyManagedUrlToGeneratedNpcMapRecord(generatedRecord, managedUrl)) {
      summary.patchedBossMemberMapRows += 1;
      changed = true;
    }
  }

  return changed;
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

function resolveBossImageUrl(record, members) {
  const directImageUrl = toText(record?.imageUrl);
  if (directImageUrl) {
    return directImageUrl;
  }
  return members
    .map((member) => member.imageUrl)
    .find((value) => typeof value === 'string' && value.trim()) ?? null;
}

async function upsertBossGroup(conn, record, imageUrl) {
  const code = buildBossCode(record.titleEn);
  const [existingRows] = await conn.execute('SELECT id, image_url FROM boss_groups WHERE code = ? LIMIT 1', [code]);
  const existing = existingRows[0] ?? null;
  const payload = [
    code,
    toText(record.titleEn),
    toText(record.titleZh),
    toText(record.groupType),
    imageUrl ?? null,
    Number(record.progressionOrder ?? 0),
    truncateText(toText(record.notes), 2000),
    toText(record.sourceUrl),
    normalizeSqlDateTime(record.revisionTimestamp),
  ];

  if (!existing) {
    const [result] = await conn.execute(
      `INSERT INTO boss_groups
        (code, name_en, name_zh, boss_type, image_url, progression_order, notes, source_page, source_revision_timestamp, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      payload
    );
    return { id: Number(result.insertId), created: true };
  }

  await conn.execute(
    `UPDATE boss_groups
        SET name_en = ?,
            name_zh = ?,
            boss_type = ?,
            image_url = ?,
            progression_order = ?,
            notes = ?,
            source_page = ?,
            source_revision_timestamp = ?,
            status = 1,
            deleted = 0,
            updated_at = NOW()
      WHERE id = ?`,
    [
      payload[1],
      payload[2],
      payload[3],
      payload[4] ?? existing.image_url ?? null,
      payload[5],
      payload[6],
      payload[7],
      payload[8],
      existing.id,
    ]
  );
  return { id: Number(existing.id), created: false };
}

async function clearExistingMembersForGroup(conn, bossGroupId) {
  await conn.execute(
    `UPDATE npcs
        SET boss_group_id = NULL,
            boss_role = NULL,
            updated_at = NOW()
      WHERE boss_group_id = ?`,
    [bossGroupId]
  );
}

function buildBossCode(titleEn) {
  return String(titleEn ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractNpcImageUrl(rawJson) {
  if (!rawJson || typeof rawJson !== 'object') return null;
  const direct = toText(rawJson.imageUrl) ?? toText(rawJson.image_url);
  if (direct) return direct;
  return null;
}

function parseJsonObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeSqlDateTime(value) {
  const text = toText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function truncateText(value, maxLength) {
  const text = toText(value);
  if (!text) return null;
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function parseArgs(argv) {
  const parsed = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) parsed[body.slice(0, eq)] = body.slice(eq + 1);
    else parsed[body] = 'true';
  }
  return parsed;
}

function booleanOption(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toBoolean(value) {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  return Number(value) === 1 || String(value).trim().toLowerCase() === 'true';
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

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
