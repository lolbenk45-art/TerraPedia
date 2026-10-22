import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBoundedSnapshotPlan,
  buildSnapshotInsertSql,
  buildSnapshotRowMatchSql,
  buildSnapshotRowSelect,
  buildSnapshotTargetRow,
  buildSchemaDumpArgs,
  buildUnavailableSourceSnapshotEntry,
  buildIsolatedApiAccountGrants,
  buildIsolatedMigrationInputManifest,
  createLiveAutomationAdapter,
  createMysqlCommandClient,
  defaultExecute,
  requiresBootstrapMigrationSession,
  rewriteMysqlCliCompoundTriggerDelimiters,
  rewriteFrozenCreateTable,
  rewriteSchemaForIsolatedDatabase,
  validateIsolatedApiAccountGrants,
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

test('pre-V56 landing rows use the exact isolated migration backfill projection', () => {
  const row = buildSnapshotTargetRow({
    role: 'local',
    table: 'source_dataset_landings',
    row: { id: '7', source_key: 'wiki.page.sample', source_page: null },
    targetColumns: ['id', 'source_key', 'source_page', 'artifact_role', 'producer_id',
      'producer_version', 'producer_run_key'],
  });
  assert.deepEqual(row, {
    id: '7',
    source_key: 'wiki.page.sample',
    source_page: 'wiki.page.sample',
    artifact_role: 'legacy_compat',
    producer_id: 'legacy.source-dataset-importer',
    producer_version: 'pre-v56',
    producer_run_key: 'legacy-7',
  });
  assert.deepEqual(buildSnapshotTargetRow({
    role: 'local', table: 'items', row: { id: '7' }, targetColumns: ['id'],
  }), { id: '7' });
});

test('only trigger DDL requires the isolated bootstrap migration session', () => {
  assert.equal(requiresBootstrapMigrationSession('CREATE TABLE sample (id INT)'), false);
  assert.equal(requiresBootstrapMigrationSession('CREATE TRIGGER sample BEFORE UPDATE ON t FOR EACH ROW SET @x=1'), true);
  assert.throws(() => requiresBootstrapMigrationSession('SET GLOBAL log_bin_trust_function_creators=1'), /global/i);
});

