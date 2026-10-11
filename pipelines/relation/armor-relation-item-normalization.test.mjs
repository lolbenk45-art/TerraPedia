import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS,
  buildArmorRelationItemNormalizationCandidate,
  buildArmorRelationItemNormalizationProposal,
} from './armor-relation-item-normalization.mjs';

const NAMES = new Map([
  [729, ['WoodGreaves', 'Wood Greaves']],
  [1282, ['AmethystRobe', 'Amethyst Robe']],
]);

function maintItem(sourceId) {
  const [internal_name, english_name] = NAMES.get(sourceId);
  return {
    id: sourceId, source_id: sourceId, internal_name, english_name,
    source_provider: 'terraria.wiki.gg', source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: '2026-03-09T22:52:58.000Z',
    raw_json: JSON.stringify({ id: sourceId, internalName: internal_name }),
    defense_value: null, status: 1, deleted: 0,
  };
}

function relationItem(sourceId, overrides = {}) {
  const [internal_name, english_name] = NAMES.get(sourceId);
  return {
    id: sourceId + 10000, record_key: `record-${sourceId}`, source_id: sourceId,
    internal_name, english_name, source_maint_table: 'maint_items', source_maint_id: sourceId,
    defense_value: 0, status: 1, deleted: 0, other_value: `preserve-${sourceId}`, ...overrides,
  };
}

function inputs(overrides = {}) {
  return {
    maintItems: ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS.map(maintItem),
    relationItems: ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS.map(id => relationItem(id)),
    ...overrides,
  };
}

test('builds a narrow null-defense candidate for both stale relation items', () => {
  const candidate = buildArmorRelationItemNormalizationCandidate(inputs());
  assert.equal(candidate.databaseWrites, false);
  assert.deepEqual(candidate.targetItemSourceIds, [729, 1282]);
  assert.equal(candidate.changes.relationItems.updates.length, 2);
  for (const change of candidate.changes.relationItems.updates) {
    assert.equal(change.after.defense_value, null);
    assert.equal(change.after.id, change.before.id);
    assert.equal(change.after.record_key, change.before.record_key);
    assert.equal(change.after.other_value, change.before.other_value);
  }
});

test('rejects a source that declares a numeric defense or owner drift', () => {
  assert.throws(() => buildArmorRelationItemNormalizationCandidate(inputs({
    maintItems: inputs().maintItems.map((row, index) => index === 0 ? { ...row, raw_json: JSON.stringify({ id: 729, defense: 1, internalName: 'WoodGreaves' }) } : row),
  })), /source|defense|canonical/i);
  assert.throws(() => buildArmorRelationItemNormalizationCandidate(inputs({
    relationItems: inputs().relationItems.map((row, index) => index === 0 ? { ...row, record_key: null } : row),
  })), /owner|identity|record/i);
});

test('proposal is explicitly non-executable and binds the two-row scope', () => {
  const candidate = buildArmorRelationItemNormalizationCandidate(inputs());
  const proposal = buildArmorRelationItemNormalizationProposal({ candidate, serverUuid: 'server-1' });
  assert.equal(proposal.executable, false);
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.applyAllowed, false);
  assert.deepEqual(proposal.targetItemSourceIds, [729, 1282]);
});
