# Standardized Functional Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reusable feature-test contract and an isolated, mandatory user-auth browser smoke workflow that proves real registration, login, logout, cookies, redirects, and API envelopes without writing to ordinary local data.

**Architecture:** A feature contract documents deterministic input/output/UI/boundary behavior. Pure frontend validation is tested with Node, backend behavior with JUnit, and Playwright exercises the real Nuxt-to-backend path. The E2E runner creates a uniquely named MySQL database and uses a dedicated Redis logical DB; the backend can start in the `e2e` profile only when an early guard validates its explicit opt-in, database name, loopback services, run ID, and secret. An E2E-only mailbox component supplies registration codes to Playwright without exposing a production endpoint or real email.

**Tech Stack:** Nuxt 4, Pinia, Node built-in test runner, Playwright 1.61.1, Spring Boot 3/Java 17, JUnit 5/MockMvc, MySQL, Redis, Bash, GitHub Actions.

---

## Locked Scope And Boundaries

- Never connect E2E to `terria_v1_local`, a shared database, a real SMTP host, or Redis database `0`.
- Every E2E run creates `terria_v1_e2e_<safe-run-id>` exclusively and drops it only after recording ownership. The runner holds a cross-worktree OS `flock` at `/tmp/terrapedia-user-auth-e2e.lock` from before Redis setup through cleanup, uses Redis database `15`, flushes that database only after loopback/opt-in checks, and reports cleanup success or failure.
- The test-only code-retrieval endpoint is compiled and mapped only in Spring `e2e` profile, requires a per-run secret header, and is unavailable in normal/production profiles.
- Browser configuration uses `channel: 'chromium'`; the supplied local Chrome for Testing cache has no headless-shell. No raw password, verification code, token, cookie value, DB password, or E2E secret may be printed into reports, screenshots, or Playwright traces; the initial suite keeps traces disabled until a redaction pipeline exists.
- Existing `check:visual` remains untouched. It is a layout audit, not a user-auth E2E framework.
- No production migration or persistent seed user is added. Flyway migrates the disposable E2E database at run start.

## File Map

| Path | Responsibility |
| --- | --- |
| `docs/testing/contracts/user-auth.yaml` | Source-of-truth user-auth input/output/UI/boundary test matrix. |
| `front-nuxt/lib/userAuthValidation.mjs` | Pure, code-returning email/password/verification-code validation. |
| `front-nuxt/tests/unit/userAuthValidation.test.mjs` | Unit boundary matrix for the pure validation module. |
| `front-nuxt/stores/userAuth.ts` | Maps validation codes to current Chinese UI errors and reuses the pure module. |
| `back/src/main/resources/application-e2e.yml` | E2E-only data, Redis, auth, and mail configuration. |
| `back/src/main/java/.../config/E2eEnvironmentPostProcessor.java` | Fails before Flyway if E2E is not explicitly isolated. |
| `back/src/main/java/.../auth/VerificationCodeDelivery.java` | Small delivery seam used by normal SMTP and E2E mailbox implementations. |
| `back/src/main/java/.../auth/SmtpVerificationCodeDelivery.java` | Production/default verification-code mail delivery. |
| `back/src/main/java/.../auth/E2eVerificationCodeMailbox.java` | E2E-only in-memory delivery sink guarded by run secret. |
| `back/src/main/java/.../controller/E2eVerificationMailboxController.java` | E2E-only code lookup endpoint, never mapped outside the profile. |
| `back/src/main/java/.../auth/VerificationCodeGenerator.java` | Injectable code-generation seam used to make verification delivery tests deterministic. |
| `back/src/main/resources/META-INF/spring.factories` | Registers the early environment post-processor. |
| `back/src/test/java/.../config/E2eEnvironmentPostProcessorTest.java` | Guard red/green test cases. |
| `back/src/test/java/.../auth/RegisterVerificationServiceTest.java` | Code delivery/consumption test cases. |
| `back/src/test/java/.../controller/UserAuthControllerTest.java` | Login/register HTTP, envelope, and cookie contract tests. |
| `scripts/dev/run-user-auth-e2e.sh` | Owns E2E database lifecycle, backend/frontend processes, Playwright invocation, artifacts, and cleanup. |
| `scripts/dev/run-user-auth-e2e.test.mjs` | Behavioral fake-command tests for runner guard, isolation variables, ownership, and cleanup commands. |
| `front-nuxt/playwright.config.ts` | Chromium-channel, artifact, retry, reporter, and E2E environment policy. |
| `front-nuxt/e2e/support/auth-fixtures.ts` | Run-scoped credentials, response/cookie assertions, and E2E mailbox client with redacted errors. |
| `front-nuxt/e2e/user-auth.smoke.spec.ts` | P0 registration, login, and logout browser cases. |
| `front-nuxt/e2e/user-auth.regression.spec.ts` | Negative authentication, validation, duplicate, and refresh/session cases. |
| `front-nuxt/package.json` | Stable `test`, unit, smoke, and regression commands. |
| `scripts/dev/quality-gate.sh`, `scripts/dev/quality-gate-ci.sh` | Calls frontend unit/build check then the mandatory isolated smoke runner. |
| `.github/workflows/quality-gate.yml` | Supplies MySQL/Redis, installs Chromium, and runs the CI gate. |
| `docs/project-governance/00_CURRENT_SPEC.md`, `docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md` | Records the changed default validation workflow. |

