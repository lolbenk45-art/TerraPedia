# Domain A-Grade Remaining Plan Cross Review - 2026-05-24

## Verdict

- Status: execution-ready only after the repaired boundaries in `docs/plans/2026-05-24_domain-a-grade-remaining-blocker-repair-plan.md` are followed.
- Main goal: close or truthfully reclassify the six remaining Domain A-grade blocked panels.
- Closure definition: every blocker is either cleared by durable gate-consumed evidence or remains blocked with a concrete follow-up branch; V0.1 remains preview-only unless `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` exits `0`.

## Cross-Review Inputs

- Crawler/source reviewer: checked progress contract, monitor visibility, network fetch ordering, bounded fetch rules, and item-page crawl exclusion.
- Git/worktree reviewer: checked local `main` ahead state, branch base, staging rules, push policy, and integration path back to `main`.
- Local evidence-chain review: checked `.gitignore` evidence retention, DB read-only boundary, release-ready wording, and classification-vs-closure semantics.

## Critical Repairs Applied

- Added a hard Git and execution boundary:
  - authoritative local `main` worktree is `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22`;
  - root `/home/lolben/TerraPedia` is not `main` and must not be used as the base;
  - local `main` is `37` commits ahead of `origin/main`, so every branch must record the approved integration base before work starts.
- Replaced direct `git switch -c` with an isolated `git worktree add ... -b ... main` flow.
- Added a no-push policy for `main` and a separate ancestry-review requirement for any task branch push.
- Split the large plan into branch/checkpoint lanes: baseline, progress contract, source evidence, DB classification, Boss image lineage, projectile coverage, and final closeout.
- Added closeout rules so a completed checkpoint is either merged into local `main`, kept open, or deliberately used as the base for the next dependent checkpoint. This prevents repeating the prior “new branch does not show main effect” problem.
- Repaired crawler boundary:
  - source snapshot progress JSON alone is not monitor-visible;
  - four dedicated Crawler Monitor registered tasks are required before live fetch;
  - `data/generated/wiki-sync-progress.latest.json` must not be reused because it represents item/wiki sync;
  - payloads must include `childStatusPath`;
  - backend/admin/page monitor contract tests are required before network execution.
- Added network safety gate:
  - Task 1 cannot run live fetch;
  - Task 2 must verify no active crawler/backend-refresh writer, confirm operator intent, then run small-sample network smoke before full bounded fetch.
- Tightened source fetch bounds:
  - Boss fetch needs `--max-records` or equivalent preflight cap;
  - Town NPC fetch must smoke with `--limit=1` or `--limit=2`, then use an explicit recorded seed count for the full run.
- Repaired evidence retention:
  - exact negated `.gitignore` allowlists are required for gate-consumed files;
  - parent directories must be unignored where necessary;
  - `git check-ignore -v` and explicit `git status --short --ignored` checks are required before evidence commit.

## Important Residual Risks

- The plan still depends on local `main` being accepted as the integration base despite being ahead of `origin/main`. If that is not acceptable, execution must stop and branch from `origin/main` with explicit cherry-picks.
- Task 1 touches backend monitor code, data-query-app monitor contracts, and four fetch lanes. It is acceptable only as a focused progress-contract checkpoint; if implementation grows further, split Node fetch lanes from Python lane.
- Source snapshot fetches make live requests to `terraria.wiki.gg`; they are allowed only after monitor registration tests pass and after a small-sample smoke proves progress visibility.
- DB evidence tasks remain classification-only unless a complete readable `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation` environment exists. The plan does not restore, import, synthesize, or write DBs.

## Execution-Ready Plan

- Scope: six Domain A-grade blockers remaining after 2026-05-23 blocker burn-down.
- Agent split:
  - Git/baseline and final integration stay with the coordinator.
  - Crawler monitor registration and source progress contracts can be one worker checkpoint.
  - Source evidence fetch must be serialized after progress contract merge.
  - DB environment, Boss image lineage, and projectile coverage are separate read-only evidence checkpoints.
  - `.gitignore` edits stay serialized with the evidence checkpoint that needs them.
- Smoke test:
  - baseline: freshness exits `0`, A-grade exits `1` with six blockers;
  - progress: monitor registered tasks and script progress contract tests pass without live network;
  - source: small Town NPC `--limit=2` smoke completes and monitor sees the progress;
  - final: A-grade exits `0` or closeout documents exact remaining blockers.
- Final validation:
  - `domain-acceptance-generate-reports.mjs --write=true`;
  - `domain-acceptance-freshness-audit.mjs`;
  - `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true`;
  - `cd front-nuxt && pnpm run check:public-pages && pnpm run check`.

## Non-Goals

- No item-page crawl.
- No backend refresh apply.
- No imports, backfills, DB writes, production mutation, or push.
- No weakening gate logic to make blockers disappear.

