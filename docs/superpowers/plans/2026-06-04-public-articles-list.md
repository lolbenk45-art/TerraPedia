# Public Articles List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/articles` render real published backend articles instead of the current placeholder page.

**Architecture:** Keep backend read APIs unchanged because `/api/articles` already returns published articles. Replace only the Nuxt public article list page with a real API-backed list, preserve V0.1 article visual language, and guard against future placeholder regressions with contract checks.

**Tech Stack:** Spring Boot 3 public article APIs, Nuxt 4, Pinia user/favorites stores, existing `usePublicApiFetch`, existing V0.1 CSS classes.

---

## Root Cause Evidence

- Runtime API check: `curl http://127.0.0.1:18088/api/articles?page=1&limit=5` returned `success=true`, `count=5`, `pagination.total=11`.
- Returned records include `status=PUBLISHED` and `reviewStatus=APPROVED`, for example article `id=30`, `title=123`, `slug=123`.
- Backend route exists in `back/src/main/java/com/terraria/skills/controller/ArticleController.java`:
  - `GET /articles`
  - `GET /articles/{id}`
  - `GET /articles/slug/{slug}`
- Mapper filters published articles in `back/src/main/resources/mapper/ArticleMapper.xml` with `a.status = 'PUBLISHED'`.
- Frontend `/articles` is still placeholder-only in `front-nuxt/pages/articles/index.vue`, with copy including:
  - `公开文章暂未开放`
  - `真实文章待接入`
  - `文章页不再展示静态攻略样例`

## Closure Definition

This plan is complete when:

- `/articles` loads real published articles from `/api/articles`.
- A published article row/card links to `/articles/{slug}`.
- Empty state appears only when `/api/articles` returns zero published records.
- Placeholder copy saying public articles are not open is removed.
- Existing `/articles/[slug]` detail page continues to load by slug and can favorite by `article.id`.
- Runtime smoke proves the first page displays the API article titles currently returned by the backend.

## Out Of Scope

- Backend article schema changes.
- Admin article publishing flow changes.
- Rich HTML rendering or sanitizer changes beyond the existing detail page's safe text approach.
- Article list search facets beyond keyword and pagination.
- Author public profile pages.
- Article cover upload workflow.
- Crawler, import, wiki sync, or database backfill work.

## Files

- Modify: `front-nuxt/pages/articles/index.vue`
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`
- Optional modify if type reuse is insufficient: `front-nuxt/types/public-api.ts`
- No planned backend writes.

## Multi-Agent Ownership

- **Agent A: Article List UI**
  - Owns `front-nuxt/pages/articles/index.vue`.
  - Implements data loading, article cards, pagination, loading/error/empty states.

- **Agent B: Contract And Review**
  - Owns `front-nuxt/scripts/check-user-module-contract.mjs`.
  - Adds regression checks that `/articles` cannot return to placeholder-only copy.
  - Reviews that list links use real `article.slug`.

Agents must not write the same file at the same time. If only one agent is available, execute Task 1 then Task 2 sequentially.

---

## Task 1: Add A Failing Contract For Public Article List

**Files:**

- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Add `/articles` page contract**

Add a contract entry for `pages/articles/index.vue` requiring real API-backed markers and forbidding placeholder text:

```js
{
  path: 'pages/articles/index.vue',
  required: [
    'usePublicApiFetch<UserArticle[]>',
    "'/articles'",
    'articlePagination',
    'articleError',
    'articleLoading',
    '`/articles/${article.slug}`',
    'article.title',
    'article.summary',
  ],
  forbidden: [
    '公开文章暂未开放',
    '真实文章待接入',
    '后续接入真实内容',
    '等公开文章来源和发布状态接入后',
  ],
}
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
```

Expected before implementation:

```text
pages/articles/index.vue: page contract must include usePublicApiFetch<UserArticle[]>
pages/articles/index.vue: page must not remain preview-only with 公开文章暂未开放
```

- [ ] **Step 3: Commit is not allowed yet**

Do not commit after the failing contract alone. Continue to Task 2 and make the contract pass in the same feature commit.

---

## Task 2: Implement Real Public Article List Page

**Files:**

- Modify: `front-nuxt/pages/articles/index.vue`

- [ ] **Step 1: Import API helpers and type**

Use existing public API helper and the existing `UserArticle` shape:

```ts
import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
import { usePublicApiFetch } from '~/composables/usePublicApi'
```

- [ ] **Step 2: Add query state and loader**

Implement page, pagination, loading, and error state:

```ts
const route = useRoute()
const router = useRouter()

