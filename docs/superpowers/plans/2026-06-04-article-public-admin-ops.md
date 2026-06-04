# Article Public And Admin Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make published articles publicly browsable and make admin article review operations usable by exposing article content and clear publish/offline actions.

**Architecture:** Reuse the existing backend article source of truth: `/api/articles` for public published reads and `/api/admin/articles` for admin reads/actions. The frontend public list replaces the placeholder `/articles` page with API data, while the admin app adds a content preview/detail path and contract tests around existing admin operations.

**Tech Stack:** Spring Boot 3, MyBatis Plus, Nuxt 4 front-nuxt, Nuxt 4 data-query-app, Pinia, existing article DTOs and article review workflow.

---

## Current Evidence

- Backend public APIs already exist:
  - `GET /api/articles`
  - `GET /api/articles/{id}`
  - `GET /api/articles/slug/{slug}`
- Backend admin APIs already exist:
  - `GET /api/admin/articles`
  - `GET /api/admin/articles/{id}`
  - `POST /api/admin/articles/{id}/review`
  - `POST /api/admin/articles/{id}/publish`
  - `POST /api/admin/articles/{id}/offline`
  - `GET /api/admin/articles/{id}/review-logs`
- `ArticleDTO` exposes `contentHtml` and `contentMarkdown`; mapper projections include `content_html AS contentHtml`.
- Frontend `/articles/[slug]` already reads published article detail by slug.
- Frontend `/articles` is placeholder-only and contains copy such as `公开文章暂未开放` and `真实文章待接入`.
- Admin `/articles` already has approve/reject/publish/offline/log buttons, but it does not show article body content and disables the editor route for `PENDING_REVIEW`, exactly when the admin needs read-only review access.

## Closure Definition

- Anonymous/public users can open `/articles` and see real published articles returned by `/api/articles`.
- Public article cards link to `/articles/{slug}` and `/articles/{slug}` continues to load detail by slug.
- Placeholder copy claiming public articles are unavailable is removed and covered by a contract check.
- Admin users can inspect article body content from `/articles` before approve/reject/publish/offline decisions.
- Pending-review articles have a usable read-only content path; they are not blocked by the list page disabling the only route to the editor.
- Admin page labels make `Offline` clearly equivalent to unpublish/downline behavior.
- Backend controller contract tests prove public list/detail and admin detail/action endpoints return content and update status as expected.
- Runtime smoke proves `/api/articles` returns published records and `/articles` renders the first published title.

## Out Of Scope

- Crawler, import, wiki refresh, data backfill, or production DB writes.
- New role model, permission redesign, or admin auth rewrite.
- Rich-text editor redesign.
- Article image upload redesign.
- Public comments, likes, follows, SEO expansion, or author profile redesign.
- Changing the canonical backend route from `/api/articles` to `/api/public/articles`.

## Source Chain

```text
articles table
-> ArticleMapper.xml projections
-> ArticleService public/admin methods
-> ArticleController / AdminArticleController
-> front-nuxt /articles and /articles/[slug]
-> data-query-app /articles and /article-editor/[id]
-> contract checks + local runtime smoke
```

## Agent Split

- **Agent A: Public Article Frontend**
  - Owns:
    - `front-nuxt/pages/articles/index.vue`
    - `front-nuxt/scripts/check-user-module-contract.mjs`
  - Must not edit backend or admin app files.

- **Agent B: Admin Article Management UX**
  - Owns:
    - `data-query-app/pages/articles.vue`
    - `data-query-app/stores/articles.ts`
    - `data-query-app/tests/admin-articles-page-contract.test.mjs`
  - Must not edit backend or front-nuxt files.

- **Agent C: Backend Article Contracts**
  - Owns:
    - `back/src/test/java/com/terraria/skills/controller/ArticleControllerTest.java`
    - `back/src/test/java/com/terraria/skills/controller/AdminArticleControllerTest.java`
  - May edit backend production files only if tests reveal a real contract gap.

No two agents may write the same file. If an agent finds a required change outside its ownership, stop and repair this plan before writing that file.

---

