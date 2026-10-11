import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../services/catalog-api/src/main/resources/db/migration/V55__create_crawler_automation_tables.sql',
  import.meta.url,
);
const activationMigrationUrl = new URL(
  '../../services/catalog-api/src/main/resources/db/migration/V58__create_crawler_automation_activation_decisions.sql',
  import.meta.url,
);
const l2MinimumMigrationUrl = new URL(
  '../../services/catalog-api/src/main/resources/db/migration/V59__raise_l2_activation_minimum_to_three.sql',
  import.meta.url,
);
const l2DecisionMinimumCompatibilityMigrationUrl = new URL(
  '../../services/catalog-api/src/main/resources/db/migration/V60__scope_l2_activation_minimum_by_decision_kind.sql',
  import.meta.url,
);
const schedulerCanaryScopeMigrationUrl = new URL(
  '../../services/catalog-api/src/main/resources/db/migration/V61__bind_scheduler_activation_canary_scope.sql',
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
    '../../services/catalog-api/src/main/java/com/terraria/skills/mapper/CrawlerAutomationActivationDecisionMapper.java',
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
  assert.doesNotMatch(mapper, /a\.mode = 'APPROVED_OWNER_L1'/);
  assert.match(mapper, /COUNT\(DISTINCT a\.run_id\)/);
  assert.match(mapper, /JOIN crawler_automation_apply_bundle b/);
  assert.doesNotMatch(mapper, /JOIN crawler_automation_policy_version pv/);
  assert.doesNotMatch(mapper, /pv\.level = 'L1'/);
  assert.match(mapper, /rp\.policy_version < #\{currentPolicyVersion\}/);
  assert.match(mapper, /a\.status = 'COMMITTED'/);
});

test('V59 preserves immutable historical decisions while enforcing three runs for new decisions', async () => {
  const sql = await readFile(l2MinimumMigrationUrl, 'utf8');
  assert.match(sql, /ADD COLUMN\s+legacy_minimum_l1_allowed\s+TINYINT\s*\(1\)\s+NULL/i);
  assert.match(sql, /DROP CHECK chk_crawler_automation_activation_minimum_l1/);
  assert.match(sql, /CHECK\s*\(\s*minimum_successful_l1_runs\s*>=\s*3\s+OR\s+legacy_minimum_l1_allowed\s+IS\s+NULL\s*\)/i);
  assert.match(sql, /CREATE TRIGGER\s+trg_crawler_automation_activation_decision_minimum_l1/i);
  assert.match(sql, /BEFORE INSERT ON crawler_automation_activation_decision/i);
  assert.match(sql, /NEW\.minimum_successful_l1_runs\s*<\s*3/i);
  assert.match(sql, /minimum successful L1 runs must be at least 3/i);
  assert.match(sql, /SET NEW\.legacy_minimum_l1_allowed\s*=\s*0/i);
});

test('V60 keeps legacy history while separating L2 and scheduler minimums', async () => {
  const sql = await readFile(l2DecisionMinimumCompatibilityMigrationUrl, 'utf8');
  assert.match(sql, /DROP TRIGGER\s+trg_crawler_automation_activation_decision_minimum_l1/i);
  assert.match(sql, /DROP CHECK\s+chk_crawler_automation_activation_minimum_l1/i);
  assert.match(sql, /legacy_minimum_l1_allowed\s+IS\s+NULL/i);
  assert.match(sql, /legacy_minimum_l1_allowed\s*=\s*0/i);
  assert.match(sql, /decision_kind\s*=\s*'L2_PROMOTION'[\s\S]*minimum_successful_l1_runs\s*>=\s*3/i);
  assert.match(sql, /decision_kind\s*=\s*'SCHEDULER_ACTIVATION'[\s\S]*minimum_successful_l1_runs\s*>=\s*2/i);
  assert.match(sql, /CREATE TRIGGER\s+trg_crawler_automation_activation_decision_minimum_l1/i);
  assert.match(sql, /BEFORE INSERT ON crawler_automation_activation_decision/i);
  assert.match(sql, /SET NEW\.legacy_minimum_l1_allowed\s*=\s*0/i);
  assert.match(sql, /NEW\.decision_kind\s*=\s*'L2_PROMOTION'[\s\S]*NEW\.minimum_successful_l1_runs\s*<\s*3/i);
  assert.match(sql, /NEW\.decision_kind\s*=\s*'SCHEDULER_ACTIVATION'[\s\S]*NEW\.minimum_successful_l1_runs\s*<\s*2/i);
  assert.match(sql, /legacy_minimum_l1_allowed\s+IS\s+NULL\s+OR\s+legacy_minimum_l1_allowed\s*=\s*0/i);
});

test('V61 adds a nullable bounded scheduler canary scope without rewriting immutable history', async () => {
  const sql = await readFile(schedulerCanaryScopeMigrationUrl, 'utf8');
  const mapper = await readFile(new URL(
    '../../services/catalog-api/src/main/java/com/terraria/skills/mapper/CrawlerAutomationActivationDecisionMapper.java',
    import.meta.url,
  ), 'utf8');

  assert.match(sql, /ALTER TABLE\s+crawler_automation_activation_decision/i);
  assert.match(sql, /ADD COLUMN\s+authorized_action_id\s+VARCHAR\s*\(\s*128\s*\)\s+NULL/i);
  assert.match(mapper, /authorized_action_id AS authorizedActionId/);
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
    '../../services/catalog-api/src/main/java/com/terraria/skills/mapper/CrawlerAutomationApprovalMapper.java',
    import.meta.url,
  ), 'utf8');

  assert.match(mapper, /WHERE id = #\{id} AND version = #\{expectedVersion} AND consumed_at IS NULL/);
});

function normalizeColumns(value) {
  return value.split(',').map((column) => column.trim().replaceAll('`', '')).join(',');
}