### Task 1: Make the User-Auth Contract and Validation Rules Executable

**Files:**

- Create: `docs/testing/contracts/user-auth.yaml`
- Create: `front-nuxt/lib/userAuthValidation.mjs`
- Create: `front-nuxt/tests/unit/userAuthValidation.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/controller/UserAuthController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/UserAuthControllerTest.java`
- Modify: `front-nuxt/stores/userAuth.ts`
- Modify: `front-nuxt/package.json`

- [x] **Step 1: Write the failing contract/validation tests.**

Create `userAuthValidation.test.mjs` using the Node test runner. It must expect these exact result codes from the absent module:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEmail, validatePassword, validateVerificationCode } from '../../lib/userAuthValidation.mjs'

test('AUTH-LOGIN-003 rejects malformed email before a request', () => {
  assert.deepEqual(validateEmail('not-an-email'), { ok: false, code: 'EMAIL_INVALID' })
})

test('AUTH-REGISTER-003 accepts only a 10-64 character password containing a letter and a digit', () => {
  assert.equal(validatePassword('Abcdefg12').code, 'PASSWORD_INVALID')
  assert.deepEqual(validatePassword('Abcdefg123'), { ok: true, value: 'Abcdefg123' })
  assert.equal(validatePassword(`A1${'x'.repeat(63)}`).code, 'PASSWORD_INVALID')
  assert.equal(validatePassword('abcdefghij').code, 'PASSWORD_INVALID')
  assert.equal(validatePassword('1234567890').code, 'PASSWORD_INVALID')
})