## Task 1: Public Article List Contract And Page

**Files:**
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`
- Modify: `front-nuxt/pages/articles/index.vue`

- [ ] **Step 1: Add failing `/articles` contract**

Add this contract entry to `pageContracts` in `front-nuxt/scripts/check-user-module-contract.mjs`:

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

- [ ] **Step 2: Verify contract fails before page implementation**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
```

Expected: FAIL because `pages/articles/index.vue` is still placeholder-only and lacks `usePublicApiFetch<UserArticle[]>`.

- [ ] **Step 3: Replace `/articles` placeholder with API-backed list**

In `front-nuxt/pages/articles/index.vue`, replace the script with:

```vue
<script setup lang="ts">
import type { ApiResponse, Pagination, UserArticle } from '~/types/public-api'
import { usePublicApiFetch } from '~/composables/usePublicApi'

const route = useRoute()
const router = useRouter()

const currentPage = computed(() => {
  const value = Number(route.query.page ?? 1)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})
const keyword = computed(() => String(route.query.keyword ?? '').trim())
const articleLimit = 10
const articleError = ref('')
const articleDataKey = computed(() => `public-articles:${currentPage.value}:${keyword.value}`)

const { data: articleResponse, pending: articlePending, error: articleFetchError, refresh } = await useAsyncData(
  articleDataKey,
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
const totalPages = computed(() => Math.max(1, Number(articlePagination.value.totalPages ?? 1)))
const hasPreviousPage = computed(() => currentPage.value > 1)
const hasNextPage = computed(() => currentPage.value < totalPages.value)

watch(articleFetchError, (error) => {
  articleError.value = error ? '文章列表加载失败。' : ''
}, { immediate: true })

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

useSeoMeta({
  title: 'TerraPedia · 资料手札',
  description: '浏览 TerraPedia 已发布的用户文章和专题资料。',
})
</script>
```

Replace the placeholder template with API states that include all required markers:

```vue
<template>
  <section class="screen article-screen active" :aria-busy="articleLoading">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">资料手札 · published articles</span>
          <h1>资料手札</h1>
          <p>浏览已经发布的用户文章和专题资料，草稿与待审核内容不会出现在公开列表。</p>
        </div>
        <NuxtLink class="secondary-button" to="/user/articles">写文章</NuxtLink>
      </div>
    </div>

    <div class="article-layout discovery-articles-page">
      <section class="article-panel article-route-system">
        <div v-if="articleLoading" class="support-panel user-form-status">文章加载中...</div>

        <div v-else-if="articleError" class="support-panel user-form-status user-form-error">
          <span>{{ articleError }}</span>
          <button class="secondary-button" type="button" @click="retryLoad">重试</button>
        </div>

        <article v-else-if="!articles.length" class="article-lead article-route-lead">
          <div>
            <span class="eyebrow">暂无公开文章</span>
            <h2>还没有已发布内容</h2>
            <p>后台发布文章后，会自动出现在这里。</p>
          </div>
        </article>

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
            <NuxtLink class="secondary-button" :to="`/articles/${article.slug}`">阅读全文</NuxtLink>
          </article>
        </div>

        <div v-if="totalPages > 1" class="article-pagination support-panel">
          <button class="secondary-button" type="button" :disabled="!hasPreviousPage" @click="goToPage(currentPage - 1)">上一页</button>
          <span>第 {{ currentPage }} / {{ totalPages }} 页</span>
          <button class="secondary-button" type="button" :disabled="!hasNextPage" @click="goToPage(currentPage + 1)">下一页</button>
        </div>
      </section>

      <aside class="article-side article-route-side">
        <span class="eyebrow">公开规则</span>
        <div class="toc-list">
          <div class="toc-item"><span class="toc-num">01</span><div><b>只显示已发布</b><span>草稿和审核中内容不会公开</span></div></div>
          <div class="toc-item"><span class="toc-num">02</span><div><b>按发布时间浏览</b><span>从最新内容开始阅读</span></div></div>
          <div class="toc-item"><span class="toc-num">03</span><div><b>详情页收藏</b><span>登录后可收藏公开文章</span></div></div>
        </div>
      </aside>
    </div>

    <TerraFooter />
  </section>
</template>
```

