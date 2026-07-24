import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../back/src/main/resources/db/migration/V55__create_crawler_automation_tables.sql',
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, 'utf8');
}

test('attempt reservation and V2 identity attachment are separate immutable facts', async () => {
  const sql = await migrationSql();

  assert.match(sql, /CREATE TABLE crawler_automation_attempt_reservation\s*\(/);
  assert.match(sql, /CREATE TABLE crawler_automation_run_attempt\s*\([\s\S]*reservation_id BIGINT NOT NULL/);
  assert.match(sql, /FOREIGN KEY \(reservation_id\) REFERENCES crawler_automation_attempt_reservation \(id\)/);
  assert.match(sql, /trg_crawler_automation_attempt_reservation_no_update/);
  assert.match(sql, /trg_crawler_automation_attempt_no_update/);
});

test('every composite foreign-key target is backed by an exact unique key', async () => {
  const sql = await migrationSql();
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
