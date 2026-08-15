# TerraPedia project structure v2

状态：物理迁移完成，兼容窗口仍开放（2026-08-16）。

本文件是当前目录边界、路径来源和回滚规则的架构基线。机器可读路径
唯一来源是 `scripts/config/project.constants.json`；Node、Shell、PowerShell
和 Java 适配层只解析它，不复制目录常量。

## Canonical tree

```text
TerraPedia/
├── apps/
│   ├── public-web/          # public Nuxt application
│   └── admin-console/       # admin/data-query Nuxt application
├── services/
│   └── catalog-api/         # Spring Boot catalog/content API
├── packages/
│   └── content-runtime/     # shared article/content runtime
├── pipelines/               # fetch, normalize, audit, import, relation, workflow
├── platform/
│   ├── local/               # local stack, smoke, acceptance, quality gates
│   ├── operations/          # daemon and scheduled-operation wrappers
│   └── tooling/             # repository/developer tooling
├── scripts/lib/             # shared script adapters and project resolver
├── data/                    # source, normalized, canonical, compatibility layers
├── docs/                    # governance, architecture, plans, audits, devlog
├── reports/                 # runtime and durable evidence roots
└── artifacts/               # reserved for proven rebuildable runtime output
```

Legacy roots are compatibility symlinks only:

| Legacy path | Canonical target | Write rule |
| --- | --- | --- |
| `front-nuxt` | `apps/public-web` | one canonical directory |
| `data-query-app` | `apps/admin-console` | one canonical directory |
| `back` | `services/catalog-api` | one canonical directory |
| `shared/article-runtime` | `packages/content-runtime` | one canonical directory |
| `scripts/dev` | `platform/local` | one canonical directory |
| `scripts/ops` | `platform/operations` | one canonical directory |
| `scripts/tooling` | `platform/tooling` | one canonical directory |
| `scripts/data` | `pipelines` | one canonical directory |

New code, CI, reports, commands, and generated action metadata must use the
canonical target. A legacy path may be read for compatibility or historical
evidence, but it must never become a second output root.

## Data and evidence ownership

- `data/raw`, `data/normalized`, `data/canonical`, `data/exports`, `data/legacy`,
  `data/backups`, `data/generated`, `data/standardized`,
  `data/standardized-view`, and `data/terraPedia` retain their existing source
  and compatibility contracts. This migration does not move their contents.
- `reports/authorization`, `reports/canonical-migration`, `reports/relation`,
  `reports/crawler-monitor`, and `reports/backend-refresh` remain readable
  evidence roots. Durable conclusions belong in `docs/audits`.
- `artifacts/runtime` is reserved, not an implicit replacement for `reports`.
  A separate classification and rebuild proof is required before any move.
- `task/`, `.superpowers/`, `.worktrees/`, and `.claude/` are local tool state;
  they are not application or data ownership boundaries. `.codex/` is tracked
  project skill and governance source and remains at the root.

## Path contract

`scripts/config/project.constants.json` defines roots, application identities,
runtime defaults, crawler output families, commands, and compatibility aliases.
`scripts/lib/project-constants.mjs` enforces repository containment and explicit
external-root opt-in. `scripts/lib/project-constants.sh`,
`scripts/lib/project-constants.ps1`, and the backend
`ProjectConstants` adapter consume the same manifest. Entrypoints resolve their
root from their own location or an explicit
`TERRAPEDIA_REPO_ROOT`/`TERRAPEDIA_PROJECT_ROOT` override; callers must not
infer the root from a caller's current directory.

Environment and CLI overrides still have precedence over project defaults for
ports, credentials, MinIO, Redis, MySQL, and shared data roots. API responses
remain repository-relative and never expose host paths.

## Safety boundary

The structure migration changes names and path resolution only. It does not
change API semantics, database schema, crawler strategy, frontend behavior, or
business data. No crawler `apply/force`, database write, Redis reset, or external
object-storage mutation is part of the migration.

If a path-offset or consumer check fails, stop that boundary, add a focused
resolver/fixture test, repair the canonical path, and rerun the affected gate.
Do not compensate with ad-hoc `../../` paths or silently recreate a legacy
directory.

## Acceptance and rollback

The durable acceptance record is
`docs/audits/structure/project-structure-migration-acceptance-2026-08-16.md`.
The old symlink entrypoints provide the compatibility rollback surface during
the migration window. After all consumers have migrated and the window is
explicitly closed, symlink removal is a separate reviewed task.

Focused acceptance currently passes the Node/structure contracts, Shell and
PowerShell adapter contract, admin checks, and backend path/acceptance tests.
The public sitemap prerequisite and two pre-existing standardized-data hashes
remain documented variances; neither is repaired by moving directories.