Add scoped CSS:

```css
<style scoped>
.public-article-list {
  display: grid;
  gap: 14px;
}

.public-article-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.public-article-card h2 {
  margin: 6px 0 8px;
  font-size: 1.12rem;
}

.public-article-card p {
  margin: 0;
  color: var(--text-muted);
}

.article-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

@media (max-width: 720px) {
  .public-article-card {
    grid-template-columns: 1fr;
  }
}
</style>
```

- [ ] **Step 4: Verify public article frontend**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
```

Expected: both pass.

Do not commit from this task. Keep the changes in the feature branch worktree for final validation and one focused commit.

---

## Task 2: Admin Article Content Review UX

**Files:**
- Create: `data-query-app/tests/admin-articles-page-contract.test.mjs`
- Modify: `data-query-app/pages/articles.vue`

- [ ] **Step 1: Add failing admin article page contract**

Create `data-query-app/tests/admin-articles-page-contract.test.mjs`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const articlesPage = fs.readFileSync(path.join(repoRoot, 'pages/articles.vue'), 'utf8')

test('admin articles page exposes body preview and does not block pending review content access', () => {
  assert.match(articlesPage, /View Content/)
  assert.match(articlesPage, /contentPreviewVisible/)
  assert.match(articlesPage, /contentPreviewArticle/)
  assert.match(articlesPage, /contentPreviewArticle\.value\?\.contentHtml/)
  assert.match(articlesPage, /previewArticleContent/)
  assert.match(articlesPage, /openContentPreview\(row\)/)
  assert.match(articlesPage, /articlesStore\.fetchArticleById\(row\.id\)/)
  assert.doesNotMatch(articlesPage, /:disabled="row\.reviewStatus === 'PENDING_REVIEW'"/)
})

test('admin articles page labels offline as unpublish and keeps existing moderation actions', () => {
  assert.match(articlesPage, /Unpublish/)
  assert.match(articlesPage, /approveReview\(row\)/)
  assert.match(articlesPage, /openReject\(row\)/)
  assert.match(articlesPage, /publishArticle\(row\)/)
  assert.match(articlesPage, /offlineArticle\(row\)/)
})
```

- [ ] **Step 2: Run contract and verify RED**

Run:

```bash
cd data-query-app
node --test tests/admin-articles-page-contract.test.mjs
```

Expected: FAIL because the page does not yet expose content preview and still disables pending-review editor access.

- [ ] **Step 3: Add admin content preview modal state**

In `data-query-app/pages/articles.vue`, add state near existing modal refs:

```ts
const contentPreviewVisible = ref(false)
const contentPreviewLoading = ref(false)
const contentPreviewArticle = ref<AdminArticle | null>(null)
```

Add content text helper:

```ts
const previewArticleContent = computed(() => {
  const raw = String(contentPreviewArticle.value?.contentHtml ?? contentPreviewArticle.value?.contentMarkdown ?? '').trim()
  if (!raw) return 'No article body content.'
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
})
```

Add action:

```ts
const openContentPreview = async (row: AdminArticle) => {
  contentPreviewVisible.value = true
  contentPreviewArticle.value = row
  contentPreviewLoading.value = true
  actionKey.value = getActionKey(row.id, 'content-preview')
  try {
    contentPreviewArticle.value = await articlesStore.fetchArticleById(row.id)
  } catch (error: any) {
    showToast(getErrorMessage(error, 'Failed to load article content'), 'error')
  } finally {
    contentPreviewLoading.value = false
    actionKey.value = ''
  }
}
```

- [ ] **Step 4: Add View Content button and allow pending review editor route**

In the row action area, replace the existing `Continue Writing` button disabled rule with two actions:

```vue
<button
  type="button"
  class="action-link"
  :disabled="isActionLoading(row.id, 'content-preview')"
  @click="openContentPreview(row)"
>
  {{ isActionLoading(row.id, 'content-preview') ? 'Loading...' : 'View Content' }}
</button>
<button
  type="button"
  class="action-link"
  @click="openEdit(row.id)"
>
  {{ row.reviewStatus === 'PENDING_REVIEW' ? 'Read-only Editor' : 'Continue Writing' }}
</button>
```

