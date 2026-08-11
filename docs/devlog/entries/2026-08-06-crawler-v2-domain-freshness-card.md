# Devlog: crawler-v2-domain-freshness-card

## Status

`closed`

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

- TDD RED/GREEN covered the latest-success selector, final progress label,
  missing completion/counts, and missing upstream probe.
- Crawler monitor utility/page contracts: `127/127` passed.
- Full admin unit suite: `410/410` passed; Nuxt typecheck and production build
  passed.
- Runtime authenticated read-only page check found the target row with:
  `空闲正常 / 已取消 / 39 / 39 · 完成于 08-06 08:40 · 距今约 3 小时 / 上游尚未检查`.
  Desktop and mobile card views had no document-level horizontal overflow.
- Existing target evidence was current epoch and completed `39/39`; a later
  cancelled `4/39` attempt remains visible as the latest result without
  replacing the latest successful data summary.

## Result

- Completed V2 idle-domain freshness display and focused validation.

## Residual Risks

- V2 history retention can omit an older successful attempt after enough later
  terminal attempts; the UI must report missing evidence rather than infer it.

## Follow-up

- User should refresh the running admin page to load the updated card and table.

## Commits

- Implementation commit SHA pending in final response.
