import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  captureArmorCanonicalFenceCommitSnapshot,
  writeArmorCanonicalFenceCommitCapture,
} from './capture-armor-canonical-fence-commit.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARMOR_CANONICAL_POLICY_OWNER_SCOPES } from './armor-canonical-write-fence.mjs';

const HASH = (char) => `sha256:${char.repeat(64)}`;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function fakeReadOnlyConnection({ activeFenceAt = -1, duplicateGenerationAt = -1, missingGenerationAt = -1 } = {}) {
  const calls = [];
  const connection = {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('@@server_uuid')) return [[{ serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf', serverPort: 13306, databaseName: 'terria_v1_local' }]];
      if (sql.includes('crawler_automation_mutation_generation')) {
        const index = calls.filter(call => call.sql.includes('crawler_automation_mutation_generation')).length - 1;
        if (index === missingGenerationAt) return [[]];
        const row = { generation: index + 2, schema_hash: HASH('a') };
        return [[...(index === duplicateGenerationAt ? [row, { ...row }] : [row])]];
      }
      if (sql.includes('crawler_automation_write_fence')) {
        const index = calls.filter(call => call.sql.includes('crawler_automation_write_fence')).length - 1;
        return [[...(index === activeFenceAt ? [{ latest_run_id: 'other-run', fence_token: 'fence:other', active: 1 }] : [])]];
      }
      return [[]];
    },
  };
  return connection;
}

test('captures exact read-only generations and produces a bound nine-scope Armor commit', async () => {
  const connection = fakeReadOnlyConnection();
  const result = await captureArmorCanonicalFenceCommitSnapshot({
    connection,
    runId: 'armor-run-09',
    expiresAt: '2030-10-27T10:00:00Z',
    capturedAt: '2030-10-27T09:30:00Z',
    tokenFactory: (() => { let index = 0; return () => `fence:${String(++index).padStart(64, '0')}`; })(),
    markerFactory: (() => { let index = 0; return () => String(++index).padStart(64, '0'); })(),
  });

  assert.equal(result.schemaVersion, 'armor-fence-commit-capture/v1');
  assert.equal(result.serverFingerprint.serverUuid, 'b4ae6728-4f72-11f1-bcc9-00155d37eadf');
  assert.equal(result.fenceCommit.bindings.length, ARMOR_CANONICAL_POLICY_OWNER_SCOPES.length);
  assert.deepEqual(result.fenceCommit.bindings.map(row => row.beforeGeneration), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(connection.calls.every(call => !/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|TRUNCATE)\b/i.test(call.sql)));
});

test('rejects an active writer in any one Armor owner scope', async () => {
  const connection = fakeReadOnlyConnection({ activeFenceAt: 4 });
  await assert.rejects(() => captureArmorCanonicalFenceCommitSnapshot({
    connection, runId: 'armor-run-10', expiresAt: '2030-10-27T10:00:00Z', capturedAt: '2030-10-27T09:30:00Z',
  }), /active writer/i);
});

test('treats a missing zero-generation row as a baseline and rejects duplicate/malformed state', async () => {
  const connection = fakeReadOnlyConnection({ missingGenerationAt: 2 });
  const captured = await captureArmorCanonicalFenceCommitSnapshot({
    connection, runId: 'armor-run-11a', expiresAt: '2030-10-27T10:00:00Z', capturedAt: '2030-10-27T09:30:00Z',
  });
  assert.equal(captured.generationReadbacks[2].generation, 0);
  assert.match(captured.fenceCommit.bindings[2].generationSchemaHash, /^sha256:[a-f0-9]{64}$/);

  await assert.rejects(() => captureArmorCanonicalFenceCommitSnapshot({
    connection: fakeReadOnlyConnection({ duplicateGenerationAt: 2 }),
    runId: 'armor-run-11b', expiresAt: '2030-10-27T10:00:00Z', capturedAt: '2030-10-27T09:30:00Z',
  }), /duplicated/i);
  await assert.rejects(() => captureArmorCanonicalFenceCommitSnapshot({
    connection: fakeReadOnlyConnection(), runId: 'armor-run-11c', expiresAt: 'not-a-date', capturedAt: '2030-10-27T09:30:00Z',
  }), /expiresAt/i);
});

test('rejects unsafe run IDs, impossible timestamps, and overlong expiries before reading MySQL', async () => {
  for (const options of [
    { runId: '../outside', capturedAt: '2030-10-27T09:30:00Z', expiresAt: '2030-10-27T10:00:00Z' },
    { runId: 'armor-run-invalid-date', capturedAt: '2030-02-30T09:30:00Z', expiresAt: '2030-03-03T10:00:00Z' },
    { runId: 'armor-run-long-expiry', capturedAt: '2030-10-27T09:30:00Z', expiresAt: '2030-11-04T09:30:00Z' },
  ]) {
    const connection = fakeReadOnlyConnection();
    await assert.rejects(() => captureArmorCanonicalFenceCommitSnapshot({ connection, ...options }), /runId|invalid|bounded/i, JSON.stringify(options));
    assert.equal(connection.calls.length, 0);
  }
});

test('writes a private no-overwrite capture artifact', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-fence-capture-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const capture = await captureArmorCanonicalFenceCommitSnapshot({
    connection: fakeReadOnlyConnection(), runId: 'armor-run-12',
    expiresAt: '2030-10-27T10:00:00Z', capturedAt: '2030-10-27T09:30:00Z',
  });
  const result = writeArmorCanonicalFenceCommitCapture({ repoRoot, capture, now: '2030-10-27T09:45:00Z' });
  const absolute = path.join(repoRoot, result.path);
  assert.equal(fs.statSync(absolute).mode & 0o777, 0o600);
  assert.equal(result.sha256, `sha256:${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`);
  assert.throws(() => writeArmorCanonicalFenceCommitCapture({ repoRoot, capture, now: '2030-10-27T09:45:00Z' }), /already exists|EEXIST/i);
});

test('refuses tampered and expired capture artifacts before publishing them', async (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-fence-capture-validity-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const capture = await captureArmorCanonicalFenceCommitSnapshot({
    connection: fakeReadOnlyConnection(), runId: 'armor-run-validity-01',
    expiresAt: '2030-10-27T10:00:00Z', capturedAt: '2030-10-27T09:30:00Z',
  });
  const tampered = { ...capture, runId: 'armor-run-validity-02' };
  assert.throws(() => writeArmorCanonicalFenceCommitCapture({ repoRoot, capture: tampered, now: '2030-10-27T09:45:00Z' }), /hash|identity/i);
  const driftedReadback = {
    ...capture,
    generationReadbacks: capture.generationReadbacks.map((row, index) => (
      index === 0 ? { ...row, generation: row.generation + 1 } : row
    )),
  };
  const { captureSha256: _previousHash, ...readbackBody } = driftedReadback;
  driftedReadback.captureSha256 = hash(readbackBody);
  assert.throws(() => writeArmorCanonicalFenceCommitCapture({ repoRoot, capture: driftedReadback, now: '2030-10-27T09:45:00Z' }), /readback|generation|binding/i);
  assert.throws(() => writeArmorCanonicalFenceCommitCapture({
    repoRoot, capture, now: '2030-10-27T10:00:00Z',
  }), /expired|expiry|validity/i);
  assert.equal(fs.existsSync(path.join(repoRoot, 'reports/authorization/canonical/armor-fence-captures/armor-run-validity-01.'
    + capture.captureSha256.slice('sha256:'.length) + '.json')), false);
});
