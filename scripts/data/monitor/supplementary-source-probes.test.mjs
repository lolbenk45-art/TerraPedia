import test from 'node:test';
import assert from 'node:assert/strict';

import {
  probeSupplementarySource,
  SUPPLEMENTARY_SOURCE_DEFINITIONS
} from './supplementary-source-probes.mjs';

const WIKI_API_URL = 'https://example.test/en/api.php';
const ZH_WIKI_API_URL = 'https://example.test/zh/api.php';

test('exports the exact supplementary source identities and rejects unsupported domains', async () => {
  assert.deepEqual(SUPPLEMENTARY_SOURCE_DEFINITIONS, {
    audio: {
      sourceKey: 'wiki.audio_assets.catalog',
      locator: 'Music|NPC_Hit|NPC_Killed|Item_',
      entityFamily: 'audio',
      sourceKind: 'media_catalog'
    },
    bosses: {
      sourceKey: 'wiki.bosses.catalog',
      locator: 'Bosses',
      entityFamily: 'bosses',
      sourceKind: 'page_catalog'
    },
    shimmer: {
      sourceKey: 'wiki.shimmer.page_and_langlinks',
      locator: '微光',
      entityFamily: 'shimmer',
      sourceKind: 'page_and_langlinks'
    }
  });

  await assert.rejects(
    probeSupplementarySource({ domainId: 'boss_loot' }),
    /unsupported supplementary source domain: boss_loot/i
  );
});

