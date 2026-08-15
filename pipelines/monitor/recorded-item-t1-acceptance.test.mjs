import assert from 'node:assert/strict';
import test from 'node:test';
import { buildItemT1AcceptanceReport } from './recorded-item-t1-acceptance.mjs';

test('Item T1 acceptance report requires matching ingestion/readback counts and zero cleanup', () => {
  const evidence = {
    identity: { runId: 'item-t1-01' }, progress: { status: 'completed', actionId: 'crawler-queue-v2-fixture' },
    itemIngestion: { itemCount: 3, maintCount: 3, relationCount: 3, unresolvedIdentities: 0 },
    itemDbReadback: { itemRows: 3, maintRows: 3, relationRows: 3, unresolvedIdentities: 0 },
    cleanup: { databases: 0, credentials: 0, redisKeys: 0, ports: 0, files: 0, permits: 0 },
  };
  const report = buildItemT1AcceptanceReport(evidence);
  assert.equal(report.status, 'passed');
  assert.equal(report.networkAccess, false);
  assert.throws(() => buildItemT1AcceptanceReport({ ...evidence, itemDbReadback: { ...evidence.itemDbReadback, relationRows: 2 } }), /readback/);
  assert.throws(() => buildItemT1AcceptanceReport({ ...evidence, cleanup: { ...evidence.cleanup, databases: 1 } }), /cleanup/);
});
