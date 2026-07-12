# Crawler Monitor Idle And Queue Visibility Design

## Goal

Make the crawler monitor distinguish a healthy idle system from genuinely
unknown state, while keeping queue information visible and reachable even when
other domains require operator attention.

## Success Criteria

- A successfully loaded domain with no active queue item, progress record, or
  backend error displays as `空闲正常`, not `未知` or `需要处理`.
- Loading, unavailable, conflicting, and healthy-idle states remain distinct.
- Selecting all states does not manufacture unknown rows from an empty queue.
- Queue activity remains visible when attention rows exist.
- The KPI row exposes queue count, a concise explanation, and a direct jump to
  queue-related rows.
- Domain details continue to expose queue history and logs independently of the
  current attention filter.

## Scope

This change is limited to the maintained admin crawler monitor frontend:

- domain-row state interpretation;
- triage workbench metrics and filtering;
- KPI navigation and queue visibility;
- focused frontend contract tests.

It does not change the backend queue protocol, Redis state, crawler execution,
database data, or the approved V2 hard-cutover architecture.

## State Contract

The frontend must not use absence of current work as evidence of failure.

| Evidence | Display state | Attention |
| --- | --- | --- |
| Overview loaded, no active queue/progress/error | `空闲正常` | No |
| Active queue item | Queue status such as `排队等待` | Only for an explicit blocker or conflict |
| Active progress | `正在爬取` | No unless stale or conflicting |
| Request pending | `加载中` | No |
| Request failed or required response unavailable | `状态不可用` | Yes |
| Contradictory ownership/status evidence | Specific conflict/error state | Yes |

Backend `domain.state` remains authoritative when present. For the current V1
compatibility response, a missing `domain.state` is treated as healthy idle only
when there is also no active queue item, no active progress, and no explicit
domain error. This compatibility fallback must be removed when the V2 overview
contract always supplies an explicit state.

## Workbench And KPI Behavior

The KPI row contains a queue metric alongside domain, running, attention,
updated, and dispatch metrics. The queue card displays the number of active
queue rows and uses explanatory text such as `暂无排队任务` or
`点击查看排队与占用信息`.

Clicking the queue KPI changes the full domain area to table view, applies a
queue filter, and scrolls that section into view. The filter matches rows with
an active queue item, including queued, cooldown-blocked, starting, running, or
paused items.

When attention rows exist, the top focus area continues to show the most urgent
problems, but it also renders a compact queue/activity strip when active queue
or running rows exist. Attention diagnosis and queue visibility are parallel
signals; neither hides the other.

## Detail And Navigation Behavior

Queue KPI navigation never removes or mutates queue records. It only changes
the visible filter. Clicking a resulting row opens the existing domain detail
drawer, whose queue and log tabs remain available regardless of whether the row
also needs attention.

Empty queue navigation shows a clear empty message rather than unknown rows.
All interactive KPI cards retain button semantics, accessible labels, keyboard
activation, and visible focus behavior from the existing component.

## Error Handling

- Empty current work is normal and uses a success/neutral presentation.
- A failed overview request uses the page's request error path and must not be
  converted into healthy idle.
- A missing backend state with active or contradictory evidence remains an
  explicit state problem rather than being silently normalized.
- Historical terminal queue rows remain available in domain detail but do not
  count as active queue KPI rows or force a current unknown state.

## Tests

Focused frontend tests cover:

1. missing backend state plus no queue/progress maps to healthy idle;
2. missing backend state plus contradictory active evidence remains actionable;
3. all-state filtering retains the idle row without labeling it unknown;
4. the queue KPI reports active queue count and targets the queue filter;
5. queue/activity rows remain available while attention rows exist;
6. terminal queue history does not inflate the active queue KPI.

Validation uses the focused Node test file first, then the maintained admin
`pnpm run test` or `pnpm run check` command, followed by `git diff --check`.

## Rollback

The change is frontend-only and can be reverted by restoring the domain-row
fallback and triage metric/rendering changes. It creates no persistent runtime
or data migration state.
