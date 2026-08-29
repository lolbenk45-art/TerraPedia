import test from 'node:test';
import assert from 'node:assert/strict';

import * as partitionModule from './build-item-source-governed-partition.mjs';

const { buildItemSourceGovernedPartition } = partitionModule;

const HASH_A = `sha256:${'a'.repeat(64)}`;

function source(overrides = {}) {
  return {
    sourceType: 'drop',
    sourceRefType: 'npc',
    sourceRefName: 'Blue Slime',
    sourcePage: 'Gel',
    chanceText: '100%',
    quantityText: '1',
    conditions: null,
    resolvedRef: { id: 1, internalName: 'BlueSlime', name: 'Blue Slime' },
    ...overrides
  };
}

function candidate(itemId, itemInternalName, overrides = {}) {
  return {
    itemInternalName,
    itemName: itemInternalName,
    itemResolution: { status: 'resolved', id: itemId, internalName: itemInternalName, name: itemInternalName },
    pageTitle: itemInternalName,
    rawPath: `/raw/${itemInternalName}.json`,
    classification: 'high_confidence',
    plannedSources: [source()],
    ...overrides
  };
}

function plannedRow(itemId, itemInternalName, overrides = {}) {
  return {
    fingerprint: `fingerprint-${itemInternalName}`,
    itemId,
    itemInternalName,
    itemName: itemInternalName,
    sourceType: 'drop',
    sourceRefType: 'npc',
    sourceRefId: 1,
    sourceRefName: 'Blue Slime',
    sourcePage: 'Gel',
    chanceText: '100%',
    quantityText: '1',
    conditions: null,
    ...overrides
  };
}

test('partitions every source row into one exclusive governed lane', () => {
  const traced = candidate(3, 'Traced', {
    plannedSources: [source({
      lineage: {
        rawEvidenceHash: HASH_A,
        maintRecordKey: 'maint-item-source:traced',
        relationRecordKey: 'relation-item-source:traced',
        localItemId: 3
      }
    })]
  });
  const family = candidate(4, 'Family', {
    classification: 'family_page_candidate',
    plannedSources: traced.plannedSources
  });
  const blocked = candidate(5, 'Blocked', {
    blockedReason: 'item_identity_mismatch',
    plannedSources: undefined,
    blockedSources: [source({ blockedReason: 'item_identity_mismatch' })]
  });
  const result = buildItemSourceGovernedPartition({
    candidates: {
      readOnly: true,
      eligibleCandidates: [candidate(1, 'Duplicate'), candidate(2, 'Unproven'), traced, family],
      blockedCandidates: [blocked]
    },
    dryRun: {
      apply: false,
      plannedRows: [
        plannedRow(1, 'Duplicate'),
        plannedRow(2, 'Unproven'),
        plannedRow(3, 'Traced'),
        plannedRow(4, 'Family')
      ],
      skipped: [{ id: 91, fingerprint: 'fingerprint-Duplicate', reason: 'duplicate' }],
      blocked: [],
      validationErrors: []
    },
    generatedAt: '2026-08-24T00:00:00.000Z'
  });

  assert.equal(result.acceptedRows.length, 1);
  assert.equal(result.duplicateRows.length, 1);
  assert.equal(result.quarantineRows.length, 2);
  assert.equal(result.blockedRows.length, 1);
  assert.deepEqual(result.summary, {
    candidateItemCount: 5,
    selectedSourceRowCount: 5,
    accepted: 1,
    duplicates: 1,
    quarantine: 2,
    blocked: 1,
    unclassified: 0,
    candidateItems: {
      accepted: 1,
      duplicates: 1,
      quarantine: 2,
      blocked: 1,
      unclassified: 0
    }
  });
  assert.equal(result.acceptedRows[0].sourceTrace.maintRecordKey, 'maint-item-source:traced');
  assert.equal(result.duplicateRows[0].existingRowId, 91);
  assert.equal(result.quarantineRows[0].reason, 'missing-four-layer-evidence');
  assert.equal(result.quarantineRows[1].reason, 'family_page_candidate');
  assert.equal(result.blockedRows[0].nextAction, 'repair_identity');
  assert.equal(result.acceptedRows[0].sourceIdentity.sourceRefInternalName, 'BlueSlime');
  assert.match(result.acceptedRows[0].sourceIdentityHash, /^sha256:[a-f0-9]{64}$/);
  assert.ok([...result.duplicateRows, ...result.quarantineRows, ...result.blockedRows]
    .every((row) => /^sha256:[a-f0-9]{64}$/.test(row.evidenceHash)));
  assert.equal('accepted' in result, false);
  assert.match(result.scopeHash, /^sha256:[a-f0-9]{64}$/);
});

