# Recipe Formal Read-Only Verification

## Status

`closed`

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
- The first read-only run failed closed because the current formal projection
  hash did not equal the import-stage target. Root-cause inspection proved the
  applied display-name backfill subsequently changed hash-covered ingredient
  and station raw-name fields. No database write occurred.
- The repaired contract preserves import-stage hash
  `b14dc414734cd3cac11f364039482eaa89594bae8277bfcae787955b0bdd2ee3`,
  verifies applied backfill `124/239` with zero remaining gaps, and freezes the
  final post-backfill formal hash
  `582c4152aa4fe770bce41c431420230e82586d8322424edf877387e184ecf20e`.
- Final retained evidence is
  `reports/canonical-migration/canonical-recipe-formal-verification.json` with
  `status=passed`, `mode=read-only`, `writesAttempted=false`, and standalone
  classification `superseded-invalid`.
- Formal readback: 11,658 recipes, 19,601 ingredients, 15,195 stations; the
  `wiki_zh` scope is 3,571 recipes, 5,965 ingredients, and 4,337 stations with
  zero unresolved item/station rows. Provider consolidation readback is 11,658
  non-deleted recipes, 3,775 active recipes, and 3,191/3,191 total/active
  result items.
- Recipe source readiness and blocking readiness both pass with zero warnings.
- Independent process readback found no Recipe verifier/import/backfill/
  consolidation, crawler, or scheduler process. The verifier connection left
  zero active transactions.

## Success Criteria

- Fresh canonical report passes only when input hash/count, embedded applied
  result, formal `wiki_zh` projection hash/counts, and zero unresolved rows
  match.
- The overwritten standalone report is explicitly rejected as authority.
- Recipe source readiness requires and semantically validates the canonical
  report.
- Focused tests, live read-only verification, readiness rerun, and
  `git diff --check` pass.

## Validation

- Focused Recipe/readiness suite: 82/82 passed.
- Live verifier: passed with current input hash
  `3503bdd42c623d8ec919aa3d4bc3c8e77d217f4cacb85a5bfd9d4c869752aefc`.
- Recipe source readiness: pass, 3/3 checks.
- Recipe blocking readiness: pass, 3/3 checks.
- `git diff --check`: passed.
- Read-only review repaired CTE mutation admission and stale artifact-byte
  acceptance; no Critical or Important findings remain.

## Residual Risk

The verification freezes the existing 2026-07-29 formal state. Any future
Recipe input refresh requires a separate plan and write authorization.

## Follow-Up

Formal Recipe state is closed without replaying the apply. Scheduler design or
activation remains a separate task; this verification grants no daemon or
crawler authority.

Commit SHA pending in final response.
