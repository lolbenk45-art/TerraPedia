# Domain A-Grade Blocker Triage And Burn-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the current Domain Acceptance A-grade gate from `blocked` to a truthful state by clearing the 13 blocked panels where evidence can be made durable, and by explicitly classifying any real data/source debt into separate repair branches.

**Architecture:** Treat `reports/domain/**` as the gate output and repair the upstream evidence/report producers before changing the gate. "Burn-down" means clearing blockers when the source chain is durable; when a blocker proves to be real data debt, the output is a tracked classification and a separate repair branch, not a hidden pass. No crawler, import, backfill, DB write, or production mutation is allowed without a separate data-write plan and rollback note.

**Tech Stack:** Node.js workflow scripts under `scripts/data/**`, TerraPedia domain acceptance registry/gate, tracked audit docs under `docs/audits/**`, generated evidence under `reports/domain/**` and allowed tracked report paths.

---

## Baseline

Source audit: `docs/audits/2026-05-23_basic-public-site-v0.1-domain-evidence.md`.

Fresh command evidence from 2026-05-23:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Observed result:

- Freshness: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- A-grade gate: exit `1`, `overallStatus=blocked`.
- Gate summary: `generatedPassCount=23`, `generatedWarningCount=9`, `generatedBlockedCount=13`.
- Gate blocker: `domain acceptance generation has 13 blocked panels`.

Current blocked panels:

| Group | Domain / panel | Root cause |
| --- | --- | --- |
| A | `items/unresolvedAuditTrend` | Missing `reports/relation/reresolve-candidates*.json` |
| A | `npcs/unresolvedAuditTrend` | Missing `reports/relation/reresolve-candidates*.json` |
| A | `bosses/unresolvedAuditTrend` | Missing `reports/relation/reresolve-candidates*.json` |
| A | `buffs/unresolvedAuditTrend` | Missing `reports/relation/reresolve-candidates*.json` |
| A | `projectiles/unresolvedAuditTrend` | Missing `reports/relation/reresolve-candidates*.json` |
| A | `armor_sets/unresolvedAuditTrend` | Missing `reports/relation/reresolve-candidates*.json` |
| B | `bosses/sourceReadiness` | Missing `data/generated/wiki-bosses.latest.json` |
| B | `armor_sets/sourceReadiness` | Missing `data/generated/wiki-armor-sets.latest.json` |
| B | `support.shimmer/sourceReadiness` | Missing `data/generated/shimmer/wiki-shimmer-manifest.latest.json` |
| B | `support.town_npc_maintenance/sourceReadiness` | Missing `data/generated/wiki-town-npc-maintenance.latest.json` |
| C | `bosses/imageReadiness` | Missing `reports/audit/image-source-lineage*.json` |
| D | `support.item_group/blockingGate` | Missing `reports/item-groups/any-item-group-source-audit*.json` |
| E | `projectiles/relationReadiness` | `reports/relation/entity-coverage-baseline-2026-04-25.json` reports `projectiles.nameZh.gap=1006` |

## Scope Boundaries

In scope:

- Read-only report generation when scripts are documented as report-only.
- Domain evidence regeneration under `reports/domain/**`.
- Tracked audit docs summarizing command outputs and decisions.
- Gate policy repair only if a report expectation is proven obsolete by source-chain evidence.
- A follow-up data-write plan for gaps that require DB writes.

Out of scope for this plan:

- Public UI redesign.
- Hiding blocked panels by weakening `domain-acceptance-a-grade-gate.mjs`.
- Direct registry promotion/demotion without fresh report evidence.
- Crawler/network fetch execution unless a task explicitly says it is the approved fetch lane and passes the network/progress checklist below.
- Long item-page crawl, `item-pages-refresh`, full item crawl, import, or backend refresh apply runs. These are separate data/crawler tasks and may take days.
- DB-writing import/backfill/apply commands.
- Remote push.

## File And Surface Map

Read or modify:

- `scripts/data/workflow/domain-acceptance-registry.json`
- `scripts/data/workflow/domain-acceptance-generate-reports.mjs`
- `scripts/data/workflow/domain-acceptance-freshness-audit.mjs`
- `scripts/data/workflow/domain-acceptance-a-grade-gate.mjs`
- `scripts/data/audit/domain-readiness-audit.mjs`
- `scripts/data/relation/generate-reresolve-candidates.mjs`
- `scripts/data/audit/audit-any-item-group-sources.mjs`
- `scripts/data/audit/image-source-lineage-report.mjs`
- `scripts/data/relation/entity-field-audit*.mjs`
- `reports/domain/**`
- `reports/relation/*.json`
- `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-*.md`

Potentially generated but ignored by default:

