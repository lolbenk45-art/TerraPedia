# Eight-Domain Production Readiness Plan

## Status

`active`

- Owner: Codex coordinator.
- Branch: `feat/supplementary-domains-readiness`.
- Worktree: `/home/lolben/TerraPedia`.
- Parent plan: `docs/superpowers/plans/2026-10-16-eight-domain-production-readiness.md`.
- Child plans: the eight `2026-10-16-eight-domain-production-readiness-*.md` files beside the parent plan.

## Goal

Define the eight-domain path from real revision-bound source capture to maintained isolated database ingestion and independent consumer readback before any formal production release. This planning task performs no crawler, importer, scheduler, Redis, or formal database mutation.

## Evidence Reviewed

- `docs/devlog/current.md` and the 2026-10-13 three-domain full-recrawl handoff.
- `docs/project-governance/00_CURRENT_SPEC.md` and `docs/project-governance/00_WORKFLOW.md`.
- Existing isolated real-ingestion plan and maintained T1/Importer entrypoints.
- Current allocation state: no eight-domain allocation is approved yet; historical Armor/Buff/Shimmer DB20/DB22/DB24 artifacts are reference only. Formal runtime DB14/DB15 remain reserved.

## Plan Result

- Created one master plan and eight domain child plans.
- Defined the required evidence contract: source revision/hash, run-derived schemas, isolated Redis, maintained importer/sync, table/API readback, rollback, cleanup, and `formalDatabaseWrites=false`.
- Recorded hard blockers rather than waivers: NPC/Boss shared-table ownership, Armor `maint_items` and source contracts, Buff unresolved identities and source/maint drift, and Shimmer unresolved references.
- Repaired plan defects found during review: child plans consume a reviewed allocation manifest instead of selecting Redis/schema IDs; missing Armor/Buff/Shimmer runners are explicit creation tasks; Shimmer paths use the actual transform/contract modules; and isolated API lifecycle, schema/Redis binding, route readback, stop, and cleanup are explicit.
- Follow-up review tightened dependency and runtime boundaries: bounded T1 snapshots cannot stand in for exact dependency closure; a tested key-list dependency seeder is required; API/Flyway migration uses the provisioner before read-only API startup; scheduler/crawler writes are disabled in the isolated API; artifacts separate isolated-ingestion and production-readiness status; and the master source task aggregates child captures instead of refetching them.
- Final review found and repaired the API account/grant gap: the formal snapshot account remains formal SELECT-only, the provisioner remains the migration/write account, and a distinct run-owned `apiReadonly` account with SELECT-only grants on the three isolated schemas is required, including login/rate-limit Redis key ownership and cleanup. The plan also requires exact child dependency manifests and migration SQL/schema fingerprints rather than bounded sample or assumed Flyway-history evidence.
- The latest review also requires explicit API-only Redis key cleanup, run-owned admin login through `/api/auth/login`, separate MySQL/API account inventory, `SPRING_TASK_SCHEDULING_ENABLED=false`, exact JAR/migration/config hashes, and distinct isolated-ingestion versus production-readiness statuses. All eight child plans now declare their exact dependency manifest and common seeder call before business DML.
- One final harness gap was closed in the plan: production-readiness T1 runs must pass their exact dependency manifest into `runLiveAutomationAcceptance`/the MySQL adapter and disable the generic bounded sample copy; historical T1 contracts may retain the old bounded mode only when explicitly declared.
- The latest review added the object-storage boundary: Armor/Boss image lanes need a run-owned MinIO bucket/prefix or verified read-only cache mode with object-list hashes and cleanup; Audio must declare metadata-link-only versus isolated-binary mode. The artifact now records object-store mode/identity when applicable.
- The final pass added the run-owned API MySQL account/grants, exact T1 dependency-manifest mode (generic bounded samples disabled), isolated API scheduler/crawler write guards, and object-store lifecycle task/tests. No runtime command was run during review.
- Final review also split object-store allocation into its own manifest, clarified distinct admin/user token secrets and API read grants, and removed all remaining ambiguity between formal dependency reads, isolated seeding, and API access.
- The execution-standard review found three missing requirements and added them: exact-code installation in a clean specified worktree, a cross-domain basic/isolated/error/release test matrix, and an explicit frozen-local-source strategy. Item now has a fast local compatibility lane plus a separate maintained subset lane; it no longer requires a full 6k-page recrawl for this validation. Other domains use their existing generated/standardized/revision-bound artifacts by default, with bounded live capture optional rather than silently required.
- Resume review confirmed capability is mixed: keyed source resume exists for Buff and Boss, asset-level resume exists for Audio, detached Item crawling can resume when the live lane is selected, while base NPC/Projectile, Armor Sets, and Shimmer use failed-progress plus fresh rerun. The plan now distinguishes source resume from transaction retry and requires explicit `commit_outcome_uncertain` reconciliation.
- Preserved production release and unattended-operation gates as a separate follow-up; this plan does not enable the scheduler or write formal databases.

## Validation

- Read-only entrypoint and evidence inspection completed before plan creation.
- New plan files pass targeted whitespace, placeholder, link, and structure scans.
- Follow-up plan review passes fixed-resource, missing-path, API-binding, dependency-closure, status-separation, and child-runner creation scans.
- Final read-only review passes account/grant, API write-path, dependency-seeder, migration-fingerprint, Redis-key-cleanup, and child dependency declaration scans.
- `git diff --check` still reports pre-existing trailing whitespace in unrelated `docs/superpowers/plans/2026-06-08-front-typography-theme-spacing.md`; the new plan and devlog files have no whitespace errors.

## Next Action

Run the master Task 0 resource inventory and allocation decision first, then Task 1/API lifecycle checks, and only then execute the eight child plans serially. Stop a child on source/identity/ownership/cleanup drift and create a new run identity after repair.
