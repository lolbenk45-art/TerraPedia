# Domain A-Grade Preview Closeout Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive TerraPedia from the current V0.1 preview-only state to an evidence-backed closeout state by repeatedly executing the next highest-priority blocker branch, updating the existing plans and project-management records after each result, and continuing until the planned gates either pass or produce a concrete follow-up repair branch.

**Architecture:** Treat this as a controller plan, not one large implementation branch. Each execution cycle starts from current local `main`, performs one narrow blocker or smoke task, commits and merges that task, reruns the relevant gate, then repairs the controller plan and project status documents based on the actual result before choosing the next branch. Domain acceptance remains the source of truth for release readiness; front-end and local-stack work are downstream validation, not substitutes for A-grade gate evidence.

**Tech Stack:** Git branches/worktrees, Node data workflow scripts, MySQL read-only inventory through `mysql2`, Nuxt `front-nuxt` validation scripts, local stack scripts under `scripts/dev`, Markdown audits under `docs/audits`, durable evidence under `reports/**`, and project-management records under `docs/project-management`.

---

## Current State

This plan starts from local `main` after the crawler monitor source progress work was merged.

Known state from committed records:

- `docs/project-management/current-status.md`
  - Phase: Phase C public preview stabilization.
  - V0.1 public preview is merged into local `main`.
  - Domain freshness is current: `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
  - Domain A-grade remains blocked: `generatedBlockedCount=2`, `generatedWarningCount=16`.
  - Remaining blockers: `bosses/imageReadiness` and `projectiles/relationReadiness`.
- `docs/audits/2026-05-24_domain-a-grade-db-read-environment.md`
  - `terria_v1_local`: present.
  - `terria_v1_relation`: present.
  - `terria_v1_maint`: missing.
- `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-closeout.md`
  - Four source readiness blockers were closed.
  - Boss image lineage and projectile relation coverage were not executed because the complete three-database read environment was missing.
- `docs/project-management/risk-register.md`
  - `R-2026-05-24-01` tracks the missing `terria_v1_maint` blocker.
  - `R-2026-05-23-03` tracks local `main` being ahead of `origin/main`.

## Closure Definition

This controller plan is complete only when all of these are true:

1. A final closeout document records the actual final state under `docs/audits/`.
2. `docs/project-management/current-status.md` and `docs/project-management/risk-register.md` reflect the actual final state.
3. The latest Domain freshness audit is committed or explicitly referenced from a committed closeout document.
4. The latest Domain A-grade gate result is committed or explicitly referenced from a committed closeout document.
5. One of these final outcomes is reached:
   - **Ready for release decision:** `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` exits `0`, public visual checks pass, and local stack smoke passes.
   - **Preview-only with explicit blocker:** at least one blocker remains, but it is mapped to a concrete follow-up branch with owner files, commands, and evidence gaps. The project status must say preview-only.

## Non-Goals

- Do not push to remote unless the user explicitly asks.
- Do not run crawler, import, backfill, load, apply, storage sync, or DB-writing scripts from this controller plan.
- Do not synthesize a fake `terria_v1_maint` database to make evidence pass.
- Do not downgrade a Domain A-grade blocker to warning without gate-consumed evidence or an explicit release decision recorded in project-management docs.
- Do not use front-end visual success as a replacement for Domain Acceptance success.
- Stage explicit files only; never stage the whole repository tree with a single broad add command.

## Source Chain

Domain readiness must flow through this chain:

```text
source/generated evidence -> domain reports -> freshness audit -> A-grade gate -> project status -> public preview/release decision
```

Public visual readiness must flow through this chain:

```text
front-nuxt runtime route -> visual checker -> audit/closeout document -> project status
```

Local stack readiness must flow through this chain:

```text
local stack scripts -> read-only smoke/API/page checks -> local-start report or closeout document -> project status
```

No UI page, admin monitor, or local runtime probe may generate Domain A-grade evidence directly.

## Global Execution Rules

Use this loop for every task branch:

```bash
git switch main
git status --short --branch -uall
git switch -c "$TASK_BRANCH"
```

Before committing:

```bash
git status --short
git diff --check
git diff --cached --stat
git diff --cached --name-status
```

After committing a task branch:

```bash
git switch main
git merge --no-ff "$TASK_BRANCH" -m "Merge branch '$TASK_BRANCH'"
git status --short --branch -uall
```

After each merge, rerun the narrow validation for that branch and record the actual result in the relevant audit or closeout document. If a gate result changes the plan, patch this controller plan in a small docs-only commit before starting the next task branch.

## Branch Sequence

Run these branches in order unless a branch discovers a critical blocker that makes the next branch unsafe:

1. `fix/domain-a-grade-db-read-environment-2026-05-24`
2. `fix/domain-a-grade-boss-image-lineage-2026-05-24`
3. `fix/domain-a-grade-projectile-relation-coverage-2026-05-24`
4. `fix/domain-a-grade-closeout-2026-05-24`
5. `fix/front-nuxt-preview-final-smoke-2026-05-24`
6. `fix/local-stack-preview-closeout-smoke-2026-05-24`
7. `docs/project-preview-release-decision-2026-05-24`

If a branch ends with a blocker instead of a pass, add the next concrete repair branch after the failed branch and do not skip directly to the release decision branch.

## Agent Split

Use multi-agent execution only where ownership is disjoint:

- **Agent A: DB read environment and configuration evidence**
  - Owns `docs/audits/*db-read-environment*`, local read-only DB inventory commands, and project-management updates for DB risks.
  - Must not edit front-end files or crawler scripts.
- **Agent B: Boss image lineage evidence**
  - Owns Boss image lineage audit/report files and the related domain blocker classification.
  - Must not edit projectile relation scripts.
- **Agent C: Projectile relation coverage evidence**
  - Owns projectile relation baseline report/audit and any relation-coverage classification.
  - Must not edit Boss image lineage files.
- **Agent D: Front-end visual and local-stack smoke**
  - Owns `front-nuxt` visual/smoke evidence and local-stack closeout docs.
  - Must not write DB or Domain A-grade evidence.
- **Agent E: Plan and project-management reconciler**
  - Owns this controller plan, `docs/project-management/current-status.md`, `docs/project-management/risk-register.md`, and final decision docs.
  - Must not edit product code.

No two agents may edit the same Markdown file in parallel. Project-management files are single-writer files.

## Task 0: Commit This Controller Plan

**Files**

- Create: `docs/superpowers/plans/2026-05-24-domain-a-grade-preview-closeout-loop.md`

- [ ] **Step 1: Verify branch and scope**

Run:

```bash
git status --short --branch -uall
git branch --show-current
```

Expected:

- Current branch is `plan/domain-a-grade-preview-closeout-loop-2026-05-24`.
- Only this plan file is uncommitted.

- [ ] **Step 2: Self-audit the plan**

Run:

```bash
node - <<'NODE'
import fs from 'node:fs';
const path = 'docs/superpowers/plans/2026-05-24-domain-a-grade-preview-closeout-loop.md';
const text = fs.readFileSync(path, 'utf8');
const patterns = [
  ['placeholder marker', new RegExp('T' + 'BD')],
  ['todo marker', new RegExp('TO' + 'DO')],
  ['empty-value phrase', new RegExp('fi' + 'll in', 'i')],
  ['deferred-implementation phrase', new RegExp('implement ' + 'later', 'i')],
  ['cross-reference shortcut', new RegExp('similar ' + 'to', 'i')],
  ['vague error handling phrase', new RegExp('appropriate ' + 'error', 'i')],
  ['open-ended investigation phrase', new RegExp('investigate and ' + 'decide', 'i')],
];
const failures = patterns.flatMap(([label, pattern]) => pattern.test(text) ? [label] : []);
if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}
console.log('placeholder scan passed');
NODE
```

Expected:

- No placeholder-style matches.
- If a match is intentional source text, rewrite it so the plan remains explicit.

- [ ] **Step 3: Commit the plan**

Run:

```bash
git add docs/superpowers/plans/2026-05-24-domain-a-grade-preview-closeout-loop.md
git diff --cached --stat
git commit -m "docs: plan domain a-grade preview closeout loop"
```

Expected:

- Commit contains only this controller plan.

## Task 1: Restore Or Point The DB Read Environment

**Branch**

`fix/domain-a-grade-db-read-environment-2026-05-24`

**Goal**

Make the three database names required by the existing evidence commands readable from the local environment, without writing DB records as part of this task.

**Files**

- Modify: `docs/audits/2026-05-24_domain-a-grade-db-read-environment.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify only if a durable config/read helper is needed: `scripts/lib/local-runtime-config.mjs`
- Create if needed: `docs/audits/2026-05-24_domain-a-grade-db-read-environment-closeout.md`

- [ ] **Step 1: Reproduce the current read environment**

Run:

```bash
node - <<'NODE'
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadLocalStackConfig } from './scripts/lib/local-runtime-config.mjs';
const require = createRequire(path.join(process.cwd(), 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');
const config = loadLocalStackConfig(process.cwd());
const options = {
  host: config.database?.host ?? '127.0.0.1',
  port: Number(config.database?.port ?? 3306),
  user: config.database?.username ?? 'root',
  password: config.database?.password ?? 'root',
};
const conn = await mysql.createConnection(options);
const [rows] = await conn.query("SHOW DATABASES LIKE 'terria_v1_%'");
console.log(JSON.stringify({
  options: { ...options, password: '[redacted]' },
  databases: rows.map((row) => Object.values(row)[0]).sort(),
}, null, 2));
await conn.end();
NODE
```

Expected:

- The command exits `0`.
- Output includes `terria_v1_local`, `terria_v1_relation`, and either includes or still misses `terria_v1_maint`.
- If the command fails because dependencies are missing in a worktree, use the existing installed `data-query-app/node_modules` through `NODE_PATH` and record that exception in the audit. Do not install dependencies as part of this branch unless validation cannot run otherwise.

- [ ] **Step 2: Choose a read-only environment path**

Allowed outcomes:

- If `terria_v1_maint` exists on another configured local MySQL instance, update local-only config or documented runtime instructions to point evidence commands at that readable instance.
- If `terria_v1_maint` is available as a local dump, restore it outside this plan only after explicit user approval, then rerun Step 1. The restore itself must be recorded as an operator action, not hidden inside the branch.
- If no readable maint database exists, stop this branch after writing a blocker closeout and do not proceed to Task 2 or Task 3.

Disallowed outcomes:

- Do not create an empty `terria_v1_maint`.
- Do not copy tables from other databases to fake coverage.
- Do not modify evidence scripts so they silently skip maint-only checks.

- [ ] **Step 3: Add a durable closeout audit**

Create or update `docs/audits/2026-05-24_domain-a-grade-db-read-environment-closeout.md` with:

```md
# Domain A-Grade DB Read Environment Closeout - 2026-05-24

## Goal

Make `terria_v1_local`, `terria_v1_relation`, and `terria_v1_maint` readable for DB-dependent Domain A-grade evidence.

## Result

- `terria_v1_local`:
- `terria_v1_relation`:
- `terria_v1_maint`:
- Decision:

## Commands

```bash
node - <<'NODE'
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadLocalStackConfig } from './scripts/lib/local-runtime-config.mjs';
const require = createRequire(path.join(process.cwd(), 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');
const config = loadLocalStackConfig(process.cwd());
const options = {
  host: config.database?.host ?? '127.0.0.1',
  port: Number(config.database?.port ?? 3306),
  user: config.database?.username ?? 'root',
  password: config.database?.password ?? 'root',
};
const conn = await mysql.createConnection(options);
const [rows] = await conn.query("SHOW DATABASES LIKE 'terria_v1_%'");
console.log(JSON.stringify({
  options: { ...options, password: '[redacted]' },
  databases: rows.map((row) => Object.values(row)[0]).sort(),
}, null, 2));
await conn.end();
NODE
```

## Output Summary

- Host:
- Port:
- User:
- Databases:

## Follow-Up

- Next branch:
- Blocker if any:
```

Replace every blank value with the observed result before committing.

- [ ] **Step 4: Update project-management records**

Update `docs/project-management/current-status.md`:

- If all three DBs are readable, change the DB blocker text from "missing `terria_v1_maint`" to "DB read environment restored; next branch is Boss image lineage evidence."
- If `terria_v1_maint` remains missing, keep V0.1 preview-only and name the exact operator action required before execution can continue.

Update `docs/project-management/risk-register.md`:

- If all three DBs are readable, mark `R-2026-05-24-01` as reduced and set the next action to rerun Boss image lineage and projectile relation coverage.
- If still missing, keep `R-2026-05-24-01` open and set the next action to restore/provide a readable maint database.

- [ ] **Step 5: Validate and commit**

Run:

```bash
git diff --check
git status --short
```

If all three DBs are readable, run:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-db-env.json
```

Expected:

- Freshness command exits `0`.
- No generated progress or DB dump files are staged.

Commit:

```bash
git add docs/audits/2026-05-24_domain-a-grade-db-read-environment.md \
  docs/audits/2026-05-24_domain-a-grade-db-read-environment-closeout.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md
git diff --cached --stat
git commit -m "docs: close domain a-grade db read environment"
```

Omit any audit file that was not regenerated in this run.

## Task 2: Reclassify Boss Image Lineage

**Branch**

`fix/domain-a-grade-boss-image-lineage-2026-05-24`

**Entry Condition**

Task 1 must prove `terria_v1_maint` is readable. If it does not, this task must not start.

**Goal**

Generate durable gate-consumed Boss image lineage evidence and determine whether `bosses/imageReadiness` is cleared or needs a concrete product/data repair branch.

**Files**

- Create or modify: `docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md`
- Create or modify generated report paths produced by `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify this plan only if the task outcome changes the remaining branch sequence.

- [ ] **Step 1: Run the lineage evidence command**

Run:

```bash
node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-24T00:00:00.000Z
```

Expected:

- Command exits `0`.
- It prints or writes a report path matching the existing Domain A-grade evidence patterns.
- If it fails due to missing DB/schema/table/column, capture the exact missing piece in `docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md`, stop this task, and add a new repair branch to this controller plan.

- [ ] **Step 2: Regenerate domain reports**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
```

Expected:

- Command exits `0`.
- Boss image readiness panel now consumes the new lineage evidence or reports a concrete remaining image issue.

- [ ] **Step 3: Run focused gate check**

Run:

```bash
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-boss-lineage.json || test "$?" -eq 1
node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('/tmp/terrapedia-domain-a-grade-boss-lineage.json','utf8')); console.log(JSON.stringify({overallStatus:o.overallStatus, generatedBlockedCount:o.generatedBlockedCount, generatedWarningCount:o.generatedWarningCount, blockedPanels:(o.generatedPanels||[]).filter(p=>p.status==='blocked').map(p=>p.id||p.panelId||p.key)}, null, 2));"
```

Expected:

- The command reports whether `bosses/imageReadiness` remains blocked.
- If it remains blocked, the blocker is caused by a concrete image lineage defect, not missing report evidence.

- [ ] **Step 4: Update closeout and project records**

Update `docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md` with:

- command run,
- report paths generated,
- whether `bosses/imageReadiness` is `pass`, `warning`, or `blocked`,
- exact follow-up branch if blocked.

Update `docs/project-management/current-status.md` and `docs/project-management/risk-register.md` to reflect the actual result.

- [ ] **Step 5: Commit**

Run:

```bash
git status --short
git diff --check
```

Stage explicit files only:

```bash
git status --short > /tmp/terrapedia-boss-lineage-status.txt
sed -n '1,200p' /tmp/terrapedia-boss-lineage-status.txt
git add docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md
git add reports/audit/image-source-lineage*.json
git add reports/domain/**/2026-05-24.json
git diff --cached --stat
git commit -m "docs: reclassify boss image lineage readiness"
```

Before running the `git add reports/...` commands, inspect `/tmp/terrapedia-boss-lineage-status.txt`. Omit any glob that matches no regenerated files in this run.

## Task 3: Reclassify Projectile Relation Coverage

**Branch**

`fix/domain-a-grade-projectile-relation-coverage-2026-05-24`

**Entry Condition**

Task 1 must prove all three databases are readable.

**Goal**

Generate a fresh projectile relation coverage baseline and determine whether `projectiles/relationReadiness` is cleared or requires a concrete data/API repair branch.

**Files**

- Create or modify: `docs/audits/2026-05-24_domain-a-grade-projectile-relation-coverage.md`
- Create or modify generated relation coverage report paths produced by `scripts/data/relation/entity-coverage-baseline.mjs`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify this plan only if the task outcome changes the remaining branch sequence.

- [ ] **Step 1: Run the fresh relation coverage command**

Run:

```bash
node scripts/data/relation/entity-coverage-baseline.mjs \
  --local-database=terria_v1_local \
  --maint-database=terria_v1_maint \
  --relation-database=terria_v1_relation
