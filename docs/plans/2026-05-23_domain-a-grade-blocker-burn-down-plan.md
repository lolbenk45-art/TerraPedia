# Domain A-Grade Blocker Burn-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the current Domain Acceptance A-grade gate from `blocked` to a truthful non-blocked state by clearing or explicitly reclassifying the 13 blocked panels recorded on 2026-05-23.

**Architecture:** Treat `reports/domain/**` as the gate output and repair the upstream evidence/report producers before changing the gate. Work in evidence lanes first, then data-gap lanes, then policy/registry lanes only if the evidence proves a contract is obsolete. No crawler, import, backfill, DB write, or production mutation is allowed without a separate data-write plan and rollback note.

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
- Crawler/network fetch execution unless a task explicitly says it is the approved fetch lane.
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

If an ignored evidence file is required for reproducible gate proof, record the stdout summary and path in `docs/audits/**`. Do not force-add ignored files unless a separate evidence-retention decision is made.

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
git add reports/relation/reresolve-candidates-2026-05-23.json reports/domain docs/audits/2026-05-23_domain-a-grade-reresolve-evidence.md
git diff --cached --stat
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

If the generated `reports/item-groups/**` files are still ignored, do not force-add them. Commit the tracked domain report changes and audit doc:

```bash
git add reports/domain/support.item_group docs/audits/2026-05-23_domain-a-grade-item-group-evidence.md
git diff --cached --stat
git commit -m "docs: record item group blocker evidence"
```

Expected: evidence is traceable from the audit doc, even if raw item-group report remains local-only.

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

Run:

```bash
git add reports/domain/bosses/image-readiness-2026-05-23.json docs/audits/2026-05-23_domain-a-grade-image-lineage-evidence.md
git diff --cached --stat
git commit -m "docs: record boss image lineage evidence"
```

Expected: tracked domain report and audit doc. Do not force-add ignored `reports/audit/**` unless a separate evidence-retention decision is made.

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
- Network fetch commands require explicit fetch-lane approval in the task update.
- Python is currently unavailable in this worktree (`python` command check returned exit `127` during planning); Town NPC maintenance fetch needs either `python3` availability or a separate environment repair.

- [ ] **Step 2: Run Boss source producer if approved**

Run:

```bash
node scripts/data/fetch/fetch-wiki-bosses.mjs
```

Expected:

- Writes `data/generated/wiki-bosses.latest.json`.
- Writes `reports/wiki-bosses-fetch-YYYY-MM-DD.json`.
- Does not write DB rows.

- [ ] **Step 3: Run ArmorSet source producer if approved**

Run:

```bash
node scripts/data/fetch/fetch-wiki-armor-sets.mjs
```

Expected:

- Writes `data/generated/wiki-armor-sets.latest.json`.
- Does not write DB rows.

- [ ] **Step 4: Run Shimmer source producer if approved**

Run:

```bash
node scripts/data/fetch/fetch-wiki-shimmer-page.mjs
node scripts/data/transform/transform-wiki-shimmer-to-importable.mjs --use-db-lookup=false
```

Expected:

- Writes `data/generated/wiki-shimmer.latest.json`.
- Writes `data/generated/shimmer/wiki-shimmer-manifest.latest.json`.
- Writes `data/generated/shimmer/wiki-shimmer-context.importable.latest.json`.
- Writes `data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json`.
- Does not write DB rows.

- [ ] **Step 5: Run Town NPC maintenance source producer if approved and Python is available**

Run:

```bash
python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py
```

Expected:

- Writes `data/generated/wiki-town-npc-maintenance.latest.json`.
- Writes `reports/wiki-town-npc-maintenance-*.json`.
- Does not write DB rows.

- [ ] **Step 6: Regenerate domain reports and gate**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --repo-root="$(pwd)" --write=true
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true
```

Expected:

- The four source-readiness missing-evidence blockers are either cleared or converted into explicit source quality blockers.
- Do not force-add ignored generated source files unless this plan is revised to track them.

- [ ] **Step 7: Write source-snapshot audit**

Create `docs/audits/2026-05-23_domain-a-grade-source-snapshot-evidence.md` with:

- Which source producers were run.
- Exit codes.
- Generated file paths.
- Whether each generated path is ignored or tracked.
- Resulting source-readiness status per affected panel.

- [ ] **Step 8: Commit source-snapshot audit and tracked reports**

Run:

```bash
git add reports/domain docs/audits/2026-05-23_domain-a-grade-source-snapshot-evidence.md
git diff --cached --stat
git commit -m "docs: record source snapshot evidence"
```

Expected: tracked domain reports and audit doc. Ignored generated source snapshots stay local-only unless a separate evidence-retention decision is made.

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

Run the current entity field audit command if it exists and is read-only. If there is no safe command, inspect tests and write the audit conclusion from existing reports only.

Expected:

- If a fresh read-only audit shows no projectile `nameZh` gap, retarget or regenerate `reports/relation/entity-coverage-baseline*.json`.
- If the gap persists, open a dedicated repair branch for projectile zh relation coverage. Do not weaken the domain gate.

- [ ] **Step 3: Write projectile gap audit**

Create `docs/audits/2026-05-23_domain-a-grade-projectile-relation-gap.md` with:

- Whether `nameZh.gap=1006` is stale evidence or real current data debt.
- Source-of-truth chain: generated projectile zh/source data -> relation projection -> domain readiness report.
- Required follow-up branch if DB or projection writes are needed.

- [ ] **Step 4: Commit projectile gap audit**

Run:

```bash
git add docs/audits/2026-05-23_domain-a-grade-projectile-relation-gap.md
git diff --cached --stat
git commit -m "docs: classify projectile relation blocker"
```

Expected: docs-only classification commit unless a separate implementation branch is opened.

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
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --repo-root="$(pwd)" --fail-on-blocked=true > /tmp/terrapedia-domain-a-grade-closeout.json
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
git add reports/domain docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md docs/project-management/current-status.md docs/project-management/risk-register.md docs/project-management/decision-log.md
git diff --cached --stat
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
