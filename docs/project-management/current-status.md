# TerraPedia Current Status

## Date

2026-08-05

## Current Phase

Automated-ingestion runtime closure and repository closeout.

## Active Sequence

Evidence-based judgment: the bounded automated-ingestion runtime chain is now
green; the remaining work is repository review, durable-document alignment, and
focused commits from the large dirty worktree.

Current sequence:

P0 repository/devlog closeout -> P1 crawler monitor and resume/recovery
stabilization -> P2 homepage aggregation and public UI polish.

Current automated-ingestion snapshot (fresh commands on 2026-08-05): item-image
lineage is `6131/6131/6131/6131`; projection apply targeted 6,131 rows and
changed 6,126 existing images. Shimmer generation/import is complete, domain
acceptance passes `45/45`, and cross-DB quick passes `10/10`. Two independent
`biomes` L1 runs are `COMPLETED/COMMITTED/SINGLE_TXN`; all four owned mutation
generations and fences are 2, and counts are `48/14/1204/1519`. The separately
authorized L2 promotion and scheduler activation each have exactly one
append-only decision. Policy is `biomes v1 L2/ACTIVE`, with no circuit, active
attempt/reservation, or retained permit. Scheduler activation records bounded
eligibility only; no recurring daemon or crawler run was started.

The full Bash quality gate exits zero from the beginning: backend `1523` tests
with zero failures/errors (10 skipped), public frontend checks/build plus
`39/39` unit tests, admin checks/build plus `405/405` unit tests, and isolated
user-auth smoke run `be2913402d95f6ef2a02899c5da1f9bf` with outcome and cleanup
both `passed`. Cleanup readback finds zero E2E databases/accounts, Redis DB 15
size zero, no runner listeners, and no scheduler/crawler process. This is
readiness and local closure evidence, not a release or production-deployment
decision.

Historical progression through 2026-07-29 (retained for context):

The automated-ingestion closure branch has reached group `T2_CUTOVER_VERIFIED`,
formal Flyway V58, and a committed governed NPC landing prerequisite: one base
plus 25 crawler-fact landing rows now provide the lineage required for phase 1.
Batch 02 completed the repaired 25-target NPC crawler and localized 1,788 item
images. Group runtime reads now have zero production JSON readers and no JSON
fallback; fresh compatibility exports and source-contract flips remain later
gates. The regenerated biomes policy-promotion retry completed under its
one-time packet, so exact policy v1 is now `L1/ACTIVE`; the first L1 apply still
needs a separately frozen bundle and Owner decision. NPC phase 1 consumed two
independent decisions and rolled back before writing: first on row-contract
metadata columns, then on strict MySQL `DATETIME` input. Its authorized retry-03
now completed: landing remains 1 base / 25 crawler facts, and maint has 25
active facts with 25 distinct frozen hashes, MySQL-native `DATETIME` values,
and zero active transactions. The exact phase-2 item-relations packet then
committed its four `items` relation partitions as `329/329/178/2`, independently
recomputed from the 25 frozen facts and read back by record key. The exact
phase-3 Buff-relation packet then committed 1,270 rows, independently
recomputed and read back by record key. The first exact phase-4 town/shop packet
consumed its identity but rolled back on a local whole-table versus non-town
partition readback mismatch, leaving both tables unchanged and phase 5 closed.
That repaired retry also consumed its identity and rolled back with no result:
129 source conditions expand across duplicate `(npc,item,price)` shop entries to
257 written conditions, so its old source-count expectation was invalid. The
current repair derives transaction-local actual town counts and independently
re-reads them while preserving the generic non-town sync. Fresh authorization/
owner-phase validation is 45/45 and independent review has no Critical,
Important, or Minor finding. Fresh
preflight retained the 762-entry / 306-condition baseline (582/306 town and 180
non-town entries), the same server/policy fingerprints, four committed
predecessors, and zero active transactions. Authorized retry-03 then committed
the town partition under its one-time packet: result and independent readback
agree at 936 town entries and 257 town conditions, preserving 180 non-town
entries (1,116 entries and 257 conditions total) with zero active transactions.
The fresh 45/45 authorization/owner-phase suite passes. Authorized Phase 5 then
committed 1,270 `local.npc_buff_relations.buffs`; direct source/local readback
matches at 1,270 and active transactions remain zero. Authorized Phase 6 then
committed 1,544 non-boss `local.npc_loot_entries`; independent source/local
counts agree at 1,544, boss rows remain zero, and active transactions remain zero.
Authorized Phase 7 consumed its one-time identity under packet
`sha256:8170c16a6460534cc53b63d4e01a558d3bc0bad2cda78f07ebf0f5286e3fb07a`
and committed only the boss `local.npc_loot_entries` partition. The frozen boss
source predicate and the local boss partition both contain 0 rows; the 1,544
non-boss rows remain intact, the decision ledger contains one use, and active
transactions are zero. The private `canonical-npc-apply` completion now binds
the landing plus all seven ordered owner-phase result bytes. This closes the NPC
owner runway only; it is not a source-contract flip or NPC T1/T2 readiness.
NPC T1, four warning
panels, one blocked item-image panel, both L1 applies, L2, and scheduler
activation remain approval- or evidence-gated.

