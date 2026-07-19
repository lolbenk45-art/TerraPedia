# Devlog: Front P2 WP-11.2 default layout

## Status

`active`

## Context

- User goal: continue all remaining Front P2 work through a local integration
  branch, starting with WP-11.2, without push or merge to `main`.
- Branch: `feat/front-p2-wp11-layout`
- Worktree: `.claude/worktrees/front-p2-wp11-layout`
- Base: `feat/front-p2-wp11-tokens-preview` at `257bde19`.
- Related docs:
  `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md` and
  `docs/plans/2026-07-17_front-pages-remediation-p0-p2-plan.md`.
- Related prior entry:
  `docs/devlog/entries/2026-07-19-front-wp11-token-alias.md`.

## Direction / Decisions

- Chosen approach: establish a Nuxt default layout as the sole public shell
  owner and move the home footer statistic through shared Nuxt state.
- Reasoning: this removes 35 copied shells while preserving page content and
  gives later WP-14 data-truthfulness work one footer boundary.
- Rejected options: keeping page-local shells, using a hard-coded footer
  fallback, and implementing remaining P2 work in one branch.

## Scope

- Frontend: default layout, public page and error shells, home-to-footer state
  channel, synchronized source contracts, and visual/runtime evidence.
- Backend: none.
- Data: no writes.
- Docs/process: WP-11.2 implementation plan, this entry, and current handoff.
- Out of scope: WP-11.3 onward, visual redesign, push, merge to `main`, and
  worktree cleanup.

## Validation

- Commands run: baseline public-page/full frontend gates, 18-record theme
  parity capture, 52-record default-layout runtime capture, and intentional
  RED public-shell ownership contract.
- Results: 25-route public contract and `pnpm run check` passed; both captures
  passed against the WP-11.1 preview at `5181`; RED exited `1` because
  `layouts/default.vue` is absent, while the new runtime harness syntax passed.
- Not run: candidate GREEN/runtime comparison; production implementation has
  not started.

## Result

- Completed: approved remaining-P2 design recorded; isolated WP-11.2 branch
  and worktree established.
- Not completed: implementation plan, RED contract, layout migration, runtime
  evidence, review, and local integration.

## Residual Risks

- The existing source contract asserts page-local nav/footer markers and must
  change atomically with the layout migration.
- The home footer count currently travels as a page-local prop and requires an
  SSR-safe shared-state contract.
- The new worktree does not yet have frontend dependencies installed.
- Known non-failing baseline warnings: UPower/GPU browser messages, Node
  module registration deprecation, and duplicate `formatEffectValue` import.

## Follow-up

- Execute the audited
  `docs/superpowers/plans/2026-07-19-front-wp11-default-layout.md` inline and
  keep WP-11.3 blocked until WP-11.2 is locally validated and integrated.

## State Changes

### 2026-07-19 22:10 CST

- Change: user-approved review repairs remove the proposed V55 SQL seed,
  replace forced four-breakpoint convergence with bounded drift merge plus a
  frozen surviving whitelist, and lock the final matrix to 25 required routes,
  numeric-category HTTP 301 redirects, and three WP-14 commits.
- Reason: repository contracts already make the admin article API the home
  article source of truth; wide breakpoint moves would redesign responsive
  behavior; and the public-page contract is authoritative for route count.
- Evidence: revised
  `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md` and the two
  existing SQL-seed guard scripts.

### 2026-07-19 22:35 CST

- Change: WP-11.2 implementation is decomposed into RED shell ownership,
  layout/state foundation, exact 34-page plus error migration, runtime parity,
  and review/closeout tasks.
- Reason: the homepage footer is nested inside the old home lower region,
  five pages carry dynamic busy state on the removed root, and `error.vue`
  bypasses normal page-layout activation; each needs an explicit contract.
- Evidence:
  `docs/superpowers/plans/2026-07-19-front-wp11-default-layout.md`.

### 2026-07-19 23:05 CST

- Change: plan audit repaired page-meta typing, five busy-state ownership
  contracts, non-home footer wrapper transparency, error-layout completeness,
  evidence preservation, and a 52-record runtime geometry harness.
- Reason: source-only shell assertions could pass while page metadata failed
  typecheck, busy semantics disappeared, ordinary footer geometry changed, or
  the unavoidable home Footer DOM move exceeded the approved geometry
  boundary.
- Evidence: no Critical or Important plan defect remains; the execution-ready
  smoke is the 25-route plus missing-route runtime matrix at two viewports, and
  final validation combines focused contracts, full frontend check, 18-record
  theme parity, runtime geometry comparison, and live/fallback footer probes.

### 2026-07-19 23:20 CST

- Change: Task 0 baseline and Task 1 RED ownership contract are complete.
- Reason: TDD requires the old page-local shell to fail the new single-layout
  ownership contract before any layout or page implementation is written.
- Evidence: 25-route/full frontend gates green; 18 theme-parity records and 52
  runtime records captured from `5181`; public-page RED exits on the missing
  default layout and the runtime harness passes syntax validation.

## Commits

- Pending.
