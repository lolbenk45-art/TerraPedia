# Devlog: Front P2 WP-11.3 theme selector cleanup

## Status

`in_progress`

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

- (filled at close)

## Result

- (filled at close)

## Residual Risks

- (filled at close)

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

## Commits

- (filled at close)