## Current Gate Boundary

Current workflow authority is `docs/project-governance/00_WORKFLOW.md`.
Current progress-control authority is `docs/project-governance/current/PROJECT_CONTROL.md`.
Current stack, code style, architecture, API contract, and validation/release
summaries live in
`docs/project-governance/current/CURRENT_TECH_STACK.md`,
`docs/project-governance/current/CURRENT_CODE_STYLE.md`,
`docs/project-governance/current/CURRENT_ARCHITECTURE.md`,
`docs/project-governance/current/CURRENT_API_CONTRACTS.md`, and
`docs/project-governance/current/CURRENT_VALIDATION_AND_RELEASE.md`.
Bash/WSL is the primary local automation path. The full local gate is:

```bash
bash ./scripts/dev/quality-gate.sh
```

The 2026-07-30 full local gate was run from the beginning. Its data and
automation contract stages passed, then the domain stage correctly failed
closed at `43/1/1`; that result is historical. The fresh 2026-08-05 full gate
passes from the beginning, including domain `45/45` and isolated E2E cleanup.
Treat all local gate results as readiness evidence, not a release decision.

## Data Chain Boundary

Acceptance status must flow through manifest, report evidence, freshness audit, manual refresh plan, quality gate, then UI/API.
UI/API must not generate evidence, refresh data, or query DB as gate evidence.

## Public Domain Boundary

The May V0.1 Nuxt public preview evidence covered Items, NPCs, Bosses, Buffs, Projectiles, Armor Sets, Biomes, Crafting, Categories, Search, Articles, and About. Treat that evidence as historical until the current Bash gate and route checks are rerun.

Public surface readiness still does not override Domain Acceptance. Missing or unknown evidence blocks; stale evidence is warning-only unless a current decision explicitly accepts it as `accepted-warning`. A blocker is cleared only when gate-consumed evidence is durable across machines; local-only ignored evidence is classification support, not closure.

## Monitor Boundary

Data Source Acceptance `crawlerMonitor` is read-only monitor projection and external monitor evidence. It is not crawler execution, not a refresh-plan/evidence command, and not an evidence generator.
Future DB-backed or real-time crawler diagnostics must be marked `notGateEvidence=true` and must not affect gate status.

## Local Self-start Boundary

Local self-start acceptance is runtime-only. Current maintained entrypoints are Bash/WSL scripts:

```bash
bash ./scripts/dev/start-local-stack.sh
bash ./scripts/dev/stop-local-stack.sh
```

Legacy `.ps1` local-stack scripts may appear in older May records or compatibility wrappers, but they are not current workflow authority and do not change acceptance readiness.
Smoke is read-only business probing and report writing under `reports/local-start`; it must not generate evidence, refresh data, run storage sync, or bypass manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate.

## P2 Status

P2 UI work is allowed only after P0 governance/status synchronization and P1 crawler/data reliability control points are stable. New public feature expansion should not be prioritized ahead of crawler/data reliability work unless explicitly accepted as preview-only work.

## Current Blockers And Risks

- Stale root governance files `03`, `04`, and `07-12` were removed from the current tree on 2026-07-10; Git history remains audit-only recovery, not current authority.
- Current companion docs now define stack, code style, architecture, API
  contract, validation, and release boundaries; they must be updated when
  package scripts, runtime config, API route families, response/auth contracts,
  data chain, or gate behavior changes.
- Code style now has a current document and EditorConfig baseline, but
  Prettier/ESLint/Spotless and strong style gates remain staged until each
  maintained line has a clean baseline.
- `docs/project-management/risk-register.md` is the current risk surface; old May risk rows are historical unless revalidated into the current table.
- Release or staging still requires an explicit release decision even though
  the fresh local Bash gate and data-readiness evidence are green.
- Crawler monitor and resume/recovery stabilization remains P1 until current plans and validation evidence show the reliability loop is stable.
- Automated ingestion remains fail-closed by operation identity. The completed
  L2 and scheduler decisions authorize only the recorded `biomes` policy state
  and bounded eligibility; they do not start an unbounded crawler or recurring
  daemon. The remaining immediate risk is the large mixed uncommitted worktree,
  which must be reviewed and split into focused commits before branch closeout.

## Next Actions

- Keep `docs/project-governance/current/PROJECT_CONTROL.md` aligned with `docs/project-management/current-status.md`.
- Keep current stack, code style, architecture, API contract, validation, and
  release summaries aligned with code and workflow changes.
- Introduce frontend and backend formatter/linter tooling through separate
  baseline migrations before adding read-only style checks to the full gate.
- Keep `docs/project-governance/00_CURRENT_SPEC.md`, `docs/devlog/current.md`, and project-management records synchronized when project facts or risks change.
- Continue crawler monitor/resume stabilization from the current July plans before broad public feature expansion.
- Preserve all consumed operation identities and immutable evidence. Complete
  Task 16 durable-audit alignment, review the dirty worktree by ownership lane,
  then stage only explicit focused paths for each commit.
- Decide whether to push or PR the local governance/status branches when the operator is ready.
- Rerun runtime/backend/frontend/data gates before making any release, staging, or public-readiness claim.
