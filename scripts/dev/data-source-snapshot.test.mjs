import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const snapshotScript = path.join(repoRoot, 'scripts/dev/snapshot-data-source.sh');
const restoreScript = path.join(repoRoot, 'scripts/dev/restore-data-source.sh');

test('snapshot script captures standardized data, db dump, and minio inventory', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-snapshot-'));
  const dataRoot = path.join(tempDir, 'data');
  const binDir = path.join(tempDir, 'bin');
  const commandLog = path.join(tempDir, 'commands.jsonl');
  const snapshotRoot = path.join(tempDir, 'snapshots');

  fs.mkdirSync(path.join(dataRoot, 'standardized'), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, 'standardized-view'), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'standardized', 'items.standardized.json'), '{"items":[]}\n', 'utf8');
  fs.writeFileSync(path.join(dataRoot, 'standardized-view', 'items.view.json'), '{"items":[]}\n', 'utf8');
  writeExecutable(path.join(binDir, 'mysqldump'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(commandLog)}, JSON.stringify({ command: 'mysqldump', args: process.argv.slice(2) }) + '\\n');
process.stdout.write('-- fake dump\\nINSERT INTO items VALUES (1);\\n');
`);
  writeExecutable(path.join(binDir, 'mc'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(commandLog)}, JSON.stringify({ command: 'mc', args: process.argv.slice(2) }) + '\\n');
process.stdout.write('terrapedia-images/items/wood.png\\n');
`);

  const result = spawnSync('bash', [
    snapshotScript,
    'baseline-phase0',
    `--data-root=${dataRoot}`,
    `--snapshot-root=${snapshotRoot}`,
    '--timestamp=2026-05-20T06-00-00Z',
    '--db-host=127.0.0.1',
    '--db-port=3306',
    '--db-name=terria_v1_local',
    '--db-user=root',
    '--db-password=root',
    '--minio-alias=minio',
    '--minio-bucket=terrapedia-images'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const snapshotDir = path.join(snapshotRoot, 'baseline-phase0-2026-05-20T06-00-00Z');
  assert.equal(fs.existsSync(snapshotDir), true);
  assert.equal(fs.existsSync(path.join(snapshotDir, 'standardized.tar.gz')), true);
  assert.match(fs.readFileSync(path.join(snapshotDir, 'db-dump.sql'), 'utf8'), /INSERT INTO items/);
  assert.equal(fs.readFileSync(path.join(snapshotDir, 'minio-objects.txt'), 'utf8'), 'terrapedia-images/items/wood.png\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snapshotDir, 'manifest.json'), 'utf8')).tables, [
    'items',
    'item_category_rel',
    'item_images'
  ]);

  const commands = fs.readFileSync(commandLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const dump = commands.find((entry) => entry.command === 'mysqldump');
  assert.ok(dump.args.includes('terria_v1_local'));
  assert.ok(dump.args.includes('items'));
  assert.ok(dump.args.includes('item_category_rel'));
  assert.ok(dump.args.includes('item_images'));
  const minio = commands.find((entry) => entry.command === 'mc');
  assert.deepEqual(minio.args.slice(0, 4), ['ls', 'minio/terrapedia-images', '--summarize', '--recursive']);

  const tarList = execFileSync('tar', ['-tzf', path.join(snapshotDir, 'standardized.tar.gz')], { encoding: 'utf8' });
  assert.match(tarList, /standardized\/items\.standardized\.json/);
  assert.match(tarList, /standardized-view\/items\.view\.json/);
});

test('snapshot script can dump through a mysql socket', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-snapshot-socket-'));
  const dataRoot = path.join(tempDir, 'data');
  const binDir = path.join(tempDir, 'bin');
  const commandLog = path.join(tempDir, 'commands.jsonl');
  const snapshotRoot = path.join(tempDir, 'snapshots');

  fs.mkdirSync(path.join(dataRoot, 'standardized'), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, 'standardized-view'), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'standardized', 'items.standardized.json'), '{"items":[]}\n', 'utf8');
  fs.writeFileSync(path.join(dataRoot, 'standardized-view', 'items.view.json'), '{"items":[]}\n', 'utf8');
  writeExecutable(path.join(binDir, 'mysqldump'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(commandLog)}, JSON.stringify({ command: 'mysqldump', args: process.argv.slice(2) }) + '\\n');
process.stdout.write('-- fake dump\\n');
`);
  writeExecutable(path.join(binDir, 'mc'), `#!/usr/bin/env bash
exit 0
`);

  const result = spawnSync('bash', [
    snapshotScript,
    'baseline-phase0',
    `--data-root=${dataRoot}`,
    `--snapshot-root=${snapshotRoot}`,
    '--timestamp=2026-05-20T06-10-00Z',
    '--db-socket=/run/mysqld/mysqld.sock',
    '--db-name=terria_v1_local',
    '--db-user=root',
    '--db-password=root'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const dump = fs.readFileSync(commandLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line))[0];
  assert.ok(dump.args.includes('--socket=/run/mysqld/mysqld.sock'));
  assert.equal(dump.args.some((arg) => arg.startsWith('--host=')), false);
  assert.equal(dump.args.some((arg) => arg.startsWith('--port=')), false);
});

test('restore script extracts standardized data and imports db dump', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-restore-'));
  const sourceDataRoot = path.join(tempDir, 'source-data');
  const targetDataRoot = path.join(tempDir, 'target-data');
  const snapshotDir = path.join(tempDir, 'snapshot');
  const binDir = path.join(tempDir, 'bin');
  const commandLog = path.join(tempDir, 'commands.jsonl');

  fs.mkdirSync(path.join(sourceDataRoot, 'standardized'), { recursive: true });
  fs.mkdirSync(path.join(sourceDataRoot, 'standardized-view'), { recursive: true });
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDataRoot, 'standardized', 'items.standardized.json'), '{"items":[1]}\n', 'utf8');
  fs.writeFileSync(path.join(sourceDataRoot, 'standardized-view', 'items.view.json'), '{"items":[1]}\n', 'utf8');
  execFileSync('tar', ['-czf', path.join(snapshotDir, 'standardized.tar.gz'), '-C', sourceDataRoot, 'standardized', 'standardized-view']);
  fs.writeFileSync(path.join(snapshotDir, 'db-dump.sql'), 'CREATE TABLE items(id int);\n', 'utf8');
  writeExecutable(path.join(binDir, 'mysql'), `#!/usr/bin/env node
