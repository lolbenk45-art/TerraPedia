import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_BUFF_COUNT = 388;
const AUTHORIZATION = 'user-directed-local-offline';
const HASH = /^sha256:[a-f0-9]{64}$/;
export const BUFF_NPC_INTERNAL_NAME_ALIASES = Object.freeze({ SandPoacher: 'DesertScorpionWalk' });
const SOURCE_PATHS = Object.freeze([
  'data/standardized/buffs.standardized.json',
  'data/standardized-view/buffs/_meta.json',
  'data/generated/buff-standardized-map.json',
  'data/generated/npc-standardized-map.json',
]);

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashJson(value) {
  return hashBytes(Buffer.from(JSON.stringify(value), 'utf8'));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireRecords(value, label, expectedCount) {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new Error(`${label} must contain exactly ${expectedCount} records`);
  }
  return value;
}

function identityKey(record, label) {
  const id = Number(record?.id);
  const internalName = String(record?.internalName ?? '').trim();
  if (!Number.isSafeInteger(id) || id <= 0 || !internalName) throw new Error(`${label} identity is invalid`);
  return `${id}:${internalName}`;
}

function readSourceFile(repoRoot, relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Buff source path escapes execution root: ${relativePath}`);
  }
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Buff source must be an ordinary file: ${relativePath}`);
  const bytes = fs.readFileSync(absolutePath);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch (error) { throw new Error(`Buff source JSON is invalid: ${relativePath}`, { cause: error }); }
  return { path: relativePath, absolutePath, bytes, sha256: hashBytes(bytes), value };
}

function assertPinnedSource(file, executionManifest) {
  const expected = executionManifest?.sourceHashes?.[file.path];
  if (!HASH.test(expected ?? '') || expected !== file.sha256) {
    throw new Error(`Buff local source hash differs from the fixed execution manifest: ${file.path}`);
  }
}

function collectViewParts({ repoRoot, metadata }) {
  if (!Array.isArray(metadata.parts) || metadata.parts.length === 0) throw new Error('Buff standardized-view parts are missing');
  const parts = [];
  const records = [];
  for (const descriptor of metadata.parts) {
    const name = String(descriptor?.name ?? '');
    if (!/^[a-z0-9-]+\.json$/i.test(name) || !Number.isSafeInteger(Number(descriptor?.records)) || Number(descriptor.records) <= 0) {
      throw new Error('Buff standardized-view part descriptor is invalid');
    }
    const part = readSourceFile(repoRoot, `data/standardized-view/buffs/${name}`);
    if (!Array.isArray(part.value) || part.value.length !== Number(descriptor.records)) {
      throw new Error(`Buff standardized-view part count mismatch: ${name}`);
    }
    parts.push({ path: part.path, sha256: part.sha256, recordCount: part.value.length });
    records.push(...part.value);
  }
  return { parts, records };
}

function assertExactIdentitySet(sourceRecords, otherRecords, label) {
  const source = sourceRecords.map((record) => identityKey(record, 'Buff standardized record')).sort();
  const other = otherRecords.map((record) => identityKey(record, label)).sort();
  if (new Set(source).size !== source.length || new Set(other).size !== other.length
      || source.join('\n') !== other.join('\n')) {
    throw new Error(`${label} identities differ from the exact Buff standardized source`);
  }
}

function buildNpcIdIndex(npcMap) {
  requireObject(npcMap?.records, 'NPC standardized map records');
  const entries = Object.entries(npcMap.records);
  if (Number(npcMap.count) !== entries.length) throw new Error('NPC standardized map count is inconsistent');
  const byInternalName = new Map();
  for (const [key, row] of entries) {
    const gameId = Number(row?.gameId);
    const internalName = String(row?.internalName ?? '').trim();
    if (!Number.isSafeInteger(gameId) || String(gameId) !== key || !internalName) {
      throw new Error(`NPC standardized map identity is invalid: ${key}`);
    }
    const matches = byInternalName.get(internalName) ?? [];
    matches.push(gameId);
    byInternalName.set(internalName, matches);
  }
  return byInternalName;
}

