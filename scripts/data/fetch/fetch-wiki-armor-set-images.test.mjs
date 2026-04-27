import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorSetImageRows,
  classifyArmorSetImage,
  deriveArmorSetPageTitle
} from './fetch-wiki-armor-set-images.mjs';

test('deriveArmorSetPageTitle derives common armor page titles from text keys', () => {
  assert.equal(deriveArmorSetPageTitle({ textKey: 'ArmorSetBonus.Wood' }), 'Wood armor');
  assert.equal(deriveArmorSetPageTitle({ textKey: 'ArmorSetBonus.AdamantiteMagic' }), 'Adamantite Magic armor');
  assert.equal(deriveArmorSetPageTitle({ textKey: 'Wood armor' }), 'Wood armor');
});

test('classifyArmorSetImage distinguishes male female demo and part files', () => {
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood armor.png', pageTitle: 'Wood armor' }), 'male');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood armor female.png', pageTitle: 'Wood armor' }), 'female');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Cactus armor (demo).gif', pageTitle: 'Cactus armor' }), 'demo');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood Helmet.png', pageTitle: 'Wood armor' }), 'part');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Adamantite Breastplate.png', pageTitle: 'Wood armor' }), 'other');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Wood armor (pre-1.3.2).png', pageTitle: 'Wood armor' }), 'other');
  assert.equal(classifyArmorSetImage({ fileTitle: 'Old Wood armor.png', pageTitle: 'Wood armor' }), 'other');
});

test('buildArmorSetImageRows builds maint-compatible armor_set_images_raw records', () => {
  const actual = buildArmorSetImageRows({
    armorSets: [
      {
        textKey: 'ArmorSetBonus.Wood',
        pageTitle: 'Wood armor'
      }
    ],
    pageImageTitlesByPageTitle: new Map([
      ['Wood armor', ['Wood armor.png', 'Wood armor female.png', 'Wood Helmet.png']]
    ]),
    imageInfoByFileTitle: new Map([
      ['Wood armor.png', {
        fileTitle: 'File:Wood armor.png',
        url: 'https://terraria.wiki.gg/images/Wood_armor.png',
        mime: 'image/png',
        width: 64,
        height: 64
      }],
      ['Wood armor female.png', {
        fileTitle: 'File:Wood armor female.png',
        url: 'https://terraria.wiki.gg/images/Wood_armor_female.png',
        mime: 'image/png',
        width: 64,
        height: 64
      }],
      ['Wood Helmet.png', {
        fileTitle: 'File:Wood Helmet.png',
        url: 'https://terraria.wiki.gg/images/Wood_Helmet.png',
        mime: 'image/png',
        width: 16,
        height: 16
      }]
    ])
  });

  assert.equal(actual.length, 3);
  assert.deepEqual(actual.map((row) => row.imageRole), ['male', 'female', 'part']);
  assert.equal(actual[0].textKey, 'ArmorSetBonus.Wood');
  assert.equal(actual[0].pageTitle, 'Wood armor');
  assert.equal(actual[0].sourceFileTitle, 'Wood armor.png');
  assert.equal(actual[0].originalUrl, 'https://terraria.wiki.gg/images/Wood_armor.png');
  assert.equal(actual[0].isPrimary, true);
  assert.equal(actual[1].isPrimary, false);
});
