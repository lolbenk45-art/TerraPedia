# Article Engagement Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank public article discovery and article-detail recommendations by reading count, then favorite count, instead of recency.

**Architecture:** The public article endpoint already projects `viewCount` and `favoriteCount` in `ArticleMapper.xml`. Change only the published-list query's `ORDER BY` clause, so `/articles` and the detail page's recommendation request (which consumes that endpoint) inherit one deterministic ranking. Preserve `published_at` and `id` as tie-breakers to keep pagination stable.

**Tech Stack:** Spring Boot, MyBatis XML mapper, JUnit 5, Nuxt public pages.

---

### Task 1: Lock the public ranking contract with a failing mapper test

**Files:**
- Create: `back/src/test/java/com/terraria/skills/mapper/ArticleMapperPublishedSortContractTest.java`
- Modify: `back/src/main/resources/mapper/ArticleMapper.xml:124`

- [x] **Step 1: Write the failing test**

```java
@Test
void publishedArticleListRanksByEngagementBeforeRecency() throws IOException {
    String query = selectSql(Files.readString(Path.of("src/main/resources/mapper/ArticleMapper.xml")), "selectPublishedArticlesPage");

    assertTrue(query.contains("ORDER BY viewCount DESC, favoriteCount DESC, a.published_at DESC, a.id DESC"));
}
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd back && mvn -Dtest=ArticleMapperPublishedSortContractTest test`

Expected: FAIL because the mapper currently orders published articles by `a.published_at DESC, a.id DESC`.

- [x] **Step 3: Write the minimal implementation**

Replace the published-list ordering with:

```xml
ORDER BY viewCount DESC, favoriteCount DESC, a.published_at DESC, a.id DESC
```

Do not add request parameters or duplicate sorting in Nuxt; both `/articles` and recommendations already consume this query.

- [x] **Step 4: Run the focused tests to verify they pass**

Run: `cd back && mvn -Dtest=ArticleMapperPublishedSortContractTest,ArticleMapperCommentCountContractTest test`

Expected: PASS, proving the published ranking and existing aggregate projection contracts.

### Task 2: Verify affected public consumers and close out

**Files:**
- Modify: `docs/devlog/entries/2026-07-12-article-engagement-sorting.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Inspect consumer wiring**

Verify `front-nuxt/pages/articles/index.vue` requests `/articles` and `front-nuxt/pages/articles/[slug].vue` requests the same endpoint for recommendations. No frontend edit is expected.

- [x] **Step 2: Run final narrow validation**

Run:

```bash
cd back && mvn -Dtest=ArticleMapperPublishedSortContractTest,ArticleMapperCommentCountContractTest test
git diff --check
```

Expected: both commands exit `0`.

- [x] **Step 3: Record validation and residual risk**

Update the task devlog with command outcomes, note that ranking uses computed aggregate subqueries, and mark the task `ready-for-commit` until a requested commit is prepared.
