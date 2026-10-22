import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBossLocalOfflineSource,
  buildBossReadOnlyImageCache,
} from './boss-offline-source.mjs';

function bossRecords(count = 33) {
  return Array.from({ length: count }, (_, index) => ({
    status: 'ok',
    progressionOrder: index + 1,
    groupType: 'PRE_HARDMODE',
    titleEn: `Boss ${index + 1}`,
    titleZh: `Boss中文${index + 1}`,
    pageTitleEn: `Boss ${index + 1}`,
    pageId: 1000 + index,
    revisionId: 2000 + index,
    revisionTimestamp: '2026-08-11T22:35:00Z',
    sourceUrl: `https://terraria.wiki.gg/wiki/Boss_${index + 1}`,
    imageUrl: `https://terraria.wiki.gg/images/Boss_${index + 1}.gif`,
  }));
}

function npcMap() {
  return { generatedAt: '2026-05-08T09:13:57.283Z', count: 762, records: Object.fromEntries(
    Array.from({ length: 762 }, (_, id) => [String(id), { gameId: id, internalName: `Npc${id}`, rawJson: '{}' }]),
  ) };
}

function lootBundle() {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-30T00:21:19.770Z',
    source: 'terraria.wiki.gg:boss-loot-assembly',
    totalBosses: 33,
    totalDrops: 347,
    bosses: bossRecords().map((record) => ({
      bossName: record.titleEn,
      drops: [{ itemInternalName: `Item${record.progressionOrder}`, dropSourceKind: 'direct_boss' }],
    })),
  };
}

test('Boss offline source binds all 33 revisioned records, 762 NPC map identities, and the exact loot bundle', () => {
  const source = buildBossLocalOfflineSource({
    bossSource: { entity: 'wiki_bosses', generatedAt: '2026-08-14T14:35:15.403Z', records: bossRecords() },
    npcMap: npcMap(),
    lootBundle: lootBundle(),
    bossSourceSha256: 'sha256:6948ef0e38cee482031ca9c066b54081b6d5469e4b70e8487b7a173016a7b00d',
    npcMapSha256: 'sha256:20ec6fa4459947c8a88522d93550b6510b1ff62160568a86e86a21673876c7be',
    lootBundleSha256: 'sha256:c1e3461d4cf89bdb6515320ffc77e5685b3daf65a0b1b9c71c7cd275ca99fc00',
    authorization: 'user-directed-local-offline',
    outageEvidence: {
      status: 'probe_unavailable',
      actionId: 'domain-source-npcs',
      artifactPath: '.local/tmp/eight-domain-production-readiness/20261017/npcs/source-decision.json',
      sha256: 'sha256:' + 'd'.repeat(64),
    },
  });

  assert.equal(source.sourceMode, 'local-offline-authorized');
  assert.equal(source.wikiUnchanged, false);
  assert.equal(source.bossCount, 33);
  assert.equal(source.npcMapCount, 762);
  assert.equal(source.lootDropCount, 347);
  assert.equal(source.imageMode, 'metadata-only-no-local-boss-image-bytes');
  assert.match(source.manifestSha256, /^sha256:[a-f0-9]{64}$/);
});

test('Boss offline source rejects missing page revisions, mismatched loot owner sets, and truncated maps', () => {
  const base = {
    bossSource: { entity: 'wiki_bosses', generatedAt: '2026-08-14T14:35:15.403Z', records: bossRecords() },
    npcMap: npcMap(),
    lootBundle: lootBundle(),
    bossSourceSha256: 'sha256:6948ef0e38cee482031ca9c066b54081b6d5469e4b70e8487b7a173016a7b00d',
    npcMapSha256: 'sha256:20ec6fa4459947c8a88522d93550b6510b1ff62160568a86e86a21673876c7be',
    lootBundleSha256: 'sha256:c1e3461d4cf89bdb6515320ffc77e5685b3daf65a0b1b9c71c7cd275ca99fc00',
    authorization: 'user-directed-local-offline',
    outageEvidence: {
      status: 'probe_unavailable', actionId: 'domain-source-npcs',
      artifactPath: '.local/tmp/eight-domain-production-readiness/20261017/npcs/source-decision.json',
      sha256: 'sha256:' + 'd'.repeat(64),
    },
  };
  const noRevision = structuredClone(base);
  noRevision.bossSource.records[0].revisionId = null;
  assert.throws(() => buildBossLocalOfflineSource(noRevision), /revision identity/i);

  const ownerDrift = structuredClone(base);
  ownerDrift.lootBundle.bosses.pop();
  assert.throws(() => buildBossLocalOfflineSource(ownerDrift), /Boss.*owner|33/i);

  const mapDrift = structuredClone(base);
  mapDrift.npcMap.count = 761;
  assert.throws(() => buildBossLocalOfflineSource(mapDrift), /762/);
});

test('Boss read-only image cache binds exact Boss codes to existing managed URLs', () => {
  const source = bossRecords();
  const formal = source.map((record) => ({
    code: record.titleEn.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    image_url: `http://localhost:9000/terrapedia-images/bosses/${record.progressionOrder}.gif`,
  }));
  const cache = buildBossReadOnlyImageCache({ bossRecords: source, formalBossGroups: formal });
  assert.equal(cache.count, 33);
  assert.equal(cache.mode, 'read-only-source-cache');
  assert.match(cache.urlsSha256, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => buildBossReadOnlyImageCache({
    bossRecords: source,
    formalBossGroups: formal.map((row, index) => index === 0 ? { ...row, image_url: 'https://example.test/image.gif' } : row),
  }), /managed URL/);
});
