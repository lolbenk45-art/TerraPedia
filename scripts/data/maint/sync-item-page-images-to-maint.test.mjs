import test from 'node:test';
import assert from 'node:assert/strict';

import { selectBestItemImageUrlFromPageHtml } from './sync-item-page-images-to-maint.mjs';

test('selectBestItemImageUrlFromPageHtml picks the current item sprite from a shared group page', () => {
  const html = `
    <div class="infobox item">
      <img alt="Desktop version" src="/images/Desktop_only.png?8fb4d9" />
      <img alt="Wooden Door item sprite" src="/images/Wooden_Door.png?11cea0" />
      <img alt="Golden Door item sprite" src="/images/Golden_Door.png?71f0c0" />
      <img alt="Stack digits" src="/images/Stack_digit_9.png?345268" />
    </div>
  `;

  const actual = selectBestItemImageUrlFromPageHtml({
    html,
    itemName: 'Wooden Door',
    internalName: 'WoodenDoor',
  });

  assert.equal(actual, 'https://terraria.wiki.gg/images/Wooden_Door.png?11cea0');
});

test('selectBestItemImageUrlFromPageHtml returns null when no usable image candidates exist', () => {
  const html = `
    <div class="infobox item">
      <img alt="Desktop version" src="/images/Desktop_only.png?8fb4d9" />
      <img alt="Stack digits" src="/images/Stack_digit_9.png?345268" />
    </div>
  `;

  const actual = selectBestItemImageUrlFromPageHtml({
    html,
    itemName: 'Torch',
    internalName: 'Torch',
  });

  assert.equal(actual, null);
});
