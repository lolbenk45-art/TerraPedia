# Buff bounded landing contract

## Status

`closed`

## Scope and handoff

- Owner: Buff domain branch `feat/automation-domain-buff`, worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`.
- Parent/coordinator: `2026-09-29-automation-domain-worktree-matrix.md` on `feat/automation-scheduler-continuation`.
- Goal: establish the smallest safe Buff landing mutation needed before the existing maint → relation/projection envelope can consume a real landing ID.
- Changed paths: `pipelines/landing/buff-bounded-landing-mutation.mjs` and its focused test. No database, Redis, DDL, scheduler, decision, or packet write occurred.

## Result

- RED test first failed because the bounded landing module did not exist.
- GREEN implementation now enforces `buff-landing-mutation/v1`, fresh `canonical.buff-page-immunity.<run>` namespace, bare landing payload hash, exact module/page revision bindings, unique Buff identities, and per-page revision evidence.
- Apply requires an active transaction and held ownership fence, locks the exact namespace, rejects any existing row, performs one insert-only write, and reads back the real landing ID. It exposes no schema preparation, retirement, update, or delete path.
- Follow-up: bind this landing plan and returned ID into `run-buff-canonical-ingestion.mjs`, rederive the maint plan under locked rows, and only then regenerate fresh evidence/packet/decision identities.

## Validation

- `node --test pipelines/landing/buff-bounded-landing-mutation.test.mjs` — 4/4 passed.
- Combined Buff landing/full-chain/transaction/runner regression — 53/53 passed.
- `node --check pipelines/landing/buff-bounded-landing-mutation.mjs` — passed.
- `git diff --check` — passed.
- Commit SHA: `commit SHA pending in final response`.

## Residual risks

- Source applicability remains blocked: 370 Buff pages in the retained `.03` source are unknown and `.06` was diagnostic-only.
- The full-chain runner still requires integration of the new landing plan and cannot execute from this contract alone.
