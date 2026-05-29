import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditItemCategoryTaxonomy,
} from './audit-item-category-taxonomy.mjs';

test('auditItemCategoryTaxonomy blocks when raw item pages are missing', () => {
  const audit = auditItemCategoryTaxonomy({
    rawPagesDir: '/tmp/terrapedia-missing-item-pages-for-test',
    standardizedRecords: [],
  });

  assert.equal(audit.status, 'blocked');
  assert.deepEqual(audit.blockers, [{ reason: 'raw_item_pages_missing' }]);
  assert.equal(audit.summary.standardizedRecords, 0);
  assert.equal(audit.summary.rawPages, 0);
  assert.equal(audit.summary.classified, 0);
});

test('auditItemCategoryTaxonomy reports DrillContainmentUnit material mismatch from inline pages', () => {
  const classifier = ({ item, wiki, standardizedRecord }) => {
    assert.equal(item.internal_name, 'DrillContainmentUnit');
    assert.equal(standardizedRecord.internalName, 'DrillContainmentUnit');
    assert.match(wiki.wikitext, /Mount summon/);
    return { categoryCode: 'MOUNT', reason: 'type:mount summon' };
  };

  const audit = auditItemCategoryTaxonomy({
    standardizedRecords: [
      {
        name: 'Drill Containment Unit',
        internalName: 'DrillContainmentUnit',
        categoryCode: 'MATERIAL',
      },
    ],
    rawPagesByInternal: new Map([
      [
        'DrillContainmentUnit',
        {
          wikitext: `
{{item infobox
| type = Mount summon
}}
          `,
        },
      ],
    ]),
    classifier,
    verifiedInternalNames: ['DrillContainmentUnit'],
  });

  assert.equal(audit.status, 'warning');
  assert.deepEqual(audit.distribution, { MOUNT: 1 });
  assert.deepEqual(audit.verifiedSamples, [
    {
      internalName: 'DrillContainmentUnit',
      expectedCategoryCode: 'MOUNT',
      currentCategoryCode: 'MATERIAL',
      reason: 'type:mount summon',
    },
  ]);
  assert.deepEqual(audit.suspiciousMaterials, [
    {
      internalName: 'DrillContainmentUnit',
      name: 'Drill Containment Unit',
      currentCategoryCode: 'MATERIAL',
      expectedCategoryCode: 'MOUNT',
      reason: 'type:mount summon',
    },
  ]);
});
