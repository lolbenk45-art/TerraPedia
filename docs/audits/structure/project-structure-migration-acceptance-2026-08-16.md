# Project structure migration acceptance — 2026-08-16

## Scope

This acceptance covers the physical repository-boundary migration only:

| Legacy entrypoint | Canonical boundary | Compatibility behavior |
| --- | --- | --- |
| `front-nuxt/` | `apps/public-web/` | symlink to canonical directory |
| `data-query-app/` | `apps/admin-console/` | symlink to canonical directory |
| `back/` | `services/catalog-api/` | symlink to canonical directory |
| `shared/article-runtime/` | `packages/content-runtime/` | symlink to canonical directory |
| `scripts/dev/` | `platform/local/` | symlink to canonical directory |
| `scripts/ops/` | `platform/operations/` | symlink to canonical directory |
| `scripts/tooling/` | `platform/tooling/` | symlink to canonical directory |
| `scripts/data/` | `pipelines/` | symlink to canonical directory |

No data, report, database, Redis, crawler, or external object-storage content
was moved. Existing Shimmer generations and authorization evidence remain in
their original paths.

## Evidence

- Canonical roots, aliases, and commands are declared in
  `scripts/config/project.constants.json`.
- Old paths resolve to exactly one canonical target; no legacy directory is a
  second writable copy.
- CI, platform gates, pipeline commands, app configs, Maven metadata, and
  path-sensitive tests use canonical roots. Historical evidence may retain old
  command strings.
- Node, Shell/PowerShell, and Java adapters now parse the same manifest and
  reject repository-root traversal; platform root resolution works from the
  repository, an app directory, and an unrelated cwd.
- `git diff --check`, admin checks, focused backend path/acceptance tests, and
  focused path/structure suites pass after the final migration edits. The
  exact command evidence is recorded in the active migration devlog entry.

## Known baseline variance

The existing crawler regression fixture reports two pre-existing standardized
data hash mismatches (`items` and `projectiles`); `npcs` remains unchanged.
The migration did not modify those files or regenerate data. This is a data
baseline follow-up, not a structure acceptance failure.

The public frontend check also stops at its pre-existing SEO prerequisite:
`apps/public-web/public/sitemap.xml` is absent and no sitemap-blocked source
report exists. The migration did not generate or alter sitemap content.

## Rollback

Rollback is a focused Git boundary revert or branch abandonment before merge.
During the compatibility window, callers can continue using the legacy symlink
paths. Do not delete symlinks, remove canonical directories, or run broad
cleanup while unrelated user changes are present. If a path contract fails,
stop the affected boundary, repair the resolver/fixture, and rerun the focused
suite before any integration.
