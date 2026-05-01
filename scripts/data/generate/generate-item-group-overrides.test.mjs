import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildItemGroupOverrides,
  buildItemLookup,
  extractShimmerPylonItemIds,
  selectRecordedMusicBoxMembers,
  selectRequiredMembersByItemIds,
  selectRequiredMembers,
} from './generate-item-group-overrides.mjs';

test('buildItemLookup joins standardized items with zh map records', () => {
  const lookup = buildItemLookup({
    standardizedItems: [
      { id: 4876, internalName: 'TeleportationPylonPurity', name: 'Forest Pylon' },
      { id: 562, internalName: 'MusicBoxOverworldDay', name: 'Music Box (Overworld Day)' },
    ],
    zhMapRecords: {
      TeleportationPylonPurity: { internalName: 'TeleportationPylonPurity', nameZh: '森林晶塔' },
      MusicBoxOverworldDay: { internalName: 'MusicBoxOverworldDay', nameZh: '八音盒（地表世界）' },
    },
  });

  assert.deepEqual(lookup.get('TeleportationPylonPurity'), {
    itemId: 4876,
    internalName: 'TeleportationPylonPurity',
    name: 'Forest Pylon',
    nameZh: '森林晶塔',
  });
});

test('selectRequiredMembers fails instead of fabricating missing pylon members', () => {
  const lookup = buildItemLookup({
    standardizedItems: [
      { id: 4876, internalName: 'TeleportationPylonPurity', name: 'Forest Pylon' },
    ],
    zhMapRecords: {},
  });

  assert.throws(
    () => selectRequiredMembers(lookup, ['TeleportationPylonPurity', 'TeleportationPylonJungle'], 'Any Pylon'),
    /Any Pylon missing required item members: TeleportationPylonJungle/,
  );
});

test('extractShimmerPylonItemIds reads the source-backed Any Pylon id list', () => {
  assert.deepEqual(
    extractShimmerPylonItemIds(`
      8, 430, <!-- Any Torch (=> Aether Torch) -->
      4875, 4876, 4916, 4917, 4918, 4919, 4920, 4921, 4951, 5652, <!-- Any Pylon (=> Aether Pylon) -->
      1102, <!-- Lihzahrd Brick Wall -->
    `),
    [4875, 4876, 4916, 4917, 4918, 4919, 4920, 4921, 4951, 5652],
  );
});

test('selectRequiredMembersByItemIds fails instead of inventing missing id members', () => {
  const lookup = buildItemLookup({
    standardizedItems: [
      { id: 4876, internalName: 'TeleportationPylonPurity', name: 'Forest Pylon' },
    ],
    zhMapRecords: {},
  });

  assert.throws(
    () => selectRequiredMembersByItemIds(lookup, [4876, 4875], 'Any Pylon'),
    /Any Pylon missing required item ids: 4875/,
  );
});

test('selectRecordedMusicBoxMembers excludes the blank Music Box target', () => {
  const lookup = buildItemLookup({
    standardizedItems: [
      { id: 562, internalName: 'MusicBoxOverworldDay', name: 'Music Box (Overworld Day)' },
      { id: 576, internalName: 'MusicBox', name: 'Music Box' },
      { id: 5015, internalName: 'MusicBoxOWDay', name: 'Otherworldly Music Box (Overworld Day)' },
      { id: 1, internalName: 'DirtBlock', name: 'Dirt Block' },
    ],
    zhMapRecords: {
      MusicBoxOverworldDay: { nameZh: '八音盒（地表世界）' },
      MusicBox: { nameZh: '八音盒' },
      MusicBoxOWDay: { nameZh: '异界八音盒（地表世界）' },
    },
  });

  assert.deepEqual(
    selectRecordedMusicBoxMembers(lookup).map((member) => member.internalName),
    [],
  );
});

test('buildItemGroupOverrides creates source-backed pylon group and blocks unproven music box members', () => {
  const payload = buildItemGroupOverrides({
    generatedAt: '2026-05-01T00:00:00.000Z',
    standardizedItemsRoot: {
      upstreamMeta: {
        sourceRevisionTimestamp: '2026-03-09T22:52:58Z',
      },
      records: [
        { id: 4876, internalName: 'TeleportationPylonPurity', name: 'Forest Pylon' },
        { id: 4875, internalName: 'TeleportationPylonJungle', name: 'Jungle Pylon' },
        { id: 4951, internalName: 'TeleportationPylonVictory', name: 'Universal Pylon' },
        { id: 5653, internalName: 'TeleportationPylonShimmer', name: 'Aether Pylon' },
        { id: 562, internalName: 'MusicBoxOverworldDay', name: 'Music Box (Overworld Day)' },
        { id: 576, internalName: 'MusicBox', name: 'Music Box' },
      ],
    },
    zhMapRoot: {
      records: {
        TeleportationPylonPurity: { internalName: 'TeleportationPylonPurity', nameZh: '森林晶塔' },
        TeleportationPylonJungle: { internalName: 'TeleportationPylonJungle', nameZh: '丛林晶塔' },
        TeleportationPylonVictory: { internalName: 'TeleportationPylonVictory', nameZh: '万能晶塔' },
        TeleportationPylonShimmer: { internalName: 'TeleportationPylonShimmer', nameZh: '以太晶塔' },
        MusicBoxOverworldDay: { internalName: 'MusicBoxOverworldDay', nameZh: '八音盒（地表世界）' },
        MusicBox: { internalName: 'MusicBox', nameZh: '八音盒' },
      },
    },
    shimmerRawRoot: {
      revisionTimestamp: '2026-03-09T05:12:48Z',
      wikitext: '4875, 4876, 4951, <!-- Any Pylon (=> Aether Pylon) -->',
    },
  });

  assert.equal(payload.schemaVersion, '1.0.0');
  assert.equal(payload.sourceProvider, 'wiki_gg');
  assert.equal(payload.groups.length, 1);

  const pylon = payload.groups.find((group) => group.canonicalName === 'Any Pylon');
  assert.ok(pylon);
  assert.deepEqual(pylon.domains, ['shimmer']);
  assert.equal(pylon.sourceKind, 'curated_wiki_item_group');
  assert.equal(pylon.sourceRevisionTimestamp, '2026-03-09T05:12:48Z');
  assert.deepEqual(
    pylon.members.map((member) => member.internalName),
    ['TeleportationPylonJungle', 'TeleportationPylonPurity', 'TeleportationPylonVictory'],
  );
  assert.equal(pylon.members[2].nameZh, '万能晶塔');
  assert.equal(pylon.members.some((member) => member.internalName === 'TeleportationPylonShimmer'), false);

  assert.deepEqual(payload.blockedGroups, [
    {
      canonicalName: 'Recorded Music Boxes',
      displayNameEn: 'Recorded Music Boxes',
      displayNameZh: '录音后的八音盒',
      domains: ['shimmer'],
      sourceKind: 'blocked_consumer_reference',
      sourceProvider: 'wiki_gg',
      sourcePage: 'https://terraria.wiki.gg/wiki/Shimmer',
      sourceRevisionTimestamp: null,
      sourceFile: 'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json',
      sourceUrls: ['https://terraria.wiki.gg/wiki/Shimmer'],
      blockReason: 'Local artifacts prove the shimmer item_group reference but do not provide an explicit source-backed member list.',
    },
  ]);
});
