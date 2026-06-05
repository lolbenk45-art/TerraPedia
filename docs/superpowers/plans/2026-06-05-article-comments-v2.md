# Article Comments V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade TerraPedia article comments from a flat public-only comment list into a full article-bound discussion system with replies, contextual @ display, comment likes, user deletion, and admin moderation for the correct article.

**Architecture:** `article_comments` remains the source table for comments and replies, with `parent_id` and `root_id` defining a two-level visible thread. `article_comment_likes` stores per-user like state with idempotent like/unlike APIs. Public users can read visible comments for published articles, logged-in users can write comments/replies/likes, and admins manage comments through `/admin/articles/{articleId}/...` routes that always validate comment/article ownership.

**Tech Stack:** Spring Boot, MyBatis Plus, Flyway SQL migrations, JUnit/MockMvc, Nuxt 3, Pinia, TypeScript, Node contract tests.

---

## Non-Negotiable Boundaries

- Correct workspace: `/home/lolben/.config/superpowers/worktrees/TerraPedia/feat-article-management-followup-2026-06-04`.
- Do not edit `/home/lolben/TerraPedia`; that path is another worktree.
- Do not push.
- Do not run destructive git commands.
- Do not modify crawler/import/data refresh code.
- Do not physically delete user comments; use status and soft-delete semantics.
- Admin comment operations must use `articleId` from the route and must reject a `commentId` that belongs to another article.
- Public comment reads must not expose hidden or deleted content.
- Frontend must not implement infinite visual nesting; only show root comments and one reply level.

## Source Chain

1. Local DB tables:
   - `article_comments`
   - `article_comment_likes`
   - `articles`
   - `users`
   - `security_audit_log`
2. Backend public API:
   - `/articles/{articleId}/comments`
   - `/articles/{articleId}/comments/{commentId}/replies`
   - `/articles/{articleId}/comments/{commentId}/like`
3. Backend admin API:
   - `/admin/articles/{articleId}/comments`
   - `/admin/articles/{articleId}/comments/{commentId}/replies`
   - `/admin/articles/{articleId}/comments/{commentId}/status`
4. Front public UI:
   - `front-nuxt/pages/articles/[slug].vue`
   - `front-nuxt/composables/useUserApi.ts`
   - `front-nuxt/types/public-api.ts`
5. Admin UI:
   - `data-query-app/pages/articles.vue`
   - `data-query-app/stores/articles.ts`

## Mandatory Preflight Before Any Implementation

This worktree already contains uncommitted article/comment work from the previous session. Treat those files as the baseline to extend unless the preflight proves a file is unrelated. Do not delete or revert untracked files.

- [ ] **Preflight Step 1: record git baseline**

Run:

```bash
git status --short --branch
git diff --stat
git diff --name-only
```

Expected:

- branch is `feat/user-article-word-editor-2026-06-04`
- existing V1 comment files may be dirty or untracked
- output is recorded in the implementation notes before agents start

- [ ] **Preflight Step 2: record existing comment files**

Run:

```bash
find back/src/main/java/com/terraria/skills -path '*ArticleComment*' -print | sort
find back/src/main/resources -path '*ArticleComment*' -o -name '*article_comments*' | sort
find front-nuxt data-query-app -maxdepth 4 -type f | rg 'articles|useUserApi|public-api|admin-articles' || true
```

Expected:

- V1 files such as `ArticleCommentController.java`, `ArticleCommentServiceImpl.java`, `ArticleCommentMapper.xml`, and `V53__create_article_comments.sql` exist.
- RED test steps must be interpreted as "fails for the missing V2 behavior", not necessarily "file does not exist".

- [ ] **Preflight Step 3: verify Flyway/database migration state**

Before creating or running `V54`, verify the local DB has not already been partially upgraded:

```sql
SELECT version, description, success
FROM flyway_schema_history
ORDER BY installed_rank DESC
LIMIT 5;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'article_comments'
  AND column_name IN ('parent_id', 'root_id', 'reply_to_user_id', 'like_count', 'reply_count', 'status', 'deleted_by_type', 'deleted_at');

SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'article_comment_likes';
```

Expected:

- `V53` is the latest applied article-comment migration.
- V2 columns and `article_comment_likes` do not already exist.
- If any V2 column/table exists, stop implementation, repair this plan with a DB-state-specific migration, and rerun plan audit.

## API Contract

### Public Comment DTO

```json
{
  "id": 9,
  "articleId": 77,
  "parentId": null,
  "rootId": 9,
  "authorId": 42,
  "authorDisplayName": "Guide Reader",
  "authorAvatarUrl": "/api/files/objects/avatars/42/avatar.png",
  "replyToUserId": null,
  "replyToDisplayName": null,
  "content": "这条路线很清楚。",
  "status": "PUBLISHED",
  "deleted": false,
  "likeCount": 3,
  "likedByCurrentUser": false,
  "replyCount": 2,
  "replies": [],
  "createdAt": "2026-06-05T06:50:00",
  "updatedAt": "2026-06-05T06:50:00"
}
```

### Admin Comment DTO

```json
{
  "id": 9,
  "articleId": 77,
  "parentId": null,
  "rootId": 9,
  "authorId": 42,
  "authorDisplayName": "Guide Reader",
  "authorAvatarUrl": "/api/files/objects/avatars/42/avatar.png",
  "replyToUserId": null,
  "replyToDisplayName": null,
  "content": "这条路线很清楚。",
  "status": "HIDDEN",
  "deleted": true,
  "deletedByType": "ADMIN",
  "deletedByName": "admin",
  "deletedReason": "spam",
  "deletedAt": "2026-06-05T07:00:00",
  "likeCount": 3,
  "replyCount": 2,
  "createdAt": "2026-06-05T06:50:00",
  "updatedAt": "2026-06-05T07:00:00"
}
```

