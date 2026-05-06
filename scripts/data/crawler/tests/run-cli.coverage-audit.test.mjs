import test from 'node:test';
import assert from 'node:assert/strict';

import { runCli } from '../src/cli.mjs';

test('runCli supports coverage-audit npc mode and delegates to the coverage runner', async () => {
  const payload = await runCli([
    'coverage-audit',
    '--domain=npc',
    '--source-standardized-dir=C:/tmp/source-standardized',
    '--crawler-output-root=C:/tmp/crawler-output',
    '--output-root=C:/tmp/wiki-crawler'
  ], {
    runNpcCoverageAuditImpl: async (options) => ({
      received: options,
      audit: { summary: { totalTargets: 123 } }
    })
  });

  assert.deepEqual(payload.received, {
    domain: 'npc',
    sourceStandardizedDir: 'C:/tmp/source-standardized',
    crawlerOutputRoot: 'C:/tmp/crawler-output',
    outputRoot: 'C:/tmp/wiki-crawler'
  });
  assert.equal(payload.audit.summary.totalTargets, 123);
});
