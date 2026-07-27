import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeCanonicalNpcApplyInput } from './build-canonical-npc-apply-input.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function prepareRun() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-npc-apply-input-'));
  const targetsPath = path.join(
    repoRoot,
    'reports/authorization/canonical/canonical-npc-crawler.targets.json',
  );
  const crawlerOutputRoot = path.join(repoRoot, 'data/wiki-crawler');
  const targets = Array.from({ length: 25 }, (_, index) => ({
    pageTitle: `NPC ${index + 1}`,
    entityId: `npc-${index + 1}`,
    targetEntityIds: [`npc-${index + 1}`],
    priority: index < 8 ? 'p0_town' : index < 16 ? 'p0_boss' : index < 20 ? 'p1_friendly' : 'p1_enemy',
  }));
  writeJson(targetsPath, {
    schemaVersion: 1,
    operationId: 'canonical-npc-crawler',
    generatedAt: '2026-07-28T01:00:00.000Z',
    selection: { targetLimit: 25 },
    targets,
  });
  for (const [index, target] of targets.entries()) {
    const normalized = {
      entityId: target.entityId,
      source: { pageTitle: target.pageTitle },
      sourceMetadata: {
        revisionTimestamp: `2026-07-28T01:${String(index).padStart(2, '0')}:00.000Z`,
        fetchedAt: '2026-07-28T02:00:00.000Z',
        parsedAt: '2026-07-28T02:01:00.000Z',
      },
      buffInflictions: [],
      shop: { normalizedRows: [] },
      loot: [],
    };
    const audit = {
      status: 'pass',
      entityId: target.entityId,
      sourcePage: target.pageTitle,
      sourceRevisionTimestamp: normalized.sourceMetadata.revisionTimestamp,
      normalizedContentHash: crypto.createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex'),
      auditedAt: '2026-07-28T02:02:00.000Z',
      reasons: [],
    };
    writeJson(path.join(crawlerOutputRoot, 'normalized-light/npc', `${target.entityId}.latest.json`), normalized);
    writeJson(path.join(crawlerOutputRoot, 'audit/npc', `${target.entityId}.latest.json`), audit);
  }
  return { repoRoot, targetsPath, crawlerOutputRoot, targets };
}

test('NPC apply input freezes only the exact 25 target-derived normalized and audit pairs', () => {
  const fixture = prepareRun();
  const outputPath = path.join(
    fixture.repoRoot,
    'reports/authorization/canonical/canonical-npc-apply.input.json',
  );
  writeJson(path.join(fixture.crawlerOutputRoot, 'normalized-light/npc/historical.latest.json'), '{bad');
  writeJson(path.join(fixture.crawlerOutputRoot, 'audit/npc/historical.latest.json'), '{bad');

  const result = writeCanonicalNpcApplyInput({
    repoRoot: fixture.repoRoot,
    targetsPath: fixture.targetsPath,
    crawlerOutputRoot: fixture.crawlerOutputRoot,
    outputPath,
    generatedAt: '2026-07-28T03:00:00.000Z',
  });

  assert.equal(result.operationId, 'canonical-npc-apply');
  assert.equal(result.pairCount, 25);
  assert.deepEqual(result.evidencePairs.map((pair) => pair.entityId), fixture.targets.map((row) => row.entityId));
  assert.equal(JSON.stringify(result).includes('historical.latest.json'), false);
  assert.deepEqual(result.evidencePairs[0].normalized, {
    path: 'data/wiki-crawler/normalized-light/npc/npc-1.latest.json',
    contentHash: result.evidencePairs[0].normalized.contentHash,
    sizeBytes: result.evidencePairs[0].normalized.sizeBytes,
  });
  assert.match(result.evidencePairs[0].normalized.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), result);
  assert.equal(fs.statSync(outputPath).mode & 0o077, 0);
});

test('NPC apply input fails closed on a missing target pair or mismatched audit', () => {
  const missing = prepareRun();
  fs.rmSync(path.join(missing.crawlerOutputRoot, 'audit/npc/npc-7.latest.json'));
  assert.throws(() => writeCanonicalNpcApplyInput({
    repoRoot: missing.repoRoot,
    targetsPath: missing.targetsPath,
    crawlerOutputRoot: missing.crawlerOutputRoot,
    outputPath: path.join(missing.repoRoot, 'missing.json'),
  }), /npc-7.*audit|audit.*npc-7/i);

  const mismatched = prepareRun();
  const auditPath = path.join(mismatched.crawlerOutputRoot, 'audit/npc/npc-3.latest.json');
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  writeJson(auditPath, { ...audit, entityId: 'different-npc' });
  assert.throws(() => writeCanonicalNpcApplyInput({
    repoRoot: mismatched.repoRoot,
    targetsPath: mismatched.targetsPath,
    crawlerOutputRoot: mismatched.crawlerOutputRoot,
    outputPath: path.join(mismatched.repoRoot, 'mismatch.json'),
  }), /identity/i);
});