```

Expected:

- Command exits `0`.
- It writes or identifies a fresh relation coverage baseline.
- It reports current projectile gaps, including whether `nameZh.gap` is still greater than `0`.

- [ ] **Step 2: Classify the result**

If `projectiles.nameZh.gap === 0`:

- Record that the old `nameZh.gap=1006` was stale evidence.
- Continue to Step 3.

If `projectiles.nameZh.gap > 0`:

- Record the exact gap count.
- Create a new follow-up branch entry in this controller plan: `fix/projectile-name-zh-relation-coverage-2026-05-24`.
- Do not claim Domain A-grade closeout.

If the command fails:

- Record the missing schema/table/column/permission in the audit.
- Add a specific follow-up branch to this controller plan.
- Do not continue to Task 4.

- [ ] **Step 3: Regenerate domain reports and focused gate check**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-projectile-relation.json || test "$?" -eq 1
node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('/tmp/terrapedia-domain-a-grade-projectile-relation.json','utf8')); console.log(JSON.stringify({overallStatus:o.overallStatus, generatedBlockedCount:o.generatedBlockedCount, generatedWarningCount:o.generatedWarningCount, blockedPanels:(o.generatedPanels||[]).filter(p=>p.status==='blocked').map(p=>p.id||p.panelId||p.key)}, null, 2));"
```

