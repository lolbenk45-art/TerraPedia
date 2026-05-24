# TerraPedia Decision Log

## D-2026-05-05-01: CI v1 uses Windows CI-safe gate

Decision: Use `windows-latest` and a CI-safe PowerShell gate for first CI integration.
Reason: Current local scripts are Windows-oriented, and full local gate may include DB/service assumptions.

## D-2026-05-05-02: verify-local-stack is not CI

Decision: `scripts/dev/verify-local-stack.ps1` remains local runtime verification only.
Reason: CI should not depend on local DB TCP, ports, or already-running services.

## D-2026-05-05-03: Drilldown reads reports only

Decision: Data Source Acceptance Drilldown first version uses latest report JSON and parsed report fields only.
Reason: Real-time DB queries would bypass evidence freshness and refresh-plan gates.

## D-2026-05-05-04: Domain Acceptance is P0.5

Decision: Domain Acceptance closes before Item/NPC public acceptance and before new public domains.
Reason: New public surfaces must not define their own readiness rules.

## D-2026-05-05-05: B-tier public domains stay planned-public

Decision: Boss, Buff, Projectile, and ArmorSet keep `publicExposure=planned-public` and `publicRoute=null`.
Reason: Phase B is readiness and admin visibility, not new public page implementation.

## D-2026-05-05-06: CI v1 warning policy

Decision: CI v1 fails on blocking, unsafe generator command, DB-writing generator command, and public-blocking missing/unknown evidence. CI v1 does not fail on ordinary warning.
Reason: Existing stale reports and relation warnings should remain visible without making initial CI permanently red.

## D-2026-05-05-07: Domain Acceptance blocks P2 public domains

Decision: Domain Acceptance is P0.5 and must close before Item/NPC public acceptance and before new public Boss/Buff/Projectile/ArmorSet work.
Reason: Public consumers must not define readiness independently of registry, reports, freshness, refresh plan, and gate.

## D-2026-05-06-01: public-blocking stale requires accepted-warning

Decision: `public-blocking stale` evidence defaults to warning. `public-blocking missing/unknown` evidence remains blocking. A stale public-blocking panel may continue to readiness-only evaluation only when it is explicitly recorded as `accepted-warning`; it must not become route-ready directly from stale evidence.
Reason: Stale public evidence should stay visible and bounded without silently opening public routes or making every stale report a hard block.

## D-2026-05-06-02: crawlerMonitor is external monitor evidence only

Decision: Data Source Acceptance `crawlerMonitor` is a read-only monitor projection and external monitor evidence. It is not crawler execution and is not an evidence generator. If future DB-backed or real-time diagnostics are added, every such sample must carry `notGateEvidence=true` and must not affect gate status.
Reason: Monitor visibility must not bypass the manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate chain.

## D-2026-05-06-03: Local acceptance uses separate verify, start, smoke, and stop steps

Decision: Local acceptance separates preflight verification, service startup, post-start smoke, and shutdown. Startup port checks are not business health, and smoke is not the local full quality gate.
Reason: A single startup script cannot safely represent compile/type health, runtime health, data freshness, and acceptance gate status.

## D-2026-05-06-04: Local stop defaults to recorded pid-only cleanup

Decision: `stop-local-stack.ps1` stops recorded pid files by default. Port cleanup is available only through explicit `-ForcePorts` and still requires local stack ownership checks.
Reason: Port-based cleanup can terminate unrelated developer services when ports overlap or stale report files exist.

## D-2026-05-06-05: Local smoke is read-only and cannot replace acceptance evidence

Decision: `smoke-local-stack.ps1` may issue read-oriented HTTP probes and optional auth login only for authenticated reads. It must not run crawler, import, backfill, load, apply, write, refresh, storage sync, or evidence generation.
Reason: Local runtime probing must not bypass the manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate chain.

## D-2026-05-23-01: V0.1 public site is preview-only until A-grade blockers close

Decision: The merged V0.1 Nuxt public site is a local/public preview surface, not final A-grade release readiness.
Reason: Fresh Domain Acceptance evidence exists, but `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` still reports `overallStatus=blocked`, `generatedBlockedCount=13`, and `generatedWarningCount=9`.
Evidence: `docs/audits/2026-05-23_basic-public-site-v0.1-domain-evidence.md`.
Expected follow-up: Execute `docs/plans/2026-05-23_domain-a-grade-blocker-burn-down-plan.md`, then make a separate release/staging decision.

## D-2026-05-23-02: Burn down Domain A-grade blockers before new public feature expansion

Decision: The next project-management priority is Domain A-grade blocker triage and burn-down, ahead of broad new public UI feature expansion.
Reason: The UI preview can render, but source, relation, item-group, and image-lineage blockers still exist in the acceptance chain.
Evidence: Current blocked panels include unresolved audit trend evidence, Boss/Armor/Shimmer/Town NPC source snapshots, Boss image lineage, item group source audit, and Projectile `nameZh.gap=1006`.
Expected follow-up: Split execution into report-only lanes first, then separate DB/crawler/data-write repair plans where blockers prove real data debt.

## D-2026-05-23-03: Gate-consumed evidence must be durable