test('AUTH-REGISTER-004 accepts only 4-8 numeric verification-code characters', () => {
  assert.equal(validateVerificationCode('123').code, 'VERIFICATION_CODE_INVALID')
  assert.deepEqual(validateVerificationCode('123456'), { ok: true, value: '123456' })
  assert.equal(validateVerificationCode('123456789').code, 'VERIFICATION_CODE_INVALID')
})
```

Run: `cd front-nuxt && node --test tests/unit/userAuthValidation.test.mjs`

Expected: failure because `userAuthValidation.mjs` does not yet exist.

- [x] **Step 2: Add the minimum pure validation module.**

Create `front-nuxt/lib/userAuthValidation.mjs` with no Nuxt/Pinia imports. It exports `validateEmail`, `validatePassword`, and `validateVerificationCode`; success returns `{ ok: true, value }`, failure returns `{ ok: false, code }`. Trim email/code, preserve password exactly, use the current rules from `userAuth.ts`, and never return a password in an error.

Modify `userAuth.ts` so its existing `requireEmail`, `requirePassword`, and `requireVerificationCode` call the pure validators and map the three codes to the existing Chinese messages. Preserve the public store methods and their current API payload shapes.

Run: `cd front-nuxt && node --test tests/unit/userAuthValidation.test.mjs`

Expected: all tests pass.

- [x] **Step 3: Create the machine-readable user-auth contract.**

Create `docs/testing/contracts/user-auth.yaml` with cases `AUTH-LOGIN-001` through `AUTH-LOGIN-003`, `AUTH-REGISTER-001` through `AUTH-REGISTER-004`, and `AUTH-SESSION-001` through `AUTH-SESSION-002`. Every case has `level`, `priority`, `precondition`, `request`, `expect`, and `cleanup`; record the external `/api/user-auth/...` path (not the frontend composable's relative path), login `200/200`, register HTTP `201` with envelope `statusCode: 200`, failed contract responses `400` or `401`, structured body/cookie/write assertions, UI route/visibility result, and no-write boundaries for failures.

Run: `rg -n 'AUTH-(LOGIN|REGISTER|SESSION)-00[1-4]' docs/testing/contracts/user-auth.yaml`

Expected: every required case ID is present exactly once.

- [x] **Step 4: Make missing-refresh cleanup match the session contract.**

Add a failing MockMvc assertion to `shouldRejectRefreshWithoutRefreshCookie` that both
`tp_user_access` and `tp_user_refresh` are returned with max age `0`; it must continue to
assert `401`, failed envelope, and no interaction with `UserAuthService`. Then make the
minimum controller-only change: the missing/blank refresh-token branch calls the existing
`clearAuthCookies(httpResponse)` before returning its current `401` response. Do not change
the response status/message, cookie names/attributes, service calls, database behavior, or
any unrelated authentication flow.

Run: `cd back && mvn -Dtest=UserAuthControllerTest test`

Expected: the new test fails before the controller change and passes afterwards.

- [x] **Step 5: Make contract paths, shapes, and direct API failure boundaries executable.**

Keep exactly the same nine case IDs, but use the external `/api/user-auth/...` path in every
HTTP request. Replace prose body/cookie/write assertions with structured maps/lists that can
be read by future test helpers without carrying secret values. Model both layers under their
existing IDs: `AUTH-LOGIN-003` must state client no-request behavior and direct malformed API
`400`/failed-envelope/no-service-call behavior; `AUTH-REGISTER-004` must state client
malformed-code blocking and server wrong/expired valid-shape-code `400`/failed-envelope/no-new
auth-cookie or account/session behavior. Add `success: false` and envelope `statusCode` checks
to each failed API expectation. Under `AUTH-SESSION-001`, enumerate deterministic `missing`
and `invalid` refresh-cookie variants; the invalid variant names `tp_user_refresh`, uses a
redacted invalid-token fixture, and asserts the same failed-envelope/cleared-cookie/no-write
result so a later helper cannot silently exercise only one branch.

In `UserAuthControllerTest`, first add focused MockMvc assertions using the actual external
`/api` context path plus `GlobalExceptionHandler`: malformed login email produces `400`,
`success=false`, `statusCode=400`, no auth cookies, and no service call; a valid-shape but
rejected registration code produces the same failed envelope/no-cookie result; missing and
invalid refresh responses both assert envelope `statusCode=401`. Then configure the test
harness with the advice or make the smallest existing-code correction required to pass. Do not
change external response messages, auth cookie attributes, user-service side effects, database
behavior, or the fixed nine-case contract boundary.

Run: `cd back && mvn -Dtest=UserAuthControllerTest test`

Expected: each newly added assertion first exposes the absent contract/harness behavior, then
the focused test passes without a service start.

- [x] **Step 6: Add the frontend unit command without yet invoking E2E.**

Add `"test:unit": "node --test tests/unit/*.test.mjs"` and make `test` exactly `pnpm run check && pnpm run build && pnpm run test:unit`. Do not put E2E into this package command because only the root runner can prove data isolation.

Run: `cd front-nuxt && pnpm run test:unit`

Expected: validation tests pass. Then run `pnpm run check:user-module` to prove current user-module contracts remain intact.

### Task 2: Add the Backend E2E Safety Boundary and Verification-Code Mailbox

**Files:**

- Create: `back/src/main/resources/application-e2e.yml`
- Create: `back/src/main/java/com/terraria/skills/config/E2eEnvironmentPostProcessor.java`
- Create: `back/src/main/java/com/terraria/skills/auth/VerificationCodeDelivery.java`
- Create: `back/src/main/java/com/terraria/skills/auth/VerificationCodeGenerator.java`
- Create: `back/src/main/java/com/terraria/skills/auth/SmtpVerificationCodeDelivery.java`
- Create: `back/src/main/java/com/terraria/skills/auth/E2eVerificationCodeMailbox.java`
- Create: `back/src/main/java/com/terraria/skills/controller/E2eVerificationMailboxController.java`
- Create: `back/src/test/java/com/terraria/skills/config/E2eEnvironmentPostProcessorTest.java`
- Create: `back/src/test/java/com/terraria/skills/auth/RegisterVerificationServiceTest.java`
- Modify: `back/src/main/java/com/terraria/skills/auth/RegisterVerificationService.java`
- Modify: `back/src/main/resources/META-INF/spring.factories`
- Modify: `back/src/test/java/com/terraria/skills/controller/UserAuthControllerTest.java`

- [x] **Step 1: Write the failing early-guard tests.**

Create `E2eEnvironmentPostProcessorTest` around `MockEnvironment`. It must prove: normal profiles are a no-op; `e2e` combined with another explicit profile fails; `e2e` without `terrapedia.e2e.enabled=true` fails; an E2E URL for `terria_v1_local` fails; a non-loopback MySQL/Redis host fails; a non-loopback server address fails; and a URL matching `jdbc:mysql://127.0.0.1:<port>/terria_v1_e2e_<safe-run-id>` with Redis DB `15`, non-empty run ID, and non-empty run secret passes.

