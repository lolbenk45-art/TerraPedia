# AC Home Data And Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the current AC homepage as the final homepage, remove the discarded B preview artifact, expose real homepage counts through the existing statistics endpoint, and remove unsupported article/item query links.

**Architecture:** The homepage remains a thin Nuxt shell using the current AC components. The backend expands `GET /statistics/overview` into the single authoritative homepage stats source, preserving the existing frontend contract that homepage data only calls `/statistics/overview`. Article links use only supported list keyword queries unless a published article slug is verified in a separate content task.

**Tech Stack:** Nuxt 4, Vue 3 composition API, Spring Boot, MyBatis Plus, existing Node contract scripts, existing `CatalogStatisticsService`.

---

## Scope

In scope:
- Delete `front-nuxt/public/home-b-hifi-preview.html` if present.
- Extend `CatalogStatisticsDTO` and `CatalogStatisticsServiceImpl` with aggregate totals for Boss, NPC, Buff, Biome, Armor Set, Projectile, and published Article records.
- Keep `front-nuxt/composables/useHomeData.ts` using only `GET /statistics/overview`.
- Remove unsupported homepage links:
  - `/articles?stage=...`
  - `/articles?type=...`
  - `/items?gamePeriod=...`
- Remove hard-coded fake homepage numeric totals such as `14,746` and numeric fallback `6,131`.
- Add static contract checks for the repaired data and link behavior.

Out of scope:
- No B layout implementation.
- No homepage component restructuring.
- No article `stage/type/tags` taxonomy or API filtering.
- No database writes and no article publishing in this task.
- No crawler, import, or backfill work.

## Source Chain

Single homepage API source:
- Frontend: `front-nuxt/composables/useHomeData.ts`
- API: `GET /statistics/overview`
- Controller: `back/src/main/java/com/terraria/skills/controller/StatisticsController.java`
- Service: `back/src/main/java/com/terraria/skills/service/impl/CatalogStatisticsServiceImpl.java`
- DTO: `back/src/main/java/com/terraria/skills/dto/CatalogStatisticsDTO.java`

Backend count sources:
- Items/categories: existing `ItemMapper.countActiveItems()` and `CategoryManagementService`.
- Bosses: `BossGroupMapper.selectCount(...)`.
- NPCs: `NpcMapper.selectCount(...)`.
- Buffs: `BuffMapper.selectCount(...)`.
- Biomes: `BiomeMapper.selectCount(...)`.
- Armor sets: `ArmorSetMapper.selectCount(...)`.
- Projectiles: `ProjectileMapper.selectCount(...)`.
- Published articles: `ArticleMapper.selectCount(status = 'PUBLISHED')`.

Supported homepage query links:
- `/search?keyword=...`
- `/articles?keyword=...`
- `/items?filter=pre-hardmode`
- `/items?filter=hardmode`

Unsupported homepage query links that must not appear:
- `/articles?stage=...`
- `/articles?type=...`
- `/items?gamePeriod=...`

## Files

- Delete: `front-nuxt/public/home-b-hifi-preview.html`
- Modify: `back/src/main/java/com/terraria/skills/dto/CatalogStatisticsDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CatalogStatisticsServiceImpl.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/CatalogStatisticsServiceImplTest.java`
- Modify: `front-nuxt/composables/useHomeData.ts`
- Modify: `front-nuxt/scripts/check-home-j1-index.mjs`

## Task 1: Contract And Backend Test First

- [x] **Step 1: Delete the discarded B preview artifact**

`front-nuxt/public/home-b-hifi-preview.html` has been removed.

- [ ] **Step 2: Add failing frontend contract checks**

Add `check-home-j1-index.mjs` assertions that reject unsupported homepage links, hard-coded fake numeric totals, and missing extended stat fields while keeping `/statistics/overview` as the only homepage fetch target.

- [ ] **Step 3: Add failing backend service test**

Create `CatalogStatisticsServiceImplTest` verifying that `getCatalogStatistics()` fills `totalBosses`, `totalNpcs`, `totalBuffs`, `totalBiomes`, `totalArmorSets`, `totalProjectiles`, and `totalPublishedArticles`.

- [ ] **Step 4: Verify RED**

