import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMaintItemTextOverrides } from './sync-local-item-tooltip-zh-to-maint.mjs';

test('buildMaintItemTextOverrides seeds maint-backed zh tooltip overrides from legacy local items', () => {
  const rows = buildMaintItemTextOverrides({
    localItems: [
      { internal_name: 'Furnace', tooltip_zh: '基础制作站' },
      { internal_name: 'CrimsonAltar', tooltip_zh: '' },
      { internal_name: 'LeadAnvil', tooltip_zh: '基础金属制作站' },
    ],
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    recordKey: rows[0].recordKey,
    itemInternalName: 'Furnace',
    tooltipZh: '基础制作站',
    sourceProvider: 'terria_v1_local',
    sourcePage: 'items.tooltip_zh',
    rawJson: JSON.stringify({
      internalName: 'Furnace',
      tooltipZh: '基础制作站',
    }),
    status: 1,
    deleted: 0,
  });
});
