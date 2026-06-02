# Admin Audio Assets Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only backend API and admin page so operators can inspect the audio assets already imported into `audio_assets` and `audio_asset_links`.

**Architecture:** The backend exposes two admin endpoints backed by `JdbcTemplate`: a paged list and a compact summary. The Nuxt admin app adds one operations page that calls those endpoints through the existing `/api` proxy and shows searchable metadata only.

**Tech Stack:** Spring Boot, MockMvc, JdbcTemplate, Nuxt 3, Vue 3, TypeScript, existing TerraPedia admin layout.

---

## Scope

This plan only displays database metadata. It does not add audio playback, MinIO upload, public media URLs, crawler-to-DB writes, or matching logic.

## Files

- Create: `back/src/test/java/com/terraria/skills/controller/AdminAudioAssetControllerTest.java`
- Create: `back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java`
- Create: `data-query-app/pages/operations/audio-assets.vue`
- Modify: `data-query-app/layouts/default.vue`

## Task 1: Backend API Contract And Tests

**Files:**
- Create: `back/src/test/java/com/terraria/skills/controller/AdminAudioAssetControllerTest.java`

- [ ] **Step 1: Write failing MockMvc tests**

Add tests that expect:

```java
GET /admin/audio-assets/summary
```

to return `totalAssets`, `totalLinks`, `shardCounts`, `matchStatusCounts`, and:

```java
GET /admin/audio-assets?search=Zombie&shard=npc_hit&matchStatus=unmatched&page=1&limit=20
```

to return paged rows with `assetId`, `shard`, `kind`, `sourceKey`, `fileTitle`, `wikiFileUrl`, `sourceUrl`, `localPath`, `mime`, `sizeBytes`, `sha256`, `status`, `lastVerifiedAt`, `linkCount`, and `matchStatuses`.

The list test must assert that `absoluteLocalPath` is absent.

- [ ] **Step 2: Run red test**

Run:

```bash
cd back
mvn "-Dtest=AdminAudioAssetControllerTest" test
```

Expected: compilation failure because `AdminAudioAssetController` does not exist yet.

## Task 2: Backend Read-Only Implementation

**Files:**
- Create: `back/src/main/java/com/terraria/skills/controller/AdminAudioAssetController.java`

- [ ] **Step 1: Implement summary endpoint**

Add `@RestController`, `@RequestMapping("/admin/audio-assets")`, `@SecurityRequirement(name = "bearerAuth")`, and a `summary()` method.

The summary should query only non-deleted rows:

```sql
SELECT COUNT(*) FROM audio_assets WHERE deleted = 0
SELECT COUNT(*) FROM audio_asset_links WHERE deleted = 0
SELECT shard, COUNT(*) AS total FROM audio_assets WHERE deleted = 0 GROUP BY shard ORDER BY shard
SELECT match_status, COUNT(*) AS total FROM audio_asset_links WHERE deleted = 0 GROUP BY match_status ORDER BY match_status
```

- [ ] **Step 2: Implement list endpoint**

Support params `page`, `limit`, `size`, `search`, `shard`, `kind`, `status`, `matchStatus`.

Use a left join to count links and aggregate match statuses:

```sql
FROM audio_assets aa
LEFT JOIN audio_asset_links aal ON aal.audio_asset_id = aa.id AND aal.deleted = 0
WHERE aa.deleted = 0
```

Return safe metadata only. Do not select or expose `absolute_local_path`.

- [ ] **Step 3: Run green test**

Run:

```bash
cd back
mvn "-Dtest=AdminAudioAssetControllerTest" test
```

Expected: all tests in `AdminAudioAssetControllerTest` pass.

## Task 3: Admin Page And Navigation

**Files:**
- Create: `data-query-app/pages/operations/audio-assets.vue`
- Modify: `data-query-app/layouts/default.vue`

- [ ] **Step 1: Add navigation item**

Add an Operations menu item:

```ts
{ name: '音频资产', path: '/operations/audio-assets', hint: '查看 BGM 与 NPC 音效入库状态', icon: Music }
```

Import `Music` from `lucide-vue-next`.

- [ ] **Step 2: Add page**

Create a dense admin page with:

- summary cards for total assets, total links, unmatched links, shard count
- filters for keyword, shard, kind, status, match status
- table columns for asset, shard/kind, source key, MIME/size, status, links/match status, local path, verified time, wiki link
- pagination controls

Use the existing `get` helper from `~/composables/useApi` and call:

```ts
get('/admin/audio-assets/summary')
get('/admin/audio-assets', params)
```

- [ ] **Step 3: Run admin type check**

Run:

```bash
cd data-query-app
pnpm run check
```

Expected: type check exits 0.

## Task 4: Integration Verification

**Files:**
- No new files unless a runtime issue requires a targeted fix.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd back
mvn "-Dtest=AdminAudioAssetControllerTest,AdminArmorAttributeControllerTest" test
```

Expected: both controller test classes pass.

- [ ] **Step 2: Run diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Status may include pre-existing unrelated crawler/data changes; do not stage or revert them.

- [ ] **Step 3: Report**

Report changed files, verification commands, and the admin route `/operations/audio-assets`.
