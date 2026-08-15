import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemTextOverrides } from './sync-local-item-tooltip-zh-to-maint.mjs';

test('buildMaintItemTextOverrides seeds maint-backed zh text overrides from legacy local items', () => {
  const rows = buildMaintItemTextOverrides({
    localItems: [
      { internal_name: 'Furnace', description_zh: '用于熔炼矿石', tooltip_zh: '基础制作站' },
      { internal_name: 'CrimsonAltar', description_zh: '', tooltip_zh: '' },
      { internal_name: 'LeadAnvil', description_zh: '铁砧的对应替代制作站', tooltip_zh: '基础金属制作站' },
    ],
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    recordKey: rows[0].recordKey,
    itemInternalName: 'Furnace',
    tooltipZh: '基础制作站',
    descriptionZh: '用于熔炼矿石',
    sourceProvider: 'terria_v1_local',
    sourcePage: 'items.tooltip_zh+description_zh',
    rawJson: JSON.stringify({
      internalName: 'Furnace',
      tooltipZh: '基础制作站',
      descriptionZh: '用于熔炼矿石',
    }),
    status: 1,
    deleted: 0,
  });
});
