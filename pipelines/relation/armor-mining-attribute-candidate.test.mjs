import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArmorMiningAttributeCandidate } from './armor-mining-attribute-candidate.mjs';

const sourceRevision = {
  sourceRevisionId: 199734,
  sourceRevisionTimestamp: '2023-10-23T04:15:47Z',
  sourcePageTitle: '盔甲属性表',
};

const sourceRows = [
  {
    sectionCode: 'pre-hardmode', slotGroup: 'head', itemPageTitle: '挖矿头盔',
    itemHref: '/zh/wiki/%E6%8C%96%E7%9F%BF%E5%A4%B4%E7%9B%94', itemNameZh: '挖矿头盔',
    imageFileTitle: 'Mining Helmet.png', defenseValue: 2,
    rawCells: { otherBonus: '提供照明' }, sourceRevisionTimestamp: sourceRevision.sourceRevisionTimestamp,
  },
  {
    sectionCode: 'pre-hardmode', slotGroup: 'body', itemPageTitle: '挖矿衣',
    itemHref: '/zh/wiki/%E6%8C%96%E7%9F%BF%E8%A1%A3', itemNameZh: '挖矿衣',
    imageFileTitle: 'Mining Shirt.png', defenseValue: 2,
    rawCells: { otherBonus: '+10% 挖矿速度' }, sourceRevisionTimestamp: sourceRevision.sourceRevisionTimestamp,
  },
  {
    sectionCode: 'pre-hardmode', slotGroup: 'legs', itemPageTitle: '挖矿头盔',
    itemHref: '/zh/wiki/%E6%8C%96%E7%9F%BF%E5%A4%B4%E7%9B%94', itemNameZh: '挖矿头盔',
    imageFileTitle: 'Mining Pants.png', defenseValue: 1,
    rawCells: { otherBonus: '+10% 挖矿速度' }, sourceRevisionTimestamp: sourceRevision.sourceRevisionTimestamp,
  },
];

const identityMap = [
  { imageFileTitle: 'Mining Helmet.png', itemSourceId: 88, itemInternalName: 'MiningHelmet', slotGroup: 'head', itemPageTitle: '挖矿头盔', itemNameZh: '挖矿头盔', itemHref: sourceRows[0].itemHref,
    evidence: { artifactPath: '.local/tmp/mining-helmet.json', artifactHash: `sha256:${'a'.repeat(64)}`, requestedPageTitle: 'Mining Helmet', canonicalPageTitle: 'Mining Helmet', revisionId: 247500 } },
  { imageFileTitle: 'Mining Shirt.png', itemSourceId: 410, itemInternalName: 'MiningShirt', slotGroup: 'body', itemPageTitle: '挖矿衣', itemNameZh: '挖矿衣', itemHref: sourceRows[1].itemHref,
    evidence: { artifactPath: '.local/tmp/mining-shirt.json', artifactHash: `sha256:${'b'.repeat(64)}`, requestedPageTitle: 'Mining Shirt', canonicalPageTitle: 'Mining Shirt', revisionId: 247501 } },
  { imageFileTitle: 'Mining Pants.png', itemSourceId: 411, itemInternalName: 'MiningPants', slotGroup: 'legs', itemPageTitle: '挖矿裤', itemNameZh: '挖矿裤', itemHref: '/zh/wiki/%E6%8C%96%E7%9F%BF%E8%A3%A4',
    evidence: { artifactPath: '.local/tmp/mining-pants.json', artifactHash: `sha256:${'c'.repeat(64)}`, requestedPageTitle: 'Mining Pants', canonicalPageTitle: 'Mining armor', revisionId: 247540 } },
];

const corrections = [{
  match: {
    sectionCode: sourceRows[2].sectionCode, slotGroup: sourceRows[2].slotGroup,
    itemPageTitle: sourceRows[2].itemPageTitle, itemHref: sourceRows[2].itemHref,
    itemNameZh: sourceRows[2].itemNameZh, defenseValue: sourceRows[2].defenseValue,
    imageFileTitle: sourceRows[2].imageFileTitle,
  },
  replacement: { itemPageTitle: '挖矿裤', itemHref: identityMap[2].itemHref, itemNameZh: '挖矿裤' },
  evidence: identityMap[2].evidence,
}];

const maintItems = [
  { source_id: 88, internal_name: 'MiningHelmet', english_name: 'Mining Helmet', name_zh: '挖矿头盔', defense_value: 2, status: 1, deleted: 0 },
  { source_id: 410, internal_name: 'MiningShirt', english_name: 'Mining Shirt', name_zh: '挖矿衣', defense_value: 1, status: 1, deleted: 0 },
  { source_id: 411, internal_name: 'MiningPants', english_name: 'Mining Pants', name_zh: '挖矿裤', defense_value: 1, status: 1, deleted: 0 },
];

