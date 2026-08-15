import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchShimmerLanglinks } from './fetch-wiki-shimmer-langlinks.mjs';

const API_URL = 'https://terraria.wiki.gg/zh/api.php';

test('fetchShimmerLanglinks reports before each bounded batch', async () => {
  const titles = Array.from({ length: 20 }, (_, index) => `标题${String(index).padStart(2, '0')}`);
  const events = [];
  const requestOrder = [];

  await fetchShimmerLanglinks({
    titles,
    apiUrl: API_URL,
    batchSize: 8,
    onPhase: (event) => events.push({ ...event, requestsSoFar: requestOrder.length })
  }, {
    fetchJson: async ({ url }) => {
      requestOrder.push(String(url));
      return emptyResponse();
    }
  });

  assert.equal(requestOrder.length, 3, '20 titles at batch size 8 must issue exactly 3 requests');
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.phase), [
    'fetch_langlinks',
    'fetch_langlinks',
    'fetch_langlinks'
  ]);
  assert.deepEqual(
    events.map((event) => event.requestsSoFar),
    [0, 1, 2],
    'each phase report must precede its own network batch'
  );
  assert.deepEqual(events.map((event) => event.current), [0, 8, 16]);
  assert.deepEqual(events.map((event) => event.total), [20, 20, 20]);
});

test('fetchShimmerLanglinks freezes a sorted deduplicated title list', async () => {
  const requested = [];

  const result = await fetchShimmerLanglinks({
    titles: ['乙', '甲', '乙', '  甲  ', '丙'],
    apiUrl: API_URL,
    batchSize: 8
  }, {
    fetchJson: async ({ url }) => {
      requested.push(new URL(url).searchParams.get('titles'));
      return emptyResponse();
    }
  });

  assert.equal(requested.length, 1);
  assert.deepEqual(requested[0].split('|'), ['丙', '乙', '甲'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));
  assert.deepEqual(result.requestedTitles, ['丙', '乙', '甲'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));
  assert.equal(result.records.length, 3, 'unresolved titles must survive as records');
});

test('fetchShimmerLanglinks records resolved identity, redirects, and response hash', async () => {
  const result = await fetchShimmerLanglinks({
    titles: ['木剑', '旧名'],
    apiUrl: API_URL,
    batchSize: 8
  }, {
    fetchJson: async () => ({
      query: {
        redirects: [{ from: '旧名', to: '新名' }],
        pages: [
          {
            pageid: 11,
            title: '木剑',
            revisions: [{ revid: 501 }],
            langlinks: [{ lang: 'en', title: 'Wood Sword' }]
          },
          {
            pageid: 12,
            title: '新名',
            revisions: [{ revid: 502 }],
            langlinks: [{ lang: 'en', title: 'New Name' }]
          }
        ]
      }
    })
  });

  const direct = result.records.find((record) => record.requestedTitle === '木剑');
  assert.equal(direct.resolvedTitle, '木剑');
  assert.equal(direct.redirectSource, null);
  assert.equal(direct.nameEn, 'Wood Sword');
  assert.equal(direct.pageId, 11);
  assert.equal(direct.revisionId, 501);
  assert.equal(direct.status, 'resolved');

  const redirected = result.records.find((record) => record.requestedTitle === '旧名');
  assert.equal(redirected.resolvedTitle, '新名');
  assert.equal(redirected.redirectSource, '旧名');
  assert.equal(redirected.nameEn, 'New Name');

  assert.match(result.responseSha256, /^sha256:[a-f0-9]{64}$/);
  for (const record of result.records) {
    assert.match(record.responseSha256, /^sha256:[a-f0-9]{64}$/);
  }
});

test('fetchShimmerLanglinks keeps an unresolved title instead of dropping it', async () => {
  const result = await fetchShimmerLanglinks({
    titles: ['木剑', '查无此页'],
    apiUrl: API_URL,
    batchSize: 8
  }, {
    fetchJson: async () => ({
      query: {
        pages: [
          { pageid: 11, title: '木剑', langlinks: [{ lang: 'en', title: 'Wood Sword' }] },
          { title: '查无此页', missing: true }
        ]
      }
    })
  });

  assert.equal(result.records.length, 2);
  const missing = result.records.find((record) => record.requestedTitle === '查无此页');
  assert.equal(missing.status, 'unresolved');
  assert.equal(missing.nameEn, null);
  assert.equal(missing.pageId, null);
  assert.equal(result.summary.resolved, 1);
  assert.equal(result.summary.unresolved, 1);
});

test('fetchShimmerLanglinks writes no terminal action state of its own', async () => {
  const events = [];

  await fetchShimmerLanglinks({
    titles: ['木剑'],
    apiUrl: API_URL,
    batchSize: 8,
    onPhase: (event) => events.push(event)
  }, { fetchJson: async () => emptyResponse() });

  assert.equal(
    events.some((event) => ['completed', 'failed'].includes(event.status)),
    false,
    'the langlink child must never own a terminal action state'
  );
});

function emptyResponse() {
  return { query: { pages: [] } };
}
