import assert from 'node:assert/strict'
import test from 'node:test'

import {
  armorBenefitLineIsAttributeSummary,
  armorEffectFromLine,
  armorEffectLineNumericMatch,
  armorEffectLinesFromLine,
  armorHighlightedTextSegments,
  armorIdentityAliases,
  armorLineLooksLikeNumericSetAttribute,
  armorLineLooksLikePlainAttribute,
  dedupeEffectLines,
  fallbackStatKey,
  fallbackStatLabel,
  normalizeEffectLine,
  normalizeMatchText,
  statLabels,
} from '../../utils/armorEffectParsing.ts'

test('statLabels covers the twelve canonical stat keys', () => {
  const expected = {
    damage_bonus: '伤害',
    crit_chance: '暴击',
    move_speed: '移速',
    melee_speed: '近战速度',
    summon_damage: '召唤伤害',
    minion_capacity: '仆从',
    sentry_capacity: '哨兵',
    ammo_conservation: '弹药节省',
    knockback: '击退',
    defense: '防御',
    threat: '仇恨',
    mana_max: '魔力',
    mana_cost: '魔耗',
    mining_speed: '挖矿',
    special_effect: '特效',
  }
  for (const [key, label] of Object.entries(expected)) {
    assert.equal(statLabels[key], label, `statLabels.${key} should map to ${label}`)
  }
})

test('fallbackStatKey routes Chinese benefit text to the right stat key', () => {
  const cases = [
    ['哨兵容量增加 1', 'sentry_capacity'],
    ['仆从容量增加 1', 'minion_capacity'],
    ['+12% 召唤伤害', 'summon_damage'],
    ['20% 的几率不消耗弹药', 'ammo_conservation'],
    ['击退提高', 'knockback'],
    ['3 防御', 'defense'],
    ['+10% 暴击率', 'crit_chance'],
    ['+10% 近战速度', 'melee_speed'],
    ['挖矿速度提升', 'mining_speed'],
    ['+20% 移动速度', 'move_speed'],
    ['+60 最大魔力', 'mana_max'],
    ['魔力上限提高 60', 'mana_max'],
    ['魔力消耗降低 17%', 'mana_cost'],
    ['减少仇恨', 'threat'],
    ['+15% 魔法伤害', 'damage_bonus'],
    ['提供一个漂亮的光环', 'special_effect'],
  ]
  for (const [line, key] of cases) {
    assert.equal(fallbackStatKey(line), key, `${line} -> ${key}`)
  }
})

test('fallbackStatLabel derives the readable label from the stat key', () => {
  assert.equal(fallbackStatLabel('+15% 魔法伤害'), '伤害')
  assert.equal(fallbackStatLabel('魔力消耗降低 17%'), '魔耗')
  assert.equal(fallbackStatLabel('提供一个漂亮的光环'), '特效')
})

test('armorLineLooksLikePlainAttribute accepts leading numeric attributes only', () => {
  assert.equal(armorLineLooksLikePlainAttribute('+15% 伤害'), true)
  assert.equal(armorLineLooksLikePlainAttribute('+60 魔力'), true)
  // set-bonus / descriptive lines are rejected
  assert.equal(armorLineLooksLikePlainAttribute('套装奖励：+12% 召唤伤害'), false)
  assert.equal(armorLineLooksLikePlainAttribute('魔力消耗降低 17%'), false)
  assert.equal(armorLineLooksLikePlainAttribute('免疫击退'), false)
})

test('armorLineLooksLikeNumericSetAttribute matches numeric set bonuses but not scaling lines', () => {
  assert.equal(armorLineLooksLikeNumericSetAttribute('魔力消耗降低 17%'), true)
  assert.equal(armorLineLooksLikeNumericSetAttribute('20% 的几率不消耗弹药'), true)
  // Regression: 每级/持续/召唤 scaling lines are excluded so they never leak into 最终汇总.
  assert.equal(armorLineLooksLikeNumericSetAttribute('每级提高 5% 伤害'), false)
  assert.equal(armorLineLooksLikeNumericSetAttribute('持续 10 秒造成 30 点伤害'), false)
  assert.equal(armorLineLooksLikeNumericSetAttribute('召唤一个飞龙造成 50 点伤害'), false)
})

test('armorEffectLineNumericMatch extracts percentages, integers, and降低-style values', () => {
  const percent = armorEffectLineNumericMatch('+15% 魔法伤害')
  assert.equal(percent?.[1]?.replace('−', '-'), '+15')
  assert.equal(percent?.[2], '%')

  const flat = armorEffectLineNumericMatch('+60 魔力')
  assert.equal(flat?.[1], '+60')
  assert.equal(flat?.[2], '')

  const lowered = armorEffectLineNumericMatch('魔力消耗降低 17%')
  assert.equal(lowered?.[1], '17')
  assert.equal(lowered?.[2], '%')

  // trailing-attribute alternative: number precedes a known stat keyword
  const trailing = armorEffectLineNumericMatch('20% 的几率不消耗弹药')
  assert.equal(trailing?.[1], '20')
  assert.equal(trailing?.[2], '%')
})