### Endpoints

- `GET /articles/{articleId}/comments?page=1&limit=10`
  - Public read.
  - Returns visible root comments only.
  - Includes up to two visible reply previews per root comment.
  - Uses optional current user claims if present to compute `likedByCurrentUser`; must still work when not logged in.

- `GET /articles/{articleId}/comments/{commentId}/replies?page=1&limit=10`
  - Public read.
  - Returns visible replies for one root comment.
  - Validates `commentId` belongs to `articleId`.

- `POST /articles/{articleId}/comments`
  - Logged-in user creates a root comment.
  - Body: `{ "content": "..." }`.

- `POST /articles/{articleId}/comments/{commentId}/replies`
  - Logged-in user creates a reply under root comment `commentId`.
  - Body: `{ "content": "...", "replyToCommentId": 12 }`.
  - `replyToCommentId` is optional. If present it must belong to the same `articleId` and same root.

- `DELETE /articles/{articleId}/comments/{commentId}`
  - Logged-in user soft-deletes their own comment or reply.

- `POST /articles/{articleId}/comments/{commentId}/like`
  - Logged-in user likes a visible comment or reply.
  - Idempotent.

- `DELETE /articles/{articleId}/comments/{commentId}/like`
  - Logged-in user unlikes a comment or reply.
  - Idempotent.

- `GET /admin/articles/{articleId}/comments?page=1&limit=20&status=&keyword=&authorId=`
  - Admin read for one article.
  - Returns root comments including hidden/deleted state.
  - Does not require the article to be published; article only needs to exist and not be deleted.

- `GET /admin/articles/{articleId}/comments/{commentId}/replies?page=1&limit=20&status=`
  - Admin read replies for one root comment.

- `PATCH /admin/articles/{articleId}/comments/{commentId}/status`
  - Admin hide/restore/delete.
  - Body: `{ "status": "HIDDEN", "reason": "..." }`.
  - Allowed statuses: `PUBLISHED`, `HIDDEN`, `DELETED`.
  - Must audit `ADMIN_ARTICLE_COMMENT_HIDDEN`, `ADMIN_ARTICLE_COMMENT_RESTORED`, or `ADMIN_ARTICLE_COMMENT_DELETED`.

## Multi-Agent Execution Model

The implementation has required serial backend shared layers followed by safe UI parallelism.

### Serial Phase

Task 1 must finish first because it owns the comment schema, mapper, service, public API, and shared DTO contract.

Task 2 must start after Task 1 because admin backend moderation needs additional mapper/XML methods against the schema and DTOs created by Task 1.

### Parallel Phase

After Task 1 passes focused backend tests:

- Task 2 can add admin backend API.
- Task 3 can add public frontend comment UI against the Task 1 public contract.

After Task 2 passes focused admin backend tests:

- Task 4 can add admin UI against the Task 2 admin contract, but it must not edit backend files.

### Write Ownership

- Task 1 owns:
  - `back/src/main/resources/db/migration/V54__upgrade_article_comments_v2.sql`
  - `back/src/main/resources/schema.sql`
  - `back/src/main/java/com/terraria/skills/entity/ArticleComment.java`
  - `back/src/main/java/com/terraria/skills/entity/ArticleCommentLike.java`
  - `back/src/main/java/com/terraria/skills/dto/ArticleComment*.java`
  - `back/src/main/java/com/terraria/skills/mapper/ArticleCommentMapper.java`
  - `back/src/main/resources/mapper/ArticleCommentMapper.xml`
  - `back/src/main/java/com/terraria/skills/service/ArticleCommentService.java`
  - `back/src/main/java/com/terraria/skills/service/impl/ArticleCommentServiceImpl.java`
  - `back/src/main/java/com/terraria/skills/controller/ArticleCommentController.java`
  - user auth/origin interceptor tests and implementation

- Task 2 owns:
  - `back/src/main/java/com/terraria/skills/controller/AdminArticleCommentController.java`
  - `back/src/main/java/com/terraria/skills/dto/AdminArticleComment*.java`
  - `back/src/main/java/com/terraria/skills/service/AdminArticleCommentService.java`
  - `back/src/main/java/com/terraria/skills/service/impl/AdminArticleCommentServiceImpl.java`
  - admin-only additions to `back/src/main/java/com/terraria/skills/mapper/ArticleCommentMapper.java`
  - admin-only additions to `back/src/main/resources/mapper/ArticleCommentMapper.xml`
  - `back/src/test/java/com/terraria/skills/controller/AdminArticleCommentControllerTest.java`
  - `back/src/test/java/com/terraria/skills/service/AdminArticleCommentServiceImplTest.java`

Task 1 and Task 2 must never run concurrently because they can both write `ArticleCommentMapper.java` and `ArticleCommentMapper.xml`. Task 3 can run in parallel with Task 2 because it only writes `front-nuxt`. Task 4 waits for Task 2.

- Task 3 owns:
  - `front-nuxt/types/public-api.ts`
  - `front-nuxt/composables/useUserApi.ts`
  - `front-nuxt/pages/articles/[slug].vue`
  - `front-nuxt/scripts/check-user-module-contract.mjs`
  - optional `front-nuxt/scripts/check-article-comments-runtime.mjs`

- Task 4 owns:
  - `data-query-app/stores/articles.ts`
  - `data-query-app/pages/articles.vue`
  - `data-query-app/tests/admin-articles-page-contract.test.mjs`
  - optional `data-query-app/tests/admin-article-comments-contract.test.mjs`

