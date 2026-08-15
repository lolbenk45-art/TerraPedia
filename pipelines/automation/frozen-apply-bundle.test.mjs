import assert from 'node:assert/strict';
import test from 'node:test';

import { createFrozenApplyBundle, verifyFrozenApplyBundle } from './frozen-apply-bundle.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: 'run-20260723-001',
    plannedApplyActionId: 'recipe-reference-apply',
    policySetHash: HASH_A,
    sourceArtifacts: [{
      path: 'reports/frozen/run-001/source.json',
      schemaVersion: 2,
      content: { records: [{ id: 1, name: 'Wood' }] },
    }],
    diff: {
      schemaVersion: 1,
      baselineFingerprint: HASH_C,
      scopes: [{
        scopeId: 'recipes:wiki_gg',
        baselineCount: 20,
        insertedKeys: ['recipe:2', 'recipe:1'],
        updatedKeys: [],
        deletedKeys: ['recipe:3'],
      }],
    },
    instructions: { mode: 'apply-frozen', allowNetwork: false, allowRenormalize: false },
    ...overrides,
  };
}

test('frozen bundle is canonical and content addressed', () => {
  const first = createFrozenApplyBundle(input());
  const second = createFrozenApplyBundle(input({
    diff: {
      ...input().diff,
      scopes: [{
        ...input().diff.scopes[0],
        insertedKeys: ['recipe:1', 'recipe:2'],
      }],
    },
  }));

  assert.equal(first.bundleHash, second.bundleHash);
  assert.deepEqual(first.bundle.diff.scopes[0].insertedKeys, ['recipe:1', 'recipe:2']);
  assert.equal(first.bundle.diff.scopes[0].insertCount, 2);
  assert.equal(first.bundle.diff.scopes[0].deleteCount, 1);
  assert.equal(verifyFrozenApplyBundle(first), true);
});

test('source, policy, and exact diff mutations change bundle identity', () => {
  const original = createFrozenApplyBundle(input()).bundleHash;
  assert.notEqual(original, createFrozenApplyBundle(input({ policySetHash: HASH_B })).bundleHash);
  assert.notEqual(original, createFrozenApplyBundle(input({
    sourceArtifacts: [{
      path: 'reports/frozen/run-001/source.json',
      schemaVersion: 2,
      content: { records: [{ id: 1, name: 'Stone' }] },
    }],
  })).bundleHash);
  assert.notEqual(original, createFrozenApplyBundle(input({
    diff: { ...input().diff, baselineFingerprint: HASH_B },
  })).bundleHash);
});

test('frozen bundle rejects mutable, networked, or re-normalizing inputs', () => {
  assert.throws(() => createFrozenApplyBundle(input({ schemaVersion: undefined })), /schemaVersion/i);
  assert.throws(() => createFrozenApplyBundle(input({
    sourceArtifacts: [{ path: 'data/generated/latest/source.json', schemaVersion: 1, content: {} }],
  })), /latest/i);
  assert.throws(() => createFrozenApplyBundle(input({
    sourceArtifacts: [{ path: 'https://wiki.example/source.json', schemaVersion: 1, content: {} }],
  })), /network|URL/i);
  assert.throws(() => createFrozenApplyBundle(input({
    instructions: { mode: 'apply-frozen', allowNetwork: true, allowRenormalize: false },
  })), /network/i);
  assert.throws(() => createFrozenApplyBundle(input({
    instructions: { mode: 'apply-frozen', allowNetwork: false, allowRenormalize: true },
  })), /normaliz/i);
});

test('frozen bundle rejects non-normalized and non-local provenance paths', () => {
  for (const unsafePath of [
    'file:///tmp/source.json',
    's3://bucket/source.json',
    '//server/share/source.json',
    'C:\\source.json',
    './reports/source.json',
    'reports//source.json',
    'reports/../source.json',
  ]) {
    assert.throws(() => createFrozenApplyBundle(input({
      sourceArtifacts: [{ path: unsafePath, schemaVersion: 1, content: {} }],
    })), /path|URL|network/i, unsafePath);
  }
});

test('frozen bundle embeds canonical source content and is detached from later mutation', () => {
  const mutableContent = { records: [{ name: 'Wood', id: 1 }] };
  const frozen = createFrozenApplyBundle(input({
    sourceArtifacts: [{
      path: 'reports/frozen/run-001/source.json',
      schemaVersion: 1,
      content: mutableContent,
    }],
  }));

  mutableContent.records[0].name = 'Changed after freeze';

  assert.equal(frozen.bundle.sourceArtifacts[0].content.records[0].name, 'Wood');
  assert.match(frozen.bundle.sourceArtifacts[0].contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(frozen.bundle.sourceArtifacts[0].contentSizeBytes > 0, true);
  assert.equal(verifyFrozenApplyBundle(frozen), true);
});

test('canonical ordering is bytewise for punctuation and non-ASCII keys', () => {
  const frozen = createFrozenApplyBundle(input({
    diff: {
      ...input().diff,
      scopes: [{
        ...input().diff.scopes[0],
        insertedKeys: ['中', '_key', '-key', 'a'],
      }],
    },
  }));

  assert.deepEqual(frozen.bundle.diff.scopes[0].insertedKeys, ['-key', '_key', 'a', '中']);
});

test('frozen bundle requires exact unique logical keys and counts', () => {
  assert.throws(() => createFrozenApplyBundle(input({
    diff: {
      ...input().diff,
      scopes: [{ ...input().diff.scopes[0], insertedKeys: ['recipe:1', 'recipe:1'] }],
    },
  })), /duplicate/i);
  assert.throws(() => createFrozenApplyBundle(input({
    diff: { ...input().diff, baselineFingerprint: undefined },
  })), /baselineFingerprint/i);
  assert.throws(() => createFrozenApplyBundle(input({
    diff: { ...input().diff, scopes: [{ ...input().diff.scopes[0], baselineCount: -1 }] },
  })), /baselineCount/i);
});

test('verification rejects a bundle whose canonical content changed', () => {
  const frozen = createFrozenApplyBundle(input());
  const changed = structuredClone(frozen);
  changed.bundle.diff.scopes[0].insertedKeys.push('recipe:4');

  assert.throws(() => verifyFrozenApplyBundle(changed), /bundle hash/i);
});
