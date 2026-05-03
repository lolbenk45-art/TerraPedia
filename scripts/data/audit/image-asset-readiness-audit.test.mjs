import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImageAssetReadinessAudit,
  buildImageAssetReadinessQueries,
  parseArgs,
} from './image-asset-readiness-audit.mjs';

const GENERATED_AT = '2026-05-03T00:00:00.000Z';

test('buildImageAssetReadinessAudit summarizes item, buff, and npc image readiness', () => {
  const audit = buildImageAssetReadinessAudit({
    generatedAt: GENERATED_AT,
    staleAfterDays: 30,
    sampleLimit: 2,
    managedUrlPrefixes: [
      'http://localhost:9000/terrapedia-images',
      'https://cdn.example.com/terrapedia-images/',
    ],
    items: [
      {
        id: 1,
        internalName: 'CachedSword',
        cachedUrl: 'http://LOCALHOST:9000/terrapedia-images/items/cached-sword.png?download=1#asset',
        originalUrl: 'https://terraria.wiki.gg/images/Cached_Sword.png',
        contentType: 'image/png; charset=binary',
        lastVerifiedAt: '2026-04-20T00:00:00.000Z',
      },
      {
        id: 2,
        internalName: 'FallbackBow',
        cachedUrl: '',
        originalUrl: 'https://terraria.wiki.gg/images/Fallback_Bow.png',
        contentType: 'image/png',
        lastVerifiedAt: '2026-04-20T00:00:00.000Z',
      },
      {
        id: 3,
        internalName: 'MissingStaff',
      },
      {
        id: 4,
        internalName: 'BrokenCache',
        cachedUrl: 'not-a-url',
        originalUrl: 'https://terraria.wiki.gg/images/Broken_Cache.png',
        contentType: 'application/octet-stream',
        lastVerifiedAt: '2025-12-31T00:00:00.000Z',
      },
    ],
    buffs: [
      {
        id: 10,
        internalName: 'CachedBuff',
        imageCachedUrl: 'https://cdn.example.com/terrapedia-images/buffs/cached-buff.svg',
        imageOriginalUrl: 'https://terraria.wiki.gg/images/Cached_Buff.svg',
        imageContentType: 'image/svg+xml',
        imageLastVerifiedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 11,
        internalName: 'LegacyBuff',
        image: 'https://terraria.wiki.gg/images/Legacy_Buff.png',
      },
    ],
    npcs: [
      {
        id: 20,
        internalName: 'Guide',
        imageUrl: 'https://terraria.wiki.gg/images/Guide.png',
      },
      {
        id: 21,
        internalName: 'NoImageNpc',
      },
    ],
  });

  assert.equal(audit.generatedAt, GENERATED_AT);
  assert.equal(audit.status, 'warning');
  assert.equal(audit.reportPath, null);

  assert.deepEqual(
    pickCoreCounts(audit.entities.items),
    {
      totalRows: 4,
      totalWithImage: 3,
      cachedHitCount: 1,
      wikiFallbackOnlyCount: 2,
      missingImageCount: 1,
      brokenCachedUrlCount: 1,
      missingContentTypeCount: 1,
      staleLastVerifiedCount: 1,
    },
  );
  assert.deepEqual(audit.entities.items.brokenCachedUrlSamples, [
    {
      entityType: 'items',
      id: 4,
      internalName: 'BrokenCache',
      name: null,
      cachedUrl: 'not-a-url',
      reason: 'invalid_url',
    },
  ]);

  assert.deepEqual(
    pickCoreCounts(audit.entities.buffs),
    {
      totalRows: 2,
      totalWithImage: 2,
      cachedHitCount: 1,
      wikiFallbackOnlyCount: 1,
      missingImageCount: 0,
      brokenCachedUrlCount: 0,
      missingContentTypeCount: 0,
      staleLastVerifiedCount: 0,
    },
  );

  assert.deepEqual(
    pickCoreCounts(audit.entities.npcs),
    {
      totalRows: 2,
      totalWithImage: 1,
      cachedHitCount: 0,
      wikiFallbackOnlyCount: 1,
      missingImageCount: 1,
      brokenCachedUrlCount: 0,
      missingContentTypeCount: 0,
      staleLastVerifiedCount: 0,
    },
  );
  assert.equal(audit.entities.npcs.status, 'warning');
  assert.ok(audit.warningReasons.includes('npcs image assets still need a unified source/cache/fallback contract'));
});