function bindFactNpcIds(records, npcIdsByInternalName) {
  let mappedNpcFactCount = 0;
  let unresolvedNpcFactCount = 0;
  const bind = (fact, label) => {
    const internalName = String(fact?.internalName ?? fact?.npcInternalName ?? '').trim();
    const lookupName = BUFF_NPC_INTERNAL_NAME_ALIASES[internalName] ?? internalName;
    const matches = npcIdsByInternalName.get(lookupName) ?? [];
    if (matches.length > 1) throw new Error(`Buff ${label} has an ambiguous NPC internal-name identity: ${internalName}`);
    if (matches.length !== 1) {
      unresolvedNpcFactCount += 1;
      return { ...fact, resolveStatus: 'unresolved' };
    }
    const npcId = matches[0];
    if (fact?.npcId != null && Number(fact.npcId) !== npcId) {
      throw new Error(`Buff ${label} NPC stable identity drifted: ${internalName}`);
    }
    if (npcId === 0) {
      unresolvedNpcFactCount += 1;
      return { ...fact, resolveStatus: 'unresolved' };
    }
    mappedNpcFactCount += 1;
    return { ...fact, npcId };
  };
  const boundRecords = records.map((record) => ({
    ...structuredClone(record),
    inflictingNpcs: record.inflictingNpcs.map((fact, index) => bind(fact, `${record.internalName}.inflictingNpcs[${index}]`)),
    immuneNpcs: record.immuneNpcs.map((fact, index) => bind(fact, `${record.internalName}.immuneNpcs[${index}]`)),
  }));
  return { records: boundRecords, mappedNpcFactCount, unresolvedNpcFactCount };
}

function markUnstableItemFacts(records) {
  let unresolvedNoItemIdFacts = 0;
  const boundRecords = records.map((record) => ({
    ...record,
    sourceItems: record.sourceItems.map((fact) => {
      const itemId = Number(fact?.itemId);
      if (Number.isSafeInteger(itemId) && itemId > 0) return fact;
      unresolvedNoItemIdFacts += 1;
      return { ...fact, itemId: null, resolveStatus: 'unresolved' };
    }),
  }));
  return { records: boundRecords, unresolvedNoItemIdFacts };
}

function markDuplicateNpcFacts(records, unresolvedCount) {
  let duplicateNpcFactCount = 0;
  let unresolvedNpcFactCount = unresolvedCount;
  const boundRecords = records.map((record) => {
    const next = { ...record };
    for (const field of ['inflictingNpcs', 'immuneNpcs']) {
      const facts = Array.isArray(record[field]) ? record[field] : [];
      const positionsByNpcId = new Map();
      facts.forEach((fact, index) => {
        if (fact.resolveStatus === 'unresolved' || !Number.isSafeInteger(Number(fact.npcId)) || Number(fact.npcId) === 0) return;
        const id = Number(fact.npcId);
        const positions = positionsByNpcId.get(id) ?? [];
        positions.push(index);
        positionsByNpcId.set(id, positions);
      });
      const duplicates = new Set([...positionsByNpcId.values()].filter((positions) => positions.length > 1).flat());
      if (duplicates.size > 0) {
        duplicateNpcFactCount += duplicates.size;
        unresolvedNpcFactCount += duplicates.size;
        next[field] = facts.map((fact, index) => duplicates.has(index)
          ? { ...fact, resolveStatus: 'unresolved', resolutionReason: 'duplicate-stable-npc-identity' }
          : fact);
      }
    }
    return next;
  });
  return { records: boundRecords, duplicateNpcFactCount, unresolvedNpcFactCount };
}

