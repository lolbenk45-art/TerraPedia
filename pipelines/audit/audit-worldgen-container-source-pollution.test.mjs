import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditWorldgenContainerSourcePollution,
  buildWorldgenContainerSourcePollutionGate,
  classifyItemBackedSourceType,
  parseAuditWorldgenContainerSourcePollutionArgs
} from './audit-worldgen-container-source-pollution.mjs';

const GENERATED_AT = '2026-06-14T00:00:00.000Z';

test('auditWorldgenContainerSourcePollution resolves item 43 chest text to structured item-backed candidates', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceRows: [
      {
        sourceId: 196368,
        itemId: 43,
        itemName: 'Suspicious Looking Eye',
        itemNameZh: '可疑眼球',
        itemInternalName: 'SuspiciousLookingEye',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: 'Suspicious Looking Eye worldgen',
        conditions: 'Desktop, Console, and Mobile versions: found in Ivy Chests and Gold Chests.',
        notes: null,
        sourcePage: 'Suspicious Looking Eye'
      }
    ],
    itemBackedSources: [
      {
        id: 306,
        name: 'Gold Chest',
        nameZh: '金箱',
        internalName: 'GoldChest',
        image: 'http://localhost:9000/terrapedia-images/items/gold-chest.png'
      },
      {
        id: 680,
        name: 'Ivy Chest',
        nameZh: '常春藤箱',
        internalName: 'IvyChest',
        image: 'http://localhost:9000/terrapedia-images/items/ivy-chest.png'
      },
      {
        id: 48,
        name: 'Chest',
        nameZh: '箱子',
        internalName: 'Chest',
        image: 'http://localhost:9000/terrapedia-images/items/chest.png'
      }
    ]
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.summary.pollutedRows, 1);
  assert.equal(report.summary.autoFixableRows, 1);
  assert.equal(report.summary.needsReviewRows, 0);
  assert.equal(report.summary.blockedRows, 0);

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].sourceId, 196368);
  assert.equal(report.rows[0].classification, 'auto_fixable');
  assert.deepEqual(
    report.rows[0].matchedSources.map((source) => ({
      id: source.id,
      name: source.name,
      sourceType: source.sourceType,
      sourceRefType: source.sourceRefType
    })),
    [
      { id: 680, name: 'Ivy Chest', sourceType: 'container', sourceRefType: 'container' },
      { id: 306, name: 'Gold Chest', sourceType: 'container', sourceRefType: 'container' }
    ]
  );
});

test('auditWorldgenContainerSourcePollution separates ambiguous generic container-only matches for review', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceRows: [
      {
        sourceId: 10,
        itemId: 99,
        itemName: 'Example Item',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        conditions: 'Found in Chests.'
      }
    ],
    itemBackedSources: [
      {
        id: 48,
        name: 'Chest',
        internalName: 'Chest',
        image: 'http://localhost:9000/terrapedia-images/items/chest.png'
      }
    ]
  });

  assert.equal(report.summary.pollutedRows, 1);
  assert.equal(report.summary.autoFixableRows, 0);
  assert.equal(report.summary.needsReviewRows, 1);
  assert.equal(report.rows[0].classification, 'needs_review');
  assert.deepEqual(report.rows[0].reviewReasons, ['generic_container_reference']);
});

test('auditWorldgenContainerSourcePollution promotes Chest when Chests page loot evidence contains the target item', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceEvidence: {
      chestPage: {
        itemId: 48,
        requestedPageTitle: 'Chest',
        pageTitle: 'Chests',
        itemInternalName: 'Chest',
        hasAuto48: true,
        hasLootItemChest: true,
        lootTargetNames: ['Spear', 'Blowpipe', 'Wooden Boomerang']
      }
    },
    sourceRows: [
      {
        sourceId: 20,
        itemId: 280,
        itemName: 'Spear',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        conditions: 'The Spear can be found in surface Chests.'
      }
    ],
    itemBackedSources: [
      {
        id: 48,
        name: 'Chest',
        internalName: 'Chest',
        image: 'http://localhost:9000/terrapedia-images/items/chest.png'
      }
    ]
  });

  assert.equal(report.summary.pollutedRows, 1);
  assert.equal(report.summary.autoFixableRows, 1);
  assert.equal(report.rows[0].classification, 'auto_fixable');
  assert.deepEqual(report.rows[0].reviewReasons, []);
  assert.deepEqual(report.rows[0].matchedSources.map((source) => source.id), [48]);
});

