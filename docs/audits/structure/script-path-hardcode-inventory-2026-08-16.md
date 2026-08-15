# Script Path Hard-Code Inventory

Date: 2026-08-16

Status: active audit; this report records the first repair slice and the remaining migration boundary.

## Scope

The scan covered production-oriented files under `scripts/`, `back/src/main/`, `front-nuxt/`, `data-query-app/`, `.github/`, excluding dependency directories, build output, generated data, snapshots, fixtures, and test-only files where the path is deliberately part of the fixture.

The repository currently contains many `process.cwd()` consumers. They are not all defects: some tests intentionally build an isolated temporary repository, while production entrypoints must resolve from the selected worktree or an explicitly configured external root.

After this repair slice, a production-only scan still finds 91 executable files
using `process.cwd()` for legacy relative CLI inputs or child-process working
directories. Those are tracked as the next migration slice; the scan no longer
finds developer-specific absolute roots in executable data/tooling code.

## Findings

### Repaired in this slice

| Surface | Problem | Repair |
|---|---|---|
| `scripts/data/parse/parse-item-raw-pages.mjs` | Default raw input used a user-specific absolute path; output/report/progress defaults were scattered literals. | Defaults now come from `scripts/config/project.constants.json`; raw input uses the governed shared-data root. |
| `scripts/data/parse/refresh-item-page-standardized-metadata.mjs` | Same user-specific raw/source defaults and scattered standardized output paths. | Defaults now resolve through project constants and the shared-data resolver. |
| `scripts/data/fetch/fetch-wiki-world-contexts.mjs`, `fetch-wiki-armor-sets.mjs`, `fetch-wiki-biomes.mjs` | Crawler output and progress overrides were resolved from caller cwd. | Defaults now use semantic roots; relative overrides resolve from the selected repository root. |
| `scripts/data/fetch/fetch-wiki-iteminfo.mjs`, `fetch-wiki-npcinfo.mjs`, `fetch-wiki-projectileinfo.mjs`, `scripts/data/normalize/normalize-wiki-items.mjs` | Raw/normalized override paths could shift with caller cwd. | Relative options now resolve from the repository root while shared defaults remain under shared-data root. |
| `scripts/data/backfill/build-armor-item-image-evidence.mjs` | Raw item pages defaulted to `/home/lolben/data/terraPedia`. | Raw, standardized, generated, report, and progress defaults now use the shared resolver. |
| `scripts/data/audit/**` image/source/audio candidate and closure tools | Several production audits still embedded the developer home raw/generated roots. | Replaced with shared-data/project constants; candidate loaders merge explicit fallback layers without depending on host paths. |
| `scripts/data/import/import-wiki-audio-assets-to-db.mjs`, `scripts/data/audit/audio-asset-db-readiness-audit.mjs` | Audio metadata default pointed at a developer-specific generated directory. | Default metadata path now follows the shared-data resolver; explicit paths are still supported. |
| `scripts/data/backfill/backfill-missing-standardized-items.mjs` | Standardized input default used a Windows developer path. | Input and report defaults now use project constants and reject relative-path drift. |
| `scripts/data/workflow/run-backend-data-refresh.mjs`, `run-image-sync.mjs`, `seed-wiki-source-manifest.mjs` | Child scripts or options inherited the caller cwd. | Code checkout and worktree roots are separated; relative paths resolve from the selected root. |
| `scripts/data/lib/project-root.mjs` | Root helpers allowed `..` traversal through path segments. | Repository and shared-data joins now fail closed when the result escapes their root. |
| `scripts/data/workflow/run-wiki-sync.mjs` | Relative CLI paths were resolved from `process.cwd()`, and child script paths incorrectly followed `WORKTREE_ROOT`. | Relative state paths resolve from the selected worktree; executable child scripts resolve from the code checkout. |
| `scripts/lib/project-constants.mjs` | No central semantic resolver or root containment guard existed. | Added project constants loading, semantic path resolution, shared-root resolution, and traversal rejection. |

### Must migrate to project constants

These are production path families, not business protocol values:

- fetch, parse, normalize, transform, audit, backfill, relation, and workflow output roots;
- generated compatibility files, standardized files, standardized-view partitions, backup directories, and runtime reports;
- crawler source manifest, monitor state, plan, canonical progress, child status, resume state, raw output root, and operation report root;
- repository-local application/script/package paths used to spawn child commands;
- default frontend/backend project paths and shared runtime artifact locations.

Representative remaining files include:

- relation, backfill, and audit tools that still use `process.cwd()` for relative CLI inputs; these are the next allowlist-driven migration slice, not developer-specific absolute roots;
- explicit absolute overrides for crawler/report paths, retained for isolated test harnesses and external shared-data compatibility until an authorization env contract is added;
- `scripts/data/audit/render-item-source-closure-review-html.mjs`, where `/home/...` strings are display-only redaction replacements rather than defaults or file writes; the usage guard explicitly excludes this presentation-only compatibility text.

### Must remain runtime configuration, not project constants

The constants file must not become a secret or environment registry. These values keep the current precedence of explicit CLI/env override, local stack config, then a portable default:

- MySQL, Redis, SMTP, MinIO, and frontend/admin/backend ports;
- credentials, tokens, database names, and hostnames;
- external shared-data root, Redis persistence directory, MinIO data directory, and E2E artifact directory;
- CI service ports and disposable test ports.

The project constants file may define semantic keys and portable relative fallbacks, but the actual environment value remains in `scripts/dev/config/local-stack.config.json`, environment variables, or the isolated test harness.

### Intentional non-violations

- API route strings and protocol paths such as `/api/items/import` are not filesystem constants.
- Crawler action IDs, monitor keys, source manifest schema keys, and report filename contracts belong to workflow/action registries or protocol contracts.
- Test fixtures may use `process.cwd()` and fixed loopback ports when they explicitly create an isolated fixture root.
- Frontend visual checks that search for leaked `/home/...` development modules are detection patterns, not runtime output paths.

## Boundary risks

1. A relative path supplied by a CLI must resolve from the selected worktree, never from the caller's cwd.
2. A child executable path must resolve from the code checkout, not from a fixture-only `WORKTREE_ROOT`.
3. Shared data is allowed to live outside a linked worktree, but suffixes and generated child paths must remain inside that shared-data root.
4. Runtime outputs must not silently fall back to the repository root when the contract says they belong to the shared data root, and vice versa.
5. Explicit external paths must be opt-in and must never be accepted for progress, report, or authorization files without a documented owner.

## Next repair slice

- Migrate the representative remaining production files above and add an allowlist test for new path literals.
- `scripts/lib/project-constants-usage.test.mjs` now fails on new developer-specific absolute roots under production data/tooling scripts.
- Replace the backend audio default and armor MinIO default with portable external-root configuration.
- Unify frontend runtime-origin defaults through the local runtime resolver while leaving test ports untouched.
- Add shell/PowerShell and Java adapters only after the Node resolver contract is stable.

## Migration follow-up (2026-08-16)

The dedicated structure worktree completed the adapter and boundary portion of
this audit. `scripts/lib/project-constants.sh`,
`scripts/lib/project-constants.ps1`, and
`services/catalog-api/src/main/java/com/terraria/skills/config/ProjectConstants.java`
now consume the same manifest. Platform root resolution is script-location
based and canonical application/pipeline paths are the only production write
roots.

The remaining `process.cwd()` count is intentionally not treated as a blanket
failure: the residual files are legacy CLI relative-input consumers, test
fixture setup, or child-process cwd declarations. A future allowlist-driven
slice may migrate them one family at a time with focused tests. This migration
does not claim those unrelated action semantics have been rewritten.
