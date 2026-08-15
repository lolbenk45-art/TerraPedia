import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDropViewStatements } from './drop-local-compat-views.mjs';

test('buildDropViewStatements creates drop view statements for all compat views', () => {
  const statements = buildDropViewStatements({
    database: 'terria_v1_relation',
    viewNames: ['items', 'npcs', 'projectiles', 'buffs'],
  });

  assert.equal(statements.length, 4);
  assert.match(statements[0], /DROP VIEW IF EXISTS `terria_v1_relation`\.`items`/);
  assert.match(statements[3], /DROP VIEW IF EXISTS `terria_v1_relation`\.`buffs`/);
});