const currentPage = computed(() => {
  const value = Number(route.query.page ?? 1)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})

const keyword = computed(() => String(route.query.keyword ?? '').trim())
const articleLimit = 10
const articleError = ref('')

const { data: articleResponse, pending: articlePending, error: articleFetchError, refresh } = await useAsyncData(
  () => `public-articles:${currentPage.value}:${keyword.value}`,
  () => usePublicApiFetch<UserArticle[]>('/articles', {
    query: {
      page: currentPage.value,
      limit: articleLimit,
      keyword: keyword.value || undefined,
    },
  }),
  { watch: [currentPage, keyword] },
)

const articles = computed(() => {
  const data = (articleResponse.value as ApiResponse<UserArticle[]> | null)?.data
  return Array.isArray(data) ? data.filter((article) => article.slug) : []
})

const articlePagination = computed<Pagination>(() => (
  (articleResponse.value as ApiResponse<UserArticle[]> | null)?.pagination ?? {
    total: articles.value.length,
    page: currentPage.value,
    limit: articleLimit,
    totalPages: 1,
  }
))

const articleLoading = computed(() => articlePending.value)

watch(articleFetchError, (error) => {
  articleError.value = error ? '文章列表加载失败。' : ''
}, { immediate: true })
```

- [ ] **Step 3: Add pagination helpers**

Add helpers that keep query params stable:

```ts
const totalPages = computed(() => Math.max(1, Number(articlePagination.value.totalPages ?? 1)))
const hasPreviousPage = computed(() => currentPage.value > 1)
const hasNextPage = computed(() => currentPage.value < totalPages.value)

const pageHref = (page: number) => ({
  path: '/articles',
  query: {
    ...(keyword.value ? { keyword: keyword.value } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  },
})

const goToPage = async (page: number) => {
  if (page < 1 || page > totalPages.value) return
  await router.push(pageHref(page))
}

const retryLoad = async () => {
  articleError.value = ''
  await refresh()
}
```

- [ ] **Step 4: Replace placeholder hero copy**

The page head must describe the real list:

```vue
<span class="eyebrow">资料手札 · published articles</span>
<h1>资料手札</h1>
<p>浏览已经发布的用户文章和专题资料，草稿与待审核内容不会出现在公开列表。</p>
```

- [ ] **Step 5: Render loading, error, empty, and article cards**

Replace the current static `article-lead` and route-only content with API-backed states:

```vue
<section class="article-panel article-route-system">
  <div v-if="articleLoading" class="support-panel user-form-status">文章加载中...</div>

  <div v-else-if="articleError" class="support-panel user-form-status user-form-error">
    <span>{{ articleError }}</span>
    <button class="secondary-button" type="button" @click="retryLoad">重试</button>
  </div>

  <div v-else-if="!articles.length" class="article-lead article-route-lead">
    <div>
      <span class="eyebrow">暂无公开文章</span>
      <h2>还没有已发布内容</h2>
      <p>后台发布文章后，会自动出现在这里。</p>
    </div>
  </div>

  <div v-else class="public-article-list">
    <article v-for="article in articles" :key="article.id" class="support-panel public-article-card">
      <div>
        <span class="eyebrow">文章 #{{ article.id }}</span>
        <h2>{{ article.title }}</h2>
        <p>{{ article.summary || '这篇文章暂无摘要。' }}</p>
        <div class="article-meta">
          <span>{{ article.authorDisplayName || 'TerraPedia 用户' }}</span>
          <span>{{ article.publishedAt || article.updatedAt || article.createdAt || '发布时间未记录' }}</span>
        </div>
      </div>
      <a class="secondary-button" :href="`/articles/${article.slug}`">阅读全文</a>
    </article>
  </div>
</section>
```

- [ ] **Step 6: Render pagination only when needed**

Add pagination under the article cards:

```vue
<nav v-if="totalPages > 1" class="article-pagination" aria-label="文章分页">
  <button class="secondary-button" type="button" :disabled="!hasPreviousPage" @click="goToPage(currentPage - 1)">上一页</button>
  <span>第 {{ currentPage }} / {{ totalPages }} 页</span>
  <button class="secondary-button" type="button" :disabled="!hasNextPage" @click="goToPage(currentPage + 1)">下一页</button>
</nav>
```

- [ ] **Step 7: Keep side panel truthful**

The side panel should describe the real list, not a future promise:

```vue
<span class="eyebrow">公开规则</span>
<div class="toc-list">
  <div class="toc-item"><span class="toc-num">01</span><div><b>只显示已发布</b><span>草稿和待审核不会公开</span></div></div>
  <div class="toc-item"><span class="toc-num">02</span><div><b>链接到详情页</b><span>使用文章 slug 打开正文</span></div></div>
  <div class="toc-item"><span class="toc-num">03</span><div><b>可收藏文章</b><span>登录后在详情页收藏</span></div></div>
</div>
```

- [ ] **Step 8: Add scoped CSS for list layout**

Keep the existing V0.1 panel style and avoid nested cards:

```css
.public-article-list {
  display: grid;
  gap: 14px;
}

.public-article-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
}

