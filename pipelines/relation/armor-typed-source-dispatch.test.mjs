import test from 'node:test';
import assert from 'node:assert/strict';
import { persistedItemSourceFixture as fixture } from '../maint/armor-item-effect-test-fixture.mjs';
import { buildArmorAttributeDispatch as dispatch, buildArmorAttributeRelations, runSync } from './sync-maint-to-relation.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';

test('typed dispatch produces source-bound effects without fabricating complete armor attributes', () => {
  const input = fixture(); const result = dispatch(input);
  assert.deepEqual(result.relationArmorAttributeRows, []);
  assert.equal(result.typedSourceCount, 3);
  assert.equal(result.acceptance.status, 'blocked');
  for (const [i, effect] of result.relationEquipmentEffectAttributes.entries()) {
    assert.equal(effect.ownerId, 1546 + i);
    assert.equal(effect.sourceKind, 'armor_item_page');
    assert.equal(effect.ownerRecordKey, input.maintArmorAttributeRows[i].record_key);
    assert.equal(effect.sourceMaintId, 1000 + i);
    assert.equal(effect.landingSourceId, 900);
    assert.equal(effect.operation, 'multiply');
    assert.equal(effect.valueDecimal, 1.12);
    assert.ok(effect.conditionText);
    assert.equal(effect.reviewStatus, 'accepted');
  }
  const projection = buildProjectionPayload(result);
  assert.deepEqual(projection.projectionItemArmorAttributes, []);
  assert.equal(projection.projectionEquipmentEffectAttributes.length, 3);
  assert.ok(projection.projectionEquipmentEffectAttributes.every(row => row.conditionText && row.unit === 'multiplier'));
  assert.throws(() => buildArmorAttributeRelations(input), /dedicated source contract/);
});

test('mixed dispatch retains ordinary attributes and effects while routing typed sources separately', () => {
  const input = fixture();
  input.maintArmorAttributeRows.push({ id: 70, record_key: 'a'.repeat(64), item_page_title: 'Ninja Hood',
    slot_group: 'head', raw_cells_json: '{"meleeCritChance":"3%"}', raw_json: '{}', status: 1, deleted: 0 });
  input.maintItems.push({ id: 71, source_id: 256, internal_name: 'NinjaHood', english_name: 'Ninja Hood',
    raw_json: '{"headSlot":22}', status: 1, deleted: 0 });
  const result = dispatch(input);
  assert.equal(result.relationArmorAttributeRows.length, 1);
  assert.equal(result.relationArmorAttributeRows[0].itemId, 256);
  assert.equal(result.relationEquipmentEffectAttributes.length, 4);
  assert.equal(result.relationEquipmentEffectAttributes.filter(row => row.sourceKind === 'armor_attribute_cell').length, 1);
});

test('typed dispatch does not suppress the unresolved old specialized table cell', () => {
  const input = fixture();
  input.maintArmorAttributeRows.push({ id: 70, record_key: 'a'.repeat(64), item_page_title: 'Shroomite Headgear',
    slot_group: 'head', raw_cells_json: '{"rangedDamage":">15%","otherBonus":"额外弓伤害"}', raw_json: '{}' });
  assert.throws(() => dispatch(input), /exact percent/);
});

test('typed dispatch rejects an old generic Shroomite 15 percent row', () => {
  const input = fixture();
  input.maintArmorAttributeRows.push({ id: 70, record_key: 'a'.repeat(64), item_page_title: 'Shroomite Headgear',
    slot_group: 'head', raw_cells_json: '{"rangedDamage":"15%"}', raw_json: '{}' });
  assert.throws(() => dispatch(input), /historical|legacy|Shroomite|specialized damage/i);
});

for (const apply of [false, true]) {
  test(`general sync integrates typed dry-run evidence and prevents ungoverned publication; apply=${apply}`, async () => {
    const input = fixture(); let executions = 0; let reports = 0;
    const pending = runSync({ apply, createDatabase: false, maintDatabase: 'terria_v1_maint',
      localDatabase: null, relationDatabase: 'terria_v1_relation', scopes: ['armorAttribute', 'equipmentEffect'] }, {
      config: { database: { host: '127.0.0.1', port: 13306, username: 'test', password: 'test-only' } },
      managedImageUrlPrefixes: ['https://media.example.test/terrapedia-images/items/'],
      queryMaint: async sql => {
        if (sql.includes('FROM maint_armor_attribute_rows')) return input.maintArmorAttributeRows;
        if (sql.includes('FROM maint_items')) return input.maintItems;
        if (sql.includes('FROM source_dataset_landings')) {
          assert.match(sql, /provider.*terraria.wiki.gg/);
          assert.match(sql, /dataset_type.*armor_item_effects_raw/);
          return input.maintLandings;
        }
        return [];
      },
      queryRelation: async () => [], loadInheritanceRules: async () => [],
      loadReviewedNonNpcSourceExclusions: async () => [], loadReviewedSourceOnlyItemExclusions: async () => [],
      executeRelation: async () => { executions++; },
      writeReports: async () => { reports++; return {}; },
    });
    if (apply) {
      await assert.rejects(pending, /typed.*governed.*publication/i);
      assert.equal(reports, 0);
    } else {
      const result = await pending;
      assert.equal(result.results.relationArmorAttributeRows.length, 0);
      assert.equal(result.results.relationEquipmentEffectAttributes.filter(row => row.sourceKind === 'armor_item_page').length, 3);
      assert.equal(result.summary.armorItemEffectSourceAcceptance.status, 'blocked');
      assert.equal(reports, 1);
    }
    assert.equal(executions, 0);
  });
}