Run: `cd back && mvn -Dtest=E2eEnvironmentPostProcessorTest test`

Expected: compilation/test failure because the post-processor does not exist.

- [x] **Step 2: Implement the guard before Flyway can write.**

Implement `EnvironmentPostProcessor` at `ConfigDataEnvironmentPostProcessor.ORDER + 1`: this is after Spring Boot has loaded `application-e2e.yml` but before any application context, Flyway, JDBC, or Redis bean can be created. Treat `spring.profiles.default=e2e` as effective E2E activation when no active profile exists, reject any additional active/included/default effective profile, and require all of:

```text
terrapedia.e2e.enabled=true
terrapedia.e2e.run-id matches [a-z0-9][a-z0-9_-]{5,40}
terrapedia.e2e.run-secret has at least 24 characters
spring.datasource.url database name matches terria_v1_e2e_<run-id>
spring.datasource.url host is localhost or 127.0.0.1
spring.data.redis.host is localhost or 127.0.0.1
spring.data.redis.database is 15
server.address is localhost or 127.0.0.1
```

Throw `IllegalStateException` with the failed property name, never the secret. Register it in `META-INF/spring.factories` under `org.springframework.boot.env.EnvironmentPostProcessor`. Add a bootstrapped test using a fake JDBC driver that fails if `connect` is called: an unsafe E2E configuration must fail during environment processing before the fake driver sees a connection attempt.

Reject all alternate datasource targets—not only dotted properties but also relaxed system-environment spellings—such as Hikari `jdbc-url`, Hikari data-source class/properties, datasource JNDI/type, and their raw `SPRING_DATASOURCE_...` names. Add a `SystemEnvironmentPropertySource` regression test for a Hikari data-source-properties environment variable.

Reject a standalone Flyway URL (`spring.flyway.url` and raw environment spelling), because it can bypass the guarded datasource and migrate another database; prove it fails before a fake JDBC driver connects. Also reject Redis alternate target modes for both current and legacy namespaces: `url`, every sentinel property, and every cluster property, including raw `SPRING_DATA_REDIS_...` / `SPRING_REDIS_...` spellings. Add `SystemEnvironmentPropertySource` regressions for raw Flyway and Redis URL properties.

For every rejected Hikari/JNDI and prefix property, compare a separator-insensitive compact canonical name as well as ordinary dotted/underscore spellings, because Spring Boot's Binder accepts canonical environment names such as `SPRING_DATASOURCE_HIKARI_JDBCURL`. Reject the entire `spring.redis.redisson.` prefix, including raw `SPRING_REDIS_REDISSON_...`, because Redisson can independently provide single/sentinel/cluster Redis targets. Add redacted raw-environment regression tests for compact Hikari JDBC URL and Redisson config properties.

Create `application-e2e.yml`: it activates only under `e2e`, binds the server to `127.0.0.1`, takes the JDBC URL/user/password/run ID/secret from `TERRAPEDIA_E2E_*`, sets Redis DB `15`, uses fixed non-production token secrets supplied by the runner, disables `local-dev-fallback-enabled`, and declares `terrapedia.e2e.enabled` false by default. It must not contain an ordinary DB, real SMTP hostname, credential, or an auto-create database flag.

Run the same Maven test. Expected: pass.

- [x] **Step 3: Write failing verification-delivery tests.**