test('buildImageAssetReadinessAudit blocks managed cache rows that lost source evidence', () => {
  const audit = buildImageAssetReadinessAudit({
    generatedAt: GENERATED_AT,
    staleAfterDays: 30,
    items: [
      {
        id: 1,
        internalName: 'ManagedWithoutSource',
        cachedUrl: 'http://localhost:9000/terrapedia-images/items/no-source.png',
        contentType: 'image/png',
        lastVerifiedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
    buffs: [],
    npcs: [],
  });

  assert.equal(audit.status, 'blocked');
  assert.equal(audit.entities.items.status, 'blocked');
  assert.equal(audit.entities.items.missingOriginalForCachedCount, 1);
  assert.deepEqual(audit.blockingReasons, [
    'items has 1 managed/cache image without source/original fallback',
  ]);
});

test('buildImageAssetReadinessAudit limits broken cached URL samples while keeping full count', () => {
  const audit = buildImageAssetReadinessAudit({
    generatedAt: GENERATED_AT,
    sampleLimit: 1,
    items: [
      {
        id: 1,
        internalName: 'WikiInCache',
        cachedUrl: 'https://terraria.wiki.gg/images/Wiki_In_Cache.png',
        originalUrl: 'https://terraria.wiki.gg/images/Wiki_In_Cache.png',
        contentType: 'image/png',
        lastVerifiedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 2,
        internalName: 'RelativeCache',
        cachedUrl: '/images/local.png',
        originalUrl: 'https://terraria.wiki.gg/images/Relative_Cache.png',
        contentType: 'image/png',
        lastVerifiedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
  });

  assert.equal(audit.entities.items.brokenCachedUrlCount, 2);
  assert.deepEqual(audit.entities.items.brokenCachedUrlSamples, [
    {
      entityType: 'items',
      id: 1,
      internalName: 'WikiInCache',
      name: null,
      cachedUrl: 'https://terraria.wiki.gg/images/Wiki_In_Cache.png',
      reason: 'source_url_in_cached_field',
    },
  ]);
});

test('buildImageAssetReadinessAudit treats managed asset path as cache across hosts', () => {
  const audit = buildImageAssetReadinessAudit({
    generatedAt: GENERATED_AT,
    items: [
      {
        id: 1,
        internalName: 'CdnCachedItem',
        cachedUrl: 'https://assets.example.com/terrapedia-images/items/cdn-cached-item.png',
        originalUrl: 'https://terraria.wiki.gg/images/Cdn_Cached_Item.png',
        contentType: 'image/png',
        lastVerifiedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 2,
        internalName: 'DockerCachedItem',
        cachedUrl: 'http://127.0.0.1:9000/terrapedia-images/items/docker-cached-item.png',
        originalUrl: 'https://terraria.wiki.gg/images/Docker_Cached_Item.png',
        contentType: 'image/png',
        lastVerifiedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
  });

  assert.equal(audit.entities.items.cachedHitCount, 2);
  assert.equal(audit.entities.items.brokenCachedUrlCount, 0);
});

test('buildImageAssetReadinessAudit rejects managed path prefix collisions', () => {
  const audit = buildImageAssetReadinessAudit({
    generatedAt: GENERATED_AT,
    items: [
      {
        id: 1,
        internalName: 'BadManagedPath',
        cachedUrl: 'http://localhost:9000/terrapedia-images-bad/items/bad-path.png',
        originalUrl: 'https://terraria.wiki.gg/images/Bad_Managed_Path.png',
        contentType: 'image/png',
        lastVerifiedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
  });

  assert.equal(audit.entities.items.cachedHitCount, 0);
  assert.equal(audit.entities.items.brokenCachedUrlCount, 1);
  assert.equal(audit.entities.items.brokenCachedUrlSamples[0].reason, 'outside_managed_prefix');
});

test('buildImageAssetReadinessAudit does not count local NPC image_url as unified cache hit', () => {
  const audit = buildImageAssetReadinessAudit({
    generatedAt: GENERATED_AT,
    npcs: [
      {
        id: 1,
        internalName: 'ManagedNpcFallback',
        imageUrl: 'https://assets.example.com/terrapedia-images/npcs/managed-npc-fallback.png',
      },
    ],
  });

  assert.equal(audit.status, 'warning');
  assert.equal(audit.entities.npcs.totalWithImage, 1);
  assert.equal(audit.entities.npcs.cachedHitCount, 0);
  assert.equal(audit.entities.npcs.missingOriginalForCachedCount, 0);
  assert.ok(audit.warningReasons.includes('npcs image assets still need a unified source/cache/fallback contract'));
});

test('buildImageAssetReadinessQueries are SELECT-only and cover the current image fields', () => {
  const queries = buildImageAssetReadinessQueries({ localDatabase: 'terria_v1_local' });

  assert.match(queries.items, /^\s*SELECT/i);
  assert.match(queries.items, /ii\.`cached_url` AS cachedUrl/);
  assert.match(queries.items, /ii\.`original_url` AS originalUrl/);
  assert.match(queries.items, /i\.`image` AS legacyImage/);
  assert.match(queries.items, /CASE WHEN LOCATE\('\/terrapedia-images\/', ii\.`cached_url`\) > 0\s+AND \(/);
  assert.match(queries.items, /NOT REGEXP '\(\^\|\[\/_\[:space:\]-\]\)demo/);
  assert.match(queries.items, /NOT REGEXP '\(\^\|\[\/_\[:space:\]-\]\)placed/);
  assert.match(queries.buffs, /^\s*SELECT/i);
  assert.match(queries.buffs, /b\.`image_cached_url` AS imageCachedUrl/);
  assert.match(queries.buffs, /b\.`image_original_url` AS imageOriginalUrl/);
  assert.match(queries.npcs, /^\s*SELECT/i);
  assert.match(queries.npcs, /n\.`image_url` AS imageUrl/);

  for (const sql of Object.values(queries)) {
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
  }
});

test('buildImageAssetReadinessQueries rejects unsafe database identifiers', () => {
  assert.throws(
    () => buildImageAssetReadinessQueries({ localDatabase: 'terria_v1_local;DROP TABLE items' }),
    /Invalid identifier/,
  );
});

test('parseArgs keeps DB reads and report writes explicit', () => {
  assert.deepEqual(
    parseArgs([
      '--items=fixtures/items.json',
      '--buffs=fixtures/buffs.json',
      '--npcs=fixtures/npcs.json',
      '--managed-url-prefixes=http://a.test/images,https://b.test/images/',
      '--sample-limit=3',
      '--stale-after-days=45',
      '--source=db',
      '--output=reports/image-readiness.json',
    ]),
    {
      items: 'fixtures/items.json',
      buffs: 'fixtures/buffs.json',
      npcs: 'fixtures/npcs.json',
      managedUrlPrefixes: ['http://a.test/images', 'https://b.test/images/'],
      sampleLimit: 3,
      staleAfterDays: 45,
      source: 'db',
      output: 'reports/image-readiness.json',
      localDatabase: 'terria_v1_local',
      generatedAt: null,
    },
  );
  assert.equal(parseArgs(['--stale-after-days=0']).staleAfterDays, 0);

  assert.deepEqual(parseArgs([]), {
    items: null,
    buffs: null,
    npcs: null,
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images'],
    sampleLimit: 20,
    staleAfterDays: 90,
    source: 'files',
    output: null,
    localDatabase: 'terria_v1_local',
    generatedAt: null,
  });
});

function pickCoreCounts(stats) {
  return {
    totalRows: stats.totalRows,
    totalWithImage: stats.totalWithImage,
    cachedHitCount: stats.cachedHitCount,
    wikiFallbackOnlyCount: stats.wikiFallbackOnlyCount,
    missingImageCount: stats.missingImageCount,
    brokenCachedUrlCount: stats.brokenCachedUrlCount,
    missingContentTypeCount: stats.missingContentTypeCount,
    staleLastVerifiedCount: stats.staleLastVerifiedCount,
  };
}
