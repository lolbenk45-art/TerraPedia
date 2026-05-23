# Domain A-Grade Remaining Blocker Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close or truthfully reclassify the 6 remaining Domain A-grade blocked panels after the 2026-05-23 blocker burn-down.

**Architecture:** Repair prerequisites before producing evidence. Source snapshot fetches must become monitor-visible before any network run; DB evidence lanes must use a complete readable three-database environment before closing Boss image lineage or projectile relation blockers. Gate-consumed artifacts must be durable across machines.

**Tech Stack:** Node.js ESM scripts under `scripts/data/**`, Python Town NPC fetch lane, TerraPedia crawler progress contract, MySQL read-only evidence scripts, Domain Acceptance reports under `reports/domain/**`, tracked audit docs under `docs/audits/**`.

---

## Current Baseline

Source: `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md`.

Current result:

- Freshness: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- A-grade: `overallStatus=blocked`, `generatedBlockedCount=6`, `generatedWarningCount=15`.
- Public V0.1 remains preview-only.

Remaining blocked panels:

| Group | Panel | Current blocker | Required repair lane |
| --- | --- | --- | --- |
| B | `bosses/sourceReadiness` | Missing `data/generated/wiki-bosses.latest.json` | Source snapshot progress contract, then bounded Boss fetch |
| B | `armor_sets/sourceReadiness` | Missing `data/generated/wiki-armor-sets.latest.json` | Source snapshot progress contract, then bounded Armor fetch |
| B | `support.shimmer/sourceReadiness` | Missing `data/generated/shimmer/wiki-shimmer-manifest.latest.json` | Source snapshot progress contract, then bounded Shimmer fetch + transform |
| B | `support.town_npc_maintenance/sourceReadiness` | Missing `data/generated/wiki-town-npc-maintenance.latest.json` | Source snapshot progress contract + Python `bs4`, then bounded Town NPC fetch |
| C | `bosses/imageReadiness` | Missing `reports/audit/image-source-lineage*.json` | Complete DB read environment, then image lineage report |
| E | `projectiles/relationReadiness` | Old baseline reports `projectiles.nameZh.gap=1006` | Complete DB read environment, then fresh entity coverage baseline and data repair if gap persists |

## Scope Boundaries

In scope:

- Add monitor-visible progress contract support and tests for bounded source snapshot fetch scripts.
- Install or document Python dependency requirements for the Town NPC fetch lane without committing local virtualenvs.
- Generate tracked source snapshot and audit evidence only after progress contract is in place.
- Run read-only DB evidence scripts only against a complete readable local/maint/relation DB environment.
- Regenerate `reports/domain/**` after each evidence lane.
- Keep V0.1 preview-only unless A-grade exits `0`.

Out of scope:

- Full item-page crawl, `item-pages-refresh`, backend refresh apply, import, backfill, DB writes, production mutation.
- Weakening Domain Acceptance gate logic to hide blockers.
- Force-adding ignored artifacts without `.gitignore` policy.
- Remote push.

Evidence retention rule:

- A blocker closes only when the exact path consumed by `domain-readiness-audit.mjs` is committed or the gate is changed to consume a deterministic tracked summary.
- Local-only generated files and stdout summaries support classification only.

## Task 0: Branch, Baseline, And Safety Lock

**Files:**
- Read: `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md`
- Create: `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-baseline.md`

- [ ] **Step 1: Create implementation branch**

Run from the local `main` worktree:

```bash
git status --short --branch -uall
git switch -c fix/domain-a-grade-remaining-blockers-2026-05-24
```

Expected: clean non-`main` branch.

