# Article Page Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the public article list and article detail pages so published articles look like real readable editorial content, with cover images, stronger typography, better metadata, and responsive card layout.

**Architecture:** Keep the current backend article API unchanged and consume the existing `coverImage`, author, summary, slug, and publish metadata already returned by `/api/articles` and `/api/articles/slug/{slug}`. The Nuxt pages will format those fields into richer editorial cards and detail heroes, using safe image URL resolution and deterministic no-cover fallbacks.

**Tech Stack:** Nuxt 4, Vue SFC, existing `UserArticle` public API type, `usePublicApiFetch`, `resolvePreviewImageUrl`, scoped CSS, existing TerraPedia visual tokens and article page layout classes.

---

## Current Evidence

- Public list page exists at `front-nuxt/pages/articles/index.vue`.
- Public detail page exists at `front-nuxt/pages/articles/[slug].vue`.
- `/api/articles?page=1&limit=5` returns real records with:
  - `title`
  - `summary`
  - `coverImage`
  - `authorDisplayName`
  - `publishedAt`
  - `slug`
- Current list page renders title, summary, author/date, and detail link, but does not render `coverImage`.
- Current detail page renders title, summary, metadata, favorite action, and body text, but does not render `coverImage`.
- Some local records have `coverImage: null`; fallback rendering is required.
- Some local article content contains mojibake from old test data; typography must contain long or broken words without layout overflow.
- Existing contract file `front-nuxt/scripts/check-user-module-contract.mjs` already checks `/articles` and `/articles/[slug]` for public article wiring.

## Closure Definition

- `/articles` visually reads as a public article index, not a plain admin-like list.
- Article cards show a cover image when `article.coverImage` is present.
- Article cards show a consistent no-cover fallback when `coverImage` is absent.
- Article cards show title, summary, author, publish date, and a clear detail link without text collisions.
- Article title and summary typography is readable on desktop and mobile.
- `/articles/[slug]` detail hero shows the article cover when available, and a controlled no-cover visual when not.
- Detail body typography has a readable line length, font size, line height, and paragraph spacing.
- Existing user-module contract still passes and is strengthened to prevent regressing cover rendering.
- Runtime smoke proves:
  - `/api/articles` returns at least one published article with title and slug.
  - `/articles` renders at least one card with title and `/articles/{slug}`.
  - If a published article has `coverImage`, `/articles` includes an image for it.
  - Detail page for one slug renders title, metadata, and cover/fallback area.

## Out Of Scope

- No backend API changes.
- No database writes, article edits, article publishing, or data cleanup.
- No image upload redesign.
- No rich-text editor changes.
- No admin article management changes.
- No route or auth redesign.
- No new landing page or marketing page.
- No global color palette overhaul.

## Source Chain

```text
articles table
-> ArticleMapper public projections including cover_image AS coverImage
-> ArticleController GET /api/articles and GET /api/articles/slug/{slug}
-> front-nuxt/types/public-api.ts UserArticle
-> front-nuxt/pages/articles/index.vue
-> front-nuxt/pages/articles/[slug].vue
-> contract checks + Nuxt typecheck + runtime HTML smoke
```

## Design Direction

Use an editorial index pattern, not a dashboard table:

- The first viewport remains the existing TerraPedia article route shell, but the content area becomes a denser readable feed.
- Cards use a fixed media column and flexible text column on desktop.
- Cards stack cover above text on mobile.
- Cover images use `object-fit: cover`, stable aspect ratio, and safe lazy loading.
- No-cover fallback is visually distinct but restrained:
  - label from `article.title` first character or `TP`
  - subtle surface background
  - small `TerraPedia` / `资料手札` label
- Typography:
  - card title: 20-24px desktop, 18-20px mobile, line-height around 1.25
  - summary: 14-15px, line-height 1.65, max 2-3 lines
  - metadata: 12-13px, compact, subdued contrast
  - detail body: 16px, line-height 1.8, max-width around 760px
- Use wrapping and `overflow-wrap: anywhere` for poor legacy titles rather than clipping the whole card.
- Avoid new decorative orbs, oversized marketing hero, or card-inside-card patterns.

## File Map

