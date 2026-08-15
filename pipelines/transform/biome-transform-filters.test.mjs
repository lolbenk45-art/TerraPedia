import test from 'node:test';
import assert from 'node:assert/strict';

import { isOverviewFallbackBiomeRecord } from './biome-transform-filters.mjs';

test('isOverviewFallbackBiomeRecord detects wiki Biomes overview fallback records', () => {
  assert.equal(isOverviewFallbackBiomeRecord({
    requestedTitle: 'Glowing moss biome',
    title: 'Biomes',
  }), true);
});

test('isOverviewFallbackBiomeRecord keeps intentional Biomes records', () => {
  assert.equal(isOverviewFallbackBiomeRecord({
    requestedTitle: 'Biomes',
    title: 'Biomes',
  }), false);
});

test('isOverviewFallbackBiomeRecord keeps intentional overview section records', () => {
  assert.equal(isOverviewFallbackBiomeRecord({
    requestedTitle: 'Flower patch',
    title: 'Flower patch',
    sourceType: 'overview_section',
    sourcePageTitle: 'Biomes',
    sourceSectionAnchor: 'Flower_patch',
  }), false);
});
