import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  applyBuffLandingMutation,
  buildBuffLandingInsertPlan,
} from './buff-bounded-landing-mutation.mjs';

const MODULE_REVISION = '2026-08-22T05:46:54Z';

function payload(overrides = {}) {
  return {
    sourcePageTitle: 'Template:GetBuffInfo',
    sourceRevisionTimestamp: MODULE_REVISION,
    fetchedAt: '2026-09-29T01:00:00.000Z',
    totalBuffs: 1,
    buffs: [{
      id: 24,
      internalName: 'OnFire',
      englishName: 'On Fire!',
      type: 'debuff',
      sourceEvidence: {
        canonicalPageTitle: 'On Fire!',
        revisionId: 954224,
        revisionTimestamp: '2026-01-03T06:22:18Z',
        parseStatus: 'parsed',
        factGroups: {},
      },
    }],
    ...overrides,
  };
}

function landing(overrides = {}) {
  const body = payload(overrides.payload);
  return {
    id: null,
    dataset_type: 'buffs_raw',
    provider: 'terraria.wiki.gg',
    source_kind: 'buff-page-immunity-evidence',
    source_key: 'canonical.buff-page-immunity.b1-a63-20260929-07',
    source_locator: 'reports/authorization/canonical/buff-source.b1-a63-20260929-07.json',
    source_page: 'Template:GetBuffInfo',
    source_revision_timestamp: MODULE_REVISION,
    content_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    payload_json: JSON.stringify(body),
    fetched_at: '2026-09-29 01:00:00',
    parsed_at: '2026-09-29 01:00:00',
    parse_status: 'ok',
    artifact_role: 'source_evidence',
    producer_id: 'canonical-buff-page-immunity-refresh',
    producer_version: '1',
    producer_run_key: 'b1-a63-20260929-07',
    is_current: 1,
    ...overrides,
  };
}

test('Buff landing plan requires a fresh namespace and binds exact source hashes/revisions', () => {
  const row = landing();
  const plan = buildBuffLandingInsertPlan({
    landingRow: row,
    sourceEvidenceHash: `sha256:${'a'.repeat(64)}`,
    runId: 'b1-a63-20260929-07',
  });

  assert.equal(plan.schemaVersion, 'buff-landing-mutation/v1');
  assert.equal(plan.executable, true);
  assert.equal(plan.write.database, 'terria_v1_local');
  assert.equal(plan.write.table, 'source_dataset_landings');
  assert.equal(plan.write.mode, 'insert-only');
  assert.equal(plan.landing.source_key, row.source_key);
  assert.equal(plan.landing.content_hash, row.content_hash);
  assert.equal(plan.landing.source_revision_timestamp, MODULE_REVISION);
  assert.equal(plan.sourceEvidenceHash, `sha256:${'a'.repeat(64)}`);
  assert.equal(plan.landing.id, undefined);
});

test('Buff landing plan rejects historical keys, allocated IDs, hash drift, and revision drift', () => {
  const cases = [
    [row => ({ ...row, source_key: 'wiki.buffs.legacy' }), /namespace|source key/i],
    [row => ({ ...row, id: 12436 }), /allocated|id/i],
    [row => ({ ...row, content_hash: 'f'.repeat(64) }), /content hash/i],
    [row => ({ ...row, source_revision_timestamp: '2026-08-23 00:00:00' }), /revision/i],
    [row => ({ ...row, source_key: 'canonical.buff-page-immunity.other-run' }), /run|namespace/i],
  ];
  for (const [alter, expected] of cases) {
    assert.throws(() => buildBuffLandingInsertPlan({
      landingRow: alter(landing()),
      sourceEvidenceHash: `sha256:${'a'.repeat(64)}`,
      runId: 'b1-a63-20260929-07',
    }), expected);
  }
});

test('Buff landing apply inserts only after locking the exact namespace and returns the real landing ID', async () => {
  const db = fakeDb();
  const plan = buildBuffLandingInsertPlan({
    landingRow: landing(),
    sourceEvidenceHash: `sha256:${'a'.repeat(64)}`,
    runId: 'b1-a63-20260929-07',
  });
  const result = await applyBuffLandingMutation({
    connection: db,
    plan,
    transactionContext: { transactionActive: true, fenceHeld: true },
  });

  assert.equal(result.landingId, 13001);
  assert.equal(result.row.id, 13001);
  assert.deepEqual(db.statements.map(({ kind }) => kind), ['lock', 'insert', 'readback']);
  assert.equal(db.statements.some(({ kind }) => ['ddl', 'update', 'delete'].includes(kind)), false);
});

test('Buff landing apply normalizes ISO revision timestamps for MySQL DATETIME', async () => {
  const db = fakeDb();
  const plan = buildBuffLandingInsertPlan({
    landingRow: landing(),
    sourceEvidenceHash: `sha256:${'a'.repeat(64)}`,
    runId: 'b1-a63-20260929-07',
  });
  await applyBuffLandingMutation({
    connection: db,
    plan,
    transactionContext: { transactionActive: true, fenceHeld: true },
  });
  const insert = db.statements.find(({ kind }) => kind === 'insert');
  assert.equal(insert.values[6], '2026-08-22 05:46:54');
});

test('Buff landing apply rejects an existing namespace before INSERT', async () => {
  const db = fakeDb({ existing: [{ id: 12435, source_key: 'canonical.buff-page-immunity.b1-a63-20260929-07' }] });
  const plan = buildBuffLandingInsertPlan({
    landingRow: landing(),
    sourceEvidenceHash: `sha256:${'a'.repeat(64)}`,
    runId: 'b1-a63-20260929-07',
  });
  await assert.rejects(
    applyBuffLandingMutation({ connection: db, plan, transactionContext: { transactionActive: true, fenceHeld: true } }),
    /already exists|overwrite/i,
  );
  assert.equal(db.statements.some(({ kind }) => kind === 'insert'), false);
});

function fakeDb({ existing = [] } = {}) {
  const statements = [];
  return {
    statements,
    async execute(sql, values) {
      if (/^SELECT .*WHERE id = \?\s+FOR UPDATE/s.test(sql)) {
        statements.push({ kind: 'readback', sql, values });
        return [[{ id: 13001, source_key: 'canonical.buff-page-immunity.b1-a63-20260929-07', content_hash: landing().content_hash, source_revision_timestamp: '2026-08-22 05:46:54', dataset_type: 'buffs_raw', provider: 'terraria.wiki.gg', source_page: 'Template:GetBuffInfo', is_current: 1 }], []];
      }
      if (/^SELECT .*FOR UPDATE/s.test(sql)) {
        statements.push({ kind: 'lock', sql, values });
        return [existing, []];
      }
      if (/^INSERT INTO/s.test(sql)) {
        statements.push({ kind: 'insert', sql, values });
        return [{ affectedRows: 1, insertId: 13001 }, []];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}
