# Devlog: Front P2 WP-11.4 catalog stylesheet promotion

## Status

`in_progress`

## Context

- User goal: continue Front P2; WP-11.4 promotes catalog-image-fixes into domains.
- Branch: `feat/front-p2-wp11-catalog`
- Worktree: `.claude/worktrees/front-p2-wp11-catalog`
- Base: `feat/front-p2-wp11-theme-cleanup` at `dfa5cfae` (WP-11.3 closed).
- Related docs:
  `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md` and
  `docs/superpowers/plans/2026-07-21-front-wp11-catalog-promotion.md`.
- Related prior entry:
  `docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md`.

## Direction / Decisions

- Chosen approach: byte-copy the patch into `domains/catalog.css`, load it from
  `domains/index.css`, drop the app.css import and the patch file, retarget
  contracts RED-first, prove pixel equivalence with theme-token parity.
- Rejected options: leaving a forwarding `@import` in the retired patch path
  (spec forbids), and hand-rewriting selectors during the move (ownership-only).

## Scope

- Frontend: catalog CSS ownership, import graph, contracts, ratchet, parity.
- Backend: none. Data: no writes.
- Out of scope: WP-12 onward, visual redesign, push, merge.

## Validation

- (filled at close)

## Result

- (filled at close)

## Residual Risks

- (filled at close)

## Follow-up

- WP-12 (next): breakpoint convergence per the P2 remaining design.
- Local integration: coordinator merges WP-11.2 + WP-11.3 + WP-11.4 into
  `feat/front-p2-integration` before user acceptance.

## State Changes

### 2026-07-21 (opening)

- Change: WP-11.4 plan checkpoint; baselines green at `dfa5cfae`; 18-record
  parity baseline captured on candidate port 15186 / backend 18091.
- Evidence: this plan file.
- Note: `check-loading-skeleton-contract.mjs` is outside `pnpm run check` and
  already fails on armor-detail markers living in `DetailArmorSetSkeleton.vue`;
  this package only retargets its catalog CSS path and does not require that
  script's full exit 0.

## Commits

- (filled at close)