.public-article-card h2 {
  margin: 8px 0 10px;
  font-size: 24px;
}

.public-article-card p {
  margin: 0;
  color: rgba(244, 234, 208, 0.66);
  line-height: 1.65;
}

.article-pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
}

@media (max-width: 640px) {
  .public-article-card {
    grid-template-columns: 1fr;
  }

  .public-article-card .secondary-button {
    width: fit-content;
  }
}
```

---

## Task 3: Verify Public Article Runtime Chain

**Files:**

- No planned writes.

- [ ] **Step 1: Run contract check**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
```

Expected:

```text
User module contract checks passed.
```

- [ ] **Step 2: Run full Nuxt check**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected:

```text
exit code 0
```

Known acceptable warning:

```text
[DEP0205] DeprecationWarning: module.register() is deprecated.
```

- [ ] **Step 3: Verify backend API has published data**

Run:

```bash
curl -sS 'http://127.0.0.1:18088/api/articles?page=1&limit=5'
```

Expected:

```json
{
  "success": true,
  "data": [
    {
      "status": "PUBLISHED",
      "reviewStatus": "APPROVED",
      "slug": "..."
    }
  ],
  "pagination": {
    "total": 1
  }
}
```

The exact `total` may be higher; on 2026-06-04 local runtime it was `11`.

- [ ] **Step 4: Verify `/articles` no longer renders placeholder copy**

Run:

```bash
curl -sS 'http://127.0.0.1:5174/articles' | rg '公开文章暂未开放|真实文章待接入|后续接入真实内容'
```

Expected:

```text
no output
```

- [ ] **Step 5: Verify `/articles` renders a backend article**

Run:

```bash
curl -sS 'http://127.0.0.1:5174/articles' | rg '阅读全文|文章 #|123'
```

Expected:

```text
matches for article list content
```

If local DB no longer contains article title `123`, use the first title returned by `/api/articles?page=1&limit=1`.

- [ ] **Step 6: Verify detail link path**

Run:

```bash
curl -sS 'http://127.0.0.1:5174/articles' | rg '/articles/[^"]+'
```

Expected:

```text
at least one article detail link using a slug
```

---

## Task 4: Commit

**Files:**

- `front-nuxt/pages/articles/index.vue`
- `front-nuxt/scripts/check-user-module-contract.mjs`
- `front-nuxt/types/public-api.ts` only if actually changed

- [ ] **Step 1: Check unstaged and staged scope**

Run:

```bash
git status --short
git diff --cached --stat
```

Expected:

```text
Only public article list files are staged.
```

- [ ] **Step 2: Stage explicit files**

Run:

```bash
git add front-nuxt/pages/articles/index.vue front-nuxt/scripts/check-user-module-contract.mjs
```

If `front-nuxt/types/public-api.ts` was changed for a real type need:

```bash
git add front-nuxt/types/public-api.ts
```

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "feat(front): show published article list"
```

---

## Plan Audit

## Verdict

- Status: execution-ready.
- Main goal: fix `/articles` showing placeholder content while backend has published articles.
- Closure definition: `/articles` renders real `/api/articles` records and links to `/articles/{slug}`.

## Blocking Plan Defects

- Critical: none.
- Important: none.

## Plan Repairs

- Change: treat this as a frontend list-page integration bug, not a backend publishing bug.
- Reason: runtime `/api/articles` already returns 11 published records.
- Validation added: runtime curl checks compare backend API output with frontend `/articles` HTML.

## Execution-Ready Plan

- Scope: public article index page and contract checks only.
- Agent split: one UI owner and one contract/review owner, or sequential execution if single agent.
- Smoke test: `/api/articles` returns records, `/articles` no longer contains placeholder text, `/articles` contains article cards and slug links.
- Final validation: `pnpm run check:user-module`, `pnpm run check`, curl runtime checks.

## Residual Risk

- Risk: existing published article titles may contain mojibake from old data.
- Follow-up trigger: if the list renders unreadable titles, create a separate data-quality plan for article title/content cleanup. Do not mix data cleanup into this list-page fix.
