import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcBridgeSummary } from '../src/report/npc-bridge-summary.mjs';

test('buildNpcBridgeSummary reports matched, unmatched, unenriched, and conflict samples', () => {
  const summary = buildNpcBridgeSummary({
    crawlerNpcTotal: 3,
    standardizedNpcTotal: 4,
    matches: [
      { entityId: 'goblin-tinkerer', internalName: 'GoblinTinkerer' },
      { entityId: 'medusa', internalName: 'Medusa' }
    ],
    unmatchedCrawler: [
      { entityId: 'unknown-npc', pageTitle: 'Unknown NPC', reason: 'unmatched' }
    ],
    unenrichedStandardized: [
      { internalName: 'LostGirl', name: 'Lost Girl' }
    ],
    conflictSamples: [
      { entityId: 'medusa', issue: 'multiple possible matches' }
    ]
  });

  assert.equal(summary.crawlerNpcTotal, 3);
  assert.equal(summary.matched, 2);
  assert.equal(summary.unmatchedCrawler, 1);
  assert.equal(summary.unenrichedStandardized, 1);
  assert.equal(summary.conflictSamples.length, 1);
});
