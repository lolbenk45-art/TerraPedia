import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runRecordedItemPageResume } from './recorded-item-page-resume.mjs';

function makeRecords(count = 100) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    internalName: `RecordedItem${index + 1}`,
    name: `Recorded Item ${index + 1}`,
  }));
}

function context() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recorded-item-resume-'));
  return {
    records: makeRecords(),
    statePath: path.join(root, 'progress.json'),
    outputPath: path.join(root, 'pages.json'),
    sourceFingerprint: `sha256:${'a'.repeat(64)}`,
  };
}

test('recorded Item resume fails at record 50, resumes unchanged source, and keeps identities unique', async () => {
  const fixture = context();
  let fetchCalls = 0;

  await assert.rejects(
    () => runRecordedItemPageResume({
      ...fixture,
      failAfter: 50,
      fetchPage: async (record) => {
        fetchCalls += 1;
        return { pageId: 10_000 + record.id, revision: `r-${record.id}` };
      },
    }),
    /interrupted after record 50/,
  );

  const failed = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
  assert.equal(failed.status, 'failed');
  assert.equal(failed.current, 50);
  assert.equal(failed.total, 100);
  assert.equal(failed.inputFingerprint, fixture.sourceFingerprint);
  assert.equal(JSON.parse(fs.readFileSync(fixture.outputPath, 'utf8')).length, 50);
  assert.equal(fetchCalls, 50);

  const resumed = await runRecordedItemPageResume({
    ...fixture,
    resume: true,
    fetchPage: async (record) => {
      fetchCalls += 1;
      return { pageId: 10_000 + record.id, revision: `r-${record.id}` };
    },
  });

  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.current, 100);
  assert.equal(fetchCalls, 100);
  const pages = JSON.parse(fs.readFileSync(fixture.outputPath, 'utf8'));
  assert.equal(pages.length, 100);
  assert.equal(new Set(pages.map((page) => page.internalName)).size, 100);
  assert.equal(new Set(pages.map((page) => page.pageId)).size, 100);
});

test('recorded Item resume rejects a changed source fingerprint before fetching or writing', async () => {
  const fixture = context();
  await assert.rejects(
    () => runRecordedItemPageResume({
      ...fixture,
      failAfter: 50,
      fetchPage: async (record) => ({ pageId: 10_000 + record.id, revision: `r-${record.id}` }),
    }),
    /interrupted after record 50/,
  );
  const beforeState = fs.readFileSync(fixture.statePath);
  const beforeOutput = fs.readFileSync(fixture.outputPath);
  let fetchCalls = 0;

  await assert.rejects(
    () => runRecordedItemPageResume({
      ...fixture,
      resume: true,
      sourceFingerprint: `sha256:${'b'.repeat(64)}`,
      fetchPage: async () => { fetchCalls += 1; return { pageId: 1, revision: 'changed' }; },
    }),
    /fingerprint-mismatch/,
  );

  assert.equal(fetchCalls, 0);
  assert.deepEqual(fs.readFileSync(fixture.statePath), beforeState);
  assert.deepEqual(fs.readFileSync(fixture.outputPath), beforeOutput);
});

test('recorded Item resume rejects duplicate page identities in the partial output', async () => {
  const fixture = context();
  await assert.rejects(
    () => runRecordedItemPageResume({
      ...fixture,
      failAfter: 2,
      fetchPage: async (record) => ({ pageId: 10_000 + record.id, revision: `r-${record.id}` }),
    }),
    /interrupted after record 2/,
  );
  const pages = JSON.parse(fs.readFileSync(fixture.outputPath, 'utf8'));
  pages[1].pageId = pages[0].pageId;
  fs.writeFileSync(fixture.outputPath, `${JSON.stringify(pages)}\n`, { mode: 0o600 });

  await assert.rejects(
    () => runRecordedItemPageResume({
      ...fixture,
      resume: true,
      fetchPage: async (record) => ({ pageId: 10_000 + record.id, revision: `r-${record.id}` }),
    }),
    /duplicate page identity/,
  );
});
