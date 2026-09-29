# Armor item-effect upstream contract

## Status

`closed`

## Scope and design

- Owner: Armor agent, `feat/automation-domain-armor`, `.worktrees/automation-domain-armor`; parent `2026-09-28-armor-source-semantics-continuation.md`; follows `76452cc0`.
- User goal remains complete Armor ingestion. This checkpoint implements the missing source→landing→maint→effect candidate/readback contract using existing columns, without DDL or runtime writes.
- Existing `maint_armor_attribute_rows` can retain typed source evidence in raw_json, but it is not safe to treat a sparse item-effect source as a complete table-derived attribute row. Add an explicit legacy-conversion rejection for the reserved source namespace/schema. Do not exclude records silently.
- Proposed dataset `armor_item_effects_raw`, immutable source namespace `wiki.armor.item-effects.shroomite.<source-hash>`, and raw_json schema `armor-item-effect-maint/v1` remain non-executable contracts. No generic loader/operation registry or runtime ownership is expanded by this checkpoint.
- Separate local and maint landing copies retain exact source bytes (base64) and expected identities for all three source artifacts. Three maint rows retain item identity, typed effect and source bindings; defense/raw cell completeness is not fabricated. Landing/maint inserts omit generated IDs; exact existing rows may be reused, all unrelated rows are preserved, and drift is rejected instead of updated/deleted.
- Readback binding rederives the candidate from sources, verifies complete non-generated columns and positive unique IDs independently in local/maint, then binds only the maint landing/maint-record/owner keys into effect rows. It validates supplied readbacks only; a registered locked executor must obtain them from the database before publication authority exists.
- Fresh authenticated preflight2026-09-29 23:42 CST timed out after login. No DB/Redis/control writes or restart.

## Plan and validation

1. Extract the existing Shroomite test fixture into a reusable test-only module. Add RED tests for an append-only landing+3 maint candidate, content/revision retention, deterministic names, historical-row preservation, immutable drift/collision rejection, replay reuse, no allocated IDs, readback mismatch/duplicate/out-of-scope IDs and exact downstream lineage.
2. Add `pipelines/maint/armor-item-effect-maint-candidate.mjs` with pure build/readback-binding functions. Reuse `buildArmorShroomiteSourceCandidate` so caller-supplied effects cannot become source authority. Retain all raw bytes in the landing; return no SQL/execution authority.
3. Add RED and minimal rejection in `buildArmorAttributeRelations` when typed item-effect source rows reach the legacy table converter. Cover both namespace and raw schema identity, preserving ordinary attribute behavior.
4. Run focused source/upstream/legacy conversion and projection tests. Generate a real source-based offline upstream candidate using empty proposed baselines explicitly labelled hypothetical, never as a live database snapshot. Record exact source lineage and remaining blockers.
5. Self-review, diff/path checks, focused commit. Coordinator owns current.md; no change to shared scheduler/ownership rules or historical artifacts.

## Closure boundary

- Complete same-version item/set coverage, independent full-chain candidate acceptance, registered fenced executor/packet, fresh runtime preflight and DB/API/automatic-run validation remain outstanding.
- This is a candidate schema, not a current persisted source-chain change; no current-spec update is needed until the coordinator admits this contract into runtime ownership.

## Results and verification

- Added the pure append-only candidate and readback binder on existing columns; no DDL or runtime source registration. Original artifact bytes are preserved in both landing payloads. New rows have no allocated IDs; drift causes rejection, and old namespaces remain preserved.
- Added explicit legacy rejection by namespace or typed raw schema, with a positive null-JSON compatibility test. Extracted a shared test-only source fixture; production source parsing is unchanged.
- Review repaired local/maint landing-ID separation, historical-ID collisions, second-precision storage timestamps, invalid current markers, null-JSON behavior and serialized Date-shaped snapshot replay. RED logs precede each corresponding fix. The upstream suite passes25 tests; combined upstream/source/legacy producer/independent projection/secondary tests pass242/242.
- Real-source offline evidence produced1 local landing,1 maint landing and3 maint rows against explicitly hypothetical empty baselines. No actual database readback or write was performed. Candidate/report prefix: `.local/tmp/armor-item-effect-upstream-20260929-01`; candidate hash `00d42f8df7202db05c73c999ea900d043fec57f02c8df014d68f3e6f7dc209b5`.
- Each source payload is7,206,903 bytes; the future executor must validate live server/transport limits before packet construction. Do not infer runtime insert counts from this offline plan.
- Durable audit: `docs/audits/2026-09-29-armor-item-effect-upstream-contract.md`. Syntax, whitespace and targeted path checks pass.
- No unresolved material defect remains for the non-executable candidate contract. Registered locked executor/dispatch, complete version-compatible coverage, fresh runtime and real DB/API/automatic-run acceptance remain explicit follow-up gates.

## Commit and continuation

- `commit SHA pending in final response`; keep Armor branch/worktree for full-chain dispatch/executor integration. No push or cleanup.
- Coordinator current.md is untouched. Prior source-adapter marker is fulfilled by76452cc0; older historical ready/pending markers remain coordinator reconciliation work.
- This bounded entry is closed; the parent Armor ingestion objective remains active. No new permission is requested for the already authorized implementation work.

## Closeout correction

The final staged check caught a trailing blank line in the newly added shared
fixture; the initial unstaged check did not include that untracked file. The
implementation checkpoint78e87df2 was already created when that output was
reviewed. A separate formatting/closeout commit removes the blank line and reruns
the staged check; no history rewrite or behavior change. The242-test result
remains the behavioral validation; final whitespace success applies after this
correction.
