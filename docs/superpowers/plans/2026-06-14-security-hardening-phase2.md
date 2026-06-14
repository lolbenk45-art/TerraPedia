# Security Hardening Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add operational abuse resistance beyond Phase 1 by throttling hot routes, guarding long-running admin jobs, strengthening image uploads, and reducing public cache stampede risk.

**Architecture:** Keep controls additive and narrowly scoped. Redis remains the coordination plane for short-lived rate limits and job locks; controller/service code only calls small security helpers; public cache methods use Spring cache single-flight where supported.

**Tech Stack:** Spring Boot 3 MVC interceptors, Redis `StringRedisTemplate`, Spring Cache, MinIO upload service, JUnit 5, Mockito, MockMvc.

---

## Scope

This phase implements:

- Route-tier Redis rate limiting for public reads, unauthenticated auth endpoints, user writes, uploads, and admin writes.
- Distributed lock guard for long-running admin jobs: wiki image sync and item import.
- Strong image upload validation for normal MinIO uploads by reusing the avatar validator rules for JPEG/PNG/WebP and rejecting SVG for user/admin uploads.
- Cache stampede mitigation for hot public `@Cacheable` methods via `sync = true`; because Spring cache sync mode cannot be combined with `unless`, remove `unless = "#result == null"` only from the selected hot methods and rely on existing Redis cache null-value disabling for Redis-backed runtime caches.

This phase does not implement a full admin UI for audit logs, external log shipping, MFA, WAF rules, or search index migration.

## File Structure

- Create `back/src/main/java/com/terraria/skills/security/HttpRateLimitProperties.java`: route-tier limits and enable switch.
- Create `back/src/main/java/com/terraria/skills/security/HttpRateLimitInterceptor.java`: Redis fixed-window limiter using `ClientIpResolver`.
- Create `back/src/main/java/com/terraria/skills/security/AdminJobLockService.java`: Redis lock helper with token-safe release.
- Modify `back/src/main/java/com/terraria/skills/config/WebConfig.java`: register rate-limit properties and interceptor after request audit but before blocking/business interceptors.
- Modify `back/src/main/java/com/terraria/skills/controller/AdminStorageController.java`: guard `/admin/storage/wiki-images/sync` with job lock.
- Modify `back/src/main/java/com/terraria/skills/controller/ItemImportController.java`: guard non-dry-run `/items/import` with job lock.
- Modify `back/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java`: reject spoofed or unsafe image uploads and disallow SVG.
- Modify hot cache annotations in `PublicItemServiceImpl`, `PublicItemAggregateService`, `ItemServiceImpl`, and `PublicHomeServiceImpl` to use `sync = true`.
- Modify `back/src/main/resources/application.yml`: expose rate-limit and job-lock defaults.
- Add focused tests for each helper and touched controller/service behavior.

## Tasks

### Pre-Phase-2 Cross-Review Fixes

- [x] Fix trusted proxy client IP parsing so spoofed leftmost `X-Forwarded-For` entries are ignored when a trusted proxy appends the real client IP.
- [x] Add username-only administrator login failure locking to prevent distributed guessing of the same admin account.
- [x] Add `ClientIpResolverTest` and `AdminLoginRateLimitServiceTest` coverage for both findings.
- [x] Run `mvn -Dtest=ClientIpResolverTest,AdminLoginRateLimitServiceTest test`.

### Task 1: Route-Tier Redis Rate Limiting

- [x] Write `HttpRateLimitInterceptorTest` covering public GET limit, auth endpoint limit, user write limit, and disabled mode.
- [x] Implement `HttpRateLimitProperties` with defaults:
  - public read: 120 requests / 60 seconds
  - auth: 20 requests / 60 seconds
  - user write: 60 requests / 60 seconds
  - upload: 20 requests / 60 seconds
  - admin write: 80 requests / 60 seconds
