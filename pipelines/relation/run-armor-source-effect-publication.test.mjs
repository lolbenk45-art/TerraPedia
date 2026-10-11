import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID,
  buildArmorSourceEffectPublicationPaths,
} from './run-armor-source-effect-publication.mjs';

test('source-effect runner binds a normalized proposal/prepared/result artifact set', () => {
  assert.deepEqual(buildArmorSourceEffectPublicationPaths('retry-01'), {
    proposalPath: `reports/authorization/canonical/${ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID}.retry-01.proposal.json`,
    preparedPath: `reports/authorization/canonical/${ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID}.retry-01.prepared.json`,
    resultPath: `reports/authorization/canonical/${ARMOR_SOURCE_EFFECT_PUBLICATION_OPERATION_ID}.retry-01.result.json`,
  });
  assert.throws(() => buildArmorSourceEffectPublicationPaths('../escape'), /label/i);
});
