import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFamilyPagePolicy,
  isFamilyPageAllowedForSharedSource
} from './item-source-family-page-policy.mjs';

test('family policy allows explicitly shared worldgen furniture pages', () => {
  assert.equal(isFamilyPageAllowedForSharedSource({
    pageTitle: 'Bookcases',
    sourceType: 'worldgen',
    sourceRefType: 'world'
  }), true);
});

test('family policy blocks paintings until item-specific placement is proven', () => {
  assert.equal(isFamilyPageAllowedForSharedSource({
    pageTitle: 'Paintings',
    sourceType: 'worldgen',
    sourceRefType: 'world'
  }), false);
});

test('family policy reports unknown pages as manual review', () => {
  assert.deepEqual(classifyFamilyPagePolicy('Unknown Family Page'), {
    pageTitle: 'Unknown Family Page',
    policy: 'manual_review',
    reason: 'no_policy_entry'
  });
});
