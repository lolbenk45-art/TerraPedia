import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../back/src/main/resources/db/migration/V55__create_crawler_automation_tables.sql',
  import.meta.url,
);
const activationMigrationUrl = new URL(
  '../../../back/src/main/resources/db/migration/V58__create_crawler_automation_activation_decisions.sql',
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, 'utf8');
}

async function activationMigrationSql() {
  return readFile(activationMigrationUrl, 'utf8');
}

test('V58 stores exact immutable L2 promotion and scheduler activation decisions', async () => {
  const sql = await activationMigrationSql();
  const mapper = await readFile(new URL(
    '../../../back/src/main/java/com/terraria/skills/mapper/CrawlerAutomationActivationDecisionMapper.java',
    import.meta.url,
  ), 'utf8');

  assert.match(sql, /CREATE TABLE crawler_automation_activation_decision\s*\(/);
  for (const column of [
    'decision_kind', 'domain_id', 'policy_version', 'policy_hash',
    'policy_set_hash', 'minimum_successful_l1_runs', 'actor', 'reason',
    'authorization_reference', 'decision_identity', 'packet_hash',
    'authorized_at', 'expires_at',
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `missing ${column}`);
  }
  assert.match(sql, /decision_kind IN \('L2_PROMOTION', 'SCHEDULER_ACTIVATION'\)/);
  assert.match(sql, /minimum_successful_l1_runs >= 2/);
  assert.match(sql, /UNIQUE KEY uk_crawler_automation_activation_decision_identity \(decision_identity\)/);
  assert.match(sql, /UNIQUE KEY uk_crawler_automation_activation_packet_hash \(packet_hash\)/);
  assert.match(sql, /trg_crawler_automation_activation_decision_no_update/);
  assert.match(sql, /trg_crawler_automation_activation_decision_no_delete/);
  assert.match(mapper, /authorized_at <= CURRENT_TIMESTAMP[\s\S]*expires_at > CURRENT_TIMESTAMP[\s\S]*AS fresh/);
  assert.match(mapper, /a\.mode = 'APPROVED_OWNER_L1'/);
  assert.match(mapper, /a\.status = 'COMMITTED'/);
  assert.match(mapper, /rp\.policy_version = #\{policyVersion\}/);
  assert.match(mapper, /rp\.policy_hash = #\{policyHash\}/);
  assert.match(mapper, /rp\.policy_set_hash = #\{policySetHash\}/);
});

test('attempt reservation and V2 identity attachment are separate immutable facts', async () => {
  const sql = await migrationSql();

  assert.match(sql, /CREATE TABLE crawler_automation_attempt_reservation\s*\(/);
  assert.match(sql, /CREATE TABLE crawler_automation_run_attempt\s*\([\s\S]*reservation_id BIGINT NOT NULL/);
  assert.match(sql, /FOREIGN KEY \(reservation_id\) REFERENCES crawler_automation_attempt_reservation \(id\)/);
  assert.match(sql, /trg_crawler_automation_attempt_reservation_no_update/);
  assert.match(sql, /trg_crawler_automation_attempt_no_update/);
});

test('every composite foreign-key target is backed by an exact unique key', async () => {
  const sql = `${await migrationSql()}\n${await activationMigrationSql()}`;
  const uniqueTuples = new Set();
  const tablePattern = /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\) ENGINE=/g;
  for (const table of sql.matchAll(tablePattern)) {
    const [, tableName, body] = table;
    uniqueTuples.add(`${tableName}(id)`);
    for (const key of body.matchAll(/UNIQUE KEY\s+\w+\s*\(([^)]+)\)/g)) {
      uniqueTuples.add(`${tableName}(${normalizeColumns(key[1])})`);
    }
  }
  for (const alter of sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD UNIQUE KEY\s+\w+\s*\(([^)]+)\)/g)) {
    uniqueTuples.add(`${alter[1]}(${normalizeColumns(alter[2])})`);
  }

  const references = [...sql.matchAll(/REFERENCES\s+(\w+)\s*\(([^)]+)\)/g)];
  assert.ok(references.length > 0);
  for (const reference of references) {
    const target = `${reference[1]}(${normalizeColumns(reference[2])})`;
    assert.ok(uniqueTuples.has(target), `foreign key target is not unique: ${target}`);
  }
});

test('approval consumption remains a versioned one-time compare-and-set', async () => {
  const mapper = await readFile(new URL(
    '../../../back/src/main/java/com/terraria/skills/mapper/CrawlerAutomationApprovalMapper.java',
    import.meta.url,
  ), 'utf8');

  assert.match(mapper, /WHERE id = #\{id} AND version = #\{expectedVersion} AND consumed_at IS NULL/);
});

function normalizeColumns(value) {
  return value.split(',').map((column) => column.trim().replaceAll('`', '')).join(',');
}
