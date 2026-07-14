# Devlog: admin-notification-center-acceptance

## Status

`closed`

## Context

- User goal: accept the completed admin notification center against the real local stack, run the full admin gate, fix review findings, and create a focused local commit.
- Branch: `review/front-nuxt-visual`
- Worktree: `/home/lolben/TerraPedia`
- Base: notification implementation through `f0e70d4`.
- Related docs: `docs/superpowers/specs/2026-07-14-admin-notification-center-design.md`, `docs/superpowers/plans/2026-07-14-admin-notification-center.md`.
- Related prior entries: none.

## Direction / Decisions

- Chosen approach: validate the real admin UI with Chromium and the running backend, then self-review the implementation against all ten plan tasks before commit.
- Reasoning: unit tests could not prove dropdown interaction, persisted read state after both sources repoll, or destination-page deep links.
- Rejected options: treating prior mock-only evidence as acceptance; changing the backend; staging unrelated recipe graph work.
- Contract correction: the backend article endpoint has no review-status filter, persistedstate 3.x uses `paths` and Nuxt Cookie storage, and article notifications must link directly to the existing `/article-editor/:id` review workspace.

## Scope

- Frontend: correct the article notification destination route and its focused source test.
- Backend: none.
- Data: read-only use of existing article `#54` and crawler overview state.
- Docs/process: synchronize the design with verified implementation facts and record acceptance evidence.
- Out of scope: backend notification aggregation, cross-device read sync, adding more notification sources, merging or pushing the branch, and the unrelated recipe graph changes in the same worktree.

## Validation

- Focused RED: the article source test failed because it returned the list route instead of `/article-editor/12`.
- Focused GREEN: the article source test passed 5/5 after the route correction.
- Full admin gate: `pnpm run test` completed typecheck and passed 282/282 unit tests; a fresh production build completed successfully.
- Real Chromium acceptance: login succeeded; the bell showed three events (article `#54`, failed `biomes`, failed `recipes`); dropdown toggle, Escape, outside click, mark-all-read, and Cookie-backed read persistence after both sources repolled worked.
- Real destination acceptance: `biomes` opened its domain detail drawer; an unknown domain opened no drawer; article `#54` opened `/article-editor/54` and rendered the article review workspace.
- Runtime evidence: all notification, crawler overview, article detail, and review-log requests returned 200; browser console and page error collections were empty.
- Diff validation: `git diff --check` is required immediately before commit.
- Not run: cross-user reset with two real administrator accounts because the local fixture exposes only one administrator; reducer coverage for known-user switching passed in the 282-test suite.

## Result

- Completed: all ten implementation-plan tasks were re-audited; real browser acceptance and the full admin gate passed; one broken article notification destination was found and fixed test-first.
- Not completed: remote push, PR creation, merge, or unrelated graph acceptance.

## Residual Risks

- Article polling reads only the newest 100 articles, so an older pending article outside that window can be missed after the corpus grows beyond 100.
- Read state remains browser-local by design and is not synchronized across devices.
- Cross-user reset has automated coverage but was not repeated with a second real local administrator account.

## Follow-up

- Keep the local branch/worktree for the user's later merge or PR decision; no notification-center implementation follow-up is required.

## Commits

- `commit SHA pending in final response`.

## Optional: Cross-Review

- Reviewer: Codex local self-review; subagent review was unavailable because the active repository instructions prohibit delegation unless explicitly requested.
- Scope: notification implementation commits `512dee6..f0e70d4`, design, ten-task plan, real UI destinations, and final working diff.
- Findings: article notification pointed to a list query that no page consumed.
- Disposition: fixed.
- Re-review required: yes.
- Resolved by: direct notification link to the existing article review route plus RED/GREEN contract coverage and real Chromium acceptance.
- Arbitration decision: use real route ownership and runtime behavior over stale design examples.
- Decision owner: Codex.
- Rationale: `/article-editor/:id` already selects `ArticleReviewWorkspace` for pending articles; adding query handling to the list page would duplicate routing behavior.
- Remaining risks: only the explicitly recorded pagination and single-account acceptance limits.

## Closeout Checklist

- [x] Result recorded.
- [x] Validation recorded.
- [x] Residual risks recorded.
- [x] Follow-up is `none` or points to a new task.
- [x] All child entries are `closed`, or `blocked` with stop reason and parent follow-up.
- [x] Conflict status is none or resolved.
- [x] Cross-review findings are fixed and re-reviewed, rejected with reason, or deferred with owner and follow-up.
- [x] Producer/consumer contract acknowledgement is current, if applicable.
- [x] Cross-boundary validation is recorded. If blocked, status is `blocked` or intentionally stopped, not `ready-for-commit`.
- [x] Commit SHA, `commit SHA pending in final response`, or stop reason recorded.
- [x] `docs/devlog/current.md` updated.
