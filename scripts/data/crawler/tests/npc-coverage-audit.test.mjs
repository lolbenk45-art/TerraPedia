import test from 'node:test';
import assert from 'node:assert/strict';

import { auditNpcCoverageTargets } from '../src/coverage/audit-npc-coverage-targets.mjs';

test('auditNpcCoverageTargets summarizes resolved, redirected, missing, and eligible targets', async () => {
  const result = await auditNpcCoverageTargets({
    targets: [
      { pageTitle: 'Merchant', priority: 'p0_town', alreadyCrawled: true, standardizedRecords: [{ id: 17 }] },
      { pageTitle: 'Eye of Cthulhu', priority: 'p0_boss', alreadyCrawled: false, standardizedRecords: [{ id: 4 }] },
      { pageTitle: 'Retinazer', priority: 'p0_boss', alreadyCrawled: false, standardizedRecords: [{ id: 125 }] },
      { pageTitle: 'Missing NPC', priority: 'p1_enemy', alreadyCrawled: false, standardizedRecords: [{ id: 999 }] }
    ],
    fetchWikiPageMetadataBatchImpl: async ({ titles }) => {
      return titles.map((title) => {
        if (title === 'Merchant') {
          return { requestedTitle: title, pageTitle: 'Merchant', pageId: 17, missing: false };
        }
        if (title === 'Eye of Cthulhu') {
          return { requestedTitle: title, pageTitle: 'Eye of Cthulhu', pageId: 4, missing: false };
        }
        if (title === 'Retinazer') {
          return { requestedTitle: title, pageTitle: 'The Twins', pageId: 125, missing: false };
        }
        return { requestedTitle: title, pageTitle: null, pageId: null, missing: true };
      });
    }
  });

  assert.equal(result.summary.totalTargets, 4);
  assert.equal(result.summary.resolvedTargets, 3);
  assert.equal(result.summary.redirectTargets, 1);
  assert.equal(result.summary.missingTargets, 1);
  assert.equal(result.summary.eligibleBatchTargets, 2);
  assert.deepEqual(
    result.eligibleBatchTargets.map((target) => target.pageTitle),
    ['Eye of Cthulhu', 'The Twins']
  );
});
