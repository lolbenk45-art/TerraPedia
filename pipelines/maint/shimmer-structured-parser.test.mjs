import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SHIMMER_TABLE_ROLE_SEQUENCE,
  SHIMMER_TABLE_ROLE_VERSION,
  extractShimmerStructuredRecords
} from './shimmer-structured-parser.mjs';

test('shimmer parser exposes the stable thirteen-role sequence and a role version', () => {
  assert.equal(SHIMMER_TABLE_ROLE_SEQUENCE.length, 13);
  assert.deepEqual(SHIMMER_TABLE_ROLE_SEQUENCE.map((entry) => entry.role), [
    'item_transforms',
    'decraft_multi_recipe',
    'decraft_evil_branch',
    'decraft_unique',
    'decraft_random_partial',
    'decraft_locked_skeletron',
    'decraft_locked_golem',
    'decraft_not_allowed',
    'critter_to_item',
    'enemy_transforms',
    'critter_to_faeling',
    'slime_to_shimmer_slime',
    'npc_transforms'
  ]);
  assert.match(SHIMMER_TABLE_ROLE_VERSION, /^shimmer-table-roles\/\d+$/);
  assert.throws(() => {
    SHIMMER_TABLE_ROLE_SEQUENCE.push({ role: 'injected', label: 'x' });
  });
});

test('shimmer parser records the source table ordinal for every row', () => {
  const parsed = extractShimmerStructuredRecords(rawFixture());

  assert.equal(parsed.tableRoleVersion, SHIMMER_TABLE_ROLE_VERSION);
  for (const record of parsed.itemTransforms) {
    assert.equal(record.sourceTableOrdinal, 0);
    assert.equal(record.sourceTableRole, 'item_transforms');
  }
  assert.deepEqual(
    parsed.decraftRules.map((record) => record.sourceTableOrdinal),
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.deepEqual(
    parsed.entityTransforms.map((record) => record.sourceTableOrdinal),
    [8, 9, 10, 11]
  );
  assert.equal(parsed.npcTransforms[0].sourceTableOrdinal, 12);
  assert.equal(parsed.npcTransforms[0].sourceTableRole, 'npc_transforms');

  const covered = new Set([
    ...parsed.itemTransforms,
    ...parsed.decraftRules,
    ...parsed.entityTransforms,
    ...parsed.npcTransforms
  ].map((record) => record.sourceTableOrdinal));
  assert.deepEqual([...covered].sort((a, b) => a - b), [...Array(13).keys()]);
  for (const record of [...parsed.decraftRules, ...parsed.entityTransforms]) {
    assert.equal(record.sourceTableRole, SHIMMER_TABLE_ROLE_SEQUENCE[record.sourceTableOrdinal].role);
  }
});

test('shimmer parser never resolves entity identity', () => {
  const parsed = extractShimmerStructuredRecords(rawFixture());

  const first = parsed.itemTransforms[0];
  assert.equal(first.inputNameZh, '木剑');
  assert.equal(first.inputInternalName, null);
  assert.equal(first.outputInternalName, null);
  assert.equal(
    JSON.stringify(parsed).includes('itemId'),
    false,
    'parser output must carry no resolved entity identity'
  );
});

test('shimmer parser rejects a changed table-role count', () => {
  const short = rawFixture();
  short.html = short.html.replace(/<table[\s\S]*?<\/table>\s*$/, '');

  assert.throws(
    () => extractShimmerStructuredRecords(short),
    /shimmer table count/i
  );
});

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
