import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCutoverStatements } from './cutover-local-core-tables-to-relation-views.mjs';

test('buildCutoverStatements drops local table and recreates it as a relation-backed view', () => {
  const statements = buildCutoverStatements({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    tableNames: ['items', 'npcs'],
  });

  assert.equal(statements.length, 6);
  assert.match(statements[0], /DROP VIEW IF EXISTS `terria_v1_local`\.`items`/);
  assert.match(statements[1], /DROP TABLE IF EXISTS `terria_v1_local`\.`items`/);
  assert.match(statements[2], /CREATE OR REPLACE VIEW `terria_v1_local`\.`items` AS SELECT \* FROM `terria_v1_relation`\.`items`/);
  assert.match(statements[5], /CREATE OR REPLACE VIEW `terria_v1_local`\.`npcs` AS SELECT \* FROM `terria_v1_relation`\.`npcs`/);
});