- `data/generated/wiki-bosses.latest.json`
- `data/generated/wiki-armor-sets.latest.json`
- `data/generated/shimmer/wiki-shimmer-manifest.latest.json`
- `data/generated/wiki-town-npc-maintenance.latest.json`
- `reports/item-groups/any-item-group-source-audit*.json`
- `reports/audit/image-source-lineage*.json`

Evidence retention rule:

- A blocker may be marked cleared only when the exact evidence path consumed by the gate is durable across machines.
- If the gate consumes an ignored file, the implementation must either add an explicit `.gitignore` allowlist entry and commit that file, or change the gate/report producer to consume a tracked distilled evidence artifact under `reports/domain/**`, `reports/relation/**`, or `docs/audits/**`.
- Local-only ignored files and stdout summaries may support classification, but they are not enough to close Group B, Group C, or Group D blockers.
- Do not force-add ignored artifacts ad hoc. Any ignored artifact that becomes required evidence must be made trackable through an explicit `.gitignore` policy change in the same focused task.
- If a raw artifact is too large or volatile to track, stop and write a plan repair that changes the acceptance contract to consume a compact, deterministic, tracked summary instead.

Verified script and environment facts from planning:

| Surface | Verified parameter contract |
| --- | --- |
| Reresolve candidates | `node scripts/data/relation/generate-reresolve-candidates.mjs --generated-at=... --output=... --write-report=false`; default writes `reports/relation/reresolve-candidates-YYYY-MM-DD.json`; DB read only. |
| Item group audit | `node scripts/data/audit/audit-any-item-group-sources.mjs --output=... --markdown=...`; default writes JSON and Markdown under ignored `reports/item-groups/`. |
| Image lineage audit | `node scripts/data/audit/image-source-lineage-report.mjs --source=db --output=... --generated-at=...`; default writes ignored `reports/audit/image-source-lineage-YYYY-MM-DD.json`; DB read only. |
| Boss source fetch | `node scripts/data/fetch/fetch-wiki-bosses.mjs --output-json=... --report-json=...`; network fetch, no DB write. |
| Armor source fetch | `node scripts/data/fetch/fetch-wiki-armor-sets.mjs --output-dir=...`; network fetch, no DB write. |
| Shimmer source fetch | `node scripts/data/fetch/fetch-wiki-shimmer-page.mjs --output=... --report-output=...`; network fetch, no DB write. |
| Shimmer transform | `node scripts/data/transform/transform-wiki-shimmer-to-importable.mjs --input=... --output=... --report-output=... --use-db-lookup=false`; no network when input exists and DB lookup is false. |
| Town NPC maintenance fetch | `python` is unavailable; `python3` is available as Python 3.12.3, but current planning check found missing `bs4`. Use `python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py --source=... --output=... --snapshot-output=...` only after dependency check passes; network fetch, no DB write. |
| Entity coverage baseline | `node scripts/data/relation/entity-coverage-baseline.mjs --local-database=... --maint-database=... --relation-database=...`; DB read only, writes `reports/relation/entity-coverage-baseline-YYYY-MM-DD.json/md`. |

Network/progress checklist:

- This plan does not start the 3+ day item crawler and does not run `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply`.
- A network lane must name the script, target wiki page or API, expected output paths, expected report paths, and expected duration before running.
- Before any network fetch that is not already monitor-visible, verify whether the script writes progress before its first request and updates `lastHeartbeatAt`. If it does not, stop and open a progress-contract repair branch instead of running the fetch.
- Approved short source-snapshot fetches must be bounded to one domain source each. Stop if a command expands into item page crawling, import, backfill, DB apply, storage sync, or unbounded pagination.
- Each network lane gets a 20 minute per-command budget. If the command exceeds the budget, abort the lane and record the timeout in the audit doc.
- The Shimmer transform may run without network only after the raw Shimmer source file exists; run it with `--use-db-lookup=false`.

Git control strategy:

- Do not implement on `main`.
- Run each write lane in a clean task worktree or serialize writes in one worktree after read-only exploration.
- Do not run two lanes that both execute `domain-acceptance-generate-reports.mjs --write=true` in the same worktree at the same time.
- Stage only exact files listed in the task. Never use `git add .`, `git add reports/domain`, `git add docs/audits`, or another directory-level add.
- Before every commit run `git status --short --branch -uall`, `git diff --cached --stat`, and `git diff --cached --name-status`.
- If a task needs `.gitignore` changes for durable evidence, stage the `.gitignore` line and the newly trackable evidence paths in that same task commit.

Time budget:

