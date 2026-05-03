import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('quality gate includes domain acceptance workflow tests', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.ps1', 'utf8');

  for (const testPath of [
    'scripts/data/audit/domain-readiness-audit.test.mjs',
    'scripts/data/workflow/domain-acceptance-report-manifest.test.mjs',
    'scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs',
    'scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs',
    'scripts/data/workflow/domain-acceptance-generate-reports.test.mjs',
  ]) {
    assert.match(source, new RegExp(escapeRegExp(testPath)), `${testPath} should be included in quality gate`);
  }
});

test('quality gate runs full domain acceptance dry-run without writing reports', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.ps1', 'utf8');

  assert.match(source, /Domain acceptance full dry-run/);
  assert.match(source, /scripts\/data\/workflow\/domain-acceptance-generate-reports\.mjs/);
  assert.match(source, /--fail-on-blocked=true/);
  assert.match(source, /--fail-on-warning=true/);
  assert.doesNotMatch(source, /domain-acceptance-generate-reports\.mjs[\s\S]*--write=true/);
});

test('quality gate includes backend domain acceptance contract tests', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.ps1', 'utf8');

  assert.match(source, /Backend domain acceptance tests/);
  assert.match(source, /DomainAcceptanceServiceImplTest/);
  assert.match(source, /AdminDomainAcceptanceControllerTest/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
