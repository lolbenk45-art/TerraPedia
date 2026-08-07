# Recipe Formal Read-Only Verification

## Status

`active`

## Goal

Repair the formal Recipe evidence chain by verifying the completed 2026-07-29
apply against current input bytes and current formal database state, without
reapplying any Recipe data.

## Scope

- Add a read-only verifier and durable canonical verification report.
- Bind the 3,663-row input, embedded applied pipeline result, and current
  `wiki_zh` formal projection.
- Detect the overwritten two-row standalone report and harden Recipe source
  readiness against it.
- No Wiki fetch, Recipe apply/backfill/consolidation, scheduler, crawler, V1
  queue, release, push, merge, or worktree cleanup.

## Current State

- Formal apply `canonical-recipe-apply-20260729-03` completed on 2026-07-29.
- The historical pipeline summary embeds the valid applied 3,663-row result.
- The standalone import report was later overwritten by an `apply=false`
  temporary two-row sample.
- Existing Recipe source readiness checks that standalone artifact only for
  presence and can therefore pass malformed evidence.
- Design:
  `docs/superpowers/specs/2026-08-08-recipe-formal-verification-design.md`.
- Implementation plan:
  `docs/superpowers/plans/2026-08-08-recipe-formal-verification-implementation.md`.

## Success Criteria

- Fresh canonical report passes only when input hash/count, embedded applied
  result, formal `wiki_zh` projection hash/counts, and zero unresolved rows
  match.
- The overwritten standalone report is explicitly rejected as authority.
- Recipe source readiness requires and semantically validates the canonical
  report.
- Focused tests, live read-only verification, readiness rerun, and
  `git diff --check` pass.

## Residual Risk

The verification freezes the existing 2026-07-29 formal state. Any future
Recipe input refresh requires a separate plan and write authorization.