| Task | Budget | Stop threshold |
| --- | --- | --- |
| Task 0 baseline | 30 minutes | Gate baseline cannot be reproduced. |
| Task 1 reresolve evidence | 60 minutes | DB read fails or report target is not `reports/relation/**`. |
| Task 2 item group audit | 45 minutes | Raw audit is required but still ignored and no tracked distilled contract exists. |
| Task 3 image lineage | 60 minutes | DB read fails or raw lineage remains the only gate-consumed evidence. |
| Task 4 Group B source snapshots | 2 hours total, 20 minutes per fetch command | Fetch lacks progress contract, expands to long crawl, or required evidence cannot be made durable. |
| Task 5 projectile gap classification | 60 minutes | Fresh DB read indicates writes/backfills are required. |
| Task 6 closeout | 45 minutes | Final gate result cannot be reproduced from tracked artifacts. |

## Task 0: Branch And Baseline Lock

**Files:**
- Create: `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-baseline.md`
- Read: `docs/audits/2026-05-23_basic-public-site-v0.1-domain-evidence.md`
- Read: `reports/domain/**`

- [ ] **Step 1: Confirm clean worktree**

Run:

```bash
git status --short --branch -uall
```

Expected: clean worktree on a non-`main` implementation branch.

- [ ] **Step 2: Re-run the read-only gate baseline**

Run:

```bash
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-baseline.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-baseline.json
```

Expected:

- Freshness command exits `0`.
- A-grade command exits `1`.
- A-grade JSON has `overallStatus="blocked"`, `generatedBlockedCount=13`, `generatedWarningCount=9`.

- [ ] **Step 3: Write baseline audit**

Create `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-baseline.md` with:

```md
# Domain A-Grade Blocker Burn-Down Baseline - 2026-05-23

## Commands
- `node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"`
- `node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true`

## Result
- Freshness: `overallStatus=pass`, `freshCount=45`, `missingCount=0`, `staleCount=0`, `unknownCount=0`.
- A-grade: `overallStatus=blocked`, `generatedBlockedCount=13`, `generatedWarningCount=9`.

## Blocker Groups
- Group A: six unresolved-audit trend panels missing `reports/relation/reresolve-candidates*.json`.
- Group B: four source-readiness panels missing generated source snapshots.
- Group C: Boss image readiness missing image source lineage report.
- Group D: item group blocking gate missing any-item-group source audit.
- Group E: Projectiles relation readiness has `nameZh.gap=1006`.

## Boundary
This baseline is evidence-only. It does not run crawler, import, backfill, apply, or DB-writing commands.
```

- [ ] **Step 4: Commit baseline**

Run:

```bash
git add docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-baseline.md
git diff --cached --stat
git commit -m "docs: record domain blocker burn-down baseline"
```

Expected: one docs commit.

## Task 1: Resolve Group A Unresolved Audit Trend Evidence

**Files:**
- Read: `scripts/data/relation/generate-reresolve-candidates.mjs`
- Create or update: `reports/relation/reresolve-candidates-2026-05-23.json`
- Regenerate: `reports/domain/*/unresolved-audit-trend-2026-05-23.json`
- Create: `docs/audits/2026-05-23_domain-a-grade-reresolve-evidence.md`

- [ ] **Step 1: Confirm DB-read boundary**

Run:

```bash
node scripts/data/workflow/domain-acceptance-report-manifest.mjs | rg -n "reresolve-candidates|requiresDatabase|writesDatabase"
```

Expected: unresolved audit trend generator is `node scripts/data/relation/generate-reresolve-candidates.mjs`, `requiresDatabase=true`, `writesDatabase=false`.

- [ ] **Step 2: Run read-only candidate generation**

Run:

```bash
node scripts/data/relation/generate-reresolve-candidates.mjs --generated-at=2026-05-23T00:00:00.000Z
```

Expected:

- Writes `reports/relation/reresolve-candidates-2026-05-23.json`.
- Does not write DB rows.
- If MySQL connection fails, stop this task and record the DB-read blocker in the audit doc instead of editing gate code.

- [ ] **Step 3: Regenerate domain reports**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Expected:

- The six `*/unresolvedAuditTrend` panels are no longer blocked by missing reresolve evidence.
- If they become warning because historical baseline is unavailable, record the warning and do not weaken the gate.

- [ ] **Step 4: Write reresolve audit**

Create `docs/audits/2026-05-23_domain-a-grade-reresolve-evidence.md` summarizing:

- Command exit codes.
- `reports/relation/reresolve-candidates-2026-05-23.json` summary.
- The six affected domain panel statuses after regeneration.
- Remaining `generatedBlockedCount`.

- [ ] **Step 5: Commit reresolve evidence**

Run:

```bash
git add \
  reports/relation/reresolve-candidates-2026-05-23.json \
  reports/domain/items/unresolved-audit-trend-2026-05-23.json \
  reports/domain/npcs/unresolved-audit-trend-2026-05-23.json \
  reports/domain/bosses/unresolved-audit-trend-2026-05-23.json \
  reports/domain/buffs/unresolved-audit-trend-2026-05-23.json \
  reports/domain/projectiles/unresolved-audit-trend-2026-05-23.json \
  reports/domain/armor_sets/unresolved-audit-trend-2026-05-23.json \
  docs/audits/2026-05-23_domain-a-grade-reresolve-evidence.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: refresh unresolved audit trend evidence"
