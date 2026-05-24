# Item Page Sampled Crawl Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, deterministic random sample mode for item-page wiki crawl smoke checks so operators can validate the crawler path without running a full corpus crawl.

**Architecture:** Extend the existing item-page fetcher with `--sample-size` and `--sample-seed`, apply sampling before any remote revision probe, and pass the options through `run-wiki-sync.mjs` for the public workflow entrypoint. Reuse the existing item-pages monitor progress path and Redis state; do not create a new monitor row or domain acceptance gate.

**Tech Stack:** Node.js ESM scripts under `scripts/data/fetch` and `scripts/data/workflow`, existing `wiki-item-utils` CLI parsing, crawler progress helpers from `backend-refresh-runtime-state.mjs`, and focused `node --test` suites.

---

## Scope

In scope:

- Modify `scripts/data/fetch/fetch-wiki-item-pages.mjs`.
- Modify `scripts/data/fetch/fetch-wiki-item-pages.test.mjs`.
- Modify `scripts/data/workflow/run-wiki-sync.mjs`.
- Modify `scripts/data/workflow/run-wiki-sync.test.mjs`.
- Create this plan document.

Out of scope:

- Running a live crawler or wiki fetch in this task.
- DB writes, import, backfill, `--apply` data mutations, MinIO uploads, or production mutation.
- NPC crawler random sampling.
- Buff batch random sampling.
- New crawler monitor UI/API row.
- Domain A-grade warning closure.
- Committing generated crawler sample reports.

## Safety Contract

- Sample mode is smoke/supporting evidence only. It must not write under `reports/domain/**` or be consumed by Domain A-grade gates.
- Sampling must be deterministic from `--sample-seed` and reproducible across runs.
- Sampling must happen after explicit `--items` filtering and before `--offset`, `--limit`, `only-missing`, `only-changed`, or `probe-only` remote metadata work.
- The existing full-corpus guard remains active. `--sample-size` counts as an explicit bounded selector only when it is a positive integer capped at `100`; larger values must fail instead of silently becoming a full-corpus crawl.
- Sampled runs must reject `--report-dir` paths under `reports/domain/**` so smoke evidence cannot become Domain A-grade evidence by path.
- The fetcher must write monitor-visible progress before any remote metadata or page request, and failures after progress initialization must finish with `status: "failed"`.
- Existing default progress path remains `data/generated/wiki-sync-progress.latest.json`; explicit `--progress-path` must still mirror to the canonical path.
- Existing Redis progress write must remain in place.

## Multi-Agent Review Summary

- Entry review selected item pages as the safest first target because they already have `--limit`, `--items`, default full-corpus protection, progress, Redis state, and tests.
- Progress review requires reuse of the `item-pages-refresh` monitor-visible path rather than a new sampled monitor row.
- Acceptance review requires sample outputs to stay out of `reports/domain/**` and not claim A-grade closure.
- Cross-review repair added hard tests for `sample-size > 100`, sampled `reports/domain/**` rejection, failure progress finalization, and sample-before-limit ordering.

## Task 1: Add Item Fetcher Sampling Tests First

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-item-pages.test.mjs`

- [ ] **Step 1: Add a deterministic sample selection test**

Create a test with five input items and mock wiki API responses keyed by request title. Run the fetcher with:

```bash
--sample-size=2
--sample-seed=stable-smoke
--only-changed=false
--limit=5
```

Expected:

- exit status `0`;
- report has `sampled === true`, `sampleSize === 2`, `sampleSeed === "stable-smoke"`, `candidateCountBeforeSample === 5`;
- report `selectedCount === 2`;
- exactly two latest raw item page files are written;
- progress completes with `total === 2`.

- [ ] **Step 2: Add a reproducibility test**

Run the fetcher twice in separate temp dirs with the same input, same `--sample-size=3`, and same `--sample-seed`.

Expected: both reports list the same `itemInternalName` sequence.

- [ ] **Step 3: Add a pre-remote-progress test**

Run with `--probe-only=true`, `--sample-size=1`, and a mock response that would fail if the wrong title is probed.

Expected:

- progress file exists even if the mock response is missing for non-sampled pages;
- the report includes only the sampled page;
- no metadata request is attempted for unsampled pages.

- [ ] **Step 4: Add cross-review boundary tests**

Add tests for:

- sampling before `--offset`/`--limit` by comparing an unsliced deterministic sample to a sliced run;
- `--sample-size=101` fails with a cap error;
- sampled runs reject `--report-dir=reports/domain/...`;
- sampled remote metadata failure writes final `failed` progress with required progress fields.

- [ ] **Step 5: Verify RED**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs
```

Expected before implementation: new tests fail because `--sample-size` and `--sample-seed` are ignored, report sampling fields are absent, failure progress is not finalized, and sampled domain report paths are not rejected.

