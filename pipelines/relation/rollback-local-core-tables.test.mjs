import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRestoreStatements } from './rollback-local-core-tables.mjs';

test('buildRestoreStatements drops view/table placeholder and renames backup back to original', () => {
  const statements = buildRestoreStatements({
    database: 'terria_v1_local',
    backups: [
      { originalTable: 'items', backupTable: 'items_backup_20260426_131500' },
      { originalTable: 'npcs', backupTable: 'npcs_backup_20260426_131500' },
    ],
  });

  assert.equal(statements.length, 6);
  assert.match(statements[0], /DROP VIEW IF EXISTS `terria_v1_local`\.`items`/);
  assert.match(statements[1], /DROP TABLE IF EXISTS `terria_v1_local`\.`items`/);
  assert.match(statements[2], /RENAME TABLE `terria_v1_local`\.`items_backup_20260426_131500` TO `terria_v1_local`\.`items`/);
});