- Modify: `front-nuxt/pages/articles/index.vue`
  - Add cover URL helpers, date formatting, no-cover fallback helpers.
  - Replace simple card markup with editorial card markup.
  - Add scoped styles for article cards, cover media, fallback, metadata, pagination.
- Modify: `front-nuxt/pages/articles/[slug].vue`
  - Add cover URL helper and no-cover fallback helper.
  - Render cover/fallback in detail hero.
  - Improve body typography and detail layout spacing.
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`
  - Strengthen public article page contract to require `coverImage` and fallback markers.
- Optional Modify: `front-nuxt/types/public-api.ts`
  - Only if typecheck reveals `coverImage` shape is insufficient. Current `UserArticle.coverImage` already exists, so this should remain unchanged.
- Create: `front-nuxt/scripts/check-article-visual-contract.mjs`
  - Only if the existing user-module contract becomes too broad. Prefer extending `check-user-module-contract.mjs` first.

---

## Task 1: Strengthen Article Visual Contracts

**Files:**
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Add failing contract markers for public article covers**

In the `pages/articles/index.vue` contract, add these required markers:

```js
'resolvePreviewImageUrl',
'articleCoverUrl',
'articleCoverFallback',
'article.coverImage',
'public-article-cover',
'public-article-cover-fallback',
'loading="lazy"',
```

In the `pages/articles/[slug].vue` contract, add these required markers:

```js
'resolvePreviewImageUrl',
'articleCoverUrl',
'articleCoverFallback',
'article.coverImage',
'article-detail-cover',
'article-detail-cover-fallback',
```

- [ ] **Step 2: Run contract and verify RED**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
```

Expected: FAIL because the current public list/detail pages do not render covers or fallbacks.

---

## Task 2: Public Article List Card Redesign

**Files:**
- Modify: `front-nuxt/pages/articles/index.vue`

- [ ] **Step 1: Import image URL resolver**

Add:

```ts
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
```

- [ ] **Step 2: Add article presentation helpers**

Add these helpers in `<script setup>`:

```ts
const articleCoverUrl = (article: UserArticle) => resolvePreviewImageUrl(article.coverImage || '')

const articleCoverFallback = (article: UserArticle) => {
  const source = String(article.title || article.slug || 'TP').trim()
  return source.slice(0, 2).toUpperCase()
}

const articlePublishedLabel = (article: UserArticle) => {
  const raw = article.publishedAt || article.updatedAt || article.createdAt
  if (!raw) return '发布时间未记录'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
```

- [ ] **Step 3: Replace simple article card markup**

Replace each list card body with this structure:

```vue
<article v-for="article in articles" :key="article.id" class="support-panel public-article-card">
  <NuxtLink class="public-article-cover-link" :to="`/articles/${article.slug}`" :aria-label="`阅读 ${article.title}`">
    <img
      v-if="articleCoverUrl(article)"
      class="public-article-cover"
      :src="articleCoverUrl(article)"
      :alt="article.title"
      loading="lazy"
    />
    <span v-else class="public-article-cover public-article-cover-fallback" aria-hidden="true">
      <b>{{ articleCoverFallback(article) }}</b>
      <em>TerraPedia</em>
    </span>
  </NuxtLink>

  <div class="public-article-copy">
    <div class="public-article-kicker">
      <span>文章 #{{ article.id }}</span>
      <span>{{ articlePublishedLabel(article) }}</span>
    </div>
    <h2>
      <NuxtLink :to="`/articles/${article.slug}`">{{ article.title }}</NuxtLink>
    </h2>
    <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
    <div class="public-article-meta">
      <span>{{ article.authorDisplayName || 'TerraPedia 用户' }}</span>
      <NuxtLink class="public-article-read-link" :to="`/articles/${article.slug}`">阅读全文</NuxtLink>
    </div>
  </div>
</article>
```

- [ ] **Step 4: Add responsive editorial card CSS**

Replace the current minimal `.public-article-*` CSS with:

```css
.public-article-list {
  display: grid;
  gap: 16px;
}

.public-article-card {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
  padding: 16px;
}

.public-article-cover-link {
  display: block;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.public-article-cover {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 138px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 20%, var(--index-line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--index-surface) 82%, #101827);
  object-fit: cover;
}

.public-article-cover-fallback {
  display: grid;
  place-items: center;
  gap: 6px;
  text-align: center;
}

.public-article-cover-fallback b {
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 1;
}

.public-article-cover-fallback em {
  color: var(--text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.public-article-copy {
  display: grid;
  align-content: center;
  gap: 10px;
  min-width: 0;
}

.public-article-kicker,
.public-article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.public-article-card h2 {
  margin: 0;
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.public-article-card h2 a {
  color: inherit;
  text-decoration: none;
}

.public-article-card h2 a:hover {
  color: #ffd765;
}

.public-article-card p {
  max-width: 68ch;
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.public-article-read-link {
  color: #ffd765;
  font-weight: 900;
  text-decoration: none;
}

.public-article-read-link:hover {
  text-decoration: underline;
}

@media (max-width: 820px) {
  .public-article-card {
    grid-template-columns: 1fr;
  }

  .public-article-cover {
    min-height: 180px;
  }
}

@media (max-width: 520px) {
  .public-article-card {
    padding: 12px;
  }

  .public-article-card h2 {
    font-size: 19px;
  }

  .public-article-cover {
    min-height: 150px;
  }
}
```

- [ ] **Step 5: Run frontend checks**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
```

Expected: pass.

---

## Task 3: Article Detail Cover And Reading Typography

**Files:**
- Modify: `front-nuxt/pages/articles/[slug].vue`

- [ ] **Step 1: Import image URL resolver**

Add:

```ts
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
```

- [ ] **Step 2: Add detail cover helpers**

Add:

```ts
const articleCoverUrl = computed(() => resolvePreviewImageUrl(article.value?.coverImage || ''))
const articleCoverFallback = computed(() => {
  const source = String(article.value?.title || article.value?.slug || 'TP').trim()
  return source.slice(0, 2).toUpperCase()
})
```

- [ ] **Step 3: Add cover block to detail hero**

Inside the loaded `article-detail-hero`, after summary and before metadata, add:

```vue
<figure class="article-detail-cover-frame">
  <img
    v-if="articleCoverUrl"
    class="article-detail-cover"
    :src="articleCoverUrl"
    :alt="article.title"
  />
  <span v-else class="article-detail-cover article-detail-cover-fallback" aria-hidden="true">
    <b>{{ articleCoverFallback }}</b>
    <em>资料手札</em>
  </span>
</figure>
```

- [ ] **Step 4: Improve body markup**

Change:

```vue
<p class="article-content-text">{{ articleBodyText }}</p>
```

To:

```vue
<div class="article-content-text">{{ articleBodyText }}</div>
```

Reason: the body can contain multiple paragraphs after stripping HTML. A `div` with `white-space: pre-wrap` is more semantically stable than one giant paragraph.

- [ ] **Step 5: Add detail CSS**

Add or replace scoped CSS:

```css
.article-detail-cover-frame {
  width: min(100%, 880px);
  margin: 22px 0 0;
}

.article-detail-cover {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 460px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 20%, var(--index-line));
  border-radius: 18px;
  background: color-mix(in srgb, var(--index-surface) 82%, #101827);
  object-fit: cover;
}

.article-detail-cover-fallback {
  display: grid;
  place-items: center;
  gap: 8px;
  text-align: center;
}

.article-detail-cover-fallback b {
  color: var(--text-strong);
  font-family: var(--font-display);
  font-size: 48px;
  line-height: 1;
}

.article-detail-cover-fallback em {
  color: var(--text-muted);
  font-size: 13px;
  font-style: normal;
  font-weight: 900;
  letter-spacing: 0;
}

.article-content-text {
  max-width: 760px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: 16px;
  line-height: 1.82;
}

.article-body-panel {
  display: grid;
  gap: 18px;
}

@media (max-width: 720px) {
  .article-detail-cover-frame {
    margin-top: 16px;
  }

  .article-detail-cover {
    border-radius: 14px;
  }

  .article-detail-cover-fallback b {
    font-size: 34px;
  }
}
```

- [ ] **Step 6: Run frontend checks**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
```

Expected: pass.

---

## Task 4: Runtime Visual Smoke

