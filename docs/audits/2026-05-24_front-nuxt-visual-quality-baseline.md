# Front Nuxt Visual Quality Baseline

Date: 2026-05-24T00:54:50+08:00
Branch: `fix/front-nuxt-public-visual-quality-2026-05-24`
Base commit: `17eb77d docs: repair front nuxt visual quality plan`

## Runtime

- Implementation worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-front-nuxt-public-visual-quality-2026-05-24`
- Database: `terria_v1_local`
- Backend origin: `http://localhost:18088`
- Visual-check front URL: `http://127.0.0.1:5178`
- Requested front port `5176` was already occupied by a Nuxt process from `fix-crafting-default-tree-wiki-layout-2026-05-23`; it was not used for this baseline.
- `front-nuxt` in the current implementation worktree was started manually on port `5178`.
- Backend port `18088` was already occupied by the local `main` worktree backend. The implementation branch has the same baseline commit and this task does not change backend code.
- Admin port `3001` was already occupied by the local `main` worktree admin process.

## Setup Notes

- The new worktree did not have `front-nuxt/node_modules`; `pnpm install --frozen-lockfile` was run in `front-nuxt`.
- The new worktree did not have `data-query-app/node_modules`; `pnpm install --frozen-lockfile` was run in `data-query-app` so the local stack preflight could check admin.
- Both installs used existing lockfiles and did not change tracked files.
- Nuxt reported Node `[DEP0205] module.register()` deprecation warnings during prepare/typecheck. This warning is recorded but is not a baseline failure.

## Baseline Commands

```text
TERRAPEDIA_FRONT_PROJECT_DIR=front-nuxt \
TERRAPEDIA_FRONT_PORT=5176 \
TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18088 \
bash scripts/dev/start-local-stack.sh --reuse-existing
```

Exit code: `0` after installing missing `front-nuxt` and `data-query-app` dependencies.

Important runtime detail: the stack script reused already-occupied service ports. Because `5176` belonged to a different worktree, this branch uses `http://127.0.0.1:5178` for visual checks.

```text
pnpm run check:public-pages
```

Exit code: `0`

Output summary: `Public page checks passed for 24 Nuxt routes.`

```text
pnpm run check
```

Exit code: `0`

Output summary: Nuxt typecheck passed with the recorded Node deprecation warning.

```text
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5178 \
CHECK_LOCAL_ASSET_LEAKS=1 \
pnpm run check:visual
```

Exit code: `1`

Failure summary:

```text
TypeError: Cannot read properties of undefined (reading 'scrollWidth')
at front-nuxt/scripts/check-visual-regression.mjs:584:15
```

The baseline visual gate did not produce route-level visual failures because the checker itself crashed after a Chromium `Runtime.evaluate` result without `result.value`. Task 1 must repair the visual gate so failures are tracked as structured route evidence instead of a script crash.

## Baseline Status

- `check:public-pages`: passed.
- `check`: passed.
- `check:visual`: failed due to checker crash, not a classified page assertion.
- No crawler, import, backfill, database write, or production mutation was run.