---

## Task 1: Backend Public Comment Core

**Files:**
- Create: `back/src/main/resources/db/migration/V54__upgrade_article_comments_v2.sql`
- Create: `back/src/main/java/com/terraria/skills/entity/ArticleCommentLike.java`
- Create: `back/src/main/java/com/terraria/skills/dto/ArticleCommentReplyCreateRequestDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/ArticleCommentLikeDTO.java`
- Modify: `back/src/main/resources/schema.sql`
- Modify: `back/src/main/java/com/terraria/skills/entity/ArticleComment.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/ArticleCommentDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/ArticleCommentCreateRequestDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/mapper/ArticleCommentMapper.java`
- Modify: `back/src/main/resources/mapper/ArticleCommentMapper.xml`
- Modify: `back/src/main/java/com/terraria/skills/service/ArticleCommentService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ArticleCommentServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/ArticleCommentController.java`
- Modify: `back/src/main/java/com/terraria/skills/auth/UserAuthenticationInterceptor.java`
- Modify: `back/src/main/java/com/terraria/skills/auth/UserWriteOriginInterceptor.java`
- Test: `back/src/test/java/com/terraria/skills/controller/ArticleCommentControllerTest.java`
- Test: `back/src/test/java/com/terraria/skills/auth/UserAuthenticationInterceptorTest.java`
- Test: `back/src/test/java/com/terraria/skills/auth/UserWriteOriginInterceptorTest.java`
- Create Test: `back/src/test/java/com/terraria/skills/service/ArticleCommentServiceImplTest.java`

- [ ] **Step 1: Write failing controller tests for replies and likes**

Update the existing root-list test first because `getPublishedArticleComments` gains `currentUserId`:

```java
when(articleCommentService.getPublishedArticleComments(77L, null, 1, 10)).thenReturn(page);

mockMvc.perform(get("/articles/77/comments").param("page", "1").param("limit", "10"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.pagination.total").value(1));

verify(articleCommentService).getPublishedArticleComments(77L, null, 1, 10);
```

Then add tests in `ArticleCommentControllerTest` for replies and likes. Use concrete mocked service stubs before each request:

```java
Page<ArticleCommentDTO> replyPage = new Page<>(1, 10, 1);
ArticleCommentDTO reply = comment();
reply.setId(12L);
reply.setParentId(9L);
reply.setRootId(9L);
reply.setReplyToUserId(42L);
reply.setReplyToDisplayName("Guide Reader");
reply.setContent("我补一张流程图。");
replyPage.setRecords(List.of(reply));
when(articleCommentService.getPublishedArticleReplies(77L, 9L, null, 1, 10)).thenReturn(replyPage);

mockMvc.perform(get("/articles/77/comments/9/replies").param("page", "1").param("limit", "10"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.success").value(true))
    .andExpect(jsonPath("$.data[0].parentId").value(9))
    .andExpect(jsonPath("$.data[0].replyToDisplayName").value("Guide Reader"));

verify(articleCommentService).getPublishedArticleReplies(77L, 9L, null, 1, 10);

when(articleCommentService.createReply(eq(42L), eq(77L), eq(9L), eq(9L), eq("我补一张流程图"), anyString())).thenReturn(reply);

mockMvc.perform(post("/articles/77/comments/9/replies")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"content\":\"我补一张流程图\",\"replyToCommentId\":9}")
        .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.parentId").value(9));

verify(articleCommentService).createReply(eq(42L), eq(77L), eq(9L), eq(9L), eq("我补一张流程图"), anyString());

ArticleCommentDTO liked = comment();
liked.setLikeCount(1);
liked.setLikedByCurrentUser(true);
when(articleCommentService.likeComment(eq(42L), eq(77L), eq(9L), anyString())).thenReturn(liked);

mockMvc.perform(post("/articles/77/comments/9/like")
        .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.likedByCurrentUser").value(true))
    .andExpect(jsonPath("$.data.likeCount").value(1));

verify(articleCommentService).likeComment(eq(42L), eq(77L), eq(9L), anyString());

ArticleCommentDTO unliked = comment();
unliked.setLikeCount(0);
unliked.setLikedByCurrentUser(false);
when(articleCommentService.unlikeComment(eq(42L), eq(77L), eq(9L), anyString())).thenReturn(unliked);

mockMvc.perform(delete("/articles/77/comments/9/like")
        .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, claims(42L)))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.likedByCurrentUser").value(false));

verify(articleCommentService).unlikeComment(eq(42L), eq(77L), eq(9L), anyString());
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=ArticleCommentControllerTest test
```

Expected: fails because reply and like endpoints/service methods do not exist.

- [ ] **Step 3: Write failing interceptor tests**

Extend `UserAuthenticationInterceptorTest` and `UserWriteOriginInterceptorTest` to include:

```java
new String[][] {
    {"POST", "/articles/77/comments"},
    {"DELETE", "/articles/77/comments/9"},
    {"POST", "/articles/77/comments/9/replies"},
    {"POST", "/articles/77/comments/9/like"},
    {"DELETE", "/articles/77/comments/9/like"}
};
```

Expected behavior:

- read endpoints do not require login
- write endpoints require login
- cookie-origin protected write endpoints include replies and likes

