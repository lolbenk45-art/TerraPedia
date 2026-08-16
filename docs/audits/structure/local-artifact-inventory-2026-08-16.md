# Local Artifact Inventory 2026-08-16

## Scope And Method

This inventory covers repository-root `tmp/`, root `logs/`, `reports/tmp/`,
and `task/`. It scanned tracked production scripts, tests, local wrappers, and
documentation for root-relative references. OS `/tmp` and platform-specific
`C:/tmp` fixtures are outside this migration.

Commands used:

```bash
find tmp logs reports/tmp task -maxdepth 3 -type f -o -type l
rg -n --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' \
  -e 'tmp/' -e 'logs/' -e 'reports/tmp' apps services packages pipelines platform docs README.md AGENTS.md .gitignore
```

## Directory State

| Path | Observed state | Classification | Decision |
| --- | --- | --- | --- |
| `tmp/` | 14 tracked files under `tmp/home-hero-hi-fi/` | Durable audit evidence | Retain unchanged. These historical high-fidelity specimens are a tracked root exception, not a destination for new output. |
| `logs/` | Absent | No current output consumer | Do not create it. Root logs are prohibited for new output. |
| `reports/tmp/` | Absent and covered by the report ignore rule | No current output consumer | Do not create it. Reproducible output belongs in `reports/runtime/<operation>/`. |
| `task/` | Absent and ignored | Ephemeral local state | Retain as local task context only; it is never a source of project facts. |

No ignored file was deleted during this inventory. Any cleanup of ignored local
files requires explicit user approval.

## Consumer Classification

| Consumer or reference | Classification | Result |
| --- | --- | --- |
| `apps/public-web/scripts/audit-shoot.mjs` default `AUDIT_OUT` | Ephemeral local state | Migrated from root `tmp/audit-shots` to `.local/tmp/audit-shots`. Override remains available through `AUDIT_OUT`. |
| `tmp/home-hero-hi-fi/**` | Durable audit evidence | Retained in place because the files are tracked historical specimens. No producer was found in the audited script/test/wrapper scan. |
| `docs/operations/lightweight-request-observability.md` root `logs/` search examples | Compatibility input | Historical operator instructions may inspect an already-existing local root log directory; no producer was found. This non-owned historical reference is explicitly allowlisted. |
| `docs/project-management/frontend-migration/**` root `logs/` migration records and merger helper | Compatibility input | Historical migration inputs only. No current production producer was found; retain unchanged outside this task's owned paths. |
| `reports/runtime/<operation>/` | Reproducible runtime report | Governed destination for repeatable operation output; it replaces any prospective `reports/tmp/` use. |
| `docs/audits/**` | Durable audit evidence | Governed destination for conclusions that must survive local cleanup. |
| `/tmp/**` and `C:/tmp/**` in scripts and tests | Ephemeral local state | Excluded from this root-directory migration. |

## Historical Summaries

`PLAN_FIXES_SUMMARY.md` and `REFACTORING_SUMMARY.md` were reference-scanned
before relocation. Their only root-name references were the active bilingual
Task 6 plan and the focused contract test; neither is a filesystem link that
breaks after archival. Both files were moved unchanged to
`docs/project-governance/archive/`.

## Guardrail

`platform/tooling/check-root-artifact-contract.mjs` rejects new root `tmp/`,
root `logs/`, `reports/tmp/`, and root `*_SUMMARY.md` references. Its minimal
allowlist is limited to policy files plus historical plans, devlogs, archives,
and migration records that document pre-existing paths. The focused contract
test exercises both rejection and the current repository scan.

## Residual Risk

The tracked high-fidelity specimens still occupy root `tmp/` because moving or
deleting them would change historical evidence beyond this task. Root-log
references in historical migration and operations documents remain for
backward traceability; any effort to remove those compatibility inputs needs a
separate reference-owner review.
