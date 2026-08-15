import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSlot } from './lib/slot-allocator.mjs';

test('assigns slot 0 for first worktree in empty registry', () => {
  const { slot, registry } = assignSlot({}, '/wt/a');
  assert.equal(slot, 0);
  assert.deepEqual(registry, { '/wt/a': 0 });
});

test('assigns next incremental slot for a new worktree', () => {
  const { slot, registry } = assignSlot({ '/wt/a': 0 }, '/wt/b');
  assert.equal(slot, 1);
  assert.deepEqual(registry, { '/wt/a': 0, '/wt/b': 1 });
});

test('returns existing slot for a known worktree (idempotent)', () => {
  const { slot, registry } = assignSlot({ '/wt/a': 0, '/wt/b': 1 }, '/wt/a');
  assert.equal(slot, 0);
  assert.deepEqual(registry, { '/wt/a': 0, '/wt/b': 1 });
});

test('reuses the smallest freed slot', () => {
  const { slot } = assignSlot({ '/wt/a': 0, '/wt/c': 2 }, '/wt/d');
  assert.equal(slot, 1);
});
