# Dual-Path Domain Ingestion Acceptance

## Status

`active`

## Context

- User goal: validate manual and automation-gated ingestion for the eight source-probed domains; use local standardized data plus real probes for Items and Projectiles, and real crawl plus real local database transactions for the remaining six domains.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Target database: WSL-local `terria_v1_local` only.
- Review plans: `docs/superpowers/specs/2026-08-15-dual-path-domain-ingestion-acceptance-review.zh.md`, `docs/superpowers/specs/2026-08-15-dual-path-domain-ingestion-acceptance-review.en.md`
- Execution plans: `docs/superpowers/plans/2026-08-15-dual-path-domain-ingestion-acceptance-execution.zh.md`, `docs/superpowers/plans/2026-08-15-dual-path-domain-ingestion-acceptance-execution.en.md`
- Related prior entry: `docs/devlog/entries/2026-08-14-crawler-auto-domain-consumption-resume.md`

## Direction / Decisions

- The user approved removing per-apply Owner authorization for automatic ingestion while retaining current canonical automation activation as the mandatory global write gate.
- Manual and automatic triggers must share the same importer, transaction, owned-table, progress, and audit contracts.
- Items (`6131`) and Projectiles (`1111`) use existing local data plus real probes and importer dry-runs; they do not perform full crawls or commit DB changes.
- NPCs (`762`), Buffs (`388`), Armor Sets (`63`), Bosses (`33`), Audio (`<=600`), and Shimmer use real bounded sources and real local DB transactions.
- All crawler and database work is serialized. No Windows service, production DB, L2, NPC loot, Boss loot, Redis reset, or unrelated data repair is allowed.

## Scope

- Backend: automation activation/preflight gate and automatic apply dispatch only if the approved design requires a missing seam.
- Data: manual and automatic importer acceptance, local DB before/after evidence, real bounded source work for six domains.
- Crawler: monitor-visible source/probe execution with stable progress and no duplicate writers.
- Docs/process: bilingual review plan followed by a separate bilingual executable plan.
- Out of scope: public UI, unrelated generated data cleanup, production writes, loot automation, and L2.

## Validation

- Commands run: read-only repository, registry, source-chain, runtime-writer, local corpus count, and authorization inventory checks.
- Results: eight auto domains confirmed; local counts are Items 6131, Projectiles 1111, NPCs 762, Buffs 388, Armor Sets 63, and Bosses 33; no active crawler/backend writer was found at design time.
- Not run: no service start, crawler, scheduler mutation, database write, or importer dry-run during the review-design stage.

## Result

- Completed: the review and execution plans are available as separate Chinese and English documents.
- Not completed: written owner approval, implementation, and runtime acceptance.

## Residual Risks

- Existing runtime-generated Audio/Bosses and authorization artifacts remain dirty and must not be mixed into later code/doc commits.
- Exact per-domain owned-table queries and rollback commands must be resolved from the existing importers in the executable plan.
- Automatic apply must be added without weakening activation identity, source stability, retry, or active-attempt fences.

## Follow-up

- Owner reviews the bilingual design; after approval, create and audit the bilingual executable plan before any write operation.

## Commits

- `commit SHA pending in final response`.
