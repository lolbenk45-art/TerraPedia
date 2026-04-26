import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReplaceSql } from './materialize-relation-core-into-local.mjs';

test('buildReplaceSql builds delete-plus-insert statements from relation compat tables into local core tables', () => {
  const actual = buildReplaceSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    tableName: 'items',
    columns: ['id', 'name', 'internal_name', 'image'],
  });

  assert.equal(actual.deleteSql, 'DELETE FROM `terria_v1_local`.`items`');
  assert.equal(
    actual.insertSql,
    'INSERT INTO `terria_v1_local`.`items` (`id`, `name`, `internal_name`, `image`) SELECT `id`, `name`, `internal_name`, `image` FROM `terria_v1_relation`.`items`'
  );
});
