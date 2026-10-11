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
    ['+20% 弹药节约', { statKey: 'ammo_conservation', valueDecimal: 20, unit: 'percent' }],
    ['+3 仆从位', { statKey: 'minion_capacity', valueDecimal: 3, unit: 'count' }],
    ['+2 哨兵栏', { statKey: 'sentry_capacity', valueDecimal: 2, unit: 'count' }],
    ['-750 仇恨', { statKey: 'aggro', valueDecimal: -750, unit: 'count' }],
    ['每级提供 15% 伤害减免', { statKey: 'damage_reduction', valueDecimal: 15, unit: 'percent' }],
    ['提高生命再生速度（每秒 3）', { statKey: 'health_regen', valueDecimal: 3, unit: 'count' }],
    ['提供 2 生命每秒的固定生命再生', { statKey: 'health_regen', valueDecimal: 2, unit: 'count' }],
    ['提高魔力再生速度（每秒大约 10）', { statKey: 'mana_regen', valueDecimal: 10, unit: 'count', classScope: 'magic' }],
    ['-24% 敌怪生成速度', { statKey: 'enemy_spawn_rate', valueDecimal: -24, unit: 'percent' }],
    ['-30% 最大敌怪数量', { statKey: 'enemy_max_count', valueDecimal: -30, unit: 'percent' }],
    ['魔法暴击率增加 12%', { statKey: 'crit_chance', valueDecimal: 12, unit: 'percent', classScope: 'magic' }],
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

test('parseEquipmentEffectLines classifies explicit mitigation and knockback units', () => {
  const mitigation = parseOne('+5% 伤害减免');
  assert.equal(mitigation.statKey, 'damage_reduction');
  assert.equal(mitigation.valueDecimal, 5);
  assert.equal(mitigation.unit, 'percent');

  const knockback = parseOne('+50% 远程击退');
  assert.equal(knockback.statKey, 'knockback');
  assert.equal(knockback.valueDecimal, 50);
  assert.equal(knockback.unit, 'percent');
  assert.equal(knockback.classScope, 'ranged');
});

test('parseEquipmentEffectLines parses explicit dash and fixed critical-hit effects', () => {
  const dash = parseOne('双击 ◀ 左 或 ▶ 右 键时能够猛冲');
  assert.equal(dash.statKey, 'dash_enabled');
  assert.equal(dash.operation, 'set_flag');
  assert.equal(dash.unit, 'boolean');

  const crit = parseOne('且具有 1/6 (16.67%) 的固定暴击率');
  assert.equal(crit.statKey, 'crit_chance');
  assert.equal(crit.valueDecimal, 16.67);
  assert.equal(crit.unit, 'percent');
  assert.equal(crit.classScope, 'all');
});

test('parseEquipmentEffectLines splits acceleration and movement multiplier effects', () => {
  const rows = parseEquipmentEffectLines({
    text: '+75% 加速度与减速度和 ×1.15 最大移动速度',
    sourceKind: 'benefit_zh',
  });

  assert.deepEqual(rows.map(row => [row.effectIndex, row.statKey, row.valueDecimal, row.unit, row.operation]), [
    [0, 'acceleration', 75, 'percent', 'add'],
    [1, 'max_move_speed_multiplier', 1.15, 'multiplier', 'multiply'],
  ]);
});

test('parseEquipmentEffectLines keeps compound ranged multiplier conditions intact', () => {
  const actual = parseOne('弓、连弩、箭、和尖桩的伤害 ×1.12[1]');
  assert.equal(actual.statKey, 'damage_bonus');
  assert.equal(actual.operation, 'multiply');
  assert.equal(actual.valueDecimal, 1.12);
  assert.equal(actual.unit, 'multiplier');
  assert.equal(actual.classScope, 'ranged');
  assert.equal(actual.conditionText, '弓、连弩、箭、和尖桩');
  assert.equal(actual.parseStatus, 'parsed');
});

test('parseEquipmentEffectLines keeps qualified numeric breakdowns inside parentheses on one source row', () => {
  const rows = parseEquipmentEffectLines({
    text: '+21% 近战伤害（近战 +16%；全部伤害类型 +5%）',
    sourceKind: 'benefit_zh',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rawText, '+21% 近战伤害（近战 +16%；全部伤害类型 +5%）');
  assert.equal(rows[0].statKey, 'damage_bonus');
  assert.equal(rows[0].valueDecimal, 21);
  assert.equal(rows[0].classScope, 'melee');
  assert.equal(rows[0].parseStatus, 'parsed');
});

test('parseEquipmentEffectLines preserves platform conditions on simple numeric bonuses', () => {
  const rows = parseEquipmentEffectLines({
    text: '(电脑版、主机版、和移动版) -15% 魔力消耗\n(电脑版、主机版、和移动版) +20% 移动速度',
    sourceKind: 'benefit_zh'
  });

  assert.deepEqual(rows.map(row => [row.statKey, row.valueDecimal, row.unit, row.conditionText, row.parseStatus]), [
    ['mana_cost', -15, 'percent', '电脑版、主机版、和移动版', 'parsed'],
    ['move_speed', 20, 'percent', '电脑版、主机版、和移动版', 'parsed'],
  ]);
});

test('parseEquipmentEffectLines parses inline per-second health regeneration', () => {
  const row = parseOne('+2 生命/秒的生命再生');
  assert.equal(row.statKey, 'health_regen');
  assert.equal(row.valueDecimal, 2);
  assert.equal(row.unit, 'count');
  assert.equal(row.parseStatus, 'parsed');
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

test('parseEquipmentEffectLines parses explicit beetle damage and speed tiers as two effects', () => {
  const rows = parseEquipmentEffectLines({
    text: '套装奖励：每级提供 10% 近战伤害和近战速度，最高 30% 近战伤害和近战速度',
    sourceKind: 'benefit_zh',
  });

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => row.effectIndex), [0, 1, 2, 3]);
  assert.deepEqual(rows.map(row => [row.statKey, row.valueDecimal, row.conditionText, row.parseStatus]), [
    ['damage_bonus', 10, '每级', 'parsed'],
    ['melee_speed', 10, '每级', 'parsed'],
    ['damage_bonus', 30, '最高', 'parsed'],
    ['melee_speed', 30, '最高', 'parsed'],
  ]);
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

test('parseEquipmentEffectLines marks headings and empty labels as non-effects', () => {
  const rows = parseEquipmentEffectLines({
    text: '套装奖励：\n(电脑版、主机版、和移动版) 套装效果\n套装奖励',
    sourceKind: 'benefit_zh',
  });

  assert.deepEqual(rows.map(row => [row.statKey, row.parseStatus, row.operation, row.valueDecimal]), [
    ['special_effect', 'non_effect', null, null],
    ['special_effect', 'non_effect', null, null],
    ['special_effect', 'non_effect', null, null],
  ]);
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