- [ ] **Step 2: Reproduce current gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-remaining-baseline.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-remaining-baseline.json || test "$?" -eq 1
```

Expected:

- Freshness exits `0`.
- A-grade exits `1`.
- A-grade JSON has `generatedBlockedCount=6`.

- [ ] **Step 3: Write baseline audit**

Create `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-baseline.md` with:

- Commands and exit codes.
- Six blocked panels.
- Statement that this task does not run crawler, DB writes, import, backfill, apply, or long item crawl.

- [ ] **Step 4: Commit baseline**

Run:

```bash
git add docs/audits/2026-05-24_domain-a-grade-remaining-blocker-baseline.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record remaining domain blocker baseline"
```

## Task 1: Source Snapshot Progress Contract

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-bosses.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`
- Likely read/reuse: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Create: `scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs`
- Create: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs`
- Create: `docs/audits/2026-05-24_domain-a-grade-source-progress-contract.md`

- [ ] **Step 1: Inspect existing progress helpers**

Run:

```bash
rg -n "buildActionProgressPayload|writeJsonFile|lastHeartbeatAt|progress-path|TERRAPEDIA_CRAWLER_PROGRESS_PATH" scripts/data scripts/dev back data-query-app
```

Expected: identify existing atomic JSON writer and payload shape to reuse.

- [ ] **Step 2: Add failing tests for each lane**

Add one focused progress contract test per fetch lane proving each script supports:

- `--progress-path=<tmp path>` or `TERRAPEDIA_CRAWLER_PROGRESS_PATH`.
- Writes progress before the first network request.
- Emits required fields: `actionId`, `status`, `generatedAt`, `lastHeartbeatAt`, `phase`, `message`, `current`, `total`, `outputPath`, `reportPath`.
- Final status is `completed` or `failed`.

Run:

```bash
node --test \
  scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
```

Expected: fail because current scripts lack progress support.

- [ ] **Step 3: Implement minimal progress contract**

For each source snapshot fetch:

- Add stable action IDs:
  - `domain-source-snapshot:bosses`
  - `domain-source-snapshot:armor_sets`
  - `domain-source-snapshot:support.shimmer`
  - `domain-source-snapshot:support.town_npc_maintenance`
- Honor explicit `--progress-path` or env `TERRAPEDIA_CRAWLER_PROGRESS_PATH`.
- Write `running` before first request.
- Update heartbeat between network steps or row/page loops.
- Write `completed` with output/report paths after success.
- Write `failed` with error message on failure.
- Do not write DB rows.

- [ ] **Step 4: Run progress tests**

Run:

```bash
node --test \
  scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
```

Expected: pass.

- [ ] **Step 5: Write progress contract audit**

Create `docs/audits/2026-05-24_domain-a-grade-source-progress-contract.md` with:

- touched scripts,
- action IDs,
- progress path support,
- tests run and exit codes,
- confirmation that no network fetch was run in this task unless a test mocked it.

- [ ] **Step 6: Commit progress contract**

Run:

```bash
git add \
  scripts/data/fetch/fetch-wiki-bosses.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance.py \
  scripts/data/fetch/fetch-wiki-bosses-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page-progress.test.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs \
  docs/audits/2026-05-24_domain-a-grade-source-progress-contract.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(data): add source snapshot progress contracts"
```

## Task 2: Bounded Source Snapshot Evidence

**Files:**
- Generated and potentially trackable:
  - `data/generated/wiki-bosses.latest.json`
  - `data/generated/wiki-armor-sets.latest.json`
  - `data/generated/wiki-shimmer.latest.json`
  - `data/generated/shimmer/wiki-shimmer-manifest.latest.json`
  - `data/generated/shimmer/wiki-shimmer-context.importable.latest.json`
  - `data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json`
  - `data/generated/wiki-town-npc-maintenance.latest.json`
- Reports:
  - `reports/wiki-bosses-fetch-2026-05-24.json`
  - Shimmer and Town NPC report paths from commands
- Modify: `.gitignore` only for exact durable evidence allowlists
- Regenerate: affected `reports/domain/**/source-readiness-2026-05-24.json` or current-date files per generator output
- Create: `docs/audits/2026-05-24_domain-a-grade-source-snapshot-evidence.md`

- [ ] **Step 1: Verify Python dependency**

Run:

```bash
python3 --version
python3 - <<'PY'
from bs4 import BeautifulSoup, Tag
print('bs4 ok')
PY
```

Expected: `bs4 ok`. If not, stop and repair Python dependency in a separate environment commit or document blocker; do not run Town NPC fetch.

- [ ] **Step 2: Run one bounded source fetch at a time**

Run each command with a progress path:

```bash
node scripts/data/fetch/fetch-wiki-bosses.mjs \
  --progress-path=data/generated/domain-source-bosses-progress.latest.json \
  --output-json=data/generated/wiki-bosses.latest.json \
  --report-json=reports/wiki-bosses-fetch-2026-05-24.json

