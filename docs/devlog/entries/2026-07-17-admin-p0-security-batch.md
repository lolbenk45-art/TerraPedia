# 2026-07-17 Admin P0 security & bug batch (audit follow-up)

## Goal

Close all eight P0 items from the 2026-07-17 admin+backend scoring audit
(`docs/audits/2026-07-17-admin-backend-audit/`), one commit per item, on
branch `dev/post-merge-acceptance`. Plan of record:
`docs/superpowers/plans/2026-07-17-admin-p0-fixes.md` (boundary decisions
in the plan header are binding).

## What shipped (8/8)

| P0 | Commit | Change |
|---|---|---|
| 1 | `e6cda9c` | pinia 3 upgrade + root `error.vue` (site-wide 404→500 crash) |
| 2 | `f750425` | `@Transactional` on multi-table NPC/Buff/ArmorSet write paths |
| 3 | `4db4df8` | declarative admin-auth annotation, interceptor enforces ADMIN role |
| 4 | `462e483` | projectile create no longer binds client-supplied `deleted` |
| 5 | `7a0a82e` | JWT governance: 32-char secret floor (fail-fast), admin/user secret distinctness guard, constant-time login compare |
| 6/7 | `f8f9b3a` | town-npcs coin chips render (buy/sell fallback); draft-save surfaces QuotaExceededError instead of dying silently |
| 8a | `cc287de` | crawler-monitor-test scenario simulator gated behind `import.meta.dev`: write paths (`savePayload`/`resetState`/`startTimedSimulation`) + their UI blocks. Domain-smoke workbench and `loadState`/`loadLiveOverview` stay unguarded (production ops data path, plan decision #5) |
| 8b | `ad8e9bd` | reset-password stops echoing the plaintext password (DTO field dropped, toast removed) |

Execution went further than the plan in places: pinia was upgraded to 3.x
instead of patched (plan decision #3 superseded), and the secret floor is
fail-fast at 32 chars instead of WARN (plan decision #4 superseded); unit
test secrets were lengthened accordingly (`AuthPropertiesGovernanceTest`).

## Verification

- Frontend: `pnpm run check` green; `pnpm run test:unit` 363/363; production
  build succeeds. In the prod bundle the dev guard compiles to constant
  false: `savePayload` compiles to an immediate `return !1`, the
  `test-state/reset` call is eliminated, and the guarded sections carry
  `key:0` v-if branches on a folded constant. Note: the correct unit-test
  entry point is `pnpm run test:unit` (tsx loader); bare `node --test tests/`
  fails on TS imports.
- Backend regression gate on every P0-touched class: 104/104
  (`AdminNpc/AdminBuff/AdminArmorSet/AdminNpcRelation/AdminProjectile/Auth`
  controller tests + auth governance/interceptor/JWT tests).
- Full `mvn test` (1421 tests): 7 failing, none from this batch. Six are
  pre-existing at pre-batch commit `1bc2ccd` (verified in a throwaway
  worktree): `LegacyLocalBackendPortCleanerTest` ×2 (environment),
  `AdminWikiZhRecipeImportControllerTest` ×1 (UnnecessaryStubbing),
  `ItemMapperPreferredImageSqlTest` ×3 (public projection contracts, last
  touched by `4a744dc` categories work on main). The seventh,
  `AdminAudioAssetControllerTest::shouldStreamAudioAssetWithContentHeaders`,
  passes 6/6 in isolation at both baseline and HEAD — order-dependent
  fixture pollution in the full run, not a product regression.

## Follow-ups (explicitly out of this batch)

- Backend `@Profile` isolation for the `test-state` endpoints (plan
  decision #5 deferred it; frontend guard alone still leaves the PUT/POST
  endpoints callable by any admin token via curl).
- Pre-existing `ItemMapperPreferredImageSqlTest` ×3 baseline failures need
  an owner — they assert public SQL projection contracts and are red on
  main-derived history, unrelated to this batch.
- Main-page dead smoke functions (`startBaseDomainSampleCrawl` etc.) go to
  the P1 dead-code sweep per plan decision #1.