test('armorEffectFromLine produces a fallback attribute with parsed value and unit', () => {
  const percentEffect = armorEffectFromLine('+15% 魔法伤害')
  assert.equal(percentEffect.statKey, 'damage_bonus')
  assert.equal(percentEffect.valueDecimal, 15)
  assert.equal(percentEffect.unit, 'percent')
  assert.equal(percentEffect.parseStatus, 'fallback')

  const flatEffect = armorEffectFromLine('+60 最大魔力')
  assert.equal(flatEffect.statKey, 'mana_max')
  assert.equal(flatEffect.valueDecimal, 60)
  assert.equal(flatEffect.unit, 'flat')

  // non-numeric descriptive line stays unparsed with null value
  const descriptive = armorEffectFromLine('提供一个漂亮的光环')
  assert.equal(descriptive.valueDecimal, null)
  assert.equal(descriptive.parseStatus, 'unparsed')
  assert.equal(descriptive.rawText, '提供一个漂亮的光环')
})

test('armorEffectLinesFromLine splits multi-attribute set bonuses into one line each', () => {
  // Regression marker sample from the page.
  const lines = armorEffectLinesFromLine('套装奖励：+20% 近战速度、+20% 移动速度')
  assert.deepEqual(lines, [
    '套装奖励：+20% 近战速度',
    '套装奖励：+20% 移动速度',
  ])

  // single-attribute line is returned as-is
  assert.deepEqual(armorEffectLinesFromLine('套装奖励：+17% 魔法伤害'), ['套装奖励：+17% 魔法伤害'])

  // Regression: 召唤 scaling keyword excludes the line from numeric summaries, so it stays readable text.
  assert.deepEqual(armorEffectLinesFromLine('套装奖励：+12% 召唤伤害'), [])

  // pure descriptive line yields nothing
  assert.deepEqual(armorEffectLinesFromLine('穿戴整套后获得一层护盾'), [])
})

test('armorBenefitLineIsAttributeSummary flags numeric and split lines', () => {
  assert.equal(armorBenefitLineIsAttributeSummary('+15% 伤害'), true)
  assert.equal(armorBenefitLineIsAttributeSummary('套装奖励：+20% 近战速度、+20% 移动速度'), true)
  assert.equal(armorBenefitLineIsAttributeSummary('穿戴整套后获得一层护盾'), false)
})

test('armorHighlightedTextSegments marks numeric fragments for highlighting', () => {
  const segments = armorHighlightedTextSegments('魔力消耗降低 17%')
  const highlighted = segments.filter((segment) => segment.highlight).map((segment) => segment.text.trim())
  assert.deepEqual(highlighted, ['17%'])
  // reassembling the segments reproduces the original line
  assert.equal(segments.map((segment) => segment.text).join(''), '魔力消耗降低 17%')

  // a line with no number returns a single plain segment
  const plain = armorHighlightedTextSegments('免疫击退')
  assert.equal(plain.length, 1)
  assert.equal(plain[0].highlight, false)
})

test('normalizeMatchText and normalizeEffectLine strip punctuation for fuzzy compares', () => {
  assert.equal(normalizeMatchText('神圣·兜帽 (Hallowed)'), '神圣兜帽hallowed')
  assert.equal(normalizeEffectLine('+20% 近战速度'), '20%近战速度')
  assert.equal(normalizeEffectLine('−17% 魔耗'), '-17%魔耗')
})

test('dedupeEffectLines removes punctuation-equivalent duplicates while keeping order', () => {
  const deduped = dedupeEffectLines([
    '+20% 近战速度',
    ' +20%近战速度 ',
    '+20% 移动速度',
    '',
  ])
  assert.deepEqual(deduped, ['+20% 近战速度', '+20% 移动速度'])
})

test('armorIdentityAliases generates ancient / 远古 name variants', () => {
  const chineseAliases = armorIdentityAliases('神圣兜帽')
  assert.ok(chineseAliases.includes('神圣兜帽'))
  assert.ok(chineseAliases.includes('远古神圣兜帽'))

  const strippedAncient = armorIdentityAliases('远古神圣兜帽')
  assert.ok(strippedAncient.includes('神圣兜帽'))

  const englishAliases = armorIdentityAliases('Hallowed Mask')
  assert.ok(englishAliases.includes(normalizeMatchText('Hallowed Mask')))
  assert.ok(englishAliases.includes(normalizeMatchText('Ancient Hallowed Mask')))

  // too-short values are dropped (single lowercase char cannot spawn an Ancient variant)
  assert.deepEqual(armorIdentityAliases('a'), [])
})
