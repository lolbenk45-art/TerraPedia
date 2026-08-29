import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParityPlan, assertParityPlan } from './core-projection-parity-contract.mjs';

test('parity plan requires all relation-backed domains and fields', () => {
  const plan = buildParityPlan({ domains: { items: [], npcs: [], bosses: [] } });
  assert.match(plan.scopeHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(plan.readOnly, true);
});

test('parity plan rejects duplicate keys and missing fields', () => {
  assert.throws(() => assertParityPlan({ schemaVersion: 'core-projection-parity-v1', readOnly: true, domains: { items: [{ key: 'x', relation: { knockback: 1 } }], npcs: [], bosses: [] } }), /missing relation-backed items.sell/);
  assert.throws(() => assertParityPlan({ schemaVersion: 'core-projection-parity-v1', readOnly: true, domains: { items: [{ key: 'x', relation: { knockback: 1, sell: 1 } }, { key: 'x', relation: { knockback: 1, sell: 1 } }], npcs: [], bosses: [] } }), /duplicate/);
});

test('builds a domain-scoped plan without silently including other domains', () => {
  const plan = buildParityPlan({
    domain: 'items',
    domains: {
      items: [{ key: 'Example', relation: { knockback: 0, sell: 10 } }],
      npcs: [],
      bosses: [],
    },
  });
  assert.equal(plan.domain, 'items');
  assert.deepEqual(Object.keys(plan.domains), ['items']);
});
