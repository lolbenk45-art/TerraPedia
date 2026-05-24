# Local Stack Preview Closeout Smoke - 2026-05-24

## Stack Result

- Backend: `http://localhost:18088`, TCP healthy.
- Admin: `http://localhost:3001`, TCP healthy.
- Front Nuxt: `http://localhost:5174`, TCP healthy.
- Redis: `127.0.0.1:6380`, TCP healthy.
- MinIO public: `http://localhost:9000`, TCP healthy.
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24`
- Branch: `fix/local-stack-preview-closeout-smoke-2026-05-24`
- Start manifest: `reports/local-start/run-manifest.json`
- Manifest fields: `runId=20260524-140942`, `repoRoot=/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24`, `commit=8476475`
- Local smoke report: `reports/local-start/smoke-20260524-141643.json`

The previous local stack was rooted at `fix/front-nuxt-preview-final-smoke-2026-05-24` and was intentionally stopped using that worktree's recorded pid files before this closeout. The closeout stack was then started from the Task 6 worktree.

`bash scripts/dev/start-local-stack.sh` completed with preflight `passed`. It ran backend compile, Front Nuxt typecheck, and Admin typecheck before startup. Front Nuxt typecheck emitted the known Node `DEP0205` deprecation warning from tooling only.

## Worktree Roots

Key runtime process roots were checked via `/proc/<pid>/cwd`:

- Backend Maven launcher and Java app: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24/back`
- Front Nuxt launcher and Nuxt dev processes: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24/front-nuxt`
- Admin launcher and Nuxt dev processes: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24/data-query-app`

No checked backend, front, or admin runtime process pointed at the primary checkout or the previous Task 5 worktree.

## Admin Smoke

- Login: `POST http://localhost:18088/api/auth/login` returned `message="登录成功"` and `hasToken=true`.
- Crawler monitor: unauthenticated `HEAD http://localhost:3001/operations/crawler-monitor` returned `302` to `/login?redirect=/operations/crawler-monitor`, which is the expected unauthenticated admin route behavior.
- Built-in local smoke: `bash scripts/dev/smoke-local-stack.sh` passed with `passed=9`, `failed=0`.

The built-in smoke confirmed:

- `backend.items`: `200`
- `backend.categories`: `200`
- `admin.root`: `200`
- `admin.proxy.items`: `200`
- `minio.publicEndpoint`: reachable, `403 AccessDenied` expected for bucket listing without credentials
- `auth.login`: `200`
- `auth.me`: `200`
- `admin.acceptance.dataSource`: `200`
- `admin.acceptance.domain`: `200`

The acceptance endpoints being reachable is runtime evidence only. Their statuses do not override Domain Acceptance or release decision records.

## Public Route Smoke

| Route | HTTP | Result |
| --- | --- | --- |
| `/` | `200` | Pass |
| `/items` | `200` | Pass |
| `/npcs` | `200` | Pass |
| `/bosses` | `200` | Pass |
| `/buffs` | `200` | Pass |
| `/projectiles` | `200` | Pass |
| `/armor-sets` | `200` | Pass |
| `/biomes` | `200` | Pass |
| `/crafting` | `200` | Pass |
| `/categories` | `200` | Pass |
| `/search` | `200` | Pass |
| `/articles` | `200` | Pass |
| `/about` | `200` | Pass |

## Follow-Up

- Continue to release-decision review from updated local `main`.
- Keep V0.1 language preview-only until the release decision record is committed.
- Do not treat this smoke as a data refresh, evidence generator, crawler execution, or final A-grade release claim.
