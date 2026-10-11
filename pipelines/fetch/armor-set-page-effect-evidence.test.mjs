import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachArmorSetPageEffectEvidence,
  buildArmorSetPageEffectEvidence,
  computeArmorSetPageEffectEvidenceHash,
  extractEffectTextFromHtml,
} from './armor-set-page-effect-evidence.mjs';

const modulePayload = {
  sourcePageTitle: 'Module:ArmorSetBonuses', sourceRevisionId: 964993,
  sourceRevisionTimestamp: '2026-01-31T20:21:00Z', totalArmorSets: 2,
  armorSets: [
    { textKey: 'ArmorSetBonus.Wood', benefitExpression: 'ArmorSetBonuses.Benefits.Wood' },
    { textKey: 'ArmorSetBonus.MetalTier1', benefitExpression: 'ArmorSetBonuses.Benefits.MetalTier1' },
  ],
};
const imagePayload = {
  totalArmorSets: 2, warnings: [], armorSetImages: [
    { textKey: 'ArmorSetBonus.Wood', pageTitle: 'Wood armor' },
    { textKey: 'ArmorSetBonus.MetalTier1', pageTitle: 'Copper armor' },
    { textKey: 'ArmorSetBonus.MetalTier1', pageTitle: 'Tin armor' },
  ],
};
const html = '<p>装备全套套装时提供下列效果：</p><ul><li>套装奖励：+1 防御</li><li>+5% 移动速度</li></ul><h2>制作</h2>';
const pagePayloads = {
  'Wood armor': { pageTitle: 'Wood armor', pageId: 1, revisionId: 101, revisionTimestamp: '2026-01-01T00:00:00Z', wikitext: 'wood raw', html },
  'Copper armor': { pageTitle: 'Copper armor', pageId: 2, revisionId: 102, revisionTimestamp: '2026-01-02T00:00:00Z', wikitext: 'copper raw', html },
  'Tin armor': { pageTitle: 'Tin armor', pageId: 3, revisionId: 103, revisionTimestamp: '2026-01-03T00:00:00Z', wikitext: 'tin raw', html },
};

test('extracts rendered effect lines from a revision-bound page', () => {
  assert.equal(extractEffectTextFromHtml(html), '套装奖励：+1 防御\n+5% 移动速度');
});

test('builds one owner with alternate page evidence without collapsing revisions', () => {
  const evidence = buildArmorSetPageEffectEvidence({ modulePayload, imagePayload, pagePayloads });
  assert.equal(evidence.schemaVersion, 'armor-set-page-effect-evidence/v1');
  assert.equal(evidence.summary.setCount, 2);
  assert.equal(evidence.summary.pageCount, 3);
  const metal = evidence.owners.find((owner) => owner.textKey === 'ArmorSetBonus.MetalTier1');
  assert.equal(metal.primaryPage.revisionId, 102);
  assert.equal(metal.alternatePages[0].revisionId, 103);
  assert.match(metal.primaryPage.contentHash, /^sha256:[a-f0-9]{64}$/);
  const enriched = attachArmorSetPageEffectEvidence(modulePayload, evidence);
  assert.equal(enriched.armorSets[0].effectText, '套装奖励：+1 防御\n+5% 移动速度');
  assert.equal(enriched.armorSets[0].effectTextSource.revisionId, 101);
  assert.equal(computeArmorSetPageEffectEvidenceHash({
    modulePayload,
    imagePayload,
    pages: evidence.pages,
    owners: evidence.owners,
  }), evidence.evidenceHash);
});

test('rejects missing page, foreign owner, and empty effect evidence', () => {
  assert.throws(() => buildArmorSetPageEffectEvidence({ modulePayload, imagePayload, pagePayloads: { 'Wood armor': pagePayloads['Wood armor'] } }), /missing page evidence/);
  assert.throws(() => buildArmorSetPageEffectEvidence({ modulePayload, imagePayload: { ...imagePayload, armorSetImages: [...imagePayload.armorSetImages, { textKey: 'ArmorSetBonus.Unknown', pageTitle: 'Unknown armor' }] }, pagePayloads }), /foreign textKey/);
  const unresolved = buildArmorSetPageEffectEvidence({ modulePayload, imagePayload, pagePayloads: { ...pagePayloads, 'Tin armor': { ...pagePayloads['Tin armor'], effectText: ' ' } } });
  assert.equal(unresolved.pages.find((page) => page.pageTitle === 'Tin armor').effectTextStatus, 'unresolved');
});

test('rejects revision drift and duplicate module owners', () => {
  assert.throws(() => buildArmorSetPageEffectEvidence({ modulePayload: { ...modulePayload, armorSets: [{ ...modulePayload.armorSets[0] }, { ...modulePayload.armorSets[0] }] }, imagePayload, pagePayloads }), /duplicated/);
  assert.throws(() => buildArmorSetPageEffectEvidence({ modulePayload, imagePayload, pagePayloads: { ...pagePayloads, 'Wood armor': { ...pagePayloads['Wood armor'], revisionId: 0 } } }), /revisionId is required/);
});

test('uses the revision-bound armor overview only when a set page has no effect list', () => {
  const evidence = buildArmorSetPageEffectEvidence({
    modulePayload,
    imagePayload,
    pagePayloads: { ...pagePayloads, 'Wood armor': { ...pagePayloads['Wood armor'], html: '<p>没有套装列表</p>' } },
    overview: {
      pagePayload: {
        pageTitle: '盔甲', revisionId: 900, revisionTimestamp: '2026-02-01T00:00:00Z', wikitext: 'overview raw'
      },
      records: [{ pageTitle: 'Wood armor', effectText: '套装奖励：+1 防御' }],
    },
  });
  const wood = evidence.owners.find((owner) => owner.textKey === 'ArmorSetBonus.Wood');
  assert.equal(wood.primaryPage.effectText, '套装奖励：+1 防御');
  assert.equal(wood.primaryPage.effectTextSource.kind, 'armor_overview');
  assert.equal(wood.primaryPage.effectTextSource.revisionId, 900);
});
