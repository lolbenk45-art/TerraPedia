import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEntityFieldAudit } from './entity-field-audit.mjs';

test('buildEntityFieldAudit reports coverage and missing fields by domain', () => {
  const actual = buildEntityFieldAudit({
    localSummary: {
      items: { total: 2, image: 2, nameZh: 2, descriptionZh: 1 },
      buffs: { total: 1, image: 1, nameZh: 1 }
    },
    relationSummary: {
      items: { total: 2, image: 1, nameZh: 0, descriptionZh: 0 },
      buffs: { total: 0, image: 0, nameZh: 0 }
    }
  });

  assert.equal(actual.domains.items.fields.image.localCoverage, 2);
  assert.equal(actual.domains.items.fields.image.relationCoverage, 1);
  assert.equal(actual.domains.items.fields.nameZh.gap, 2);
  assert.equal(actual.domains.buffs.fields.image.gap, 1);
  assert.equal(actual.summary.totalGaps, 6);
});