export function buildBuffLocalOfflineSource({
  repoRoot,
  executionManifest,
  runId,
  runKey,
  authorization,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(String(repoRoot ?? ''));
  if (!root || root === path.parse(root).root) throw new Error('Buff source execution root is invalid');
  if (authorization !== AUTHORIZATION) throw new Error('Buff local source requires the explicit user-directed local-offline authorization');
  if (!/^[a-z0-9][a-z0-9_-]{2,100}$/.test(runId ?? '') || !/^e8p_[0-9a-f]{16}$/.test(runKey ?? '')) {
    throw new Error('Buff local source run identity is invalid');
  }
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('Buff local source generatedAt is invalid');

  const files = Object.fromEntries(SOURCE_PATHS.map((relativePath) => {
    const file = readSourceFile(root, relativePath);
    assertPinnedSource(file, executionManifest);
    return [relativePath, file];
  }));
  const standardized = requireObject(files['data/standardized/buffs.standardized.json'].value, 'standardized Buff source');
  const records = requireRecords(standardized.records, 'standardized Buff source', REQUIRED_BUFF_COUNT);
  const viewMeta = requireObject(files['data/standardized-view/buffs/_meta.json'].value, 'Buff standardized-view metadata');
  if (viewMeta.entity !== 'buffs' || Number(viewMeta.totalRecords) !== REQUIRED_BUFF_COUNT) {
    throw new Error('Buff standardized-view metadata does not bind the 388-record source');
  }
  const view = collectViewParts({ repoRoot: root, metadata: viewMeta });
  if (view.records.length !== REQUIRED_BUFF_COUNT) throw new Error('Buff standardized-view total count differs from 388');
  assertExactIdentitySet(records, view.records, 'Buff standardized-view');

  const generatedMap = requireObject(files['data/generated/buff-standardized-map.json'].value, 'generated Buff map');
  requireObject(generatedMap.records, 'generated Buff map records');
  const generatedMapRecords = Object.values(generatedMap.records);
  if (Number(generatedMap.count) !== REQUIRED_BUFF_COUNT || generatedMapRecords.length !== REQUIRED_BUFF_COUNT) {
    throw new Error('generated Buff map does not bind the 388-record source');
  }
  assertExactIdentitySet(records, generatedMapRecords, 'generated Buff map');
  for (const [key, row] of Object.entries(generatedMap.records)) {
    if (key !== row.internalName) throw new Error(`generated Buff map key differs from its internal name: ${key}`);
  }

  for (const record of records) {
    identityKey(record, 'Buff standardized record');
    for (const field of ['sourceItems', 'inflictingNpcs', 'immuneNpcs']) {
      if (!Array.isArray(record[field])) throw new Error(`Buff ${record.internalName} ${field} facts are missing`);
    }
  }
  const npcIdsByInternalName = buildNpcIdIndex(files['data/generated/npc-standardized-map.json'].value);
  const npcBound = bindFactNpcIds(records, npcIdsByInternalName);
  const uniqueNpcFacts = markDuplicateNpcFacts(npcBound.records, npcBound.unresolvedNpcFactCount);
  const itemBound = markUnstableItemFacts(uniqueNpcFacts.records);
  const sourceFiles = SOURCE_PATHS.map((relativePath) => ({
    path: relativePath,
    sha256: files[relativePath].sha256,
    recordCount: relativePath === 'data/generated/npc-standardized-map.json'
      ? Number(files[relativePath].value.count)
      : REQUIRED_BUFF_COUNT,
  }));
  const sourceManifestBody = {
    schemaVersion: 1,
    manifestKind: 'buff_local_offline_source',
    status: 'ready',
    sourceMode: 'local-offline-authorized',
    authorization,
    wikiUnchanged: false,
    runId,
    runKey,
    generatedAt,
    sourcePage: standardized.upstreamMeta?.sourcePageTitle ?? 'Template:GetBuffInfo',
    sourceRevisionTimestamp: standardized.upstreamMeta?.sourceRevisionTimestamp ?? null,
    sourceFetchedAt: standardized.upstreamMeta?.fetchedAt ?? null,
    recordCount: REQUIRED_BUFF_COUNT,
    sourceIdentity: {
      standardizedCount: records.length,
      standardizedViewCount: view.records.length,
      generatedMapCount: generatedMapRecords.length,
      npcIdentityCount: Object.keys(files['data/generated/npc-standardized-map.json'].value.records).length,
      mappedNpcFactCount: npcBound.mappedNpcFactCount,
      unresolvedNpcFactCount: uniqueNpcFacts.unresolvedNpcFactCount,
      duplicateNpcFactCount: uniqueNpcFacts.duplicateNpcFactCount,
      unresolvedNoItemIdFacts: itemBound.unresolvedNoItemIdFacts,
    },
    sourceFiles,
    standardizedViewParts: view.parts,
  };
  return Object.freeze({
    sourceMode: 'local-offline-authorized',
    wikiUnchanged: false,
    records: itemBound.records,
    npcIdentityByGameId: new Map(Object.values(files['data/generated/npc-standardized-map.json'].value.records)
      .map((row) => [Number(row.gameId), { gameId: Number(row.gameId), internalName: row.internalName }])),
    sourceManifest: Object.freeze({ ...sourceManifestBody, manifestSha256: hashJson(sourceManifestBody) }),
  });
}
