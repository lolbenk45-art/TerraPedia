# Item Image Legacy-Origin Normalization Implementation Plan

> **For agentic workers:** Execute this focused plan inline with test-first checkpoints.

**Goal:** Add a governed probe-only `canonical-image-sync` mode that atomically
normalizes exactly the 331 legacy item image origins to origin-free paths.

**Architecture:** Keep ownership in `run-image-sync.mjs`; add explicit
legacy-origin flags to the execution manifest and tests. The mode validates the
candidate set before authorization, probes only the configured current MinIO
origin, stages changes in memory, and writes the standardized file only after
all probes succeed.

**Tech Stack:** Node.js ESM, `node:test`, existing canonical operation manifest,
progress and image-sync helpers.

---

### Task 1: Lock the behavior with tests

**Files:**
- Modify: `scripts/data/workflow/run-image-sync.test.mjs`

- [ ] Add a test fixture with two legacy-origin candidates and one relative
  managed record. Assert the repair reports the exact candidate count, probes
  only the two re-originated paths, creates no uploader, and stores relative
  paths on success.
- [ ] Add a failure test where one probe returns false. Assert the run rejects,
  writes no standardized file, and reports the failed key.
- [ ] Add a scope test rejecting a candidate-count mismatch before probing.
- [ ] Run the focused test and confirm the new tests fail because the mode is
  not implemented.

### Task 2: Implement probe-only atomic normalization

**Files:**
- Modify: `scripts/data/workflow/run-image-sync.mjs`

- [ ] Parse and validate `legacyOriginRepair`, `legacyOrigin`, and
  `expectedLegacyCount` as an items-only apply mode.
- [ ] Select exactly absolute legacy-origin item paths, validate the expected
  count before permit/network work, and classify all non-candidates as
  untouched already-managed records.
- [ ] Re-origin each candidate for HEAD probing, stage origin-free paths, and
  fail without writing the standardized file when any probe fails.
- [ ] Skip uploader creation and wiki fallback in this mode; preserve normal
  image-sync behavior for all other invocations.
- [ ] Run the focused suite and confirm it passes.

### Task 3: Bind the formal execution manifest

**Files:**
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Test: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

- [ ] Bind the exact legacy-origin repair flags and expected count in the
  canonical-image-sync command fixture used for this authorized retry.
- [ ] Assert the manifest remains network-enabled, database-write-free, and
  includes the standardized/promotion evidence paths.
- [ ] Run the manifest and image-sync focused suites.

### Task 4: Validate and hand off runtime authorization

**Files:**
- Update: `docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md`
- Update: `docs/devlog/current.md`

- [ ] Record the approved atomic failure semantics, implementation validation,
  and the exact next authorization identity/scope.
- [ ] Run `git diff --check`, all focused tests, and `node --check` for changed
  scripts.
- [ ] Do not execute the formal image-sync packet until its fresh manifest,
  request, packet, permit, and current standardized hash are verified.