Expected:

- The output shows whether `projectiles/relationReadiness` remains blocked.

- [ ] **Step 4: Update closeout and project records**

Update `docs/audits/2026-05-24_domain-a-grade-projectile-relation-coverage.md` with:

- command run,
- generated report paths,
- projectile gap counts,
- whether `projectiles/relationReadiness` is `pass`, `warning`, or `blocked`,
- exact follow-up branch if blocked.

Update `docs/project-management/current-status.md` and `docs/project-management/risk-register.md`.

- [ ] **Step 5: Commit**

Run:

```bash
git status --short
git diff --check
```

Stage explicit files only:

```bash
git status --short > /tmp/terrapedia-projectile-relation-status.txt
sed -n '1,200p' /tmp/terrapedia-projectile-relation-status.txt
git add docs/audits/2026-05-24_domain-a-grade-projectile-relation-coverage.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md
git add reports/relation/entity-coverage-baseline*.json
git add reports/domain/**/2026-05-24.json
git diff --cached --stat
git commit -m "docs: reclassify projectile relation readiness"
```

Before running the `git add reports/...` commands, inspect `/tmp/terrapedia-projectile-relation-status.txt`. Omit any glob that matches no regenerated files in this run.

## Task 4: Domain A-Grade Gate Closeout

**Branch**

