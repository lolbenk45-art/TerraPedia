import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBlankWorldgenMarkerCleanupPlan,
  buildCoveredWorldgenTextDisablePlan,
  buildFinalExceptionRepairPlan,
  buildWorldgenContainerSourcePollutionRepairPlan,
  parseWorldgenContainerSourcePollutionRepairArgs
} from './plan-worldgen-container-source-pollution-repair.mjs';

test('buildWorldgenContainerSourcePollutionRepairPlan plans item 43 structured container rows', () => {
  const plan = buildWorldgenContainerSourcePollutionRepairPlan({
    batchId: 'test-batch',
    auditReport: {
      rows: [
        auditRow43()
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 196368, item_id: 43, source_type: 'worldgen', source_ref_type: 'world' })
    ]
  });

  assert.equal(plan.summary.candidateRows, 1);
  assert.equal(plan.summary.rowsToDisable, 1);
  assert.equal(plan.summary.rowsToInsert, 2);
  assert.equal(plan.summary.duplicateStructuredRows, 0);
  assert.equal(plan.summary.blockedRows, 0);
  assert.deepEqual(plan.disableRows.map((row) => row.id), [196368]);
  assert.deepEqual(plan.insertRows.map((row) => row.sourceRefId).sort((a, b) => a - b), [306, 680]);
});

test('buildWorldgenContainerSourcePollutionRepairPlan skips duplicate structured rows but still disables fully covered pollution', () => {
  const plan = buildWorldgenContainerSourcePollutionRepairPlan({
    batchId: 'test-batch',
    auditReport: {
      rows: [
        auditRow43()
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 196368, item_id: 43, source_type: 'worldgen', source_ref_type: 'world' }),
      sourceRow({
        id: 200001,
        item_id: 43,
        source_type: 'container',
        source_ref_type: 'container',
        source_ref_id: 306,
        source_ref_name: 'Gold Chest'
      })
    ]
  });

  assert.equal(plan.summary.rowsToDisable, 1);
  assert.equal(plan.summary.rowsToInsert, 1);
  assert.equal(plan.summary.duplicateStructuredRows, 1);
  assert.deepEqual(plan.insertRows.map((row) => row.sourceRefId), [680]);
  assert.deepEqual(plan.duplicateRows.map((row) => row.sourceRefId), [306]);
});

test('buildWorldgenContainerSourcePollutionRepairPlan blocks incomplete replacement and keeps old pollution active', () => {
  const row = auditRow43();
  row.matchedSources[1] = { id: null, name: 'Gold Chest', sourceType: 'container', sourceRefType: 'container' };
  const plan = buildWorldgenContainerSourcePollutionRepairPlan({
    batchId: 'test-batch',
    auditReport: {
      rows: [row]
    },
    existingSourceRows: [
      sourceRow({ id: 196368, item_id: 43, source_type: 'worldgen', source_ref_type: 'world' })
    ]
  });

  assert.equal(plan.summary.rowsToDisable, 0);
  assert.equal(plan.summary.rowsToInsert, 0);
  assert.equal(plan.summary.blockedRows, 1);
  assert.equal(plan.blockedRows[0].reason, 'incomplete_structured_replacement');
});

test('buildWorldgenContainerSourcePollutionRepairPlan never applies review rows', () => {
  const row = auditRow43({
    classification: 'needs_review',
    reviewReasons: ['self_source_match']
  });
  const plan = buildWorldgenContainerSourcePollutionRepairPlan({
    auditReport: {
      rows: [row]
    },
    existingSourceRows: []
  });

  assert.equal(plan.summary.candidateRows, 0);
  assert.equal(plan.summary.rowsToDisable, 0);
  assert.equal(plan.summary.rowsToInsert, 0);
});

