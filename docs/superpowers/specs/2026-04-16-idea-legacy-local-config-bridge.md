# IDEA Legacy Local Config Bridge

## Task

- Goal: let the backend start directly from IDEA in local development without manually copying `scripts/dev/config/local-stack.config.json` values into environment variables.
- Success criteria:
  - `legacy` profile startup reads local auth, DB, Redis, and MinIO values from `scripts/dev/config/local-stack.config.json`.
  - Existing explicit environment variables still take precedence.
  - Non-legacy startup behavior stays unchanged.
- Out of scope:
  - changing the JSON schema under `scripts/dev/config`
  - changing frontend or admin startup behavior
  - changing CI or production configuration

## Design

- Add a Spring Boot `EnvironmentPostProcessor` in the backend.
- Activate it only when the `legacy` profile is active.
- Locate `scripts/dev/config/local-stack.config.json` by walking up from `user.dir` until the repo root candidate is found.
- Flatten the relevant JSON keys into the same environment-style keys already consumed by `application.yml`.
- Add the generated property source at low precedence so explicit environment variables and command-line args still win.

## Plan

- Write failing tests for:
  - legacy profile loading local JSON into Spring properties
  - non-legacy startup skipping the bridge
  - existing environment values overriding JSON values
- Implement the post-processor and register it in Spring startup metadata.
- Run targeted Maven tests for the new behavior.
- Update this document with execution notes and verification results.

## Execution Log

- 2026-04-16: created the design and implementation record.
- 2026-04-16: wrote failing tests for the legacy-only bridge behavior before implementation.
- 2026-04-16: verified the red phase by running `mvn -Dtest=LegacyLocalStackConfigEnvironmentPostProcessorTest test` and confirming compilation failed because `LegacyLocalStackConfigEnvironmentPostProcessor` did not exist yet.
- 2026-04-16: implemented a Spring `EnvironmentPostProcessor` that discovers `scripts/dev/config/local-stack.config.json`, maps it to existing backend environment keys, and only activates for the `legacy` profile.
- 2026-04-16: registered the post-processor through `META-INF/spring.factories` so IDEA direct startup goes through the same local config bridge without changing the JSON schema.
- 2026-04-16: ran the targeted unit test again after implementation and confirmed all three bridge scenarios passed.
- 2026-04-16: ran a `spring-boot:run` smoke start with `legacy` active and no auth secret environment variables. Startup reached Redis, MySQL, and Flyway successfully and no longer failed on missing `terraria.auth.admin.password`; the observed failure was only `Port 18088 was already in use`, which confirms the bridge resolved the original startup blocker.

## Verification

- Red phase:
  - `mvn -Dtest=LegacyLocalStackConfigEnvironmentPostProcessorTest test`
  - Result: failed in test compilation because the post-processor class was missing.
- Green phase:
  - `mvn -Dtest=LegacyLocalStackConfigEnvironmentPostProcessorTest test`
  - Result: `Tests run: 3, Failures: 0, Errors: 0, Skipped: 0`
- Startup smoke:
  - `mvn -l target\\idea-legacy-bridge-smoke.log -DskipTests "-Dspring-boot.run.profiles=legacy" "-Dspring-boot.run.jvmArguments=-DAPP_PORT=18088 -DTERRAPEDIA_MAIL_ENABLED=false" spring-boot:run`
  - Result: application advanced past auth property binding, Redis, MySQL, and Flyway; failure shifted to an unrelated occupied port.

## Follow-Up: IDEA Port Auto-Reclaim

### Goal

- When the backend is started from IDEA in local legacy mode and the old TerraPedia backend is still listening on the target port, stop that old backend automatically before Tomcat binds.

### Design

- Add a local startup preflight that runs before `SpringApplication.run(...)`.
- Keep the existing legacy local config bridge for secrets and local infrastructure settings.
- Resolve the target backend port from `APP_PORT`, command line args, or `local-stack.config.json`.
- On Windows local startup, run a single PowerShell script that:
  - finds the listening PID for the target port
  - checks whether the process is a TerraPedia backend Java process from this repo
  - force stops it
  - waits until the port is actually released

### Execution Log

- 2026-04-16: wrote failing tests for the startup preflight path and old-backend port cleaner behavior.
- 2026-04-16: verified the preflight red phase by running `mvn -Dtest=LegacyLocalBackendStartupPreflightTest test` and confirming compilation failed because the preflight class did not exist yet.
- 2026-04-16: implemented `LegacyLocalBackendStartupPreflight` and invoked it from `SkillsBackApplication.main(...)`.
- 2026-04-16: investigated multiple failed integration attempts and isolated three real root causes:
  - PowerShell `$PID` reserved variable conflict in the listening-PID probe
  - PowerShell `Get-CimInstance -Filter` quoting bug in process-detail lookup
  - path normalization mismatch in the PowerShell command-line matcher
- 2026-04-16: simplified the production path to a single PowerShell cleanup script so process identification and termination happen in one place, then added a release-wait loop so the new backend does not race the old port shutdown.

### Verification

- Unit tests:
  - `mvn "-Dtest=LegacyLocalBackendStartupPreflightTest,LegacyLocalBackendPortCleanerTest,LegacyLocalStackConfigEnvironmentPostProcessorTest" test`
  - Result: `Tests run: 12, Failures: 0, Errors: 0, Skipped: 0`
- Integration smoke for auto-restart behavior:
  - start one local backend on a test port
  - start a second local backend on the same port
  - verify the second startup logs `Stopping old TerraPedia backend process ...`
  - verify the first process exits
  - verify the second process completes startup on the same port
- Recorded command:
  - Node-based orchestration script executed from `back/` using two `spring-boot:run` launches with `SPRING_PROFILES_ACTIVE=legacy` and `APP_PORT=18093`
  - Result: `AUTO_RESTART_OK`
