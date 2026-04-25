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
    'projection_projectiles',
    'projection_buffs'
  ]);
});

test('buildProjectionSchemaStatements emits schema-qualified create statements', () => {
  const statements = buildProjectionSchemaStatements();
  assert.equal(statements.length, 4);
  for (const tableName of PROJECTION_TABLE_NAMES) {
    const statement = statements.find((sql) => sql.includes(`\`${tableName}\``));
    assert.ok(statement, `missing statement for ${tableName}`);
    assert.match(statement, /^CREATE TABLE IF NOT EXISTS `terria_v1_relation`\.`projection_/);
  }
});
