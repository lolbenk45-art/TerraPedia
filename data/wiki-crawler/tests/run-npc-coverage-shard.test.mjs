import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runNpcCoverageShard } from '../src/coverage/run-npc-coverage-shard.mjs';

test('runNpcCoverageShard writes a reusable shard file from a coverage audit report', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-coverage-shard-'));
  const coverageAuditPath = path.join(tempRoot, 'coverage-audit.latest.json');
  const outputRoot = path.join(tempRoot, 'wiki-crawler');

  await fs.writeFile(coverageAuditPath, JSON.stringify({
    eligibleBatchTargets: [
      { pageTitle: 'Zombie', priority: 'p1_enemy', variantCount: 36, standardizedRecords: new Array(36).fill({ id: 1 }) },
      { pageTitle: 'Skeleton', priority: 'p1_enemy', variantCount: 19, standardizedRecords: new Array(19).fill({ id: 2 }) },
      { pageTitle: 'Merchant', priority: 'p0_town', variantCount: 1, standardizedRecords: [{ id: 17 }] }
    ]
  }, null, 2));

  const result = await runNpcCoverageShard({
    coverageAuditPath,
    outputRoot,
    priority: 'p1_enemy',
    limit: 1
  });

  assert.ok(result.shardPath);
  assert.equal(result.shard.summary.selectedTargets, 1);
  const shard = JSON.parse(await fs.readFile(result.shardPath, 'utf8'));
  assert.equal(shard.eligibleBatchTargets[0].pageTitle, 'Zombie');
});
