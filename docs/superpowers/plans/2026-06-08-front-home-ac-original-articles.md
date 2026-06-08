# AC Home API-Managed Rich Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct SQL homepage article seed with API-managed AC homepage articles that use TerraPedia rich content references.

**Architecture:** Keep the AC homepage slug mapping in `front-nuxt/composables/useHomeData.ts`. Maintain article bodies in `scripts/content/ac-home-articles.mjs`, write them through the running backend admin article APIs with `scripts/content/seed-ac-home-articles.mjs`, and verify public `/articles/slug/<slug>` responses after publishing.

**Tech Stack:** Node 20+ scripts, TerraPedia admin auth API, Spring Boot article APIs, Nuxt homepage static contract checks, public content reference resolver.

---

## Requirements

- Do not maintain homepage article content through Flyway SQL or raw database writes.
- Keep the existing 10 `ac-home-*` homepage slugs so current AC homepage links stay stable.
- Use admin article APIs for create, update and publish:
  - `POST /api/auth/login`
  - `GET /api/admin/articles`
  - `POST /api/admin/articles`
  - `PUT /api/admin/articles/{id}`
  - `PATCH /api/admin/articles/{id}/status`
- Use rich article references in article bodies:
  - `span.tp-content-ref` for item, NPC and Boss references.
  - `div.tp-article-embed.tp-recipe-tree` where a recipe tree is appropriate.
- Every article must define a non-empty `coverImage` backed by a TerraPedia managed image URL or preview asset path.
- Validate every public article by slug after write.

## Files

- Delete: `back/src/main/resources/db/migration/V55__seed_ac_home_original_articles.sql`
- Create: `scripts/content/ac-home-articles.mjs`
- Create: `scripts/content/seed-ac-home-articles.mjs`
- Create: `scripts/content/check-ac-home-article-seed.mjs`
- Modify: `front-nuxt/scripts/check-home-j1-index.mjs`

## Source Chain

`scripts/content/ac-home-articles.mjs`
-> `scripts/content/seed-ac-home-articles.mjs`
-> backend admin article API
-> `articles` table
-> public `/api/articles/slug/<slug>`
-> frontend `/articles/<slug>`
-> AC homepage links in `useHomeData.ts`

## Tasks

- [x] Add a failing seed contract check that rejects the old SQL migration and requires API-managed rich content.
- [x] Delete the SQL seed migration from the working tree.
- [x] Add `scripts/content/ac-home-articles.mjs` with 10 homepage articles, item/NPC/Boss references, one recipe-tree embed, and managed image covers.
- [x] Add `scripts/content/seed-ac-home-articles.mjs` to login, resolve references, upsert by slug, publish, and verify public article responses.
- [x] Enforce non-empty `coverImage` in the article seed contract and write-back verification.
- [x] Extend `front-nuxt/scripts/check-home-j1-index.mjs` so homepage checks also reject SQL article seeds and require the API/rich-content scripts.
- [x] Run the seed script against local backend and publish the 10 articles.

## Validation

- `node scripts/content/check-ac-home-article-seed.mjs`
- `node scripts/content/seed-ac-home-articles.mjs --dry-run`
- `node scripts/content/seed-ac-home-articles.mjs`
- `pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs`
- Public slug smoke for all 10 `ac-home-*` articles, verifying `status = PUBLISHED` and `tp-content-ref` exists.
- Public slug smoke for all 10 `ac-home-*` articles, verifying `coverImage` is present and matches the source file.
- Front preview proxy GET smoke for at least one resolved cover path.
- `pnpm --dir front-nuxt run check`
- `pnpm --dir front-nuxt run check:home-visual-lightweight`
- `git diff --check`

## Execution Notes

- The script updates existing local article IDs `43` through `52` instead of creating duplicates.
- `seed-ac-home-articles.mjs` finds existing articles by paging `/admin/articles` and matching slug locally because the current admin keyword search does not search slug.
- The content reference resolver currently supports the stable public frontend path for `item`, `npc` and `boss`; the articles intentionally use those three reference types.
- Covers use managed TerraPedia image URLs from the same item/NPC/Boss data chain. The article pages resolve these through `resolvePreviewImageUrl` into `/preview-assets/terrapedia-images/...` GET requests.
