# Devlog: Front P2 WP-12 breakpoint convergence

## Status

`closed`

## Context

- Branch: `feat/front-p2-wp12-breakpoints`
- Worktree: `.claude/worktrees/front-p2-wp12-breakpoints`
- Base: `feat/front-p2-wp11-catalog` at `44b78477` (WP-11.4 closed).
- Spec: `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md` WP-12.
- Plan: `docs/superpowers/plans/2026-07-21-front-wp12-breakpoint-convergence.md`.

## Direction / Decisions

- Survey limited to `@media` width queries (not component max-width layout props).
- Only merge under ≤24px: `1020 → 1024` (one crafting.css rule). All other
  media widths kept, including force-leave examples and independent minors.
- Complements `721`/`861` kept as pairs; independent `min-width: 960` kept.
- Whitelist contract freezes post-merge max set
  `{430,520,640,720,760,780,820,860,900,980,1024,1080,1180}` and allowed mins
  `{N+1} ∪ {960}`.

## Scope

- Frontend: one media query value, crafting contract marker, new whitelist
  contract, package.json check wiring, docs.
- Out of scope: WP-13/14, push, merge, visual redesign.

## Validation

- Baseline `pnpm run check` green at plan open.
- RED: breakpoint whitelist exit 1 on residual 1020; crafting structure exit 1
  on 1024 marker before CSS merge.
- GREEN: `1020→1024` applied; whitelist + crafting + full `pnpm run check` exit 0.
- Residual media 1020: none. Stack front smoke on 15177: routes reachable
  (integration stack, not candidate-specific).

## Result

- Completed: drift merge of the only ≤24px pair; whitelist contract in main
  check chain; post-merge survey frozen as above.
- Deferred: local integration into `feat/front-p2-integration`.

## Residual Risks

- Many component `max-width` layout props remain ungoverned (intentionally
  outside @media whitelist).
- Force-leave media values (760/780/820/900/1080) still present for later review.
- Crafting sidebar unsticks at 1024 instead of 1020 (approved ≤24px shift).

## Follow-up

- WP-13 long-page governance next.
- Local integration still pending for WP-11.2..WP-12.

## State Changes

### 2026-07-21 (opening)

- Plan + baseline survey recorded; only 1020/1024 qualifies for merge.

### 2026-07-21 (close)

- Merge + whitelist contract shipped; full gate green.

## Commits

- `a6164f0b` docs(front): plan wp12 breakpoint convergence
- `1ca4a455` test(front): lock breakpoint whitelist and 1024 merge marker
- `b6f00d6e` feat(front): merge media max-width 1020 into 1024
- docs-close: this commit