Change offline button label to:

```vue
{{ isActionLoading(row.id, 'offline') ? 'Unpublishing...' : 'Unpublish' }}
```

- [ ] **Step 5: Add content preview modal**

Below the reject modal, add:

```vue
<AppModal v-model="contentPreviewVisible" title="Article Content" width="820px">
  <div class="content-preview">
    <h3>#{{ contentPreviewArticle?.id || '--' }} {{ contentPreviewArticle?.title || '' }}</h3>
    <div class="content-preview__meta">
      <span>{{ contentPreviewArticle?.status || '--' }}</span>
      <span>{{ contentPreviewArticle?.reviewStatus || '--' }}</span>
      <span>{{ formatDateTime(contentPreviewArticle?.updatedAt || contentPreviewArticle?.createdAt) }}</span>
    </div>
    <div v-if="contentPreviewLoading" class="empty-text empty-text--compact">Loading article content...</div>
    <pre v-else class="content-preview__body">{{ previewArticleContent }}</pre>
  </div>
</AppModal>
```

Add CSS:

```css
.content-preview {
  display: grid;
  gap: 12px;
}

.content-preview h3 {
  margin: 0;
}

.content-preview__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.content-preview__body {
  max-height: 58vh;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font: inherit;
  line-height: 1.7;
}
```

- [ ] **Step 6: Verify admin app**

Run:

```bash
cd data-query-app
node --test tests/admin-articles-page-contract.test.mjs
pnpm run check
```

Expected: pass.

Do not commit from this task. Keep the changes in the feature branch worktree for final validation and one focused commit.

---

## Task 3: Backend Article Controller Contracts

**Files:**
- Create: `back/src/test/java/com/terraria/skills/controller/ArticleControllerTest.java`
- Create: `back/src/test/java/com/terraria/skills/controller/AdminArticleControllerTest.java`

- [ ] **Step 1: Add public article controller tests**

Create `back/src/test/java/com/terraria/skills/controller/ArticleControllerTest.java`:

```java
package com.terraria.skills.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.service.ArticleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ArticleControllerTest {

    private ArticleService articleService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        articleService = mock(ArticleService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new ArticleController(articleService)).build();
    }

    @Test
    void shouldReturnPublishedArticleListWithContentAndPagination() throws Exception {
        ArticleDTO article = article(7L, "Guide", "guide", "Summary", "<p>Body</p>", "PUBLISHED", "APPROVED");
        Page<ArticleDTO> page = new Page<>(1, 5, 1);
        page.setRecords(List.of(article));
        when(articleService.getPublishedArticles(1, 5, "guide")).thenReturn(page);

        mockMvc.perform(get("/articles").param("page", "1").param("limit", "5").param("keyword", "guide"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(7))
            .andExpect(jsonPath("$.data[0].slug").value("guide"))
            .andExpect(jsonPath("$.data[0].contentHtml").value("<p>Body</p>"))
            .andExpect(jsonPath("$.pagination.total").value(1));

        verify(articleService).getPublishedArticles(eq(1), eq(5), eq("guide"));
    }

    @Test
    void shouldReturnPublishedArticleBySlug() throws Exception {
        when(articleService.getPublishedArticleBySlug("guide"))
            .thenReturn(article(7L, "Guide", "guide", null, "<p>Body</p>", "PUBLISHED", "APPROVED"));

        mockMvc.perform(get("/articles/slug/guide"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.slug").value("guide"))
            .andExpect(jsonPath("$.data.contentHtml").value("<p>Body</p>"));
    }

    private ArticleDTO article(Long id, String title, String slug, String summary, String contentHtml, String status, String reviewStatus) {
        ArticleDTO article = new ArticleDTO();
        article.setId(id);
        article.setTitle(title);
        article.setSlug(slug);
        article.setSummary(summary);
        article.setContentHtml(contentHtml);
        article.setStatus(status);
        article.setReviewStatus(reviewStatus);
        return article;
    }
}
```

