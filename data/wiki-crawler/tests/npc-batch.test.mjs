import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runNpcBatch } from '../src/batch/run-npc-batch.mjs';

test('runNpcBatch executes page titles and page ids sequentially through runCli', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-batch-'));
  const calls = [];
  const result = await runNpcBatch({
    pageTitles: ['Goblin Tinkerer', 'Medusa'],
    pageIds: [13774],
    writeFiles: true,
    outputRoot: tempRoot
  }, {
    runCliImpl: async (argv) => {
      calls.push(argv);
      return {
        normalized: {
          display: {
            name: argv.join(' ')
          }
        },
        audit: {
          status: calls.length === 2 ? 'warn' : 'pass',
          reasons: calls.length === 2 ? ['example warning'] : []
        }
      };
    }
  });

  assert.deepEqual(calls, [
    ['entity', '--domain=npc', '--page-title=Goblin Tinkerer', '--write-files', `--output-root=${tempRoot}`],
    ['entity', '--domain=npc', '--page-title=Medusa', '--write-files', `--output-root=${tempRoot}`],
    ['entity', '--domain=npc', '--page-id=13774', '--write-files', `--output-root=${tempRoot}`]
  ]);
  assert.equal(result.executions.length, 3);
  assert.equal(result.executions[1].audit.status, 'warn');
  assert.equal(result.summary.total, 3);
  assert.ok(result.reportPath);

  const report = JSON.parse(await fs.readFile(result.reportPath, 'utf8'));
  assert.equal(report.total, 3);
  assert.equal(report.warn, 1);
});

test('runNpcBatch loads page titles from a targets file and respects target priority and limit', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-batch-targets-'));
  const targetsFile = path.join(tempRoot, 'targets.json');
  await fs.writeFile(targetsFile, JSON.stringify({
    eligibleBatchTargets: [
      { pageTitle: 'Merchant', priority: 'p0_town' },
      { pageTitle: 'Nurse', priority: 'p0_town' },
      { pageTitle: 'Zombie', priority: 'p1_enemy' }
    ]
  }, null, 2));

  const calls = [];
  const result = await runNpcBatch({
    targetsFile,
    targetPriority: 'p0_town',
    limit: 1
  }, {
    runCliImpl: async (argv) => {
      calls.push(argv);
      return {
        normalized: { display: { name: argv.join(' ') } },
        audit: { status: 'pass', reasons: [] }
      };
    }
  });

  assert.deepEqual(calls, [
    ['entity', '--domain=npc', '--page-title=Merchant']
  ]);
  assert.equal(result.summary.total, 1);
});
