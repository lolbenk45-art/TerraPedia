import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  ARMOR_MISSING_ATTRIBUTE_MAINT_CANDIDATE_SCHEMA,
  buildArmorMissingAttributeMaintCandidate,
  validateArmorMissingAttributeMaintCandidate,
} from './armor-missing-attribute-maint-candidate.mjs';

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;

const hash = 'sha256:' + 'a'.repeat(64);

function evidence() {
  const payload = {
    schemaVersion: 'armor-missing-attribute-source-evidence/v1',
    executable: false,
    databaseWrites: false,
    targetGameVersion: '1.4.5.8',
    sourceRevision: { armorOverview: 1032721, iteminfo: 1023241 },
    evidenceSha256: null,
    records: [
      {
        identity: {
          itemSourceId: 954,
          internalName: 'AncientIronHelmet',
          itemName: 'Ancient Iron Helmet',
          slotGroup: 'head',
          defenseValue: 2,
        },
        source: {
          overview: {
            pageTitle: 'Armor', pageId: 9405, revisionId: 1032721,
            revisionTimestamp: '2026-10-02T01:42:32Z',
            contentHash: 'sha256:' + 'b'.repeat(64),
            rowHash: 'sha256:' + 'c'.repeat(64), setTitle: 'Iron armor',
          },
          iteminfo: {
            pageTitle: 'Module:Iteminfo/data', pageId: 18021, revisionId: 1023241,
            revisionTimestamp: '2026-08-22T03:26:22Z',
          },
          itemPage: {
            pageTitle: 'Iron armor', pageId: 5723, revisionId: 998200,
            revisionTimestamp: '2026-06-04T07:33:15Z',
            contentHash: 'sha256:' + 'd'.repeat(64), htmlHash: 'sha256:' + 'e'.repeat(64),
          },
        },
        effectLines: ['+2 defense'],
        itemScopedSourceLines: [],
        itemScopedFacts: [],
        setOwnedFacts: ['+2 defense'],
        sourceStatus: 'revision-bound',
      },
      {
        identity: {
          itemSourceId: 5588,
          internalName: 'UpgradedMiningHead',
          itemName: 'Prospector Helmet',
          slotGroup: 'head',
          defenseValue: 10,
        },
        source: {
          overview: {
            pageTitle: 'Armor', pageId: 9405, revisionId: 1032721,
            revisionTimestamp: '2026-10-02T01:42:32Z',
            contentHash: 'sha256:' + 'b'.repeat(64),
            rowHash: 'sha256:' + 'f'.repeat(64), setTitle: 'Prospector armor',
          },
          iteminfo: {
            pageTitle: 'Module:Iteminfo/data', pageId: 18021, revisionId: 1023241,
            revisionTimestamp: '2026-08-22T03:26:22Z',
          },
          itemPage: {
            pageTitle: 'Prospector armor', pageId: 71281, revisionId: 1033092,
            revisionTimestamp: '2026-10-05T10:54:44Z',
            contentHash: 'sha256:' + '1'.repeat(64), htmlHash: 'sha256:' + '2'.repeat(64),
          },
        },
        effectLines: ['+20% mining speed', '+10% mining speed (+30% total)'],
        itemScopedSourceLines: ['+20% mining speed'],
        itemScopedFacts: [{ statKey: 'miningSpeed', valueDecimal: 20, unit: 'percent', operation: 'add' }],
        setOwnedFacts: ['+10% mining speed (+30% total)'],
        sourceStatus: 'revision-bound',
      },
    ],
    acceptance: { status: 'source-evidence-ready', blockers: [] },
  };
  const { evidenceSha256: _ignored, ...body } = payload;
  payload.evidenceSha256 = `sha256:${createHash('sha256').update(JSON.stringify(stable(body)), 'utf8').digest('hex')}`;
  return payload;
}

function maintItems() {
  return [
    { id: 954, source_id: 954, internal_name: 'AncientIronHelmet', name_zh: '远古铁头盔', defense_value: 2, status: 1, deleted: 0 },
    { id: 5588, source_id: 5588, internal_name: 'UpgradedMiningHead', name_zh: '勘探者头盔', defense_value: 10, status: 1, deleted: 0 },
  ];
}

