# Crawler V2 Domain Freshness Card Design

## Goal

Keep the V2 domain card's current queue state truthful while making the latest
completed crawl, final progress, local artifact age, and upstream source-check
state visible after a domain returns to `idle`.

The immediate acceptance target is `town_npc_maintenance`, but the behavior
must be generic for every V2 domain with terminal attempt history.

## Current Problem

- `domainStates` intentionally contains only live attempt state. A completed
  domain therefore returns to `idle` with no current progress.
- The frontend already resolves the latest terminal attempt, but reduces it to
  a result label and does not retain its final count or completion time on the
  domain card.
- Source freshness is derived only from the Wiki source-update probe. Domains
  without a matching probe row render an empty value, which does not distinguish
  "not checked" from "no change".

## Display Contract

Each V2 domain row has two independent time axes:

1. **Local data update** comes from the latest successful terminal attempt.
   It shows final `current / total`, completion time, and age. If no successful
   attempt exists, it explicitly says that no successful crawl is recorded.
2. **Upstream source check** comes only from the Wiki revision comparison.
   It shows changed/unchanged and check time. If no matching probe exists, it
   explicitly says `上游尚未检查`.

`当前状态` remains the live queue state. A successful historical attempt must
not turn an idle domain into `completed` or make it appear active.

## UI Changes

- Domain cards keep `当前状态` and `上次结果` as separate fields.
- Add a compact `最近数据` line containing the latest successful final count
  and completion age.
- Add a compact `上游检查` line containing the source revision state.
- The table uses the same derived labels so card and table views cannot
  disagree.
- The domain detail drawer receives the same values through the existing row
  model; no separate network request is introduced.

## Data Flow

1. `latestV2TerminalAttemptsByDomain` continues to resolve the newest terminal
   attempt for each domain.
2. A frontend pure helper derives the latest successful local-data label from
   terminal attempt status, result counts, and `completedAt`.
3. The existing source-freshness helper derives the upstream label, with an
   explicit missing-probe result.
4. `v2DomainRows` exposes both labels to the triage workbench.

No crawler, database, Redis, or backend API contract change is required.

## Error And Edge Cases

- Latest failure after an older success: current/error presentation still uses
  the failure, while `最近数据` uses the latest successful attempt when it is
  available in retained history.
- Missing counts: show completion time without inventing `0 / 0`.
- Missing completion time: show the final count and `完成时间未记录`.
- Missing source probe: show `上游尚未检查`, never `无变化`.
- Old epoch terminal rows remain excluded by the existing history selector.

## Validation

- Pure utility tests cover idle-after-success, missing count, failure after
  success, and missing upstream probe.
- Page contract tests prove cards and table expose both labels.
- Admin typecheck must pass.
- No crawler run, database write, or stack restart is required for unit and
  contract validation; runtime UI verification uses the existing completed
  `town_npc_maintenance` history.

## Out Of Scope

- Adding a new Wiki revision probe for `town_npc_maintenance`.
- Changing source-update scheduling or automation policy.
- Starting a crawl or applying data to a database.
- Replacing the V2 `idle` current-state contract.
