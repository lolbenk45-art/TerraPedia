import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAINT_TABLE_NAMES,
  buildMaintSchemaSql,
} from './maint-schema.mjs';

test('buildMaintSchemaSql creates all maint tables', () => {
  const sql = buildMaintSchemaSql();

  assert.deepEqual(MAINT_TABLE_NAMES, [
    'maint_items',
    'maint_npcs',
    'maint_projectiles',
    'maint_buffs',
  ]);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_items`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_npcs`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_projectiles`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_buffs`/);
  assert.match(sql, /`landing_source_key` VARCHAR\(255\) NOT NULL/);
  assert.match(sql, /`landing_content_hash` CHAR\(64\) NOT NULL/);
  assert.match(sql, /`raw_json` LONGTEXT NOT NULL/);
});