test('mysql CLI migrations wrap compound trigger bodies with a client delimiter', () => {
  const sql = [
    'ALTER TABLE sample ADD COLUMN marker INT;',
    'CREATE TRIGGER sample_guard',
    'BEFORE INSERT ON sample FOR EACH ROW',
    'BEGIN',
    '  IF NEW.marker < 0 THEN',
    "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'marker must be positive';",
    '  END IF;',
    'END;',
    'CREATE TABLE after_trigger (id INT);',
  ].join('\n');
  const rewritten = rewriteMysqlCliCompoundTriggerDelimiters(sql);
  assert.match(rewritten, /DELIMITER \$\$/);
  assert.match(rewritten, /END\$\$/);
  assert.match(rewritten, /DELIMITER ;/);
  assert.match(rewritten, /CREATE TABLE after_trigger/);
  assert.equal(rewriteMysqlCliCompoundTriggerDelimiters('CREATE TRIGGER simple BEFORE UPDATE ON t FOR EACH ROW SET @x=1;'), 'CREATE TRIGGER simple BEFORE UPDATE ON t FOR EACH ROW SET @x=1;');
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

test('isolated migration input manifest binds ordered files and schema-builder output hashes', () => {
  const manifest = buildIsolatedMigrationInputManifest({ repoRoot: process.cwd() });
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.schemaBuilders.map(({ id }) => id), ['maint', 'relation', 'projection']);
  assert.ok(manifest.schemaBuilders.every(({ path: sourcePath, sourceSha256, outputSha256 }) => (
    sourcePath.startsWith('pipelines/')
      && /^sha256:[a-f0-9]{64}$/.test(sourceSha256)
      && /^sha256:[a-f0-9]{64}$/.test(outputSha256)
  )));
  assert.ok(manifest.migrationFiles.length > 0);
  assert.deepEqual([...manifest.migrationFiles].sort((a, b) => a.version - b.version), manifest.migrationFiles);
  assert.ok(manifest.migrationFiles.every(({ path: migrationPath, version, sha256 }) => (
    migrationPath.startsWith('services/catalog-api/src/main/resources/db/migration/V')
      && Number.isInteger(version)
      && /^sha256:[a-f0-9]{64}$/.test(sha256)
  )));
});

test('isolated databases are created by bootstrap before provisioner-scoped migration', async () => {
  const calls = [];
  const adapter = await createLiveAutomationAdapter({
    repoRoot: process.cwd(),
    mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
    redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret', logicalDb: 2 },
    environmentId: 'test',
    accountNames: { provisioner: 'automation_prov_test', readonly: 'automation_ro_test' },
    accountPasswords: { provisioner: 'provisioner-secret', readonly: 'readonly-secret' },
    execute: async (input) => {
      calls.push(input);
      return { stdout: '', stderr: '', exitCode: 0 };
    }
  });

  await adapter.createDatabase({
    name: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local'
  });

  const create = calls.find(({ stdin }) => stdin.startsWith('CREATE DATABASE'));
  assert.ok(create);
  assert.deepEqual(create.args.slice(create.args.indexOf('--user'), create.args.indexOf('--user') + 2), [
    '--user', 'bootstrap'
  ]);
  await adapter.cleanupAccounts();
});

test('default Redis allocation excludes DB14 reserved for Armor', async (t) => {
  const calls = [];
  let reservationValue = '';
  const adapter = await createLiveAutomationAdapter({
    repoRoot: process.cwd(),
    mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
    redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret' },
    environmentId: 'test',
    accountNames: { provisioner: 'automation_prov_test', readonly: 'automation_ro_test' },
    accountPasswords: { provisioner: 'provisioner-secret', readonly: 'readonly-secret' },
    execute: async (input) => {
      calls.push(input);
      if (input.args.includes('DBSIZE')) return { stdout: '0', stderr: '', exitCode: 0 };
      if (input.args.includes('SET')) {
        reservationValue = input.args[input.args.indexOf('SET') + 2];
        return { stdout: 'OK', stderr: '', exitCode: 0 };
      }
      if (input.args.includes('GET')) return { stdout: reservationValue, stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    }
  });
  t.after(() => adapter.cleanupAccounts());

  const allocation = await adapter.allocateRedisLogicalDb({ runKey: 'test_0123456789abcdef' });
  assert.equal(allocation.logicalDb, 13);
  assert.equal(calls.some(({ args }) => args.includes('14')), false);
});

test('explicit DB14 allocation is rejected before any Redis command', async (t) => {
  const calls = [];
  const adapter = await createLiveAutomationAdapter({
    repoRoot: process.cwd(),
    mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
    redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret', logicalDb: 14 },
    environmentId: 'test',
    accountNames: { provisioner: 'automation_prov_test', readonly: 'automation_ro_test' },
    accountPasswords: { provisioner: 'provisioner-secret', readonly: 'readonly-secret' },
    execute: async (input) => {
      calls.push(input);
      if (input.args.includes('DBSIZE')) return { stdout: '0', stderr: '', exitCode: 0 };
      if (input.args.includes('SET')) return { stdout: 'OK', stderr: '', exitCode: 0 };
      return { stdout: '0', stderr: '', exitCode: 0 };
    }
  });
  t.after(() => adapter.cleanupAccounts());

  await assert.rejects(
    () => adapter.allocateRedisLogicalDb({ runKey: 'test_0123456789abcdef' }),
    /Redis logical DB.*1 through 13/i,
  );
  assert.equal(calls.length, 0);
});

test('domain-aware Redis allocation binds Armor to DB20 without falling back to DB13', async (t) => {
  const calls = [];
  const reservationValues = new Map();
  const adapter = await createLiveAutomationAdapter({
    repoRoot: process.cwd(),
    mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
    redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret', logicalDb: 20 },
    domain: 'armor',
    environmentId: 'test',
    accountNames: { provisioner: 'automation_prov_test', readonly: 'automation_ro_test' },
    accountPasswords: { provisioner: 'provisioner-secret', readonly: 'readonly-secret' },
    execute: async (input) => {
      calls.push(input);
      if (input.args.includes('DBSIZE')) return { stdout: '0', stderr: '', exitCode: 0 };
      if (input.args.includes('SET')) {
        const key = `${input.args[input.args.indexOf('-n') + 1]}:${input.args[input.args.indexOf('SET') + 1]}`;
        reservationValues.set(key, input.args.at(-2));
        return { stdout: 'OK', stderr: '', exitCode: 0 };
      }
      if (input.args.includes('GET')) {
        const key = `${input.args[input.args.indexOf('-n') + 1]}:${input.args[input.args.indexOf('GET') + 1]}`;
        return { stdout: reservationValues.get(key) ?? '', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    }
  });
  t.after(() => adapter.cleanupAccounts());

  const allocation = await adapter.allocateRedisLogicalDb({ runKey: 'test_0123456789abcdef' });
  assert.equal(allocation.logicalDb, 20);
  assert.equal(calls.some(({ args }) => args.includes('13')), false);
  assert.equal(calls.some(({ args }) => args.includes('20')), true);
});

test('domain-aware Redis allocation rejects a mismatched domain DB before any Redis command', async (t) => {
  const calls = [];
  await assert.rejects(
    () => createLiveAutomationAdapter({
      repoRoot: process.cwd(),
      mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
      redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret', logicalDb: 13 },
      domain: 'buff',
      environmentId: 'test',
      accountNames: { provisioner: 'automation_prov_test', readonly: 'automation_ro_test' },
      accountPasswords: { provisioner: 'provisioner-secret', readonly: 'readonly-secret' },
      execute: async (input) => {
        calls.push(input);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    }),
    /buff.*DB22/i,
  );
  assert.equal(calls.length, 0);
});

test('command execution preserves child stderr when a large stdin hits EPIPE', async () => {
  const result = await defaultExecute({
    command: process.execPath,
    args: ['-e', "process.stderr.write('expected child failure'); process.exit(2)"],
    stdin: 'x'.repeat(4 * 1024 * 1024),
    env: {},
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.stderr, 'expected child failure');
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

test('pre-cutover owned tables may freeze only as explicit source-absent entries', () => {
  const entry = buildUnavailableSourceSnapshotEntry({
    role: 'local', table: 'item_groups', maxRows: 2,
  });
  assert.deepEqual(entry, {
    role: 'local', table: 'item_groups', maxRows: 2, sourceCount: 0,
    sourceAvailable: false, sampleHash: null, schemaHash: null,
  });
  assert.throws(
    () => buildUnavailableSourceSnapshotEntry({ role: 'local', table: 'users', maxRows: 2 }),
    /pre-cutover/i,
  );
  assert.throws(
    () => buildUnavailableSourceSnapshotEntry({ role: 'local', table: 'item_groups', maxRows: 0 }),
    /row cap/i,
  );
});

test('temporary account grants accept exact isolation and formal read-only grants only', () => {
  const databases = {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation'
  };
  assert.equal(validateTemporaryAccountGrants({
    provisionerGrants: Object.values(databases).map((name) => `GRANT ALL PRIVILEGES ON \`${name}\`.* TO \`p\`@\`127.0.0.1\``),
    readonlyGrants: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
      .map((name) => `GRANT SELECT, SHOW VIEW ON \`${name}\`.* TO \`r\`@\`127.0.0.1\``),
    databases
  }), true);

  assert.throws(() => validateTemporaryAccountGrants({
    provisionerGrants: ['GRANT ALL PRIVILEGES ON *.* TO `p`@`127.0.0.1`'],
    readonlyGrants: [],
    databases
  }), /global|formal|grant/i);
  assert.throws(() => validateTemporaryAccountGrants({
    provisionerGrants: Object.values(databases).map((name) => `GRANT ALL ON \`${name}\`.* TO \`p\`@\`127.0.0.1\``),
    readonlyGrants: ['GRANT INSERT ON `terria_v1_local`.* TO `r`@`127.0.0.1`'],
    databases
  }), /read.only|grant/i);
  assert.throws(() => validateTemporaryAccountGrants({
    provisionerGrants: Object.values(databases).map((name) => `GRANT ALL PRIVILEGES ON \`${name}\`.* TO \`p\`@\`%\``),
    readonlyGrants: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
      .map((name) => `GRANT SELECT, SHOW VIEW ON \`${name}\`.* TO \`r\`@\`%\``),
    databases
  }), /loopback|host/i);
});

test('isolated API grants are role-specific and bound to the exact run-derived schemas', () => {
  const databases = {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation',
  };
  const accounts = { apiReadonly: 'automation_apiro_0123456789ab', apiV2Test: 'automation_apiv2_0123456789ab' };
  const grants = buildIsolatedApiAccountGrants({ domain: 'items', databases, accountNames: accounts });
  const writableTables = [
    'local.crawler_automation_alert', 'local.entity_source_snapshots', 'local.item_images', 'local.items',
    'maint.maint_item_categories', 'maint.maint_item_images', 'maint.maint_item_numeric_overrides',
    'maint.maint_item_pages', 'maint.maint_item_rarity_overrides', 'maint.maint_item_sources',
    'maint.maint_item_text_overrides', 'maint.maint_items', 'relation.item_npc_loot_relations',
    'relation.item_npc_shop_relations', 'relation.item_source_details', 'relation.item_source_facts',
    'relation.projection_items', 'relation.relation_item_images', 'relation.relation_item_rarities',
    'relation.relation_items',
  ];
  assert.deepEqual(grants.filter(({ role }) => role === 'apiReadonly').map(({ database, table, privileges, sql }) => ({
    database, table, privileges, sql,
  })), Object.values(databases).map((database) => ({
    database, table: null, privileges: ['SELECT', 'SHOW VIEW'],
    sql: `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO '${accounts.apiReadonly}'@'127.0.0.1'`,
  })));
  assert.deepEqual(grants.filter(({ role, table }) => role === 'apiV2Test' && table).map(({ role, database, table, privileges, sql }) => ({
    role, database, table, privileges, sql,
  })), writableTables.map((qualified) => {
    const [role, table] = qualified.split('.');
    return {
      role: 'apiV2Test',
      database: databases[role],
      table,
      privileges: ['INSERT', 'UPDATE', 'DELETE'],
      sql: `GRANT INSERT, UPDATE, DELETE ON \`${databases[role]}\`.\`${table}\` TO '${accounts.apiV2Test}'@'127.0.0.1'`,
    };
  }));
  assert.equal(grants.filter(({ role, table }) => role === 'apiV2Test' && !table).length, 3);
  assert.equal(grants.some(({ role, sql }) => role === 'apiV2Test' && /(INSERT|UPDATE|DELETE).*ON `[^`]+`\.\*/.test(sql)), false);
  const usage = ['GRANT USAGE ON *.* TO `user`@`%`'];
  const apiV2ReadGrants = Object.values(databases).map((database) =>
    `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO \`${accounts.apiV2Test}\`@\`127.0.0.1\``);
  const apiV2TableGrants = grants.filter(({ role, table }) => role === 'apiV2Test' && table).map(({ sql }) => sql);
  assert.equal(validateIsolatedApiAccountGrants({
    domain: 'items',
    apiReadonlyGrants: [...usage, ...Object.values(databases).map((database) =>
      `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO \`${accounts.apiReadonly}\`@\`127.0.0.1\``)],
    apiV2TestGrants: [...usage, ...apiV2ReadGrants, ...apiV2TableGrants],
    databases,
  }), true);
});

test('isolated API grants bind accounts to the loopback MySQL host', () => {
  const databases = {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation',
  };
  const grants = buildIsolatedApiAccountGrants({
    domain: 'items',
    databases,
    accountNames: { apiReadonly: 'api_readonly_test', apiV2Test: 'api_v2_test' },
  });
  assert.equal(grants.every(({ sql }) => sql.endsWith("@'127.0.0.1'")), true);
});

test('isolated API grant validation rejects formal, extra, broad, and read-only write privileges', () => {
  const databases = {
    local: 'terria_v1_automation_acceptance_abc_0123456789abcdef_local',
    maint: 'terria_v1_automation_acceptance_abc_0123456789abcdef_maint',
    relation: 'terria_v1_automation_acceptance_abc_0123456789abcdef_relation',
  };
  const ro = Object.values(databases).map((database) => `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO 'apiro'@'127.0.0.1'`);
  const v2Read = Object.values(databases).map((database) => `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO 'apiv2'@'127.0.0.1'`);
  const v2Table = buildIsolatedApiAccountGrants({
    domain: 'items', databases,
    accountNames: { apiReadonly: 'apiro', apiV2Test: 'apiv2' },
  }).filter(({ role, table }) => role === 'apiV2Test' && table).map(({ sql }) => sql);
  const validBase = { domain: 'items', apiReadonlyGrants: ro, apiV2TestGrants: [...v2Read, ...v2Table], databases };
  assert.throws(() => validateIsolatedApiAccountGrants({
    ...validBase,
    apiReadonlyGrants: [...ro, 'GRANT SELECT ON `terria_v1_local`.* TO \'apiro\'@\'127.0.0.1\''],
  }), /read.only|formal|grant/i);
  assert.throws(() => validateIsolatedApiAccountGrants({
    ...validBase,
    apiReadonlyGrants: ro.map((grant, index) => index === 0 ? grant.replace('SELECT, SHOW VIEW', 'SELECT, INSERT, SHOW VIEW') : grant),
  }), /read.only|privilege/i);
  assert.throws(() => validateIsolatedApiAccountGrants({
    ...validBase,
    apiV2TestGrants: [...v2Read, ...v2Table, `GRANT INSERT, UPDATE, DELETE ON \`${databases.local}\`.\`other\` TO 'apiv2'@'127.0.0.1'`],
  }), /exact|privilege|grant set/i);
  assert.throws(() => validateIsolatedApiAccountGrants({
    ...validBase,
    apiV2TestGrants: [...v2Read, ...v2Table, 'GRANT SELECT ON `terria_v1_v55_rehearsal`.* TO \'apiv2\'@\'127.0.0.1\''],
  }), /exact|formal|grant set/i);
  assert.throws(() => validateIsolatedApiAccountGrants({
    ...validBase,
    apiV2TestGrants: [...v2Read, ...v2Table, `GRANT INSERT, UPDATE, DELETE ON \`${databases.local}\`.\`users\` TO 'apiv2'@'127.0.0.1'`],
  }), /exact|privilege|grant set/i);
  assert.throws(() => buildIsolatedApiAccountGrants({
    domain: 'items', databases: { ...databases, foreign: 'terria_v1_local' }, accountNames: { apiReadonly: 'same', apiV2Test: 'same' },
  }), /exact|distinct|formal|database/i);
});

test('isolated API MySQL accounts are created with exact run-schema grants and dropped on cleanup', async (t) => {
  const calls = [];
  const runKey = 'e8p_0123456789abcdef';
  const databases = {
    local: `terria_v1_automation_acceptance_${runKey}_local`,
    maint: `terria_v1_automation_acceptance_${runKey}_maint`,
    relation: `terria_v1_automation_acceptance_${runKey}_relation`,
  };
  const accountNames = {
    provisioner: 'automation_prov_test',
    readonly: 'automation_ro_test',
    apiReadonly: 'automation_apiro_test',
    apiV2Test: 'automation_apiv2_test',
  };
  let tableGrantsApplied = false;
  const adapter = await createLiveAutomationAdapter({
    repoRoot: process.cwd(),
    mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
    redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret', logicalDb: 2 },
    environmentId: 'test',
    accountNames,
    accountPasswords: {
      provisioner: 'provisioner-secret', readonly: 'readonly-secret',
      apiReadonly: 'api-readonly-secret', apiV2Test: 'api-v2-secret',
    },
    isolatedApiDatabases: databases,
    isolatedApiDomain: 'items',
    execute: async (input) => {
      calls.push(input);
      const username = input.args[input.args.indexOf('--user') + 1];
      if (input.stdin.startsWith('SELECT @@server_uuid')) return { stdout: 'test-server-uuid\n', stderr: '', exitCode: 0 };
      if (input.stdin.startsWith('SELECT COUNT(*) FROM mysql.user')) return { stdout: '0\n', stderr: '', exitCode: 0 };
      if (input.stdin.startsWith('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')) return { stdout: '1\n', stderr: '', exitCode: 0 };
      if (input.stdin.startsWith('GRANT INSERT, UPDATE, DELETE ON `terria_v1_automation')) tableGrantsApplied = true;
      if (input.stdin.trim() === 'SHOW GRANTS') {
        const rows = {
          [accountNames.provisioner]: [
            ...Object.values(databases).map((database) => `GRANT ALL PRIVILEGES ON \`${database}\`.* TO \`${accountNames.provisioner}\`@\`127.0.0.1\``),
          ],
          [accountNames.readonly]: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']
            .map((database) => `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO \`${accountNames.readonly}\`@\`127.0.0.1\``),
          [accountNames.apiReadonly]: Object.values(databases)
            .map((database) => `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO \`${accountNames.apiReadonly}\`@\`127.0.0.1\``),
          [accountNames.apiV2Test]: [
            ...Object.values(databases).map((database) => `GRANT SELECT, SHOW VIEW ON \`${database}\`.* TO \`${accountNames.apiV2Test}\`@\`127.0.0.1\``),
            ...(tableGrantsApplied
              ? buildIsolatedApiAccountGrants({ domain: 'items', databases, accountNames })
                .filter(({ role, table }) => role === 'apiV2Test' && table).map(({ sql }) => sql)
              : []),
          ],
        };
        return { stdout: `${(rows[username] ?? []).join('\n')}\n`, stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  });
  t.after(() => adapter.cleanupAccounts());

  await adapter.inspectServer();
  await adapter.inspectProvisioner();
  for (const database of Object.values(databases)) await adapter.grantProvisioner({ name: database });
  const tableGrantStatements = () => calls.filter(({ stdin }) => stdin.startsWith('GRANT INSERT, UPDATE, DELETE ON `terria_v1_automation'));
  assert.equal(tableGrantStatements().length, 0, 'table grants must wait until migrations create their targets');
  await assert.rejects(() => adapter.grantIsolatedApiTablePrivileges({ runKey }), /migrations|schema/i);
  const databaseOnlyVerification = await adapter.verifyProvisionerGrants({ credentialRole: 'automation-provisioner', apiTableGrantsPending: true });
  assert.equal(databaseOnlyVerification.apiDatabaseAccountsVerified, true);
  assert.equal(databaseOnlyVerification.apiAccountsVerified, undefined);
  for (const [role, database] of Object.entries(databases)) {
    await adapter.migrateDatabase({ name: database, role, runKey, profile: 't1' });
  }
  await adapter.grantIsolatedApiTablePrivileges({ runKey });
  const verified = await adapter.verifyProvisionerGrants({ credentialRole: 'automation-provisioner' });
  assert.equal(verified.apiAccountsVerified, true);
  for (const role of ['apiReadonly', 'apiV2Test']) {
    assert.equal(calls.some(({ stdin }) => stdin.includes(`CREATE USER '${accountNames[role]}'@'127.0.0.1'`)), true);
  }
  assert.equal(calls.filter(({ stdin }) => stdin.startsWith('GRANT SELECT, SHOW VIEW ON `terria_v1_automation')).length, 6);
  assert.equal(calls.filter(({ stdin }) => stdin.startsWith('GRANT SELECT, INSERT, UPDATE, DELETE ON `terria_v1_automation')).length, 0);
  assert.equal(calls.filter(({ stdin }) => stdin.startsWith('GRANT INSERT, UPDATE, DELETE ON `terria_v1_automation') && stdin.includes('`.*')).length, 0);
  assert.equal(tableGrantStatements().length, 20);
  await adapter.cleanupAccounts();
  const cleanup = calls.find(({ stdin }) => stdin.startsWith('DROP USER IF EXISTS'))?.stdin ?? '';
  assert.match(cleanup, /automation_apiro_test/);
  assert.match(cleanup, /automation_apiv2_test/);
});

test('run-derived database cleanup uses bootstrap authority only for the exact role/run tuple', async (t) => {
  const calls = [];
  const adapter = await createLiveAutomationAdapter({
    repoRoot: process.cwd(),
    mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
    redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret', logicalDb: 2 },
    environmentId: 'test',
    accountNames: { provisioner: 'automation_prov_test', readonly: 'automation_ro_test' },
    accountPasswords: { provisioner: 'provisioner-secret', readonly: 'readonly-secret' },
    execute: async (input) => { calls.push(input); return { stdout: '', stderr: '', exitCode: 0 }; },
  });
  const runKey = 'e8p_0123456789abcdef';
  const name = `terria_v1_automation_acceptance_${runKey}_relation`;
  await adapter.dropDatabase({ name, role: 'relation', runKey, ifExists: true, compensation: true });
  const drop = calls.find(({ stdin }) => stdin === `DROP DATABASE IF EXISTS \`${name}\``);
  assert.ok(drop);
  assert.equal(drop.args[drop.args.indexOf('--user') + 1], 'bootstrap');
  await assert.rejects(() => adapter.dropDatabase({ name: 'terria_v1_local', role: 'local', runKey }), /runKey|role|formal/i);
  await assert.rejects(() => adapter.dropDatabase({ name: `terria_v1_automation_acceptance_e8p_1111111111111111_local`, role: 'local', runKey }), /runKey|role/i);
  await adapter.dropDatabase({ name, role: 'relation', runKey, compensation: false });
  const latestDrop = calls.filter(({ stdin }) => stdin === `DROP DATABASE IF EXISTS \`${name}\``).at(-1);
  assert.equal(latestDrop.args[latestDrop.args.indexOf('--user') + 1], 'automation_prov_test');
  await adapter.cleanupAccounts();
});

test('Redis reservation cleanup refuses unregistered keys without clearing the logical database', async (t) => {
  const keys = new Map();
  const commands = [];
  const adapter = await createLiveAutomationAdapter({
    repoRoot: process.cwd(),
    mysql: { host: '127.0.0.1', port: 13306, username: 'bootstrap', password: 'bootstrap-secret' },
    redis: { host: '127.0.0.1', port: 16380, password: 'redis-secret', logicalDb: 7 },
    environmentId: 'test',
    accountNames: { provisioner: 'automation_prov_test', readonly: 'automation_ro_test' },
    accountPasswords: { provisioner: 'provisioner-secret', readonly: 'readonly-secret' },
    execute: async (input) => {
      const commandIndex = input.args.findIndex((arg) => ['DBSIZE', 'SET', 'GET', 'DEL', 'FLUSHDB', '--scan'].includes(arg));
      const command = input.args[commandIndex];
      commands.push(command);
      if (command === 'DBSIZE') return { stdout: `${keys.size}\n`, stderr: '', exitCode: 0 };
      if (command === 'SET') {
        const key = input.args[commandIndex + 1];
        const value = input.args[commandIndex + 2];
        if (keys.has(key)) return { stdout: '\n', stderr: '', exitCode: 0 };
        keys.set(key, value);
        return { stdout: 'OK\n', stderr: '', exitCode: 0 };
      }
      if (command === 'GET') return { stdout: `${keys.get(input.args[commandIndex + 1]) ?? ''}\n`, stderr: '', exitCode: 0 };
      if (command === '--scan') return { stdout: `${[...keys.keys()].join('\n')}\n`, stderr: '', exitCode: 0 };
      if (command === 'DEL') {
        const deleted = input.args.slice(commandIndex + 1);
        for (const key of deleted) keys.delete(key);
        return { stdout: `${deleted.length}\n`, stderr: '', exitCode: 0 };
      }
      if (command === 'FLUSHDB') {
        keys.clear();
        return { stdout: 'OK\n', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  });
  t.after(async () => {
    keys.delete('foreign:concurrent-writer');
    await adapter.cleanupAccounts();
  });

  const reservation = await adapter.allocateRedisLogicalDb({ runKey: 'items_0123456789abcdef' });
  keys.set('foreign:concurrent-writer', 'keep-me');
  keys.set('security:http-rate:auth:127.0.0.1:20261019', '1');
  keys.set('item:public:list::v5|fixture|1', 'cached-list');
  keys.set('item:detail::706', 'cached-item-detail');
  await assert.rejects(() => adapter.releaseRedisLogicalDb({ ...reservation, runKey: 'items_0123456789abcdef' }), /foreign|unregistered|owned key/i);
  assert.equal(keys.get('foreign:concurrent-writer'), 'keep-me');
  assert.equal(keys.get('item:detail::706'), 'cached-item-detail');
  assert.equal(commands.includes('FLUSHDB'), false);
  keys.delete('foreign:concurrent-writer');
  await adapter.releaseRedisLogicalDb({ ...reservation, runKey: 'items_0123456789abcdef' });
  assert.equal(keys.size, 0);
  assert.equal(commands.includes('FLUSHDB'), false);
  assert.equal(commands.includes('DEL'), true);
});
