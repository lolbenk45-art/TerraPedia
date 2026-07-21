# Devlog: Front P2 WP-11.4 catalog stylesheet promotion

## Status

`closed`

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

- Chosen approach: byte-move the patch into `domains/catalog.css` (git rename
  100%), load it from `app.css` at the **legacy cascade position** (after
  mobile-typography, before discovery/light-contrast), delete the old path,
  retarget contracts RED-first, prove pixel equivalence with theme-token parity.
- Critical cascade lesson: loading the domain file only via `domains/index.css`
  moves it after tokens/primitives and breaks `/items` pixel parity (6/18
  records). Spec "preserve cascade order" means keep the **load position**, not
  only selector order inside the file. Final design: file ownership under
  `domains/`, cascade ownership still via `app.css` import of
  `./domains/catalog.css`. Contracts forbid a real `@import "./catalog.css"` in
  `domains/index.css` (comment example is allowed).
- Rejected options: leaving a forwarding `@import` in the retired patch path
  (spec forbids); hand-rewriting selectors during the move; double-loading from
  both app.css and domains/index.

## Scope

- Frontend: catalog CSS ownership, import graph, contracts, ratchet, parity.
- Backend: none. Data: no writes.
- Out of scope: WP-12 onward, visual redesign, push, merge.

## Validation

- Baselines at `dfa5cfae`: public-pages / visual-system / preview-images /
  ratchet / `pnpm run check` green; patch 1878 lines present; domain absent.
- 18-record parity baseline captured on candidate `15186` / backend `18091`.
- RED: public-pages exit 1 (retired patch present + domain missing + scan
  missing); visual-system / preview-images exit 1 (domain missing); ratchet
  exit 0 (budget removed); loading-skeleton reports domain missing (plus
  pre-existing armor-detail residuals outside main gate).
- GREEN after promotion + cascade fix: public-pages / visual-system /
  preview-images / ratchet / `pnpm run check` exit 0.
- Runtime: after cascade fix, theme-token parity compare passed **18/18** twice
  consecutively; seven catalog list routes all HTTP 200. One intermittent
  single-record home/dark/desktop flake was observed once and did not reproduce.
- Known residual: `check-loading-skeleton-contract.mjs` still fails on
  armor-detail markers that live in `DetailArmorSetSkeleton.vue` (pre-existing,
  not in `pnpm run check`).

## Result

- Completed: `catalog-image-fixes.css` retired and owned at
  `assets/css/domains/catalog.css`; `app.css` imports `./domains/catalog.css` at
  the legacy position; contracts retargeted and forbid the old path; ratchet
  budget entry removed; 18/18 parity after cascade correction.
- Not completed / deferred: local integration into `feat/front-p2-integration`.

## Residual Risks

- Parity script still exits before writing `candidate.json` on hash mismatch
  (upstream quirk); diagnose from console output.
- Loading catalog only through `domains/index.css` is contract-forbidden for
  cascade reasons; future domain migrations must keep load-position explicit.
- `check-loading-skeleton-contract.mjs` armor-detail residuals remain outside
  the main gate.
- Occasional single-record home screenshot flake possible under load; re-run
  compare before treating as regression.

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

### 2026-07-21 (close)

- Change: promotion complete with cascade-position fix; contracts + full gate
  green; 18/18 parity confirmed twice.
- Evidence: commits below; parity artifacts under
  `front-nuxt/test-results/wp11-catalog-promotion-parity/` (gitignored).

## Commits

- `4dd3579d` docs(front): plan wp11.4 catalog stylesheet promotion
- `05528ce7` test(front): lock catalog domain ownership after patch retirement
- `d3b819e0` feat(front): promote catalog-image-fixes into domains/catalog
- `4ac2b82f` fix(front): keep catalog domain cascade at legacy app.css position
- docs-close: this commit