`fix/domain-a-grade-closeout-2026-05-24`

**Entry Condition**

Tasks 1, 2, and 3 must either pass or create explicit blocker branches. If any blocker branch is required, execute that blocker branch before starting this closeout task.

**Goal**

Create a durable closeout proving whether Domain A-grade is release-decision ready or still preview-only with named blockers.

**Files**

- Create: `docs/audits/2026-05-24_domain-a-grade-final-closeout.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify this plan if the next task sequence changes.

- [ ] **Step 1: Regenerate reports**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
```

Expected:

- Command exits `0`.
- Domain reports are current.

- [ ] **Step 2: Run freshness audit**

Run:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-final-closeout.json
node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('/tmp/terrapedia-domain-freshness-final-closeout.json','utf8')); console.log(JSON.stringify({overallStatus:o.overallStatus,freshCount:o.freshCount,missingCount:o.missingCount,staleCount:o.staleCount,unknownCount:o.unknownCount}, null, 2));"
```

Expected:

- `overallStatus` is `pass`.
- `missingCount`, `staleCount`, and `unknownCount` are `0`.

- [ ] **Step 3: Run A-grade gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-final-closeout.json
```

Expected if ready:

- Command exits `0`.
- `generatedBlockedCount` is `0`.

If the command exits nonzero:

Run:

```bash
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-final-closeout.json || true
node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync('/tmp/terrapedia-domain-a-grade-final-closeout.json','utf8')); console.log(JSON.stringify({overallStatus:o.overallStatus,generatedPassCount:o.generatedPassCount,generatedWarningCount:o.generatedWarningCount,generatedBlockedCount:o.generatedBlockedCount,blockedPanels:(o.generatedPanels||[]).filter(p=>p.status==='blocked').map(p=>p.id||p.panelId||p.key)}, null, 2));"
```

Expected if still blocked:

- The blocked panel list is concrete.
- Add one follow-up branch per independent blocker before continuing to front-end final smoke.

- [ ] **Step 4: Write final closeout**

Create `docs/audits/2026-05-24_domain-a-grade-final-closeout.md` with:

```md
# Domain A-Grade Final Closeout - 2026-05-24

## Result

- Freshness:
- A-grade:
- Release readiness:

## Freshness Summary

- freshCount:
- missingCount:
- staleCount:
- unknownCount:

## A-Grade Summary

- generatedPassCount:
- generatedWarningCount:
- generatedBlockedCount:
- blockedPanels:

## Gate Commands

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

## Decision

- If `generatedBlockedCount=0`, continue to front-nuxt final smoke.
- If blocked, keep V0.1 preview-only and execute the named follow-up branches first.
```