**Files:**
- No source edits unless smoke reveals a real issue.
- Runtime screenshots under ignored `reports/screenshots/` if created.

- [ ] **Step 1: Start or reuse local stack**

Run:

```bash
bash scripts/dev/start-local-stack.sh --reuse-existing
```

Expected:

```text
back(18088): true
front(5174): true
data-query-app(3001): true
```

- [ ] **Step 2: API fixture check**

Run:

```bash
ARTICLE_JSON="$(curl -sS 'http://127.0.0.1:18088/api/articles?page=1&limit=10')"
ARTICLE_JSON="$ARTICLE_JSON" node -e "
const payload = JSON.parse(process.env.ARTICLE_JSON)
const list = Array.isArray(payload.data) ? payload.data : []
if (!payload.success || !list.length) throw new Error('no public articles returned')
const first = list.find(article => article.title && article.slug)
if (!first) throw new Error('no public article has title and slug')
const withCover = list.find(article => article.coverImage)
console.log(JSON.stringify({ first: first.slug, withCover: withCover?.slug || null, total: payload.pagination?.total }, null, 2))
"
```

Expected: prints one valid slug and whether a cover fixture exists.

If no published article has `coverImage`, the cover-image branch cannot be runtime-proven without local test data. Do not mutate the DB silently; record that runtime cover branch was blocked by missing local fixture.

- [ ] **Step 3: HTML smoke for list**

Run:

```bash
curl -sS 'http://127.0.0.1:5174/articles' > /tmp/terrapedia-articles.html
rg 'public-article-cover|public-article-cover-fallback|public-article-card|/articles/' /tmp/terrapedia-articles.html
```

Expected:

```text
public-article-card
public-article-cover
public-article-cover-fallback
/articles/
```

If SSR output contains only one of cover/fallback because the current first page data lacks the other, use browser screenshot smoke in Step 4.

- [ ] **Step 4: Browser screenshot smoke**

Use Playwright or the existing browser tooling to inspect:

```text
http://localhost:5174/articles
http://localhost:5174/articles/{slug-from-step-2}
```

Desktop viewport:

```text
1440x1000
```

Mobile viewport:

```text
390x844
```

Acceptance:

- Card cover/fallback is visible.
- Title does not collide with image, metadata, or button.
- Long mojibake titles wrap inside the card instead of overflowing.
- Summary remains readable and does not push cards into unstable layouts.
- Detail cover/fallback is visible above metadata/body.
- Body text line length is readable and not full-viewport wide on desktop.
- No horizontal scroll on mobile.

- [ ] **Step 5: Final validation**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
cd ..
git diff --check
```

Expected: pass.

---

## Task 5: Review And Commit

**Files:**
- `front-nuxt/pages/articles/index.vue`
- `front-nuxt/pages/articles/[slug].vue`
- `front-nuxt/scripts/check-user-module-contract.mjs`
- optional `front-nuxt/scripts/check-article-visual-contract.mjs`

- [ ] **Step 1: Review staged scope**

Run:

```bash
git status --short
git diff --stat
git diff -- front-nuxt/pages/articles/index.vue front-nuxt/pages/articles/[slug].vue front-nuxt/scripts/check-user-module-contract.mjs
```

- [ ] **Step 2: Request code review**

Ask a review agent to check:

- cover/fallback branches
- mobile layout
- typography
- contract strength
- no backend/data scope drift

- [ ] **Step 3: Commit after validation**

Run:

```bash
git add \
  front-nuxt/pages/articles/index.vue \
  front-nuxt/pages/articles/[slug].vue \
  front-nuxt/scripts/check-user-module-contract.mjs
git diff --cached --stat
git diff --cached --check
git commit -m "style(article): polish public article pages"
```

Do not push unless explicitly requested.

---

## Validation Summary

Minimum commands before saying complete:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
cd ..
git diff --check
```

Runtime commands before saying visually verified:

```bash
bash scripts/dev/start-local-stack.sh --reuse-existing
curl -sS 'http://127.0.0.1:18088/api/articles?page=1&limit=10'
curl -sS 'http://127.0.0.1:5174/articles'
```

Visual screenshot checks are required before final UI acceptance if this plan is executed, because the user's complaint is about page quality, typography, and cover visibility.
