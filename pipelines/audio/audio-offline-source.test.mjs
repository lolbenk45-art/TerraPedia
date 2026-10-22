import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AUDIO_HISTORICAL_BGM_NAMES_SHA256,
  AUDIO_HISTORICAL_SOURCE_SHA256,
  buildAudioLocalOfflineSource,
  verifyAudioLocalAssetFiles,
} from './audio-offline-source.mjs';

const HASH = 'sha256:' + 'a'.repeat(64);

function audioAsset(scope, index) {
  const prefix = scope === 'items' ? 'Item_' : scope === 'npc_hit' ? 'NPC_Hit_' : 'Music-';
  const key = `${prefix}${index}`;
  return {
    assetId: `${scope}:${index}`,
    scope,
    shard: scope,
    prefix: scope === 'items' ? 'Item_' : scope === 'npc_hit' ? 'NPC_Hit' : 'Music',
    kind: scope === 'items' ? 'item_sound' : scope === 'npc_hit' ? 'npc_hit_sound' : 'bgm_track',
    sourceKey: key,
    fileTitle: `File:${key}.wav`,
    wikiFileUrl: `https://terraria.wiki.gg/wiki/File:${encodeURIComponent(key)}.wav`,
    sourceUrl: `https://terraria.wiki.gg/images/${encodeURIComponent(key)}.wav`,
    mime: 'audio/wav',
    size: 100,
    sha256: 'b'.repeat(64),
    localPath: `data/terraPedia/media/audio/${scope}/${index}.wav`,
    absoluteLocalPath: `/audio/${scope}/${index}.wav`,
    owners: [],
  };
}

function fixtureSource() {
  const assets = [
    ...Array.from({ length: 198 }, (_, i) => audioAsset('items', i + 1)),
    ...Array.from({ length: 104 }, (_, i) => audioAsset('bgm', i + 1)),
    ...Array.from({ length: 58 }, (_, i) => audioAsset('npc_hit', i + 1)),
    ...Array.from({ length: 68 }, (_, i) => audioAsset('npc_death', i + 1)),
  ];
  return {
    generatedAt: '2026-08-15T05:18:21.176Z',
    source: { apiUrl: 'https://terraria.wiki.gg/api.php', mode: 'wiki-allimages-manifest-download' },
    summary: { total: 428, candidates: 428 },
    assets,
    unresolved: [],
  };
}

function fixtureBgmNames() {
  return {
    generatedAt: '2026-06-02T15:54:09.674Z',
    assets: Array.from({ length: 104 }, (_, index) => ({
      sourceKey: `Music-${index + 1}`,
      displayNameZh: index === 0 ? '以太' : index === 1 ? 'Boss' : `BGM ${index + 1}`,
      displayNameEn: index === 1 ? null : `Track ${index + 1}`,
    })),
  };
}

test('Audio local-offline source selects exactly the bounded scopes and binds separate historical inputs', () => {
  const source = fixtureSource();
  const bgmNames = fixtureBgmNames();
  const result = buildAudioLocalOfflineSource({
    source,
    bgmNames,
    sourceSha256: AUDIO_HISTORICAL_SOURCE_SHA256,
    bgmNamesSha256: AUDIO_HISTORICAL_BGM_NAMES_SHA256,
    authorization: 'user-directed-local-offline',
    outageEvidence: {
      status: 'probe_unavailable',
      actionId: 'domain-source-npcs',
      artifactPath: '.local/tmp/eight-domain-production-readiness/20261017/npcs/source-decision.json',
      sha256: 'sha256:' + 'd'.repeat(64),
    },
  });

  assert.equal(result.sourceMode, 'local-offline-authorized');
  assert.equal(result.wikiUnchanged, false);
  assert.equal(result.assets.length, 150);
  assert.deepEqual(result.selection.counts, { bgm: 50, npc_hit: 50, items: 50 });
  assert.deepEqual(result.assets.slice(0, 2).map((row) => row.assetId), ['bgm:1', 'bgm:2']);
  assert.equal(result.assets[0].displayNameZh, '以太');
  assert.equal(result.assets[1].displayNameEn, null);
  assert.deepEqual(result.missingBgmDisplayNameSourceKeys, ['Music-2']);
});

test('Audio local-offline source rejects truncated scope inputs and duplicate asset identities', () => {
  const source = fixtureSource();
  source.assets = source.assets.filter((asset) => asset.scope !== 'npc_hit' || asset.assetId !== 'npc_hit:58');
  const args = {
    source,
    bgmNames: fixtureBgmNames(),
    sourceSha256: AUDIO_HISTORICAL_SOURCE_SHA256,
    bgmNamesSha256: AUDIO_HISTORICAL_BGM_NAMES_SHA256,
    authorization: 'user-directed-local-offline',
    outageEvidence: {
      status: 'probe_unavailable', actionId: 'domain-source-npcs',
      artifactPath: '.local/tmp/eight-domain-production-readiness/20261017/npcs/source-decision.json', sha256: HASH,
    },
  };
  assert.throws(() => buildAudioLocalOfflineSource(args), /historical Audio source identity or complete 428-row inventory/);

  const duplicate = fixtureSource();
  duplicate.assets[1].assetId = duplicate.assets[0].assetId;
  assert.throws(() => buildAudioLocalOfflineSource({ ...args, source: duplicate }), /duplicate.*asset/i);
});

test('Audio local asset verification requires exact file size and SHA-256', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-offline-source-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'item.wav');
  const bytes = Buffer.from('audio-fixture');
  fs.writeFileSync(filePath, bytes);
  const asset = {
    assetId: 'items:1',
    absoluteLocalPath: filePath,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  assert.deepEqual(verifyAudioLocalAssetFiles([asset]), [{
    assetId: 'items:1',
    path: filePath,
    size: bytes.length,
    sha256: 'sha256:' + asset.sha256,
  }]);
  assert.throws(() => verifyAudioLocalAssetFiles([{ ...asset, sha256: '0'.repeat(64) }]), /SHA-256/);
});