- [ ] **Step 2: Add admin article controller tests**

Create `back/src/test/java/com/terraria/skills/controller/AdminArticleControllerTest.java`:

```java
package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.auth.AdminAuthenticationInterceptor;
import com.terraria.skills.auth.AdminTokenClaims;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.service.ArticleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AdminArticleControllerTest {

    private ArticleService articleService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        articleService = mock(ArticleService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new AdminArticleController(articleService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnAdminArticleDetailWithBodyContent() throws Exception {
        when(articleService.getAdminArticleById(7L))
            .thenReturn(article(7L, "Guide", "<p>Admin body</p>", "PUBLISHED", "APPROVED"));

        mockMvc.perform(get("/admin/articles/7"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(7))
            .andExpect(jsonPath("$.data.contentHtml").value("<p>Admin body</p>"));
    }

    @Test
    void shouldOfflinePublishedArticleThroughAdminAction() throws Exception {
        when(articleService.offlineArticle(eq(7L), eq("admin"), anyString()))
            .thenReturn(article(7L, "Guide", null, "OFFLINE", "APPROVED"));

        mockMvc.perform(post("/admin/articles/7/offline")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, AdminTokenClaims.builder()
                    .username("admin")
                    .build()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("OFFLINE"));

        verify(articleService).offlineArticle(eq(7L), eq("admin"), anyString());
    }

    @Test
    void shouldApprovePendingArticleThroughAdminAction() throws Exception {
        when(articleService.reviewArticle(eq(7L), eq("APPROVE"), eq(null), eq("admin"), anyString()))
            .thenReturn(article(7L, "Guide", null, "DRAFT", "APPROVED"));

        mockMvc.perform(post("/admin/articles/7/review")
                .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, AdminTokenClaims.builder()
                    .username("admin")
                    .build())
                .contentType("application/json")
                .content("{\"action\":\"APPROVE\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.reviewStatus").value("APPROVED"));

        verify(articleService).reviewArticle(eq(7L), eq("APPROVE"), eq(null), eq("admin"), anyString());
    }

    private ArticleDTO article(Long id, String title, String contentHtml, String status, String reviewStatus) {
        ArticleDTO article = new ArticleDTO();
        article.setId(id);
        article.setTitle(title);
        article.setContentHtml(contentHtml);
        article.setStatus(status);
        article.setReviewStatus(reviewStatus);
        return article;
    }
}
```

- [ ] **Step 3: Run backend tests**

Run:

```bash
cd back
mvn -Dtest=ArticleControllerTest,AdminArticleControllerTest,UserArticleControllerTest test
mvn -DskipTests compile
```

Expected: pass. If a backend test fails because the existing controller lacks the contract, fix the smallest production code path required by the test.

Do not commit from this task. Keep the changes in the feature branch worktree for final validation and one focused commit.

---

## Task 4: Runtime Integration Smoke

**Files:**
- No planned source edits.
- Runtime report output under ignored `reports/local-start/`.

- [ ] **Step 1: Run static checks**

Run:

```bash
cd front-nuxt
pnpm run check
cd ../data-query-app
pnpm run check
cd ../back
mvn -Dtest=ArticleControllerTest,AdminArticleControllerTest,UserArticleControllerTest test
mvn -DskipTests compile
cd ..
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Start local stack**

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

- [ ] **Step 3: Verify backend public articles**

Run:

```bash
ARTICLE_JSON="$(curl -sS 'http://127.0.0.1:18088/api/articles?page=1&limit=1')"
node -e "
const payload = JSON.parse(process.env.ARTICLE_JSON)
if (!payload.success) throw new Error('public articles API did not return success:true')
const first = Array.isArray(payload.data) ? payload.data[0] : null
if (!first?.title || !first?.slug) throw new Error('public articles API returned no published article with title and slug')
console.log(first.title)
"
```

Expected:

```text
prints the first published article title
```

If `data` is empty, the runtime DB has no published articles. Do not silently mutate the DB. Either:

1. Mark runtime public-record smoke as blocked by missing local fixture, while keeping static and controller validation complete.
2. Create or publish a disposable local-only test article through the existing admin UI, rerun this check, then restore the article state before finishing if it was not meant to remain public.

- [ ] **Step 4: Verify public page HTML**

Run:

```bash
PAGE_HTML="$(curl -sS 'http://127.0.0.1:5174/articles')"
ARTICLE_TITLE="$(ARTICLE_JSON="$ARTICLE_JSON" node -e "const payload = JSON.parse(process.env.ARTICLE_JSON); console.log(payload.data[0].title)")"
ARTICLE_SLUG="$(ARTICLE_JSON="$ARTICLE_JSON" node -e "const payload = JSON.parse(process.env.ARTICLE_JSON); console.log(payload.data[0].slug)")"
PAGE_HTML="$PAGE_HTML" ARTICLE_TITLE="$ARTICLE_TITLE" ARTICLE_SLUG="$ARTICLE_SLUG" node -e "
const html = process.env.PAGE_HTML
if (!html.includes('资料手札')) throw new Error('public page did not render articles heading')
if (!html.includes(process.env.ARTICLE_TITLE)) throw new Error('public page did not render first published article title')
if (!html.includes('/articles/' + process.env.ARTICLE_SLUG)) throw new Error('public page did not render article slug link')
for (const forbidden of ['公开文章暂未开放', '真实文章待接入']) {
  if (html.includes(forbidden)) throw new Error('public page still contains forbidden placeholder copy: ' + forbidden)
}
console.log('public page rendered first published article')
"
```

Expected:

```text
public page rendered first published article
```

- [ ] **Step 5: Manual admin smoke**

In the browser:

1. Open `http://localhost:3001/articles`.
2. Confirm each row has `View Content`.
3. Open `View Content` for a pending-review article and confirm body text is visible.
4. Open `Read-only Editor` for a pending-review article and confirm route opens instead of being disabled.
5. For a published article, click `Unpublish` and confirm status changes to `OFFLINE`.
6. Publish or approve/publish a test article again if needed so `/articles` has a public record.

- [ ] **Step 6: Stop local stack if it was started only for this task**

Run:

```bash
bash scripts/dev/stop-local-stack.sh
```

Commit is not required for runtime reports because `reports/local-start/` is ignored.

---

## Final Merge

After all tasks pass:

```bash
git status --short
git log --oneline --decorate -5
```

Create one focused commit on the feature branch after validation:

```bash
git add \
  docs/superpowers/plans/2026-06-04-article-public-admin-ops.md \
  front-nuxt/pages/articles/index.vue \
  front-nuxt/scripts/check-user-module-contract.mjs \
  data-query-app/pages/articles.vue \
  data-query-app/tests/admin-articles-page-contract.test.mjs \
  back/src/test/java/com/terraria/skills/controller/ArticleControllerTest.java \
  back/src/test/java/com/terraria/skills/controller/AdminArticleControllerTest.java
git diff --cached --stat
git commit -m "feat(article): add public list and admin review actions"
```

Merge back to verified local `main` only; do not push:

```bash
git worktree list
git -C /home/lolben/.config/superpowers/worktrees/TerraPedia/main-biome-collection-merge-2026-06-03 status --short --branch
git -C /home/lolben/.config/superpowers/worktrees/TerraPedia/main-biome-collection-merge-2026-06-03 rev-parse --abbrev-ref HEAD
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/main-biome-collection-merge-2026-06-03
git merge --no-ff feat/article-public-admin-ops-2026-06-04 -m "Merge branch 'feat/article-public-admin-ops-2026-06-04'"
```

Only run the merge when the verified main worktree is on branch `main` and has a clean status.

Then rerun focused validation on merged `main`:

```bash
cd back
mvn -Dtest=ArticleControllerTest,AdminArticleControllerTest,UserArticleControllerTest test
cd ../front-nuxt
pnpm run check:user-module
cd ../data-query-app
node --test tests/admin-articles-page-contract.test.mjs
pnpm run check
```