Decision: Domain A-grade blocker closure requires the exact gate-consumed evidence path to be committed, or the gate/report producer must be changed to consume a deterministic tracked distilled artifact.
Reason: Group B/C/D can appear fixed on one machine when ignored generated files exist locally, then regress immediately on another checkout.
Evidence: `.gitignore` ignores `data/generated/wiki-*.json`, `data/generated/**/*.latest.json`, `reports/item-groups/**`, and `reports/audit/**`, while the Domain Readiness audit currently consumes those paths for source/image/item-group evidence.
Expected follow-up: Repair `docs/plans/2026-05-23_domain-a-grade-blocker-burn-down-plan.md` so stdout summaries are classification support only, not closure evidence.

## D-2026-05-23-04: A-grade burn-down does not start long item crawling

Decision: The Domain A-grade blocker triage plan may use read-only audits and bounded source-snapshot fetch lanes, but it must not start full item-page crawling, `item-pages-refresh`, backend refresh apply, import, or backfill.
Reason: The current blockers are evidence durability, source snapshot, image lineage, item-group audit, and projectile relation classification problems. A multi-day item crawl is a separate data/crawler operation with its own progress, timeout, recovery, and approval plan.
Evidence: Backend refresh plan includes `item-pages-refresh`; user noted item crawling can take 3+ days.
Expected follow-up: If a lane proves item crawl is actually required, open a separate crawler plan with the TerraPedia crawler progress contract before execution.

## D-2026-05-23-05: Source snapshot blockers need progress-contract repair first

Decision: Do not run the Boss, Armor Set, Shimmer, or Town NPC source snapshot fetches until their direct fetch lanes have monitor-visible progress contracts or are routed through a monitor-visible backend-refresh/wiki-sync action.
Reason: The checked fetch scripts do not expose `actionId`, progress path, `lastHeartbeatAt`, or completed/failed status before network work. Running them would violate the TerraPedia crawler progress contract even if each lane is intended to be bounded.
Evidence: `docs/audits/2026-05-23_domain-a-grade-source-snapshot-evidence.md`.
Expected follow-up: Add progress contract tests and output for each bounded source snapshot lane, repair the Town NPC `bs4` dependency, then regenerate durable source evidence.

## D-2026-05-23-06: V0.1 remains preview-only after blocker burn-down

Decision: V0.1 remains preview-only after the 2026-05-23 A-grade blocker burn-down.
Reason: The burn-down reduced generated blockers from 13 to 6, but the final A-grade gate still exits blocked. Remaining blockers require separate source-fetch progress, DB environment, image lineage, and projectile relation repair.
Evidence: `docs/audits/2026-05-23_domain-a-grade-blocker-burn-down-closeout.md`.
Expected follow-up: Complete the remaining repair branches, then rerun the full A-grade gate before any release-ready claim.

## D-2026-05-24-01: Remaining source snapshot blockers are closed with durable evidence

Decision: The four Group B source snapshot blockers are closed only through committed gate-consumed evidence, not local ignored files or stdout.
Reason: Boss, Armor Set, Shimmer, and Town NPC source readiness previously depended on missing ignored `data/generated/wiki-*.latest.json` or shimmer manifest artifacts.
Evidence: `docs/audits/2026-05-24_domain-a-grade-source-snapshot-evidence.md`.
Expected follow-up: Keep the committed `.gitignore` allowlists scoped to exact evidence paths; future source lanes need the same progress-contract and durability checks.

## D-2026-05-24-02: V0.1 remains preview-only until DB read environment is complete

Decision: Do not close Boss image lineage or projectile relation coverage while `terria_v1_maint` is missing.
Reason: The remaining two A-grade blockers require a complete readable three-database environment. The plan forbids synthesizing, restoring, importing, or writing a maint database inside this checkpoint.
Evidence: `docs/audits/2026-05-24_domain-a-grade-db-read-environment.md`, `docs/audits/2026-05-24_domain-a-grade-remaining-blocker-closeout.md`.
Expected follow-up: Open a DB read-environment repair branch, provide readable `terria_v1_maint`, then rerun Boss image lineage and projectile relation coverage evidence before any release-ready claim.

## D-2026-05-24-03: V0.1 has release-decision evidence but remains preview until operator release handling

Decision: V0.1 public preview is `release-decision-ready` based on committed closeout evidence, but it remains preview-labeled until the operator chooses push, PR, staging, or release handling and accepts the 18 documented A-grade warning panels.
Reason: Domain A-grade final closeout has `generatedBlockedCount=0`, Front Nuxt visual smoke passes, and local stack closeout smoke passes. The A-grade gate still has warning panels and local `main` has not been pushed.
Evidence: `docs/audits/2026-05-24_domain-a-grade-final-closeout.md`, `docs/audits/2026-05-24_front-nuxt-preview-final-smoke.md`, `docs/audits/2026-05-24_local-stack-preview-closeout-smoke.md`, `docs/audits/2026-05-24_preview-release-decision.md`.
Expected follow-up: Open `plan/public-v0.1-release-or-staging-2026-05-24` or choose a local-only checkpoint; open warning-debt branches if stronger release wording is required.
