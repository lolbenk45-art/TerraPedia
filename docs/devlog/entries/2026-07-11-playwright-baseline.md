# Devlog: Playwright baseline

## Status

`closed`

## Context

- User goal: Establish a standardized functional-test workflow, beginning with user registration/login, so future features define and execute consistent input, response, boundary, regression, unit, API-contract, and browser acceptance tests.
- Branch: `test/playwright-baseline`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/playwright-baseline`
- Base: `main` at `99cd26d`.
- Related docs: `docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md`.
- Related prior entries: none.

## Direction / Decisions

- Chosen approach: Use a machine-readable functional-test contract per feature plus four test layers: frontend unit validation, backend API contract, mandatory browser smoke, and scheduled/merge regression.
- Reasoning: The contract gives every later feature a repeatable definition of request input, HTTP/envelope output, cookie/auth state, visible UI result, boundaries, cleanup, and evidence. Layered tests keep fast checks frequent while preserving real browser acceptance coverage.
- Gate decision: User-auth browser smoke is mandatory for every full local gate and CI run once the isolated E2E environment exists; regression coverage runs separately on merge/nightly.
- Rejected options: Browser-only page tests and route-mocked E2E tests are insufficient because they cannot prove backend envelope, cookies, session lifecycle, or real write behavior.
- Browser installation: Manually unpacked the user-provided `tmp/chrome-linux64.zip` into Playwright 1.61.1's Chromium cache location, `/home/lolben/.cache/ms-playwright/chromium-1228`, rather than downloading it again.
- Cross-audit: stack, auth-fixture, and frontend audits independently confirmed that the current local stack and normal verification delivery are unsafe for write-capable E2E. A plan-safety reviewer found seven critical pre-implementation gaps (Config Data ordering, destructive runner preflight/ownership, fixture bootstrap, trace secret exposure, CI services, and gate directory wiring); the plan was repaired and re-reviewed with no remaining critical or important findings.
- Task 4 duplicate evidence decision: use a legal-shape registration code plus the exact duplicate-email response message, not a fixed cooldown wait for a newly fetched code. The current service deterministically checks an existing email before verification-code validation, and the user-auth contract requires only a 4-to-8 digit code matcher for `AUTH-REGISTER-002`; asserting the duplicate message therefore proves the intended branch more directly while preserving isolated-data behavior.
- Task 5 plan repair: its file list now explicitly includes `scripts/dev/quality-gate.test.mjs`, because Step 3 requires executable CI-service/browser assertions; this resolves the plan's list/step mismatch without expanding the goal.
- E2E startup repair: `application-e2e.yml` supplies a non-production administrator password only through `TERRAPEDIA_E2E_ADMIN_PASSWORD`; this satisfies `AdminAuthProperties` without inheriting ordinary local credentials. A focused lifecycle-binding regression test protects the boundary.
- Durable-artifact repair: Playwright may run only with the runner's exact,
  pre-created private artifact directory (or the exact private static-check
  path). The runner now rejects unsafe report paths before data clients and
  preserves only redacted browser artifacts plus `summary.json` after cleanup.

## Scope

- Frontend: Playwright configuration, user-auth test fixtures, browser smoke/regression suites, package scripts, and focused unit tests.
- Backend: user-auth contract tests and a safe E2E-only verification-code/test-data boundary as required by the approved design.
- Data: isolated E2E database, mail/verification-code fixture path, run-scoped cleanup, and no writes to ordinary local or shared data.
- Docs/process: functional-test standard, per-feature user-auth contract, quality-gate and validation/release guidance, current devlog, and this entry.
- Planning: `docs/superpowers/specs/2026-07-11-standardized-functional-testing-design.md` and `docs/superpowers/plans/2026-07-11-standardized-functional-testing.md`.
- Out of scope: unrelated feature work, production credential changes, real-email testing, production data writes, and commits unless separately requested.

## Execution Coordination

- Coordinator: Codex is the sole editor of `docs/devlog/current.md` and this entry.
- Task 2 implementer: owns only the plan-listed backend E2E profile, environment-guard, verification-delivery/mailbox, and focused test files; it must not edit frontend, runner, gate, devlog, or ordinary local-stack paths. It reports red/green evidence and no commit.
- Task 2 reviewers: fresh read-only spec and code-quality reviewers run in that order after implementation; they may not edit shared files or start services.
- Serialization: Task 3 consumed Task 2's approved E2E configuration, mailbox route, and delivery contract. Task 4 may now consume the approved runner contract; no agent shares a code or devlog write target.
- Task 3 implementer: owns only `scripts/dev/run-user-auth-e2e.sh`, `scripts/dev/run-user-auth-e2e.test.mjs`, and the permitted gate-script test addition. It must not edit backend/profile, frontend suites, gate scripts, devlog, or local-stack configuration; fake-command tests are the only allowed lifecycle execution.
- Task 3 reviewers: five fresh read-only spec reviews and one code-quality review completed; each material finding was test-first repaired. Task 4 is unblocked by the approved process, ownership-marker, lock, cleanup, and artifact contract.
- Task 4 implementer: owns only `front-nuxt/playwright.config.ts`, `front-nuxt/e2e/support/auth-fixtures.ts`, `front-nuxt/e2e/user-auth.smoke.spec.ts`, `front-nuxt/e2e/user-auth.regression.spec.ts`, and the plan-listed `front-nuxt/package.json` script changes. It must not edit runner, backend, gates, devlog, or ordinary local-stack configuration; it reports TDD and no commit. Fresh read-only spec then code-quality reviewers follow it.
- Task 5 implementer: owns only the two Bash gates, their source-contract test, CI workflow, and current-spec/validation documentation. It must not edit Task 1–4 code or either devlog file; the coordinator records review state. Fresh read-only spec then code-quality reviewers follow it.

## Validation

- Baseline installation evidence: `cd front-nuxt && pnpm install --frozen-lockfile` completed successfully.
- `cd front-nuxt && pnpm exec playwright --version` returned `Version 1.61.1`.
- The supplied Chromium archive unpacked successfully; `/home/lolben/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome --version` returned `Google Chrome for Testing 149.0.7827.55`.
- A Node smoke check launched `@playwright/test` with `channel: 'chromium'`, loaded a page, asserted its content, and exited successfully.
- `cd front-nuxt && pnpm run check:user-module` passed.
- Planned validation: focused unit/API/E2E checks, the E2E runner's data-isolation assertions, package-script checks, `git diff --check`, then the relevant quality-gate path. Full-gate validation cannot be claimed until the current missing front `test` script and E2E stack boundary are repaired.
- Planning validation: `git diff --check`, plan placeholder scan, contract-path scan, independent stack/auth/frontend reviews, and repaired plan-safety re-review completed. The plan is execution-ready.
- Task 1 final validation: `cd front-nuxt && pnpm run test` completed successfully (structural checks, production build, and 4 frontend unit tests); `cd back && mvn -Dtest=UserAuthControllerTest test` completed successfully (7 tests); a YAML parse/semantic assertion verified the exact nine IDs, required fields, external paths, and both deterministic refresh variants; `git diff --check` completed successfully.
- Task 2 final validation: `cd back && mvn -Dtest=E2eEnvironmentPostProcessorTest,RegisterVerificationServiceTest,UserAuthControllerTest test` completed successfully (41 tests); the suite exercised unsafe guard paths without creating a JDBC connection, and `git diff --check` completed successfully.
- Task 3 final validation: coordinator independently ran `node --test scripts/dev/run-user-auth-e2e.test.mjs` (34/34 passed), `bash -n`, `node --check`, and `git diff --check` (all passed). The combined runner/gate test had 47 passes and one expected failure: Task 5 has not yet added the exact smoke step to either gate script. No real lifecycle command was run other than `--help`.
- Task 4 final static validation: `pnpm exec nuxt typecheck` passed; synthetic isolated variables listed exactly 3 smoke and 6 regression cases; missing `E2E_BASE_URL` failed closed before page creation; tracked and untracked diff checks were clean. No runner, service, database, Redis, SMTP, or real browser suite ran.
- Task 5 final static validation: `node --test scripts/dev/quality-gate.test.mjs` passed 15/15; both Bash gates passed `bash -n`; the quote-free Node Playwright API discovery resolved an executable and passed `test -x`; `git diff --check` passed. No CI job, service, runner, or browser suite ran.
- Whole-review repair validation: the new E2E admin-property binding test failed before its configuration was added, then `cd back && mvn -Dtest=E2eEnvironmentPostProcessorTest,RegisterVerificationServiceTest,UserAuthControllerTest test` passed 42/42. `cd front-nuxt && pnpm run test` passed; `node --test scripts/dev/run-user-auth-e2e.test.mjs scripts/dev/quality-gate.test.mjs` passed 49/49; Bash syntax and Node syntax checks passed. No real service, runner, browser suite, or CI job ran.
- Durable-artifact repair validation: an initial artifact-retention quality
  review reproduced both an over-broad temporary-path exception and
  group-readable HTML reports. Its seven configuration guard cases were RED,
  then GREEN. A runner report-root review added unsafe-parent/run/artifact
  cases; an initial Bash dynamic-scope defect was reproduced (14/37) and
  corrected. Fresh evidence: backend focused contract tests 42/42, frontend
  `pnpm run test`, combined runner/gate fake-command checks 53/53,
  Playwright artifact guard checks 7/7, and source-level enumeration of 3
  smoke plus 6 regression cases. Static Playwright configuration loading used
  only a private temporary artifact path; no service, database, Redis, SMTP,
  browser, runner, or CI job ran.

## Review

- Task 1 spec review: corrected `AUTH-LOGIN-002` from an incorrect `401/401` expectation to the current `400/400` backend contract; spec scope is otherwise approved relative to the pre-existing Playwright-install baseline.
- Task 1 code-quality review: found missing duplicate-registration and invalid-refresh contract cases, plus missing password/code boundary and no-sensitive-value assertions. Disposition: task remains active; the assigned implementer must repair and receive re-review before Task 2 starts.
- Task 1 re-spec review: the corrected contract exposed a current backend discrepancy: the missing-refresh branch returns `401` but does not clear stale auth cookies, while the invalid-token branch already does. Root-cause inspection traced it to the early return in `UserAuthController.refresh`, with the existing MockMvc test omitting cookie-expiry assertions. Plan repair: Task 1 now adds a single failing controller test and calls the existing cookie-clearing helper in that branch; no API, service, database, or email semantics change. The contract also needs an explicit no-write boundary for this failed refresh case. A fresh spec review and code-quality review remain required after the repair.
- Task 1 final code-quality review: blocked on three executable-contract defects. Root-cause inspection confirmed the public backend context path is `/api`, while Nuxt composables intentionally use relative `/user-auth/...` paths beneath their `/api` base; the YAML must name the external path used by direct API/Playwright assertions. It also found prose-only request/cookie/write fields and unmodeled direct-API malformed/wrong-code branches. Plan repair: retain the same nine IDs, make their YAML fields typed/structured, add the two direct MockMvc error-envelope checks, and assert `statusCode=401` on both refresh-failure branches. No E2E lifecycle or production data behavior is widened. The repair requires fresh spec and code-quality re-reviews.
- Task 1 final re-review: the structured session contract still combined missing and invalid refresh cookies into one non-deterministic state. Existing MockMvc tests already cover both branches; repair only the contract by listing deterministic `missing` and redacted-fixture `invalid` variants under `AUTH-SESSION-001`, each mapped to the same `401`/cookie-clear/no-write result. Keep the nine-case budget and require one final spec/quality re-review.
- Task 1 final disposition: fresh spec and code-quality re-reviews approved the repaired contract, validation extraction, MockMvc error envelopes, and minimal missing-refresh cleanup. No unresolved Task 1 finding remains.
- Task 2 implementation self-review: expanded the early guard after tests exposed two alternate configuration bypasses—legacy `spring.redis.database` not pinned to 15 and Hikari/JNDI alternative datasource targets bypassing the checked JDBC URL. Both were reproduced with focused red tests and repaired fail-closed; Task 2 remains active pending fresh independent spec and code-quality review.
- Task 2 independent spec review: found two further critical fail-open paths. An effective default `spring.profiles.default=e2e` was not considered when no active profile existed, and raw system-environment names for Hikari data-source properties bypassed dotted-prefix scanning. Root-cause inspection confirms both against the current profile/property-source implementation. The original implementer must add focused red tests, then validate defaults and canonical/raw datasource override names before a fresh two-stage review.
- Task 2 independent code-quality review: found two critical connection bypasses still outside the guard—`spring.flyway.url` can direct migration to another database, and Redis `url`/sentinel/cluster modes can override the checked host/database. These paths are inherited from normal configuration unless explicitly rejected. Repair requires raw environment-variable regression tests and pre-JDBC/pre-Redis fail-closed validation, followed by fresh spec and quality re-review.
- Task 2 Flyway/Redis repair: six focused red cases (dotted/raw Flyway, raw current/legacy Redis URL, current sentinel, legacy cluster) proved the guard had not rejected those paths. The guard now rejects every standalone Flyway URL and current/legacy Redis URL, sentinel, and cluster target prefix using normalized raw property names. A boot-level fake-driver assertion confirms unsafe Flyway URL fails before `connect`; guard tests are 24/24 and the combined focused suite is 35/35. Fresh review remains required.
- Task 2 final code-quality review: found two further critical framework-binding bypasses. Compact canonical Hikari environment names (for example `SPRING_DATASOURCE_HIKARI_JDBCURL`) are accepted by Spring Binder but not by the guard's direct lookup; Redisson's independent `spring.redis.redisson.*` config can also name a remote Redis target outside the standard properties. Repair must add separator-insensitive canonical matching for rejected datasource fields and reject the full Redisson prefix, with redacted raw-environment tests and a fresh two-stage review.
- Task 2 compact-binding/Redisson repair: six raw-environment red cases for compact Hikari/JNDI fields, compact data-source-properties, and Redisson config reproduced non-rejection. The guard now uses narrow compact-name equality/prefix matching for the denied properties and rejects current plus defensive legacy Redisson prefixes; no unsafe values appear in diagnostics. Guard tests are 30/30 and the combined focused suite is 41/41. Fresh spec and quality review remain required.
- Task 2 final disposition: fresh spec and code-quality reviews approved the fail-closed profile, datasource/Flyway, Redis/Redisson, mailbox, and response-contract boundary. No unresolved Task 2 finding remains.
- Task 3 first spec review: blocked implementation on Critical gaps: the runner accepted `localhost` rather than literal `127.0.0.1`; it neither checked configured ports were free nor proved readiness listeners belonged to the runner-owned process group; and raw process output could reside under reports before cleanup redaction. Important gaps: cleanup did not wait for owned groups or flush Redis before dropping MySQL, did not revalidate the exact derived database name immediately before drop, lock/collision tests could pass without proving their invariant, and the future gate assertion accepted a bare phrase. The original implementer must add failing coverage and repair only the Task 3 files, then receive fresh spec and code-quality re-reviews. No service or data client was run during review.
- Task 3 second spec re-review: blocked the first repair. Critical gaps: real-runner environment variables could replace port/process/stop verification helpers; cleanup accepted a dead recorded leader while a listening child process might remain; and JSON or HTTP-header token/cookie shapes passed the report redactor. Important gaps: the future gate assertion did not prove the runner command, cleanup-failure summaries could claim exit status `0`, and the lock test did not prove acquisition precedes database creation. The original implementer must remove production-reachable test hooks, add focused RED cases, repair the three Task 3 files only, and obtain fresh spec then code-quality re-review. Independent safe test evidence was 23/23 runner tests; combined gate test had the intentional Task 5 wiring failure only.
- Task 3 third spec re-review: blocked the second repair. Critical gap: backend, frontend, and Playwright child processes inherited JVM/Spring/Maven/Node/Redis/MySQL configuration variables, so a process-level override could escape the E2E profile before the backend guard. Important gaps: port ownership accepted a mixed owned/unowned listener set; the lock released before all summary/report work; report-write failure handling could mask a failed cleanup; and the future gate assertion did not require an exact standalone command. The fix must use child-process environment sanitization (or equivalent preflight rejection), universal listener ownership, last-action lock release, robust summary failure semantics, and new adversarial tests. Independent runner tests were 25/25; the combined suite's only current failure remained the intentional Task 5 wiring assertion.
- Task 3 fourth spec re-review: no Critical issue, but blocked on two Important gaps. MySQL username/password values were written unescaped into a defaults file, allowing newline option injection such as `init-command`; inherited Bash `xtrace` could print generated secrets and credential-bearing commands before cleanup. The final repair must reject unsafe option-file credential characters or use an injection-safe client mechanism, disable/re-exec away xtrace before any secret, and add red regressions. It must also expand prefix-wide Spring-config poison coverage. Independent runner tests were 29/29; the combined suite's only current failure remained the intentional Task 5 gate-line assertion.
- Task 3 final disposition: fifth fresh spec review approved the literal-loopback, lock, marker, full-listener ownership, private-log, child allowlist, option-file, and cleanup invariants after 32/32 tests. Code-quality review found test sandbox accumulation and refined normal inherited-xtrace handling; the same implementer repaired them with RED/GREEN evidence, then code-quality re-review approved 34/34 runner tests. The malicious `PS4` plus caller-supplied `bash -x` case is an unfixable caller-controlled disclosure boundary under the locked `bash script` invocation; the runner nonetheless disables ordinary inherited xtrace as its first executable action. Coordinator independently confirmed the final suite and the expected Task 5-only gate RED. No unresolved Task 3 finding remains.
- Task 4 first spec review: blocked three test-semantic gaps. A 65-character UI input is truncated by the real `maxlength`, so the test could not prove a client-side no-request boundary; duplicate-registration used an arbitrary code rather than a valid E2E mailbox code; and failed-auth checks inspected only the final cookie jar, not response `Set-Cookie` issuance. The original implementer must add focused RED coverage, repair only Task 4 files, and obtain fresh spec then code-quality review. Static typecheck/listing passed; the real runner was intentionally not started because dedicated E2E credentials, ports, and browser path are absent.
- Task 4 re-review: blocked the first repair. The fixed duplicate-email evidence must use a legal-shape code plus the exact duplicate response message because the service checks for an existing email before code validation; waiting a fixed 60 seconds for another code is unnecessary and flaky. The test must assert native validity for 10 and 64 character password values. Critically, the required failure-screenshot policy could capture visible real mailbox codes in registration fields. The repair must mask code display in the test UI without changing the submitted value, preserving `screenshot: only-on-failure`, then receive a fresh spec review. No real E2E lifecycle ran.
- Task 4 screenshot/session repair review: the suite now installs a pre-navigation DOM observer that removes only the dev `开发验证码：` display, preserves failure screenshots, masks code input, and performs refresh through page-context `fetch` paired with a Playwright page response. The first quality review then found that `SameSite` was not asserted and that `AUTH-REGISTER-004` omitted the malformed-code no-request branch; both received focused repairs.
- Task 4 final spec re-reviews: initially blocked the failed-auth cleared-cookie predicate because it accepted `Max-Age=0` without `HttpOnly`, `Path=/`, and `SameSite`; the predicate now shares the full cookie-attribute check. Final spec review approved all nine IDs, the screenshot boundary, browser-context refresh, cookie metadata, and malformed/wrong-code coverage.
- Task 4 final code-quality review: approved. It confirmed pre-send narrow DOM redaction, no code/secret values in test errors, response/header plus browser-jar assertions, distinct missing/invalid refresh preconditions, full cookie metadata for issued/cleared/failed flows, and pre-trigger response/request listeners. No real runner, browser suite, service, database, Redis, or SMTP operation ran.
- Task 5 first spec review: blocked on an escaped quote sequence in the Chromium discovery command, which produced a Bash syntax error, and weak source assertions for literal frontend, ordering, and exact CI runner settings. The command was reproduced failing locally; tests were strengthened first, then workflow and documentation now use the same quote-free Node API command.
- Task 5 final spec review: approved the repaired discovery command, smoke ordering/skip semantics, CI loopback dynamic ports, Redis DB 15, distinct application ports, and current workflow documentation.
- Task 5 first code-quality review: blocked because a host-mapped MySQL service allowed root only within its container. The CI-only `MYSQL_ROOT_HOST: '%'` setting and a matching source assertion were added with a red/green gate-test cycle.
- Task 5 final code-quality review: approved. It confirmed that the CI-only MySQL host setting does not weaken runner loopback boundaries, and found no local-config or documentation credential leakage. No CI job, service, runner, or browser suite ran.
- Whole-change review found a Critical E2E startup gap: the isolated runner did not supply the required administrator password, and the E2E profile did not define one. The coordinator reproduced it with a new `AdminAuthProperties` lifecycle-binding test, repaired only the E2E profile with its own non-production environment variable/default, and received fresh spec and code-quality approvals. The test fixture's PID sentinel collision was independently triaged and repaired; it affected fake-only test plumbing, not the production runner.
- Durable-artifact quality review: blocked on an arbitrary temporary-path
  prefix and `0755`/`0644` Playwright report output. The configuration repair
  introduced exact path, ownership, symbolic-link, and recursive private-mode
  checks, plus `umask 077` for future report files; its spec re-review
  approved the artifact subtree. A subsequent runner review found an unsafe
  durable report-root path before Playwright loaded. The runner repair now
  migrates only current-user generic report parents to `0700`, rejects unsafe
  exact run/artifact paths before clients or summary output, and keeps an
  explicit residual risk for adversarial same-UID processes (which already
  have access to `0600` local artifacts). No unresolved cross-user artifact
  disclosure finding remains.

## Result

- Completed: project-local Playwright 1.61.1 dependency and the matching supplied Chromium browser cache are available for frontend browser tests.
- Completed: Task 1 executable user-auth contract, pure frontend validation, direct API error-envelope coverage, and deterministic refresh-failure boundaries. See Git for code-level diff details.
- Completed: Task 2 E2E profile safety boundary, verification delivery seam, profile-only mailbox, and pre-client fail-closed configuration guard. See Git for code-level diff details.
- Completed: Task 3 isolated E2E runner, lifecycle safety contract, and future gate-step assertion. See Git for code-level diff details.
- Implemented/static-validated: Task 4 Playwright user-auth smoke and regression suite definition, safety configuration, redacted fixtures, and static validation. Real browser acceptance remains pending the dedicated isolated environment. See Git for code-level diff details.
- Implemented/static-validated: Task 5 quality-gate/CI wiring, CI service/browser prerequisites, contract checks, and durable workflow documentation. Real gate/CI runtime acceptance remains pending. See Git for code-level diff details.
- Completed: final scope review, artifact/runner re-review, and commit closeout. The user explicitly requested local merge to `main`; commit SHA pending in final response.

## Residual Risks

- Browser binaries are environment-local and are not represented in Git.
- The supplied archive contains Chrome for Testing only, not Playwright's separate Chromium headless-shell package. Until that package is installed, future headless tests must launch the installed browser with `channel: 'chromium'` (as in the smoke check), or install browsers normally with `pnpm exec playwright install chromium`.
- Mandatory browser tests cannot safely use the ordinary local database or real email; the E2E environment and verification-code source must be isolated before implementation.
- The runner's fake-command safety contract is approved, but its real backend/Nuxt/Playwright execution remains intentionally unexercised because the dedicated isolated prerequisites are unavailable. Do not use ordinary local data or email.
- The durable-report guard protects against group/other access and static
  unsafe paths. A malicious process with the same Unix UID can race ordinary
  Bash pathname operations; that UID already has equivalent access to the
  runner environment and `0600` local artifacts. A stronger threat model
  would require an fd-relative `O_NOFOLLOW` helper or a protected report root.

## Follow-up

- owner: future validation task; run real E2E smoke/regression and an actual CI gate only when dedicated isolated prerequisites are explicitly available.

## Commits

- Commit SHA pending in final response.
