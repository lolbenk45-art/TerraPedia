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

- Commands run: baseline public-page contract from `front-nuxt`.
- Results: passed for 25 Nuxt routes on base `257bde19`.
- Not run: dependency-backed full frontend check and runtime capture; these
  belong to implementation after the plan is approved.

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

## Follow-up

- User reviews the written design, then the coordinator writes and audits the
  WP-11.2 implementation plan before any production edit.

## Commits

- Pending.