test('buildCoveredWorldgenTextDisablePlan disables only allowlisted rows with structured coverage', () => {
  const plan = buildCoveredWorldgenTextDisablePlan({
    auditReport: {
      rows: [
        auditRow({
          sourceId: 191018,
          itemId: 285,
          itemName: 'Aglet',
          classification: 'needs_review',
          reviewReasons: ['generic_container_reference']
        }),
        auditRow({
          sourceId: 195692,
          itemId: 3091,
          itemName: 'Key of Night',
          classification: 'needs_review',
          reviewReasons: ['generic_container_reference']
        })
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 191018, item_id: 285, source_type: 'worldgen', source_ref_type: 'world', conditions: 'found in surface Chests' }),
      sourceRow({ id: 194330, item_id: 285, source_type: 'container', source_ref_type: 'container', source_ref_id: 48, source_ref_name: 'Chest' }),
      sourceRow({ id: 194332, item_id: 285, source_type: 'crate', source_ref_type: 'crate', source_ref_id: 2334, source_ref_name: 'Wooden Crate' }),
      sourceRow({ id: 195692, item_id: 3091, source_type: 'worldgen', source_ref_type: 'world', conditions: 'placed in an empty Chest' })
    ],
    allowSourceIds: [191018, 195692]
  });

  assert.equal(plan.summary.candidateRows, 2);
  assert.equal(plan.summary.rowsToDisable, 1);
  assert.equal(plan.summary.blockedRows, 1);
  assert.deepEqual(plan.disableRows.map((row) => row.id), [191018]);
  assert.equal(plan.blockedRows[0].sourceId, 195692);
  assert.equal(plan.blockedRows[0].reason, 'missing_structured_coverage');
});

test('buildCoveredWorldgenTextDisablePlan excludes broad pages and self-source rows even when allowlisted', () => {
  const plan = buildCoveredWorldgenTextDisablePlan({
    auditReport: {
      rows: [
        auditRow({
          sourceId: 199722,
          itemId: 438,
          itemName: 'Star Statue',
          sourcePage: 'Statues',
          classification: 'needs_review',
          reviewReasons: ['generic_container_reference']
        }),
        auditRow({
          sourceId: 194994,
          itemId: 306,
          itemName: 'Gold Chest',
          sourcePage: 'Gold Chest',
          classification: 'needs_review',
          reviewReasons: ['self_source_match']
        })
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 199722, item_id: 438, source_type: 'worldgen', source_ref_type: 'world', conditions: 'found underground' }),
      sourceRow({ id: 194994, item_id: 306, source_type: 'worldgen', source_ref_type: 'world', conditions: 'naturally-generated chest' }),
      sourceRow({ id: 200000, item_id: 438, source_type: 'container', source_ref_type: 'container', source_ref_id: 48, source_ref_name: 'Chest' }),
      sourceRow({ id: 200001, item_id: 306, source_type: 'resource', source_ref_type: 'biome_wikitext', source_ref_name: 'From terrain' })
    ],
    allowSourceIds: [199722, 194994]
  });

  assert.equal(plan.summary.candidateRows, 2);
  assert.equal(plan.summary.rowsToDisable, 0);
  assert.deepEqual(plan.blockedRows.map((row) => row.reason), ['broad_worldgen_context', 'self_source_match']);
});

test('buildFinalExceptionRepairPlan inserts Red Potion special-world Chest source and disables old text row', () => {
  const plan = buildFinalExceptionRepairPlan({
    batchId: 'test-batch',
    auditReport: {
      rows: [
        auditRow({
          sourceId: 192505,
          itemId: 678,
          itemName: 'Red Potion',
          sourcePage: 'Red Potion',
          classification: 'needs_review',
          reviewReasons: ['generic_container_reference'],
          matchedSources: [
            { id: 48, name: 'Chest', sourceType: 'container', sourceRefType: 'container' }
          ]
        })
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 192505, item_id: 678, source_type: 'worldgen', source_ref_type: 'world', conditions: 'found in chests in special worlds' })
    ]
  });

  assert.equal(plan.summary.candidateRows, 1);
  assert.equal(plan.summary.rowsToDisable, 1);
  assert.equal(plan.summary.rowsToInsert, 1);
  assert.equal(plan.summary.blockedRows, 0);
  assert.deepEqual(plan.disableRows.map((row) => row.id), [192505]);
  assert.deepEqual(plan.insertRows.map((row) => ({
    itemId: row.itemId,
    sourceType: row.sourceType,
    sourceRefType: row.sourceRefType,
    sourceRefId: row.sourceRefId,
    sourceRefName: row.sourceRefName,
    sourceProvider: row.sourceProvider
  })), [
    {
      itemId: 678,
      sourceType: 'container',
      sourceRefType: 'container',
      sourceRefId: 48,
      sourceRefName: 'Chest',
      sourceProvider: 'repair:item-source-final-exception'
    }
  ]);
  assert.match(plan.insertRows[0].conditions, /drunk world/);
  assert.match(plan.insertRows[0].conditions, /For the Worthy/);
  assert.match(plan.insertRows[0].conditions, /Zenith/);
});

