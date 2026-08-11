import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildItemGroupCompatibilityPublication,
  buildItemGroupCompatibilityPublicationFromSnapshot,
  writeItemGroupCompatibilityPublication,
} from './item-group-compatibility-publish.mjs';

const repoRoot = path.resolve(new URL('../../..', import.meta.url).pathname);

function fixture() {
  const priorPublication = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'reports/canonical-migration/item-group-compatibility-export.json'),
    'utf8',
  ));
  const bootstrapResult = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'reports/authorization/canonical/canonical-item-group-bootstrap.result.json'),
    'utf8',
  ));
  const cutoverReport = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'reports/canonical-migration/item-group-cutover-verification.json'),
    'utf8',
  ));
  const recipeEvidence = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'data/generated/recipe-material-reference.json'),
    'utf8',
  ));
  return { priorPublication, bootstrapResult, cutoverReport, recipeEvidence };
}

test('publication keeps runtime and compatibility identities distinct and exact', () => {
  const { priorPublication, bootstrapResult, cutoverReport, recipeEvidence } = fixture();
  const publication = buildItemGroupCompatibilityPublicationFromSnapshot({
    canonicalSnapshot: priorPublication.canonicalSnapshot,
    priorReadinessEvidence: priorPublication.readinessEvidence,
    recipeEvidence,
    bootstrapResult,
    cutoverReport,
    exportRunKey: 'ig-export-20260729-01',
    generatedAt: '2026-07-29T04:00:00.000Z',
  });

  assert.equal(publication.summary.status, 'pass');
  assert.equal(publication.runtimeSnapshotHash, bootstrapResult.runtimeSnapshotHash);
  assert.equal(publication.compatibilitySnapshotHash, bootstrapResult.compatibilitySnapshotHash);
  assert.notEqual(publication.runtimeSnapshotHash, publication.compatibilitySnapshotHash);
  assert.equal(publication.readinessEvidence.hashes.local, publication.runtimeSnapshotHash);
  assert.equal(publication.readinessEvidence.hashes.compatibility, publication.compatibilitySnapshotHash);
  assert.deepEqual(publication.exports.map((entry) => entry.snapshotHash), [
    publication.compatibilitySnapshotHash,
    publication.compatibilitySnapshotHash,
    publication.compatibilitySnapshotHash,
  ]);
});

test('publication blocks cutover, bootstrap, count, or exact hash drift before writing', () => {
  for (const [name, mutate] of [
    ['cutover status', ({ cutoverReport }) => { cutoverReport.status = 'blocked'; }],
    ['bootstrap status', ({ bootstrapResult }) => { bootstrapResult.status = 'failed'; }],
    ['run key', ({ cutoverReport }) => { cutoverReport.bootstrapRunKey = 'other'; }],
    ['runtime hash', ({ cutoverReport }) => { cutoverReport.runtimeSnapshotHash = '0'.repeat(64); }],
    ['compatibility hash', ({ bootstrapResult }) => { bootstrapResult.compatibilitySnapshotHash = '0'.repeat(64); }],
    ['counts', ({ bootstrapResult }) => { bootstrapResult.counts.local.groupCount = 33; }],
  ]) {
    const values = fixture();
    mutate(values);
    assert.throws(() => buildItemGroupCompatibilityPublicationFromSnapshot({
      canonicalSnapshot: values.priorPublication.canonicalSnapshot,
      priorReadinessEvidence: values.priorPublication.readinessEvidence,
      recipeEvidence: values.recipeEvidence,
      bootstrapResult: values.bootstrapResult,
      cutoverReport: values.cutoverReport,
      exportRunKey: 'ig-export-20260729-01',
      generatedAt: '2026-07-29T04:00:00.000Z',
    }), /cutover|bootstrap|run key|hash|counts/i, name);
  }
});

test('publication stages all files and writes one exact export generation', async () => {
  const values = fixture();
  const publication = buildItemGroupCompatibilityPublicationFromSnapshot({
    canonicalSnapshot: values.priorPublication.canonicalSnapshot,
    priorReadinessEvidence: values.priorPublication.readinessEvidence,
    recipeEvidence: values.recipeEvidence,
    bootstrapResult: values.bootstrapResult,
    cutoverReport: values.cutoverReport,
    exportRunKey: 'ig-export-20260729-01',
    generatedAt: '2026-07-29T04:00:00.000Z',
  });
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'item-group-compat-publish-'));
  try {
    await writeItemGroupCompatibilityPublication({ repoRoot: targetRoot, publication });
    for (const entry of publication.exports) {
      const payload = JSON.parse(fs.readFileSync(path.join(targetRoot, entry.path), 'utf8'));
      assert.equal(payload.artifactRole, 'compat_export');
      assert.equal(payload.exportRunKey, publication.exportRunKey);
      assert.equal(payload.canonicalSnapshotHash, publication.compatibilitySnapshotHash);
    }
    const report = JSON.parse(fs.readFileSync(
      path.join(targetRoot, 'reports/canonical-migration/item-group-compatibility-export.json'),
      'utf8',
    ));
    assert.equal(report.summary.status, 'pass');
    assert.equal(report.exports.every((entry) => entry.fresh === true), true);
    assert.deepEqual(fs.readdirSync(path.join(targetRoot, 'data/generated')).filter((name) => name.endsWith('.tmp')), []);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});
