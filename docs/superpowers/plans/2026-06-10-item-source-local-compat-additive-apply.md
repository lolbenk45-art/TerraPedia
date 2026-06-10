# Item Source Local Compat Additive Apply Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely write reviewed item source candidate rows into the local public compatibility table so `/api/public/items/{id}/sources` can return real sources, starting with MagicMirror.

**Architecture:** Add a guarded additive importer for `terria_v1_local.item_acquisition_sources`. It reads the reviewed candidate import plan, validates active item/NPC/item-backed references, inserts only missing rows, never updates or deletes during apply, writes a before-snapshot and rollback report, then verifies DB/API/UI.

**Tech Stack:** Node data scripts, MySQL `terria_v1_local`, Spring Boot public item source API, Nuxt public item page.

---

## Multi-Agent Review Inputs

- Apply-readiness review: current full sync/apply paths are too broad; implement a canary-only additive apply instead.
- Schema/API review: public source API reads `item_acquisition_sources` by `item_id`, `status=1`, and sort order. Local insert is enough for public API/UI smoke, but maint/relation chain still needs a later formal promotion.
- Runtime review: DB and Redis are up; backend/front ports may need stack start before API/UI smoke.

## Scope

In scope:

- Add `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`.
- Add `scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs`.
- Apply MagicMirror canary only by default.
- Optionally dry-run high-confidence after canary succeeds.

Out of scope:

- No crawler/fetch/backfill.
- No full `sync-maint-to-relation`.
- No full `sync-relation-to-local-compat-tables --apply=true`.
- No update/delete in apply mode.
- No production DB.

## Required Gates

- `--apply=true` requires `--confirm-local-compat=true`.
- Bulk apply requires `--allow-bulk=true`.
- Unsupported `sourceRefType` rows are blocked.
- Duplicate rows are skipped by stable fingerprint.
- Before apply, write `data/backups/item-source-candidate-local-compat/<batchId>.before.json`.
- After apply, report inserted IDs and rollback SQL.

## Execution

- [x] Implement tests first.
- [x] Implement dry-run/apply script.
- [x] Run MagicMirror dry-run.
- [x] Apply MagicMirror canary.
- [x] Verify DB has 5 active MagicMirror source rows.
- [x] Start/verify local stack if needed.
- [x] Verify `/api/public/items/50/sources` is non-empty.
- [x] Verify `/items/50` page can load after front is running.

## Execution Evidence

- Dry-run report: `data/reports/item-source-magicmirror-local-compat-dry-run.json`.
- Apply report: `data/reports/item-source-magicmirror-local-compat-apply.json`.
- Before snapshot: `data/backups/item-source-candidate-local-compat/item-source-magicmirror-canary-2026-06-10.before.json`.
- Inserted row IDs: `197672`, `197673`, `197674`, `197675`, `197676`.
- Rollback SQL: `DELETE FROM item_acquisition_sources WHERE id IN (197672, 197673, 197674, 197675, 197676);`.
- API smoke: `GET /api/public/items/50/sources` returned 5 rows.
- Page smoke: `/items/50` rendered source groups with `金箱`, `冰冻箱`, `宝箱怪`, and `Magic Mirrors worldgen`.