- [x] Implement `HttpRateLimitInterceptor` with Redis keys `security:http-rate:<tier>:<ip>:<window>`.
- [x] Return HTTP 429 JSON `ApiResponse.error(429, "请求过于频繁，请稍后再试")` when exceeded.
- [x] Register interceptor after `HttpSecurityAuditInterceptor` and before origin/auth interceptors.
- [x] Run `mvn -Dtest=HttpRateLimitInterceptorTest,WebConfigTest test`.

### Task 2: Long-Running Admin Job Lock

- [x] Write `AdminJobLockServiceTest` proving a second lock attempt fails and release only deletes the matching token.
- [x] Implement `AdminJobLockService` with `tryAcquire(jobKey, ttlSeconds)`, `release(lock)`, and token-safe release.
- [x] Write controller tests proving concurrent wiki sync/import returns 409.
- [x] Wrap `AdminStorageController.syncWikiImages` with lock key `admin-job:wiki-image-sync`.
- [x] Wrap non-dry-run `ItemImportController.importItems` with lock key `admin-job:item-import`; dry-run remains unlocked.
- [x] Run `mvn -Dtest=AdminJobLockServiceTest,AdminStorageControllerTest,ItemImportControllerTest test`.

### Task 3: Strong Upload Validation

- [x] Add `MinioObjectStorageServiceImplTest` cases:
  - reject SVG upload with `image/svg+xml`
  - reject PNG content type whose bytes are not PNG
  - accept valid PNG/JPEG/WebP samples already covered or add a valid PNG sample.
- [x] Add a small internal validation method in `MinioObjectStorageServiceImpl` that delegates to `UserAvatarValidator.validateAndResolve(file)` for normal item/article/admin image uploads.
- [x] Ensure object extension comes from validated content, not untrusted filename/content type.
- [x] Keep wiki image localization behavior unchanged because it mirrors external wiki assets through separate code paths.
- [x] Run `mvn -Dtest=MinioObjectStorageServiceImplTest,FileStorageControllerTest,UserArticleControllerTest test`.

### Task 4: Cache Stampede Mitigation

- [x] Add a lightweight source scan test or focused service test proving selected annotations include `sync = true`.
- [x] Update hot cache annotations:
  - `PublicItemServiceImpl#getPublicItems`
  - `PublicItemServiceImpl#getPublicItemById`
  - `PublicItemServiceImpl#searchSuggestions`
  - `PublicItemAggregateService#getItemAggregate`
  - `ItemServiceImpl#getItems`
  - `ItemServiceImpl#getItemById`
  - `ItemServiceImpl#searchSuggestions`
  - `PublicHomeServiceImpl#getFocusItem`
- [x] Ensure the selected annotations do not keep `unless` while using `sync = true`; Spring rejects that combination at runtime.
- [x] Run `mvn -Dtest=PublicItemServiceImplTest,PublicItemAggregateServiceCachingTest,ItemServiceCachingTest,ItemSuggestionsCachingTest test`.

### Task 5: Final Verification

- [x] Add `application.yml` defaults for `terraria.security.http-rate-limit` and `terraria.security.admin-job-lock`.
- [x] Run focused verification:

```bash
cd back
mvn -Dtest=HttpRateLimitInterceptorTest,WebConfigTest,AdminJobLockServiceTest,AdminStorageControllerTest,ItemImportControllerTest,MinioObjectStorageServiceImplTest,FileStorageControllerTest,UserArticleControllerTest,PublicItemServiceImplTest,PublicItemAggregateServiceCachingTest,ItemServiceCachingTest,ItemSuggestionsCachingTest test
```

- [x] Run `git status --short` and review changed files.

Final verification result: `Tests run: 55, Failures: 0, Errors: 0, Skipped: 0`.

## Self-Review

- Spec coverage: all Phase 2 findings map to executable tasks.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: class and property names are consistent across tasks.
- Risk boundary: no schema migration, no UI changes, no unrelated data changes.
