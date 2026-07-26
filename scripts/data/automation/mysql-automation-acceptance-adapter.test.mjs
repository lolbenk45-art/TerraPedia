import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBoundedSnapshotPlan,
  buildSnapshotInsertSql,
  buildSnapshotRowMatchSql,
  buildSnapshotRowSelect,
  buildSchemaDumpArgs,
  createMysqlCommandClient,
  requiresBootstrapMigrationSession,
  rewriteFrozenCreateTable,
  rewriteSchemaForIsolatedDatabase,
  validateTemporaryAccountGrants
} from './mysql-automation-acceptance-adapter.mjs';

test('snapshot verification matches every frozen value with null-safe predicates', () => {
  const sql = buildSnapshotRowMatchSql({
    table: 'buffs',
    row: { id: '1', name: "O'Brien", optional_value: null, source_only: 'ignored' },
    targetColumns: ['id', 'name', 'optional_value']
  });
  assert.match(sql, /^SELECT COUNT\(\*\) FROM `buffs` WHERE /);
  assert.match(sql, /`id` <=> '1'/);
  assert.match(sql, /`name` <=> 'O\\'Brien'/);
  assert.match(sql, /`optional_value` <=> NULL/);
  assert.doesNotMatch(sql, /source_only/);
});

test('schema snapshot dump stays compatible with SELECT-only accounts', () => {
  const args = buildSchemaDumpArgs({
    credentials: { host: '127.0.0.1', port: 13306, username: 'readonly' },
    database: 'terria_v1_local',
    table: 'items'
  });
  for (const flag of ['--no-tablespaces', '--single-transaction', '--skip-lock-tables', '--no-data']) {
    assert.equal(args.includes(flag), true);
  }
  assert.equal(args.some((value) => /password/i.test(value)), false);
});

test('frozen runtime-owned table DDL can create only the same table in an isolated database', () => {
  const sql = rewriteFrozenCreateTable({
    sourceSql: 'CREATE TABLE `source_dataset_landings` (`id` bigint NOT NULL) ENGINE=InnoDB',
    table: 'source_dataset_landings',
    targetDatabase: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local'
  });
  assert.match(sql, /^CREATE TABLE `source_dataset_landings`/);
  assert.throws(() => rewriteFrozenCreateTable({
    sourceSql: 'CREATE TABLE `users` (`id` bigint NOT NULL)',
    table: 'source_dataset_landings',
    targetDatabase: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local'
  }), /table identity/i);
  assert.throws(() => rewriteFrozenCreateTable({
    sourceSql: 'CREATE TABLE `source_dataset_landings` AS SELECT * FROM terria_v1_local.users',
    table: 'source_dataset_landings',
    targetDatabase: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local'
  }), /formal database|unsafe|table identity/i);
});

test('snapshot rows freeze source values while copy projects only safe common columns', () => {
  const select = buildSnapshotRowSelect({
    table: 'buffs',
    columns: ['id', 'name', 'immune_npcs_json', 'api_token'],
    maxRows: 2
  });
  assert.match(select, /JSON_OBJECT/);
  assert.match(select, /`immune_npcs_json`/);
  assert.doesNotMatch(select, /api_token/);
  assert.match(select, /LIMIT 2/);

  const insert = buildSnapshotInsertSql({
    table: 'buffs',
    row: { id: '1', name: "O'Brien", immune_npcs_json: '[1]', source_only: 'ignored' },
    targetColumns: ['id', 'name', 'immune_npcs_json', 'target_only']
  });
  assert.match(insert, /^INSERT INTO `buffs` \(`id`, `immune_npcs_json`, `name`\)/);
  assert.match(insert, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(insert, /INSERT IGNORE/);
  assert.match(insert, /O\\'Brien/);
  assert.doesNotMatch(insert, /source_only|target_only/);
});

test('only trigger DDL requires the isolated bootstrap migration session', () => {
  assert.equal(requiresBootstrapMigrationSession('CREATE TABLE sample (id INT)'), false);
  assert.equal(requiresBootstrapMigrationSession('CREATE TRIGGER sample BEFORE UPDATE ON t FOR EACH ROW SET @x=1'), true);
  assert.throws(() => requiresBootstrapMigrationSession('SET GLOBAL log_bin_trust_function_creators=1'), /global/i);
});

test('mysql command client passes SQL on stdin and keeps credentials out of argv', async () => {
  const calls = [];
  const client = createMysqlCommandClient({
    host: '127.0.0.1',
    port: 13306,
    username: 'temporary-user',
    password: 'top-secret',
    execute: async (input) => {
      calls.push(input);
      return { stdout: 'ok\n', stderr: '', exitCode: 0 };
    }
  });

  assert.equal(await client.query('SELECT 1'), 'ok\n');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stdin, 'SELECT 1');
  assert.equal(calls[0].args.some((value) => value.includes('top-secret')), false);
  assert.equal(calls[0].env.MYSQL_PWD, 'top-secret');
});

test('schema rewrite replaces the one reviewed formal qualifier and rejects every remaining formal token', () => {
  const rewritten = rewriteSchemaForIsolatedDatabase({
    sql: "SELECT * FROM `terria_v1_maint`.`maint_items`;",
    replacements: { terria_v1_maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint' },
    targetDatabase: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local'
  });
  assert.match(rewritten, /automation_acceptance/);
  assert.doesNotMatch(rewritten, /terria_v1_(?:local|maint|relation)(?![a-z0-9_])/i);

  assert.throws(() => rewriteSchemaForIsolatedDatabase({
    sql: 'SELECT * FROM terria_v1_relation.items',
    replacements: {},
    targetDatabase: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local'
  }), /formal database reference/i);
});

test('bounded snapshot plan is deduplicated, allowlisted, and capped', () => {
  const plan = buildBoundedSnapshotPlan({ maxRowsPerTable: 3 });
  assert.ok(plan.length > 3);
  assert.equal(new Set(plan.map(({ role, table }) => `${role}.${table}`)).size, plan.length);
  assert.equal(plan.every((entry) => ['local', 'maint', 'relation'].includes(entry.role)), true);
  assert.equal(plan.every((entry) => entry.maxRows === 3), true);
  assert.equal(plan.some((entry) => entry.role === 'local' && entry.table === 'items'), true);
  assert.equal(plan.some((entry) => entry.role === 'maint' && entry.table === 'maint_items'), true);
  assert.equal(plan.some((entry) => entry.role === 'relation'), true);
  assert.throws(() => buildBoundedSnapshotPlan({ maxRowsPerTable: 0 }), /row cap/i);
});

test('temporary account grants accept exact isolation and formal read-only grants only', () => {
  const databases = {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation'
  };
  assert.equal(validateTemporaryAccountGrants({
    provisionerGrants: Object.values(databases).map((name) => `GRANT ALL PRIVILEGES ON \`${name}\`.* TO \`p\`@\`%\``),
    readonlyGrants: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
      .map((name) => `GRANT SELECT, SHOW VIEW ON \`${name}\`.* TO \`r\`@\`%\``),
    databases
  }), true);

  assert.throws(() => validateTemporaryAccountGrants({
    provisionerGrants: ['GRANT ALL PRIVILEGES ON *.* TO `p`@`%`'],
    readonlyGrants: [],
    databases
  }), /global|formal|grant/i);
  assert.throws(() => validateTemporaryAccountGrants({
    provisionerGrants: Object.values(databases).map((name) => `GRANT ALL ON \`${name}\`.* TO \`p\`@\`%\``),
    readonlyGrants: ['GRANT INSERT ON `terria_v1_local`.* TO `r`@`%`'],
    databases
  }), /read.only|grant/i);
});