test('blocks stale item identity instead of accepting its otherwise complete trace', () => {
  const stale = candidate(7, 'ExpectedName', {
    itemResolution: { status: 'resolved', id: 7, internalName: 'DifferentName', name: 'Different Name' },
    plannedSources: [source({
      lineage: {
        rawEvidenceHash: HASH_A,
        maintRecordKey: 'maint-item-source:stale',
        relationRecordKey: 'relation-item-source:stale',
        localItemId: 7
      }
    })]
  });
  const result = buildItemSourceGovernedPartition({
    candidates: { readOnly: true, eligibleCandidates: [stale], blockedCandidates: [] },
    dryRun: {
      apply: false,
      plannedRows: [plannedRow(7, 'ExpectedName')],
      skipped: [],
      blocked: [],
      validationErrors: []
    }
  });

  assert.equal(result.acceptedRows.length, 0);
  assert.equal(result.blockedRows.length, 1);
  assert.equal(result.blockedRows[0].reason, 'item_identity_mismatch');
});

test('rejects duplicate accepted source identities', () => {
  const lineage = {
    rawEvidenceHash: HASH_A,
    maintRecordKey: 'maint-item-source:duplicate',
    relationRecordKey: 'relation-item-source:duplicate',
    localItemId: 8
  };
  const duplicated = candidate(8, 'Duplicated', {
    plannedSources: [source({ lineage }), source({ lineage })]
  });
  assert.throws(
    () => buildItemSourceGovernedPartition({
      candidates: { readOnly: true, eligibleCandidates: [duplicated], blockedCandidates: [] },
      dryRun: {
        apply: false,
        plannedRows: [plannedRow(8, 'Duplicated', { fingerprint: 'one' }), plannedRow(8, 'Duplicated', { fingerprint: 'two' })],
        skipped: [],
        blocked: [],
        validationErrors: []
      }
    }),
    /duplicate accepted source identity/
  );
});

test('rejects non-read-only or internally inconsistent evidence', () => {
  assert.throws(
    () => buildItemSourceGovernedPartition({ candidates: { readOnly: false }, dryRun: { apply: false } }),
    /read-only/
  );
  assert.throws(
    () => buildItemSourceGovernedPartition({
      candidates: { readOnly: true, eligibleCandidates: [], blockedCandidates: [] },
      dryRun: { apply: false, plannedRows: [], skipped: [{ fingerprint: 'missing', reason: 'duplicate' }] }
    }),
    /duplicate fingerprint is absent/
  );
});

test('parses the plan command argument names and preserves compatibility aliases', () => {
  assert.equal(typeof partitionModule.parseBuildItemSourceGovernedPartitionArgs, 'function');
  const { parseBuildItemSourceGovernedPartitionArgs } = partitionModule;
  assert.deepEqual(
    parseBuildItemSourceGovernedPartitionArgs([
      '--candidate-plan=candidates.json',
      '--dry-run-report=dry-run.json',
      '--output=partition.json'
    ]),
    { candidatePlanPath: 'candidates.json', dryRunReportPath: 'dry-run.json', outputPath: 'partition.json' }
  );
  assert.deepEqual(
    parseBuildItemSourceGovernedPartitionArgs([
      '--input=candidates.json',
      '--dryRun=dry-run.json',
      '--output=partition.json'
    ]),
    { candidatePlanPath: 'candidates.json', dryRunReportPath: 'dry-run.json', outputPath: 'partition.json' }
  );
});