```

Expected: tracked relation report, updated domain reports, and audit doc.

## Task 2: Resolve Group D Item Group Blocking Evidence

**Files:**
- Read: `scripts/data/audit/audit-any-item-group-sources.mjs`
- Potential generated output: `reports/item-groups/any-item-group-source-audit-2026-05-23.json`
- Regenerate: `reports/domain/support.item_group/blocking-gate-2026-05-23.json`
- Create: `docs/audits/2026-05-23_domain-a-grade-item-group-evidence.md`

- [ ] **Step 1: Run the source audit**

Run:

```bash
node scripts/data/audit/audit-any-item-group-sources.mjs
```

Expected:

- Writes JSON and Markdown under `reports/item-groups/`.
- Summary includes `blockedGroupReferences`, `consumerOnlyReferences`, and `duplicateGroupKeys`.
- This is report generation only.

- [ ] **Step 2: Classify the result**

Read the JSON summary:

```bash
node -e "const fs=require('fs'); const p='reports/item-groups/any-item-group-source-audit-2026-05-23.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify(j.summary,null,2));"
```

Expected:

- If `blockedGroupReferences > 0`, the panel remains a real blocker and the next task must repair item-group sources.
- If `blockedGroupReferences === 0`, regenerate domain reports and expect `support.item_group/blockingGate` to stop blocking.

- [ ] **Step 3: Regenerate domain reports**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Expected: `support.item_group/blockingGate` reflects the actual item-group source audit result.

- [ ] **Step 4: Write item-group audit**

Create `docs/audits/2026-05-23_domain-a-grade-item-group-evidence.md` with:

- Command exit codes.
- Summary values.
- Whether the blocker is cleared or confirmed as real data debt.
- Remaining `generatedBlockedCount`.

- [ ] **Step 5: Commit item-group evidence**

If `support.item_group/blockingGate` depends on `reports/item-groups/any-item-group-source-audit-2026-05-23.json`, first make that exact JSON and Markdown output trackable through `.gitignore` allowlist entries. A tracked audit doc alone is not enough to clear this blocker because the gate consumes `reports/item-groups/any-item-group-source-audit*.json`.

Add the allowlist after the existing `reports/domain` and `reports/relation` rules:

```gitignore
!reports/item-groups/
!reports/item-groups/any-item-group-source-audit-2026-05-23.json
!reports/item-groups/any-item-group-source-audit-2026-05-23.md
```

```bash
git add \
  .gitignore \
  reports/item-groups/any-item-group-source-audit-2026-05-23.json \
  reports/item-groups/any-item-group-source-audit-2026-05-23.md \
  reports/domain/support.item_group/blocking-gate-2026-05-23.json \
  docs/audits/2026-05-23_domain-a-grade-item-group-evidence.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record item group blocker evidence"
```

Expected: the gate-consumed item-group report is committed or the task remains classified as not cleared.

## Task 3: Resolve Group C Boss Image Lineage Evidence

**Files:**
- Read: `scripts/data/audit/image-source-lineage-report.mjs`
- Potential generated output: `reports/audit/image-source-lineage-2026-05-23.json`
- Regenerate: `reports/domain/bosses/image-readiness-2026-05-23.json`
- Create: `docs/audits/2026-05-23_domain-a-grade-image-lineage-evidence.md`

- [ ] **Step 1: Run image lineage in read-only mode**

Run:

```bash
node scripts/data/audit/image-source-lineage-report.mjs --source=db
```

Expected:

- Reads DB only.
- Emits image lineage summary.
- Writes report if the script supports default report output.
- If DB is unavailable, stop this task and record the runtime blocker.

- [ ] **Step 2: Inspect Boss image contract**

Read the generated image lineage JSON or stdout and record:

- `entities.bosses.contractReady`
- `entities.bosses.gapReasons`
- Whether Boss images are inherited from NPC data or have their own managed lineage.

- [ ] **Step 3: Regenerate domain reports and gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Expected:

- `bosses/imageReadiness` no longer blocks because the report is missing.
- If Boss image contract itself is not ready, keep the blocker and plan a Boss image-lineage repair branch.

- [ ] **Step 4: Write image-lineage audit**

Create `docs/audits/2026-05-23_domain-a-grade-image-lineage-evidence.md` with:

- Command exit codes.
- Boss image lineage fields.
- Remaining gate status.

- [ ] **Step 5: Commit image-lineage evidence**

Add the allowlist after the existing `reports/domain` and `reports/relation` rules:

```gitignore
!reports/audit/
!reports/audit/image-source-lineage-2026-05-23.json
```

Run:

```bash
git add \
  .gitignore \
  reports/audit/image-source-lineage-2026-05-23.json \
  reports/domain/bosses/image-readiness-2026-05-23.json \
  docs/audits/2026-05-23_domain-a-grade-image-lineage-evidence.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record boss image lineage evidence"
