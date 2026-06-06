# Article Review Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a review-first admin article detail page for pending user-submitted articles.

**Architecture:** Add a focused `ArticleReviewWorkspace.vue` component that renders sanitized read-only preview, uses existing store review/log APIs, and syncs reviewed state back to the route. Update the detail route to choose review workspace for pending articles while preserving the existing writing editor for new and non-pending articles, and remove list-level pending approve/reject bypasses.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Pinia store `useArticlesStore`, existing `sanitizeArticleHtml` and `buildArticlePresentation` utilities, Node built-in test runner contract tests.

---

## File Structure

- Modify `data-query-app/tests/admin-articles-page-contract.test.mjs`: add failing contract tests for the new review workbench, pending route switch, article list action label, no list-level review bypass, and route/component article ID refresh.
- Create `data-query-app/components/article/ArticleReviewWorkspace.vue`: review-first UI and behavior.
- Modify `data-query-app/pages/article-editor/[id].vue`: load article status, react to article ID changes, choose `ArticleReviewWorkspace` for `PENDING_REVIEW`, and keep review mode visible after a review action.
- Modify `data-query-app/pages/articles.vue`: change pending row primary label from `只读编辑器` to `审核文章`, remove direct pending approve/reject actions from the list, and keep non-pending writing labels.

## Task 1: Contract Tests

**Files:**
- Modify: `data-query-app/tests/admin-articles-page-contract.test.mjs`

- [ ] **Step 1: Add failing tests for review-first behavior**

Append tests that read `components/article/ArticleReviewWorkspace.vue`, assert the pending detail route renders it, and assert the article list uses `审核文章`.

```js
const articleReviewWorkspace = read('components/article/ArticleReviewWorkspace.vue')

test('admin pending article detail route uses the review workbench before the editor', () => {
  assert.match(articleEditorDetailPage, /ArticleReviewWorkspace/)
  assert.match(articleEditorDetailPage, /ArticleEditorWorkspace/)
  assert.match(articleEditorDetailPage, /reviewStatus\s*===\s*'PENDING_REVIEW'/)
  assert.match(articleEditorDetailPage, /articlesStore\.fetchArticleById\(articleId\.value\)/)
  assert.match(articleEditorDetailPage, /watch\(articleId,\s*\(\)\s*=>\s*\{/)
  assert.match(articleEditorDetailPage, /@reviewed="handleArticleReviewed"/)
})

test('admin article review workbench keeps review as the primary task', () => {
  assert.match(articleReviewWorkspace, /class="article-review-workspace"/)
  assert.match(articleReviewWorkspace, /读者预览/)
  assert.match(articleReviewWorkspace, /审核检查/)
  assert.match(articleReviewWorkspace, /问题位置/)
  assert.match(articleReviewWorkspace, /问题类型/)
  assert.match(articleReviewWorkspace, /打回说明/)
  assert.match(articleReviewWorkspace, /通过审核/)
  assert.match(articleReviewWorkspace, /打回修改/)
  assert.match(articleReviewWorkspace, /reviewArticle\(article\.value\.id,\s*'APPROVE'/)
  assert.match(articleReviewWorkspace, /reviewArticle\(article\.value\.id,\s*'REJECT'/)
  assert.match(articleReviewWorkspace, /fetchReviewLogs\(article\.value\.id/)
  assert.match(articleReviewWorkspace, /sanitizeArticleHtml/)
  assert.match(articleReviewWorkspace, /buildArticlePresentation/)
  assert.match(articleReviewWorkspace, /watch\(\(\)\s*=>\s*props\.articleId/)
  assert.match(articleReviewWorkspace, /defineEmits/)
  assert.doesNotMatch(articleReviewWorkspace, /contenteditable=/)
})

test('admin articles page does not bypass the review workbench for pending articles', () => {
  assert.doesNotMatch(page, /@click="approveReview\(row\)"/)
  assert.doesNotMatch(page, /@click="openReject\(row\)"/)
  assert.doesNotMatch(page, /articlesStore\.reviewArticle\(row\.id/)
  assert.match(page, /待审核文章请进入审核工作台处理/)
})

test('admin articles page labels pending primary action as article review', () => {
  assert.match(page, /row\.reviewStatus === 'PENDING_REVIEW'\s*\?\s*'审核文章'\s*:\s*'继续写作'/)
  assert.doesNotMatch(page, /只读编辑器/)
})
```

- [ ] **Step 2: Run the targeted unit test and verify it fails**

Run:

```bash
cd data-query-app
pnpm run test:unit -- admin-articles-page-contract.test.mjs
```

Expected: FAIL because `ArticleReviewWorkspace.vue` does not exist and the route/list have not been updated.

## Task 2: Review Workspace Component

**Files:**
- Create: `data-query-app/components/article/ArticleReviewWorkspace.vue`

- [ ] **Step 1: Implement the minimal review workspace**

Create a Vue component with:

- `articleId` prop.
- optional initial article prop to avoid duplicate detail fetch when the route already loaded the article.
- `reviewed` event to sync the reviewed article back to the route.
- `fetchArticleById`, `reviewArticle`, and `fetchReviewLogs` store calls.
- sanitized read-only article preview.
- completion checks from title, summary, cover, body, outline, images.
- lightweight scope/type checkboxes.
- rejection textarea.
- approve and reject methods.
- guard that disables approve/reject once the article is no longer `PENDING_REVIEW`.

- [ ] **Step 2: Run the targeted unit test**

Run:

```bash
cd data-query-app
pnpm run test:unit -- admin-articles-page-contract.test.mjs
```

Expected: still FAIL until the route and list are updated.

## Task 3: Route Switch And List Label

**Files:**
- Modify: `data-query-app/pages/article-editor/[id].vue`
- Modify: `data-query-app/pages/articles.vue`

- [ ] **Step 1: Route pending articles to review workbench**

In `[id].vue`, fetch the article detail through `useArticlesStore`, render loading/error states, render `ArticleReviewWorkspace` when `article.reviewStatus === 'PENDING_REVIEW'`, otherwise render `ArticleEditorWorkspace`. Watch `articleId` and reload when navigating between detail routes.

- [ ] **Step 2: Rename the pending list primary action and remove review bypass**

Change `editorActionLabel` in `articles.vue` so pending rows show `审核文章` instead of `只读编辑器`. Remove list-level direct `通过` and `驳回` actions for pending rows and replace them with a muted hint that sends admins into the review workbench.

- [ ] **Step 3: Run the targeted unit test**

Run:

```bash
cd data-query-app
pnpm run test:unit -- admin-articles-page-contract.test.mjs
```

Expected: PASS.

## Task 4: Full Validation And Review

**Files:**
- Review all changed files.

- [ ] **Step 1: Run management app gates**

Run:

```bash
cd data-query-app
pnpm run test:unit
pnpm run check
pnpm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Request multi-agent review**

Ask one read-only reviewer to inspect:

- whether pending articles default to review, not editing.
- whether rejection feedback is actionable.
- whether editing remains out of the default path.

- [ ] **Step 3: Fix important review findings**

Apply fixes only for issues tied to this feature scope.

- [ ] **Step 4: Commit focused changes**

Run:

```bash
git status --short
git diff --cached --stat
git commit -m "feat: add article review workbench"
```

Expected: one focused commit on `feat/article-editor-design-drafts-2026-06-06`.

## Self-Review

- Spec coverage: route switch, read-only review, approve/reject, lightweight problem classification, review logs, and list label are covered.
- Token scan: no unresolved planning markers remain.
- Scope check: backend schema changes and rich inline annotation are intentionally excluded.
