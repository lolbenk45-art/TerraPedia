import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArmorSourceIdentityCorrections } from './armor-source-identity.mjs';

const base = {
  sectionCode: 'pre-hardmode', slotGroup: 'legs', itemPageTitle: '挖矿头盔',
  itemHref: '/zh/wiki/%E6%8C%96%E7%9F%BF%E5%A4%B4%E7%9B%94', itemNameZh: '挖矿头盔',
  defenseValue: 1, imageFileTitle: 'Mining Pants.png', rawCells: { otherBonus: '+10% 挖矿速度' },
};
const evidence = {
  artifactPath: '.local/tmp/a63-20260928-04/mining-pants-page.json', artifactHash: 'sha256:' + 'a'.repeat(64),
  requestedPageTitle: 'Mining Pants', canonicalPageTitle: '挖矿盔甲', revisionId: 247540,
};

test('applies an explicitly evidenced image/slot identity correction and preserves before/after lineage', () => {
  const [row] = applyArmorSourceIdentityCorrections({ records: [base], corrections: [{
    match: { sectionCode: base.sectionCode, slotGroup: base.slotGroup, itemPageTitle: base.itemPageTitle,
      itemHref: base.itemHref, itemNameZh: base.itemNameZh, defenseValue: base.defenseValue, imageFileTitle: base.imageFileTitle },
    replacement: { itemPageTitle: '挖矿裤', itemHref: '/zh/wiki/%E6%8C%96%E7%9F%BF%E8%A3%A4', itemNameZh: '挖矿裤' }, evidence,
  }] });
  assert.equal(row.itemNameZh, '挖矿裤');
  assert.deepEqual(row.sourceIdentityCorrection.before, { sectionCode: 'pre-hardmode', slotGroup: 'legs', itemPageTitle: '挖矿头盔', itemHref: base.itemHref, itemNameZh: '挖矿头盔', defenseValue: 1, imageFileTitle: 'Mining Pants.png' });
  assert.equal(row.sourceIdentityCorrection.evidence.revisionId, 247540);
});
test('fails closed when the correction is ambiguous or lacks independent revision evidence', () => {
  const correction = { match: { sectionCode: base.sectionCode, slotGroup: base.slotGroup, itemPageTitle: base.itemPageTitle,
    itemHref: base.itemHref, itemNameZh: base.itemNameZh, defenseValue: base.defenseValue, imageFileTitle: base.imageFileTitle },
    replacement: { itemPageTitle: '挖矿裤', itemHref: '/pants', itemNameZh: '挖矿裤' }, evidence };
  assert.throws(() => applyArmorSourceIdentityCorrections({ records: [base, { ...base }], corrections: [correction] }), /exactly one/);
  assert.throws(() => applyArmorSourceIdentityCorrections({ records: [base], corrections: [{ ...correction, evidence: { ...evidence, revisionId: null } }] }), /revisionId/);
});
