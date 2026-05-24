# Front Nuxt Preview Final Smoke - 2026-05-24

## Stack

- Backend: `http://localhost:18088`
- Admin: `http://localhost:3001`
- Front Nuxt: `http://localhost:5174`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-front-nuxt-preview-final-smoke-2026-05-24`
- Branch: `fix/front-nuxt-preview-final-smoke-2026-05-24`
- Manifest: `reports/local-start/run-manifest.json`

The previous local stack was rooted at `/home/lolben/TerraPedia` and was intentionally stopped before this smoke. The active stack was restarted from the Task 5 worktree. Runtime process roots and the manifest both point at the Task 5 worktree.

The runtime config path is `/home/lolben/TerraPedia/scripts/dev/config/local-stack.config.json`; its front entry is `front-nuxt` on port `5174`.

## Commands

```bash
node --check front-nuxt/scripts/check-visual-regression.mjs
cd front-nuxt && pnpm run check:public-pages
cd front-nuxt && TERRAPEDIA_FRONT_NUXT_URL=http://localhost:5174 CHECK_LOCAL_ASSET_LEAKS=1 pnpm run check:visual
cd front-nuxt && pnpm run check
```

## Result

- Script syntax: passed.
- Public route check: passed, `24` Nuxt routes.
- Visual gate: passed with `failureCount=0`, `warningCount=0`, `screenshotCount=0`.
- Typecheck: passed. Node emitted a `DEP0205` deprecation warning from tooling only.

## Repair Notes

The visual gate initially failed on `/` mobile with `expected exactly one visible h1, got 0` immediately after `Page.navigate`, even though a manual headless probe found the visible H1 rendered. The visual checker now waits for route readiness before running the generic audit.

The readiness wait intentionally requires only:

- `document.readyState !== "loading"`
- matching `location.pathname` and `location.search`
- a measurable `body`
- at least one visible `h1`

It does not require a shared `<main>` shell, because valid public pages such as `/items`, `/items/1`, and `/articles` use different top-level section or div shells. Layout and navigation health remain covered by the generic visual assertions.

## Follow-up

Continue to local stack preview closeout smoke from updated local `main`.