test('buildFinalExceptionRepairPlan skips duplicate Red Potion special-world Chest source', () => {
  const plan = buildFinalExceptionRepairPlan({
    auditReport: {
      rows: [
        auditRow({
          sourceId: 192505,
          itemId: 678,
          itemName: 'Red Potion',
          sourcePage: 'Red Potion',
          classification: 'needs_review',
          reviewReasons: ['generic_container_reference'],
          matchedSources: [
            { id: 48, name: 'Chest', sourceType: 'container', sourceRefType: 'container' }
          ]
        })
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 192505, item_id: 678, source_type: 'worldgen', source_ref_type: 'world', conditions: 'found in chests in special worlds' }),
      sourceRow({ id: 210000, item_id: 678, source_type: 'container', source_ref_type: 'container', source_ref_id: 48, source_ref_name: 'Chest' })
    ]
  });

  assert.equal(plan.summary.rowsToDisable, 1);
  assert.equal(plan.summary.rowsToInsert, 0);
  assert.equal(plan.summary.duplicateStructuredRows, 1);
  assert.deepEqual(plan.duplicateRows.map((row) => row.existingId), [210000]);
});

test('buildFinalExceptionRepairPlan disables Iron Ore mixed text only when structured coverage and blank worldgen remain', () => {
  const plan = buildFinalExceptionRepairPlan({
    auditReport: {
      rows: [
        auditRow({
          sourceId: 195329,
          itemId: 11,
          itemName: 'Iron Ore',
          sourcePage: 'Iron Ore',
          classification: 'blocked',
          reviewReasons: ['no_item_backed_source_match'],
          matchedSources: []
        })
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 193812, item_id: 11, source_type: 'worldgen', source_ref_type: 'world', conditions: null }),
      sourceRow({ id: 195329, item_id: 11, source_type: 'worldgen', source_ref_type: 'world', conditions: 'spawns underground and can be obtained from crates' }),
      sourceRow({ id: 195327, item_id: 11, source_type: 'crate', source_ref_type: 'crate', source_ref_id: 2334, source_ref_name: 'Wooden Crate' }),
      sourceRow({ id: 195301, item_id: 11, source_type: 'drop', source_ref_type: 'npc', source_ref_id: 1, source_ref_name: 'Blue Slime' })
    ]
  });

  assert.equal(plan.summary.candidateRows, 1);
  assert.equal(plan.summary.rowsToDisable, 1);
  assert.equal(plan.summary.rowsToInsert, 0);
  assert.equal(plan.summary.blockedRows, 0);
  assert.deepEqual(plan.disableRows.map((row) => row.id), [195329]);
});

test('buildFinalExceptionRepairPlan blocks Iron Ore without blank worldgen marker', () => {
  const plan = buildFinalExceptionRepairPlan({
    auditReport: {
      rows: [
        auditRow({
          sourceId: 195329,
          itemId: 11,
          itemName: 'Iron Ore',
          sourcePage: 'Iron Ore',
          classification: 'blocked',
          reviewReasons: ['no_item_backed_source_match'],
          matchedSources: []
        })
      ]
    },
    existingSourceRows: [
      sourceRow({ id: 195329, item_id: 11, source_type: 'worldgen', source_ref_type: 'world', conditions: 'spawns underground and can be obtained from crates' }),
      sourceRow({ id: 195327, item_id: 11, source_type: 'crate', source_ref_type: 'crate', source_ref_id: 2334, source_ref_name: 'Wooden Crate' })
    ]
  });

  assert.equal(plan.summary.rowsToDisable, 0);
  assert.equal(plan.summary.blockedRows, 1);
  assert.equal(plan.blockedRows[0].reason, 'missing_blank_worldgen_marker');
});