const maintRows = [
  { id: 12, record_key: '1'.repeat(64), item_page_title: '挖矿头盔', defense_value: null, raw_cells_json: JSON.stringify({ sentrySlots: '2' }), source_revision_timestamp: sourceRevision.sourceRevisionTimestamp, status: 1, deleted: 0 },
  { id: 510, record_key: '2'.repeat(64), item_page_title: '挖矿衣', defense_value: 10, raw_cells_json: JSON.stringify({ sentrySlots: '2' }), source_revision_timestamp: sourceRevision.sourceRevisionTimestamp, status: 1, deleted: 0 },
  { id: 552, record_key: '3'.repeat(64), item_page_title: '挖矿头盔', defense_value: 10, raw_cells_json: JSON.stringify({ sentrySlots: '1' }), source_revision_timestamp: sourceRevision.sourceRevisionTimestamp, status: 1, deleted: 0 },
];

const relationRows = [
  { id: 12, record_key: '4'.repeat(64), item_id: 88, item_internal_name: 'MiningHelmet', slot_group: 'head', defense_value: 2, raw_cells_json: JSON.stringify({ sentrySlots: '2' }), source_maint_id: 12, status: 1, deleted: 0 },
  { id: 338, record_key: '5'.repeat(64), item_id: 88, item_internal_name: 'MiningHelmet', slot_group: 'head', defense_value: 2, raw_cells_json: JSON.stringify({ sentrySlots: '1' }), source_maint_id: 552, status: 1, deleted: 0 },
  { id: 296, record_key: '6'.repeat(64), item_id: 410, item_internal_name: 'MiningShirt', slot_group: 'body', defense_value: 1, raw_cells_json: JSON.stringify({ sentrySlots: '2' }), source_maint_id: 510, status: 1, deleted: 0 },
];

const projectionRows = [
  { id: 12, relation_record_key: '5'.repeat(64), item_id: 88, item_internal_name: 'MiningHelmet', defense_value: 2, raw_cells_json: JSON.stringify({ sentrySlots: '1' }), status: 1, deleted: 0 },
  { id: 50, relation_record_key: '6'.repeat(64), item_id: 410, item_internal_name: 'MiningShirt', defense_value: 1, raw_cells_json: JSON.stringify({ sentrySlots: '2' }), status: 1, deleted: 0 },
];

function input(overrides = {}) {
  return {
    source: { ...sourceRevision, records: structuredClone(sourceRows) },
    identityMap: structuredClone(identityMap),
    identityCorrections: structuredClone(corrections),
    maintItems: structuredClone(maintItems),
    currentMaintRows: structuredClone(maintRows),
    currentRelationRows: structuredClone(relationRows),
    currentProjectionRows: structuredClone(projectionRows),
    ...overrides,
  };
}

test('builds a no-write candidate from corrected independent Mining identities and reports every blocker', () => {
  const candidate = buildArmorMiningAttributeCandidate(input());
  assert.equal(candidate.schemaVersion, 'armor-mining-attribute-candidate/v1');
  assert.equal(candidate.databaseWrites, false);
  assert.equal(candidate.executable, false);
  assert.equal(candidate.applyAllowed, false);
  assert.equal(candidate.sourceFacts.find(row => row.itemSourceId === 411).itemNameZh, '挖矿裤');
  assert.deepEqual(candidate.acceptance.blockers.map(row => row.code), [
    'duplicate_relation_attribute_owner',
    'maint_item_defense_conflict',
    'relation_attribute_semantics_drift',
    'missing_relation_attribute_owner',
  ]);
  assert.deepEqual(candidate.changes, { maint: [], relation: [], projection: [] });
});

test('rejects a Pants identity correction without independently bound evidence', () => {
  const broken = input({ identityCorrections: [] });
  assert.throws(() => buildArmorMiningAttributeCandidate(broken), /identity|canonical|Mining Pants/);
});

test('rejects source rows whose revision tuple drifts from the frozen source', () => {
  const broken = input();
  broken.source.records[1].sourceRevisionTimestamp = '2023-10-22T20:15:47Z';
  assert.throws(() => buildArmorMiningAttributeCandidate(broken), /revision/);
});

test('rejects ambiguous independent identity ownership before producing facts', () => {
  const broken = input({ identityMap: [...identityMap, { ...identityMap[0] }] });
  assert.throws(() => buildArmorMiningAttributeCandidate(broken), /identity|duplicate/);
});
