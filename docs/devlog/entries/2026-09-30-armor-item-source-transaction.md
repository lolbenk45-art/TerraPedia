# Armor item-source transaction and registered runner

## Status

`closed` — bounded implementation and read-only preparation; commit SHA pending in final response. Overall Armor ingestion remains active in the parent.

## Scope and ownership

- Owner: Armor agent, branch `feat/automation-domain-armor`, worktree `.worktrees/automation-domain-armor`.
- Parent: `2026-09-28-armor-source-semantics-continuation.md`; previous upstream checkpoint `78e87df2` / `82dec122` is committed.
- User authorized continued executor integration. Reused this child entry for the transaction library, separate registered runner, exact authorization data binding and read-only preparation. Coordinator alone owns `docs/devlog/current.md`; it remains unchanged.
- Only the three source partitions are owned: local/maint `source_dataset_landings.armor_item_effects_raw` and maint `maint_armor_attribute_rows.item_effect_sources`. New business writes are inserts only within the exact provider/content-source namespace. No relation/projection, local.items, DDL, Redis/control, scheduler/H8, service restart or historical worktree cleanup.

## Result

- Added `armor-item-effect-source-transaction.mjs`: exact raw-source proposal rederivation, locked baselines, engine/packet checks, awaited permit consumption after durable PREPARED, generated-ID/readback binding, idempotent partial/exact replay and explicit uncertain-commit/rollback outcomes.
- Added `run-armor-item-effect-source.mjs`: registered operation `canonical-armor-item-effect-source`, private proposal/code/data binding, exact server/Owner/policy/clock/fence checks, fresh immutable result paths, one-use permit/ledger integration and teardown uncertainty. Read-only preparation is an exported function; the CLI accepts only exact operation/result-label/apply arguments and requires a governed packet.
- The existing generic maint converter continues to reject sparse typed effect sources. Registration does not establish full coverage or allow silently omitting those rows. No real operation apply, packet, permit or business DML occurred.
- Current spec updated narrowly for this separate operation. The parent plan has a checkpoint and explicit next gates. Durable evidence and review: `docs/audits/2026-09-30-armor-item-source-execution-contract.md`.

## Runtime and review findings

- Authenticated preflight succeeded in 16,990ms at `2026-09-29T16:10:02.550Z` using a 55-second timeout: control disabled, changed-only, liveAttempts=0, sweepClaims=0, reconciler healthy, zero overdue/failures. The earlier 10-second timeout was not an unhealthy-service diagnosis.
- Read-only MySQL inspection confirmed the expected UUID, 64MiB max_allowed_packet, all three targets InnoDB and namespace counts 0/0/0. No leftover Armor collector or writer was found.
- **Resolved material finding:** first preparation's source-key-only landing SELECT scanned the PRIMARY index for more than 100 seconds. Cancelled only this session's SELECT, rolled back/closed it, added a RED regression and the exact provider predicate. Live EXPLAIN now uses `idx_source_dataset_landings_provider_source_key` with estimated 1 row on both databases, instead of PRIMARY scans over estimated 10,082/6,194 rows. No DDL needed.
- Corrected preparation completed in 1,681ms at `2026-09-29T16:32:57.759Z`, with actual baseline 0/0/0 and proposed inserts 1/1/3. Immutable proposal archived unchanged at `.local/tmp/armor-item-source-20260930-01.proposal.json`; logical SHA `sha256:b469266370627eda6ba8de6f6f069543d9b39dd232ffffb82dc4eb20f3505616`. Archive receipt records the original registered path and file hash. No PREPARED/result artifact exists for this rehearsal.
- Review: current-model serial spec/quality review, consistent with coordinator mode. Resolver binding, manifest ownership, SQL scope, source rederivation, rollback/commit uncertainty and retained-evidence behavior reviewed. The index finding is fixed and reverified; no unresolved material implementation finding. Shared count assertions updated to 126 catalog / 124 executable operations.

## Validation

- RED evidence: transaction missing module, missing registration, missing runner/preparation exports, and missing indexed provider predicate were reproduced before implementation.
- Final affected regression: **450/450 passed**, exit 0, `.local/logs/armor-item-source-regression-final.log`. Covers shared manifest/authorization/permit/executor, Armor registration, source/upstream, core transaction, real packet/permit runner integration with simulated SQL, legacy producer and independent/secondary projection.
- Negative cases include changed proposal bytes, wrong labels/server, retained evidence, active fences, asynchronous permit rejection, wrong engine/packet size, collation aliases, receipt/ID drift, rollback failure, lost commit acknowledgement and teardown/readback failure. Partial and exact replay are covered.
- Live verification is read-only preparation and EXPLAIN, not an actual SQL commit. New private evidence is retained in `.local/tmp/`; generated raw payloads are not committed.
- `git diff --check` and staged whitespace/scope/path checks are required immediately before this commit; their final result is reported with the SHA.

## Follow-up and residual limits

1. Armor owner: implement explicit typed maint-to-relation dispatch with independent source/lineage validation; preserve generic rejection until it is safely integrated.
2. Armor owner: finish compatible-version item/set coverage, Mining identity repair and independent projection acceptance; do not reinterpret old qualified cells as precise current additive bonuses.
3. Armor/coordinator: integrate reviewed contracts, refresh runtime/baselines, prepare new exact packets and publish serially with readback. This archived proposal is a rehearsal, not current authority; no consumed decision may be reused.
4. Armor owner: verify DB/admin/public API conditions and multipliers plus automatic retry/idempotency. Coordinator retains scheduler/H8 activation.

No additional user information, refresh or restart is required for the next implementation step. Parent milestone closure and actual automated ingestion remain open.
