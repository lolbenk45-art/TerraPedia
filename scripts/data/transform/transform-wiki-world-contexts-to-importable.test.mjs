import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorldContextImportable } from './transform-wiki-world-contexts-to-importable.mjs';

test('transform emits stable importable world context records from bounded source pages', () => {
  const importable = buildWorldContextImportable({
    generatedAt: '2026-05-22T00:00:00.000Z',
    pages: [
      sourcePage('Day and night cycle', 'Day and Night summary.'),
      sourcePage('Moon phase', 'Moon phase summary.'),
      sourcePage('Events', 'Event summary.'),
      sourcePage('Weather', 'Weather summary.'),
      sourcePage('Party', 'Party summary.'),
      sourcePage('Lantern Night', 'Lantern Night summary.'),
      sourcePage('Snow biome', 'Snow biome summary.'),
      sourcePage('Graveyard', 'Graveyard summary.'),
      sourcePage('Shimmer', 'Shimmer summary.')
    ]
  }, {
    generatedAt: '2026-05-22T01:00:00.000Z',
    sourceFile: 'data/generated/wiki-world-contexts.latest.json'
  });

  const byCode = new Map(importable.worldContexts.map(record => [record.code, record]));
  for (const code of [
    'DAY',
    'NIGHT',
    'FULL_MOON',
    'RAIN',
    'SANDSTORM',
    'WINDY_DAY',
    'THUNDERSTORM',
    'STARFALL',
    'BLOOD_MOON',
    'PARTY',
    'LANTERN_NIGHT',
    'GOBLIN_ARMY',
    'SLIME_RAIN',
    'OLD_ONES_ARMY',
    'TORCH_GOD',
    'FROST_LEGION',
    'SOLAR_ECLIPSE',
    'PIRATE_INVASION',
    'PUMPKIN_MOON',
    'FROST_MOON',
    'MARTIAN_MADNESS',
    'LUNAR_EVENTS',
    'SNOW',
    'ECTO_MIST',
    'SHIMMER'
  ]) {
    assert.equal(byCode.has(code), true, `${code} should be present`);
  }

  assert.equal(byCode.get('DAY').contextType, 'TIME');
  assert.equal(byCode.get('FULL_MOON').contextType, 'MOON_PHASE');
  assert.equal(byCode.get('BLOOD_MOON').sourceProvider, 'wiki_gg');
  assert.equal(byCode.get('BLOOD_MOON').sourcePage, 'Blood Moon');
  assert.equal(byCode.get('RAIN').contextType, 'WEATHER');
  assert.equal(byCode.get('RAIN').sourcePage, 'Rain');
  assert.equal(byCode.get('GOBLIN_ARMY').contextType, 'EVENT');
  assert.equal(byCode.get('GOBLIN_ARMY').sourcePage, 'Goblin Army');
  assert.equal(byCode.get('PARTY').sourcePage, 'Party');
  assert.equal(byCode.get('LANTERN_NIGHT').sourcePage, 'Lantern Night');
  assert.equal(byCode.get('TORCH_GOD').sourcePage, 'The Torch God');
  assert.equal(byCode.get('MARTIAN_MADNESS').sourcePage, 'Martian Madness');
  assert.equal(byCode.get('SNOW').contextType, 'ENVIRONMENT');
  assert.equal(byCode.get('SNOW').sourcePage, 'Snow biome');
  assert.equal(byCode.get('BLOOD_MOON').lastSyncedAt, '2026-05-22T01:00:00.000Z');
  assert.match(byCode.get('BLOOD_MOON').rawJson, /"sourcePage":"Blood Moon"/);
});

test('transform does not reuse one page-level icon across multiple derived contexts', () => {
  const importable = buildWorldContextImportable({
    generatedAt: '2026-05-22T00:00:00.000Z',
    pages: [
      sourcePage('Moon phase', 'Moon phase summary.', {
        iconUrl: 'https://terraria.wiki.gg/images/Moon-full.png'
      }),
      sourcePage('Events', 'Event summary.', {
        iconUrl: 'https://terraria.wiki.gg/images/Desktop_only.png'
      })
    ]
  }, {
    generatedAt: '2026-05-22T01:00:00.000Z',
    sourceFile: 'data/generated/wiki-world-contexts.latest.json'
  });

  const byCode = new Map(importable.worldContexts.map(record => [record.code, record]));
  assert.equal(byCode.get('FULL_MOON').iconUrl, null);
  assert.equal(byCode.get('NEW_MOON').iconUrl, null);
  assert.equal(byCode.get('BLOOD_MOON').iconUrl, null);
});

test('transform keeps only trusted single-context page icons', () => {
  const importable = buildWorldContextImportable({
    generatedAt: '2026-05-22T00:00:00.000Z',
    pages: [
      sourcePage('Shimmer', 'Shimmer summary.', {
        iconUrl: 'https://terraria.wiki.gg/images/Shimmer.png'
      }),
      sourcePage('Snow biome', 'Snow biome summary.', {
        iconUrl: 'https://terraria.wiki.gg/images/Desktop_only.png'
      })
    ]
  }, {
    generatedAt: '2026-05-22T01:00:00.000Z',
    sourceFile: 'data/generated/wiki-world-contexts.latest.json'
  });

  const byCode = new Map(importable.worldContexts.map(record => [record.code, record]));
  assert.equal(byCode.get('SHIMMER').iconUrl, 'https://terraria.wiki.gg/images/Shimmer.png');
  assert.equal(byCode.get('SNOW').iconUrl, null);
});

test('transform excludes derived local condition terms from wiki world contexts', () => {
  const importable = buildWorldContextImportable({
    generatedAt: '2026-05-22T00:00:00.000Z',
    pages: [
      sourcePage('Moon phase', 'Moon phase summary.'),
      sourcePage('Events', 'Event summary.')
    ]
  }, {
    generatedAt: '2026-05-22T01:00:00.000Z',
    sourceFile: 'data/generated/wiki-world-contexts.latest.json'
  });

  const byCode = new Map(importable.worldContexts.map(record => [record.code, record]));

  for (const code of [
    'MOON_PHASE_1_4',
    'MOON_PHASE_LISTED',
    'MARTIAN_MADNESS_COMPLETED',
    'PIRATE_INVASION_COMPLETED',
    'SNOW_LEGION_COMPLETED',
    'ANY_MECH_BOSS_DEFEATED',
    'ALL_MECH_BOSSES_DEFEATED'
  ]) {
    assert.equal(byCode.has(code), false, `${code} should live in condition_terms, not world_contexts`);
  }
  assert.equal(importable.worldContexts.some(record => record.contextType === 'LOCAL_CONDITION'), false);
});

function sourcePage(title, intro, overrides = {}) {
  return {
    requestedTitle: title,
    title,
    pageId: 100,
    revisionId: 200,
    revisionTimestamp: '2026-05-20T00:00:00Z',
    sourceUrl: `https://terraria.wiki.gg/wiki/${title.replaceAll(' ', '_')}`,
    intro,
    sections: [{ level: '2', line: 'Contents' }],
    iconUrl: 'https://terraria.wiki.gg/images/Mock.png',
    ...overrides
  };
}