Add `RegisterVerificationServiceTest` that creates the service with a mocked `VerificationCodeDelivery`, a mocked Redis template, and a mocked `VerificationCodeGenerator` returning `123456`. Assert that a successful registration-code request sends the generated code only to the delivery seam and returns `debugVerificationCode == null`. Add an E2E mailbox test that rejects a wrong secret and returns exactly the latest code for the matching normalized email/run.

Extend `UserAuthControllerTest` with a successful login and registration response expectation: login HTTP `200`, registration HTTP `201`, `success=true`, `data.user.email`, `tokenType=Bearer`, and both `tp_user_access`/`tp_user_refresh` cookies have `HttpOnly`, `Path=/`, and positive max age.

Run: `cd back && mvn -Dtest=RegisterVerificationServiceTest,UserAuthControllerTest test`

Expected: failure because the delivery seam and mailbox are absent.

- [x] **Step 4: Implement normal SMTP delivery and an E2E-only mailbox.**

Replace only `RegisterVerificationService.deliverCode`'s direct mail-sender call with `VerificationCodeDelivery.deliver(email, subject, body, code)` and replace its private constructed `SecureRandom` with injected `VerificationCodeGenerator`. The default `SmtpVerificationCodeDelivery`, annotated `@Profile("!e2e")`, keeps the current `JavaMailSender` and `SimpleMailMessage` behavior. It returns `false` only when normal delivery is unavailable so the existing fallback policy still controls normal profiles.

`E2eVerificationCodeMailbox`, annotated `@Profile("e2e")`, is the sole E2E delivery bean, stores a code in a concurrent map keyed by normalized email, and requires the current run ID when retrieving it. `E2eVerificationMailboxController`, also `@Profile("e2e")`, maps only `GET /e2e/verification-codes/{email}` (the existing `/api` context path makes the external URL `/api/e2e/...`) and compares header `X-TerraPedia-E2E-Secret` in constant time. It returns an `ApiResponse` containing only the ephemeral code; it must not log the code or secret. No normal profile declares this route.

Run: `cd back && mvn -Dtest=E2eEnvironmentPostProcessorTest,RegisterVerificationServiceTest,UserAuthControllerTest test`

Expected: pass.

### Task 3: Build the Isolated E2E Runner Before Any Browser Suite

**Files:**

- Create: `scripts/dev/run-user-auth-e2e.sh`
- Create: `scripts/dev/run-user-auth-e2e.test.mjs`
- Modify: `scripts/dev/quality-gate.test.mjs`

- [x] **Step 1: Write the runner safety contract test first.**

Create `run-user-auth-e2e.test.mjs` that creates fake `mysql`, `redis-cli`, `curl`, `mvn`, `pnpm`, and `node` commands in a temporary `PATH`, then runs the runner in controlled preflight/cleanup cases. It must prove: missing consent, a remote MySQL/Redis host, invalid port, ordinary DB environment variable, unsafe run ID, or missing required E2E credentials exits before any fake `mysql`/`redis-cli` call; a successful exclusive create records ownership before any drop; a create collision permits only the expected exclusive-create attempt and then performs no marker write, Redis flush, backend start, or drop; and simulated signal/cleanup failure targets only the owned derived DB and Redis DB `15` while retaining the OS lock until cleanup exits.

Run: `node --test scripts/dev/run-user-auth-e2e.test.mjs`

Expected: failure because the runner is absent.

- [x] **Step 2: Implement the root runner with explicit lifecycle.**

Implement `run-user-auth-e2e.sh` with `set -euo pipefail` and these exact phases:

