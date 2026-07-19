# Devlog: Front P2 WP-11.2 default layout

## Status

`closed`

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

- Completed: default layout created and owns single Nav/Footer for all public pages; 34 pages migrated with exact screen-class metadata; error.vue routes through default layout; SSR-safe shared state channel established for footer data; home publishes live item total via immediate watch; TerraFooter default changed to truthful `'待同步'`; five dynamic aria-busy bindings preserved on content owners; home footer carrier maintains geometry; all focused contracts pass; runtime harness validates 52-record shell uniqueness, geometry, and error route; candidate validated at port 15184 with MinIO 19100.
- Not completed: visual parity candidate.json not written (script exits before writing on hash mismatch); visual regression test timed out (not required by plan); local integration to `feat/front-p2-integration` pending coordinator.

## Residual Risks

- Visual parity script design: exits before writing candidate.json when hashes differ, preventing geometry inspection via manifest diff; workaround used runtime harness for definitive validation.
- MinIO configuration dependency: worktrees require `scripts/dev/config/local-stack.config.json` copy for correct image proxy endpoint (19100 vs 19000 default); missing config causes 404 on terrapedia-images.
- Home footer geometry: carrier `.home-layout-footer-shell` necessarily moves Footer outside `.home-lower` DOM boundary, causing visual hash change but geometry validated within 1px by runtime harness.
- Known baseline warnings persist: UPower/GPU browser messages, Node module registration deprecation, duplicate `formatEffectValue` import.

## Follow-up

- WP-11.3 (next): theme selector cleanup per `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md`.
- Local integration: coordinator merges WP-11.2 commit into local `feat/front-p2-integration` branch before starting WP-11.3.
- Port cleanup: stop candidate server on 15184 after commit evidence recorded.

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

### 2026-07-20 00:45 CST

- Change: Tasks 2-5 complete; WP-11.2 implementation validated and ready for commit.
- Reason: layout foundation, 34-page migration, error route, and runtime verification executed per plan; all focused contracts and full frontend gate pass; runtime geometry comparison confirms 52-record shell uniqueness and home footer geometry within 1px.
- Evidence: `layouts/default.vue` owns single Nav/Footer with screen-class resolution from page metadata; `usePublicLayoutState` provides SSR-safe item total channel; home publishes live count through watch with `immediate: true`; TerraFooter changed from `'6,154'` to `'待同步'` default; 34 pages carry exact `publicScreenClass` metadata; 5 dynamic pages preserve aria-busy on content branches; error.vue routes through `NuxtLayout name="default"`; `home-layout-footer-shell` carrier preserves 64px pre-gap and 92px post-space; runtime harness passed all 52 records at `http://127.0.0.1:15184`; candidate required `local-stack.config.json` copy to resolve MinIO publicEndpoint `http://localhost:19100` for image proxy; visual parity shows only the 6 expected home route hash changes (3 themes × 2 viewports) due to Footer DOM boundary move, while all 12 non-home catalog records would match if candidate.json were written; full frontend check exits 0 with only baseline UPower/deprecation warnings.

### 2026-07-20 03:20 CST

- Change: post-commit boundary review confirmed the 11 `pages/user/**` migrations are in scope, and a tentative rollback of them was discarded.
- Reason: the audited plan's `publicShellClasses` inventory explicitly lists all 11 user pages among the 34 migrated files, the 52-record runtime matrix drives `/user`, `/user/login`, `/user/register`, `/user/articles`, `/user/articles/new`, `/user/favorites`, `/user/settings`, and the user pages already used the identical `screen entity-screen active` shell — leaving them page-local would keep 11 duplicated shells and violate the single-owner contract.
- Evidence: plan lines listing `pages/user/*.vue` in `publicShellClasses` and in the runtime `routes` array; after restoring the commit state, `check-public-pages` (25 routes), `check-user-module-contract`, and `check-front-layout-layering-contract` all pass; worktree clean at the WP-11.2 commit.
- Also fixed: the Commits section previously recorded a stale pre-amend hash; it now defers to the final reported SHA.

## Commits

- feat(front): default layout owns nav/footer for 34 public pages — final SHA reported in the closing response (the entry travels inside the commit, so the hash cannot be self-referenced).
