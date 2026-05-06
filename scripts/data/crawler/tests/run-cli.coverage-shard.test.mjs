import test from 'node:test';
import assert from 'node:assert/strict';

import { runCli } from '../src/cli.mjs';

test('runCli supports coverage-shard npc mode and delegates to the shard runner', async () => {
  const payload = await runCli([
    'coverage-shard',
    '--domain=npc',
    '--coverage-audit-path=C:/tmp/coverage-audit.latest.json',
    '--priority=p1_enemy',
    '--limit=20',
    '--output-root=C:/tmp/wiki-crawler'
  ], {
    runNpcCoverageShardImpl: async (options) => ({
      received: options,
      shard: { summary: { selectedTargets: 20 } }
    })
  });

  assert.deepEqual(payload.received, {
    domain: 'npc',
    coverageAuditPath: 'C:/tmp/coverage-audit.latest.json',
    priority: 'p1_enemy',
    limit: 20,
    outputRoot: 'C:/tmp/wiki-crawler'
  });
  assert.equal(payload.shard.summary.selectedTargets, 20);
});
