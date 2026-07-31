import assert from 'node:assert/strict';
import test from 'node:test';

import { SHIMMER_TABLE_ROLE_SEQUENCE } from '../maint/shimmer-structured-parser.mjs';
import { buildShimmerGeneration } from './shimmer-generation-builder.mjs';

test('buildShimmerGeneration is byte-identical across different wall clocks', () => {
  const realNow = Date.now;
  let generation;
  let second;
  try {
    Date.now = () => 1_600_000_000_000;
    generation = buildShimmerGeneration(baseInput());
    Date.now = () => 1_900_000_000_000;
    second = buildShimmerGeneration(baseInput());
  } finally {
    Date.now = realNow;
  }

  assert.deepEqual(second, generation);
  assert.equal(
    JSON.stringify(second) === JSON.stringify(generation),
    true,
    'generation payload must be byte-identical regardless of wall clock'
  );
});

test('buildShimmerGeneration emits all five shards plus context', () => {
  const generation = buildShimmerGeneration(baseInput());

  assert.deepEqual(Object.keys(generation).sort(), [
    'context',
    'decraftRules',
    'entityTransforms',
    'itemTransforms',
    'npcTransforms',
    'titleResolution'
  ]);
  assert.equal(generation.context.sourcePageId, 4242);
  assert.equal(generation.context.generatedAt, '2026-07-30T12:00:00.000Z');
  assert.equal(generation.itemTransforms.length, 2);
});

test('buildShimmerGeneration resolves frozen langlink evidence into entity identity', () => {
  const generation = buildShimmerGeneration(baseInput());

  const first = generation.itemTransforms[0];
  assert.equal(first.inputNameZh, '木剑');
  assert.equal(first.inputNameEn, 'Wood Sword');
  assert.equal(first.inputInternalName, 'WoodSword');
  assert.equal(first.inputKind, 'item');
});

test('buildShimmerGeneration records an unresolved title instead of dropping the row', () => {
  const input = baseInput();
  input.langlinkEvidence = input.langlinkEvidence.filter((entry) => entry.nameZh !== '木剑');

  const generation = buildShimmerGeneration(input);

  assert.equal(generation.itemTransforms.length, 2, 'no row may disappear silently');
  const first = generation.itemTransforms[0];
  assert.equal(first.inputKind, 'unresolved');
  assert.equal(first.inputInternalName, null);
  const evidence = generation.titleResolution.find((entry) => entry.nameZh === '木剑');
  assert.equal(evidence.kind, 'unresolved');
});

test('buildShimmerGeneration rejects duplicate normalized langlink titles', () => {
  const input = baseInput();
  input.langlinkEvidence = [...input.langlinkEvidence, { nameZh: '木剑', nameEn: 'Wooden Sword' }];

  assert.throws(() => buildShimmerGeneration(input), /duplicate.*langlink|langlink.*duplicate/i);
});

test('buildShimmerGeneration marks an item and NPC name collision as ambiguous', () => {
  const input = baseInput();
  input.npcRecords = [...input.npcRecords, { name: 'Wood Sword', internalName: 'WoodSwordNpc' }];

  const generation = buildShimmerGeneration(input);

  const evidence = generation.titleResolution.find((entry) => entry.nameZh === '木剑');
  assert.equal(evidence.kind, 'ambiguous');
  assert.equal(evidence.internalName, null);
  assert.equal(generation.itemTransforms.length, 2, 'ambiguity must not drop the row');
});

test('buildShimmerGeneration resolves the npc shard through its own npc field', () => {
  const generation = buildShimmerGeneration(baseInput());

  const record = generation.npcTransforms[0];
  assert.equal(record.npc.nameZh, '向导');
  assert.equal(record.npc.nameEn, 'Guide');
  assert.equal(record.npc.internalName, 'Guide');
  assert.equal(record.npc.kind, 'npc');
  assert.equal(record.appearanceVariant, 'shimmer');
  assert.equal(
    generation.titleResolution.some((entry) => entry.nameZh === '向导'),
    true,
    'npc shard titles must reach title resolution evidence'
  );
});

test('buildShimmerGeneration requires explicit generatedAt', () => {
  const input = baseInput();
  delete input.generatedAt;

  assert.throws(() => buildShimmerGeneration(input), /generatedAt/i);
});

function baseInput() {
  return {
    raw: rawFixture(),
    itemRecords: [
      { name: 'Wood Sword', internalName: 'WoodSword' },
      { name: 'Platinum Sword', internalName: 'PlatinumSword' },
      { name: 'Copper Pickaxe', internalName: 'CopperPickaxe' },
      { name: 'Tungsten Pickaxe', internalName: 'TungstenPickaxe' }
    ],
    npcRecords: [
      { name: 'Guide', internalName: 'Guide' }
    ],
    langlinkEvidence: [
      { nameZh: '木剑', nameEn: 'Wood Sword' },
      { nameZh: '铂金剑', nameEn: 'Platinum Sword' },
      { nameZh: '铜镐', nameEn: 'Copper Pickaxe' },
      { nameZh: '钨镐', nameEn: 'Tungsten Pickaxe' },
      { nameZh: '向导', nameEn: 'Guide' },
      { nameZh: '微光向导', nameEn: 'Shimmered Guide' }
    ],
    generatedAt: '2026-07-30T12:00:00.000Z'
  };
}

function rawFixture() {
  const tables = SHIMMER_TABLE_ROLE_SEQUENCE.map((entry, index) => {
    if (index === 0) {
      return table(entry.label, [
        [anchor('木剑'), anchor('铂金剑'), '仅在微光中'],
        [anchor('铜镐'), anchor('钨镐'), '']
      ]);
    }
    if (index === 12) {
      return table(entry.label, [[anchor('向导'), anchor('微光向导')]]);
    }
    return table(entry.label, [[anchor(`输入${index}`), anchor(`输出${index}`)]]);
  });
  return {
    pageTitle: '微光',
    pageId: 4242,
    revisionTimestamp: '2026-07-30T00:00:00Z',
    html: tables.join('\n')
  };
}

function table(caption, rows) {
  const body = rows
    .map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('');
  return `<table><caption>${caption}</caption><tr><th>输入</th><th>输出</th></tr>${body}</table>`;
}

function anchor(title) {
  return `<a href="/wiki/${encodeURIComponent(title)}" title="${title}">${title}</a>`;
}
