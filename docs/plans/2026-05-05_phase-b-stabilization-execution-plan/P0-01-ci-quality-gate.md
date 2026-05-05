# P0-01 CI Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions quality gate that is CI-safe and clearly separate from local runtime verification.

**Architecture:** Create `quality-gate-ci.ps1` as a narrow no-DB/no-service gate and have GitHub Actions call that script on `windows-latest`. Keep `scripts/dev/quality-gate.ps1` as the local full gate.

**Tech Stack:** GitHub Actions, Windows runner, PowerShell, Node.js, Maven, pnpm.

---

## Files

- Create: `.github/workflows/quality-gate.yml`
- Create: `scripts/dev/quality-gate-ci.ps1`
- Modify: `scripts/dev/quality-gate.test.mjs`
- Modify: `docs/project-management/decision-log.md`
- Modify: `docs/project-management/risk-register.md`
- Modify if validation is blocked: `docs/project-management/daily/2026-05-05.md`

## Steps

- [ ] **Step 1: Write failing tests for CI boundary**

Add these tests to `scripts/dev/quality-gate.test.mjs`:

```js
test('ci quality gate script stays CI safe', () => {
  const source = fs.readFileSync('scripts/dev/quality-gate-ci.ps1', 'utf8');
  assert.doesNotMatch(source, /verify-local-stack\.ps1/i);
  assert.doesNotMatch(source, /\b(import|backfill|apply|load|crawl)\b/i);
  assert.doesNotMatch(source, /--fail-on-warning=true/i);
  assert.match(source, /Data workflow acceptance tests/);
  assert.match(source, /Backend acceptance contract tests/);
});

test('github quality gate calls ci script on windows runner', () => {
  const source = fs.readFileSync('.github/workflows/quality-gate.yml', 'utf8');
  assert.match(source, /windows-latest/);
  assert.match(source, /scripts\/dev\/quality-gate-ci\.ps1/);
  assert.doesNotMatch(source, /verify-local-stack\.ps1/i);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test scripts/dev/quality-gate.test.mjs
```

Expected: FAIL because `quality-gate-ci.ps1` and workflow do not exist yet.

- [ ] **Step 3: Create `scripts/dev/quality-gate-ci.ps1`**

Required command groups:

```powershell
node --test scripts/dev/quality-gate.test.mjs scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
cd back; mvn "-Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest,DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest" test
cd front; pnpm run test
cd data-query-app; pnpm run test
```

Do not include `verify-local-stack.ps1`, crawler/import/backfill/load/apply commands, DB service startup, or `--fail-on-warning=true`.

- [ ] **Step 4: Create `.github/workflows/quality-gate.yml`**

Use this workflow shape:

```yaml
name: Quality Gate

on:
  pull_request:
  push:
    branches:
      - main
      - feature/**

jobs:
  quality-gate:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - name: Enable pnpm
        run: corepack enable
      - name: Install front dependencies
        working-directory: front
        run: pnpm install --frozen-lockfile
      - name: Install admin dependencies
        working-directory: data-query-app
        run: pnpm install --frozen-lockfile
      - name: Run CI-safe quality gate
        shell: pwsh
        run: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate-ci.ps1
```

- [ ] **Step 5: Update project records**

Append to `docs/project-management/decision-log.md`:

```markdown
## D-2026-05-05-06: CI v1 warning policy

Decision: CI v1 fails on blocking, unsafe generator command, DB-writing generator command, and public-blocking missing/unknown evidence. CI v1 does not fail on ordinary warning.
Reason: Existing stale reports and relation warnings should remain visible without making initial CI permanently red.
```

Append to `docs/project-management/risk-register.md`:

```markdown
| R-2026-05-05-06 | Medium | CI | CI-safe gate diverges from local full gate | `quality-gate-ci.ps1` is tested and documented; local full gate remains required before release checkpoints | Open |
```

- [ ] **Step 6: Validate CI tests**

Run:

```powershell
node --test scripts/dev/quality-gate.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate-ci.ps1 -SkipFront -SkipAdmin
```

Expected: `node --test` passes. If local dependencies block script execution, record the exact missing tool or dependency in `docs/project-management/daily/2026-05-05.md`.

- [ ] **Step 7: Commit**

Run:

```powershell
git add .github/workflows/quality-gate.yml scripts/dev/quality-gate-ci.ps1 scripts/dev/quality-gate.test.mjs docs/project-management/decision-log.md docs/project-management/risk-register.md docs/project-management/daily/2026-05-05.md
git commit -m "ci: add phase b safe quality gate"
```
