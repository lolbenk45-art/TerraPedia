import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUFF_DEPENDENCY_COLUMNS,
  bindBuffDependencyResolution,
  buildBuffDependencyManifest,
} from './buff-offline-dependencies.mjs';
import { validateDependencyManifest } from '../automation/eight-domain-dependency-seeder.mjs';

const databases = {
  local: 'terria_v1_automation_acceptance_e8p_e38103255d8d4633_local',
  maint: 'terria_v1_automation_acceptance_e8p_e38103255d8d4633_maint',
  relation: 'terria_v1_automation_acceptance_e8p_e38103255d8d4633_relation',
};

test('Buff dependency manifest binds exact local and maint Item/NPC rows by stable IDs', () => {
  const manifest = buildBuffDependencyManifest({
    runId: 'e8pr-buffs-20261017-v1',
    runKey: 'e8p_e38103255d8d4633',
    databases,
    localItemRows: [row(BUFF_DEPENDENCY_COLUMNS.localItems, { id: 288, internal_name: 'ObsidianSkinPotion', name: 'Obsidian Skin Potion', status: 1, deleted: 0 })],
    localNpcRows: [row(BUFF_DEPENDENCY_COLUMNS.localNpcs, { id: 42, game_id: 42, source_id: 42, internal_name: 'Hornet', name: 'Hornet', status: 1, deleted: 0 })],
    maintItemRows: [row(BUFF_DEPENDENCY_COLUMNS.maintItems, { id: 288, source_id: 288, internal_name: 'ObsidianSkinPotion', english_name: 'Obsidian Skin Potion', status: 1, deleted: 0 })],
    maintNpcRows: [row(BUFF_DEPENDENCY_COLUMNS.maintNpcs, { id: 108, source_id: 42, internal_name: 'Hornet', english_name: 'Hornet', status: 1, deleted: 0 })],
  });
  const checked = validateDependencyManifest(manifest, { databases });

  assert.equal(checked.domain, 'buffs');
  assert.deepEqual(checked.dependencies.map((entry) => [entry.target.table, entry.keyColumns]), [
    ['items', ['id']],
    ['npcs', ['game_id']],
    ['maint_items', ['source_id']],
    ['maint_npcs', ['source_id']],
  ]);
  assert.ok(checked.dependencies.every((entry) => entry.expectedRowCount === 1));
});

test('Buff dependency resolution retains unresolved facts and never matches by internal name alone', () => {
  const records = [{
    id: 1,
    internalName: 'TestBuff',
    sourceItems: [
      { itemId: 288, internalName: 'ObsidianSkinPotion' },
      { itemId: 999, internalName: 'MissingButSameName' },
      { itemId: null, internalName: 'NoStableItemId' },
    ],
    inflictingNpcs: [
      { npcId: 42, internalName: 'Hornet' },
      { npcId: 88, internalName: 'MissingNpc' },
      { internalName: 'NoStableNpcId' },
    ],
    immuneNpcs: [],
  }];
  const result = bindBuffDependencyResolution({
    records,
    npcIdentityByGameId: { 42: 'Hornet', 88: 'MissingNpc' },
    localItemRows: [{ id: 288, internal_name: 'ObsidianSkinPotion' }, { id: 111, internal_name: 'MissingButSameName' }],
    maintItemRows: [{ source_id: 288, internal_name: 'ObsidianSkinPotion' }],
    localNpcRows: [{ id: 42, game_id: 42, source_id: 42, internal_name: 'Hornet' }],
    maintNpcRows: [{ id: 108, source_id: 42, internal_name: 'Hornet' }],
  });

  assert.deepEqual(result.records[0].sourceItems.map((fact) => fact.resolveStatus ?? 'resolved'), [
    'resolved', 'unresolved', 'unresolved',
  ]);
  assert.deepEqual(result.records[0].inflictingNpcs.map((fact) => fact.resolveStatus ?? 'resolved'), [
    'resolved', 'unresolved', 'unresolved',
  ]);
  assert.equal(result.unresolved.sourceItemFacts, 2);
  assert.equal(result.unresolved.npcFacts, 2);
  assert.equal(result.unresolved.samples.sourceItems[1].sourceItemId, null);
  assert.deepEqual(records[0].sourceItems.map((fact) => fact.resolveStatus ?? 'resolved'), ['resolved', 'resolved', 'resolved']);
});

test('Buff dependency resolution accepts the reviewed SandPoacher identity alias only through its stable NPC ID', () => {
  const result = bindBuffDependencyResolution({
    records: [{ id: 70, internalName: 'Venom', sourceItems: [], inflictingNpcs: [{ npcId: 530, internalName: 'SandPoacher' }], immuneNpcs: [] }],
    npcIdentityByGameId: { 530: 'DesertScorpionWalk' },
    localItemRows: [],
    maintItemRows: [],
    localNpcRows: [{ id: 530, game_id: 530, source_id: 530, internal_name: 'DesertScorpionWalk' }],
    maintNpcRows: [{ id: 700, source_id: 530, internal_name: 'DesertScorpionWalk' }],
  });

  assert.equal(result.records[0].inflictingNpcs[0].resolveStatus, undefined);
  assert.equal(result.unresolved.npcFacts, 0);
});

test('Buff dependency resolution preserves negative NPC variant IDs as stable source identities', () => {
  const result = bindBuffDependencyResolution({
    records: [{ id: 70, internalName: 'Venom', sourceItems: [], inflictingNpcs: [{ npcId: -530, internalName: 'SandPoacher' }], immuneNpcs: [] }],
    npcIdentityByGameId: { '-530': 'DesertScorpionWalk' },
    localItemRows: [],
    maintItemRows: [],
    localNpcRows: [{ id: -530, game_id: -530, source_id: -530, internal_name: 'DesertScorpionWalk' }],
    maintNpcRows: [{ id: 700, source_id: -530, internal_name: 'DesertScorpionWalk' }],
  });

  assert.equal(result.records[0].inflictingNpcs[0].resolveStatus, undefined);
  assert.equal(result.unresolved.npcFacts, 0);
});

function row(columns, values) {
  return Object.fromEntries([...columns].map((column) => [column, values[column] ?? null]));
}
