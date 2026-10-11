import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_ITEM_LINEAGE_TARGET_IDS,
  buildArmorItemLineageRefreshCandidate,
  comparableArmorItemLineageRow,
  validateArmorItemLineageRefreshCandidate,
} from './armor-item-lineage-refresh.mjs';

const SOURCE = {
  apiUrl: 'https://terraria.wiki.gg/api.php',
  pageTitle: 'Module:Iteminfo/data',
  pageId: 18021,
  revisionId: 1023241,
  revisionTimestamp: '2026-08-22T03:26:22Z',
  fetchedAt: '2026-10-06T10:00:00.000Z',
  wikitext: 'return { ["data"] = [=====[{"_terrariaversion":"1.4.5.8","_generated":"2026-08-22T03:00:00Z","1546":{"internalName":"ShroomiteHeadgear","name":"Shroomite Headgear","defense":11,"headSlot":103,"bodySlot":-1,"legSlot":-1,"value":375000,"width":18,"height":18},"1547":{"internalName":"ShroomiteMask","name":"Shroomite Mask","defense":11,"headSlot":104,"bodySlot":-1,"legSlot":-1,"value":375000,"width":18,"height":18},"1548":{"internalName":"ShroomiteHelmet","name":"Shroomite Helmet","defense":11,"headSlot":105,"bodySlot":-1,"legSlot":-1,"value":375000,"width":18,"height":18},"1549":{"internalName":"ShroomiteBreastplate","name":"Shroomite Breastplate","defense":24,"headSlot":-1,"bodySlot":67,"legSlot":-1,"value":300000,"width":18,"height":18},"1550":{"internalName":"ShroomiteLeggings","name":"Shroomite Leggings","defense":16,"headSlot":-1,"bodySlot":-1,"legSlot":56,"value":225000,"width":18,"height":18}}]=====] }',
};

function currentItem(id, overrides = {}) {
  const names = {
    1546: ['ShroomiteHeadgear', 'Shroomite Headgear', 11, 103, null, null, 375000],
    1547: ['ShroomiteMask', 'Shroomite Mask', 11, 104, null, null, 375000],
    1548: ['ShroomiteHelmet', 'Shroomite Helmet', 11, 105, null, null, 375000],
    1549: ['ShroomiteBreastplate', 'Shroomite Breastplate', 24, null, 67, null, 300000],
    1550: ['ShroomiteLeggings', 'Shroomite Leggings', 16, null, null, 56, 225000],
  };
  const [internalName, englishName, defenseValue, headSlot, bodySlot, legSlot, majorValue] = names[id];
  return {
    id,
    source_id: id,
    internal_name: internalName,
    english_name: englishName,
    name_zh: `item-${id}`,
    source_provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: '2026-03-09T22:52:58.000Z',
    landing_source_id: 6470,
    landing_source_key: 'wiki.module.iteminfo',
    landing_source_page: 'Module:Iteminfo/data',
    landing_content_hash: '6'.repeat(64),
    landing_fetched_at: '2026-03-27T11:05:29.000Z',
    landing_parsed_at: '2026-03-27T11:05:29.000Z',
    module_generated_at: '2026-03-09 22:43:19',
    terraria_version: '1.4.5.6',
    major_value: majorValue,
    combat_value: null,
    defense_value: defenseValue,
    use_time: null,
    stack_size: 1,
    width: 18,
    height: 18,
    flags_json: null,
    raw_json: JSON.stringify({ id, internalName, name: englishName, defense: defenseValue }),
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function inputs(overrides = {}) {
  return {
    source: SOURCE,
    sourceArtifactPath: '.local/tmp/a63-20260929-armor-source-02/module-iteminfo-data.json',
    sourceArtifactSha256: '2'.repeat(64),
    sourceArtifactByteSize: 4746067,
    currentLocalLandings: [],
    currentMaintLandings: [],
    currentMaintItems: ARMOR_ITEM_LINEAGE_TARGET_IDS.map(id => currentItem(id)),
    ...overrides,
  };
}

test('builds a read-only five-item lineage candidate with exact landing and update scope', () => {
  const candidate = buildArmorItemLineageRefreshCandidate(inputs());
  assert.equal(candidate.executable, false);
  assert.equal(candidate.databaseWrites, false);
  assert.deepEqual(candidate.targetItemSourceIds, [1546, 1547, 1548, 1549, 1550]);
  assert.equal(candidate.changes.localLanding.inserts.length, 1);
  assert.equal(candidate.changes.maintLanding.inserts.length, 1);
  assert.equal(candidate.changes.maintItems.updates.length, 5);
  assert.equal(candidate.changes.maintItems.inserts.length, 0);
  assert.equal(candidate.changes.maintItems.preserved.length, 0);
  assert.equal(candidate.proposedLanding.source_revision_timestamp, '2026-08-22 11:26:22');
  assert.equal(candidate.proposedLanding.source_key, 'wiki.module.iteminfo.armor-shroomite.1023241');
  assert.equal(candidate.changes.maintItems.updates[0].after.landing_source_id, null);
  validateArmorItemLineageRefreshCandidate(candidate);
});

test('rejects a source revision other than the frozen Iteminfo revision', () => {
  assert.throws(() => buildArmorItemLineageRefreshCandidate(inputs({
    source: { ...SOURCE, revisionId: 1023242 },
  })), /revision/i);
});

test('rejects missing or foreign target identities', () => {
  assert.throws(() => buildArmorItemLineageRefreshCandidate(inputs({
    currentMaintItems: ARMOR_ITEM_LINEAGE_TARGET_IDS.slice(0, -1).map(id => currentItem(id)),
  })), /exactly five|target|identity/i);
  assert.throws(() => buildArmorItemLineageRefreshCandidate(inputs({
    currentMaintItems: ARMOR_ITEM_LINEAGE_TARGET_IDS.map(id => currentItem(id, id === 1549 ? { source_id: 9999 } : {})),
  })), /exactly five|target|identity/i);
});

test('rejects a current landing namespace collision with a different payload', () => {
  const landing = {
    id: 7000,
    dataset_type: 'items_raw',
    provider: 'terraria.wiki.gg',
    source_key: 'wiki.module.iteminfo.armor-shroomite.1023241',
    source_page: 'Module:Iteminfo/data#ArmorShroomite/1546-1550',
    content_hash: 'f'.repeat(64),
    is_current: 1,
    current_slot: 1,
  };
  assert.throws(() => buildArmorItemLineageRefreshCandidate(inputs({
    currentLocalLandings: [landing],
    currentMaintLandings: [landing],
  })), /namespace|immutable|collision|drift/i);
});

test('compares MySQL CST wall-time text with the UTC Date returned by the lineage connection', () => {
  const actual = {
    source_revision_timestamp: new Date('2026-08-22T03:26:22.000Z'),
    landing_fetched_at: new Date('2026-08-22T03:26:22.000Z'),
  };
  const expected = {
    source_revision_timestamp: '2026-08-22 11:26:22',
    landing_fetched_at: '2026-08-22 11:26:22',
  };

  assert.deepEqual(comparableArmorItemLineageRow(actual), comparableArmorItemLineageRow(expected));
});
