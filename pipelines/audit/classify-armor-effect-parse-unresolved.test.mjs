import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_EFFECT_PARSE_UNRESOLVED_CLASSIFICATION_SCHEMA,
  buildArmorEffectParseUnresolvedClassification,
  validateArmorEffectParseUnresolvedClassification,
} from './classify-armor-effect-parse-unresolved.mjs';

const hash = 'sha256:' + 'a'.repeat(64);

function input() {
  return {
    evidenceHash: hash,
    blockers: [
      { code: 'source-effect-parse-unresolved', textKey: 'ArmorSetBonus.A', sourceLineIndex: 0 },
      { code: 'source-effect-parse-unresolved', textKey: 'ArmorSetBonus.A', sourceLineIndex: 1 },
      { code: 'source-effect-parse-unresolved', textKey: 'ArmorSetBonus.A', sourceLineIndex: 1 },
      { code: 'source-effect-parse-unresolved', textKey: 'ArmorSetBonus.A', sourceLineIndex: 2 },
      { code: 'source-effect-parse-unresolved', textKey: 'ArmorSetBonus.B', sourceLineIndex: 0 },
      { code: 'source-effect-parse-unresolved', textKey: 'ArmorSetBonus.C', sourceLineIndex: 0 },
    ],
    modulePayload: {
      armorSets: [
        { textKey: 'ArmorSetBonus.A', uniqueItemIds: [1, 2, 3], effectText: '(电脑版、主机版、和移动版) -15% 魔力消耗\n玩家移动时留下残影\n套装奖励：提供 15 / 30 / 45 伤害', effectTextSource: { pageTitle: 'A armor' } },
        { textKey: 'ArmorSetBonus.B', uniqueItemIds: [4, 5, 6], effectText: '+2 生命/秒的生命再生', effectTextSource: { pageTitle: 'B armor' } },
        { textKey: 'ArmorSetBonus.C', uniqueItemIds: [7, 8, 9], effectText: '双击方向键召唤风暴', effectTextSource: { pageTitle: 'C armor' } },
      ],
    },
  };
}

test('classifies unresolved effects conservatively and counts repeated owner blockers', () => {
  const result = buildArmorEffectParseUnresolvedClassification(input());
  assert.equal(result.schemaVersion, ARMOR_EFFECT_PARSE_UNRESOLVED_CLASSIFICATION_SCHEMA);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.summary.totalOccurrences, 6);
  assert.equal(result.summary.uniqueLines, 5);
  assert.deepEqual(result.summary.byCategory, {
    'behavior-trigger': 1,
    'compound-numeric': 1,
    'non-effect-label': 0,
    'numeric-simple': 2,
    'unknown-prose': 0,
    'visual-behavior': 2,
  });
  const repeated = result.entries.find(entry => entry.textKey === 'ArmorSetBonus.A' && entry.sourceLineIndex === 1);
  assert.equal(repeated.occurrences, 2);
  assert.equal(validateArmorEffectParseUnresolvedClassification(result), true);
});

test('rejects a blocker whose effect owner or line is absent from the frozen module payload', () => {
  const value = input();
  value.blockers[0].textKey = 'ArmorSetBonus.Missing';
  assert.throws(() => buildArmorEffectParseUnresolvedClassification(value), /owner|line|evidence/i);
});

test('round-trip validation preserves the classification hash', () => {
  const value = buildArmorEffectParseUnresolvedClassification(input());
  assert.equal(validateArmorEffectParseUnresolvedClassification(JSON.parse(JSON.stringify(value))), true);
});
