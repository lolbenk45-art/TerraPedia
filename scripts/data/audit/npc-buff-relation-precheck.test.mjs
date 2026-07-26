import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcBuffRelationPrecheck } from './npc-buff-relation-precheck.mjs';

function stub(value) {
  return async () => [{ total: value }];
}

// Mirrors the live database as measured on 2026-07-26.
const MEASURED = {
  queryRelationInflictsCount: stub(124),
  queryLocalCount: stub(112),
  queryRelationWithoutLocalCount: stub(31),
  queryLocalWithoutRelationCount: stub(20),
};

test('precheck passes on the measured live shape, treating projection drift as a warning', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
  });

  assert.equal(report.status, 'warning');
  assert.equal(report.requiresDatabase, true);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.enrichmentMaterialized, true);
  assert.deepEqual(report.blockingReasons, []);
  assert.equal(report.warningReasons.length, 2);
  assert.match(report.warningReasons[0], /31 relation inflicts row\(s\) have no local counterpart/);
  assert.match(report.warningReasons[1], /20 local row\(s\) have no relation counterpart/);
});

test('precheck passes cleanly when the projection is in sync', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    queryRelationInflictsCount: stub(124),
    queryLocalCount: stub(124),
    queryRelationWithoutLocalCount: stub(0),
    queryLocalWithoutRelationCount: stub(0),
  });

  assert.equal(report.status, 'pass');
  assert.deepEqual(report.warningReasons, []);
});

test('precheck blocks when local holds no enrichment at all', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryLocalCount: stub(0),
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.enrichmentMaterialized, false);
  assert.match(report.blockingReasons[0], /local\.npc_buff_relations is empty/i);
});

test('precheck blocks when relation holds no inflicts rows at all', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryRelationInflictsCount: stub(0),
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /no active inflicts rows/i);
});

test('precheck does not compare totals, so immune rows cannot cause a false block', async () => {
  // The live relation table holds 1141 immune rows that local intentionally never projects.
  // Only the inflicts count is passed in, so there is no total-vs-total comparison to get wrong.
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
  });

  assert.equal(report.relationInflictsCount, 124);
  assert.equal(report.localCount, 112);
  assert.equal(report.blockingReasons.length, 0);
});

test('precheck fails closed on a non-finite count rather than treating it as zero', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryLocalCount: stub(null),
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /non-finite/i);
});

test('precheck fails closed when a query throws instead of reporting pass', async () => {
  const report = await buildNpcBuffRelationPrecheck({
    generatedAt: '2026-07-26T00:00:00Z',
    ...MEASURED,
    queryLocalCount: async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:13306');
    },
  });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /ECONNREFUSED/);
});