test('auditWorldgenContainerSourcePollution keeps Chest mentions in review when target item is not in Chests loot evidence', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceEvidence: {
      chestPage: {
        itemId: 48,
        requestedPageTitle: 'Chest',
        pageTitle: 'Chests',
        itemInternalName: 'Chest',
        hasAuto48: true,
        hasLootItemChest: true,
        lootTargetNames: ['Spear', 'Blowpipe', 'Wooden Boomerang']
      }
    },
    sourceRows: [
      {
        sourceId: 21,
        itemId: 438,
        itemName: 'Star Statue',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        conditions: 'Decorative statues may be found near Chests.'
      }
    ],
    itemBackedSources: [
      {
        id: 48,
        name: 'Chest',
        internalName: 'Chest',
        image: 'http://localhost:9000/terrapedia-images/items/chest.png'
      }
    ]
  });

  assert.equal(report.summary.pollutedRows, 1);
  assert.equal(report.summary.needsReviewRows, 1);
  assert.equal(report.rows[0].classification, 'needs_review');
  assert.deepEqual(report.rows[0].reviewReasons, ['generic_container_reference']);
});

test('auditWorldgenContainerSourcePollution excludes broad worldgen context pages from pollution candidates', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceRows: [
      {
        sourceId: 30,
        itemId: 438,
        itemName: 'Star Statue',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourcePage: 'Statues',
        conditions: 'Most statues can be found underground, near Chests and cabins.'
      },
      {
        sourceId: 31,
        itemId: 1372,
        itemName: 'Blood Moon Rising',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourcePage: 'Paintings',
        conditions: 'Paintings can be found in Underground Cabins and Goodie Bags are unrelated page prose.'
      },
      {
        sourceId: 32,
        itemId: 5532,
        itemName: 'Demon Altar',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourcePage: 'Altars',
        conditions: 'Altars are naturally present underground.'
      }
    ],
    itemBackedSources: [
      {
        id: 48,
        name: 'Chest',
        internalName: 'Chest',
        image: 'http://localhost:9000/terrapedia-images/items/chest.png'
      },
      {
        id: 1774,
        name: 'Goodie Bag',
        internalName: 'GoodieBag',
        image: 'http://localhost:9000/terrapedia-images/items/goodie-bag.png'
      },
      {
        id: 1869,
        name: 'Present',
        internalName: 'Present',
        image: 'http://localhost:9000/terrapedia-images/items/present.png'
      }
    ]
  });

  assert.equal(report.summary.pollutedRows, 0);
  assert.equal(report.summary.excludedRows, 3);
  assert.deepEqual(report.excludedRows.map((row) => row.exclusionReason), [
    'broad_worldgen_context',
    'broad_worldgen_context',
    'broad_worldgen_context'
  ]);
});

test('auditWorldgenContainerSourcePollution sends self-source container rows to review', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceRows: [
      {
        sourceId: 12,
        itemId: 306,
        itemName: 'Gold Chest',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        conditions: 'Gold Chests are found underground.'
      }
    ],
    itemBackedSources: [
      {
        id: 306,
        name: 'Gold Chest',
        internalName: 'GoldChest',
        image: 'http://localhost:9000/terrapedia-images/items/gold-chest.png'
      }
    ]
  });

  assert.equal(report.summary.pollutedRows, 0);
  assert.equal(report.summary.autoFixableRows, 0);
  assert.equal(report.summary.needsReviewRows, 0);
  assert.equal(report.summary.excludedRows, 1);
  assert.equal(report.excludedRows[0].exclusionReason, 'self_source_match');
});

