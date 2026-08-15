import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEquipmentEffectLines } from './equipment-effect-parser.mjs';

function parseOne(text) {
  const rows = parseEquipmentEffectLines({
    owner: {
      ownerKind: 'armor_set',
      ownerRecordKey: 'armor-rk',
      ownerId: 17,
      ownerKey: 'WikiArmorSet.Ninja armor'
    },
    text,
    sourceKind: 'benefit_zh'
  });
  assert.equal(rows.length, 1);
  return rows[0];
}

test('parseEquipmentEffectLines parses common armor set numeric bonuses', () => {
  const cases = [
    ['+9% 暴击率', { statKey: 'crit_chance', valueDecimal: 9, unit: 'percent', classScope: 'all' }],
    ['套装奖励：+20% 移动速度', { statKey: 'move_speed', valueDecimal: 20, unit: 'percent', applyScope: 'set_bonus' }],
    ['+7% 近战暴击率', { statKey: 'crit_chance', valueDecimal: 7, unit: 'percent', classScope: 'melee' }],
    ['+1 仆从容量', { statKey: 'minion_capacity', valueDecimal: 1, unit: 'count' }],
    ['−16% 魔力花费', { statKey: 'mana_cost', valueDecimal: -16, unit: 'percent' }],
    ['20% 的几率不消耗弹药', { statKey: 'ammo_conservation', valueDecimal: 20, unit: 'percent' }],
    ['最大移动速度 ×1.15', { statKey: 'max_move_speed_multiplier', valueDecimal: 1.15, unit: 'multiplier', operation: 'multiply' }],
    ['套装奖励：允许猛冲', { statKey: 'dash_enabled', operation: 'set_flag', unit: 'boolean', applyScope: 'set_bonus' }]
  ];

  for (const [line, expected] of cases) {
    const actual = parseOne(line);
    assert.equal(actual.statKey, expected.statKey, line);
    assert.equal(actual.valueDecimal, expected.valueDecimal ?? null, line);
    assert.equal(actual.unit, expected.unit, line);
    assert.equal(actual.classScope, expected.classScope ?? null, line);
    assert.equal(actual.applyScope, expected.applyScope ?? null, line);
    assert.equal(actual.operation, expected.operation ?? 'add', line);
    assert.equal(actual.parseStatus, 'parsed', line);
  }
});

test('parseEquipmentEffectLines splits variant-prefixed multi-effect armor lines', () => {
  const rows = parseEquipmentEffectLines({
    owner: {
      ownerKind: 'armor_set',
      ownerRecordKey: 'armor-rk',
      ownerId: 38,
      ownerKey: 'WikiArmorSet.Cobalt armor'
    },
    text: '钴头盔：+15% 近战伤害、+10% 移动速度',
    sourceKind: 'benefit_zh'
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.statKey), ['damage_bonus', 'move_speed']);
  assert.deepEqual(rows.map((row) => row.variantLabel), ['钴头盔', '钴头盔']);
  assert.equal(rows[0].classScope, 'melee');
  assert.equal(rows[0].valueDecimal, 15);
  assert.equal(rows[1].valueDecimal, 10);
  assert.equal(rows[0].sourceLine, '钴头盔：+15% 近战伤害、+10% 移动速度');
  assert.equal(rows[0].rawText, '+15% 近战伤害');
  assert.equal(rows[1].rawText, '+10% 移动速度');
});

test('parseEquipmentEffectLines keeps source line while assigning raw text to each unparsed fragment', () => {
  const rows = parseEquipmentEffectLines({
    owner: {
      ownerKind: 'armor_set',
      ownerRecordKey: 'armor-rk',
      ownerId: 51,
      ownerKey: 'WikiArmorSet.Dark Artist armor'
    },
    text: '爆炸烈焰的攻击范围提高 50%、射弹速度提高 40%、视野增加',
    sourceKind: 'benefit_zh'
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.sourceLine), [
    '爆炸烈焰的攻击范围提高 50%、射弹速度提高 40%、视野增加',
    '爆炸烈焰的攻击范围提高 50%、射弹速度提高 40%、视野增加',
    '爆炸烈焰的攻击范围提高 50%、射弹速度提高 40%、视野增加'
  ]);
  assert.deepEqual(rows.map((row) => row.rawText), [
    '爆炸烈焰的攻击范围提高 50%',
    '射弹速度提高 40%',
    '视野增加'
  ]);
  assert.deepEqual(rows.map((row) => row.parseStatus), ['unparsed', 'unparsed', 'unparsed']);
});

test('parseEquipmentEffectLines preserves unparsed lines as special effects', () => {
  const actual = parseOne('套装效果：移动时身后有拖影效果');

  assert.equal(actual.statKey, 'special_effect');
  assert.equal(actual.applyScope, 'visual_or_special');
  assert.equal(actual.parseStatus, 'unparsed');
  assert.equal(actual.confidence, 0.3);
  assert.equal(actual.sourceLine, '套装效果：移动时身后有拖影效果');
  assert.equal(actual.rawText, '移动时身后有拖影效果');
});

test('parseEquipmentEffectLines carries owner and source metadata on every row', () => {
  const rows = parseEquipmentEffectLines({
    owner: {
      ownerKind: 'armor_set',
      ownerRecordKey: 'armor-rk',
      ownerId: 42,
      ownerKey: 'WikiArmorSet.Adamantite armor',
      sourceProvider: 'terraria.wiki.gg',
      sourcePage: 'Armor',
      sourceRevisionTimestamp: '2026-05-22 00:00:00'
    },
    text: '+8% 伤害\n套装奖励：+20% 近战速度、+20% 移动速度',
    sourceKind: 'benefit_zh'
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.sourceLineIndex), [0, 1, 1]);
  for (const row of rows) {
    assert.equal(row.ownerKind, 'armor_set');
    assert.equal(row.ownerRecordKey, 'armor-rk');
    assert.equal(row.ownerId, 42);
    assert.equal(row.ownerKey, 'WikiArmorSet.Adamantite armor');
    assert.equal(row.sourceKind, 'benefit_zh');
    assert.equal(row.sourceLocale, 'zh');
    assert.equal(row.sourceProvider, 'terraria.wiki.gg');
    assert.equal(row.sourcePage, 'Armor');
    assert.equal(row.sourceRevisionTimestamp, '2026-05-22 00:00:00');
  }
});
