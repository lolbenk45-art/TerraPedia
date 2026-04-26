import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_CORE_TABLES,
  buildBackupName,
  buildBackupStatements,
} from './backup-local-core-tables.mjs';

test('buildBackupName produces stable backup table names', () => {
  assert.equal(buildBackupName('items', '20260426_131500'), 'items_backup_20260426_131500');
  assert.equal(buildBackupName('npcs', '20260426_131500'), 'npcs_backup_20260426_131500');
});

test('buildBackupStatements creates create-like and copy statements for each local core table', () => {
  const statements = buildBackupStatements({
    database: 'terria_v1_local',
    suffix: '20260426_131500',
    tables: LOCAL_CORE_TABLES,
  });

  assert.equal(statements.length, LOCAL_CORE_TABLES.length * 2);
  assert.match(statements[0], /CREATE TABLE `terria_v1_local`\.`items_backup_20260426_131500` LIKE `terria_v1_local`\.`items`/);
  assert.match(statements[1], /INSERT INTO `terria_v1_local`\.`items_backup_20260426_131500` SELECT \* FROM `terria_v1_local`\.`items`/);
});
