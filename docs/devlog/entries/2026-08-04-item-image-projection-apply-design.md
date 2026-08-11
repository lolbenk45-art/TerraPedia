# Devlog: item-image-projection-apply-design

## Status

`closed`

## Context

- User goal: Continue the remaining automated-ingestion closure work and ask
  for authorization at each exact operation boundary.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Base: `d76ca873`
- Related docs:
  `docs/superpowers/specs/2026-08-04-item-image-projection-apply-design.md`
- Related prior entries:
  `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

## Direction / Decisions

- Chosen approach: a new `canonical-item-image-projection-apply` operation
  owns only existing active `projection_items.image` values and sources them
  only from canonical `relation_item_images.cached_url` rows.
- Reasoning: the completed four-layer lineage packet is immutable and the
  general relation sync owns a much broader write surface.
- Rejected options: widening the consumed four-layer operation or using a full
  relation/projection rebuild.

## Scope

- Frontend: none.
- Backend: none.
- Data: design only; no database, crawler, network, MinIO, or runtime action.
- Docs/process: one approved design spec and this devlog child entry.
- Out of scope: implementation, real proposal, input contract, request, packet,
  permit, formal apply, source flip, Shimmer, L1/L2, scheduler, service lifecycle,
  push, merge, or cleanup.

## Validation

- Commands run: scoped `git diff --check`, placeholder scan, and targeted
  operation/ownership/authorization consistency validation.
- Results: whitespace check passed; placeholder scan returned no matches; the
  corrected contract scan passed every required operation, source, scope,
  rollback, and authorization assertion.
- Not run: code tests and runtime/data checks; this checkpoint changes docs only.

## Result

- Completed: user approved the operation boundary, architecture, data flow,
  failure semantics, and test design.
- Not completed: implementation and every authorization-gated runtime step.

## Residual Risks

- The implementation plan must prove that generic relation sync cannot restore
  the local-image reverse bridge for `projection_items.image`.
- The shared database can drift before a future proposal or apply; every real
  artifact must bind current bytes and target fingerprints.
- Existing unrelated dirty worktree changes remain unstaged and unmodified.

## Follow-up

- Owner: Codex. After user review of the committed spec, write and audit a
  focused implementation plan, then implement through TDD without real data
  operations. Stop at each exact authorization checkpoint.

## Commits

- `commit SHA pending in final response`.
