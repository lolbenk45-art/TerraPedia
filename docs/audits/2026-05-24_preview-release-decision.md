# Preview Release Decision - 2026-05-24

## Decision

- Status: `release-decision-ready`
- Reason: The closeout loop has durable Domain A-grade evidence with no generated blockers, Front Nuxt visual smoke passes, and the local stack preview smoke passes from the updated main-derived worktree.

This status means the project has enough committed evidence to make a release or staging decision. It does not mean the project has been externally released, pushed to `origin/main`, or promoted to final A-grade release readiness beyond the recorded warning policy.

## Evidence

- Domain A-grade: `docs/audits/2026-05-24_domain-a-grade-final-closeout.md`
  - Freshness: `pass`
  - A-grade: `warning`
  - `generatedBlockedCount=0`
  - `generatedWarningCount=18`
  - `freshCount=45`, `staleCount=0`, `missingCount=0`, `unknownCount=0`
- Front Nuxt visual: `docs/audits/2026-05-24_front-nuxt-preview-final-smoke.md`
  - Public route check: `24` Nuxt routes passed.
  - Visual gate: `failureCount=0`, `warningCount=0`, `screenshotCount=0`.
  - Typecheck: passed with only the known Node `DEP0205` tooling warning.
- Local stack smoke: `docs/audits/2026-05-24_local-stack-preview-closeout-smoke.md`
  - Backend `18088`, admin `3001`, front `5174`, Redis `6380`, and MinIO public `9000` were reachable.
  - Runtime process roots pointed at the Task 6 main-derived worktree, not the primary checkout or a stale task worktree.
  - Admin login returned a token; crawler monitor unauthenticated route redirected to login as expected.
  - Public route smoke returned `200` for `13/13` routes.
  - Built-in local smoke report `reports/local-start/smoke-20260524-141643.json`: `passed=9`, `failed=0`.

## Remaining Blockers

- No generated Domain A-grade blockers remain in the final closeout evidence.
- No Front Nuxt visual or local stack smoke blockers remain in the closeout evidence.
- Remaining work is warning debt and release management, not a blocker to the decision record:
  - Boss image readiness still warns because relation/projection rows are not contract-ready.
  - Projectile image/relation readiness still has optional zh-image backfill evidence warnings.
  - Several unresolved audit trend panels still lack historical baselines.
  - Local `main` is ahead of `origin/main`; pushing or PR workflow is a separate operator decision.

## Next Branches

- `fix/boss-image-relation-projection-readiness-2026-05-24`: repair or explicitly accept Boss image relation/projection warning debt.
- `fix/projectile-zh-image-backfill-readiness-2026-05-24`: decide whether optional projectile zh-image backfill warnings stay accepted or get burned down.
- `plan/public-v0.1-release-or-staging-2026-05-24`: choose push/staging/release handling for local `main`.
- `fix/npc-zh-name-coverage-gate-2026-05-24`: add the previously identified NPC zh-name DB/API coverage guard.

## User-Facing Statement

V0.1 public preview is ready for a release or staging decision based on the committed closeout evidence. It should still be described as a preview unless the operator separately approves the push/staging/release path and accepts the documented warning debt.

Current warning debt includes 18 A-grade warning panels, including Boss image relation/projection readiness and optional Projectile zh-image backfill evidence.
