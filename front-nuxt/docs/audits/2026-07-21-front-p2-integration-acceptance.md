# Front P2 Integration Acceptance (local)

- Date: 2026-07-21
- Branch: `feat/front-p2-integration` @ `328cf1fc`
- Worktree: `.claude/worktrees/front-p2-integration`
- Server: `http://127.0.0.1:5181`
- Backend: `http://127.0.0.1:18091` via `TERRAPEDIA_BACKEND_ORIGIN` (stack-assigned; config file default 18188 is stale for this boot)
- Boundary: **no push, no merge to main**

## Package chain included

| Package | Tip |
|---|---|
| WP-11.2 layout | `2ede052e` |
| WP-11.3 theme cleanup | `dfa5cfae` |
| WP-11.4 catalog promotion | `44b78477` |
| WP-12 breakpoints | `d48481c8` |
| WP-13 long pages | `dac2e786` |
| WP-14 closure | `328cf1fc` |

Linear ancestry verified: 11.2 ⊂ 11.3 ⊂ 11.4 ⊂ 12 ⊂ 13 ⊂ 14.

## Gates

| Check | Result |
|---|---|
| `pnpm run check` (full frontend contracts + typecheck) | **PASS** (exit 0) |
| Known baseline warnings only | Node `module.register` deprecation; duplicate `formatEffectValue` import |

## HTTP matrix (25 routes)

All public routes **200**. Auth-gated user routes **302 → /user/login?redirect=...** (expected).

Includes: `/`, `/items`, `/items/1`, `/articles`, `/search`, `/search-tool`, `/crafting`, `/categories`, `/categories/weapons`, `/biomes`, `/biomes/1`, `/biomes?page=2`, `/npcs`, `/bosses`, `/buffs`, `/projectiles`, `/armor-sets`, `/about`, `/user`, `/user/login`, `/user/register`, and auth redirects for articles/favorites/settings.

## SSR / theme

| Probe | Result |
|---|---|
| cookie `light` | `data-theme="morning-paper"` |
| cookie `warm-slate` | `data-theme="warm-slate"` |
| cookie bogus / none | `data-theme="dark"` |
| Client morning-paper apply | PASS |

## Structural / package probes

| Probe | Result |
|---|---|
| Single `TerraNav` + `TerraFooter` on home | PASS (1/1) |
| Skip link present | PASS |
| `[data-theme="light"]` in `assets/css` | **0** |
| Catalog domain file + app.css import; patch removed | PASS |
| Footer hardcode `14,746` absent | PASS |
| Numeric category `/categories/271` | **301 → /categories/weapons** |
| Biome pager after hydrate | PASS (`第 1 / 5 页`) |

## Mobile viewport 390×844

| Route | HTTP | overflow-x | height | notes |
|---|---|---|---|---|
| `/` | 200 | no | 6599 | skip link |
| `/items` | 200 | no | 2755 | |
| `/items/1` | 200 | no | 3909 | title 铁镐 |
| `/biomes` | 200 | no | **7389 < 9000** | pager true |
| `/biomes/1` | 200 | no | 17738 | detail (disclosures; not index budget) |
| `/crafting` | 200 | no | 4940 | |
| `/search-tool` | 200 | no | 2257 | |

## Launch command (reproduce)

```bash
cd .claude/worktrees/front-p2-integration/front-nuxt
PORT=5181 \
TERRAPEDIA_BACKEND_ORIGIN=http://127.0.0.1:18091 \
NUXT_PUBLIC_API_BASE=http://127.0.0.1:18091/api \
TERRAPEDIA_MINIO_PUBLIC_ENDPOINT=http://localhost:19100 \
TERRAPEDIA_IMAGE_ORIGIN=http://localhost:19100 \
pnpm exec nuxt dev --host 127.0.0.1 --port 5181
```

**Important:** `scripts/dev/config/local-stack.config.json` may list backend `18188`; this boot’s live backend is **18091**. Always set `TERRAPEDIA_BACKEND_ORIGIN` to the live port or SSR detail pages 404.

## Residual / not blocking

1. Biome **detail** mobile height can exceed 9000px (index pagination target only).
2. Overview has no recipe-node total; footer “链路节点” uses `totalProjectiles` as documented in WP-14.
3. Full visual-regression screenshot corpus not re-run (optional; contracts + focused CDP matrix passed).
4. Stack front on 15177 is a separate process; acceptance candidate is **5181 only**.

## Verdict

**READY FOR USER ACCEPTANCE** at `http://127.0.0.1:5181` with backend `18091`.  
No push / no merge to `main` until explicit approval.
