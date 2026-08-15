import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildItemCanonicalCandidateSet,
  writeItemCanonicalCandidateArtifacts,
} from './generate-canonical-candidates.mjs';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

test('buildItemCanonicalCandidateSet uses item landing inputs and produces consistency summary', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-canonical-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');

  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'module__iteminfo__data.latest.json'), {
    moduleTitle: 'Module:Iteminfo/data',
    pageTitle: 'Module:Iteminfo/data',
    fetchedAt: '2026-05-06T08:00:00.000Z',
    revisionTimestamp: '2026-05-06T07:00:00.000Z',
    items: {
      1: { internalName: 'IronPickaxe', name: 'Iron Pickaxe' },
    },
  });
  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'item-pages', 'iron-pickaxe.latest.json'), {
    itemInternalName: 'IronPickaxe',
    pageTitle: 'Iron Pickaxe',
    fetchedAt: '2026-05-06T08:10:00.000Z',
    revisionTimestamp: '2026-05-06T07:10:00.000Z',
    infobox: { type: 'tool' },
  });

  const result = await buildItemCanonicalCandidateSet({
    repoRoot,
    sharedDataRoot,
    now: new Date('2026-05-06T09:00:00.000Z'),
  });

  assert.equal(result.domain, 'item');
  assert.equal(result.candidates.length, 2);
  assert.equal(result.summary.totalLandingInputs, 2);
  assert.equal(result.summary.coverageRate, 1);
  assert.equal(result.summary.hashMatchRate, 1);
  assert.deepEqual(result.summary.schemaViolations, []);

  const itemPageCandidate = result.candidates.find((candidate) => candidate.dataset_type === 'item_pages_raw');
  assert.equal(itemPageCandidate.source_page, 'Iron Pickaxe');
  assert.equal(itemPageCandidate.domain, 'item');
});

test('writeItemCanonicalCandidateArtifacts writes reports under reports/canonical/candidates/item', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-canonical-report-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const reportRoot = path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item');
  const candidateSet = {
    domain: 'item',
    generatedAt: '2026-05-06T09:00:00.000Z',
    candidates: [
      {
        canonical_version: 'v1',
        domain: 'item',
        dataset_type: 'items_raw',
        candidate_generated_at: '2026-05-06T09:00:00.000Z',
        source_landing_id: 'landing:items_raw:terraria.wiki.gg:wiki.module.iteminfo:Module%3AIteminfo%2Fdata',
        source_provider: 'terraria.wiki.gg',
        source_key: 'wiki.module.iteminfo',
        source_page: 'Module:Iteminfo/data',
        source_revision_timestamp: '2026-05-06T07:00:00.000Z',
        source_content_hash: 'a'.repeat(64),
        content_hash: 'a'.repeat(64),
        payload: { ok: true },
      },
    ],
    summary: {
      totalLandingInputs: 1,
      totalCandidates: 1,
      coverageRate: 1,
      hashMatchRate: 1,
      schemaViolations: [],
    },
  };

  const artifactPaths = await writeItemCanonicalCandidateArtifacts(candidateSet, { repoRoot });
  const candidatesJson = JSON.parse(await fs.readFile(artifactPaths.candidatesPath, 'utf8'));
  const summaryJson = JSON.parse(await fs.readFile(artifactPaths.summaryPath, 'utf8'));
  const payloadFiles = await fs.readdir(artifactPaths.payloadDir);
  const payloadJson = JSON.parse(
    await fs.readFile(path.join(artifactPaths.payloadDir, payloadFiles[0]), 'utf8')
  );

  assert.match(artifactPaths.candidatesPath, /reports[\\/]canonical[\\/]candidates[\\/]item[\\/]canonical-candidates\.json$/);
  assert.match(artifactPaths.summaryPath, /reports[\\/]canonical[\\/]candidates[\\/]item[\\/]canonical-summary\.json$/);
  assert.match(artifactPaths.payloadDir, /reports[\\/]canonical[\\/]candidates[\\/]item[\\/]payloads$/);
  assert.equal(candidatesJson.domain, 'item');
  assert.equal(summaryJson.hashMatchRate, 1);
  assert.equal(summaryJson.payloadDirectory, 'payloads');
  assert.equal(candidatesJson.candidates[0].payload, undefined);
  assert.match(candidatesJson.candidates[0].payload_file, /^payloads\//);
  assert.deepEqual(payloadJson, { ok: true });
  assert.equal(path.dirname(artifactPaths.candidatesPath), reportRoot);
});
