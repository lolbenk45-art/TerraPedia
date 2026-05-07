# Warning Burn-Down Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for execution. Keep shared workflow/audit files serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the current domain-acceptance `overallStatus=warning` state by clearing the 17 warning panels that still feed `generation.warning`.

**Scope:** This is a warning burn-down pass, not a public-route feature pass. Product-domain P5 public routes are already online; this plan only addresses the remaining non-blocking warning panels.

**Tech Stack:** Node.js audit/workflow scripts, generated report evidence under `reports/`, Vue/Java repo artifacts only as read targets. This plan may classify DB-writing producers, but it must not run crawler/import/backfill/load/apply or DB-writing commands. Any DB-writing remediation requires a separate data-write plan with target DB, current counts, dry run, and approval.

---

## Current Warning Inventory

Latest gate state on 2026-05-07:

```powershell
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Result:

- `overallStatus: warning`
- `blockingReasons: []`
- top-level check: `generation.warning`
- message: `domain acceptance generation has 17 warning panels`

Latest warning panels from `reports/domain/**`:

| Warning class | Panels | Count |
| --- | --- | ---: |
| Unresolved audit trend baseline missing | `items`, `npcs`, `bosses`, `buffs`, `projectiles`, `armor_sets` `unresolved-audit-trend` | 6 |
| Missing optional evidence in product/support domains | `items/source-readiness`, `items/relation-readiness`, `items/image-readiness`, `npcs/relation-readiness`, `buffs/relation-readiness`, `projectiles/image-readiness`, `support.category/source-readiness`, `support.recipe/source-readiness`, `support.recipe/blocking-gate`, `support.shimmer/blocking-gate` | 10 |
| Existing semantic warning, not just missing file | `armor_sets/image-readiness` | 1 |

Total: `17`

## Warning Details

### Group A: Unresolved Audit Trend Baseline Missing

Panels:

- `items/unresolved-audit-trend`
- `npcs/unresolved-audit-trend`
- `bosses/unresolved-audit-trend`
- `buffs/unresolved-audit-trend`
- `projectiles/unresolved-audit-trend`
- `armor_sets/unresolved-audit-trend`

Current warning reason:

- `reports/relation/reresolve-candidates-2026-05-07.json: historical baseline is unavailable for unresolved audit trend`

Interpretation:

- The report exists and is fresh.
- The warning is not a per-domain data defect.
- The warning comes from unresolved trend semantics when `previousUnresolvedAuditCount` is missing/null.

Clear condition:

- Establish a trusted historical baseline in the `reresolve-candidates` output chain, or add an explicit first-baseline snapshot mechanism and make future runs compare against it.
- Do not suppress this warning in the gate without a real baseline mechanism.

### Group B: Missing Optional Evidence Files

Product domains:

- `items/source-readiness`: `reports/wiki-items-fetch*.json`, `reports/wiki-item-pages-fetch*.json`
- `items/relation-readiness`: `reports/relation/item-relations-bundle*.json`
- `items/image-readiness`: `reports/image-sync*.json`
- `npcs/relation-readiness`: `reports/data/npc-buff-relations-backfill*.json`
- `buffs/relation-readiness`: `reports/data/npc-buff-relations-backfill*.json`
- `projectiles/image-readiness`: `data/generated/projectile-zh-map.json`

Support domains:

- `support.category/source-readiness`: `reports/relation/category-local-sync*.json`
- `support.recipe/source-readiness`: `data/generated/wiki-zh-recipe-pages.latest.json`, `reports/wiki-zh-recipe-import*.json`
- `support.recipe/blocking-gate`: `reports/recipe-provider-consolidation*.json`, `reports/recipe-provider-suppression*.json`, `reports/wiki-zh-recipe-source-coverage*.json`
- `support.shimmer/blocking-gate`: `reports/wiki-shimmer-db-import*.json`

Interpretation:

- These are report/evidence availability warnings, not current blocked semantic failures.
- Do not assume these are lost files. Some may never have had a safe producer in this branch.
- `reports/data/npc-buff-relations-backfill*.json` is one missing artifact consumed by two panels; one fix should clear both if the artifact remains valid.

Required classification before restoration:

- `re-generatable`: an existing non-DB-writing producer can recreate it safely.
- `needs-producer`: no trustworthy producer exists yet, or the only producer is DB-writing/crawler/import/backfill.
- `retire-expectation`: the audit expectation is obsolete and should be replaced or removed with tests.

Clear condition:

- The referenced evidence files exist, are readable, and are emitted in the expected path/pattern.
- If a file is intentionally retired, update `domain-readiness-audit.mjs` and tests so the panel no longer expects it.
- If a file needs a DB-writing producer, stop that lane and create a separate data-write plan instead of folding it into this warning pass.

### Group C: Armor Image Semantic Warning

Panel:

- `armor_sets/image-readiness`

Current warning reason:

- `reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json: armor image fetch warningCount=30 has only 10 sampled fallback records`

Interpretation:

- This is not just "missing file".
- The current armor image fetch report does not provide enough sampled fallback evidence to justify all `warningCount` entries.
- The semantic check in `domain-readiness-audit.mjs` requires enough sampled fallback rows or a parsed snapshot with matching counts.
- Freshness audit evaluates generated `reports/domain/**` report freshness. It does not prove that a dated downstream evidence file name such as `2026-04-27` is semantically current.

Clear condition:

- Regenerate the fetch report with complete fallback evidence, or emit/point to a parsed snapshot satisfying:
  - warning count matches parsed snapshot warnings
  - snapshot totals match report totals
  - image rows match `totalArmorSetImages`
  - no sampled fallback rows are missing `originalUrl` or `contentType`

## Parallelism Model

Allowed parallel work:

- Read-only producer discovery.
- Reading generated report payloads.
- Drafting classification notes per lane.
- Designing candidate fixes without editing shared files.

Serial-only work:

- Editing `scripts/data/audit/domain-readiness-audit.mjs`.
- Editing `scripts/data/audit/domain-readiness-audit.test.mjs`.
- Editing `scripts/data/workflow/domain-acceptance-generate-reports.mjs`.
- Editing `scripts/data/workflow/domain-acceptance-a-grade-gate.mjs`.
- Editing shared report producers used by multiple warning classes.
- Running any write-producing evidence command.
- Changing audit expectations for evidence paths.

## Multi-Agent Lane Split

### Lane 1: Unresolved Trend Baseline

Read-only analysis scope:

- `scripts/data/audit/domain-readiness-audit.mjs`
- `scripts/data/audit/domain-readiness-audit.test.mjs`
- `scripts/data/relation/generate-reresolve-candidates.mjs`
- `reports/relation/reresolve-candidates*.json`

Responsibilities:

- Define how a first trusted unresolved baseline is recorded.
- Ensure future `reresolve-candidates` output includes previous/current comparison without null baseline on steady-state runs.
- Keep semantics honest: first-run bootstrap must be explicit, not silently treated as pass.

### Lane 2: Product Optional Evidence

Read-only analysis scope:

- Item/NPC/Buff/Projectile evidence producers and related audit expectations.

Responsibilities:

- Classify every product missing artifact as `re-generatable`, `needs-producer`, or `retire-expectation`.
- Pay special attention to shared `reports/data/npc-buff-relations-backfill*.json`, which is consumed by both NPCs and Buffs.
- If an artifact is obsolete, propose the exact replacement evidence and required test update.

### Lane 3: Support Optional Evidence

Read-only analysis scope:

- Recipe, shimmer, and category support evidence producers and audit expectations.

Responsibilities:

- Classify every support missing artifact as `re-generatable`, `needs-producer`, or `retire-expectation`.
- Verify whether support recipe/wiki/shimmer evidence requires crawler/import/backfill or DB writes.
- If a producer is unsafe for this plan, stop at classification and create a separate plan.

### Lane 4: Armor Image Semantic Mismatch

Read-only analysis scope:

- `reports/fetch/fetch-armor-set-images*.json`
- armor image parsed snapshot chain
- armor image semantic tests in `domain-readiness-audit.test.mjs`

Responsibilities:

- Prove whether the current fetch report is incomplete or whether the semantic check is too strict for the available evidence shape.
- Preferred fix is better evidence, not weaker semantics.

## Phase Targets

| Phase | Work completed | Expected remaining warning panels | Required checks |
| --- | --- | ---: | --- |
| Phase 0 | Baseline frozen | 17 | no blockers; warning inventory exactly matches this plan |
| Phase 0.5 | Missing optional evidence classified | 17 | every Group B artifact has one owner, classification, and next action |
| Phase 1 | Optional evidence warnings cleared or retired by audited contract change | 7 | no missing optional evidence warnings; no new warning panels |
| Phase 2 | Armor image semantic warning cleared | 6 | `armor_sets/image-readiness` is not warning; no new warning panels |
| Phase 3 | Unresolved trend baseline warnings cleared | 0 | `generation.summary.warningCount === 0`; gate `overallStatus === pass` |

## Execution Order

### Phase 0: Freeze the Warning Baseline

- [ ] Run:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

- [ ] Record the exact 17 warning panels in `docs/audits/2026-05-07_warning-burn-down-baseline.md` before edits.
- [ ] Confirm no DB-writing producer is executed in Phase 0.

Exit gate:

- Baseline warning inventory matches the 17-panel list above.
- Gate `blockingReasons` remains `[]`.

### Phase 0.5: Classify Missing Optional Evidence

- [ ] For every Group B missing artifact, record one classification in the baseline audit note:
  - `re-generatable`
  - `needs-producer`
  - `retire-expectation`
- [ ] For `reports/data/npc-buff-relations-backfill*.json`, record it once and link both consumer panels:
  - `npcs/relation-readiness`
  - `buffs/relation-readiness`
- [ ] For every `needs-producer` item, decide whether to create a separate producer/data-write plan or retire the expectation; do not leave the warning unowned.
- [ ] For every `retire-expectation` item, name the replacement contract and required test update before editing.

Exit gate:

- Every missing optional evidence item has exactly one owner, classification, and next action.
- No producer for a missing Group B artifact has run yet unless it was proven non-DB-writing and report-only. The Phase 0 domain report baseline generation is allowed.

### Phase 1: Clear Evidence Availability Warnings

Why first:

- These warnings are concrete and domain-local after classification.
- They do not require policy changes if the evidence producers still exist and are report-only.
- They reduce noise before unresolved trend baseline work.

- [ ] Lane 2 handles product optional evidence according to Phase 0.5 classifications.
- [ ] Lane 3 handles support optional evidence according to Phase 0.5 classifications.
- [ ] After each batch, re-run:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Exit gate:

- All "Missing optional evidence" warnings are removed or replaced by an explicit audited contract change.
- Expected remaining warning panels: `7`.
- Remaining warnings are only Group A unresolved trend baseline warnings plus Group C armor image semantic warning.
- Gate `blockingReasons` remains `[]`.

### Phase 2: Clear Armor Image Semantic Warning

- [ ] Lane 4 resolves `armor_sets/image-readiness`.
- [ ] If the fix requires regenerating armor fetch evidence, verify the command is report-only and non-DB-writing before running it; otherwise split to a data-write/fetch plan.
- [ ] Re-run:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Exit gate:

- `armor_sets/image-readiness` is no longer `warning`.
- Expected remaining warning panels: `6`.
- Remaining warnings are only Group A unresolved trend baseline warnings.
- Gate `blockingReasons` remains `[]`.

### Phase 3: Clear Unresolved Trend Baseline Warnings

- [ ] Lane 1 adds a real unresolved-baseline mechanism.
- [ ] Re-run the unresolved candidate evidence path only if the command is verified as non-DB-writing. If not, split to a data-write plan.
- [ ] Re-run:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Exit gate:

- All six `unresolved-audit-trend` panels are no longer `warning`.
- Expected remaining warning panels: `0`.
- Gate `blockingReasons` remains `[]`.

### Phase 4: Zero-Warning Closeout

- [ ] Verify:
  - `generation.summary.warningCount === 0`
  - gate `warningReasons === []`
  - gate `overallStatus === pass`

- [ ] Write closeout:

```text
docs/audits/2026-05-07_warning-burn-down-closeout.md
```

## Hard Rules

- Do not "fix" this by weakening `generation.warning` in `domain-acceptance-a-grade-gate.mjs`.
- Do not hide warning panels with `acceptedWarning`.
- Do not reclassify required semantic checks as optional unless the source-of-truth contract really changed and the test suite is updated to match.
- Do not run crawler/import/backfill/load/apply or DB-writing commands under this plan; split those into a dedicated data-write plan.
- Keep evidence generation, freshness audit, and gate verification fresh after every warning-removal batch.
- If a phase misses its expected warning count, stop and classify the delta before continuing.

## Recommended Multi-Agent Batch

Run these in parallel first as read-only analysis lanes:

- Agent A: product optional evidence classification.
- Agent B: support optional evidence classification.
- Agent C: armor image semantic mismatch analysis.
- Agent D: unresolved trend baseline design.

Then merge serially in this order:

1. Optional evidence classifications.
2. Non-DB-writing optional evidence restorations or audited expectation retirements.
3. Armor image semantic fix.
4. Unresolved trend baseline fix.
5. Final full gate verification.
