import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemPageRefreshUpdate, shouldAcceptSellRefresh } from './refresh-item-pages-from-wiki.mjs';

test('buildMaintItemPageRefreshUpdate maps fetched wiki payload into maint item page refresh fields', () => {
  const actual = buildMaintItemPageRefreshUpdate({
    existingRow: {
      item_internal_name: 'Torch',
      item_name: 'Torch',
      page_title: 'Torch',
    },
    payload: {
      pageTitle: 'Torches',
      revisionTimestamp: '2026-04-26T00:00:00Z',
      wikitext: 'wiki text',
      html: '<table><tr><th>Sell</th><td><span class="coin" data-sort-value="10">10 CP</span></td></tr></table>',
    },
    sellStat: {
      sellText: '10 CP',
      sellValue: 10,
    },
  });

  assert.equal(actual.pageTitle, 'Torches');
  assert.equal(actual.sourceRevisionTimestamp, '2026-04-26T00:00:00Z');
  assert.equal(actual.sellText, '10 CP');
  assert.equal(actual.sellValue, 10);
  assert.equal(actual.rawJson.pageTitle, 'Torches');
  assert.equal(actual.rawJson.itemInternalName, 'Torch');
});

test('shouldAcceptSellRefresh rejects obvious set-level sell values from broad armor pages', () => {
  assert.equal(shouldAcceptSellRefresh({
    itemName: 'Adamantite Helmet',
    pageTitle: 'Adamantite armor',
    sellText: '7 GC 20 SC (set)',
    sellValue: 72000,
  }), false);
});

test('shouldAcceptSellRefresh accepts non-set sell values from non-armor group pages', () => {
  assert.equal(shouldAcceptSellRefresh({
    itemName: 'Wooden Door',
    pageTitle: 'Doors',
    sellText: '40 CC 2 GC (Golden Door)',
    sellValue: 40,
  }), true);
});

test('buildMaintItemPageRefreshUpdate clears rejected set-level sell values while keeping fetched page content', () => {
  const actual = buildMaintItemPageRefreshUpdate({
    existingRow: {
      item_internal_name: 'AdamantiteHelmet',
      item_name: 'Adamantite Helmet',
      page_title: 'Adamantite Helmet',
    },
    payload: {
      pageTitle: 'Adamantite armor',
      revisionTimestamp: '2026-04-26T00:00:00Z',
      wikitext: 'wiki text',
      html: '<table><tr><th>Sell</th><td><span class="coin" data-sort-value="72000">7 GC 20 SC (set)</span></td></tr></table>',
    },
    sellStat: {
      sellText: '7 GC 20 SC (set)',
      sellValue: 72000,
    },
  });

  assert.equal(actual.pageTitle, 'Adamantite armor');
  assert.equal(actual.sellText, null);
  assert.equal(actual.sellValue, null);
  assert.equal(actual.rawJson.pageTitle, 'Adamantite armor');
});
