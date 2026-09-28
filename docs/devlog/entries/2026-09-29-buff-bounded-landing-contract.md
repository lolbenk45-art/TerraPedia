# Buff bounded landing contract

## Status

`closed`

## Scope and handoff

- Owner: Buff domain branch `feat/automation-domain-buff`, worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-buff`.
- Parent/coordinator: `2026-09-29-automation-domain-worktree-matrix.md` on `feat/automation-scheduler-continuation`.
- Goal: establish the smallest safe Buff landing mutation needed before the existing maint → relation/projection envelope can consume a real landing ID.
- Changed paths: Buff landing contract, deferred maint binding, full-chain envelope, runner, and focused regression tests. No database, Redis, DDL, scheduler, decision, or packet write occurred.

## Result

- RED test first failed because the bounded landing module did not exist.
- GREEN implementation now enforces `buff-landing-mutation/v1`, fresh `canonical.buff-page-immunity.<run>` namespace, bare landing payload hash, exact module/page revision bindings, unique Buff identities, and per-page revision evidence.
- Apply requires an active transaction and held ownership fence, locks the exact namespace, rejects any existing row, performs one insert-only write, and reads back the real landing ID. It exposes no schema preparation, retirement, update, or delete path.
- Follow-up: bind this landing plan and returned ID into `run-buff-canonical-ingestion.mjs`, rederive the maint plan under locked rows, and only then regenerate fresh evidence/packet/decision identities.

## Deferred-ID integration checkpoint

- The maint planner now supports an explicit deferred landing ID for Buff only; `bindBuffMaintMutationPlanToLanding` materializes the real insert ID and promotes any affected `landing_source_id` change without changing source key/hash identity.
- The full-chain envelope can carry a validated insert-only landing plan with no fabricated landing ID. The runner locks existing maint baselines, inserts and reads back the new landing inside the transaction, binds that ID, and then applies maint before relation/projection mutation.
- Existing persisted landing paths remain unchanged and still require their frozen IDs. A deferred envelope without a landing plan fails closed.

## Validation

- `node --test pipelines/landing/buff-bounded-landing-mutation.test.mjs` — 4/4 passed.
- Combined Buff landing/full-chain/transaction/runner regression — 53/53 passed.
- `node --check pipelines/landing/buff-bounded-landing-mutation.mjs` — passed.
- `git diff --check` — passed.
- Combined Buff landing/full-chain/transaction/runner regression — 59/59 passed.

## Residual risks

- Source applicability remains blocked: 370 Buff pages in the retained `.03` source are unknown and `.06` was diagnostic-only.
- The code path is integrated, but execution remains blocked until a fresh source reaches zero unknown applicability facts and a new packet/permit/fence is generated.

## Closeout

- Result: deferred landing ID binding is integrated through landing → maint → relation/projection runner ordering; no runtime publication was attempted.
- Follow-up owner: coordinator reopens the Buff child after admissible source evidence exists and regenerates the fresh candidate/envelope/packet.
- Commit SHA: `commit SHA pending in final response`.
