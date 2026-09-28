# Armor source semantics continuation

## Status

`active`

## Scope and handoff

- Owner/reviewer: Codex, serial current-model review, no subagents. Branch `feat/automation-scheduler-continuation`, worktree `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`; clean resume HEAD `c11b53a6`.
- Parent: `2026-09-27-armor-image-cache-continuation.md`; standing authority remains in `2026-09-19-automation-scheduler-authorization-list.md`. User requested continuation after the verified workspace checkpoint.
- Success: resolve source parsing/provenance conflicts with reproducible evidence and tests; publish only newly authorized registered operations with exact DB/public/admin readback, then continue the parent Armor/Buff/Shimmer gates.
- No local.items writes, DDL, direct SQL/Redis repair, scheduler activation, H8 expansion, historical source overwrite or consumed-decision replay. Image caches `.32/.33` are already completed.

## Investigation and plan

- MiningHelmet's duplicate records already occur in preserved fetched attributes: one is from a head table, one from a legs table. The relation member-slot reconciliation later made both head rows. Investigate the HTML table parser and its selected link/cell positions before choosing or retiring either source row.
- Bounded fetch entry: `pipelines/fetch/fetch-wiki-armor-attributes.mjs`, action `domain-source-armor-attributes`. Add optional immutable raw-page capture and continuous heartbeat, verify offline first, then fetch into a fresh per-run output directory with the dedicated canonical monitor progress under the backend data root. No database work runs concurrently with collection.
- Inspect actual table headers, item links and source revision evidence. Add RED parsing tests based on the observed markup; implement the minimum correction, generate a new immutable source namespace and derive the exact retirement/projection consequences.
- Set effects additionally require authoritative revision-bound text and canonical module textKey/variant mapping. Legacy88 page text and symbolic expressions alone remain insufficient.
- Preserve all original outputs and existing evidence. Current runtime ports18102/13306/6380/19000 are listening; fresh authenticated preflight is required before governed writes.

## Source parser checkpoint — 2026-09-28 08:02 CST

- The six captured tables use 18 or 19 columns, with optional sentry capacity or movement speed. Fixed offsets had treated defense as sentry capacity and maximum mana as melee speed. The parser now expands declared rowspan/colspan headers, rejects inconsistent columns, preserves zero defense and selects identity from the item column. See git for code-level diff details.
- The source itself contains a second Mining Helmet link in its legs table, next to a Mining Pants image and defense1. This remains an unresolved source identity conflict; an image filename alone cannot authorize correction. Existing independent English item-page evidence was found at `/home/lolben/data/terraPedia/raw/wiki/item-pages/miningpants.latest.json`, but it lacks revision-ID binding and is diagnostic only.
- Optional raw/identity sidecars preserve complete HTML and wikitext with file hashes and no overwrite. The fetcher binds a queried page/revision ID to the subsequent oldid parse. Shared page consumers retain their default behavior. This pins the top-level page revision, not all template dependencies.
- Self-review caught progress-path overlap overwriting evidence before validation. Two fresh RED cases reproduced the overwrite; validation now runs before the first progress write. No live evidence used overlapping paths.
- Validation: Node22 `--test pipelines/fetch/fetch-wiki-armor-attributes.test.mjs pipelines/lib/wiki-item-utils.test.mjs pipelines/workflow/backend-refresh-runtime-state.test.mjs`:49/49, zero failures; both changed runtime modules pass `--check`; `git diff --check` passes. Logs: `.local/logs/armor-source-checkpoint-green.log`, `.local/logs/armor-path-overlap-red.log`; earlier parser/revision RED evidence remains in `.local/logs/armor-*-red.log`.
- Live collection `.a63-20260928-02` (PID315572, tool session18545) started07:55 CST with canonical monitor heartbeat. Wiki returned403 on the attribute parse; shared request gate entered cooldown until08:16:08 CST. Do not clear cooldown or start a duplicate writer. `.01` is diagnostic, not final revision-bound authority. Outputs remain under `.local/tmp/a63-20260928-02`; progress is `reports/backend-refresh/history/armor-attributes.a63-20260928-02/source-status.json`.
- Fresh07:55 CST preflight recorded disabled scheduler, attempts/claims0/0, healthy reconciler, fences0 and unchanged UUID/H8/epoch in `.local/tmp/armor-source-preflight-20260928-02.json`. This checkpoint performed no database/Redis repair or governed publication.
- Commit scope is the completed parser/capture repair and its tests. Entry remains active for the independent source identity resolution, source/effect semantic coverage, fresh proposal/executor review and governed DB/API validation. Buff/Shimmer and full automation are not accepted yet.
