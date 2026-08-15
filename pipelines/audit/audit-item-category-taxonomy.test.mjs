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
  assert.equal(audit.sourceMode, 'raw_wiki');
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

test('auditItemCategoryTaxonomy fallbackMode standardized_inference reports DrillContainmentUnit without raw pages', () => {
  const audit = auditItemCategoryTaxonomy({
    fallbackMode: 'standardized_inference',
    rawPagesDir: '/tmp/terrapedia-missing-item-pages-for-test',
    standardizedRecords: [
      {
        name: 'Drill Containment Unit',
        internalName: 'DrillContainmentUnit',
        categoryCode: 'MATERIAL',
        stack: { stackSize: 1 },
        stats: { damage: 0, defense: 0 },
      },
    ],
    itemPagesMetadataByInternal: new Map([
      ['DrillContainmentUnit', {
        entityType: 'item',
        itemInternalName: 'DrillContainmentUnit',
        pageTitle: 'Drill Containment Unit',
        hasWikitext: true,
      }],
    ]),
    mountAllowlist: new Set(['DrillContainmentUnit']),
    verifiedInternalNames: ['DrillContainmentUnit'],
  });

  assert.equal(audit.status, 'warning');
  assert.equal(audit.sourceMode, 'standardized_inference');
  assert.equal(audit.summary.classified, 1);
  assert.deepEqual(audit.distribution, { MOUNT: 1 });
  assert.deepEqual(audit.verifiedSamples, [
    {
      internalName: 'DrillContainmentUnit',
      expectedCategoryCode: 'MOUNT',
      currentCategoryCode: 'MATERIAL',
      reason: 'standardized_inference:mount_allowlist',
      source: 'standardized_inference',
      confidence: 'high',
    },
  ]);
});

test('auditItemCategoryTaxonomy fallbackMode standardized_inference skips insufficient evidence', () => {
  const audit = auditItemCategoryTaxonomy({
    fallbackMode: 'standardized_inference',
    rawPagesDir: '/tmp/terrapedia-missing-item-pages-for-test',
    standardizedRecords: [
      {
        name: 'Carrot',
        internalName: 'Carrot',
        categoryCode: 'MATERIAL',
        stack: { stackSize: 30 },
        stats: { damage: 0, defense: 0 },
      },
    ],
    itemPagesMetadataByInternal: new Map([
      ['Carrot', {
        entityType: 'item',
        itemInternalName: 'Carrot',
        pageTitle: 'Carrot',
      }],
    ]),
    mountAllowlist: new Set(['DrillContainmentUnit']),
    verifiedInternalNames: ['Carrot'],
  });

  assert.equal(audit.status, 'pass');
  assert.equal(audit.sourceMode, 'standardized_inference');
  assert.equal(audit.summary.classified, 0);
  assert.deepEqual(audit.distribution, {});
  assert.deepEqual(audit.verifiedSamples, []);
});

test('auditItemCategoryTaxonomy fallbackMode standardized_inference blocks without item page metadata', () => {
  const audit = auditItemCategoryTaxonomy({
    fallbackMode: 'standardized_inference',
    rawPagesDir: '/tmp/terrapedia-missing-item-pages-for-test',
    standardizedRecords: [
      {
        name: 'Drill Containment Unit',
        internalName: 'DrillContainmentUnit',
        categoryCode: 'MATERIAL',
        stack: { stackSize: 1 },
        stats: { damage: 0, defense: 0 },
      },
    ],
    mountAllowlist: new Set(['DrillContainmentUnit']),
  });

  assert.equal(audit.status, 'blocked');
  assert.equal(audit.sourceMode, 'standardized_inference');
  assert.deepEqual(audit.blockers, [{ reason: 'standardized_item_page_metadata_missing' }]);
  assert.equal(audit.summary.classified, 0);
});
