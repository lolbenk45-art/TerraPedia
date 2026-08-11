import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyCanonicalRoleSchemas,
  runCanonicalSchemaMigrationCli,
} from './run-canonical-schema-migration.mjs';

const env = {
  TERRAPEDIA_DB_HOST: '127.0.0.1',
  TERRAPEDIA_DB_PORT: '3306',
  TERRAPEDIA_DB_USERNAME: 'migration-user',
  TERRAPEDIA_DB_PASSWORD: 'migration-secret',
  TERRAPEDIA_DB_NAME: 'terria_v1_local',
};
let authorizationLoads = 0;
const loadAuthorizationContextImpl = ({ operationId }) => {
  authorizationLoads += 1;
  assert.equal(operationId, 'canonical-schema-v56-v58');
  return { operationId };
};

test('schema wrapper dispatches the dedicated Flyway CLI without a shell or credential arguments', async () => {
  const initialAuthorizationLoads = authorizationLoads;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-schema-'));
  const output = path.join(root, 'result.json');
  const calls = [];
  try {
    const result = await runCanonicalSchemaMigrationCli({
      repoRoot: root,
      argv: [`--output=${output}`, '--apply=true'],
      env,
      loadAuthorizationContextImpl,
      spawnImpl: async (command, args, options) => {
        calls.push({ command, args, options });
        return {
          exitCode: 0,
          stdout: '{"schemaVersion":1,"operationId":"canonical-schema-v56-v58","status":"completed","previousVersion":"55","currentVersion":"58","migrationsExecuted":3}\n',
          stderr: '',
        };
      },
      applyRoleSchemasImpl: async (options) => {
        calls.push({ roleSchemas: options });
        return { maint: { applied: true }, relation: { applied: true } };
      },
    });
    assert.equal(result.currentVersion, '58');
    assert.equal(authorizationLoads, initialAuthorizationLoads + 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, 'mvn');
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.cwd, path.join(root, 'back'));
    assert.equal(calls[0].args.some((arg) => /password|secret/i.test(arg)), false);
    assert.equal(calls[0].options.env.TERRAPEDIA_DB_PASSWORD, 'migration-secret');
    assert.equal(calls[1].roleSchemas.repoRoot, root);
    assert.deepEqual(result.roleSchemas, {
      maint: { applied: true }, relation: { applied: true },
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), result);
    assert.equal(fs.statSync(output).mode & 0o077, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('schema wrapper refuses non-formal targets, missing apply, and failed Flyway execution', async () => {
  await assert.rejects(
    runCanonicalSchemaMigrationCli({
      argv: ['--output=x'], env, loadAuthorizationContextImpl,
      spawnImpl: async () => ({ exitCode: 0 }),
    }),
    /--apply=true/i,
  );
  await assert.rejects(
    runCanonicalSchemaMigrationCli({
      argv: ['--output=x', '--apply=true'],
      env: { ...env, TERRAPEDIA_DB_NAME: 'scratch' },
      loadAuthorizationContextImpl,
      spawnImpl: async () => ({ exitCode: 0 }),
    }),
    /terria_v1_local/i,
  );
  await assert.rejects(
    runCanonicalSchemaMigrationCli({
      argv: ['--output=x', '--apply=true'],
      env,
      loadAuthorizationContextImpl,
      spawnImpl: async () => ({ exitCode: 1, stdout: '', stderr: 'migration failed' }),
    }),
    /migration failed/i,
  );
});

test('role schema verification accepts MySQL uppercase information_schema column labels', async () => {
  const requiredColumns = [
    'artifact_role', 'producer_id', 'producer_version', 'producer_run_key',
    'bootstrap_manifest_hash', 'full_file_content_hash', 'full_file_byte_size', 'current_slot',
  ];
  const maintTables = [
    'maint_npc_crawler_facts', 'maint_item_groups', 'maint_item_group_members',
    'maint_item_group_aliases', 'maint_item_group_member_exclusions',
  ];
  const relationTables = [
    'relation_item_groups', 'relation_item_group_members', 'relation_item_group_aliases',
    'item_source_facts', 'item_source_details', 'item_npc_shop_relations',
    'item_npc_loot_relations', 'npc_buff_relations',
  ];
  const connections = [];
  const mysqlModule = {
    async createConnection(options) {
      const connection = {
        database: options.database,
        ended: false,
        async query(sql) {
          if (/information_schema\.columns/i.test(sql)) {
            return [requiredColumns.map((name) => ({ COLUMN_NAME: name }))];
          }
          if (/information_schema\.tables/i.test(sql)) {
            const names = options.database === 'terria_v1_maint' ? maintTables : relationTables;
            return [names.map((name) => ({ TABLE_NAME: name }))];
          }
          return [{ affectedRows: 0 }];
        },
        async end() { this.ended = true; },
      };
      connections.push(connection);
      return connection;
    },
  };

  const result = await applyCanonicalRoleSchemas({
    repoRoot: process.cwd(),
    env,
    mysqlModule,
  });

  assert.equal(result.maint.applied, true);
  assert.equal(result.relation.applied, true);
  assert.deepEqual(connections.map((entry) => entry.database), [
    'terria_v1_maint', 'terria_v1_relation',
  ]);
  assert.equal(connections.every((entry) => entry.ended), true);
});