1. Parse mode; require `TERRAPEDIA_E2E_ENABLED=1`, `flock`, `mysql`, `redis-cli`, `curl`, `pnpm`, and the configured Chromium executable. Require `TERRAPEDIA_E2E_MYSQL_USERNAME` and `TERRAPEDIA_E2E_MYSQL_PASSWORD`; local host/port defaults are only `127.0.0.1:13306` and Redis `127.0.0.1:6380`, never a database name or credentials.
2. Generate `run_id` exactly once with `node:crypto` random bytes encoded as lowercase hexadecimal, export it to backend/Playwright, and derive `terria_v1_e2e_${run_id}` only from it. Before any client invocation, reject a non-loopback MySQL or Redis host, non-numeric port, Redis DB other than `15`, inherited `TERRAPEDIA_DB_URL`/`TERRAPEDIA_LOCAL_STACK_CONFIG`, unsafe run ID, or an E2E database name not exactly derived from that generated run ID. Generate a random run secret without printing it.
3. Acquire a non-blocking OS file lock with `flock` at `/tmp/terrapedia-user-auth-e2e.lock` and retain its file descriptor through cleanup; never use a Redis key as the coordination lock. Create the derived MySQL database with `CREATE DATABASE` (never `IF NOT EXISTS`), insert a run-ownership marker, and set `db_created=1` only after those steps succeed.
4. Flush only Redis DB `15` after the OS lock and opt-in checks; export all backend E2E datasource/profile/run-secret variables explicitly. Pass MySQL credentials only through process environment or a protected client configuration, never command-line arguments or report content.
5. Start backend in its own recorded process group on a runner-owned `127.0.0.1` port, wait for an authenticated-boundary HTTP response (`/api/user-auth/refresh` must return `401`, not connection failure), then invoke Nuxt directly as `pnpm exec nuxt dev --host 127.0.0.1 --port <runner-port>` with `TERRAPEDIA_BACKEND_ORIGIN` pointed to that backend and wait for the front root.
6. Run the selected package script with `E2E_BASE_URL`, `E2E_BACKEND_BASE_URL`, `E2E_RUN_ID`, `E2E_RUN_SECRET`, and `E2E_ARTIFACT_DIR` exported. Each suite bootstraps its login fixture by calling normal registration-code/register APIs and the E2E mailbox; it must not depend on test order or direct seed SQL.
7. In `trap`, stop only runner-created process groups after command/port ownership verification; revalidate the owned marker and exact derived name before drop; then flush Redis DB `15`, drop the exact owned database, write a redacted `summary.json`, make cleanup failure fail the command, and release the OS file lock only as the last cleanup action.

Use private log files under `reports/e2e/<run-id>/`; filter command output and summary fields so they contain no secret, password, cookie value, or verification code.

Run: `node --test scripts/dev/run-user-auth-e2e.test.mjs`

Expected: pass. Run `bash scripts/dev/run-user-auth-e2e.sh --help` and verify it does not start a service.

- [x] **Step 3: Attach the runner contract to existing gate-script tests.**

Extend `quality-gate.test.mjs` to expect a named `User-auth isolated browser smoke` step in both local and CI gates, but do not modify the gate scripts until Tasks 4 and 5 have an executable smoke command.

Run: `node --test scripts/dev/quality-gate.test.mjs scripts/dev/run-user-auth-e2e.test.mjs`

Expected: the new gate expectation fails; the runner contract passes.

### Task 4: Add the Real Playwright User-Auth Smoke and Regression Suites

**Files:**

- Create: `front-nuxt/playwright.config.ts`
- Create: `front-nuxt/e2e/support/auth-fixtures.ts`
- Create: `front-nuxt/e2e/user-auth.smoke.spec.ts`
- Create: `front-nuxt/e2e/user-auth.regression.spec.ts`
- Modify: `front-nuxt/package.json`

- [x] **Step 1: Write the smoke specification before configuration.**

Create `user-auth.smoke.spec.ts` importing `@playwright/test`, naming the three P0 contract IDs, and using absent support helpers. The tests must use a run-scoped email and `Password123`:

```ts
test('AUTH-LOGIN-001 logs an active user in through the browser', async ({ page, context }) => {
  const response = await waitForUserAuthResponse(page, '/api/user-auth/login', 200)
  await page.goto('/user/login')
  await page.getByLabel('邮箱').fill(loginEmail())
  await page.getByLabel('密码').fill('Password123')
  await page.getByRole('button', { name: '登录' }).click()
  await assertAuthEnvelope(await response)
  await assertAuthCookies(context)
  await expect(page).toHaveURL(/\/user$/)
})
```

Add analogous browser cases for `AUTH-REGISTER-001` (click send code, retrieve it from the E2E-only endpoint using the secret, fill it, submit, assert HTTP `201` plus envelope `statusCode: 200`) and `AUTH-SESSION-002` (logout clears cookies and protected settings redirects to login).

Run: `cd front-nuxt && pnpm run test:e2e:auth:smoke`

Expected: script/configuration failure because the Playwright configuration and helpers are absent.

- [ ] **Step 2: Add the Playwright policy and redacted helpers.**

