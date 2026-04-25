import test from 'node:test';
import assert from 'node:assert/strict';

import { extractItemSellStat } from './item-page-statistics-parser.mjs';

test('extractItemSellStat reads sell text and sort value from item infobox statistics html', () => {
  const actual = extractItemSellStat(`
    <div class="section statistics">
      <div class="title">Statistics</div>
      <table class="stat">
        <tbody>
          <tr>
            <th><a href="/wiki/Value" title="Value">Sell</a></th>
            <td><span class="coin" title="1 Gold Coin" data-sort-value="10000"><span class="gc">1<i> GC</i></span></span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `);

  assert.deepEqual(actual, {
    sellText: '1 GC',
    sellValue: 10000
  });
});

test('extractItemSellStat returns nulls when no sell row exists', () => {
  const actual = extractItemSellStat('<div class="section statistics"><table class="stat"><tbody><tr><th>Type</th><td>Material</td></tr></tbody></table></div>');

  assert.deepEqual(actual, {
    sellText: null,
    sellValue: null
  });
});
