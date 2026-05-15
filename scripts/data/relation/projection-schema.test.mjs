import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROJECTION_TABLE_NAMES,
  buildProjectionSchemaStatements
} from './projection-schema.mjs';

test('PROJECTION_TABLE_NAMES stays ordered and complete', () => {
  assert.deepEqual(PROJECTION_TABLE_NAMES, [
    'projection_items',
    'projection_npcs',
    'projection_bosses',
    'projection_projectiles',
    'projection_buffs',
    'projection_armor_sets'
  ]);
});

test('buildProjectionSchemaStatements emits schema-qualified create statements', () => {
  const statements = buildProjectionSchemaStatements();
  assert.equal(statements.length, 6);
  for (const tableName of PROJECTION_TABLE_NAMES) {
    const statement = statements.find((sql) => sql.includes(`\`${tableName}\``));
    assert.ok(statement, `missing statement for ${tableName}`);
    assert.match(statement, /^CREATE TABLE IF NOT EXISTS `terria_v1_relation`\.`projection_/);
  }
});

test('projection npc and projectile schemas include wiki image url columns', () => {
  const statements = buildProjectionSchemaStatements();
  const itemStatement = statements.find((sql) => sql.includes('`projection_items`'));
  const npcStatement = statements.find((sql) => sql.includes('`projection_npcs`'));
  const projectileStatement = statements.find((sql) => sql.includes('`projection_projectiles`'));
  const buffStatement = statements.find((sql) => sql.includes('`projection_buffs`'));

  assert.match(itemStatement, /`source_npcs_json` LONGTEXT/);
  assert.match(npcStatement, /`image_url` VARCHAR\(500\) DEFAULT NULL/);
  assert.match(npcStatement, /`loot_items_json` LONGTEXT/);
  assert.match(npcStatement, /`shop_items_json` LONGTEXT/);
  assert.match(npcStatement, /`source_items_json` LONGTEXT/);
  assert.match(buffStatement, /`inflicting_npcs_json` LONGTEXT/);
  assert.match(buffStatement, /`immune_npcs_json` LONGTEXT/);
  assert.match(projectileStatement, /`image_url` VARCHAR\(500\) DEFAULT NULL/);
  assert.match(projectileStatement, /`source_items_json` LONGTEXT/);
  assert.match(projectileStatement, /`source_npcs_json` LONGTEXT/);
});

test('projection boss schema exposes the public read model fields', () => {
  const statements = buildProjectionSchemaStatements();
  const bossStatement = statements.find((sql) => sql.includes('`projection_bosses`'));

  assert.match(bossStatement, /`code` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(bossStatement, /`name_en` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(bossStatement, /`name_zh` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(bossStatement, /`boss_type` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(bossStatement, /`progression_order` INT DEFAULT NULL/);
  assert.match(bossStatement, /`image_url` VARCHAR\(500\) DEFAULT NULL/);
  assert.match(bossStatement, /`member_npcs_json` LONGTEXT/);
  assert.match(bossStatement, /`loot_items_json` LONGTEXT/);
  assert.match(bossStatement, /`effects_json` LONGTEXT/);
  assert.match(bossStatement, /UNIQUE KEY `uk_projection_bosses_code` \(`code`\)/);
});

test('projection armor set schema includes display images and related item json columns', () => {
  const statements = buildProjectionSchemaStatements();
  const armorStatement = statements.find((sql) => sql.includes('`projection_armor_sets`'));

  assert.match(armorStatement, /`text_key` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(armorStatement, /`entity_type` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(armorStatement, /`composition_kind` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(armorStatement, /`male_images` TEXT/);
  assert.match(armorStatement, /`female_images` TEXT/);
  assert.match(armorStatement, /`special_images` TEXT/);
  assert.match(armorStatement, /`related_items_json` LONGTEXT/);
  assert.match(armorStatement, /UNIQUE KEY `uk_projection_armor_sets_text_key` \(`text_key`\)/);
});
