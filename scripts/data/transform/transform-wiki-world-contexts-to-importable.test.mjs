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
      sourcePage('Snow biome', 'Snow biome summary.'),
      sourcePage('Graveyard', 'Graveyard summary.'),
      sourcePage('Shimmer', 'Shimmer summary.')
    ]
  }, {
    generatedAt: '2026-05-22T01:00:00.000Z',
    sourceFile: 'data/generated/wiki-world-contexts.latest.json'
  });

  const byCode = new Map(importable.worldContexts.map(record => [record.code, record]));
  for (const code of ['DAY', 'NIGHT', 'FULL_MOON', 'BLOOD_MOON', 'WINDY_DAY', 'SNOW', 'ECTO_MIST', 'SHIMMER']) {
    assert.equal(byCode.has(code), true, `${code} should be present`);
  }

  assert.equal(byCode.get('DAY').contextType, 'TIME');
  assert.equal(byCode.get('FULL_MOON').contextType, 'MOON_PHASE');
  assert.equal(byCode.get('BLOOD_MOON').sourceProvider, 'wiki_gg');
  assert.equal(byCode.get('BLOOD_MOON').sourcePage, 'Events');
  assert.equal(byCode.get('SNOW').contextType, 'ENVIRONMENT');
  assert.equal(byCode.get('SNOW').sourcePage, 'Snow biome');
  assert.equal(byCode.get('BLOOD_MOON').lastSyncedAt, '2026-05-22T01:00:00.000Z');
  assert.match(byCode.get('BLOOD_MOON').rawJson, /"sourcePage":"Events"/);
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