```

Expected: tracked lineage report, tracked domain report, and audit doc. If `reports/audit/**` remains ignored, the blocker is classified but not cleared.

## Task 4: Resolve Group B Source Snapshot Evidence

**Files:**
- Read: `scripts/data/fetch/fetch-wiki-bosses.mjs`
- Read: `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
- Read: `scripts/data/fetch/fetch-wiki-shimmer-page.mjs`
- Read: `scripts/data/transform/transform-wiki-shimmer-to-importable.mjs`
- Read: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`
- Regenerate: source readiness domain reports
- Create: `docs/audits/2026-05-23_domain-a-grade-source-snapshot-evidence.md`

- [ ] **Step 1: Decide source-snapshot lane type**

Use this decision rule:

- If the required source file exists in another trusted worktree or committed history, copy is not allowed by default; run the producer or document why the latest source cannot be regenerated.
- Network fetch commands require explicit fetch-lane approval in the task update and must pass the network/progress checklist.
- `python` is unavailable in this worktree; `python3` must be used for Town NPC maintenance, and `bs4` must be importable before the fetch can run.
- The four gate-consumed latest source snapshots are ignored by `.gitignore` today. Clearing Group B requires making these exact outputs trackable or changing the gate to consume a tracked distilled evidence artifact.
- Do not run full backend refresh apply, `item-pages-refresh`, or long item crawl for Group B. These four blockers are source-snapshot evidence blockers, not a mandate for a multi-day item crawl.

- [ ] **Step 1a: Verify command parameters and progress contract before fetching**

Run:

```bash
node scripts/data/workflow/domain-acceptance-report-manifest.mjs | rg -n "bosses|armor_sets|support.shimmer|support.town_npc_maintenance|sourceReadiness|writesDatabase"
rg -n "progress-path|TERRAPEDIA_CRAWLER_PROGRESS_PATH|lastHeartbeatAt|childStatusPath|actionId" \
  scripts/data/fetch/fetch-wiki-bosses.mjs \
  scripts/data/fetch/fetch-wiki-armor-sets.mjs \
  scripts/data/fetch/fetch-wiki-shimmer-page.mjs \
  scripts/data/fetch/fetch-wiki-town-npc-maintenance.py
```

Expected:

- Manifest entries remain `writesDatabase=false`.
- If a fetch script lacks progress output, do not run it in this plan. Open a progress-contract repair branch or classify the Group B blocker as needing that branch first.
- No manual approval can bypass the progress contract for crawler/fetch execution; approval only decides whether to open the progress-contract repair branch now or leave Group B classified for follow-up.

- [ ] **Step 2: Run Boss source producer if approved**

Run:

```bash
node scripts/data/fetch/fetch-wiki-bosses.mjs \
  --output-json=data/generated/wiki-bosses.latest.json \
  --report-json=reports/wiki-bosses-fetch-2026-05-23.json
```

Expected:

- Writes `data/generated/wiki-bosses.latest.json`.
- Writes `reports/wiki-bosses-fetch-YYYY-MM-DD.json`.
- Does not write DB rows.
- Completes within 20 minutes.

- [ ] **Step 3: Run ArmorSet source producer if approved**

Run:

```bash
node scripts/data/fetch/fetch-wiki-armor-sets.mjs \
  --output-dir=data/generated \
  --keep-snapshot=false
```

Expected:

- Writes `data/generated/wiki-armor-sets.latest.json`.
- Does not write DB rows.
- Completes within 20 minutes.

- [ ] **Step 4: Run Shimmer source producer if approved**

Run:

```bash
node scripts/data/fetch/fetch-wiki-shimmer-page.mjs \
  --output=data/generated/wiki-shimmer.latest.json \
  --report-output=reports/wiki-shimmer-summary-2026-05-23.md
node scripts/data/transform/transform-wiki-shimmer-to-importable.mjs \
  --input=data/generated/wiki-shimmer.latest.json \
  --output=data/generated/shimmer \
  --report-output=reports/wiki-shimmer-importable-summary-2026-05-23.md \
  --use-db-lookup=false
```

Expected:

- Writes `data/generated/wiki-shimmer.latest.json`.
- Writes `data/generated/shimmer/wiki-shimmer-manifest.latest.json`.
- Writes `data/generated/shimmer/wiki-shimmer-context.importable.latest.json`.
- Writes `data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json`.
- Does not write DB rows.
- Fetch completes within 20 minutes; transform completes within 10 minutes.

- [ ] **Step 5: Run Town NPC maintenance source producer if approved and Python3 dependencies are available**

First verify the interpreter and parser dependency:

```bash
command -v python3
python3 --version
python3 - <<'PY'
from bs4 import BeautifulSoup, Tag
print('bs4 ok')
PY
```

Expected:

- `python3` exists.
- `bs4 ok` prints.
- If `python3` or `bs4` is unavailable, do not run the fetch. Open a separate Python dependency/environment repair branch or classify the Town NPC source snapshot blocker as environment-blocked.

Run:

```bash
python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py \
  --source=data/generated/npc-standardized-map.json \
  --output=data/generated/wiki-town-npc-maintenance.latest.json \
  --snapshot-output=reports/wiki-town-npc-maintenance-2026-05-23.json
```

Expected:

- Writes `data/generated/wiki-town-npc-maintenance.latest.json`.
- Writes `reports/wiki-town-npc-maintenance-*.json`.
- Does not write DB rows.
- Completes within 20 minutes.

- [ ] **Step 6: Make Group B evidence durable**

Choose one durable evidence path before claiming any Group B clear:

Option A: track the exact gate-consumed snapshots.

Add the allowlist after the existing `data/generated` ignore rules:

```gitignore
!data/generated/wiki-bosses.latest.json
!data/generated/wiki-armor-sets.latest.json
!data/generated/wiki-town-npc-maintenance.latest.json
!data/generated/shimmer/
!data/generated/shimmer/wiki-shimmer-manifest.latest.json
!data/generated/shimmer/wiki-shimmer-context.importable.latest.json
!data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json
```

```bash
# Add explicit allowlist entries for only the required latest source snapshots.
git add .gitignore \
  data/generated/wiki-bosses.latest.json \
  data/generated/wiki-armor-sets.latest.json \
  data/generated/wiki-town-npc-maintenance.latest.json \
  data/generated/shimmer/wiki-shimmer-manifest.latest.json \
  data/generated/shimmer/wiki-shimmer-context.importable.latest.json \
  data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json
```

Option B: change `scripts/data/audit/domain-readiness-audit.mjs` so Group B source-readiness consumes a deterministic tracked summary under `reports/domain/source-snapshots/`, add a focused test, and commit that summary.

Expected:

- The gate no longer depends on local-only ignored Group B snapshots.
- The selected option is recorded in the source-snapshot audit doc.

- [ ] **Step 7: Regenerate domain reports and gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Expected:

- The four source-readiness missing-evidence blockers are either cleared or converted into explicit source quality blockers.
- No Group B panel is marked cleared using local-only ignored files.

- [ ] **Step 8: Write source-snapshot audit**

Create `docs/audits/2026-05-23_domain-a-grade-source-snapshot-evidence.md` with:

- Which source producers were run.
- Exit codes.
- Generated file paths.
- Whether each generated path is ignored or tracked.
- The selected durable evidence strategy: exact snapshot allowlist or tracked distilled evidence.
- Progress-contract status and any follow-up progress repair branch.
- Resulting source-readiness status per affected panel.

- [ ] **Step 9: Commit source-snapshot audit and tracked reports**

Run:

```bash
git add \
  reports/domain/bosses/source-readiness-2026-05-23.json \
  reports/domain/armor_sets/source-readiness-2026-05-23.json \
  reports/domain/support.shimmer/source-readiness-2026-05-23.json \
  reports/domain/support.town_npc_maintenance/source-readiness-2026-05-23.json \
  docs/audits/2026-05-23_domain-a-grade-source-snapshot-evidence.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: record source snapshot evidence"
```

Expected: tracked domain reports, audit doc, and the durable evidence files from Step 6. If Step 6 chose Option A, add the exact allowlisted snapshot paths to this `git add` command. If Step 6 chose Option B, add the modified audit script, tests, and tracked distilled summary paths.

## Task 5: Resolve Group E Projectile Relation Field Gap

**Files:**
- Read: `reports/relation/entity-coverage-baseline-2026-04-25.json`
- Read: `scripts/data/relation/entity-field-audit*.mjs`
- Read: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Likely modify in follow-up implementation branch: projectile zh/image enrichment scripts, relation projection sync, or entity coverage audit expectations
- Create: `docs/audits/2026-05-23_domain-a-grade-projectile-relation-gap.md`

- [ ] **Step 1: Inspect the current gap**

Run:

```bash
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('reports/relation/entity-coverage-baseline-2026-04-25.json','utf8')); console.log(JSON.stringify(j.domains?.projectiles ?? j.projectiles ?? j.summary?.projectiles ?? j,null,2));"
```

Expected: enough detail to identify the source of `nameZh.gap=1006` or confirm the baseline report is stale/insufficient.

- [ ] **Step 2: Determine whether the blocker is stale evidence or real data gap**

Generate a fresh read-only entity coverage baseline before classification:

```bash
node scripts/data/relation/entity-coverage-baseline.mjs \
  --local-database=terria_v1_local \
  --maint-database=terria_v1_maint \
  --relation-database=terria_v1_relation
node -e "const fs=require('fs'); const p='reports/relation/entity-coverage-baseline-2026-05-23.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify(j.fieldAudit?.domains?.projectiles ?? null,null,2));"
```

Expected:

- The command writes `reports/relation/entity-coverage-baseline-2026-05-23.json` and `.md`.
- If a fresh read-only audit shows no projectile `nameZh` gap, regenerate domain reports so `projectiles/relationReadiness` points at current evidence.
- If the gap persists, open a dedicated repair branch for projectile zh relation coverage. Do not weaken the domain gate.
- If DB connection fails, classify this lane as blocked by DB-read environment and do not use the 2026-04-25 baseline as a current fact.

- [ ] **Step 3: Write projectile gap audit**

Create `docs/audits/2026-05-23_domain-a-grade-projectile-relation-gap.md` with:

- Whether `nameZh.gap=1006` is stale evidence or real current data debt.
- Source-of-truth chain: generated projectile zh/source data -> relation projection -> domain readiness report.
- Required follow-up branch if DB or projection writes are needed.

- [ ] **Step 4: Commit projectile gap audit**

Run:

```bash
git add \
  reports/relation/entity-coverage-baseline-2026-05-23.json \
  reports/relation/entity-coverage-baseline-2026-05-23.md \
  reports/domain/projectiles/relation-readiness-2026-05-23.json \
  docs/audits/2026-05-23_domain-a-grade-projectile-relation-gap.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: classify projectile relation blocker"
```

Expected: fresh tracked baseline plus classification audit. If the DB-read command failed and no fresh baseline exists, commit only the audit doc and explicitly keep the blocker open.

## Task 6: Final Gate Rebuild And Release Decision

**Files:**
- Regenerate: `reports/domain/**`
- Create: `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md`
- Update if needed: `docs/project-management/current-status.md`
- Update if needed: `docs/project-management/risk-register.md`
- Update if needed: `docs/project-management/decision-log.md`

- [ ] **Step 1: Rebuild domain reports**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)" > /tmp/terrapedia-domain-freshness-closeout.json
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-closeout.json || test "$?" -eq 1
```

Expected:

- Freshness remains `pass`.
- A-grade either exits `0`, or exits `1` with only blockers classified as requiring a separate data-write/crawler plan.

- [ ] **Step 2: Write closeout audit**

Create `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md` with:

- Starting blocker count: `13`.
- Ending blocker count.
- Cleared blockers by group.
- Remaining blockers and required next branches.
- Whether public v0.1 remains preview-only or can advance toward release.

- [ ] **Step 3: Update management records**

If final A-grade is non-blocked:

- Mark the public v0.1 release gate as ready for staging smoke.
- Move the main risk from "blocked gate" to "staging not verified".

If final A-grade is still blocked:

- Keep `current-status.md` as preview-only.
- Keep or add risks for remaining data/source-chain blockers.

- [ ] **Step 4: Run final front and gate checks**

Run:

```bash
cd front-nuxt && pnpm run check:public-pages && pnpm run check
cd ..
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs --repo-root="$(pwd)"
```

Expected:

- Public page checks pass for 24 Nuxt routes.
- Nuxt typecheck exits `0`; known Node `DEP0205` warning may appear.
- Freshness exits `0`.

- [ ] **Step 5: Commit closeout**

Run:

```bash
git add \
  reports/domain/items/source-readiness-2026-05-23.json \
  reports/domain/items/relation-readiness-2026-05-23.json \
  reports/domain/items/image-readiness-2026-05-23.json \
  reports/domain/items/public-readiness-2026-05-23.json \
  reports/domain/items/unresolved-audit-trend-2026-05-23.json \
  reports/domain/npcs/source-readiness-2026-05-23.json \
  reports/domain/npcs/relation-readiness-2026-05-23.json \
  reports/domain/npcs/image-readiness-2026-05-23.json \
  reports/domain/npcs/public-readiness-2026-05-23.json \
  reports/domain/npcs/unresolved-audit-trend-2026-05-23.json \
  reports/domain/bosses/source-readiness-2026-05-23.json \
  reports/domain/bosses/relation-readiness-2026-05-23.json \
  reports/domain/bosses/image-readiness-2026-05-23.json \
  reports/domain/bosses/public-readiness-2026-05-23.json \
  reports/domain/bosses/unresolved-audit-trend-2026-05-23.json \
  reports/domain/buffs/source-readiness-2026-05-23.json \
  reports/domain/buffs/relation-readiness-2026-05-23.json \
  reports/domain/buffs/image-readiness-2026-05-23.json \
  reports/domain/buffs/public-readiness-2026-05-23.json \
  reports/domain/buffs/unresolved-audit-trend-2026-05-23.json \
  reports/domain/projectiles/source-readiness-2026-05-23.json \
  reports/domain/projectiles/relation-readiness-2026-05-23.json \
  reports/domain/projectiles/image-readiness-2026-05-23.json \
  reports/domain/projectiles/public-readiness-2026-05-23.json \
  reports/domain/projectiles/unresolved-audit-trend-2026-05-23.json \
  reports/domain/armor_sets/source-readiness-2026-05-23.json \
  reports/domain/armor_sets/relation-readiness-2026-05-23.json \
  reports/domain/armor_sets/image-readiness-2026-05-23.json \
  reports/domain/armor_sets/public-readiness-2026-05-23.json \
  reports/domain/armor_sets/unresolved-audit-trend-2026-05-23.json \
  reports/domain/support.recipe/source-readiness-2026-05-23.json \
  reports/domain/support.recipe/blocking-gate-2026-05-23.json \
  reports/domain/support.recipe/b1-exemption-compliance-2026-05-23.json \
  reports/domain/support.shimmer/source-readiness-2026-05-23.json \
  reports/domain/support.shimmer/blocking-gate-2026-05-23.json \
  reports/domain/support.shimmer/b1-exemption-compliance-2026-05-23.json \
  reports/domain/support.category/source-readiness-2026-05-23.json \
  reports/domain/support.category/blocking-gate-2026-05-23.json \
  reports/domain/support.category/b1-exemption-compliance-2026-05-23.json \
  reports/domain/support.item_group/source-readiness-2026-05-23.json \
  reports/domain/support.item_group/blocking-gate-2026-05-23.json \
  reports/domain/support.item_group/b1-exemption-compliance-2026-05-23.json \
  reports/domain/support.town_npc_maintenance/source-readiness-2026-05-23.json \
  reports/domain/support.town_npc_maintenance/blocking-gate-2026-05-23.json \
  reports/domain/support.town_npc_maintenance/b1-exemption-compliance-2026-05-23.json \
  docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md \
  docs/project-management/decision-log.md
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: close domain blocker burn-down"
```

Expected: focused closeout commit with tracked reports and docs.

## Execution Order

Recommended order:

1. Task 0 baseline.
2. Task 1 reresolve evidence, because one report can clear six blocked panels.
3. Task 2 item group audit, because it is report-only and independent.
4. Task 3 image lineage report, because it is read-only DB evidence.
5. Task 4 source snapshots, because it involves network/Python environment risk.
6. Task 5 projectile relation gap classification, because it may require real data/projection repair.
7. Task 6 closeout.

## Multi-Agent Split

Allowed parallel lanes after Task 0:

| Lane | Owns | Writes |
| --- | --- | --- |
| Lane A | reresolve trend | `reports/relation/reresolve-candidates-2026-05-23.json`, `reports/domain/*/unresolved-audit-trend-2026-05-23.json`, reresolve audit doc |
| Lane B | item group audit | `reports/domain/support.item_group/**`, item-group audit doc |
| Lane C | image lineage | `reports/domain/bosses/image-readiness-2026-05-23.json`, image-lineage audit doc |
| Lane D | source snapshots | affected source-readiness domain reports, source-snapshot audit doc |
| Lane E | projectile relation gap | projectile gap audit doc only unless a separate implementation plan is approved |

Do not run two lanes that both execute `domain-acceptance-generate-reports.mjs --write=true` at the same time in the same worktree. Parallel lanes should use separate worktrees or perform read-only exploration first, then serialize report regeneration.

## Stop Conditions

Stop and repair the plan before continuing if:

- A task requires DB writes.
- A task requires crawler/import/backfill/apply commands not explicitly scoped here.
- A source producer changes generated data semantics rather than only refreshing a missing latest file.
- The gate passes only because checks were weakened or removed.
- Any command creates untracked non-ignored files outside the expected report/source paths.
- A task would need to force-add ignored data artifacts.

## Success Criteria

Minimum success:

- Every one of the original 13 blocked panels is either cleared or has a fresh audit doc proving why it requires a separate data-write/crawler repair branch.
- Freshness remains `pass`.
- Public v0.1 is explicitly classified as preview-only unless A-grade exits `0`.

Full success:

- `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` exits `0`.
- `generatedBlockedCount=0`.
- Remaining warnings, if any, are documented as non-release-blocking or assigned to a follow-up warning burn-down plan.
