import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = () => fs.readFileSync('scripts/dev/acceptance-test.ps1', 'utf8');

test('acceptance blocked check counts schema violation arrays explicitly', () => {
  const text = source();

  assert.doesNotMatch(text, /schemaViolations\s+-gt\s+0/);
  assert.match(text, /Get-OptionalArrayCount \$Parsed\.summary 'schemaViolations'/);
});

test('acceptance blocks incomplete canonical candidate and consistency metrics', () => {
  const text = source();

  assert.match(text, /\$Parsed\.summary\.coverageRate\s+-lt\s+1/);
  assert.match(text, /\$Parsed\.summary\.hashMatchRate\s+-lt\s+1/);
  assert.match(text, /Get-OptionalArrayCount \$Parsed\.summary 'missingLandingInputs'/);
});

test('acceptance has explicit fail-on-warning mode without changing default', () => {
  const text = source();

  assert.match(text, /\[switch\]\$FailOnWarning/);
  assert.match(text, /function Test-AcceptanceBlocked\(\[object\]\$Parsed,\s*\[bool\]\$FailOnWarningMode = \$false\)/);
  assert.match(text, /if \(\$FailOnWarningMode -and \$statusPaths -contains 'warning'\)/);
  assert.match(text, /Test-AcceptanceBlocked \$parsed -FailOnWarningMode:\$FailOnWarning/);
});

test('acceptance script stays compatible with Windows PowerShell 5 syntax', () => {
  const text = source();

  assert.doesNotMatch(text, /\?\?/);
  assert.doesNotMatch(text, /\{\s*\[string\]\$Parsed\.[^}]+\},/);
  assert.doesNotMatch(text, /\$host\s*=/i);
});

test('acceptance chain artifacts are written as UTF-8 without BOM for node JSON readers', () => {
  const text = source();

  assert.match(text, /Set-Utf8NoBomContent/);
  assert.doesNotMatch(text, /Set-Content -Path \$OutputPath -Encoding utf8/);
});

test('acceptance summary counts are scalar-safe for zero or one matching result', () => {
  const text = source();

  assert.match(text, /function Count-ResultsByStatus/);
  assert.doesNotMatch(text, /\(\$script:results \| Where-Object \{ \$_.status -eq 'skip' \}\)\.Count/);
});
