import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArmorSetBonuses } from './armor-set-module-parser.mjs';

test('parseArmorSetBonuses keeps the first Create statement after Initialize', () => {
  const content = [
    'ArmorSetBonuses.Initialize = function()',
    'ArmorSetBonuses.Create(ArmorSetBonuses.Benefits.Shroomite, "ArmorSetBonus.Shroomite"):Set(1548, 1549, 1550):Set(1546, 1549, 1550):Set(1547, 1549, 1550):Add();',
    'end'
  ].join('\n');

  assert.deepEqual(parseArmorSetBonuses(content), [{
    benefitExpression: 'ArmorSetBonuses.Benefits.Shroomite',
    primaryPart: null,
    setCount: 3,
    sets: [[1548, 1549, 1550], [1546, 1549, 1550], [1547, 1549, 1550]],
    textKey: 'ArmorSetBonus.Shroomite',
    uniqueItemIds: [1548, 1549, 1550, 1546, 1547]
  }]);
});