Create `playwright.config.ts` with one Chromium project, `channel: 'chromium'`, `testDir: './e2e'`, `baseURL` from required `E2E_BASE_URL`, `workers: 1`, `retries: 0`, `trace: 'off'`, `screenshot: 'only-on-failure'`, `video: 'off'`, and output/report paths below required `E2E_ARTIFACT_DIR`. Reject missing E2E variables in configuration before a page is created.

Implement support helpers that:

- derive unique emails from the safe run ID;
- request the E2E mailbox only at `E2E_BACKEND_BASE_URL/api/e2e/verification-codes/<email>` with the secret header;
- assert HTTP status, `success`, envelope `statusCode`, user identity, `Bearer`, future expiry, and cookie metadata without printing values;
- provide redacted thrown errors containing case ID, HTTP status, JSON field path, and response message only.

Implement an idempotent `bootstrapActiveUser` helper that first uses the normal user-auth code request/register endpoints and then retrieves the code only from the E2E mailbox with the per-run secret. Each smoke/regression file calls it in `test.beforeAll`; no case depends on the order of another test or on direct seed SQL.

Add scripts:

```json
"test:e2e:auth:smoke": "playwright test e2e/user-auth.smoke.spec.ts",
"test:e2e:auth:regression": "playwright test e2e/user-auth.regression.spec.ts"
```

Run the root runner: `bash scripts/dev/run-user-auth-e2e.sh --smoke`.

Expected: all three smoke cases pass, its report is redacted under `reports/e2e/<run-id>/`, Redis DB 15 is empty after cleanup, and the disposable database no longer exists.

> Runtime status (2026-07-12): the policy, helpers, smoke/regression files, and static listing/type checks are implemented; Steps 2 and 3 remain open until the real runner passes with explicit dedicated E2E MySQL credentials, free loopback runner ports, and a Chromium executable. Ordinary local data and SMTP remain prohibited substitutes.

- [ ] **Step 3: Add the regression matrix.**

Create `user-auth.regression.spec.ts` for `AUTH-LOGIN-002`, `AUTH-LOGIN-003`, `AUTH-REGISTER-002`, `AUTH-REGISTER-003`, `AUTH-REGISTER-004`, and `AUTH-SESSION-001`. The tests assert:

- bad password: HTTP `400`, failed envelope, no auth cookies, login error visible;
- malformed email/code and invalid password boundaries: native/client validation blocks the request; the unit test covers all 9/10/64/65 and composition combinations;
- duplicate email and wrong/expired valid-shape code: HTTP `400`, failed envelope, no new cookies or user;
- missing/invalid refresh: HTTP `401`, failed envelope, cleared cookies, protected route redirect.

Run: `bash scripts/dev/run-user-auth-e2e.sh --regression`.

Expected: all matrix cases pass and cleanup is reported successful.

### Task 5: Make the Smoke Mandatory in Local and CI Quality Gates

**Files:**

- Modify: `scripts/dev/quality-gate.sh`
- Modify: `scripts/dev/quality-gate-ci.sh`
- Modify: `scripts/dev/quality-gate.test.mjs`
- Modify: `.github/workflows/quality-gate.yml`
- Modify: `docs/project-governance/00_CURRENT_SPEC.md`
- Modify: `docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-11-playwright-baseline.md`

- [x] **Step 1: Make the gate tests fail for missing smoke wiring.**

Run: `node --test scripts/dev/quality-gate.test.mjs`

Expected: failure from Task 3 because neither gate yet has `User-auth isolated browser smoke` or `scripts/dev/run-user-auth-e2e.sh --smoke`.

- [x] **Step 2: Wire the local and CI gates.**

Replace the currently unbound `$TP_FRONT_PROJECT_DIR` with the maintained literal `front-nuxt` in both gate scripts. After their existing frontend `pnpm run test` step, add exactly one named `run_step "User-auth isolated browser smoke" . bash scripts/dev/run-user-auth-e2e.sh --smoke` to both Bash gate scripts. Keep `--skip-front` semantics: skipping frontend also skips this dependent smoke step and prints that limitation. Do not add regression to the normal gate.

Run: `node --test scripts/dev/quality-gate.test.mjs`

Expected: pass.

- [x] **Step 3: Provision CI dependencies and browser.**

