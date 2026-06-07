# Admin Article Comments Search Sort Design

## Goal

Improve `http://localhost:3001/article-comments` search and sorting for the single-article comment management page. Sorting must be applied by the backend before pagination so results stay correct across pages.

## Scope

In scope:

- Add backend support for article comment sort parameters on `GET /admin/articles/{articleId}/comments`.
- Keep sorting limited to a safe allowlist: `createdAt`, `replyCount`, `likeCount`, and `id`.
- Preserve the existing default order as `createdAt desc`.
- Update the admin comment store to send explicit `sortBy` and `sortOrder` values.
- Update the filter toolbar copy and options to make search and sorting clearer.
- Add tests for the backend API contract, service mapper arguments, SQL sort whitelist, and admin UI/store contract.

Out of scope:

- Global cross-article comment search.
- Comment keyword highlighting.
- Multi-field compound sort controls.
- Changes to public article comments.
- Data backfills or database writes.

## Current State

The admin page is `data-query-app/pages/article-comments.vue`. The comment store is `data-query-app/stores/articleComments.ts`.

The frontend currently sends `sortBy` and `sortOrder`, but `AdminArticleCommentController` does not accept those parameters and `ArticleCommentMapper.xml` always orders root comments by `ac.created_at DESC, ac.id DESC`. The page then locally sorts the current page only, which makes "reply count first" incorrect across pagination.

Search currently filters by comment content and author display name in the backend SQL. The visible placeholder only says comment content, so the UI undersells the current behavior.

## Backend Design

`AdminArticleCommentController.getComments` accepts:

- `sortBy`, optional string.
- `sortOrder`, optional string.

`AdminArticleCommentService.getArticleComments` receives those values and normalizes them:

- `createdAt`, `replyCount`, `likeCount`, `id` are allowed.
- Invalid or blank `sortBy` becomes `createdAt`.
- `asc` is allowed only when explicitly requested; all other values become `desc`.

The mapper receives normalized values. `ArticleCommentMapper.xml` uses MyBatis `<choose>` blocks for the allowed fields and direction. It does not interpolate raw request values into SQL.

## Frontend Design

`ArticleCommentFilters` stores:

- `keyword`
- `status`
- `authorId`
- `sortBy`
- `sortOrder`

The single-article comment toolbar:

- changes the keyword placeholder to "搜索评论内容或作者";
- adds sort choices for "回复量", "点赞数", "创建时间", and "评论 ID";
- adds direction choices for "降序" and "升序";
- keeps search submit behavior resetting to page 1;
- keeps pagination using the current filters.

The store sends `sortBy` and `sortOrder` directly to the backend. Local sorting is removed from the primary data path because backend pagination is now authoritative.

## Validation

Minimum validation:

- `cd data-query-app && node --test tests/admin-global-comment-management-contract.test.mjs`
- `cd back && mvn -Dtest=AdminArticleCommentControllerTest,AdminArticleCommentServiceImplTest test`

Optional broader checks:

- `cd data-query-app && pnpm run test`
- `cd back && mvn test`
