import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RELATION_COMPAT_VIEWS,
  buildCreateViewSql,
} from './create-local-compat-views.mjs';

test('buildCreateViewSql creates relation-side items compatibility view over projection_items', () => {
  const sql = buildCreateViewSql({
    targetDatabase: 'terria_v1_relation',
    viewName: 'items',
    sourceTable: 'projection_items',
    columns: RELATION_COMPAT_VIEWS.items.columns,
  });

  assert.match(sql, /CREATE OR REPLACE VIEW `terria_v1_relation`\.`items` AS/);
  assert.match(sql, /FROM `terria_v1_relation`\.`projection_items`/);
  assert.ok(!sql.includes('relation_record_key'));
});

test('relation compatibility view config covers items nocs projectiles and buffs', () => {
  assert.deepEqual(Object.keys(RELATION_COMPAT_VIEWS), ['items', 'npcs', 'projectiles', 'buffs']);
});

test('projectile compatibility view exposes source relation json columns', () => {
  const sql = buildCreateViewSql({
    targetDatabase: 'terria_v1_relation',
    viewName: 'projectiles',
    sourceTable: 'projection_projectiles',
    columns: RELATION_COMPAT_VIEWS.projectiles.columns,
  });

  assert.match(sql, /`source_items_json`/);
  assert.match(sql, /`source_npcs_json`/);
});