Update `.github/workflows/quality-gate.yml` to add job-scoped `mysql:8.4` and `redis:7` services with health checks. Use the fixed CI-only MySQL root password `terrapedia_e2e_ci`, set `TERRAPEDIA_E2E_MYSQL_HOST=127.0.0.1`, `TERRAPEDIA_E2E_MYSQL_PORT=${{ job.services.mysql.ports['3306'] }}`, `TERRAPEDIA_E2E_MYSQL_USERNAME=root`, `TERRAPEDIA_E2E_MYSQL_PASSWORD=terrapedia_e2e_ci`, `TERRAPEDIA_E2E_REDIS_HOST=127.0.0.1`, `TERRAPEDIA_E2E_REDIS_PORT=${{ job.services.redis.ports['6379'] }}`, and `TERRAPEDIA_E2E_ENABLED=1` on the gate step. Install `mysql-client` and `redis-tools` before the runner, and add a post-install browser step:

```bash
cd front-nuxt
pnpm exec playwright install --with-deps chromium
```

Set `PLAYWRIGHT_BROWSERS_PATH` consistently for browser installation and the gate process, then verify the Chromium executable before invoking the gate. The CI gate must invoke the existing `quality-gate-ci.sh`, which now owns the mandatory smoke. No secret from a local config file is used.

Run: `node --test scripts/dev/quality-gate.test.mjs`

Expected: the workflow contract checks still pass; add/update assertions in that test to require the MySQL/Redis services and Playwright install step.

- [ ] **Step 4: Record durable workflow facts and validate integration.**

Update current spec and validation/release docs with the new commands:

```bash
bash scripts/dev/run-user-auth-e2e.sh --smoke
bash scripts/dev/run-user-auth-e2e.sh --regression
```

State the E2E profile/database/mailbox safety boundary and that smoke is mandatory in full local and CI gates. Update the devlog with command evidence, review dispositions, residual browser-cache risk, report paths, and readiness state.

Document the local full-gate prerequisite explicitly: export `TERRAPEDIA_E2E_ENABLED=1`, `TERRAPEDIA_E2E_MYSQL_USERNAME`, `TERRAPEDIA_E2E_MYSQL_PASSWORD`, and optional loopback-only host/port overrides before running the gate. Missing values must fail the runner with its targeted prerequisite message; it must never infer credentials or a database name from ordinary local-stack configuration.

Run in this order:

```bash
cd front-nuxt && pnpm run test:unit
cd back && mvn -Dtest=E2eEnvironmentPostProcessorTest,RegisterVerificationServiceTest,UserAuthControllerTest test
node --test scripts/dev/run-user-auth-e2e.test.mjs scripts/dev/quality-gate.test.mjs
bash scripts/dev/run-user-auth-e2e.sh --smoke
bash scripts/dev/run-user-auth-e2e.sh --regression
git diff --check
git status --short
```

Expected: each focused command exits `0`; smoke/regression reports show all named cases and successful teardown. If any E2E cleanup fails, stop and repair the runner before claiming the gate is safe.

> Runtime status (2026-07-12): the gate and CI wiring has passed source-contract and syntax validation; Step 4 remains open because the real smoke/regression and an actual CI job have not yet run in a dedicated isolated environment.

## Multi-Agent Execution And Cross-Review

Tasks are intentionally serialized because the runner, backend profile, Playwright suite, and gate form one safety chain. The coordinator alone edits `docs/devlog/current.md`. For each task, dispatch a fresh implementation agent restricted to that task's files, then a fresh spec-compliance reviewer, then a fresh code-quality reviewer. A reviewer must check the matching contract IDs, no ordinary DB/SMTP/Redis-0 path, no secret leakage, and the exact validation output before the next task starts. Finish with a whole-change reviewer plus the integrated validation sequence above.

## Plan Self-Review

- **Spec coverage:** Tasks 1–5 cover the contract format, four test layers, real browser path, isolated data/code source, mandatory smoke, regression command, artifacts, documentation, and CI.
- **Boundary coverage:** Task 2 blocks unsafe startup after Config Data but before Flyway and binds E2E services to loopback; Task 3 blocks unsafe lifecycle/cleanup before any MySQL/Redis action and proves resource ownership; Task 4 blocks unconfigured browser execution and trace leakage; Task 5 blocks a gate that silently omits E2E or lacks required CI services.
- **Failure continuation:** A failed environment guard, runner cleanup, smoke, or regression test is repaired in its owning task and re-reviewed before dependent work continues.
- **No broad cleanup:** The plan does not modify visual tests, normal local-stack lifecycle, production migrations, normal email delivery semantics, or unrelated data/feature code.
