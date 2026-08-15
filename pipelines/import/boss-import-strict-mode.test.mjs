import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldFailBossImportStrictMode } from './boss-import-strict-mode.mjs';

test('shouldFailBossImportStrictMode ignores pending boss image localization during dry-run', () => {
  assert.equal(shouldFailBossImportStrictMode({
    dryRun: true,
    unresolvedBosses: [],
    remainingWikiBossImages: 29,
    remainingWikiBossMemberImages: 0,
    bossMemberImageMissingSource: 0,
    failedBossImages: 0,
    failedBossMemberImages: 0,
  }), false);
});

test('shouldFailBossImportStrictMode still fails non-dry-run imports with remaining wiki boss images', () => {
  assert.equal(shouldFailBossImportStrictMode({
    dryRun: false,
    unresolvedBosses: [],
    remainingWikiBossImages: 29,
    remainingWikiBossMemberImages: 0,
    bossMemberImageMissingSource: 0,
    failedBossImages: 0,
    failedBossMemberImages: 0,
  }), true);
});