test('buildBlankWorldgenMarkerCleanupPlan disables allowlisted empty item 43 worldgen marker when structured sources cover it', () => {
  const plan = buildBlankWorldgenMarkerCleanupPlan({
    existingSourceRows: [
      sourceRow({ id: 193016, item_id: 43, source_type: 'worldgen', source_ref_type: 'world', source_ref_name: 'Suspicious Looking Eye worldgen', conditions: null, notes: null }),
      sourceRow({ id: 199772, item_id: 43, source_type: 'container', source_ref_type: 'container', source_ref_id: 680, source_ref_name: 'Ivy Chest' }),
      sourceRow({ id: 199773, item_id: 43, source_type: 'container', source_ref_type: 'container', source_ref_id: 306, source_ref_name: 'Gold Chest' })
    ],
    allowSourceIds: [193016]
  });

  assert.equal(plan.summary.candidateRows, 1);
  assert.equal(plan.summary.rowsToDisable, 1);
  assert.equal(plan.summary.blockedRows, 0);
  assert.deepEqual(plan.disableRows.map((row) => row.id), [193016]);
  assert.equal(plan.disableRows[0].reason, 'blank_worldgen_marker_covered_by_structured_sources');
});

test('buildBlankWorldgenMarkerCleanupPlan blocks non-empty markers and markers without structured coverage', () => {
  const plan = buildBlankWorldgenMarkerCleanupPlan({
    existingSourceRows: [
      sourceRow({ id: 193016, item_id: 43, source_type: 'worldgen', source_ref_type: 'world', source_ref_name: 'Suspicious Looking Eye worldgen', conditions: 'found in chests', notes: null }),
      sourceRow({ id: 193017, item_id: 44, source_type: 'worldgen', source_ref_type: 'world', source_ref_name: 'Other worldgen', conditions: null, notes: null })
    ],
    allowSourceIds: [193016, 193017]
  });

  assert.equal(plan.summary.candidateRows, 2);
  assert.equal(plan.summary.rowsToDisable, 0);
  assert.deepEqual(plan.blockedRows.map((row) => row.reason), [
    'non_blank_worldgen_marker',
    'missing_structured_coverage'
  ]);
});

test('parseWorldgenContainerSourcePollutionRepairArgs requires explicit apply safety flags', () => {
  assert.throws(
    () => parseWorldgenContainerSourcePollutionRepairArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  assert.throws(
    () => parseWorldgenContainerSourcePollutionRepairArgs(['--apply=true', '--confirm-local-compat=true']),
    /requires --allow-bulk=true/
  );

  const options = parseWorldgenContainerSourcePollutionRepairArgs([
    '--apply=true',
    '--confirm-local-compat=true',
    '--allow-bulk=true',
    '--database=terria_v1_local'
  ]);
  assert.equal(options.apply, true);
  assert.equal(options.confirmLocalCompat, true);
  assert.equal(options.allowBulk, true);
});

test('parseWorldgenContainerSourcePollutionRepairArgs rejects non-local apply databases', () => {
  assert.throws(
    () => parseWorldgenContainerSourcePollutionRepairArgs([
      '--apply=true',
      '--confirm-local-compat=true',
      '--allow-bulk=true',
      '--database=prod'
    ]),
    /Refusing worldgen container source pollution repair apply to non-local database: prod/
  );
});

function auditRow43(overrides = {}) {
  return auditRow({
    sourceId: 196368,
    itemId: 43,
    itemName: 'Suspicious Looking Eye',
    sourcePage: 'Suspicious Looking Eye',
    conditions: 'found in Ivy Chests and Gold Chests',
    matchedSources: [
      { id: 680, name: 'Ivy Chest', sourceType: 'container', sourceRefType: 'container' },
      { id: 306, name: 'Gold Chest', sourceType: 'container', sourceRefType: 'container' }
    ],
    ...overrides
  });
}

function auditRow(overrides = {}) {
  return {
    sourceId: 1,
    itemId: 1,
    itemName: 'Test Item',
    sourceType: 'worldgen',
    sourceRefType: 'world',
    sourceRefName: 'Test Item worldgen',
    sourcePage: 'Test Item',
    conditions: 'found in Chests',
    notes: null,
    classification: 'auto_fixable',
    reviewReasons: [],
    matchedSources: [],
    ...overrides
  };
}

function sourceRow(overrides = {}) {
  return {
    id: 1,
    item_id: 1,
    source_type: 'worldgen',
    source_ref_type: 'world',
    source_ref_id: null,
    source_ref_name: null,
    status: 1,
    deleted: 0,
    ...overrides
  };
}
