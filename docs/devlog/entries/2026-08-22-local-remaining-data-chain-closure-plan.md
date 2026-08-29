# Devlog: local remaining data-chain closure plan

## Status

`active`

Read-only closure run completed with explicit Item-source and compatibility variances.

## Context

- User goal: prepare one uninterrupted execution plan for the remaining eight-domain closure and resolve known failure branches during planning.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Parent entry: `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`
- Plan: `docs/superpowers/plans/2026-08-22-local-remaining-data-chain-closure.md`

## Direction / Decisions

- The plan uses a fresh read-only preflight before any mutation and treats historical counts as non-authoritative.
- Execution is serial by owner scope: NPC/Boss loot, Item source, Projectile source relations, then runtime and quality gates.
- External evidence, missing authorization, duplicate identity, scope drift, and unrelated quality-gate variance receive explicit machine-readable blocker or quarantine outcomes; the run does not pause for an interactive decision.
- The completed Item image refresh is regression evidence only and cannot be replayed.

## Scope

- Data: NPC/Boss loot lineage, Item source/acquisition/drop lineage, explicit Item/NPC Projectile relations, cross-database parity.
- Runtime: backend/API smoke, public/admin checks, local quality gate, protected image/Biome regression.
- Docs/process: formal plan, fresh evidence index, this entry, and parent current-state handoff.
- Out of scope: production, L2, direct SQL, unbounded crawler/fetch, image-byte refresh, cleanup, staging, commit, and external requests during planning.

## Validation

- Read: `AGENTS.md`, current spec, workflow, current devlog, existing closure plans, operation catalog, and actual audit/relation entrypoints.
- Plan review: goal lock, source-chain lock, boundary lock, evidence lock, execution continuity, serial ownership safety, and commit readiness all recorded as pass in the plan. The focused suite exposed one current manifest-bundle regression; it is now an explicit Task 0.1 repair gate before any freeze or data execution. The plan now includes checkpoint-based recovery after restart or context compaction and bounded self-repair without interactive decisions.
- Execution run: database writes, crawler, import, authorization consumption, staging, commit, cleanup, and external requests remained unperformed. Fresh DB-backed audits, local smoke, frontend checks, backend tests, and the quality gate were run as recorded below.

## Result

- Completed: Task 0.1 manifest-bundle repair, fresh read-only preflight, row-level NPC/Item quarantines, protected image regression checks, fresh NPC/domain/runtime closure, Projectile no-op preview, Biome readiness, image lineage `7/7`, local stack smoke `5/5`, frontend checks, and final evidence index.
- Repairs during execution: six admin contract tests now resolve the repository root correctly; the admin image-origin assertion follows the shared project constants contract; public sitemap-blocked audit lookup now resolves from the repository root. Admin `pnpm run check` and `pnpm run test` pass (`413/413`); public `pnpm run check` passes with the local Playwright Chromium binary; backend focused Maven evidence remains `74/74` from the preflight run.
- Blocked lanes: Item source remains quarantined (`522` family-policy candidates, `482` external-evidence rows, `217` manual-review rows, `1295` dry-run duplicates, `311` potential inserts, `canClaimNoRemainingWork=false`); no Item source operation, proposal, permit, or apply was created. NPC/Boss loot has no release blockers and runtime parity is `418/418`, but no mutation was required. Projectile preview reports zero writes and relation readiness passes.
- Compatibility variance: fresh local-core smoke still blocks `items`, `npcs`, and `bosses` because of documented projection baseline drift (five local-only item identities/field gaps, projection NPC `life_max`/`knock_back_resist`/`scale` nulls, and four pillar `name_zh` gaps); no direct SQL or ungoverned repair was attempted.
- Quality gate: `323/328` acceptance tests passed; five failures are missing historical authorization fixtures (`canonical-item-group-bootstrap.result.json`, `canonical-npc-apply.input.json`) and are recorded as quality variance, not synthesized.
- Focused backend regression set passed `82/82` (`ItemSourceServiceImplTest`, NPC aggregate/image, Item image, public Item, and relation compatibility tests). Backend broad Maven gate is also a variance (`1573` tests: `8` failures, `1` error) in pre-existing Admin NPC/Buff/Boss image/fallback expectations. The parent eight-domain entry remains `active`; full data closure is not complete.

## Residual Risks

- Local MySQL is now operator-started and available on `127.0.0.1:13306`; future mutation work still requires a new freeze and fresh authorization.
- NPC source quarantine contains `17` unclassified-zero rows and `113` group-page variant rows; Item source has `522` blocked candidates and `311` dry-run inserts but no governed apply.
- Any new mutation operation required for Item source or Projectile relations must be implemented and independently tested before authorization; bare script `--apply=true` is not permitted.

## Follow-up

- Owner: Codex; keep the parent active. The next run must resolve Item-source duplicate/quarantine and compatibility variances through a fresh governed plan; never reuse this run's counts for authorization and never synthesize missing fixtures.

## Execution Record

- Run roots: historical `reports/runtime/local-data-chain-closure/20260822/remaining-chain/072812-remaining-chain/`; fresh `reports/runtime/local-data-chain-closure/20260822/remaining-chain/090736-remaining-chain-r2/`.
- Task 0 checkpoint: `completed_with_blockers`; fresh reports and row-level quarantine files exist under the run root.
- Code repairs: manifest bundle fixture, six admin test root paths, shared image-origin assertion, and public SEO audit path.
- Frontend evidence: admin `pnpm run check` and `pnpm run test` pass; public `CHROMIUM_BIN=$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome pnpm run check` passes.
- Runtime evidence: fresh local smoke exited `0` with `5/5` checks passed; DB-backed reports and final evidence index are under the fresh run root.
- Quality gate evidence: command exited `1`, `323/328` tests passed, with five missing-fixture failures listed in `run-root/final/quality-gate-variance.json`.

## Fresh Run Closure (2026-08-22 10:31 CST)

- Boundary held: `databaseWrites=false`, `crawlerOrFetchPerformed=false`, `externalRequests=false`, `authorizationConsumed=false`, `permitConsumed=false`.
- NPC coverage/domain/runtime/closure pass; explicit coverage remains `300/4/17/113/290/38`, with no inferred loot for the `17` and `113` rows.
- Cross-DB integrity `10/10` pass, blocking `0`; relation health warning-only, blocking `0`.
- Image lineage `7/7` ready when bound to accepted attempt `8e31d3c6d2e178b1985c05b43efa18a408a84afd98ed2ec6a7fd176eca891026`.
- Biome readiness `47` managed, `0` Wiki fallback, `0` invalid, `0` missing.
- Final evidence index: `090736-remaining-chain-r2/final/closure-index.json`; checkpoint: `090736-remaining-chain-r2/checkpoint.json`.

## Commits

- Pending; no staging or commit performed.

## Cross-Review

- Reviewer: coordinator self-review using `terrapedia-plan-auditor`.
- Scope: plan structure, source chain, boundaries, evidence, continuation, ownership, and closeout.
- Findings: one implementation-contract defect was found: the Item image origin-repair adapter is missing from the projection manifest bundle fixture. The plan now requires a focused Task 0.1 repair before any data execution. Historical numbers are explicitly non-authoritative, `relation-health-report.mjs` path is verified, and external/missing-evidence lanes are deterministic quarantine branches.
- Disposition: fixed.
- Re-review required: no for plan preparation; required after Task 0 changes any scope or operation contract.
