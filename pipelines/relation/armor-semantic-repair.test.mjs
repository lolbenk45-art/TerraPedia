import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArmorEffectKeyRetirementPlan } from './armor-semantic-repair.mjs';

const key = char => char.repeat(64);

function effect(overrides = {}) {
  return {
    id: 10,
    record_key: key('a'),
    owner_kind: 'item',
    owner_id: 728,
    source_kind: 'armor_attribute_cell',
    stat_key: 'crit_chance',
    class_scope: 'all',
    slot_type: 'bodySlot',
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

test('retires only the exact old Armor effect key and inserts its class-scoped replacement', () => {
  const result = buildArmorEffectKeyRetirementPlan({
    selectedMemberIds: [728],
    currentRows: [effect()],
    proposedRows: [effect({ id: undefined, record_key: key('b'), class_scope: 'melee' })],
  });

  assert.deepEqual(result.retire.map(row => row.record_key), [key('a')]);
  assert.deepEqual(result.insert.map(row => row.record_key), [key('b')]);
  assert.deepEqual(result.update, []);
  assert.deepEqual(result.unchanged, []);
  assert.deepEqual(result.deletes, []);
  assert.equal(result.retire[0].retireMode, 'status_deleted');
  assert.match(result.planSha256, /^sha256:[a-f0-9]{64}$/);
});

test('rejects a stale effect key outside the selected Armor member scope', () => {
  assert.throws(() => buildArmorEffectKeyRetirementPlan({
    selectedMemberIds: [728],
    currentRows: [effect({ owner_id: 729 })],
    proposedRows: [],
  }), /selected|owner|scope/i);
});

test('rejects duplicate current or proposed effect keys before planning retirement', () => {
  assert.throws(() => buildArmorEffectKeyRetirementPlan({
    selectedMemberIds: [728],
    currentRows: [effect(), effect({ id: 11 })],
    proposedRows: [],
  }), /duplicate|record_key/i);
});
