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