node scripts/data/fetch/fetch-wiki-armor-sets.mjs \
  --progress-path=data/generated/domain-source-armor-sets-progress.latest.json \
  --output-dir=data/generated \
  --keep-snapshot=false

node scripts/data/fetch/fetch-wiki-shimmer-page.mjs \
  --progress-path=data/generated/domain-source-shimmer-progress.latest.json \
  --output=data/generated/wiki-shimmer.latest.json \
  --report-output=reports/wiki-shimmer-summary-2026-05-24.md

node scripts/data/transform/transform-wiki-shimmer-to-importable.mjs \
  --input=data/generated/wiki-shimmer.latest.json \
  --output=data/generated/shimmer \
  --report-output=reports/wiki-shimmer-importable-summary-2026-05-24.md \
  --use-db-lookup=false

python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py \
  --progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json \
  --source=data/generated/npc-standardized-map.json \
  --output=data/generated/wiki-town-npc-maintenance.latest.json \
  --snapshot-output=reports/wiki-town-npc-maintenance-2026-05-24.json
```

Expected:

- Each fetch completes within 20 minutes.
- Each final progress JSON has `status=completed`.
- No DB writes.
- No long item crawl.

- [ ] **Step 3: Make gate-consumed evidence durable**

Add exact allowlists for only gate-consumed outputs and compact reports. Do not commit temporary progress files unless the acceptance gate consumes them.

Add `.gitignore` entries for exact paths generated above, then stage only paths that exist after this run. Omit optional files that were not regenerated in this run; do not force-add absent or ignored paths without an exact allowlist.

```bash
git add .gitignore \
  data/generated/wiki-bosses.latest.json \
  data/generated/wiki-armor-sets.latest.json \
  data/generated/wiki-town-npc-maintenance.latest.json \
  data/generated/shimmer/wiki-shimmer-manifest.latest.json \
  data/generated/shimmer/wiki-shimmer-context.importable.latest.json \
  data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json \
  reports/wiki-bosses-fetch-2026-05-24.json \
  reports/wiki-shimmer-summary-2026-05-24.md \
  reports/wiki-shimmer-importable-summary-2026-05-24.md \
  reports/wiki-town-npc-maintenance-2026-05-24.json
```

- [ ] **Step 4: Regenerate domain reports and gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-source-snapshots.json || test "$?" -eq 1
```

Expected: the four Group B source-readiness blockers are cleared or converted into real source-quality blockers.

- [ ] **Step 5: Write and commit source evidence audit**

Create `docs/audits/2026-05-24_domain-a-grade-source-snapshot-evidence.md`, then stage exact affected domain reports, durable evidence paths, `.gitignore`, and the audit doc. Commit:

```bash
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record source snapshot evidence"
```

## Task 3: DB Read Environment Repair

**Files:**
- Create: `docs/audits/2026-05-24_domain-a-grade-db-read-environment.md`
- Possibly modify local dev docs or scripts only if the DB environment setup is codified

