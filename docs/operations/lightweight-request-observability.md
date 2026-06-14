# Lightweight Request Observability

## Decision

TerraPedia keeps request observability lightweight in the early stage. Do not add MongoDB, ClickHouse, Loki, Elasticsearch, or full request-log MySQL tables until traffic or incident-response needs justify them.

Current split:

- MySQL stores high-signal security audit events only.
- Rolling files store normal application and request diagnostics.
- Redis stores short-lived realtime control state such as rate limits, login counters, and job locks.

## MySQL Audit Events

Keep these in `security_audit_log`:

- Login failures, lockouts, password reset failures, and session refresh failures.
- HTTP 401, 403, 429, and 5xx events from `HttpSecurityAuditInterceptor`.
- Admin operations and user security-sensitive operations already using `SecurityAuditService`.
- Upload rejection and task-conflict events when surfaced through high-signal security paths.

Do not write successful 2xx or 3xx public traffic to MySQL.

## Rolling Files

The backend writes bounded local files through `back/src/main/resources/logback-spring.xml`.

Defaults:

- Root directory: `logs`
- App log: `terrapedia-app.log`
- Security log: `terrapedia-security.log`
- Per-file rollover: `20MB`
- Retention: `14` days
- Total cap: `1GB`

Environment overrides:

```bash
TERRARIA_LOG_FILE_ROOT=/var/log/terrapedia
TERRARIA_LOG_MAX_FILE_SIZE=20MB
TERRARIA_LOG_MAX_HISTORY=14
TERRARIA_LOG_TOTAL_SIZE_CAP=1GB
```

## Incident Search

Search by request id:

```bash
rg "requestId=<id>" logs/
```

Search by IP:

```bash
rg "198.51.100.77" logs/
```

Search denied or limited requests:

```bash
rg "HTTP_REQUEST_DENIED|status=429" logs/
```

Search server errors:

```bash
rg "HTTP_REQUEST_ERROR|status=500|ERROR" logs/
```

## Privacy Rules

Do not log:

- Request bodies.
- Passwords.
- Tokens.
- Cookies.
- Authorization headers.
- Full emails when masked email is enough.

## Upgrade Triggers

Add Loki, ClickHouse, OpenSearch, or another dedicated log database only when one of these becomes true:

- Daily requests are consistently above 50,000 to 100,000.
- Full request search is needed across more than 14 days.
- Attacks require frequent aggregation by IP, path, status, or user-agent.
- Rolling file search is too slow for incident response.
- MySQL audit queries are no longer enough to explain security incidents.