## Task 2: Implement Deterministic Sampling In The Fetcher

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-item-pages.mjs`

- [ ] **Step 1: Parse sampling options**

Add:

- `sampleSize = numericOption(options['sample-size'] ?? options.sampleSize, null)`
- `sampleSeed = String(options['sample-seed'] ?? options.sampleSeed ?? 'terrapedia-item-page-smoke')`

Normalize `sampleSize` to a positive integer no greater than `100`, or `null`; values above `100` must fail.

- [ ] **Step 2: Apply sampling before remote work**

After explicit `--items` filtering and before `offset/limit`, `only-missing`, and `loadRemoteRevisionMap`, apply deterministic sampling when `sampleSize > 0`.

Expected selection order: stable shuffled order derived from item identity plus seed.

- [ ] **Step 3: Preserve full-corpus guard**

Update the full-corpus guard so `--sample-size` is treated as an explicit bounded selector.

Expected:

- `--sample-size=20` without `--limit` is accepted.
- no `--sample-size`, no `--items`, and no safe limit still throws.
- `--sample-size=101` throws instead of bypassing the guard.

- [ ] **Step 4: Write progress before remote probes**

Write a `running` progress event after final selected candidate list is known but before `loadRemoteRevisionMap`.

Expected: progress has phase `sample` when sampling is active, otherwise phase `select`.

- [ ] **Step 5: Finalize failed progress after remote errors**

When remote metadata or page fetch startup fails after progress initialization, write final item-page progress with `status: "failed"`, `phase: "error"`, and the same canonical/explicit progress mirroring behavior.

- [ ] **Step 6: Guard sampled report destination**

Reject sampled runs that target `reports/domain/**`; default and explicit non-domain report dirs remain allowed.

- [ ] **Step 7: Add sampling fields to probe and fetch reports**

Reports should include:

- `sampled`
- `sampleSize`
- `sampleSeed`
- `candidateCountBeforeSample`
- `sampleCandidateCount`

- [ ] **Step 8: Verify GREEN**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs
```

Expected: all item page fetcher tests pass.

## Task 3: Pass Sampling Through Wiki Sync

**Files:**
- Modify: `scripts/data/workflow/run-wiki-sync.mjs`
- Modify: `scripts/data/workflow/run-wiki-sync.test.mjs`

- [ ] **Step 1: Add plan test for sampling args**

Add a `run-wiki-sync` plan test for:

```bash
--mode=plan --entity=item_pages --sample-size=7 --sample-seed=smoke-a --only-changed=false
```

Expected planned action args include:

- `--sample-size=7`
- `--sample-seed=smoke-a`
- `--only-changed=false`
- `--limit=100` or another safe bounded limit already used by the workflow

- [ ] **Step 2: Forward sample args**

In `ENTITY_CONFIG.item_pages.scriptArgs`, forward `--sample-size` and `--sample-seed` when provided.

- [ ] **Step 3: Verify workflow tests**

Run:

```bash
node --test scripts/data/workflow/run-wiki-sync.test.mjs
```

Expected: workflow tests pass.

## Task 4: Final Validation And Review

**Files:**
- Read: full diff.

- [ ] **Step 1: Run focused crawler tests**

```bash
node --test scripts/data/fetch/fetch-wiki-item-pages.test.mjs
node --test scripts/data/workflow/run-wiki-sync.test.mjs
```

- [ ] **Step 2: Run batch guard tests**

```bash
node --test scripts/data/fetch/run-item-page-crawl-batches.test.mjs scripts/data/fetch/start-detached-item-page-crawl.test.mjs
```

- [ ] **Step 3: Run domain acceptance safety tests**

```bash
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs
```

- [ ] **Step 4: Request cross-review**

Reviewer checks:

- no DB/import/backfill/apply paths were added;
- sampling happens before remote metadata probe;
- progress is written before remote work;
- sample reports are not domain gate evidence;
- deterministic seed behavior is covered.

## Task 5: Commit Exact Scope

**Files:**
- Stage only:
  - `docs/plans/2026-05-25_item-page-sampled-crawl-smoke-plan.md`
  - `scripts/data/fetch/fetch-wiki-item-pages.mjs`
  - `scripts/data/fetch/fetch-wiki-item-pages.test.mjs`
  - `scripts/data/workflow/run-wiki-sync.mjs`
  - `scripts/data/workflow/run-wiki-sync.test.mjs`

- [ ] **Step 1: Check status**

```bash
git status --short --branch -uall
```

- [ ] **Step 2: Stage exact files and inspect**

```bash
git add docs/plans/2026-05-25_item-page-sampled-crawl-smoke-plan.md scripts/data/fetch/fetch-wiki-item-pages.mjs scripts/data/fetch/fetch-wiki-item-pages.test.mjs scripts/data/workflow/run-wiki-sync.mjs scripts/data/workflow/run-wiki-sync.test.mjs
git diff --cached --stat
git diff --cached --name-status
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(data): add sampled item page crawl smoke"
```