Run:

```bash
pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs
cd back && mvn -Dtest=CatalogStatisticsServiceImplTest test
```

Expected: frontend contract fails on current links/fake totals, backend test fails before DTO/service support exists.

## Task 2: Backend Statistics Aggregation

- [ ] **Step 1: Extend `CatalogStatisticsDTO`**

Add nullable long fields:
- `totalBosses`
- `totalNpcs`
- `totalBuffs`
- `totalBiomes`
- `totalArmorSets`
- `totalProjectiles`
- `totalPublishedArticles`

- [ ] **Step 2: Inject entity mappers into `CatalogStatisticsServiceImpl`**

Add mapper dependencies for Boss, NPC, Buff, Biome, Armor Set, Projectile, and Article.

- [ ] **Step 3: Count active/public rows**

Use lightweight `selectCount` wrappers. Count `status = 1` for game entities where that status field exists. Count articles with `status = 'PUBLISHED'`.

- [ ] **Step 4: Verify backend GREEN**

Run:

```bash
cd back && mvn -Dtest=CatalogStatisticsServiceImplTest test
```

Expected: pass.

## Task 3: Frontend Home Data Cleanup

- [ ] **Step 1: Extend `HomeStats`**

Add the backend fields to `front-nuxt/composables/useHomeData.ts`.

- [ ] **Step 2: Remove numeric fallback**

Use `null` fallback values and label fallbacks, so API outages do not show stale hard-coded counts.

- [ ] **Step 3: Display real counts only when returned**

Use `formatCount` labels:
- Boss fallback: `路线`
- NPC fallback: `图鉴`
- Buff fallback: `状态`
- Biome fallback: `生态`
- Armor Set fallback: `套装`
- Projectile fallback: `射弹`
- Article fallback: `专题`

- [ ] **Step 4: Replace unsupported links**

Use:
- `/articles?keyword=开荒`
- `/articles?keyword=Boss`
- `/articles?keyword=困难模式`
- `/articles?keyword=月亮领主`
- `/items?filter=pre-hardmode`
- `/items?filter=hardmode`
- `/articles?keyword=路线`
- `/articles?keyword=攻略`
- `/articles?keyword=专题`
- `/articles?keyword=机制`

Set the featured route default href to `/articles?keyword=近战`. This task never writes DB and never claims article content is published.

- [ ] **Step 5: Verify frontend contract GREEN**

Run:

```bash
pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs
```

Expected: pass.

## Task 4: Validation

- [ ] **Step 1: Backend focused test**

Run:

```bash
cd back && mvn -Dtest=CatalogStatisticsServiceImplTest test
```

- [ ] **Step 2: Frontend contract and typecheck**

Run:

```bash
pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs
pnpm --dir front-nuxt run check:public-pages
pnpm --dir front-nuxt run check
```

- [ ] **Step 3: Homepage runtime visual contract**

Run if the local frontend is running/current:

```bash
pnpm --dir front-nuxt run check:home-visual-lightweight
```

If it reports a stale or unavailable server, restart the local stack before rerunning.

- [ ] **Step 4: Diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected changed scope:
- Deleted B preview HTML.
- This plan file.
- Backend statistics DTO/service/test.
- Frontend homepage data and homepage contract script.

## Multi-Agent Review Results Applied

- Data/API review repair: do not issue seven extra homepage SSR API requests; extend `/statistics/overview` instead.
- Article/link review repair: do not claim article content completion; this task only removes false links and degrades to supported keyword/list routes.
- Contract review repair: preserve the existing single-homepage-API contract and add `check:public-pages` validation.

## Residual Risks

- Entity count status semantics may need later alignment with each public list endpoint, but the stats endpoint is now the single place to refine that contract.
- Article taxonomy remains out of scope. Real stage/type filtering needs a separate article model/API/admin/content plan.
- Homepage no longer links directly to `melee-progression` unless a separate content task publishes and verifies that article.

## Self-Review

- Spec coverage: AC structure retained, B artifact deletion included, data stats mapped to one backend source, article links repaired, validation defined.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: stat field names match backend DTO, frontend `HomeStats`, and contract markers.
- Scope check: no DB writes, no crawler work, no B homepage work.
