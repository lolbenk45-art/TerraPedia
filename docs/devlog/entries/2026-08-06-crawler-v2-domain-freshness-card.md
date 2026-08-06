# Devlog: crawler-v2-domain-freshness-card

## Status

`active`

## Context

- User goal: make completed `town_npc_maintenance` progress and freshness
  visible on the V2 domain card after the live state returns to idle.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Design: `docs/superpowers/specs/2026-08-06-crawler-v2-domain-freshness-card-design.md`

## Direction / Decisions

- Preserve `idle` as the truthful current queue state.
- Display local data update and upstream source-check freshness separately.
- Derive the new labels from retained V2 terminal history and existing source
  probe state; do not add crawler or database activity.

## Scope

- Admin crawler monitor row model, triage card/table rendering, and focused
  contracts.
- No crawler execution, database writes, scheduler changes, or backend API
  contract changes.

## Validation

- Pending implementation plan and TDD execution.

## Result

- Written design approved conversationally; implementation pending.

## Residual Risks

- V2 history retention can omit an older successful attempt after enough later
  terminal attempts; the UI must report missing evidence rather than infer it.

## Follow-up

- Write and execute the focused implementation plan after written-spec review.

## Commits

- Design checkpoint pending in final response.