test('builds an id-independent maint landing and separates item facts from set-owned prose', () => {
  const candidate = buildArmorMissingAttributeMaintCandidate({
    evidence: evidence(), evidencePath: '.local/tmp/armor-missing-attribute-source-evidence-20261006.json',
    preparedAt: '2026-10-06T03:00:00.000Z', maintItems: maintItems(), currentLandingRows: [], currentMaintRows: [],
  });

  assert.equal(candidate.schemaVersion, ARMOR_MISSING_ATTRIBUTE_MAINT_CANDIDATE_SCHEMA);
  assert.equal(candidate.executable, false);
  assert.equal(candidate.databaseWrites, false);
  assert.equal(candidate.proposedLanding.dataset_type, 'armor_attributes_raw');
  assert.equal(candidate.proposedLanding.source_locator, '.local/tmp/armor-missing-attribute-source-evidence-20261006.json');
  assert.equal(candidate.proposedLanding.id, undefined);
  assert.equal(candidate.changes.maint.inserts.length, 2);
  assert.deepEqual(candidate.changes.maint.inserts[0].item_page_title, 'Ancient Iron Helmet');
  assert.equal(candidate.itemEffects.length, 1);
  assert.equal(candidate.itemEffects[0].ownerId, 5588);
  assert.equal(candidate.itemEffects[0].sourceKind, 'armor_attribute_cell');
  assert.equal(candidate.itemEffects[0].statKey, 'mining_speed');
  assert.equal(candidate.itemEffects[0].operation, 'add');
  assert.equal(candidate.itemEffects[0].valueDecimal, 20);
  assert.equal(candidate.itemEffects[0].unit, 'percent');
  assert.deepEqual(candidate.setOwnedFacts, [{ itemSourceId: 954, setTitle: 'Iron armor', facts: ['+2 defense'] }, {
    itemSourceId: 5588, setTitle: 'Prospector armor', facts: ['+10% mining speed (+30% total)'],
  }]);
  assert.equal(validateArmorMissingAttributeMaintCandidate(candidate), true);
});

test('reuses an exact landing and maint row on replay without allocating ids', () => {
  const first = buildArmorMissingAttributeMaintCandidate({
    evidence: evidence(), evidencePath: '.local/tmp/evidence.json',
    preparedAt: '2026-10-06T03:00:00Z', maintItems: maintItems(), currentLandingRows: [], currentMaintRows: [],
  });
  const landing = { ...first.proposedLanding, id: 300 };
  const rows = first.changes.maint.inserts.map((row, index) => ({ ...row, id: 400 + index, landing_source_id: 300 }));
  const replay = buildArmorMissingAttributeMaintCandidate({
    evidence: evidence(), evidencePath: '.local/tmp/evidence.json',
    preparedAt: '2026-10-06T03:05:00Z', maintItems: maintItems(), currentLandingRows: [landing], currentMaintRows: rows,
  });
  assert.deepEqual(replay.changes.landing, { inserts: [], reused: [landing], preserved: [] });
  assert.equal(replay.changes.maint.inserts.length, 0);
  assert.equal(replay.changes.maint.reused.length, 2);
  assert.deepEqual(replay.changes.maint.reused.map(row => row.id), [400, 401]);
});

test('preserves unrelated landing and maint history while planning the missing owners', () => {
  const first = buildArmorMissingAttributeMaintCandidate({
    evidence: evidence(), evidencePath: '.local/tmp/evidence.json',
    preparedAt: '2026-10-06T03:00:00Z', maintItems: maintItems(), currentLandingRows: [], currentMaintRows: [],
  });
  const currentLandingRows = [{ id: 1, source_key: 'historical-landing', content_hash: 'old', payload_json: '{}', status: 1, deleted: 0,
    fetched_at: new Date('2026-10-01T00:00:00.000Z') }];
  const currentMaintRows = [{ id: 2, record_key: 'f'.repeat(64), item_page_title: 'Historical', status: 1, deleted: 0,
    created_at: new Date('2026-10-01T00:00:00.000Z') }];
  const candidate = buildArmorMissingAttributeMaintCandidate({
    evidence: evidence(), evidencePath: '.local/tmp/evidence.json',
    preparedAt: '2026-10-06T03:00:00Z', maintItems: maintItems(), currentLandingRows, currentMaintRows,
  });
  assert.deepEqual(candidate.changes.landing.preserved, currentLandingRows);
  assert.deepEqual(candidate.changes.maint.preserved, currentMaintRows);
  assert.equal(candidate.changes.maint.inserts.length, first.changes.maint.inserts.length);
  assert.equal(validateArmorMissingAttributeMaintCandidate(JSON.parse(JSON.stringify(candidate))), true);
});

for (const [label, mutate] of [
  ['evidence hash', input => { input.evidence.evidenceSha256 = 'sha256:' + '9'.repeat(64); }],
  ['item identity', input => { input.maintItems[1].internal_name = 'WrongName'; }],
  ['defense', input => { input.maintItems[1].defense_value = 9; }],
  ['prepared time', input => { input.preparedAt = 'bad'; }],
]) {
  test(`rejects ${label} drift before planning persistence`, () => {
    const input = {
      evidence: evidence(), evidencePath: '.local/tmp/evidence.json', preparedAt: '2026-10-06T03:00:00Z',
      maintItems: maintItems(), currentLandingRows: [], currentMaintRows: [],
    };
    mutate(input);
    assert.throws(() => buildArmorMissingAttributeMaintCandidate(input), /evidence|identity|defense|time|prepared|hash/i);
  });
}
