import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { buildBuffLocalOfflineSource } from './buff-offline-source.mjs';

test('local Buff source binds all 388 identities and attaches NPC IDs from the frozen NPC map', (t) => {
  const fixture = writeSourceFixture(t);
  const result = buildBuffLocalOfflineSource({
    repoRoot: fixture.root,
    executionManifest: fixture.executionManifest,
    runId: 'e8pr-buffs-20261017-v1',
    runKey: 'e8p_e38103255d8d4633',
    authorization: 'user-directed-local-offline',
    generatedAt: '2026-10-22T12:00:00.000Z',
  });

  assert.equal(result.records.length, 388);
  assert.equal(result.sourceManifest.sourceMode, 'local-offline-authorized');
  assert.equal(result.sourceManifest.wikiUnchanged, false);
  assert.equal(result.sourceManifest.sourceFiles.length, 4);
  assert.equal(result.records[0].inflictingNpcs[0].npcId, 77);
  assert.equal(result.records[0].immuneNpcs[0].npcId, 77);
  assert.equal(result.records[0].sourceItems[0].resolveStatus, 'unresolved');
  assert.equal(result.sourceManifest.sourceIdentity.unresolvedNoItemIdFacts, 1);
  const { manifestSha256, ...manifestBody } = result.sourceManifest;
  assert.equal(manifestSha256, hashJson(manifestBody));
});

test('local Buff source rejects mismatched standardized-view identities', (t) => {
  const fixture = writeSourceFixture(t);
  const partPath = path.join(fixture.root, 'data/standardized-view/buffs/part-0001.json');
  const rows = JSON.parse(fs.readFileSync(partPath, 'utf8'));
  rows[0] = { ...rows[0], internalName: 'DifferentBuff' };
  fs.writeFileSync(partPath, `${JSON.stringify(rows)}\n`);
  fixture.executionManifest.sourceHashes['data/standardized-view/buffs/_meta.json'] = sha256File(path.join(fixture.root, 'data/standardized-view/buffs/_meta.json'));

  assert.throws(() => buildBuffLocalOfflineSource({
    repoRoot: fixture.root,
    executionManifest: fixture.executionManifest,
    runId: 'e8pr-buffs-20261017-v1',
    runKey: 'e8p_e38103255d8d4633',
    authorization: 'user-directed-local-offline',
  }), /identit|source hash/i);
});

test('local Buff source rejects an ambiguous NPC internal-name crosswalk', (t) => {
  const fixture = writeSourceFixture(t);
  const mapPath = path.join(fixture.root, 'data/generated/npc-standardized-map.json');
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  map.records['78'] = { gameId: 78, internalName: 'Hornet' };
  map.count += 1;
  fs.writeFileSync(mapPath, `${JSON.stringify(map)}\n`);
  fixture.executionManifest.sourceHashes['data/generated/npc-standardized-map.json'] = sha256File(mapPath);

  assert.throws(() => buildBuffLocalOfflineSource({
    repoRoot: fixture.root,
    executionManifest: fixture.executionManifest,
    runId: 'e8pr-buffs-20261017-v1',
    runKey: 'e8p_e38103255d8d4633',
    authorization: 'user-directed-local-offline',
  }), /ambiguous.*NPC|NPC.*ambiguous/i);
});

test('local Buff source quarantines duplicate NPC facts that collapse to one stable source ID', (t) => {
  const fixture = writeSourceFixture(t);
  const standardizedPath = path.join(fixture.root, 'data/standardized/buffs.standardized.json');
  const standardized = JSON.parse(fs.readFileSync(standardizedPath, 'utf8'));
  standardized.records[0].inflictingNpcs.push({ internalName: 'Hornet', name: 'Alternate Hornet Label' });
  fs.writeFileSync(standardizedPath, `${JSON.stringify(standardized)}\n`);
  const partPath = path.join(fixture.root, 'data/standardized-view/buffs/part-0001.json');
  const part = JSON.parse(fs.readFileSync(partPath, 'utf8'));
  part[0].inflictingNpcs.push({ internalName: 'Hornet', name: 'Alternate Hornet Label' });
  fs.writeFileSync(partPath, `${JSON.stringify(part)}\n`);
  fixture.executionManifest.sourceHashes['data/standardized/buffs.standardized.json'] = sha256File(standardizedPath);

  const result = buildBuffLocalOfflineSource({
    repoRoot: fixture.root,
    executionManifest: fixture.executionManifest,
    runId: 'e8pr-buffs-20261017-v1',
    runKey: 'e8p_e38103255d8d4633',
    authorization: 'user-directed-local-offline',
  });

  assert.deepEqual(result.records[0].inflictingNpcs.map((fact) => fact.resolveStatus), ['unresolved', 'unresolved']);
  assert.equal(result.sourceManifest.sourceIdentity.duplicateNpcFactCount, 2);
});

function writeSourceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-buff-offline-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const records = Array.from({ length: 388 }, (_, index) => ({
    id: index + 1,
    internalName: `Buff${index + 1}`,
    englishName: `Buff ${index + 1}`,
    sourceItems: [{ itemId: index === 0 ? null : 1000 + index, internalName: `Item${index + 1}`, name: `Item ${index + 1}` }],
    inflictingNpcs: [{ internalName: 'Hornet', name: 'Hornet' }],
    immuneNpcs: [{ internalName: 'Hornet', name: 'Hornet' }],
    immuneNpcSample: [],
    sourceEvidence: { provider: 'terraria.wiki.gg', pageTitle: `Buff ${index + 1}`, revisionTimestamp: '2026-03-01T03:21:12Z' },
  }));
  const standardized = {
    entity: 'buffs',
    generatedAt: '2026-05-15T14:23:34.084Z',
    upstreamMeta: { sourcePageTitle: 'Template:GetBuffInfo', sourceRevisionTimestamp: '2026-03-01T03:21:12Z', totalBuffs: 388 },
    records,
  };
  const viewMeta = {
    entity: 'buffs',
    generatedAt: '2026-03-28T11:56:07.300Z',
    totalRecords: 388,
    parts: [{ name: 'part-0001.json', records: 200 }, { name: 'part-0002.json', records: 188 }],
  };
  const standardizedMap = { generatedAt: '2026-03-30T11:05:34.976Z', count: 388, records: Object.fromEntries(records.map(({ id, internalName, englishName }) => [internalName, { id, internalName, englishName }])) };
  const npcMap = { generatedAt: '2026-06-01T00:00:00Z', count: 1, records: { '77': { gameId: 77, internalName: 'Hornet' } } };
  const contents = new Map([
    ['data/standardized/buffs.standardized.json', `${JSON.stringify(standardized)}\n`],
    ['data/standardized-view/buffs/_meta.json', `${JSON.stringify(viewMeta)}\n`],
    ['data/standardized-view/buffs/part-0001.json', `${JSON.stringify(records.slice(0, 200))}\n`],
    ['data/standardized-view/buffs/part-0002.json', `${JSON.stringify(records.slice(200))}\n`],
    ['data/generated/buff-standardized-map.json', `${JSON.stringify(standardizedMap)}\n`],
    ['data/generated/npc-standardized-map.json', `${JSON.stringify(npcMap)}\n`],
  ]);
  for (const [relative, content] of contents) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const sourceHashes = Object.fromEntries([
    'data/standardized/buffs.standardized.json',
    'data/standardized-view/buffs/_meta.json',
    'data/generated/buff-standardized-map.json',
    'data/generated/npc-standardized-map.json',
  ].map((relative) => [relative, sha256File(path.join(root, relative))]));
  return {
    root,
    executionManifest: { sourceHashes },
  };
}

function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
