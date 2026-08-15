import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { RECORDED_DOMAIN_SOURCES, runRecordedDomainAutoIngestion } from './recorded-domain-auto-ingestion.mjs';

test('all remaining domains use approved downloaded JSON sources', () => {
  for (const domain of ['boss', 'projectile', 'buff', 'biome', 'npc']) {
    assert.ok(RECORDED_DOMAIN_SOURCES[domain]?.length >= 1);
    assert.ok(RECORDED_DOMAIN_SOURCES[domain].every((source) => source.endsWith('.json')));
  }
});

test('recorded domain executor materializes bounded responses and passes them to the domain runner', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recorded-domain-'));
  const source = path.join(repoRoot, 'data/generated/domain.json');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, JSON.stringify({ records: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
  const markerRoot = path.join(repoRoot, 'marker'); fs.mkdirSync(markerRoot, { recursive: true });
  const marker = path.join(markerRoot, '.terrapedia-recorded-response-root');
  fs.writeFileSync(marker, 'terrapedia-recorded-response-root-v1\n', { mode: 0o600 });
  let invocation;
  const result = runRecordedDomainAutoIngestion({
    domain: 'buff', repoRoot, markerRoot, sourcePaths: ['data/generated/domain.json'], limit: 2,
    runner: (options) => { invocation = options; return { imported: 2 }; },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.selectedRecords, 2);
  assert.equal(invocation.selectedRecords, 2);
  assert.equal(invocation.recordedResponses[0].request.networkAccess, false);
  assert.deepEqual(invocation.result, undefined);
});

test('recorded domain executor rejects production or network sources', () => {
  assert.throws(() => runRecordedDomainAutoIngestion({ domain: 'armor_sets', runner: () => {} }), /unsupported/);
});