- [ ] **Step 4: Run interceptor tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=UserAuthenticationInterceptorTest,UserWriteOriginInterceptorTest test
```

Expected: fails because current matchers only cover the old comment write routes.

- [ ] **Step 5: Write failing service tests for ownership, reply root, idempotent likes**

Create `ArticleCommentServiceImplTest` with mocked mapper and article mapper. Test cases:

- `createReply` rejects a parent comment from another article.
- `createReply` uses root comment id for `rootId` and target author for `replyToUserId`.
- `likeComment` is idempotent and does not double increment `likeCount`.
- `unlikeComment` is idempotent and never decrements below zero.
- hidden/deleted comments cannot be replied to or liked.

Minimal expectations:

```java
assertThrows(IllegalArgumentException.class, () ->
    service.createReply(42L, 77L, 9L, 9L, "bad", "127.0.0.1")
);

ArticleCommentDTO liked = service.likeComment(42L, 77L, 9L, "127.0.0.1");
assertTrue(liked.getLikedByCurrentUser());
assertEquals(1, liked.getLikeCount());
```

- [ ] **Step 6: Run service tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=ArticleCommentServiceImplTest test
```

Expected: fails because new service methods and mapper methods do not exist.

- [ ] **Step 7: Add migration and schema**

This migration is a normal Flyway forward migration for a clean local path where `V54` has not been applied. Do not rerun it manually against a partially upgraded DB. If preflight finds existing V2 columns or indexes, stop and repair the migration for that DB state.

Create `V54__upgrade_article_comments_v2.sql`:

```sql
ALTER TABLE article_comments
  ADD COLUMN parent_id BIGINT NULL AFTER article_id,
  ADD COLUMN root_id BIGINT NULL AFTER parent_id,
  ADD COLUMN reply_to_user_id BIGINT NULL AFTER author_id,
  ADD COLUMN like_count INT NOT NULL DEFAULT 0 AFTER content,
  ADD COLUMN reply_count INT NOT NULL DEFAULT 0 AFTER like_count,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED' AFTER reply_count,
  ADD COLUMN deleted_by_type VARCHAR(20) NULL AFTER deleted,
  ADD COLUMN deleted_by_id BIGINT NULL AFTER deleted_by_type,
  ADD COLUMN deleted_by_name VARCHAR(120) NULL AFTER deleted_by_id,
  ADD COLUMN deleted_reason VARCHAR(300) NULL AFTER deleted_by_name,
  ADD COLUMN deleted_at DATETIME NULL AFTER deleted_reason,
  ADD INDEX idx_article_comments_article_root_created (article_id, root_id, deleted, status, created_at, id),
  ADD INDEX idx_article_comments_article_parent_created (article_id, parent_id, deleted, status, created_at, id),
  ADD INDEX idx_article_comments_reply_user (reply_to_user_id, deleted, created_at);

UPDATE article_comments
SET status = CASE WHEN deleted = 1 THEN 'DELETED' ELSE 'PUBLISHED' END,
    root_id = id
WHERE parent_id IS NULL AND root_id IS NULL;

CREATE TABLE IF NOT EXISTS article_comment_likes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  comment_id BIGINT NOT NULL,
  article_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_comment_likes_comment_user (comment_id, user_id),
  KEY idx_comment_likes_article_user (article_id, user_id, deleted),
  KEY idx_comment_likes_comment (comment_id, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Mirror this final table shape in `schema.sql`.

- [ ] **Step 8: Add entity and DTO fields**

`ArticleComment` must include every new column with `@TableField`.

`ArticleCommentDTO` must include:

```java
private Long parentId;
private Long rootId;
private Long replyToUserId;
private String replyToDisplayName;
private Integer likeCount;
private Boolean likedByCurrentUser;
private Integer replyCount;
private List<ArticleCommentDTO> replies;
private String status;
private Boolean deleted;
private String deletedByType;
private Long deletedById;
private String deletedByName;
private String deletedReason;
private LocalDateTime deletedAt;
```

- [ ] **Step 9: Add mapper methods**

Add methods for:

- count/select visible root comments
- count/select visible replies
- select comment by article and id
- `insertLikeIgnore(commentId, articleId, userId)` returning affected rows. Use `INSERT IGNORE` or database-equivalent unique-key handling.
- `reactivateLike(commentId, articleId, userId)` returning affected rows only when an existing row changes from `deleted=1` to `deleted=0`.
- `deactivateLike(commentId, articleId, userId)` returning affected rows only when an existing row changes from `deleted=0` to `deleted=1`.
- `incrementLikeCount(articleId, commentId)` and `decrementLikeCount(articleId, commentId)`, where decrement uses `like_count = GREATEST(like_count - 1, 0)`.
- increment/decrement reply count
- user soft delete by author and article

Mapper queries must always include `article_id = #{articleId}` for write targets.

- [ ] **Step 10: Implement service methods**

Implement:

```java
Page<ArticleCommentDTO> getPublishedArticleComments(Long articleId, Long currentUserId, int page, int limit);
Page<ArticleCommentDTO> getPublishedArticleReplies(Long articleId, Long rootCommentId, Long currentUserId, int page, int limit);
ArticleCommentDTO createComment(Long userId, Long articleId, String content, String ipAddress);
ArticleCommentDTO createReply(Long userId, Long articleId, Long rootCommentId, Long replyToCommentId, String content, String ipAddress);
ArticleCommentDTO deleteOwnComment(Long userId, Long articleId, Long commentId, String ipAddress);
ArticleCommentDTO likeComment(Long userId, Long articleId, Long commentId, String ipAddress);
ArticleCommentDTO unlikeComment(Long userId, Long articleId, Long commentId, String ipAddress);
```

Rules:

- root comments use `parentId = null` and `rootId = inserted id`.
- after inserting a root comment, perform a second update `root_id = id` using the generated key, then reselect the DTO. If MyBatis does not populate `comment.getId()`, fail the test and fix key generation instead of leaving `root_id` null.
- replies use `parentId = rootCommentId` and `rootId = rootCommentId`.
- if replying to a reply, store `replyToUserId` from `replyToCommentId`; do not create deeper visual nesting.
- only `PUBLISHED` and not-deleted comments can be liked or replied to.
- like and unlike are idempotent: only adjust `like_count` when `insertLikeIgnore`, `reactivateLike`, or `deactivateLike` returns one affected row.
- user deletion sets `status=DELETED`, `deleted=1`, `deletedByType=USER`, `deletedById=currentUserId`, and `deletedAt=now`.
- admin restore in Task 2 may restore only comments with `deletedByType=ADMIN`; user-deleted comments stay deleted.
- avatar URLs must still pass through `UserAvatarUrlResolver`.

- [ ] **Step 11: Implement controller endpoints**

Expose reply and like routes in `ArticleCommentController`. For public reads, accept missing claims. For writes, keep using required claims.

- [ ] **Step 12: Update auth and origin interceptors**

Update matchers so these routes require login and origin protection:

```text
POST /articles/{articleId}/comments
DELETE /articles/{articleId}/comments/{commentId}
POST /articles/{articleId}/comments/{commentId}/replies
POST /articles/{articleId}/comments/{commentId}/like
DELETE /articles/{articleId}/comments/{commentId}/like
```

- [ ] **Step 13: Run focused tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=ArticleCommentControllerTest,ArticleCommentServiceImplTest,UserAuthenticationInterceptorTest,UserWriteOriginInterceptorTest test
```

Expected: all tests pass.

---

## Task 2: Backend Admin Comment Moderation

**Files:**
- Create: `back/src/main/java/com/terraria/skills/controller/AdminArticleCommentController.java`
- Create: `back/src/main/java/com/terraria/skills/dto/AdminArticleCommentDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/AdminArticleCommentStatusRequestDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/AdminArticleCommentService.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/AdminArticleCommentServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminArticleCommentControllerTest.java`
- Test: `back/src/test/java/com/terraria/skills/service/AdminArticleCommentServiceImplTest.java`
- Modify: `back/src/main/java/com/terraria/skills/mapper/ArticleCommentMapper.java`
- Modify: `back/src/main/resources/mapper/ArticleCommentMapper.xml`

- [ ] **Step 1: Write failing admin controller tests**

Create tests for:

```java
mockMvc.perform(get("/admin/articles/77/comments").param("page", "1").param("limit", "20")
        .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, adminClaims()))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data[0].articleId").value(77))
    .andExpect(jsonPath("$.data[0].status").value("PUBLISHED"));

mockMvc.perform(patch("/admin/articles/77/comments/9/status")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"status\":\"HIDDEN\",\"reason\":\"spam\"}")
        .requestAttr(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE, adminClaims()))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.status").value("HIDDEN"))
    .andExpect(jsonPath("$.data.deletedReason").value("spam"));
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=AdminArticleCommentControllerTest test
```

Expected: fails because controller does not exist.

- [ ] **Step 3: Write failing service tests**

Test these cases:

- admin list does not require article to be published.
- missing or deleted article is rejected before querying comments.
- status update rejects a comment from another article.
- hiding sets `status=HIDDEN`, `deleted=1`, admin metadata, reason, timestamp.
- restoring sets `status=PUBLISHED`, `deleted=0`, clears reason metadata, and is allowed only when `deletedByType=ADMIN`.
- deleting sets `status=DELETED`, `deleted=1`.
- audit log is called exactly as:

```java
verify(securityAuditService).log(
    eq("ADMIN_ARTICLE_COMMENT_HIDDEN"),
    eq("ADMIN"),
    isNull(),
    isNull(),
    eq("127.0.0.1"),
    contains("articleId=77,commentId=9,operator=admin,reason=spam")
);
```

- [ ] **Step 4: Run tests and verify RED**

Run:

```bash
cd back
mvn -Dtest=AdminArticleCommentServiceImplTest test
```

Expected: fails because admin service does not exist.

- [ ] **Step 5: Implement DTO and request**

`AdminArticleCommentDTO` should mirror public DTO plus admin fields:

```java
private String deletedByType;
private Long deletedById;
private String deletedByName;
private String deletedReason;
private LocalDateTime deletedAt;
```

`AdminArticleCommentStatusRequestDTO`:

```java
@NotBlank
private String status;
@Size(max = 300)
private String reason;
```

- [ ] **Step 6: Implement admin service**

Methods:

```java
Page<AdminArticleCommentDTO> getArticleComments(Long articleId, int page, int limit, String status, String keyword, Long authorId);
Page<AdminArticleCommentDTO> getArticleCommentReplies(Long articleId, Long rootCommentId, int page, int limit, String status);
AdminArticleCommentDTO updateCommentStatus(Long articleId, Long commentId, String status, String reason, String operator, String ipAddress);
```

Admin service must validate:

- article exists and `articles.deleted = 0`
- comment exists with the same `articleId`
- status is one of `PUBLISHED`, `HIDDEN`, `DELETED`
- `PUBLISHED` restore is rejected for comments where `deletedByType=USER`
- `HIDDEN` and `DELETED` require a nonblank reason

Admin mapper/XML additions belong to Task 2 and must be added serially after Task 1:

- count/select admin root comments by `article_id`, optional `status`, optional `keyword`, optional `authorId`
- count/select admin replies by `article_id` and root comment id
- update admin moderation status by `article_id` and `comment_id`
- select admin comment by `article_id` and `comment_id`

- [ ] **Step 7: Implement admin controller**

Create `/admin/articles/{articleId}/comments` routes and use `AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE` for operator username.

- [ ] **Step 8: Run focused admin tests and verify GREEN**

Run:

```bash
cd back
mvn -Dtest=AdminArticleCommentControllerTest,AdminArticleCommentServiceImplTest test
```

Expected: all tests pass.

---

## Task 3: Public Article Comment UI

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/useUserApi.ts`
- Modify: `front-nuxt/pages/articles/[slug].vue`
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`
- Create: `front-nuxt/scripts/check-article-comments-runtime.mjs`
- Modify: `front-nuxt/package.json`

- [ ] **Step 1: Write failing user module contract checks**

In `check-user-module-contract.mjs`, require:

```js
assertFileContains('types/public-api.ts', [
  'parentId',
  'rootId',
  'replyToUserId',
  'replyToDisplayName',
  'likeCount',
  'likedByCurrentUser',
  'replyCount',
  'replies',
])

