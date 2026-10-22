import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const AUDIO_HISTORICAL_SOURCE_PATH = 'reports/authorization/canonical/l1-runs/audio/audio_l1_20260829_serial03/source.json';
export const AUDIO_HISTORICAL_SOURCE_SHA256 = 'sha256:2b2a8765ac9c3bb21f2600a35c6ea003cfe13a582c524bfa39f1988518ad4b62';
export const AUDIO_HISTORICAL_BGM_NAMES_PATH = '/home/lolben/data/terraPedia/generated/wiki-audio-assets.runs/wiki-audio-assets-bgm-zh-2026-06-02.json';
export const AUDIO_HISTORICAL_BGM_NAMES_SHA256 = 'sha256:0c08f8e3a65c575a82159f5b23559b18a9b8e4c6ba4b5826c3f37c20af475eb0';
export const AUDIO_HISTORICAL_SCOPE_COUNTS = Object.freeze({ items: 198, bgm: 104, npc_hit: 58, npc_death: 68 });
export const AUDIO_SAMPLE_SCOPE_LIMIT = 50;
const HASH = /^sha256:[a-f0-9]{64}$/;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return hashBytes(Buffer.from(JSON.stringify(canonicalValue(value)), 'utf8'));
}

function normalizeSourceKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function countScopes(assets) {
  const counts = {};
  for (const asset of assets) counts[asset.scope] = (counts[asset.scope] ?? 0) + 1;
  return counts;
}

function validateHistoricalInputs({ source, bgmNames, sourceSha256, bgmNamesSha256 } = {}) {
  const audioSource = requireObject(source, 'historical Audio source');
  const namesSource = requireObject(bgmNames, 'historical BGM display-name source');
  if (sourceSha256 !== AUDIO_HISTORICAL_SOURCE_SHA256 || !HASH.test(sourceSha256 ?? '')
      || bgmNamesSha256 !== AUDIO_HISTORICAL_BGM_NAMES_SHA256 || !HASH.test(bgmNamesSha256 ?? '')) {
    throw new Error('Audio offline source files do not match the fixed historical byte hashes');
  }
  if (audioSource.generatedAt !== '2026-08-15T05:18:21.176Z'
      || audioSource.source?.mode !== 'wiki-allimages-manifest-download'
      || !Array.isArray(audioSource.assets) || audioSource.assets.length !== 428
      || Number(audioSource.summary?.total) !== 428) {
    throw new Error('historical Audio source identity or complete 428-row inventory is invalid');
  }
  const counts = countScopes(audioSource.assets);
  if (JSON.stringify(canonicalValue(counts)) !== JSON.stringify(canonicalValue(AUDIO_HISTORICAL_SCOPE_COUNTS))) {
    throw new Error('historical Audio source scope counts differ from the fixed catalog inventory');
  }
  if (namesSource.generatedAt !== '2026-06-02T15:54:09.674Z'
      || !Array.isArray(namesSource.assets) || namesSource.assets.length !== 104) {
    throw new Error('historical BGM name snapshot identity or 104-row inventory is invalid');
  }
  const bgmKeys = new Set();
  for (const row of namesSource.assets) {
    const key = normalizeSourceKey(row?.sourceKey);
    if (!key || bgmKeys.has(key)) throw new Error('historical BGM display-name source has a missing or duplicate sourceKey');
    bgmKeys.add(key);
  }
  return { audioSource, namesSource, scopeCounts: counts };
}

