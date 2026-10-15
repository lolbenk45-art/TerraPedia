# Devlog: local-worktree-archive-2026-10-13

## Status

`closed`

## Context

- User goal: reduce WSL workspace storage locally before considering migration to another drive.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Target worktrees: four older worktrees under `/home/lolben/.config/superpowers/worktrees/TerraPedia/`, plus `automation-ingestion-continuation` and `close-structure-compat-window` under `/home/lolben/TerraPedia/.worktrees/`
- Related entry: `docs/devlog/entries/2026-08-27-eight-domain-l2-execution-continuation.md`

## Direction / Decisions

- Archive and retire completed or old Superpowers worktrees locally, one at a time.
- Keep every local branch ref. Preserve each worktree's tracked, untracked, and ignored files in a verified local archive before removing the registered checkout.
- Leave active Armor, Buff, and Shimmer worktrees in place.

## Scope

- Data: local archives of complete worktree filesystems, excluding Git administrative pointers; preserve local branch refs and original commits.
- Docs/process: update this entry and `docs/devlog/current.md` for handoff.
- Out of scope: D-drive migration, branch deletion, cache cleanup, changes to other worktrees, and source/report classification beyond this target.

## Validation

- Pre-archive target status: 0 tracked modifications, 0 staged paths, 183 untracked paths, and 7,302 ignored files.
- Target worktree `HEAD`: `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09`, reachable from `origin/main`.
- Archive: `.local/tmp/worktree-bundles/automation-ingestion-continuation-20261013.tar.gz`, 285,738,326 bytes, SHA-256 `e2bf3417cefcf64b3ddafb9f2e3b6024fbb06e050f50429a1eb5471cb0e3bd8d`.
- `gzip -t`, archive listing, required-file lookup, and `sha256sum -c` passed. Archive has 13,931 entries, including 12,963 regular files; `.git` was excluded because the branch and checkout are reconstructed by Git.
- `git worktree remove --force` removed the registered target worktree after archive verification. The branch ref remains, the target path is absent, and the archive checksum/gzip validation still passes.
- Post-removal `.worktrees` size is `5.5G` (down from `7.8G`); WSL `/` is `89G` used (down from about `91G`).
- Three more complete local archives are gzip-valid:
  - `crawler-auto-ingestion-readiness-20261013.tar.gz`, 67,835,683 bytes, SHA-256 `fc168c3dead2e038e876b77e204edfefc006502a3eb40c79bb546d2754cab8d5`.
  - `crawler-queue-v2-runtime-20261013.tar.gz`, 29,140,584 bytes, SHA-256 `f10dac68bed73f91e1f8a5e196ee8df5a227f02e6d897a795f14b15162790569`.
- `scheduler-permanent-enablement-20261013.tar.gz`, 35,258,180 bytes, SHA-256 `ec36fa455dd88675a256f3db5cc063a527485c052c1b2bf617cf24c827f8c778`.
- All three additional registered worktrees were removed after archive verification; their branch refs remain. Final archive and space verification passed.
- `close-structure-compat-window-20261013.tar.gz`, 35,754,991 bytes, SHA-256 `14c1286de1ba46ac08fa59ea8a79fe8984d6a9d1fa99dbb8800887860c968a4b`, with 4,008 regular entries. It contains the single untracked VS Code settings file; its branch has one local-only commit and must be retained.
- `close-structure-compat-window` was removed after its archive passed SHA-256 and gzip validation; branch `refactor/close-structure-compat-window` remains.
- Final state: all five archives validate, `.worktrees` is `5.3G` (initially `7.8G`), and WSL `/` is `88G` used (initially about `91G`).

## Result

- Completed: five full local archives created and verified; all five registered worktrees were removed while preserving their branch refs.
- Archive worktrees were removed while preserving their refs and verified recovery bundles; no task source or evidence was discarded.

## Residual Risks

- Restore requires recreating the worktree at the original path from branch `feat/automation-ingestion-continuation`, then extracting the archive over that checkout.
- The archived historical reports may be needed by a future replay; restore the worktree before using any old path-based evidence.

## Follow-up

- Owner: primary session; restore any archived checkout by recreating it from its retained branch and extracting its matching archive.

## Commits

- Commit SHA pending in final response.
