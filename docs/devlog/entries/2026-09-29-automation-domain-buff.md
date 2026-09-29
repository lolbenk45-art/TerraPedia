# Buff automation domain continuation

## Status

`blocked`

## Scope

This isolated Buff branch closes the code-level deferred landing identity gap
without performing database, Redis, crawler, import, permit, packet, decision,
DDL, `local.items`, or scheduler writes. The source applicability gate remains
closed while retained evidence contains unresolved immunity applicability facts.

## Code contract repaired

- `applyBuffUpstreamMutations` now binds the real insert-only landing ID and
  landing trace fields into relation, item-relation, NPC-relation, and image
  candidate rows. Projection rows retain their relation identity through
  `relation_record_key` and do not receive an invented landing column.
- Deferred trace conflicts fail closed. Rows moved from `unchanged` to a trace
  update carry `landing_source_id` in `changedColumns`; expected after-sets are
  rebuilt from the bound mutation.
- The transaction executor forwards the upstream bound envelope to mutation
  and after-set callbacks. The governed runner callbacks now consume that
  callback envelope instead of closing over the pre-binding envelope.
- Deferred envelopes remain non-executable and are still rejected before
  `BEGIN`; manifest pinning, locked full rederivation, fence acquisition,
  uncertain-commit recovery, and runtime applicability remain follow-up gates.

## Validation

- `node --test pipelines/relation/buff-canonical-transaction-executor.test.mjs pipelines/relation/run-buff-canonical-ingestion.test.mjs` — 36/36 passed.
- `node --check pipelines/relation/run-buff-canonical-ingestion.mjs` — passed.
- `git diff --check` — passed.

No runtime write was attempted.

## Commit

`2a86f143` (`fix(buff): propagate deferred landing identity`)

## Governance contract checkpoint

Added a Buff-local, pure governance contract for exact fence/owner/server
readback, execution-manifest pin equality, locked rederivation hash equality,
and immutable recovery-journal record construction. The runner now delegates
its existing `FOR UPDATE` fence readback checks to the exact fence contract.
These helpers do not write a journal or activate execution; durable journal
persistence, packet/envelope manifest wiring, and full locked rederivation
remain runtime gates for the coordinator.

## Recovery journal checkpoint — 2026-09-29

- Added a private, hash-chained Buff recovery journal store and adapter. The governed runner now reserves a result label together with a journal path, binds both paths through the execution manifest, persists `PREPARED` before permit consumption, records `ROLLED_BACK` on pre-commit failure, records `COMMIT_UNKNOWN` without issuing a blind rollback when commit acknowledgement is lost, and records `COMMITTED` after a successful commit.
- The transaction executor accepts the optional journal callbacks while retaining fail-closed behavior when no journal is supplied. Journal writes are atomic, private, repository-confined, no-overwrite artifacts.
- Validation: the combined Buff landing/full-chain/transaction/recovery/runner plus manifest/authorization suite passes `197/197`; Node syntax checks and `git diff --check` pass. No database, Redis, permit, packet, scheduler, crawler, or import write was executed.
- Source applicability remains blocked: latest retained classification has `139` unknown facts and the diagnostic retry promoted none to `not_applicable`; no fresh packet or runtime Buff write is authorized.