assertFileContains('composables/useUserApi.ts', [
  'fetchArticleComments',
  'fetchArticleCommentReplies',
  'createArticleCommentReply',
  'likeArticleComment',
  'unlikeArticleComment',
  'normalizeArticleComment',
  'normalizeArticleCommentListResult',
  '`/articles/${articleId}/comments`',
  '`/articles/${articleId}/comments/${commentId}/replies`',
  '`/articles/${articleId}/comments/${commentId}/like`',
  'replyToCommentId',
])

assertFileContains('pages/articles/[slug].vue', [
  'article-comment-replies',
  'article-comment-reply-form',
  'toggleArticleCommentLike',
  'aria-pressed',
  'replyToDisplayName',
  'loadMoreArticleComments',
  '#article-comments',
  'appendArticleComments',
  'appendArticleCommentReplies',
])
```

- [ ] **Step 2: Run contract and verify RED**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
```

Expected: fails because UI/helper markers are missing.

- [ ] **Step 3: Extend public types**

Update `ArticleComment`:

```ts
export type ArticleComment = {
  id: number
  articleId: number
  parentId: number | null
  rootId: number | null
  authorId: number
  authorDisplayName: string
  authorAvatarUrl?: string | null
  replyToUserId?: number | null
  replyToDisplayName?: string | null
  content: string
  status?: 'PUBLISHED' | 'HIDDEN' | 'DELETED'
  deleted?: boolean
  likeCount: number
  likedByCurrentUser: boolean
  replyCount: number
  replies: ArticleComment[]
  createdAt?: string | null
  updatedAt?: string | null
}
```

- [ ] **Step 4: Add API helpers and recursive normalizers**

Update `normalizeArticleComment` so it does not drop new fields. It must recursively normalize `replies`:

```ts
const normalizeArticleComment = (raw: Partial<ArticleComment> | null | undefined): ArticleComment => ({
  id: Number(raw?.id ?? 0),
  articleId: Number(raw?.articleId ?? 0),
  parentId: raw?.parentId == null ? null : Number(raw.parentId),
  rootId: raw?.rootId == null ? null : Number(raw.rootId),
  authorId: Number(raw?.authorId ?? 0),
  authorDisplayName: raw?.authorDisplayName || 'TerraPedia 用户',
  authorAvatarUrl: raw?.authorAvatarUrl ?? null,
  replyToUserId: raw?.replyToUserId == null ? null : Number(raw.replyToUserId),
  replyToDisplayName: raw?.replyToDisplayName ?? null,
  content: String(raw?.content ?? ''),
  status: raw?.status ?? 'PUBLISHED',
  deleted: Boolean(raw?.deleted ?? false),
  likeCount: Number(raw?.likeCount ?? 0),
  likedByCurrentUser: Boolean(raw?.likedByCurrentUser ?? false),
  replyCount: Number(raw?.replyCount ?? 0),
  replies: Array.isArray(raw?.replies) ? raw.replies.map(normalizeArticleComment).filter(item => item.id > 0) : [],
  createdAt: raw?.createdAt ?? null,
  updatedAt: raw?.updatedAt ?? null,
})
```

Add list helper return type:

```ts
type ArticleCommentListResult = {
  records: ArticleComment[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}
```

Add helpers that return records and pagination, not bare arrays:

```ts
export const fetchArticleComments = async (articleId: number | string, page = 1, limit = 10): Promise<ArticleCommentListResult> => { ... }
export const fetchArticleCommentReplies = async (articleId: number | string, commentId: number | string, page = 1, limit = 10): Promise<ArticleCommentListResult> => { ... }
export const createArticleCommentReply = async (articleId: number | string, commentId: number | string, content: string, replyToCommentId?: number | string): Promise<ArticleComment> => { ... }
export const likeArticleComment = async (articleId: number | string, commentId: number | string): Promise<ArticleComment> => { ... }
export const unlikeArticleComment = async (articleId: number | string, commentId: number | string): Promise<ArticleComment> => { ... }
```

Keep existing `createArticleComment` and `deleteOwnArticleComment`, but make `createArticleComment` send `{ content }` body.

- [ ] **Step 5: Implement two-level comment UI**

In `pages/articles/[slug].vue`:

