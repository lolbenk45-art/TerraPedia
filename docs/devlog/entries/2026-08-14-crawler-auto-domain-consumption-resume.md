# Crawler Auto-Domain Consumption And Resume

## Status
`active`

## Goal

Repair changed-only source acknowledgement and failed-task checkpoint recovery
for the five source-probed automatic crawler domains. Automatic retry is capped
at three resume attempts, after which the task pauses for human review.

## Scope

- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Coordinator: Codex
- Design: `docs/superpowers/specs/2026-08-14-crawler-auto-domain-consumption-resume-design.md`
- Automatic domains: `items`, `npcs`, `projectiles`, `armor_sets`, `buffs`
- Fail-closed until lightweight source probes exist: `shimmer`, `audio`, `bosses`
- Excluded: database applies, L2, Boss loot, NPC loot, Redis reset, and interruption of the live Buff attempt

## Current Evidence

- Buff source state was `missing_ingestion_manifest` and `changed=true`.
- The V2 automation sweep dispatched `fresh` for every changed action.
- Buff has a real keyed checkpoint, but fresh mode deleted it before crawling.
- The current Buff attempt remains live and is the active writer for its progress and resume files.

## Plan

The action registry now fail-closes the three unprobed supplementary domains.
Buff and Armor Set commands pass the canonical source manifest path. V2
automation reads the current attempt snapshot: it does not duplicate live
attempts, retries failed resumable work through the existing V2 retry command,
pauses failed non-resumable work, and records `automatic_retry_limit_reached`
after three resume retries. Successful snapshots carry a source fingerprint so
the same completed source is skipped while a later upstream fingerprint starts
a fresh attempt.

## Validation

TDD red was observed for fresh re-enqueue and retry-limit behavior, then for a
completed attempt incorrectly suppressing a newer source fingerprint.

- `cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerAttemptSupervisorTest,CrawlerQueueV2ApplicationServiceTest test` passed: 334 tests, 0 failures, 0 errors.
- `node --test scripts/data/monitor/check-source-updates.test.mjs scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs scripts/data/fetch/fetch-wiki-armorsetbonuses.test.mjs` passed: 27 tests, 0 failures.
- `git diff --check` passed.
- Independent code-review requests were retried after two transient reviewer-stream disconnects; no review conclusion was available at checkpoint time.
- Code checkpoint: `3afa88c7` (`fix(crawler): recover changed-only domains`).

## Risks And Handoff

- Existing unrelated worktree changes in `data/standardized/armor_sets.standardized.json`
  and three untracked superseded authorization artifacts must remain untouched.
- The implementation must preserve the existing V2 queue identity and lease
  fences while changing only resume selection and source acknowledgement.
- Do not restart the backend or run a live sweep until the existing Buff writer
  is terminal. After restart, collect a read-only scheduler sweep to confirm
  unchanged sources produce no dispatches.
- Re-run independent code review during the post-restart acceptance pass.
