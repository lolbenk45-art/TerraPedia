# Security Hardening Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production safety layer for TerraPedia network security: trustworthy client IP resolution, admin login throttling/audit, request correlation, selected request auditing, and legacy public list bounding.

**Architecture:** Keep the change additive and backend-focused. Security state remains split by purpose: Redis for short-window throttling, MySQL `security_audit_log` for durable high-signal events, and request IDs for log/audit correlation.

**Tech Stack:** Spring Boot 3, MVC interceptors/filters, Redis `StringRedisTemplate`, MyBatis Plus audit mapper, JUnit 5, Mockito, MockMvc.

---

## Scope

This phase implements P0/P1 controls only:

- Trusted client IP resolver with configurable trusted proxy addresses.
- Admin login Redis rate limiting and MySQL audit events.
- Request ID filter that returns `X-Request-ID` and makes it available to logs/audits.
- HTTP security audit interceptor for denied/suspicious outcomes.
- Legacy `/items` list limit cap.

This phase does not implement global per-route rate limiting, distributed locks for long admin jobs, upload magic-byte validation, or cache stampede protection. Those remain Phase 2.

## File Structure

- Create `back/src/main/java/com/terraria/skills/security/SecurityNetworkProperties.java`: trusted proxy and request audit configuration.
- Create `back/src/main/java/com/terraria/skills/security/ClientIpResolver.java`: centralized IP extraction.
- Create `back/src/main/java/com/terraria/skills/security/RequestIdFilter.java`: request ID generation/propagation.
- Create `back/src/main/java/com/terraria/skills/security/HttpSecurityAuditInterceptor.java`: high-signal HTTP event persistence.
- Create `back/src/main/java/com/terraria/skills/auth/AdminLoginRateLimitProperties.java`: admin login throttle configuration.
- Create `back/src/main/java/com/terraria/skills/auth/AdminLoginRateLimitService.java`: Redis counters and locks for admin login.
- Modify `back/src/main/java/com/terraria/skills/config/WebConfig.java`: register new properties and audit interceptor.
- Modify `back/src/main/java/com/terraria/skills/controller/AuthController.java`: add admin limit/audit/IP resolver.
- Modify `back/src/main/java/com/terraria/skills/controller/UserAuthController.java`: use centralized IP resolver.
- Modify `back/src/main/java/com/terraria/skills/controller/ItemController.java`: cap legacy public list limit at 100.
- Modify `back/src/main/resources/application.yml`: expose defaults for the new controls.
- Add focused tests under `back/src/test/java/com/terraria/skills/security`, `back/src/test/java/com/terraria/skills/auth`, and controller tests.

## Tasks

### Task 1: Trusted Client IP Resolver

- [ ] Write tests for direct remote address fallback and trusted proxy X-Forwarded-For handling.
- [ ] Implement `SecurityNetworkProperties`.
- [ ] Implement `ClientIpResolver`.
- [ ] Replace `UserAuthController` direct `X-Forwarded-For` parsing with resolver injection.
- [ ] Run `mvn -Dtest=ClientIpResolverTest,UserAuthControllerTest test`.

### Task 2: Admin Login Throttle And Audit

- [ ] Write tests for failed admin login audit/rate-limit recording and locked login rejection.
- [ ] Implement `AdminLoginRateLimitProperties`.
- [ ] Implement `AdminLoginRateLimitService`.
- [ ] Wire `AuthController` to use client IP resolver, rate limiter, and `SecurityAuditService`.
- [ ] Run `mvn -Dtest=AuthControllerTest,AdminLoginRateLimitServiceTest test`.

### Task 3: Request ID And HTTP Security Audit

- [ ] Write tests for `X-Request-ID` response propagation.
- [ ] Write interceptor tests for 401/403/5xx audit persistence and normal 200 suppression.
- [ ] Implement `RequestIdFilter`.
- [ ] Implement `HttpSecurityAuditInterceptor`.
- [ ] Register the interceptor after auth/origin interceptors.
- [ ] Run `mvn -Dtest=RequestIdFilterTest,HttpSecurityAuditInterceptorTest test`.

### Task 4: Legacy Public List Limit Cap

- [ ] Add controller test proving `/items?limit=999` forwards `limit=100`.
- [ ] Change `ItemController` to call `PaginationParams.resolveLimit(limit, size, 20, 100)`.
- [ ] Run `mvn -Dtest=ItemControllerPaginationCompatibilityTest test`.

### Task 5: Configuration And Verification

- [ ] Add `application.yml` defaults for `terraria.security.network` and `terraria.security.admin-login-rate-limit`.
- [ ] Run focused backend verification:

```bash
cd back
mvn -Dtest=ClientIpResolverTest,UserAuthControllerTest,AuthControllerTest,AdminLoginRateLimitServiceTest,RequestIdFilterTest,HttpSecurityAuditInterceptorTest,ItemControllerPaginationCompatibilityTest test
```

- [ ] Run `git status --short` and review changed files.

## Self-Review

- Spec coverage: P0/P1 requirements are mapped to tasks.
- Placeholder scan: no placeholders or open implementation details.
- Type consistency: names match intended Java classes and Spring configuration properties.
