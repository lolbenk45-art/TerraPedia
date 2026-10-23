import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPcVersionIdentityCatalog,
  resolvePcVersionWikiTitle
} from './pc-version-update-identity-catalog.mjs';

test('builds stable identities and provenance from the supported catalog shapes', () => {
  const catalog = buildPcVersionIdentityCatalog({
    items: { generatedAt: '2026-06-04T00:00:00Z', records: [{ itemInternalName: 'LastPrism', itemName: 'Last Prism', pageTitle: 'Last Prism' }] },
    npcs: { generatedAt: '2026-03-28T00:00:00Z', records: [{ internalName: 'KingSlime', name: 'King Slime', id: 50 }] },
    projectiles: { generatedAt: '2026-03-28T00:00:00Z', records: [{ internalName: 'LastPrismLaser', name: 'Last Prism laser', id: 1 }] },
    buffs: { generatedAt: '2026-05-15T00:00:00Z', records: [{ internalName: 'ObsidianSkin', englishName: 'Obsidian Skin', localized: { en: { page: 'Obsidian Skin Potion' } } }] },
    armor_sets: { generatedAt: '2026-06-18T00:00:00Z', records: [{ pageTitle: 'Shroomite armor', nameEn: 'Shroomite armor' }] },
    bosses: { generatedAt: '2026-08-14T00:00:00Z', records: [{ pageTitleEn: 'King Slime', titleEn: 'King Slime' }] },
    shimmer: { generatedAt: '2026-05-24T00:00:00Z', records: [{ inputNameEn: 'Life Crystal', inputInternalName: 'LifeCrystal', outputNameEn: 'Vital Crystal', outputInternalName: 'AegisCrystal' }] }
  });

  const lastPrism = resolvePcVersionWikiTitle(catalog, 'Last Prism');
  assert.equal(lastPrism.status, 'unique');
  assert.equal(lastPrism.targets[0].domain, 'items');
  assert.equal(lastPrism.targets[0].stableIdentity.value, 'LastPrism');
  assert.equal(lastPrism.targets[0].provenance.generatedAt, '2026-06-04T00:00:00Z');
  assert.equal(resolvePcVersionWikiTitle(catalog, 'Life Crystal').targets[0].domain, 'shimmer');
});

test('normalizes percent-encoded titles and tolerates literal percent characters', () => {
  const catalog = buildPcVersionIdentityCatalog({
    items: { records: [
      { itemInternalName: 'DiscountCard', itemName: 'Discount 10% Card', pageTitle: 'Discount 10% Card' },
      { itemInternalName: 'PercentTwentyCard', itemName: 'Discount %20 Card', pageTitle: 'Discount %20 Card' }
    ] }
  });
  assert.equal(resolvePcVersionWikiTitle(catalog, 'Discount 10% Card').status, 'unique');
  assert.equal(resolvePcVersionWikiTitle(catalog, 'Discount_%20_Card').targets[0].stableIdentity.value, 'PercentTwentyCard');
  assert.equal(resolvePcVersionWikiTitle(catalog, 'Discount_10%25_Card').status, 'unknown');
});

test('follows MediaWiki first-letter case semantics without folding the rest of the title', () => {
  const catalog = buildPcVersionIdentityCatalog({
    items: { records: [{ itemInternalName: 'LastPrism', itemName: 'Last Prism', pageTitle: 'Last Prism' }] }
  });
  assert.equal(resolvePcVersionWikiTitle(catalog, 'last Prism').status, 'unique');
  assert.equal(resolvePcVersionWikiTitle(catalog, 'Last prism').status, 'unknown');
});

test('marks a title that resolves across domains as ambiguous', () => {
  const catalog = buildPcVersionIdentityCatalog({
    items: { records: [{ itemInternalName: 'KingSlime', itemName: 'King Slime', pageTitle: 'King Slime' }] },
    bosses: { records: [{ pageTitleEn: 'King Slime', titleEn: 'King Slime' }] }
  });

  const result = resolvePcVersionWikiTitle(catalog, 'King Slime');
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.targets, []);
  assert.equal(result.candidateCount, 2);
});

test('unknown titles and unavailable domains remain unresolved', () => {
  const catalog = buildPcVersionIdentityCatalog({});
  assert.equal(resolvePcVersionWikiTitle(catalog, 'Sound of Nothing').status, 'unknown');
  assert.equal(catalog.provenance.audio.status, 'unavailable');
});

test('does not treat malformed catalog JSON as an empty valid identity set', () => {
  const catalog = buildPcVersionIdentityCatalog({ items: { generatedAt: 'x', records: { invalid: true } } });
  assert.equal(catalog.provenance.items.status, 'unavailable');
  assert.equal(resolvePcVersionWikiTitle(catalog, 'Last Prism').status, 'unknown');
});
