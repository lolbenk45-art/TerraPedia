import test from 'node:test';
import assert from 'node:assert/strict';

import {
  relationStatus,
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  resolveItemIdentity
} from './relation-trace.mjs';

test('relationStatus exports the expected status constants', () => {
  assert.deepEqual(relationStatus, {
    resolved: 'resolved',
    candidateLowConfidence: 'candidate_low_confidence',
    unresolved: 'unresolved'
  });
});

test('createRecordKey is deterministic for JSON values', () => {
  const left = createRecordKey({ table: 'x', value: ['A', 1] });
  const right = createRecordKey({ table: 'x', value: ['A', 1] });
  assert.equal(left, right);
  assert.equal(left.length, 64);
});

test('normalizeText trims and returns null for blank input', () => {
  assert.equal(normalizeText('  '), null);
  assert.equal(normalizeText(null), null);
  assert.equal(normalizeText(' Acorn '), 'Acorn');
});

test('normalizeTrace extracts maint and landing trace fields', () => {
  const trace = normalizeTrace('maint_item_sources', {
    id: 9,
    record_key: 'a'.repeat(64),
    landing_source_id: 51,
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'b'.repeat(64),
    source_provider: 'wiki_gg',
    source_page: 'Acorn',
    source_revision_timestamp: '2026-03-20T17:40:48Z'
  });

  assert.deepEqual(trace, {
    sourceMaintTable: 'maint_item_sources',
    sourceMaintRecordKey: 'a'.repeat(64),
    sourceMaintId: 9,
    landingSourceId: 51,
    landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
    landingContentHash: 'b'.repeat(64),
    sourceProvider: 'wiki_gg',
    sourcePage: 'Acorn',
    sourceRevisionTimestamp: '2026-03-20T17:40:48Z'
  });
});

test('resolveItemIdentity prefers source_id and internal_name agreement', () => {
  const result = resolveItemIdentity(
    { source_id: 1, internal_name: 'Acorn' },
    new Map([[1, { source_id: 1, internal_name: 'Acorn' }]]),
    new Map([['Acorn', { source_id: 1, internal_name: 'Acorn' }]])
  );

  assert.equal(result.status, relationStatus.resolved);
  assert.equal(result.itemSourceId, 1);
  assert.equal(result.itemInternalName, 'Acorn');
  assert.equal(result.reason, 'source_id_internal_name_match');
  assert.equal(result.confidence, confidence.high);
});

test('resolveItemIdentity downgrades to internal-name match when source id is missing', () => {
  const result = resolveItemIdentity(
    { source_id: null, internal_name: 'Acorn' },
    new Map(),
    new Map([['Acorn', { source_id: 1, internal_name: 'Acorn' }]])
  );

  assert.equal(result.status, relationStatus.candidateLowConfidence);
  assert.equal(result.itemSourceId, 1);
  assert.equal(result.itemInternalName, 'Acorn');
  assert.equal(result.reason, 'source_id_missing_internal_name_match');
  assert.equal(result.confidence, confidence.low);
});

test('resolveItemIdentity returns unresolved when source_id and internal_name disagree', () => {
  const result = resolveItemIdentity(
    { source_id: 1, internal_name: 'WrongItem' },
    new Map([[1, { source_id: 1, internal_name: 'Acorn' }]]),
    new Map([['WrongItem', { source_id: 2, internal_name: 'WrongItem' }]])
  );

  assert.equal(result.status, relationStatus.unresolved);
  assert.equal(result.itemSourceId, 1);
  assert.equal(result.itemInternalName, 'WrongItem');
  assert.equal(result.reason, 'source_id_internal_name_conflict');
  assert.equal(result.confidence, confidence.none);
});

test('resolveItemIdentity returns unresolved when no match exists', () => {
  const result = resolveItemIdentity(
    { source_id: 999, internal_name: 'MissingItem' },
    new Map(),
    new Map()
  );

  assert.equal(result.status, relationStatus.unresolved);
  assert.equal(result.itemSourceId, 999);
  assert.equal(result.itemInternalName, 'MissingItem');
  assert.equal(result.reason, 'item_identity_unresolved');
  assert.equal(result.confidence, confidence.none);
});
