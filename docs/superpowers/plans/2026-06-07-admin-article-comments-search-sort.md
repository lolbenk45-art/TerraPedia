# Admin Article Comments Search Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/article-comments` search and sorting clearer in the admin UI and make comment sorting authoritative in the backend before pagination.

**Architecture:** Extend the existing article-scoped admin comment API with normalized sort parameters. Keep frontend filters explicit and aligned to the backend contract. Preserve the existing single-article comment management boundaries.

**Tech Stack:** Vue/Nuxt admin app, Pinia, Node contract tests, Spring Boot, MyBatis, JUnit, Mockito.

---

## Files

- Modify: `data-query-app/tests/admin-global-comment-management-contract.test.mjs`
- Modify: `data-query-app/stores/articleComments.ts`
- Modify: `data-query-app/pages/article-comments.vue`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminArticleCommentControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/AdminArticleCommentServiceImplTest.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminArticleCommentController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/AdminArticleCommentService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/AdminArticleCommentServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/mapper/ArticleCommentMapper.java`
- Modify: `back/src/main/resources/mapper/ArticleCommentMapper.xml`

## Task 1: Admin Contract Tests

- [ ] Add failing contract assertions that `ArticleCommentSortBy` and `ArticleCommentSortOrder` exist in the store, filters include `sortBy` and `sortOrder`, and the request sends both fields.
- [ ] Add failing page assertions for "搜索评论内容或作者", "回复量", "点赞数", "创建时间", "评论 ID", "降序", and "升序".
- [ ] Run `cd data-query-app && node --test tests/admin-global-comment-management-contract.test.mjs`.
- [ ] Expected result: FAIL because the store and page still use `sortMode`.

## Task 2: Backend Tests

- [ ] Update `AdminArticleCommentControllerTest.shouldListCommentsForExactArticleId` to pass `sortBy=replyCount&sortOrder=desc` and verify the service receives those values.
- [ ] Update `AdminArticleCommentServiceImplTest.shouldListArticleCommentsWithoutRequiringPublishedArticle` to verify normalized sort values reach the mapper.
- [ ] Add a service test that invalid sort values fall back to `createdAt desc`.
- [ ] Run `cd back && mvn -Dtest=AdminArticleCommentControllerTest,AdminArticleCommentServiceImplTest test`.
- [ ] Expected result: FAIL because method signatures do not yet accept sort parameters.

## Task 3: Backend Implementation

- [ ] Add `sortBy` and `sortOrder` parameters to controller, service, and mapper signatures.
- [ ] Normalize sort values in `AdminArticleCommentServiceImpl`.
- [ ] Update `ArticleCommentMapper.xml` with allowlisted `<choose>` ordering for `replyCount`, `likeCount`, `id`, and `createdAt`.
- [ ] Run `cd back && mvn -Dtest=AdminArticleCommentControllerTest,AdminArticleCommentServiceImplTest test`.
- [ ] Expected result: PASS.

## Task 4: Admin Implementation

- [ ] Replace `ArticleCommentSortMode` with `ArticleCommentSortBy` and `ArticleCommentSortOrder`.
- [ ] Replace filter state `sortMode` with `sortBy` and `sortOrder`.
- [ ] Send `sortBy` and `sortOrder` from `fetchComments`.
- [ ] Update the comment toolbar controls and placeholder.
- [ ] Run `cd data-query-app && node --test tests/admin-global-comment-management-contract.test.mjs`.
- [ ] Expected result: PASS.

## Task 5: Final Verification

- [ ] Run `git status --short --branch`.
- [ ] Run `cd data-query-app && node --test tests/admin-global-comment-management-contract.test.mjs`.
- [ ] Run `cd back && mvn -Dtest=AdminArticleCommentControllerTest,AdminArticleCommentServiceImplTest test`.
- [ ] Inspect changed files with `git diff --stat` and targeted diffs.
