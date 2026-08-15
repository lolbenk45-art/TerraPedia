import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_CANDIDATE_VERSION,
  buildSourceLandingId,
  createCanonicalContentHash,
  validateCanonicalCandidate,
} from './canonical-schema.mjs';

test('validateCanonicalCandidate accepts a minimal valid candidate', () => {
  const payload = {
    moduleTitle: 'Module:Iteminfo/data',
    items: {
      1: { name: 'Iron Pickaxe' },
    },
  };
  const candidate = {
    canonical_version: CANONICAL_CANDIDATE_VERSION,
    domain: 'item',
    dataset_type: 'items_raw',
    candidate_generated_at: '2026-05-06T09:00:00.000Z',
    source_landing_id: buildSourceLandingId({
      datasetType: 'items_raw',
      provider: 'terraria.wiki.gg',
      sourceKey: 'wiki.module.iteminfo',
      sourcePage: 'Module:Iteminfo/data',
    }),
    source_provider: 'terraria.wiki.gg',
    source_key: 'wiki.module.iteminfo',
    source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: '2026-05-06T08:00:00.000Z',
    source_content_hash: createCanonicalContentHash(payload),
    content_hash: createCanonicalContentHash(payload),
    payload,
  };

  assert.deepEqual(validateCanonicalCandidate(candidate), []);
});

test('validateCanonicalCandidate rejects missing required metadata', () => {
  const candidate = {
    canonical_version: '',
    domain: 'item',
    dataset_type: 'items_raw',
    candidate_generated_at: 'not-a-date',
    source_landing_id: '',
    source_provider: 'terraria.wiki.gg',
    source_key: 'wiki.module.iteminfo',
    source_page: 'Module:Iteminfo/data',
    source_content_hash: 'x',
    content_hash: '',
    payload: null,
  };

  const errors = validateCanonicalCandidate(candidate);
  assert.ok(errors.some((error) => error.includes('canonical_version')));
  assert.ok(errors.some((error) => error.includes('candidate_generated_at')));
  assert.ok(errors.some((error) => error.includes('source_landing_id')));
  assert.ok(errors.some((error) => error.includes('source_content_hash')));
  assert.ok(errors.some((error) => error.includes('content_hash')));
});