test('audio probe is stable across reordered catalog responses and does not request media bytes', async () => {
  const first = createAudioDependencies();
  const reordered = createAudioDependencies({ reverseRows: true });

  const firstResult = await probeSupplementarySource({ domainId: 'audio', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, first.dependencies);
  const reorderedResult = await probeSupplementarySource({ domainId: 'audio', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, reordered.dependencies);

  assert.equal(firstResult.sourceKey, 'wiki.audio_assets.catalog');
  assert.equal(firstResult.contentHash, reorderedResult.contentHash);
  assert.equal(first.binaryRequestCount, 0);
  assert.equal(reordered.binaryRequestCount, 0);
  assert.equal(first.requests.length, 4);
  for (const request of first.requests) {
    assert.equal(request.searchParams.get('action'), 'query');
    assert.equal(request.searchParams.get('list'), 'allimages');
    assert.equal(request.searchParams.get('aiprop'), 'sha1|timestamp|mime|size');
    assert.equal(request.searchParams.has('iiurl'), false);
  }
  assert.deepEqual(first.metadataCalls, [{
    titles: ['音乐'],
    apiUrl: ZH_WIKI_API_URL,
    includeLanglinks: false,
    langlinksLanguage: 'zh'
  }]);
});

test('audio probe rejects a continuation that reaches its governed page bound', async () => {
  const { dependencies } = createAudioDependencies({ truncated: true });

  await assert.rejects(
    probeSupplementarySource({ domainId: 'audio', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, {
      ...dependencies,
      audioCatalogMaxPagesPerPrefix: 1
    }),
    /continuation.*governed limit/i
  );
});

test('probes fail closed for revisionless metadata and governed discovery overflow', async () => {
  const revisionless = createAudioDependencies();
  revisionless.dependencies.fetchPageMetadataBatch = async () => [{
    ...metadata('音乐', 101, '2026-08-01T00:00:00Z'),
    revisionId: null
  }];
  await assert.rejects(
    probeSupplementarySource({ domainId: 'audio', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, revisionless.dependencies),
    /missing or revisionless/i
  );

  const overflow = createBossDependencies({
    sections: [
      { level: '2', line: 'Pre-Hardmode bosses' },
      { level: '3', line: 'King Slime' },
      { level: '3', line: 'Eye of Cthulhu' }
    ]
  });
  await assert.rejects(
    probeSupplementarySource({ domainId: 'bosses', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, {
      ...overflow.dependencies,
      bossCatalogMaxEntries: 1
    }),
    /governed boss entry limit/i
  );
});

test('boss probe hashes overview, English revisions and resolved Chinese revisions without boss page HTML', async () => {
  const first = createBossDependencies();
  const changed = createBossDependencies({ zhRevisionId: 902 });

  const firstResult = await probeSupplementarySource({ domainId: 'bosses', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, first.dependencies);
  const changedResult = await probeSupplementarySource({ domainId: 'bosses', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, changed.dependencies);

  assert.equal(firstResult.sourceKey, 'wiki.bosses.catalog');
  assert.notEqual(firstResult.contentHash, changedResult.contentHash);
  assert.equal(first.requests.length, 1);
  assert.equal(first.requests[0].searchParams.get('action'), 'parse');
  assert.equal(first.requests[0].searchParams.get('prop'), 'sections');
  assert.equal(first.metadataCalls.length, 2);
  assert.deepEqual(first.metadataCalls[0], {
    titles: ['Bosses', 'King Slime', 'Eye of Cthulhu'],
    apiUrl: WIKI_API_URL,
    includeLanglinks: true,
    langlinksLanguage: 'zh'
  });
  assert.deepEqual(first.metadataCalls[1], {
    titles: ['克苏鲁之眼', '史莱姆王'],
    apiUrl: ZH_WIKI_API_URL,
    includeLanglinks: false,
    langlinksLanguage: 'zh'
  });
});

test('shimmer probe uses one source revision and source-page HTML, then batches candidate metadata only', async () => {
  const first = createShimmerDependencies();
  const changed = createShimmerDependencies({ sourceRevisionId: 702 });

  const firstResult = await probeSupplementarySource({ domainId: 'shimmer', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, first.dependencies);
  const changedResult = await probeSupplementarySource({ domainId: 'shimmer', wikiApiUrl: WIKI_API_URL, zhWikiApiUrl: ZH_WIKI_API_URL }, changed.dependencies);

  assert.equal(firstResult.sourceKey, 'wiki.shimmer.page_and_langlinks');
  assert.notEqual(firstResult.contentHash, changedResult.contentHash);
  assert.equal(first.requests.length, 2);
  assert.deepEqual(first.requests.map((request) => ({
    action: request.searchParams.get('action'),
    title: request.searchParams.get('titles') ?? request.searchParams.get('page'),
    prop: request.searchParams.get('prop')
  })), [
    { action: 'query', title: '微光', prop: 'revisions' },
    { action: 'parse', title: '微光', prop: 'text' }
  ]);
  assert.deepEqual(first.metadataCalls, [{
    titles: ['水晶块', '生命果'],
    apiUrl: ZH_WIKI_API_URL,
    includeLanglinks: true,
    langlinksLanguage: 'en'
  }]);
});

function createAudioDependencies({ reverseRows = false, truncated = false } = {}) {
  const requests = [];
  const metadataCalls = [];
  let binaryRequestCount = 0;
  const rowsByPrefix = {
    Music: [audioRow('Music_Overworld_Day.mp3', 'a1'), audioRow('Music_Boss_1.ogg', 'a2')],
    NPC_Hit: [audioRow('NPC_Hit_1.wav', 'a3')],
    NPC_Killed: [audioRow('NPC_Killed_1.wav', 'a4')],
    Item_: [audioRow('Item_1.wav', 'a5')]
  };
  const dependencies = {
    fetchJson: async ({ url }) => {
      const request = new URL(url);
      requests.push(request);
      if (request.protocol !== 'https:' || request.searchParams.get('action') !== 'query') binaryRequestCount += 1;
      const prefix = request.searchParams.get('aiprefix');
      const rows = reverseRows ? [...rowsByPrefix[prefix]].reverse() : rowsByPrefix[prefix];
      return {
        query: { allimages: rows },
        ...(truncated ? { continue: { aicontinue: `${prefix}|next` } } : {})
      };
    },
    fetchPageMetadataBatch: async (input) => {
      metadataCalls.push(compactMetadataInput(input));
      return [metadata('音乐', 101, '2026-08-01T00:00:00Z')];
    }
  };
  return {
    dependencies,
    requests,
    metadataCalls,
    get binaryRequestCount() { return binaryRequestCount; }
  };
}

function createBossDependencies({ zhRevisionId = 901, sections = defaultBossSections() } = {}) {
  const requests = [];
  const metadataCalls = [];
  return {
    requests,
    metadataCalls,
    dependencies: {
      fetchJson: async ({ url }) => {
        const request = new URL(url);
        requests.push(request);
        return {
          parse: {
            title: 'Bosses',
            sections
          }
        };
      },
      fetchPageMetadataBatch: async (input) => {
        metadataCalls.push(compactMetadataInput(input));
        if (input.apiUrl === WIKI_API_URL) {
          return [
            metadata('Bosses', 100, '2026-08-01T00:00:00Z'),
            metadata('King Slime', 201, '2026-08-02T00:00:00Z', '史莱姆王'),
            metadata('Eye of Cthulhu', 202, '2026-08-03T00:00:00Z', '克苏鲁之眼')
          ];
        }
        return [
          metadata('史莱姆王', zhRevisionId, '2026-08-04T00:00:00Z'),
          metadata('克苏鲁之眼', 902, '2026-08-05T00:00:00Z')
        ];
      }
    }
  };
}

function defaultBossSections() {
  return [
    { level: '2', line: 'Pre-Hardmode bosses' },
    { level: '3', line: 'King Slime' },
    { level: '3', line: 'Eye of Cthulhu' }
  ];
}

function createShimmerDependencies({ sourceRevisionId = 701 } = {}) {
  const requests = [];
  const metadataCalls = [];
  return {
    requests,
    metadataCalls,
    dependencies: {
      fetchJson: async ({ url }) => {
        const request = new URL(url);
        requests.push(request);
        if (request.searchParams.get('action') === 'query') {
          return {
            query: {
              pages: [{
                pageid: 700,
                title: '微光',
                revisions: [{ revid: sourceRevisionId, timestamp: '2026-08-06T00:00:00Z' }]
              }]
            }
          };
        }
        return { parse: { title: '微光', text: '<table><tr><td>source only</td></tr></table>' } };
      },
      collectShimmerCandidateTitles: (raw) => {
        assert.equal(raw.pageTitle, '微光');
        assert.match(raw.html, /source only/);
        return ['生命果', '水晶块'];
      },
      fetchPageMetadataBatch: async (input) => {
        metadataCalls.push(compactMetadataInput(input));
        return [
          metadata('水晶块', 801, '2026-08-07T00:00:00Z', 'Crystal Block'),
          metadata('生命果', 802, '2026-08-08T00:00:00Z', 'Life Fruit')
        ];
      },
      runWikiShimmerExtractionPipeline: () => {
        throw new Error('full shimmer pipeline must never run');
      }
    }
  };
}

function audioRow(name, sha1) {
  return {
    name,
    sha1,
    timestamp: '2026-08-01T00:00:00Z',
    mime: name.endsWith('.mp3') ? 'audio/mpeg' : 'audio/ogg',
    size: 1234
  };
}

function metadata(title, revisionId, revisionTimestamp, zhTitle = null) {
  return {
    missing: false,
    pageId: revisionId + 1000,
    pageTitle: title,
    requestedTitle: title,
    revisionId,
    revisionTimestamp,
    zhTitle
  };
}

function compactMetadataInput(input) {
  return {
    titles: input.titles,
    apiUrl: input.apiUrl,
    includeLanglinks: input.includeLanglinks,
    langlinksLanguage: input.langlinksLanguage
  };
}
