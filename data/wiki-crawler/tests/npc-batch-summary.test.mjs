import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcBatchSummary } from '../src/report/npc-batch-summary.mjs';

test('buildNpcBatchSummary counts pass warn fail and captures sample issues', () => {
  const summary = buildNpcBatchSummary({
    executions: [
      {
        target: { pageTitle: 'Goblin Tinkerer', entityId: 'goblin-tinkerer' },
        audit: { status: 'pass', reasons: [] }
      },
      {
        target: { pageTitle: 'Medusa', entityId: 'medusa' },
        audit: { status: 'warn', reasons: ['summary contains wiki markup'] }
      },
      {
        target: { pageTitle: 'Lost Girl', entityId: 'lost-girl' },
        audit: { status: 'fail', reasons: ['missing summary.leadText'] }
      }
    ]
  });

  assert.equal(summary.total, 3);
  assert.equal(summary.pass, 1);
  assert.equal(summary.warn, 1);
  assert.equal(summary.fail, 1);
  assert.deepEqual(summary.sampleIssues, [
    {
      entityId: 'medusa',
      pageTitle: 'Medusa',
      status: 'warn',
      reasons: ['summary contains wiki markup']
    },
    {
      entityId: 'lost-girl',
      pageTitle: 'Lost Girl',
      status: 'fail',
      reasons: ['missing summary.leadText']
    }
  ]);
});