- root comments load with `fetchArticleComments`
- page 1 replaces root comments; later pages append root comments through `appendArticleComments`
- replies render in `.article-comment-replies`
- reply page 1 replaces the owning root comment's replies; later pages append through `appendArticleCommentReplies`
- reply form renders in `.article-comment-reply-form`
- reply button opens form under the root comment
- clicking reply on a reply sets `replyToDisplayName`
- likes use `aria-pressed`
- own comments show delete
- hidden/deleted comments are not expected from public API; if a stale response has `deleted === true`, do not render its original content. Render a neutral placeholder `该评论已删除` or skip the node.
- bottom button `loadMoreArticleComments`
- hide or disable "load more" when `page >= totalPages`
- unauthenticated reply/like redirects to login with the current article path plus `#article-comments`

- [ ] **Step 6: Add runtime contract script**

Create `check-article-comments-runtime.mjs` that reads the Vue file and checks for:

- no infinite recursive component
- `aria-pressed`
- login redirect includes `#article-comments`
- reply form class
- load more class

- [ ] **Step 7: Run frontend checks**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
pnpm exec nuxt typecheck
```

Expected: all pass.

---

## Task 4: Admin Comment Management UI

**Files:**
- Modify: `data-query-app/stores/articles.ts`
- Modify: `data-query-app/pages/articles.vue`
- Modify: `data-query-app/tests/admin-articles-page-contract.test.mjs`
- Create: `data-query-app/tests/admin-article-comments-contract.test.mjs`

- [ ] **Step 1: Write failing admin contract tests**

Add checks:

```js
assert.match(page, />\s*Comments\s*</)
assert.match(page, /@click="openArticleComments\(row\)"/)
assert.match(page, /commentsArticle/)
assert.match(page, /#\{\{\s*commentsArticle\?\.id/)
assert.match(page, /articlesStore\.fetchArticleComments\(row\.id/)
assert.match(page, /commentsArticle\.value\.id/)
assert.match(page, /loadArticleCommentReplies/)
assert.match(page, /expandedCommentIds/)
assert.match(page, /updateArticleCommentStatus/)
assert.match(page, /canHideArticleComment/)
assert.match(page, /canRestoreArticleComment/)
assert.match(page, /canDeleteArticleComment/)
assert.match(store, /\/admin\/articles\/\$\{articleId\}\/comments/)
assert.match(store, /\/admin\/articles\/\$\{articleId\}\/comments\/\$\{commentId\}\/replies/)
assert.match(store, /\/admin\/articles\/\$\{articleId\}\/comments\/\$\{commentId\}\/status/)
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd data-query-app
node --test tests/admin-articles-page-contract.test.mjs tests/admin-article-comments-contract.test.mjs
```

Expected: fails because Comments UI and store helpers do not exist.

- [ ] **Step 3: Add admin store types and helpers**

Add:

```ts
export interface AdminArticleComment {
  id: number
  articleId: number
  parentId?: number | null
  rootId?: number | null
  authorId: number
  authorDisplayName: string
  authorAvatarUrl?: string
  replyToUserId?: number | null
  replyToDisplayName?: string | null
  content: string
  status: 'PUBLISHED' | 'HIDDEN' | 'DELETED'
  deleted: boolean
  deletedByType?: string
  deletedByName?: string
  deletedReason?: string
  deletedAt?: string
  likeCount: number
  replyCount: number
  createdAt?: string
  updatedAt?: string
}
```

Helpers:

```ts
fetchArticleComments(articleId: number, page = 1, size = 20, filters?: { status?: string; keyword?: string; authorId?: number }): Promise<{ records: AdminArticleComment[]; pagination: PaginationState }>
fetchArticleCommentReplies(articleId: number, commentId: number, page = 1, size = 20, status?: string): Promise<{ records: AdminArticleComment[]; pagination: PaginationState }>
updateArticleCommentStatus(articleId: number, commentId: number, status: 'PUBLISHED' | 'HIDDEN' | 'DELETED', reason?: string): Promise<AdminArticleComment>
```

Use the existing `toPagination` pattern from `data-query-app/stores/articles.ts`. Store helpers return `{ records, pagination }`; page-level refs own modal state, selected article, filters, expanded ids, reply lists, and loading states.

- [ ] **Step 4: Add article row action**

In `pages/articles.vue`, add `Comments` action beside `View Content` and `Logs`.

The click handler must pass `row`, and the data fetch must use `row.id`.

- [ ] **Step 5: Add comments modal**

Add `AppModal` with:

- title: `Article Comments`
- article identity: `#{{ commentsArticle?.id }} {{ commentsArticle?.title }}`
- filters: status and keyword
- table columns: ID, Author, Content, Status, Likes, Replies, Created, Actions
- actions: Hide, Restore, Delete
- reason textarea for Hide/Delete
- expandable reply rows:
  - root comment row shows `Replies {{ row.replyCount }}`
  - clicking expands by calling `loadArticleCommentReplies(commentsArticle.value.id, row.id, 1)`
  - replies render indented below the root comment but still use the same moderation buttons
  - all reply fetch/status calls must use `commentsArticle.value.id`, never slug/title
- status action rules:
  - `canHideArticleComment(comment)` is true only for `status === 'PUBLISHED'`
  - `canRestoreArticleComment(comment)` is true for `status === 'HIDDEN' || status === 'DELETED'`
  - `canDeleteArticleComment(comment)` is false when `status === 'DELETED'`
  - Hide and Delete require nonblank reason before calling `updateArticleCommentStatus`
  - Restore does not require reason

- [ ] **Step 6: Run admin checks**

Run:

```bash
cd data-query-app
node --test tests/admin-articles-page-contract.test.mjs tests/admin-article-comments-contract.test.mjs
pnpm run check
```

Expected: all pass.

---

## Task 5: Integration Validation

**Files:**
- No planned source edits.
- May read logs and run scripts.

- [ ] **Step 1: Run backend focused tests**

```bash
cd back
mvn -Dtest=ArticleCommentControllerTest,ArticleCommentServiceImplTest,AdminArticleCommentControllerTest,AdminArticleCommentServiceImplTest,UserAuthenticationInterceptorTest,UserWriteOriginInterceptorTest test
```

Expected: all pass.

- [ ] **Step 2: Compile backend**

```bash
cd back
mvn -DskipTests compile
```

Expected: build success.

- [ ] **Step 3: Run front checks**

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
pnpm exec nuxt typecheck
```

Expected: all pass.

- [ ] **Step 4: Run admin checks**

```bash
cd data-query-app
node --test tests/admin-articles-page-contract.test.mjs tests/admin-article-comments-contract.test.mjs
pnpm run check
```

Expected: all pass.

- [ ] **Step 5: Check whitespace**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Restart stack for runtime smoke**

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

Expected local URLs:

- front: `http://localhost:5174`
- back: `http://localhost:18088`
- admin: `http://localhost:3001`

- [ ] **Step 7: Smoke public API**

First discover a real published article instead of assuming an id:

```bash
ARTICLE_JSON=$(curl -s 'http://localhost:18088/api/articles?page=1&limit=1')
ARTICLE_ID=$(printf '%s' "$ARTICLE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); const id=j.data && j.data[0] && j.data[0].id; if(!id) process.exit(2); console.log(id);})")
ARTICLE_SLUG=$(printf '%s' "$ARTICLE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); const slug=j.data && j.data[0] && j.data[0].slug; if(!slug) process.exit(2); console.log(slug);})")
curl -s "http://localhost:18088/api/articles/${ARTICLE_ID}/comments?page=1&limit=10"
```

Expected:

- article discovery returns a concrete `ARTICLE_ID` and `ARTICLE_SLUG`
- public comments returns JSON `success`
- hidden/deleted comments are absent from public read

- [ ] **Step 8: Smoke authenticated user write API**

Use the existing local user login flow or browser session cookie. This step cannot be skipped as "needs logged-in user"; if auth is unavailable, record it as a blocker.

Verify:

```text
POST /api/articles/{ARTICLE_ID}/comments
POST /api/articles/{ARTICLE_ID}/comments/{rootCommentId}/replies
POST /api/articles/{ARTICLE_ID}/comments/{replyCommentId}/like
DELETE /api/articles/{ARTICLE_ID}/comments/{replyCommentId}/like
DELETE /api/articles/{ARTICLE_ID}/comments/{replyCommentId}
```

Expected:

- created root comment returns `parentId=null` and `rootId=id`
- created reply returns `parentId=rootCommentId`, `rootId=rootCommentId`, and `replyToDisplayName`
- like returns `likedByCurrentUser=true` and increments count once
- unlike returns `likedByCurrentUser=false`
- own delete returns `status=DELETED` or removes it from subsequent public reads

- [ ] **Step 9: Smoke admin API**

Use existing admin login/token flow if available in cookies. Verify:

```text
GET /api/admin/articles/{ARTICLE_ID}/comments?page=1&limit=20
GET /api/admin/articles/{ARTICLE_ID}/comments/{rootCommentId}/replies?page=1&limit=20
PATCH /api/admin/articles/{ARTICLE_ID}/comments/{rootCommentId}/status {"status":"HIDDEN","reason":"runtime smoke"}
PATCH /api/admin/articles/{ARTICLE_ID}/comments/{rootCommentId}/status {"status":"PUBLISHED"}
PATCH /api/admin/articles/{ARTICLE_ID}/comments/{rootCommentId}/status with a different article id
```

Expected:

- unauthenticated call returns 401
- authenticated browser session in admin can load comments modal
- hide removes the comment from public reads
- restore returns the comment to public reads
- mismatched article id is rejected and does not mutate the comment

- [ ] **Step 10: Browser smoke**

Check:

- `http://localhost:5174/articles/${ARTICLE_SLUG}`
  - comments render below article body
  - login prompt is visible when logged out
  - reply and like actions route to login if logged out
  - no horizontal overflow at 375px

- `http://localhost:3001/articles`
  - each article row has `Comments`
  - modal title shows `#id title`
  - actions use the selected article row id
  - root comment replies can be expanded and moderated

- [ ] **Step 11: Commit readiness review**

Do not commit automatically unless the user asks. Before any commit or merge decision, run:

```bash
git status --short
git diff --stat
git diff --name-only
git diff --check
git diff --cached --stat
```

Expected:

- changed files are limited to the article comment V2 scope plus already-owned article work from this feature branch
- untracked files are reviewed explicitly, especially generated demo assets and previous editor files
- staged diff is empty unless preparing a commit
- final handoff says whether the branch is left open, ready to commit, or ready to merge

## Plan Audit Checklist

- Goal lock: closes the user's complaint that article comments are too shallow and admins cannot control the correct article's comments.
- Source-chain lock: DB schema to backend API to public UI and admin UI is named.
- Boundary lock: no crawler/import/push/destructive git work.
- Evidence lock: backend tests, frontend contracts, admin contracts, compile/typecheck, runtime smoke.
- Multi-agent safety: Task 1 and Task 2 are serial for shared backend mapper/XML; Task 3 may run after Task 1; Task 4 waits for Task 2.
- Continuity: if any task discovers a missing shared mapper/service method, stop that task, repair this plan, rerun plan audit, then continue.
- Commit readiness: commit only after Task 5 passes and staged diff scope is reviewed with `git status --short`, `git diff --stat`, `git diff --name-only`, `git diff --check`, and `git diff --cached --stat`.
