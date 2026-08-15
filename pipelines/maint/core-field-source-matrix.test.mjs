import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CORE_FIELD_SOURCE_MATRIX,
  buildCoreFieldSourceMatrixReport,
} from './core-field-source-matrix.mjs';

test('buildCoreFieldSourceMatrixReport summarizes source modes and local bridges', () => {
  const report = buildCoreFieldSourceMatrixReport(CORE_FIELD_SOURCE_MATRIX);

  assert.equal(report.summary.domainCount, 4);
  assert.equal(report.summary.fieldCount, 26);
  assert.equal(report.summary.sourceModeBreakdown.stable, 21);
  assert.equal(report.summary.sourceModeBreakdown.bridge, 3);
  assert.equal(report.summary.sourceModeBreakdown.gap, 2);
  assert.equal(report.summary.localBridgeFieldCount, 3);

  const bridgeKeys = report.localBridgeFields.map((field) => `${field.domain}.${field.field}`);
  assert.deepEqual(bridgeKeys.sort(), ['items.description_zh', 'items.image', 'items.tooltip_zh']);
});

test('core field source matrix keeps projectile flag fields maint-backed and non-local', () => {
  const projectileFields = CORE_FIELD_SOURCE_MATRIX.projectiles;
  const friendly = projectileFields.find((field) => field.field === 'friendly');
  const hostile = projectileFields.find((field) => field.field === 'hostile');
  const tileCollide = projectileFields.find((field) => field.field === 'tile_collide');

  assert.equal(friendly?.sourceMode, 'stable');
  assert.equal(hostile?.sourceMode, 'stable');
  assert.equal(tileCollide?.sourceMode, 'stable');
  assert.deepEqual(friendly?.localDependencies ?? [], []);
  assert.match((tileCollide?.notes ?? ''), /normalizes null tileCollide values to true/i);
});
