# Crawler Auto-Domain Consumption And Resume

## Status
`active`

## Goal

Repair changed-only source acknowledgement and failed-task checkpoint recovery
for all eight automatic crawler domains. Automatic retry is capped at three
resume attempts, after which the task pauses for human review.

## Scope

- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Coordinator: Codex
- Design: `docs/superpowers/specs/2026-08-14-crawler-auto-domain-consumption-resume-design.md`
- Domains: `items`, `npcs`, `projectiles`, `armor_sets`, `buffs`, `shimmer`, `audio`, `bosses`
- Excluded: database applies, L2, Boss loot, NPC loot, Redis reset, and interruption of the live Buff attempt

## Current Evidence

- Buff source state is `missing_ingestion_manifest` and `changed=true`.
- The V2 automation sweep dispatches `fresh` for changed actions.
- Buff has a real keyed checkpoint, but fresh mode deletes it before crawling.
- The current Buff attempt remains live and is the active writer for its progress and resume files.

## Plan

Implement the approved design in the linked specification, beginning with
contract-level failing tests and isolated source/queue fixtures. Keep the live
Buff writer untouched until it is terminal; restart the backend only after
focused validation and explicit runtime readback.

## Validation

Pending implementation. Required evidence: focused Node source/automation tests,
focused V2 backend tests, `git diff --check`, and a post-restart read-only sweep
showing unchanged sources are not dispatched.

## Risks And Handoff

- Existing unrelated worktree changes in `data/standardized/armor_sets.standardized.json`
  and three untracked superseded authorization artifacts must remain untouched.
- The implementation must preserve the existing V2 queue identity and lease
  fences while changing only resume selection and source acknowledgement.