export function buildAudioLocalOfflineSource({
  source,
  bgmNames,
  sourceSha256,
  bgmNamesSha256,
  authorization,
  outageEvidence,
  sourcePath = AUDIO_HISTORICAL_SOURCE_PATH,
  bgmNamesPath = AUDIO_HISTORICAL_BGM_NAMES_PATH,
} = {}) {
  if (authorization !== 'user-directed-local-offline') {
    throw new Error('Audio offline source requires explicit user-directed local-offline authorization');
  }
  const evidence = requireObject(outageEvidence, 'Audio Wiki outage evidence');
  if (evidence.status !== 'probe_unavailable'
      || evidence.actionId !== 'domain-source-npcs'
      || !String(evidence.artifactPath ?? '').startsWith('.local/tmp/')
      || !HASH.test(evidence.sha256 ?? '')) {
    throw new Error('Audio offline source requires private hash-bound Wiki outage evidence');
  }
  const inputs = validateHistoricalInputs({ source, bgmNames, sourceSha256, bgmNamesSha256 });
  const namesBySourceKey = new Map(inputs.namesSource.assets.map((row) => [normalizeSourceKey(row.sourceKey), row]));
  const firstByScope = (scope) => inputs.audioSource.assets.filter((row) => row.scope === scope).slice(0, AUDIO_SAMPLE_SCOPE_LIMIT);
  const selected = [
    ...firstByScope('bgm'),
    ...firstByScope('npc_hit'),
    ...firstByScope('items'),
  ];
  if (selected.length !== AUDIO_SAMPLE_SCOPE_LIMIT * 3) {
    throw new Error('Audio local-offline selection requires exactly 50 BGM, 50 NPC_Hit, and 50 Item records');
  }
  const ids = selected.map((row) => String(row.assetId ?? '').trim());
  if (ids.some((id) => !id) || new Set(ids).size !== selected.length) {
    throw new Error('Audio local-offline selection contains a missing or duplicate asset ID');
  }
  const missingBgmDisplayNameSourceKeys = [];
  const assets = selected.map((asset) => {
    if (asset.scope !== 'bgm') return Object.freeze({ ...asset });
    const names = namesBySourceKey.get(normalizeSourceKey(asset.sourceKey));
    if (!names) {
      missingBgmDisplayNameSourceKeys.push(String(asset.sourceKey));
      return Object.freeze({ ...asset });
    }
    if (!names.displayNameZh || !names.displayNameEn) missingBgmDisplayNameSourceKeys.push(String(asset.sourceKey));
    return Object.freeze({
      ...asset,
      displayNameZh: names.displayNameZh ?? null,
      displayNameEn: names.displayNameEn ?? null,
    });
  });
  const selection = Object.freeze({
    policy: 'historical-source-order-first-50-per-declared-scope',
    counts: Object.freeze({ bgm: 50, npc_hit: 50, items: 50 }),
    total: assets.length,
    assetIdsSha256: hashJson(assets.map((row) => row.assetId)),
  });
  const body = {
    schemaVersion: 1,
    manifestKind: 'audio_local_offline_source_manifest',
    sourceMode: 'local-offline-authorized',
    wikiUnchanged: false,
    authorization,
    historicalInputs: {
      sourcePath,
      sourceSha256,
      sourceGeneratedAt: inputs.audioSource.generatedAt,
      sourceAssetCount: inputs.audioSource.assets.length,
      sourceScopeCounts: inputs.scopeCounts,
      bgmNamesPath,
      bgmNamesSha256,
      bgmNamesGeneratedAt: inputs.namesSource.generatedAt,
      bgmNamesCount: inputs.namesSource.assets.length,
      sourceSnapshotsHaveMatchingGenerationTime: inputs.audioSource.generatedAt === inputs.namesSource.generatedAt,
    },
    outageEvidence: Object.freeze({
      artifactPath: evidence.artifactPath,
      sha256: evidence.sha256,
      actionId: evidence.actionId,
      status: evidence.status,
    }),
    selection,
    missingBgmDisplayNameSourceKeys: Object.freeze(missingBgmDisplayNameSourceKeys),
    assets: Object.freeze(assets),
  };
  return Object.freeze({ ...body, manifestSha256: hashJson(body) });
}

export function verifyAudioLocalAssetFiles(assets = []) {
  if (!Array.isArray(assets) || assets.length === 0) throw new Error('Audio local asset verification requires a non-empty assets array');
  return assets.map((asset) => {
    const filePath = String(asset?.absoluteLocalPath ?? '').trim();
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Audio local asset is not an ordinary file: ${asset?.assetId ?? ''}`);
    if (stat.size !== Number(asset.size)) throw new Error(`Audio local asset size mismatch: ${asset?.assetId ?? ''}`);
    const sha256 = hashBytes(fs.readFileSync(filePath));
    const expected = String(asset.sha256 ?? '').replace(/^sha256:/, '');
    if (!/^[a-f0-9]{64}$/.test(expected) || sha256 !== `sha256:${expected}`) {
      throw new Error(`Audio local asset SHA-256 mismatch: ${asset?.assetId ?? ''}`);
    }
    return Object.freeze({ assetId: String(asset.assetId), path: filePath, size: stat.size, sha256 });
  });
}