const fs = require('node:fs');
const input = fs.readFileSync(0, 'utf8');
fs.appendFileSync(${JSON.stringify(commandLog)}, JSON.stringify({ command: 'mysql', args: process.argv.slice(2), input }) + '\\n');
`);

  const result = spawnSync('bash', [
    restoreScript,
    snapshotDir,
    `--data-root=${targetDataRoot}`,
    '--db-host=127.0.0.1',
    '--db-port=3306',
    '--db-name=terria_v1_local',
    '--db-user=root',
    '--db-password=root'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(path.join(targetDataRoot, 'standardized', 'items.standardized.json'), 'utf8'), '{"items":[1]}\n');
  assert.equal(fs.readFileSync(path.join(targetDataRoot, 'standardized-view', 'items.view.json'), 'utf8'), '{"items":[1]}\n');
  const mysql = JSON.parse(fs.readFileSync(commandLog, 'utf8').trim());
  assert.ok(mysql.args.includes('terria_v1_local'));
  assert.match(mysql.input, /CREATE TABLE items/);
});

test('restore script can import through a mysql socket', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-restore-socket-'));
  const sourceDataRoot = path.join(tempDir, 'source-data');
  const targetDataRoot = path.join(tempDir, 'target-data');
  const snapshotDir = path.join(tempDir, 'snapshot');
  const binDir = path.join(tempDir, 'bin');
  const commandLog = path.join(tempDir, 'commands.jsonl');

  fs.mkdirSync(path.join(sourceDataRoot, 'standardized'), { recursive: true });
  fs.mkdirSync(path.join(sourceDataRoot, 'standardized-view'), { recursive: true });
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDataRoot, 'standardized', 'items.standardized.json'), '{"items":[1]}\n', 'utf8');
  fs.writeFileSync(path.join(sourceDataRoot, 'standardized-view', 'items.view.json'), '{"items":[1]}\n', 'utf8');
  execFileSync('tar', ['-czf', path.join(snapshotDir, 'standardized.tar.gz'), '-C', sourceDataRoot, 'standardized', 'standardized-view']);
  fs.writeFileSync(path.join(snapshotDir, 'db-dump.sql'), 'CREATE TABLE items(id int);\n', 'utf8');
  writeExecutable(path.join(binDir, 'mysql'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.readFileSync(0, 'utf8');
fs.appendFileSync(${JSON.stringify(commandLog)}, JSON.stringify({ command: 'mysql', args: process.argv.slice(2) }) + '\\n');
`);

  const result = spawnSync('bash', [
    restoreScript,
    snapshotDir,
    `--data-root=${targetDataRoot}`,
    '--db-socket=/run/mysqld/mysqld.sock',
    '--db-name=terria_v1_local',
    '--db-user=root',
    '--db-password=root'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const mysql = JSON.parse(fs.readFileSync(commandLog, 'utf8').trim());
  assert.ok(mysql.args.includes('--socket=/run/mysqld/mysqld.sock'));
  assert.equal(mysql.args.some((arg) => arg.startsWith('--host=')), false);
  assert.equal(mysql.args.some((arg) => arg.startsWith('--port=')), false);
});

test('snapshot script removes incomplete snapshot directory when a command fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-snapshot-failed-'));
  const dataRoot = path.join(tempDir, 'data');
  const binDir = path.join(tempDir, 'bin');
  const snapshotRoot = path.join(tempDir, 'snapshots');

  fs.mkdirSync(path.join(dataRoot, 'standardized'), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, 'standardized-view'), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'standardized', 'items.standardized.json'), '{"items":[]}\n', 'utf8');
  fs.writeFileSync(path.join(dataRoot, 'standardized-view', 'items.view.json'), '{"items":[]}\n', 'utf8');
  writeExecutable(path.join(binDir, 'mysqldump'), `#!/usr/bin/env bash
echo "mysqldump failed" >&2
exit 9
`);
  writeExecutable(path.join(binDir, 'mc'), `#!/usr/bin/env bash
exit 0
`);

  const result = spawnSync('bash', [
    snapshotScript,
    'baseline-phase0',
    `--data-root=${dataRoot}`,
    `--snapshot-root=${snapshotRoot}`,
    '--timestamp=2026-05-20T06-30-00Z',
    '--db-password=root'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`
    }
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(snapshotRoot, 'baseline-phase0-2026-05-20T06-30-00Z')), false);
});

test('data snapshots are ignored by git', () => {
  const source = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');

  assert.match(source, /^data\/_snapshots\/$/m);
});

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}
