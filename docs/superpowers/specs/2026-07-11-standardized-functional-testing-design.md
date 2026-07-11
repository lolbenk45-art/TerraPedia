# Standardized Functional Testing Design

## Goal

Make every new TerraPedia feature testable through one consistent contract: defined inputs, API response and side-effect expectations, UI outcome, boundary cases, cleanup, and durable acceptance evidence. User registration/login is the first reference implementation.

## Scope And Non-Goals

This design covers the maintained public Nuxt frontend, user-facing backend APIs, the local quality gate, and future CI execution. It does not add production credentials, send real email, write to production or ordinary local development data, or require browser tests for static wording-only changes.

## Chosen Architecture

Each feature owns a versioned functional-test contract under `docs/testing/contracts/`. The contract is a concise YAML document that names the feature, data owner, preconditions, request and response fields, browser results, boundaries, cleanup, test level, and priority. Test code names each case ID, so a failed command maps directly to the contract and a feature change cannot silently omit its acceptance behavior.

The standard has four complementary layers:

1. **Unit** verifies pure input rules and client transformations without a server.
2. **API contract** verifies controller/service behavior: HTTP status, `ApiResponse` envelope, response shape, auth cookies, and side effects.
3. **Browser smoke** verifies a P0 user flow through Nuxt, backend, cookies, redirects, and protected pages.
4. **Regression** verifies edge cases, expiry, duplicate data, permission/session failures, rate limits, and error recovery.

Browser tests use a dedicated E2E stack: an E2E database, E2E-only verification-code/mail sink, run-scoped test identifiers, and explicit cleanup. They must never use the ordinary local database, shared data, a real mailbox, or production credentials. The test environment has an explicit opt-in flag and fails before executing if its database or profile is not E2E-only.

## Feature Contract Format

Every behavioral feature adds a contract like this. Dynamic fields use typed matchers rather than brittle literal values; secrets are never recorded.

```yaml
id: AUTH-LOGIN-001
feature: user-auth
level: api
priority: P0
precondition:
  user: e2e.login.existing@terrapedia.test is active
request:
  method: POST
  path: /api/user-auth/login
  body:
    email: e2e.login.existing@terrapedia.test
    password: Password123
expect:
  httpStatus: 200
  envelope:
    success: true
    statusCode: 200
    message: Login success
    data:
      user.id: positive-integer
      user.email: e2e.login.existing@terrapedia.test
      user.status: 1
      tokenType: Bearer
      expiresAt: future-timestamp
  cookies:
    - name: tp_user_access
      httpOnly: true
      path: /
      maxAge: positive
    - name: tp_user_refresh
      httpOnly: true
      path: /
      maxAge: positive
  ui:
    url: /user
    visible: authenticated-user-identity
    hidden: login-error
cleanup: clear run-scoped user session and test data
```

The transport HTTP status and envelope `statusCode` are always recorded separately. This preserves current behavior such as registration's HTTP `201` response with the current success-envelope `statusCode: 200`; normalizing that mismatch is an explicit API-migration decision, never an accidental assertion change.

## User-Auth Reference Contract

The reference suite covers at least these cases:

| ID | Input / condition | Expected result |
| --- | --- | --- |
| `AUTH-LOGIN-001` | Active seeded user, `Password123` | `200`, successful envelope, access and refresh cookies, `/user` displays authenticated identity. |
| `AUTH-LOGIN-002` | Existing user, wrong password | `400`, `success=false`, `statusCode=400`, credential-error message; no authenticated state. |
| `AUTH-LOGIN-003` | Invalid email such as `not-an-email` | Unit/browser validation rejects it before a request; direct API contract gets `400`, failed envelope. |
| `AUTH-REGISTER-001` | Unique run-scoped email, `Password123`, E2E-issued verification code | Code request succeeds, registration returns HTTP `201`, successful envelope and cookies, `/user` displays the new user. |
| `AUTH-REGISTER-002` | Existing email | `400`, failed envelope, no account overwrite, no new session. |
| `AUTH-REGISTER-003` | Password length 9, 10, 64, 65; no letter; no digit | Only 10–64 characters containing both letters and digits pass. |
| `AUTH-REGISTER-004` | Empty/non-numeric/3-digit/9-digit code, expired code, wrong code | Client validation prevents malformed requests; server rejects expired/wrong valid-shape codes with a failed envelope and creates no account. |
| `AUTH-SESSION-001` | No or invalid refresh cookie | `401`, failed envelope, cookies cleared, protected route redirects to login. |
| `AUTH-SESSION-002` | Logout | Successful response, local authenticated state cleared, subsequent protected route redirects to login. |

Tests must assert semantics, not secrets: cookie names/attributes and the presence of a non-empty value are asserted, but token/cookie values, passwords, verification codes, stack traces, database URLs, and mail credentials are not written to logs, screenshots, trace files, or reports.

## Required Test Workflow

For a new feature, implementation proceeds in this order:

1. Add or update its feature contract before changing behavior.
2. Add unit cases for pure validation/transformation and run them locally.
3. Add/update backend API-contract cases for every changed request/response/auth boundary.
4. Add a P0 browser smoke case when the feature writes data, changes access/permission/session behavior, or is a user-critical path.
5. Add boundary and failure cases to the regression matrix.
6. Run the relevant commands; attach a compact, redacted result to the task devlog.

Static documentation or wording-only changes may use focused checks without browser coverage. New API, data-writing, authentication, permission, or navigation flows cannot be accepted without the applicable contract and automated tests.

## Gate And Execution Model

The public frontend's current `pnpm run check` remains the fast structural/type gate. The implementation adds explicit commands for frontend unit tests, user-auth E2E smoke, and user-auth E2E regression. The root-level E2E runner owns stack start/readiness, E2E-profile assertion, run ID, mailbox/verification-code fixture, test execution, reports, cleanup, and stop behavior.

The full quality gate runs the frontend unit suite and mandatory browser smoke after its dependent E2E stack is ready. Regression remains a named command for merge/nightly execution until its runtime and historical duration are measured. A missing browser, incorrect profile, ordinary database, unavailable E2E mailbox, or cleanup failure is a gate failure with a clear diagnostic; no fallback to real services is permitted.

## Evidence And Failure Artifacts

Every test run writes only redacted artifacts under `reports/e2e/<run-id>/`: command summary, case IDs, status, duration, screenshots/traces for failures, and cleanup result. The devlog records the command, environment type, case summary, and artifact path. It never includes raw credentials, tokens, cookies, or verification codes.

## Acceptance Criteria

- A future feature can copy the contract format and choose its required layers by risk.
- User login/registration has exact request/response/cookie/UI/boundary contracts and an isolated real-browser path.
- Mandatory smoke has a single repeatable gate command and cannot target non-E2E data.
- Regression has an explicit command and stable, redacted artifacts.
- Current frontend quality-gate wiring no longer depends on the absent `front-nuxt` `test` script.

## Residual Risks

The present supplied browser archive contains Chrome for Testing but no Playwright headless shell. Initial configuration therefore launches `channel: 'chromium'`; a future normal browser installation can remove that environment-specific restriction. Test mail/verification-code support and E2E database lifecycle require careful implementation review because they are the safety boundary that prevents test writes from leaking into ordinary local data.