Replace every summary value with actual output.

- [ ] **Step 5: Update project-management records**

Update `docs/project-management/current-status.md`:

- If `generatedBlockedCount=0`, set the next sequence to front-nuxt final smoke and release-decision review.
- If blocked, keep preview-only and list the follow-up branches.

Update `docs/project-management/risk-register.md`:

- Reduce or close risks that are proven by committed evidence.
- Keep any remaining blockers open with exact next action.

- [ ] **Step 6: Commit**

Run:

```bash
git status --short
git diff --check
```

Stage explicit files only:

```bash
git status --short > /tmp/terrapedia-domain-closeout-status.txt
sed -n '1,200p' /tmp/terrapedia-domain-closeout-status.txt
git add docs/audits/2026-05-24_domain-a-grade-final-closeout.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md
git add reports/domain/**/2026-05-24.json
git diff --cached --stat
git commit -m "docs: close domain a-grade gate status"
```

Before running `git add reports/domain/**/2026-05-24.json`, inspect `/tmp/terrapedia-domain-closeout-status.txt`. Omit the glob if no domain reports were regenerated in this run.

## Task 5: Front Nuxt Public Visual Final Smoke

**Branch**

`fix/front-nuxt-preview-final-smoke-2026-05-24`

**Entry Condition**

Task 4 must have `generatedBlockedCount=0`, or the user must explicitly accept preview-only front-end smoke while Domain A-grade remains blocked.

**Goal**

Verify that the public `front-nuxt` surface still satisfies the visual and route gates after Domain A-grade blocker work.

**Files**

- Create: `docs/audits/2026-05-24_front-nuxt-preview-final-smoke.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify product files only if a visual gate failure is found and the branch is explicitly converted into a repair branch.

- [ ] **Step 1: Start or confirm local stack**

Run:

```bash
bash scripts/dev/start-local-stack.sh
```

Expected:

- Backend is available on `18088`.
- Admin is available on `3001`.
- Front Nuxt is available on `5174`.
- If the stack is already running, record the existing ports and process roots instead of restarting unless stale processes point to a different worktree.

- [ ] **Step 2: Run public route checks**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
```

Expected:

- Command exits `0`.

- [ ] **Step 3: Run visual gate**

Run:

```bash
cd front-nuxt
CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
```

Expected:

- Command exits `0`.
- If it fails, record the exact route, viewport, assertion, and screenshot path in the smoke audit. Convert this task into a route-family repair branch before continuing.

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected:

- Command exits `0`.

- [ ] **Step 5: Write smoke audit**

Create `docs/audits/2026-05-24_front-nuxt-preview-final-smoke.md` with:

