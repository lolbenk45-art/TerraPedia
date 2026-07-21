# Devlog: Front P2 WP-11.3 theme selector cleanup

## Status

`closed`

## Context

- User goal: continue Front P2 through the local integration chain; WP-11.3
  removes the runtime theme alias `[data-theme="light"]` from stylesheets.
- Branch: `feat/front-p2-wp11-theme-cleanup`
- Worktree: `.claude/worktrees/front-p2-wp11-theme`
- Base: `feat/front-p2-wp11-layout` at `2ede052e` (WP-11.2 default layout).
- Related docs:
  `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md` and
  `docs/superpowers/plans/2026-07-20-front-wp11-theme-cleanup.md`.
- Related prior entry:
  `docs/devlog/entries/2026-07-19-front-wp11-default-layout.md`.

## Direction / Decisions

- Chosen approach: a scripted discrimination scan classifies all 817
  `[data-theme="light"]` occurrences before any removal; removal is executed
  by the same script under `--apply` with a fail-closed re-scan; contracts are
  updated RED-first.
- Discrimination rule (from the spec): a `[data-theme="light"]` selector is a
  removable alias when the same rule block also targets
  `[data-theme="morning-paper"]` with identical declarations — trivially true
  for same-prelude selector lists and `:where()` groups; anything else lands
  on a review list that blocks `--apply`.
- Rejected options: manual per-selector judgment (817 occurrences), and
  removing the theme-store `light → morning-paper` normalization (old
  persisted cookies must keep working).

## Scope

- Frontend: six stylesheets under `assets/css/`, five contract scripts, two
  runtime check matrices, CSS ratchet budgets, the new scan script.
- Backend: none. Data: no writes.
- Out of scope: `stores/theme.ts` and `composables/useUserApi.ts` (compat
  normalization preserved), WP-11.4 onward, visual redesign, push, merge.

## Validation

- Scan dry-run at Task 1: `total: 817 occurrences, 817 removable, 0 review`
  (per-file: hifi 495, contrast 229, catalog 63, discovery 19, primitives 10,
  tokens 1); grep cross-check 817.
- RED (Task 2): `check-public-pages` exit 1 / 40 violations (incl. six
  retirement-sweep entries; store guard silent); `check-visual-system` exit 1
  / 27; `check-home-j1-index` exit 1 / 28; `check-nav-layout` exit 0.
- GREEN (Task 3): `--apply` rewrote six CSS files (byte-identical to script
  transform, independent re-derivation confirmed); re-scan `0/0/0`, grep 0;
  ratchet budgets hifi 10282→10280, contrast 910→907; five focused contracts
  exit 0; `pnpm run check` exit 0; `git diff --check` clean.
- Runtime (Task 4, candidate `15185` / backend `18091`): theme-token visual
  parity compare `passed: 18 records` against the Task 0 baseline; four SSR
  cookie probes: light→morning-paper, warm-slate→warm-slate, bogus→dark,
  none→dark; `check-light-theme-typography` exit 1 on both the candidate and
  the pre-cleanup stack front (`15177`) with the same residual family
  (hero-status-pill ratio, 404-route dark surfaces, password-toggle) — pre-
  existing baseline residual, not a WP-11.3 regression. No forced `light`
  DOM state remains in the matrix (`targetThemes = ['morning-paper',
  'warm-slate']`).

## Result

- Completed: 817 runtime alias occurrences removed from six stylesheets via
  the fail-closed scan script; contracts updated RED-first and now forbid any
  stylesheet reintroduction of `[data-theme="light"]` while locking the
  theme-store `light → morning-paper` normalization; typography runtime matrix
  no longer forces a `light` DOM state; CSS ratchet tightened to the measured
  10280/907; 18/18 visual parity match; SSR cookie compatibility retained.
- Not completed / deferred: local integration of this branch (and the pending
  WP-11.2 commit) into `feat/front-p2-integration` — coordinator responsibility.
  File-name/keyframe/`isLightTheme` artifacts that still say "light" are
  intentionally retained (not selectors; renaming would churn the ratchet key
  and import graph).

## Residual Risks

- Parity script still exits before writing `candidate.json` on hash mismatch
  (unchanged upstream quirk from WP-11.2); diagnose from console diff output.
- `check-home-j1-index.mjs` remains outside the main `pnpm run check` chain
  (pre-existing; was updated and exercised focused).
- `check-light-theme-typography.mjs` still fails on residual contrast issues
  that also fail on the pre-cleanup stack front; not introduced by this package
  and not in the `pnpm run check` chain.
- Surviving "light"-named non-selectors: `light-theme-contrast-fixes.css`
  filename, `subtle-pulse-light` keyframe, `isLightTheme` store computed —
  pure naming artifacts.
- Theme-store cookie normalization (`stores/theme.ts`) is now load-bearing for
  this cleanup and is contract-pinned by the public-pages guard.

## Follow-up

- WP-11.4 (next): catalog stylesheet promotion per the P2 remaining design.
- Local integration: coordinator merges the WP-11.3 commit into local
  `feat/front-p2-integration` (branch may need creating) together with the
  pending WP-11.2 commit.

## State Changes

### 2026-07-21 (opening)

- Change: WP-11.3 plan checkpoint committed; baseline gates green at
  `2ede052e`; 18-record parity baseline and SSR cookie-compat probes captured
  from the candidate port.
- Evidence: `docs/superpowers/plans/2026-07-20-front-wp11-theme-cleanup.md`.
- Note: candidate backend at 127.0.0.1:18091 (stack-assigned; spec's 18088
  applies to the final integration stage).

### 2026-07-21 (close)

- Change: Tasks 1–5 complete. Discrimination scan script, RED contract lock,
  GREEN scripted removal + ratchet, 18/18 runtime parity, SSR cookie probes,
  and closeout docs.
- Evidence: commits listed below; parity baseline/candidate under
  `front-nuxt/test-results/wp11-theme-cleanup-parity/` (gitignored).

## Commits

- `349c90ac` docs(front): plan wp11.3 theme selector cleanup
- `0f7baba6` docs(front): amend wp11.3 plan for stack backend port and red expectation
- `a52d512e` chore(front): add light selector discrimination scan
- `fc98d86f` test(front): lock light theme selector retirement
- `c768035e` feat(front): retire runtime light theme selector alias
- docs-close: this commit