test('auditWorldgenContainerSourcePollution excludes chest trigger usage text from acquisition pollution', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceRows: [
      {
        sourceId: 33,
        itemId: 3091,
        itemName: 'Key of Night',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourcePage: 'Key of Night',
        conditions: 'The key spawns a Mimic when placed in any slot of any empty Chest.'
      }
    ],
    itemBackedSources: [
      {
        id: 48,
        name: 'Chest',
        internalName: 'Chest',
        image: 'http://localhost:9000/terrapedia-images/items/chest.png'
      }
    ]
  });

  assert.equal(report.summary.pollutedRows, 0);
  assert.equal(report.summary.excludedRows, 1);
  assert.equal(report.excludedRows[0].exclusionReason, 'trigger_usage_not_acquisition');
});

test('auditWorldgenContainerSourcePollution blocks rows with container terms but no item match', () => {
  const report = auditWorldgenContainerSourcePollution({
    generatedAt: GENERATED_AT,
    sourceRows: [
      {
        sourceId: 11,
        itemId: 100,
        itemName: 'Unknown Example',
        sourceType: 'worldgen',
        sourceRefType: 'world',
        notes: 'Dropped from an Unlisted Chest variant.'
      }
    ],
    itemBackedSources: []
  });

  assert.equal(report.summary.pollutedRows, 1);
  assert.equal(report.summary.blockedRows, 1);
  assert.equal(report.rows[0].classification, 'blocked');
  assert.deepEqual(report.rows[0].reviewReasons, ['no_item_backed_source_match']);
});

test('classifyItemBackedSourceType maps source names to taxonomy-compatible item-backed types', () => {
  assert.deepEqual(classifyItemBackedSourceType({ name: 'Gold Chest' }), {
    sourceType: 'container',
    sourceRefType: 'container'
  });
  assert.deepEqual(classifyItemBackedSourceType({ name: 'Wooden Crate' }), {
    sourceType: 'crate',
    sourceRefType: 'crate'
  });
  assert.deepEqual(classifyItemBackedSourceType({ name: 'Treasure Bag (Queen Bee)' }), {
    sourceType: 'treasure_bag',
    sourceRefType: 'treasure_bag'
  });
  assert.deepEqual(classifyItemBackedSourceType({ name: 'Lock Box' }), {
    sourceType: 'container',
    sourceRefType: 'container'
  });
});

test('parseAuditWorldgenContainerSourcePollutionArgs rejects mutation flags', () => {
  assert.throws(
    () => parseAuditWorldgenContainerSourcePollutionArgs(['--apply=true']),
    /read-only worldgen container source pollution audit refuses mutation flag: --apply/
  );
});

test('buildWorldgenContainerSourcePollutionGate fails only on open pollution findings', () => {
  assert.deepEqual(
    buildWorldgenContainerSourcePollutionGate({
      summary: {
        pollutedRows: 0,
        autoFixableRows: 0,
        needsReviewRows: 0,
        blockedRows: 0,
        excludedRows: 202
      }
    }),
    {
      passed: true,
      blockers: [],
      allowedExcludedRows: 202
    }
  );

  assert.deepEqual(
    buildWorldgenContainerSourcePollutionGate({
      summary: {
        pollutedRows: 2,
        autoFixableRows: 1,
        needsReviewRows: 1,
        blockedRows: 0,
        excludedRows: 202
      }
    }),
    {
      passed: false,
      blockers: [
        { metric: 'pollutedRows', count: 2 },
        { metric: 'autoFixableRows', count: 1 },
        { metric: 'needsReviewRows', count: 1 }
      ],
      allowedExcludedRows: 202
    }
  );
});
