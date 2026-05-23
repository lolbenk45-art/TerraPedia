# Basic Public Site V0.1 Smoke - 2026-05-23

## Commands
- `pnpm install --frozen-lockfile` in `front-nuxt`
  Result: exit 0; installed the smoke worktree frontend dependencies and generated Nuxt types.
- `pnpm install --frozen-lockfile` in `data-query-app`
  Result: exit 0; installed the smoke worktree admin dependencies and generated Nuxt types.
- `bash ./scripts/dev/verify-local-stack.sh`
  Result: exit 0; database TCP preflight, backend compile, public Nuxt typecheck, and admin Nuxt typecheck passed.
- `APP_PORT=18188 TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18188 TERRAPEDIA_FRONT_PORT=5178 TERRAPEDIA_ADMIN_PORT=3002 TERRAPEDIA_REDIS_PORT=6381 bash ./scripts/dev/start-local-stack.sh`
  Result: exit 0; current branch stack started on temporary ports, but the temporary Redis 6381 process exited after startup.
- `APP_PORT=18188 TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18188 TERRAPEDIA_FRONT_PORT=5178 TERRAPEDIA_ADMIN_PORT=3002 TERRAPEDIA_REDIS_PORT=6381 bash ./scripts/dev/smoke-local-stack.sh --backend-base-url http://127.0.0.1:18188 --admin-base-url http://localhost:3002`
  Result: exit 1; `passed=7 failed=2` because `/api/items` and admin proxy `/api/items` hit Redis closed-channel errors after temporary Redis 6381 exited.
- `APP_PORT=18188 TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18188 TERRAPEDIA_FRONT_PORT=5178 TERRAPEDIA_ADMIN_PORT=3002 TERRAPEDIA_REDIS_PORT=6381 bash ./scripts/dev/stop-local-stack.sh`
  Result: exit 0; stopped only the current smoke worktree temporary backend, public frontend, and admin frontend processes.
- `APP_PORT=18188 TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18188 TERRAPEDIA_FRONT_PORT=5178 TERRAPEDIA_ADMIN_PORT=3002 bash ./scripts/dev/start-local-stack.sh --reuse-existing`
  Result: exit 0; current branch stack started on temporary ports and reused the stable project Redis 6380.
- `APP_PORT=18188 TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18188 TERRAPEDIA_FRONT_PORT=5178 TERRAPEDIA_ADMIN_PORT=3002 bash ./scripts/dev/smoke-local-stack.sh --backend-base-url http://127.0.0.1:18188 --admin-base-url http://localhost:3002`
  Result: exit 0; `passed=9 failed=0`, report written to `reports/local-start/smoke-20260523-210739.json`.
- `cd front-nuxt && pnpm run check:public-pages && pnpm run check`
  Result: exit 0; public route contract passed for 24 Nuxt routes and Nuxt typecheck completed with only the known Node `DEP0205` warning.
- `chromium-browser --headless --no-sandbox --disable-gpu --virtual-time-budget=8000 --dump-dom http://localhost:5178/items/757`
  Result: exit 0; hydrated DOM contained one `h1`, `泰拉刃`, and recipe content with no remaining loading skeleton.
- `chromium-browser --headless --no-sandbox --disable-gpu --virtual-time-budget=8000 --dump-dom http://localhost:5178/user/favorites`
  Result: exit 0; hydrated DOM rendered the unified account unavailable state, no login form, and zero `/user*` anchors.
- `APP_PORT=18188 TERRAPEDIA_BACKEND_ORIGIN=http://localhost:18188 TERRAPEDIA_FRONT_PORT=5178 TERRAPEDIA_ADMIN_PORT=3002 bash ./scripts/dev/stop-local-stack.sh`
  Result: exit 0; stopped the current smoke worktree temporary backend, public frontend, and admin frontend processes. Existing main worktree services on 5174 and 18088 were left running.

## Routes Checked
- `/`: HTTP 200; rendered homepage and no forbidden static search markers or account nav links.
- `/items`: HTTP 200; rendered item catalog and no forbidden static search markers or account nav links.
- `/items/757`: HTTP 200; SSR returned the designed loading skeleton, and hydrated Chromium DOM rendered `泰拉刃`, a semantic `h1`, and recipe content.
- `/search?keyword=泰拉`: HTTP 200; rendered real search page and no fake confidence/result markers.
- `/crafting`: HTTP 200; rendered crafting route and no forbidden static search markers or account nav links.
- `/npcs`: HTTP 200; rendered NPC catalog and no forbidden static search markers or account nav links.
- `/bosses`: HTTP 200; rendered Boss route and no forbidden static search markers or account nav links.
- `/buffs`: HTTP 200; rendered Buff route and no forbidden static search markers or account nav links.
- `/biomes`: HTTP 200; rendered biome index and no forbidden static search markers or account nav links.
- `/armor-sets`: HTTP 200; rendered armor-set route and no forbidden static search markers or account nav links.
- `/projectiles`: HTTP 200; rendered projectile route and no forbidden static search markers or account nav links.
- `/articles`: HTTP 200; rendered article list and no forbidden static search markers or account nav links.
- `/about`: HTTP 200; rendered source/disclaimer page and no forbidden static search markers or account nav links.
- `/user`: HTTP 200; rendered unified account unavailable state and no account nav link.
- `/user/favorites`: HTTP 200; rendered unified account unavailable state, no login form, and no `/user*` anchors after breadcrumb fix.

## Open Issues
- Staging/preview target was not available in this execution. Public release remains blocked after local validation until a staging or preview origin is smoke-tested.
- The first temporary Redis 6381 startup was unstable in this environment. The successful smoke used the existing project Redis 6380 while keeping the current branch backend, public frontend, and admin frontend isolated on temporary ports.
