import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  DEFAULT_ALLOWLIST,
  isAllowlisted,
  scanRelativePath,
  scanText,
  scanRepository
} from './check-root-artifact-contract.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function readRootSummaryBeforeRemoval(name) {
  const deletionCommit = execFileSync(
    'git',
    ['-C', repoRoot, 'log', '--format=%H', '--diff-filter=D', '-1', '--', name],
    { encoding: 'utf8' }
  ).trim();

  assert.notEqual(deletionCommit, '', `expected a deletion commit for ${name}`);
  return execFileSync('git', ['-C', repoRoot, 'show', `${deletionCommit}^:${name}`]);
}

test('root artifact scanner rejects new root temporary and summary references', () => {
  const findings = scanText(
    'tmp/audit-shots\nlogs/server.log\nreports/tmp/result.json\nPLAN_FIXES_SUMMARY.md\n',
    'fixture.md'
  );

  assert.deepEqual(
    findings.map(({ kind, value }) => ({ kind, value })),
    [
      { kind: 'root-tmp', value: 'tmp/audit-shots' },
      { kind: 'root-logs', value: 'logs/server.log' },
      { kind: 'reports-tmp', value: 'reports/tmp/result.json' },
      { kind: 'root-summary', value: 'PLAN_FIXES_SUMMARY.md' }
    ]
  );
});

test('root artifact scanner rejects bare root output directories', () => {
  const findings = scanText('tmp/\nlogs/\nreports/tmp/\n', 'fixture.md');

  assert.deepEqual(
    findings.map(({ kind, value }) => ({ kind, value })),
    [
      { kind: 'root-tmp', value: 'tmp/' },
      { kind: 'root-logs', value: 'logs/' },
      { kind: 'reports-tmp', value: 'reports/tmp/' }
    ]
  );
});

test('root artifact scanner rejects a new root summary file', () => {
  assert.deepEqual(scanRelativePath('NEW_SUMMARY.md'), [
    { kind: 'root-summary-file', value: 'NEW_SUMMARY.md', path: 'NEW_SUMMARY.md' }
  ]);
  assert.deepEqual(scanRelativePath('docs/audits/NEW_SUMMARY.md'), []);
});

test('root artifact scanner permits OS temp paths and explicit historical allowlist entries', () => {
  const findings = scanText(
    '/tmp/terrapedia-e2e/run.json\nreports/runtime/audit-shoot/result.json\n',
    'fixture.md'
  );

  assert.deepEqual(findings, []);
  assert.equal(DEFAULT_ALLOWLIST.has('README.md'), true);
  assert.equal(isAllowlisted('docs/devlog/entries/historical.md'), true);
  assert.equal(isAllowlisted('apps/public-web/scripts/new-output.mjs'), false);
});

test('repository scan has no unallowlisted root artifact references', () => {
  const findings = scanRepository(repoRoot);
  assert.deepEqual(findings, []);
});

test('audit shoot defaults to the governed local temporary output directory', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'apps/public-web/scripts/audit-shoot.mjs'),
    'utf8'
  );

  assert.match(source, /AUDIT_OUT \|\| ['"]\.local\/tmp\/audit-shots['"]/);
  assert.doesNotMatch(source, /AUDIT_OUT \|\| ['"]tmp\/audit-shots['"]/);
});

test('historical summaries are archived byte-for-byte', () => {
  for (const name of ['PLAN_FIXES_SUMMARY.md', 'REFACTORING_SUMMARY.md']) {
    const archivePath = path.join(repoRoot, 'docs/project-governance/archive', name);
    const original = readRootSummaryBeforeRemoval(name);

    assert.equal(fs.existsSync(path.join(repoRoot, name)), false, `${name} must leave the root`);
    assert.deepEqual(fs.readFileSync(archivePath), original, `${name} archive must be unchanged`);
  }
});