- [ ] **Step 1: Verify DB inventory**

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
console.log(JSON.stringify({ options: { ...options, password: '<redacted>' }, databases: rows }, null, 2));
await conn.end();
NODE
```

Expected: `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation` all exist.

- [ ] **Step 2: If `terria_v1_maint` is missing, stop**

Do not synthesize or write a maint database in this plan. Write the audit doc classifying DB environment as blocked and open a separate DB restore plan.

- [ ] **Step 3: Commit DB environment audit**

Run:

```bash
git add docs/audits/2026-05-24_domain-a-grade-db-read-environment.md
git commit -m "docs: record domain blocker db read environment"
```

## Task 4: Boss Image Lineage Evidence

**Prerequisite:** Task 3 confirms complete DB read environment.

**Files:**
- Generate: `reports/audit/image-source-lineage-2026-05-24.json`
- Modify: `.gitignore` exact allowlist if the report is gate-consumed
- Regenerate: `reports/domain/bosses/image-readiness-*.json`
- Create: `docs/audits/2026-05-24_domain-a-grade-boss-image-lineage.md`

- [ ] **Step 1: Run read-only lineage report**

```bash
node scripts/data/audit/image-source-lineage-report.mjs --source=db --generated-at=2026-05-24T00:00:00.000Z
```

Expected: writes `reports/audit/image-source-lineage-2026-05-24.json`.

- [ ] **Step 2: Inspect Boss contract**

```bash
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('reports/audit/image-source-lineage-2026-05-24.json','utf8')); console.log(JSON.stringify(j.entities.bosses,null,2));"
```

Expected: either `contractReady=true` or concrete `gapReasons`.

- [ ] **Step 3: Regenerate domain reports and commit evidence**

Regenerate gate reports, allowlist the exact lineage report, write audit, and commit. Stage only files regenerated in this run. If Boss lineage is not contract-ready, keep blocker open and open a separate Boss image repair branch.

## Task 5: Projectile Relation Coverage Evidence

**Prerequisite:** Task 3 confirms complete DB read environment.

**Files:**
- Generate: `reports/relation/entity-coverage-baseline-2026-05-24.json`
- Generate: `reports/relation/entity-coverage-baseline-2026-05-24.md`
- Regenerate: `reports/domain/projectiles/relation-readiness-*.json`
- Create: `docs/audits/2026-05-24_domain-a-grade-projectile-relation-coverage.md`

- [ ] **Step 1: Run fresh read-only baseline**

```bash
node scripts/data/relation/entity-coverage-baseline.mjs \
  --local-database=terria_v1_local \
  --maint-database=terria_v1_maint \
  --relation-database=terria_v1_relation
```

Expected: writes JSON and Markdown under `reports/relation/`.

- [ ] **Step 2: Classify projectile gap**

```bash
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('reports/relation/entity-coverage-baseline-2026-05-24.json','utf8')); console.log(JSON.stringify(j.fieldAudit?.domains?.projectiles,null,2));"
```

Expected:

- If `nameZh.gap=0`, regenerate domain reports and clear blocker.
- If `nameZh.gap>0`, open a dedicated projectile zh relation repair branch; do not weaken gate.

- [ ] **Step 3: Commit classification**

Commit fresh baseline and audit doc. Include `reports/domain/projectiles/relation-readiness-*.json` only if regenerated.

## Task 6: Final A-Grade Rebuild And Release Decision

**Files:**
- Regenerate: `reports/domain/**`
- Create: `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-closeout.md`
- Update: `docs/project-management/current-status.md`
- Update: `docs/project-management/risk-register.md`
- Update: `docs/project-management/decision-log.md`

- [ ] **Step 1: Rebuild final reports**

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-remaining-closeout.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-remaining-closeout.json || test "$?" -eq 1
```

- [ ] **Step 2: Run frontend checks**

```bash
cd front-nuxt && pnpm run check:public-pages && pnpm run check
```

Expected: route check and typecheck exit `0`; Node `DEP0205` warning may appear.

- [ ] **Step 3: Write closeout**

Record:

- starting blocker count `6`,
- ending blocker count,
- closed blockers,
- remaining blockers and exact follow-up branches,
- whether V0.1 remains preview-only or can proceed to staging smoke.

- [ ] **Step 4: Commit closeout**

Stage exact regenerated reports and management docs. Omit files that were not regenerated in this run. Commit:

```bash
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: close remaining domain blockers"
```

## Execution Order

1. Task 0 baseline.
2. Task 1 progress contract.
3. Task 2 source snapshot evidence.
4. Task 3 DB environment repair/classification.
5. Task 4 Boss image lineage.
6. Task 5 Projectile relation coverage.
7. Task 6 final closeout.

## Stop Conditions

Stop and repair the plan if:

- any task requires DB writes, import, backfill, apply, or production mutation;
- a source fetch still lacks monitor-visible progress;
- a source fetch expands into long item crawling;
- evidence is generated but remains ignored without an explicit allowlist or tracked summary contract;
- A-grade passes only because gate checks were weakened.

## Success Criteria

Minimum success:

- Every remaining blocker is either cleared with durable gate-consumed evidence or classified with a concrete follow-up repair branch.
- Freshness remains `pass`.
- Public V0.1 remains preview-only unless A-grade exits `0`.

Full success:

- `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` exits `0`.
- `generatedBlockedCount=0`.
- Remaining warnings are documented as non-release-blocking or assigned to warning burn-down.
