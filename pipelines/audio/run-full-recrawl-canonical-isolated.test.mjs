import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAudioApiExpectations,
  buildAudioApiRoutes,
  buildAudioDependencyManifest,
  validateAudioApiResponse,
} from './run-full-recrawl-canonical-isolated.mjs';

const RUN_ID = 'e8pr-audio-20261017-v1';
const RUN_KEY = 'e8p_723cbdfbe8d2fe09';
const DATABASES = {
  local: `terria_v1_automation_acceptance_${RUN_KEY}_local`,
  maint: `terria_v1_automation_acceptance_${RUN_KEY}_maint`,
  relation: `terria_v1_automation_acceptance_${RUN_KEY}_relation`,
};

function sourceAssets() {
  return [
    { assetId: 'bgm:music-aether', shard: 'bgm', kind: 'bgm_track', sourceKey: 'Music-Aether', displayNameZh: '以太', displayNameEn: 'Aether' },
    { assetId: 'items:item-1', shard: 'items', kind: 'item_sound', sourceKey: 'Item_1', displayNameZh: '土块', displayNameEn: 'Dirt Block' },
    { assetId: 'npc_hit:npc_hit_3', shard: 'npc_hit', kind: 'npc_hit_sound', sourceKey: 'NPC_Hit_3', displayNameZh: '音效族', displayNameEn: 'Sound family' },
  ];
}

test('Audio dependency manifest includes only exact Item identities and NPC HitSound owners', () => {
  const manifest = buildAudioDependencyManifest({
    runId: RUN_ID,
    runKey: RUN_KEY,
    databases: DATABASES,
    itemRows: Array.from({ length: 50 }, (_, index) => ({ id: index + 1, name: `Item ${index + 1}`, name_zh: `物品${index + 1}`, internal_name: `Item${index + 1}`, category_id: null, status: 1, deleted: 0 })),
    npcRows: [{ id: 9, game_id: 9, source_id: 9, internal_name: 'GreenSlime', name: 'Green Slime', name_zh: '绿色史莱姆', raw_json: JSON.stringify({ extras: { HitSound: 3 } }), status: 1, deleted: 0 }],
  });

  assert.equal(manifest.domain, 'audio');
  assert.equal(manifest.dependencies.length, 2);
  assert.deepEqual(manifest.dependencies.map((entry) => `${entry.source.table}->${entry.target.table}`).sort(), ['items->items', 'npcs->npcs']);
  assert.equal(manifest.dependencies.find((entry) => entry.source.table === 'items').keyValues.length, 50);
  assert.deepEqual(manifest.dependencies.find((entry) => entry.source.table === 'npcs').keyValues, [{ source_id: 9 }]);
});

test('Audio API routes cover public list/detail and admin metadata list', () => {
  assert.deepEqual(buildAudioApiRoutes(), [
    { routeId: 'public-audio-assets', params: {} },
    { routeId: 'public-audio-asset-detail', params: { id: '1' } },
    { routeId: 'admin-audio-assets', params: {} },
  ]);
});

test('Audio API response validators bind exact asset identity and preserve unmatched link status', () => {
  const assets = sourceAssets();
  const assetRows = assets.map((asset, index) => ({
    id: index + 1,
    asset_id: asset.assetId,
    shard: asset.shard,
    kind: asset.kind,
    source_key: asset.sourceKey,
  }));
  const linkRows = assets.map((asset) => ({ asset_id: asset.assetId, match_status: 'unmatched' }));
  const acceptance = {
    apiExpectations: buildAudioApiExpectations({ assets, assetRows, linkRows }),
  };
  const publicRow = (asset, id) => ({ id, assetId: asset.assetId, shard: asset.shard, kind: asset.kind, sourceKey: asset.sourceKey });
  const listPayload = {
    success: true,
    data: [publicRow(assets[0], 1), publicRow(assets[1], 2), publicRow(assets[2], 3)],
    pagination: { total: assets.length },
  };
  const listResult = validateAudioApiResponse({ routeId: 'public-audio-assets', payload: listPayload, acceptance });
  assert.equal(listResult.totalAssets, assets.length);
  assert.equal(listResult.pageRowsVerified, assets.length);

  const detailResult = validateAudioApiResponse({
    routeId: 'public-audio-asset-detail',
    payload: { success: true, data: publicRow(assets[0], 1) },
    acceptance,
  });
  assert.equal(detailResult.identityVerified, true);

  const adminResult = validateAudioApiResponse({
    routeId: 'admin-audio-assets',
    payload: {
      success: true,
      data: assets.map((asset, index) => ({ ...publicRow(asset, index + 1), matchStatuses: 'unmatched' })),
      pagination: { total: assets.length },
    },
    acceptance,
  });
  assert.equal(adminResult.linkStatusesVerified, assets.length);
  assert.throws(() => validateAudioApiResponse({
    routeId: 'public-audio-assets',
    payload: { ...listPayload, pagination: { total: 99 } },
    acceptance,
  }), /total differs/i);
});
