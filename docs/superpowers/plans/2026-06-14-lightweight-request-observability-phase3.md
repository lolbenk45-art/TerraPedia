# Lightweight Request Observability Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the project lightweight in the early stage by retaining only high-signal security events in MySQL, writing normal runtime logs to rolling files, and documenting when to upgrade to a dedicated log database.

**Architecture:** Do not add MongoDB, ClickHouse, Loki, or Elasticsearch now. MySQL remains the high-signal audit store through `SecurityAuditService`; Redis remains the realtime control plane for rate limits and locks; Logback rolling files provide short-retention request and application diagnostics for normal traffic.

**Tech Stack:** Spring Boot 3, Logback, existing `SecurityAuditService`, JUnit 5, Mockito, Maven.

---

## Scope

This phase implements:

- A clear lightweight observability decision record.
- Rolling application/request log files with 14-day retention and bounded disk usage.
- Tests proving ordinary successful requests do not enter MySQL security audit.
- Tests proving high-signal HTTP statuses still enter MySQL security audit.
- Configuration defaults for log path and retention that work locally without another service.

This phase does not implement:

- MongoDB request logging.
- Full request body capture.
- Full request log ingestion into MySQL.
- Admin UI for browsing logs.
- Production log shipping.
- Schema migration for new request-log tables.

## Decision

For this project's current early-stage traffic profile, use:

- MySQL: high-signal security and audit events only.
- File logs: ordinary app/request diagnostics with rolling retention.
- Redis: short-lived rate limits, lock counters, and abuse-control state.

Upgrade to a dedicated log database only when one of these triggers is met:

- Daily requests are consistently above 50,000 to 100,000.
- You need full request search across more than 14 days.
- Attacks require frequent aggregation by IP, path, status, or user-agent.
- Rolling file search is too slow for incident response.
- MySQL audit queries are no longer enough to explain security incidents.

## File Structure

- Create `back/src/main/resources/logback-spring.xml`: console plus rolling file appenders.
- Modify `back/src/main/resources/application.yml`: add `terraria.logging.file-root`, retention, max-file-size, and total-size-cap defaults.
- Modify `back/src/test/java/com/terraria/skills/security/HttpSecurityAuditInterceptorTest.java`: add explicit coverage that 2xx/3xx normal traffic does not call `SecurityAuditService`, while 401/403/429/5xx still does.
- Add `back/src/test/java/com/terraria/skills/config/LogbackConfigurationTest.java`: verify `logback-spring.xml` contains rolling appenders, app/request/security filenames, and retention placeholders.
- Create `docs/operations/lightweight-request-observability.md`: operational explanation, what is in MySQL, what stays in files, how to search by requestId/IP/path, upgrade triggers.

## Tasks

### Task 1: Lock MySQL Audit Boundary

- [x] Extend `HttpSecurityAuditInterceptorTest` with:
  - `shouldSkipSuccessfulRedirectRequests`
  - `shouldAuditUnauthorizedTooManyRequestsAndServerErrors`
- [x] Run `mvn -Dtest=HttpSecurityAuditInterceptorTest test` and verify the new tests pass with the current high-signal-only behavior.

### Task 2: Add Rolling File Logging

- [x] Add `LogbackConfigurationTest` that reads `src/main/resources/logback-spring.xml` and asserts:
  - file contains `RollingFileAppender`
  - file contains `${TERRARIA_LOG_FILE_ROOT:-logs}`
  - file contains `terrapedia-app.%d{yyyy-MM-dd}.%i.log.gz`
  - file contains `terrapedia-security.%d{yyyy-MM-dd}.%i.log.gz`
  - file contains `${TERRARIA_LOG_MAX_HISTORY:-14}`
  - file contains `${TERRARIA_LOG_TOTAL_SIZE_CAP:-1GB}`
- [x] Run `mvn -Dtest=LogbackConfigurationTest test` and verify it fails because the file is missing.
- [x] Create `back/src/main/resources/logback-spring.xml` with:
  - Console appender.
  - Rolling `APP_FILE` appender for all app logs.
  - Rolling `SECURITY_FILE` appender for `com.terraria.skills.security`, `com.terraria.skills.auth`, and `com.terraria.skills.service.impl.SecurityAuditServiceImpl`.
  - 14-day default retention.
  - 20MB default per-file rollover.
  - 1GB default total size cap.
- [x] Run `mvn -Dtest=LogbackConfigurationTest test` and verify it passes.

### Task 3: Document Lightweight Operations

- [x] Create `docs/operations/lightweight-request-observability.md` with:
  - Current decision: no MongoDB now.
  - MySQL stores only high-signal audit events.
  - Normal request diagnostics live in rolling files.
  - Redis stores realtime rate-limit and lock state only.
  - Example commands:

```bash
rg "requestId=<id>" logs/
rg "198.51.100.77" logs/
rg "HTTP_REQUEST_DENIED|status=429" logs/
```

- [x] Include upgrade triggers exactly from the Decision section.
- [x] Include privacy rule: do not log request bodies, passwords, tokens, cookies, or full emails.

### Task 4: Final Verification

- [x] Run:

```bash
cd back
mvn -Dtest=HttpSecurityAuditInterceptorTest,LogbackConfigurationTest test
```

- [x] Run `git status --short`.
- [x] Review changed files and confirm no MongoDB dependency, schema migration, or full request-log table was added.

Final verification result: `Tests run: 6, Failures: 0, Errors: 0, Skipped: 0`.

## Self-Review

## Verdict
- Status: Execution-ready.
- Main goal: Keep observability lightweight for early-stage usage without introducing MongoDB or full request-log persistence.
- Closure definition: MySQL audit boundary is covered by tests, rolling file logging is configured and tested, and operational guidance exists.

## Blocking Plan Defects
- Critical: None.
- Important: None.

## Plan Repairs
- Change: Scope explicitly excludes MongoDB and full MySQL request logging.
- Reason: User chose lightweight practical operation for an early-stage project with low traffic.
- Validation added: Tests verify high-signal-only audit behavior and rolling log configuration.

## Execution-Ready Plan
- Scope: Backend logging config, audit boundary tests, operations documentation.
- Agent split: Single-session execution is sufficient because changes are small and share context.
- Smoke test: `mvn -Dtest=HttpSecurityAuditInterceptorTest,LogbackConfigurationTest test`.
- Final validation: `git status --short` plus diff review for no MongoDB/schema/full-log additions.

## Residual Risk
- Risk: File logs are local unless deployment mounts or ships them.
- Follow-up trigger: Add Loki/ClickHouse/OpenSearch only after the traffic or incident-response triggers listed above are met.