```md
# Front Nuxt Preview Final Smoke - 2026-05-24

## Stack

- Backend:
- Admin:
- Front Nuxt:
- Worktree:

## Commands

```bash
pnpm run check:public-pages
CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
pnpm run check
```

## Result

- Public route check:
- Visual gate:
- Typecheck:
- Follow-up:
```

Replace every value with actual output.

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/audits/2026-05-24_front-nuxt-preview-final-smoke.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md
git diff --cached --stat
git commit -m "docs: record front nuxt preview final smoke"
```

Omit project-management files if they were not changed.

## Task 6: Local Stack Preview Closeout Smoke

**Branch**

`fix/local-stack-preview-closeout-smoke-2026-05-24`

**Goal**

Verify that the local project stack boots from the final `main` state and that key admin/public runtime pages are reachable without confusing old-worktree processes for the current project.

**Files**

- Create: `docs/audits/2026-05-24_local-stack-preview-closeout-smoke.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`

- [ ] **Step 1: Stop and start the local stack**

Run:

```bash
bash scripts/dev/stop-local-stack.sh
bash scripts/dev/start-local-stack.sh
```

Expected:

- Backend: `18088`.
- Admin: `3001`.
- Front Nuxt: `5174`.
- Redis: `6380`.

- [ ] **Step 2: Verify process roots**

Run:

```bash
ps -eo pid,cmd | rg "nuxt|java|18088|3001|5174" | rg -v rg
```

For each key process, run:

```bash
ps -eo pid,cmd | rg "nuxt|java|18088|3001|5174" | rg -v rg \
  | awk '{print $1}' \
  | while read -r pid; do
      printf '%s ' "$pid"
      readlink -f "/proc/${pid}/cwd" 2>/dev/null || true
    done
```

Expected:

- Admin process root is the final `main` worktree.
- Front Nuxt process root is the final `main` worktree.
- Backend process root is the final `main` worktree.

- [ ] **Step 3: Verify admin login and crawler monitor page**

Run:

```bash
curl -sS --max-time 8 -X POST http://localhost:18088/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123456"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const o=JSON.parse(s); const raw=o.data??o; console.log(JSON.stringify({message:o.message,hasToken:Boolean(raw.token)}, null, 2));})"

curl -sS --max-time 8 -I http://localhost:3001/operations/crawler-monitor | head -20
```

Expected:

- Login returns a token.
- Admin crawler monitor route responds with either authenticated content or a login redirect. A login redirect is acceptable for unauthenticated `HEAD`.

- [ ] **Step 4: Verify public preview routes**

Run:

```bash
for path in / /items /npcs /bosses /buffs /projectiles /armor-sets /biomes /crafting /categories /search /articles /about; do
  code=$(curl -sS --max-time 8 -o /tmp/terrapedia-front-route.html -w '%{http_code}' "http://localhost:5174${path}")
  printf '%s %s\n' "$code" "$path"
done
```

Expected:

- Every listed route returns `200` or an intentional redirect documented in the closeout.
- No route returns `500`.

- [ ] **Step 5: Write local stack smoke audit**

Create `docs/audits/2026-05-24_local-stack-preview-closeout-smoke.md` with:

```md
# Local Stack Preview Closeout Smoke - 2026-05-24

## Stack Result

- Backend:
- Admin:
- Front Nuxt:
- Redis:
- Worktree roots:

## Admin Smoke

- Login:
- Crawler monitor:

## Public Route Smoke

| Route | HTTP | Result |
| --- | --- | --- |
| / | | |
| /items | | |
| /npcs | | |
| /bosses | | |
| /buffs | | |
| /projectiles | | |
| /armor-sets | | |
| /biomes | | |
| /crafting | | |
| /categories | | |
| /search | | |
| /articles | | |
| /about | | |

## Follow-Up

- 
```

Replace every blank value.

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/audits/2026-05-24_local-stack-preview-closeout-smoke.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md
git diff --cached --stat
git commit -m "docs: record local stack preview closeout smoke"
```

Omit project-management files if they were not changed.

## Task 7: Final Preview Release Decision Record

**Branch**

`docs/project-preview-release-decision-2026-05-24`

**Goal**

