# Project Structure Compatibility Window Closure Audit

Date: 2026-08-16
Owner: Codex
Branch: `refactor/close-structure-compat-window`
Worktree: `/home/lolben/TerraPedia/.worktrees/close-structure-compat-window`
Parent migration checkpoint: `9f386e40`

## Decision

This audit closes the one-way compatibility window created by the project
structure migration. Canonical application, service, package, pipeline, and
platform roots are the only maintained code boundaries. The eight legacy
entrypoints are removed in the focused closure change after the current
consumer scan below.

No database, crawler, Redis, object-storage, data, report, Shimmer, or
authorization artifact is moved, regenerated, or written by this task.

## Preflight symlink map

| Retired entrypoint | Target observed before deletion |
| --- | --- |
| `front-nuxt` | `apps/public-web` |
| `data-query-app` | `apps/admin-console` |
| `back` | `services/catalog-api` |
| `shared/article-runtime` | `../packages/content-runtime` |
| `scripts/dev` | `../platform/local` |
| `scripts/ops` | `../platform/operations` |
| `scripts/tooling` | `../platform/tooling` |
| `scripts/data` | `../pipelines` |

Canonical paths were real directories before deletion: `apps/public-web`,
`apps/admin-console`, `services/catalog-api`, `packages/content-runtime`,
`pipelines`, `platform/local`, `platform/operations`, `platform/tooling`, and
`scripts/lib`.

## Reference scan and classification

The scan used `rg --no-follow` with the legacy path pattern:

```text
front-nuxt|data-query-app|(^|[^[:alnum:]_])back/|shared/article-runtime|scripts/(dev|ops|tooling|data)(/|\b)
```

Current consumer scope was `.github/`, `apps/`, `services/`, `packages/`,
`platform/`, `pipelines/`, `scripts/lib/`, and `scripts/config/`, excluding
generated dependency/build directories and README files for the first runtime
pass. Results before repair:

| Scope | Files with hits | Disposition |
| --- | ---: | --- |
| `.github/` | 0 | no CI dependency |
| `apps/` | 0 | no runtime dependency |
| `services/` | 0 | no runtime dependency |
| `packages/` | 0 | no runtime dependency |
| `platform/` | 0 | no executable dependency |
| `pipelines/` | 0 | no executable dependency |
| `scripts/lib/` | 1 | manifest assertion updated to closed-state assertion |
| `scripts/config/` | 1 | legacy manifest fields removed |

The first documentation pass was expanded after review to include active
architecture, design, operations, contracts, governance, project-management,
and runbook documents. The mandatory public UI baseline, detail-design
reference, active operations guide, current contract references, governance
guidance, root/governance wording, app/platform READMEs, and runbooks were
changed to canonical paths. The closure audit, architecture table, governance
spec, agent guide, and focused absence-guard test intentionally retain retired
names only to enforce the “do not recreate” policy.

Historical/reference scan counts before repair (archive and legacy governance,
devlog entries, superpowers plans/specs, audits, and tracked design specimens
under `tmp/`) were retained as evidence rather than mechanically rewritten:

| Scope | Files with hits | Lines with hits | Classification |
| --- | ---: | ---: | --- |
| `docs/project-governance/archive/` | 57 | 482 | historical governance |
| `docs/project-governance/legacy/` | 34 | 171 | legacy reference |
| `docs/devlog/entries/` | 38 | 135 | historical task traceability |
| `docs/superpowers/plans/` | 208 | 6,921 | historical plans |
| `docs/superpowers/specs/` | 45 | 187 | historical specs |
| `docs/audits/` | 82 | 553 | durable historical evidence |
| `tmp/` design specimens | 7 | 14 | tracked visual reference assets |

Additional non-authoritative task-history locations retain old strings without
being rewritten: `docs/plans/` (50 files, 1,624 lines), `docs/evidence/` (1
file, 2 lines), `docs/requirements/` (1 file, 2 lines), `docs/todo/` (1 file,
1 line), and `REFACTORING_SUMMARY.md` (1 file, 11 lines). The decision log also
retains dated historical references, now prefaced with the current-entrypoint
rule. None of these locations is a runtime, CI, package, current governance,
or design-baseline entrypoint.

These residual historical strings do not name maintained runtime entrypoints;
they document commands and paths that were valid when the evidence was
created.

## Closure changes

- `scripts/config/project.constants.json` now reports
  `compatibility.migrationStatus: "closed"`; application `legacyPath`,
  `commands.legacy*`, and `compatibility.aliases` are absent.
- Current governance, architecture, root README, app/service/pipeline/platform
  READMEs, script layout guidance, and current runbooks now use canonical paths
  and state that retired paths must not be recreated.
- Root and architecture indexes now route structure work to
  `docs/architecture/project-structure-v2.md`; the 2026-04-27 redesign is
  explicitly historical and retained only for its original design evidence.
- `scripts/lib/project-structure-compatibility-closure.test.mjs` proves the
  manifest status, retired-path absence, and canonical real-directory boundary.
- The eight tracked symlink entries are deleted after the preflight map was
  captured.

## Validation record

- Retired-path absence and canonical real-directory checks: pass for all eight
  retired paths and nine canonical directories.
- Node project-constants plus structure-closure suites: 9/9 pass.
- Shell/PowerShell and crawler source-layout contracts: 6/6 pass.
- Canonical admin `pnpm run check`: pass after installing the locked worktree
  dependencies with `pnpm install --frozen-lockfile`.
- Canonical backend focused path/acceptance Maven suite: 307 tests, 0 failures.
- Runtime/CI scan after deletion: no retired-path references outside the
  intentional absence-guard test. The expanded active-document scan found only
  explicit retired-path policy and dated historical-evidence references; active
  commands and design source paths use canonical roots.
- `git diff --check`: pass.
- Independent closure review found and repaired stale active-document and
  structure-index references; the final re-review reported no critical or
  important findings.
- Canonical public `pnpm run check:public-pages`: blocked by the pre-existing
  missing `apps/public-web/public/sitemap.xml` prerequisite; no sitemap or
  frontend source was changed here.
- Local quality gate with `--skip-front --skip-admin --skip-back`: 321/326
  tests passed. Five failures require missing authorization fixtures in this
  isolated worktree (`canonical-item-group-bootstrap.result.json`,
  `canonical-npc-apply.input.json`, and related owner-phase evidence); this is
  the known evidence baseline variance, not a structure-path failure. No
  database or external write was run.
- Final status/staged-scope review remains part of commit closeout.

Known unrelated variances remain separate from this task: the public frontend
sitemap prerequisite and pre-existing standardized-data baseline hash drift.

## Rollback

Rollback is a Git revert of the focused closure commit. Do not manually restore
legacy directories or create a second writable code tree. If a current consumer
fails, revert the focused change in the isolated worktree, repair the canonical
consumer, and rerun the full closure validation before attempting deletion
again.
