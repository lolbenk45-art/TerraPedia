import { createHash } from 'node:crypto';

const HASH = /^sha256:[a-f0-9]{64}$/;
export const BOSS_LOCAL_SOURCE_PATH = 'data/generated/wiki-bosses.latest.json';
export const BOSS_NPC_MAP_PATH = 'data/generated/npc-standardized-map.json';
export const BOSS_LOOT_BUNDLE_PATH = 'data/wiki-crawler/normalized/boss-loot.bundle.json';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalValue(value)), 'utf8').digest('hex')}`;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function bossCode(title) {
  return String(title ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function buildBossLocalOfflineSource({
  bossSource,
  npcMap,
  lootBundle,
  bossSourceSha256,
  npcMapSha256,
  lootBundleSha256,
  authorization,
  outageEvidence,
  sourcePaths = { bosses: BOSS_LOCAL_SOURCE_PATH, npcMap: BOSS_NPC_MAP_PATH, loot: BOSS_LOOT_BUNDLE_PATH },
} = {}) {
  if (authorization !== 'user-directed-local-offline') throw new Error('Boss offline source requires explicit user-directed local-offline authorization');
  const outage = requireObject(outageEvidence, 'Wiki outage evidence');
  if (outage.status !== 'probe_unavailable' || outage.actionId !== 'domain-source-npcs'
      || !String(outage.artifactPath ?? '').startsWith('.local/tmp/') || !HASH.test(outage.sha256 ?? '')) {
    throw new Error('Boss offline source requires private hash-bound Wiki outage evidence');
  }
  const bosses = requireObject(bossSource, 'Boss local source');
  const npc = requireObject(npcMap, 'NPC standardized identity map');
  const loot = requireObject(lootBundle, 'Boss loot bundle');
  if (bossSourceSha256 !== 'sha256:6948ef0e38cee482031ca9c066b54081b6d5469e4b70e8487b7a173016a7b00d'
      || npcMapSha256 !== 'sha256:20ec6fa4459947c8a88522d93550b6510b1ff62160568a86e86a21673876c7be'
      || lootBundleSha256 !== 'sha256:c1e3461d4cf89bdb6515320ffc77e5685b3daf65a0b1b9c71c7cd275ca99fc00') {
    throw new Error('Boss local source hashes do not match the fixed repository inputs');
  }
  const records = bosses.records;
  const mapRecords = npc.records;
  const lootBosses = loot.bosses;
  if (bosses.entity !== 'wiki_bosses' || !Array.isArray(records) || records.length !== 33
      || Number(npc.count) !== 762 || !mapRecords || typeof mapRecords !== 'object'
      || Object.keys(mapRecords).length !== 762 || !Array.isArray(lootBosses) || lootBosses.length !== 33
      || Number(loot.totalBosses) !== 33 || Number(loot.totalDrops) !== 347) {
    throw new Error('Boss source, NPC identity map, and Boss loot bundle must bind 33/762/347 records');
  }
  const codes = new Set();
  const pages = new Set();
  for (const [index, row] of records.entries()) {
    const code = bossCode(row?.titleEn);
    const pageId = Number(row?.pageId);
    const revisionId = Number(row?.revisionId);
    if (row?.status !== 'ok' || !code || codes.has(code)) throw new Error(`Boss source contains an invalid or duplicate Boss code at row ${index}`);
    if (!Number.isSafeInteger(pageId) || pageId < 1 || !Number.isSafeInteger(revisionId) || revisionId < 1
        || !String(row.revisionTimestamp ?? '').trim()) throw new Error(`Boss source row lacks page revision identity at row ${index}`);
    codes.add(code);
    pages.add(pageId);
  }
  if (pages.size !== 33) throw new Error('Boss source page IDs must be unique across all 33 records');
  const bossNames = new Set(records.map((row) => String(row.titleEn).toLowerCase()));
  const lootNames = new Set(lootBosses.map((row) => String(row?.bossName ?? '').toLowerCase()));
  if (lootNames.size !== 33 || [...bossNames].some((name) => !lootNames.has(name))) {
    throw new Error('Boss loot bundle owner names differ from the exact 33 Boss source owners');
  }
  for (const [gameId, row] of Object.entries(mapRecords)) {
    if (String(Number(gameId)) !== gameId || Number(row?.gameId) !== Number(gameId)
        || !String(row?.internalName ?? '').trim() || !String(row?.rawJson ?? '').trim()) {
      throw new Error(`NPC standardized map identity is invalid at game ID ${gameId}`);
    }
  }
  const body = {
    manifestKind: 'boss_local_offline_source_manifest',
    sourceMode: 'local-offline-authorized',
    wikiUnchanged: false,
    authorization,
    sourcePaths: Object.freeze({ ...sourcePaths }),
    sourceHashes: Object.freeze({ bosses: bossSourceSha256, npcMap: npcMapSha256, lootBundle: lootBundleSha256 }),
    generatedAt: bosses.generatedAt,
    bossCount: records.length,
    npcMapCount: Number(npc.count),
    npcMapGeneratedAt: npc.generatedAt,
    lootBundleCount: lootBosses.length,
    lootDropCount: Number(loot.totalDrops),
    bossCodes: Object.freeze([...codes]),
    imageMode: 'metadata-only-no-local-boss-image-bytes',
    imageSourceRecordCount: records.filter((row) => String(row.imageUrl ?? '').trim()).length,
    imageSourceMissingBossTitles: Object.freeze(records.filter((row) => !String(row.imageUrl ?? '').trim()).map((row) => row.titleEn)),
    outageEvidence: Object.freeze({ artifactPath: outage.artifactPath, sha256: outage.sha256, actionId: outage.actionId }),
    bossSourceSha256: hashJson(records),
  };
  return Object.freeze({ ...body, manifestSha256: hashJson(body) });
}

export function buildBossReadOnlyImageCache({ bossRecords, formalBossGroups, managedUrlPrefix = 'http://localhost:9000/terrapedia-images/bosses' } = {}) {
  if (!Array.isArray(bossRecords) || bossRecords.length !== 33
      || !Array.isArray(formalBossGroups) || formalBossGroups.length !== 33) {
    throw new Error('Boss read-only image cache must bind 33 source records and 33 current formal Boss groups');
  }
  const sourceCodes = new Set(bossRecords.map((row) => bossCode(row.titleEn)));
  if (sourceCodes.size !== 33) throw new Error('Boss source code set is duplicated');
  const byCode = new Map();
  for (const row of formalBossGroups) {
    const code = String(row?.code ?? '').trim();
    const url = String(row?.image_url ?? '').trim();
    if (!sourceCodes.has(code) || byCode.has(code) || !url.startsWith(`${managedUrlPrefix}/`)) {
      throw new Error(`Boss read-only image cache has an invalid code or managed URL for ${code || '<missing>'}`);
    }
    byCode.set(code, url);
  }
  if (byCode.size !== sourceCodes.size) throw new Error('Boss read-only image cache does not cover all 33 source codes');
  const entries = [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b));
  return Object.freeze({
    mode: 'read-only-source-cache',
    count: entries.length,
    codesSha256: hashJson(entries.map(([code]) => code)),
    urlsSha256: hashJson(entries),
    cache: Object.freeze(Object.fromEntries(entries)),
  });
}
