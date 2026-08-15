import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizePolicySet, computePolicySetHash } from './policy-set-hash.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

test('policy set hash is stable regardless of input order', () => {
  const first = computePolicySetHash([
    { domainId: 'recipes', policyVersion: 3, policyHash: B },
    { domainId: 'biomes', policyVersion: 1, policyHash: A },
  ]);
  const second = computePolicySetHash([
    { domainId: 'biomes', policyVersion: 1, policyHash: A },
    { domainId: 'recipes', policyVersion: 3, policyHash: B },
  ]);

  assert.equal(first, second);
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(canonicalizePolicySet([
    { domainId: 'recipes', policyVersion: 3, policyHash: B },
    { domainId: 'biomes', policyVersion: 1, policyHash: A },
  ]), [
    { domainId: 'biomes', policyVersion: 1, policyHash: `sha256:${A}` },
    { domainId: 'recipes', policyVersion: 3, policyHash: `sha256:${B}` },
  ]);
});

test('policy set rejects duplicate domains and malformed rows', () => {
  assert.throws(() => computePolicySetHash([
    { domainId: 'items', policyVersion: 1, policyHash: A },
    { domainId: 'items', policyVersion: 2, policyHash: B },
  ]), /duplicate domainId/i);
  assert.throws(() => computePolicySetHash([
    { domainId: 'items', policyVersion: 0, policyHash: A },
  ]), /policyVersion/i);
  assert.throws(() => computePolicySetHash([
    { domainId: 'items', policyVersion: 1, policyHash: 'not-a-hash' },
  ]), /policyHash/i);
});

test('mutating a policy version or hash changes the policy set hash', () => {
  const original = computePolicySetHash([
    { domainId: 'items', policyVersion: 1, policyHash: A },
  ]);

  assert.notEqual(original, computePolicySetHash([
    { domainId: 'items', policyVersion: 2, policyHash: A },
  ]));
  assert.notEqual(original, computePolicySetHash([
    { domainId: 'items', policyVersion: 1, policyHash: B },
  ]));
});

test('policy rows use explicit bytewise ordering', () => {
  assert.deepEqual(canonicalizePolicySet([
    { domainId: 'z_domain', policyVersion: 1, policyHash: A },
    { domainId: 'a_domain', policyVersion: 1, policyHash: B },
  ]).map((row) => row.domainId), ['a_domain', 'z_domain']);
});
