import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('quality gate includes domain acceptance workflow tests', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');

  for (const testPath of [
    'scripts/data/crawler/tests/source-layout-warning.test.mjs',
    'scripts/data/audit/domain-readiness-audit.test.mjs',
    'scripts/data/workflow/domain-acceptance-report-manifest.test.mjs',
    'scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs',
    'scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs',
    'scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs',
    'scripts/data/workflow/domain-acceptance-generate-reports.test.mjs',
  ]) {
    assert.match(source, new RegExp(escapeRegExp(testPath)), `${testPath} should be included in quality gate`);
  }
});

test('quality gate runs crawler source layout drift check as warning-only', () => {
  const localSource = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciSource = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  for (const source of [localSource, ciSource]) {
    assert.match(source, /Crawler source layout check \(warning-only\)/);
    assert.match(source, /scripts\/data\/crawler\/source-layout-check\.mjs/);
  }
});

test('quality gates include wiki request gate contract tests', () => {
  const localSource = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciSource = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  for (const source of [localSource, ciSource]) {
    for (const testPath of [
      'scripts/data/lib/wiki-user-agent.test.mjs',
      'scripts/data/lib/wiki-direct-request-boundary.test.mjs',
      'scripts/data/lib/flaresolverr-bridge.test.mjs',
      'scripts/data/lib/wiki-request-gate.test.mjs',
      'scripts/data/lib/wiki-item-utils.test.mjs',
      'scripts/data/lib/wiki-image-fetch-server.test.mjs',
      'scripts/data/lib/python-wiki-gate-bridge-source.test.mjs',
    ]) {
      assert.match(source, new RegExp(escapeRegExp(testPath)), `${testPath} should be included in quality gates`);
    }
  }
});

test('quality gates include snapshot retention contract tests', () => {
  const localSource = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciSource = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  for (const source of [localSource, ciSource]) {
    for (const testPath of [
      'scripts/data/fetch/fetch-wiki-iteminfo.test.mjs',
      'scripts/data/fetch/fetch-wiki-item-pages.test.mjs',
      'scripts/data/fetch/snapshot-policy.test.mjs',
      'scripts/data/maint/gc-snapshots.test.mjs',
    ]) {
      assert.match(source, new RegExp(escapeRegExp(testPath)), `${testPath} should be included in quality gates`);
    }
  }
});

test('quality gate runs full domain acceptance dry-run without writing reports', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');

  assert.match(source, /Domain acceptance full dry-run/);
  assert.match(source, /scripts\/data\/workflow\/domain-acceptance-generate-reports\.mjs/);
  assert.match(source, /--fail-on-blocked=true/);
  assert.match(source, /--fail-on-warning=true/);
  assert.doesNotMatch(source, /domain-acceptance-generate-reports\.mjs[\s\S]*--write=true/);
});

test('quality gate runs A-grade gate without writing reports', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');

  assert.match(source, /Domain acceptance A-grade gate/);
  assert.match(source, /scripts\/data\/workflow\/domain-acceptance-a-grade-gate\.mjs/);
  assert.match(source, /--fail-on-blocked=true/);
  assert.doesNotMatch(source, /domain-acceptance-a-grade-gate\.mjs[\s\S]*--fail-on-warning=true/);
  assert.doesNotMatch(source, /domain-acceptance-a-grade-gate\.mjs[\s\S]*--write=true/);
});

test('quality gate includes cross-db referential integrity audit with FullDataAudit mode switch', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');

  assert.match(source, /full_data_audit=false/);
  assert.match(source, /Cross-db referential integrity audit/);
  assert.match(source, /scripts\/data\/audit\/cross-db-referential-integrity\.mjs/);
  assert.match(source, /cross_db_mode="\$\(if \$full_data_audit; then printf 'full'; else printf 'quick'; fi\)"/);
});

test('quality gate includes backend domain acceptance contract tests', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');

  assert.match(source, /Backend domain acceptance tests/);
  assert.match(source, /DomainAcceptanceServiceImplTest/);
  assert.match(source, /AdminDomainAcceptanceControllerTest/);
});

test('ci quality gate script stays CI safe', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  assert.doesNotMatch(source, /verify-local-stack\.(ps1|sh)/i);
  assert.doesNotMatch(source, /\b(import|backfill|apply|load|crawl)\b/i);
  assert.doesNotMatch(source, /--fail-on-warning=true/i);
  assert.match(source, /Data workflow acceptance tests/);
  assert.match(source, /Backend acceptance contract tests/);
  assert.match(source, /Domain acceptance A-grade contract tests/);
  assert.match(source, /domain-acceptance-a-grade-gate\.test\.mjs/);
  assert.doesNotMatch(source, /domain-acceptance-a-grade-gate\.mjs[\s\S]*--fail-on-warning=true/);
  assert.doesNotMatch(source, /domain-acceptance-generate-reports\.mjs[\s\S]*--write=true/);
});

test('ci quality gate does not fail on environment-local missing domain evidence', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  assert.doesNotMatch(source, /domain-acceptance-a-grade-gate\.mjs[\s\S]*--fail-on-blocked=true/);
  assert.match(source, /Domain acceptance A-grade contract tests/);
  assert.match(source, /scripts\/data\/workflow\/domain-acceptance-a-grade-gate\.test\.mjs/);
});

test('ci gate is intentionally narrower than the local full gate', () => {
  const localSource = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciSource = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  assert.match(localSource, /scripts\/data\/audit\/domain-readiness-audit\.test\.mjs/);
  assert.match(localSource, /scripts\/data\/workflow\/domain-acceptance-generate-reports\.test\.mjs/);
  assert.match(localSource, /Domain acceptance full dry-run/);
  assert.match(localSource, /domain-acceptance-generate-reports\.mjs/);
  assert.match(localSource, /--fail-on-warning=true/);
  assert.match(localSource, /run_step "Backend tests"[\s\S]*mvn test/);

  assert.doesNotMatch(ciSource, /scripts\/data\/audit\/domain-readiness-audit\.test\.mjs/);
  assert.doesNotMatch(ciSource, /scripts\/data\/workflow\/domain-acceptance-generate-reports\.test\.mjs/);
  assert.doesNotMatch(ciSource, /Domain acceptance full dry-run/);
  assert.doesNotMatch(ciSource, /domain-acceptance-generate-reports\.mjs/);
  assert.doesNotMatch(ciSource, /run_step "Backend tests"[\s\S]*mvn test/);
});

test('github quality gate calls ci script on ubuntu bash runner', () => {
  const source = fs.readFileSync('.github/workflows/quality-gate.yml', 'utf8');

  assert.match(source, /ubuntu-latest/);
  assert.match(source, /scripts\/dev\/quality-gate-ci\.sh/);
  assert.doesNotMatch(source, /verify-local-stack\.(ps1|sh)/i);
});

test('PowerShell quality gate wrappers delegate to Bash entrypoints', () => {
  const localWrapper = fs.readFileSync('scripts/dev/quality-gate.ps1', 'utf8');
  const ciWrapper = fs.readFileSync('scripts/dev/quality-gate-ci.ps1', 'utf8');

  assert.match(localWrapper, /quality-gate\.sh/);
  assert.match(ciWrapper, /quality-gate-ci\.sh/);
  assert.doesNotMatch(localWrapper, /Domain acceptance full dry-run/);
  assert.doesNotMatch(ciWrapper, /Backend acceptance contract tests/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