Record the final decision: release-decision ready, preview-only with blockers, or paused pending operator action.

**Files**

- Create: `docs/audits/2026-05-24_preview-release-decision.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify if decision creates a durable policy: `docs/project-management/decision-log.md`

- [ ] **Step 1: Read final evidence**

Run:

```bash
sed -n '1,220p' docs/audits/2026-05-24_domain-a-grade-final-closeout.md
sed -n '1,220p' docs/audits/2026-05-24_front-nuxt-preview-final-smoke.md
sed -n '1,220p' docs/audits/2026-05-24_local-stack-preview-closeout-smoke.md
```

Expected:

- All three documents exist unless a prior task explicitly recorded that execution stopped before that phase.

- [ ] **Step 2: Create decision document**

Create `docs/audits/2026-05-24_preview-release-decision.md` with:

```md
# Preview Release Decision - 2026-05-24

## Decision

- Status:
- Reason:

## Evidence

- Domain A-grade:
- Front Nuxt visual:
- Local stack smoke:

## Remaining Blockers

- 

## Next Branches

- 

## User-Facing Statement

- 
```

Use one of these statuses:

- `release-decision-ready`
- `preview-only`
- `paused-for-operator-action`

- [ ] **Step 3: Update management docs**

Update `docs/project-management/current-status.md`:

- Set the active focus to the next real branch or release decision.
- State whether V0.1 is still preview-only.

Update `docs/project-management/risk-register.md`:

- Close reduced risks only when committed evidence proves closure.
- Keep remaining risks open with exact follow-up branches.

If the decision is management-level and durable, append to `docs/project-management/decision-log.md`:

```md
| 2026-05-24 | release-decision-ready OR preview-only OR paused-for-operator-action | Evidence-backed closeout loop completed | Domain, front-nuxt, and local-stack closeout docs | Next branch named in preview release decision |
```

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/audits/2026-05-24_preview-release-decision.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md \
  docs/project-management/decision-log.md
git diff --cached --stat
git commit -m "docs: record preview release decision"
```

Omit `decision-log.md` if no durable decision was added.

## Controller Plan Repair Rules

After each task branch merges, run this review against this file:

```bash
rg -n "fix/domain-a-grade|fix/front-nuxt|fix/local-stack|docs/project-preview|generatedBlockedCount|preview-only|release-decision" docs/superpowers/plans/2026-05-24-domain-a-grade-preview-closeout-loop.md
```

Patch this plan when:

- a task creates a new follow-up branch;
- a planned branch becomes unnecessary because a prior task closed the blocker;
- a validation command changed its required arguments;
- a generated evidence path differs from the path this plan expected;
- a task proves the project must stay preview-only.

Commit plan repairs separately:

```bash
git add docs/superpowers/plans/2026-05-24-domain-a-grade-preview-closeout-loop.md
git diff --cached --stat
git commit -m "docs: repair preview closeout loop plan"
```

## Final Validation Matrix

The final state must report these command results:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
cd front-nuxt && pnpm run check:public-pages
cd front-nuxt && CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
cd front-nuxt && pnpm run check
bash scripts/dev/start-local-stack.sh
```

If any command cannot run, the final decision must be `preview-only` or `paused-for-operator-action`, not release-decision-ready.

## Merge And Push Policy

- Merge each completed task branch into local `main` after validation.
- Do not push unless the user explicitly asks.
- If local `main` remains ahead of `origin/main`, keep `R-2026-05-23-03` open.
- When the user asks to push, run pre-push checks:

```bash
git fetch origin
git status --short --branch -uall
git log --oneline origin/main..main
git push --dry-run origin main
```

Only then push `main`.

## Plan Self-Review

- Spec coverage: The plan covers DB environment, Boss image lineage, Projectile relation coverage, Domain A-grade closeout, front Nuxt visual smoke, local stack smoke, and final release decision.
- Placeholder scan: No step uses open-ended placeholders as executable instructions. Generated paths are staged through explicit known report globs after inspecting `git status`.
- Boundary check: The plan forbids crawler/import/backfill/load/apply/storage sync and DB writes unless a separate user-approved operator action is needed for DB restore.
- Continuity check: Each blocked outcome creates or names the next branch instead of ending with an unresolved investigation.
