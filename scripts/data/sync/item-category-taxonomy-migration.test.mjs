import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationPath = path.join(
  repoRoot,
  'back',
  'src',
  'main',
  'resources',
  'db',
  'migration',
  'V41__split_tool_pickaxe_drill_and_axe_chainsaw_categories.sql'
);

function readMigrationStatements() {
  return fs
    .readFileSync(migrationPath, 'utf8')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test('tool taxonomy migration splits legacy combined tool categories', () => {
  assert.equal(fs.existsSync(migrationPath), true);

  const sql = fs.readFileSync(migrationPath, 'utf8');
  for (const code of ['TOOL_PICKAXE', 'TOOL_DRILL', 'TOOL_AXE', 'TOOL_CHAINSAW']) {
    assert.match(sql, new RegExp(`'${code}'`));
  }

  assert.match(sql, /TOOL_PICKAXE_DRILL/);
  assert.match(sql, /TOOL_AXE_CHAINSAW/);
  assert.match(sql, /parent_ref\.`code`\s*=\s*'TOOL_PICKAXE_DRILL'/);
  assert.match(sql, /parent_ref\.`code`\s*=\s*'TOOL_AXE_CHAINSAW'/);
  assert.match(sql, /INSERT\s+INTO\s+`category`/i);
  assert.match(sql, /UPDATE\s+`items`/i);
  assert.match(sql, /INSERT\s+INTO\s+`item_category_rel`/i);
  assert.match(sql, /ON\s+DUPLICATE\s+KEY\s+UPDATE/i);
  assert.match(sql, /UPDATE\s+`item_category_rel`\s+rel_ref/i);
  assert.match(sql, /NOT\s+LIKE\s+'%drill%'/i);
  assert.match(sql, /NOT\s+LIKE\s+'%chainsaw%'/i);
  assert.doesNotMatch(sql, /\bDrax\b/i);
  assert.doesNotMatch(sql, /WHERE\s+`code`\s+IN\s+\('TOOL_PICKAXE_DRILL',\s*'TOOL_AXE_CHAINSAW'\)[\s\S]+`deleted`\s*=\s*1/i);
});

test('tool taxonomy migration preserves legacy parent relations as non-primary ancestors', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /UPDATE\s+`item_category_rel`\s+rel_ref[\s\S]+?SET\s+rel_ref\.`is_primary`\s*=\s*0/i);
  assert.doesNotMatch(sql, /DELETE\s+rel_ref\s+FROM\s+`item_category_rel`[\s\S]+?TOOL_PICKAXE_DRILL/i);
  assert.doesNotMatch(sql, /DELETE\s+rel_ref\s+FROM\s+`item_category_rel`[\s\S]+?TOOL_AXE_CHAINSAW/i);
});

test('tool taxonomy migration revives duplicate leaf relations', () => {
  const statements = readMigrationStatements().filter((statement) =>
    /INSERT\s+INTO\s+`item_category_rel`/i.test(statement)
  );

  assert.equal(statements.length, 4);
  for (const statement of statements) {
    assert.match(statement, /ON\s+DUPLICATE\s+KEY\s+UPDATE/i);
    assert.match(statement, /`deleted`\s*=\s*0/i);
  }
});

test('tool taxonomy migration revives existing soft-deleted leaf categories', () => {
  const statements = readMigrationStatements();

  for (const code of ['TOOL_PICKAXE', 'TOOL_DRILL', 'TOOL_AXE', 'TOOL_CHAINSAW']) {
    const upsertStatement = statements.find((statement) =>
      /INSERT\s+INTO\s+`category`/i.test(statement)
      && statement.includes(`'${code}'`)
    );
    assert.ok(upsertStatement, `missing category upsert for ${code}`);
    assert.match(upsertStatement, /ON\s+DUPLICATE\s+KEY\s+UPDATE/i);
    assert.match(upsertStatement, /`deleted`\s*=\s*0/i);
  }
});

test('tool taxonomy migration keeps SQL taxonomy aligned with script definitions', () => {
  const statements = readMigrationStatements();

  const expectations = [
    { code: 'TOOL_PICKAXE_DRILL', parentCode: 'TOOL', sort: 29 },
    { code: 'TOOL_PICKAXE', parentCode: 'TOOL_PICKAXE_DRILL', sort: 28 },
    { code: 'TOOL_DRILL', parentCode: 'TOOL_PICKAXE_DRILL', sort: 27 },
    { code: 'TOOL_AXE_CHAINSAW', parentCode: 'TOOL', sort: 26 },
    { code: 'TOOL_AXE', parentCode: 'TOOL_AXE_CHAINSAW', sort: 25 },
    { code: 'TOOL_CHAINSAW', parentCode: 'TOOL_AXE_CHAINSAW', sort: 24 },
  ];

  for (const { code, parentCode, sort } of expectations) {
    const statement = statements.find((candidate) =>
      /INSERT\s+INTO\s+`category`/i.test(candidate) && candidate.includes(`'${code}'`)
    );
    assert.ok(statement, `missing category upsert for ${code}`);
    assert.ok(statement.includes(`WHERE parent_ref.\`code\` = '${parentCode}'`), `wrong parent for ${code}`);
    assert.ok(statement.includes(`'${code}', 'TOOL', ${sort}`), `wrong sort for ${code}`);
    assert.match(statement, /ON\s+DUPLICATE\s+KEY\s+UPDATE/i);
    assert.match(statement, /`deleted`\s*=\s*0/i);
  }
});
