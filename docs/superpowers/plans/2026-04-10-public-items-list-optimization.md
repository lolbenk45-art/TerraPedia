# Public Items List Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `/api/items` warm-path latency without changing the public list contract used by the front-end.

**Architecture:** Add service-layer caching for repeated public list queries and keep cache invalidation aligned with item write operations. Trim only the list query path in this batch so the rest of the public item detail contract stays unchanged.

**Tech Stack:** Spring Boot, Spring Cache, MyBatis-Plus, JUnit 5, Mockito

---

### Task 1: Cache repeated public item list queries

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ItemServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/config/RedisCacheConfig.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/ItemServiceCachingTest.java`

- [ ] Write a failing cache-behavior test for repeated `getItems` calls and post-delete eviction.
- [ ] Run the focused test to confirm repeated calls still hit the mapper before the implementation.
- [ ] Add `item:list` cache registration and `@Cacheable` list-query caching with a deterministic key.
- [ ] Evict `item:list` on item write paths.
- [ ] Re-run the focused test and then the item service test slice.

### Task 2: Trim unnecessary list-query work

**Files:**
- Modify: `back/src/main/resources/mapper/ItemMapper.xml`
- Test: `back/src/test/java/com/terraria/skills/service/impl/ItemServiceImplTest.java`

- [ ] Keep the list response fields required by the current front-end list pages.
- [ ] Remove unused `relatedCategoryIdsRaw` population from `selectItemsWithSearch`.
- [ ] Verify existing item service tests still pass and no public list field used by the front-end disappears.
