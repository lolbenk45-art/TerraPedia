# Boss Detail P2 Contract Baseline

Date: 2026-05-25
Branch: `feat/boss-detail-p2-contract-2026-05-25`
Base: `feat/detail-page-cleanup-p1-5`

## Scope

P2 adds a read-only Boss detail contract for admin and public detail payloads:

- `summonMethodResolved`
- `summonItems`
- `summonConditions`
- `mechanicNotes`
- `difficultyNotes`

No DB writes, imports, crawlers, backfills, Flyway migrations, schema changes, or production deployment were run.

## Baseline Finding

Before P2, admin and public Boss detail could drift:

- Admin detail resolved `summonMethod` from DB text first, then an in-controller fallback map.
- Public detail exposed only the DB `summonMethod`; fallback text was absent when the DB value was empty.
- There were no structured summon item, condition, mechanic, or difficulty arrays in the public DTO.
- Admin UI inferred summon items from free text with `/items/suggestions`.

P2 keeps legacy compatibility while aligning the new detail contract:

- Public `summonMethod` remains DB-explicit only.
- Admin `summonMethod` keeps its old resolved/fallback behavior.
- Both public/admin detail payloads expose `summonMethodResolved`.
- Structured fact arrays default to empty arrays and are not derived from text.

## Local GET Smoke

Attempted read-only local GET:

```bash
curl -fsS --max-time 2 http://localhost:8080/public/bosses/66
```

Result: backend was not listening on `localhost:8080` in this worktree session.

I did not start the local stack for this P2 commit, to avoid changing service lifecycle or relying on DB runtime state. The payload contract is covered by focused backend MockMvc tests instead.

## Verification Evidence

Fresh checks run after implementation:

- `cd back && mvn -Dtest=BossSummonContractResolverTest,PublicBossControllerTest,AdminBossControllerTest test`
  - 16 tests, 0 failures.
- `cd front-nuxt && pnpm run check:public-pages`
  - Public page checks passed for 24 Nuxt routes.
- `cd front-nuxt && pnpm run check`
  - Nuxt typecheck passed.
- `cd data-query-app && pnpm run test:unit`
  - 86 tests, 0 failures.
- `cd data-query-app && pnpm run check`
  - Nuxt typecheck passed.
- `git diff --check`
  - Passed.

## Residual Risk

The new structured arrays are intentionally empty-safe until an approved source chain provides reviewed facts. P2 does not add durable storage or populate structured summon conditions, mechanics, or difficulty notes.
