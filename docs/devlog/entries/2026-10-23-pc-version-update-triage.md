# Devlog: PC version update triage plan

## Status

`closed`

## Context

- User goal: add a PC-version-driven update worklist to the admin console. Keep it independent of ordinary source hash/fingerprint crawler triggers; show temporary candidate data; let a human mark mapped items handled; do not send notifications or trigger a domain for an unmapped bulletin.
- Branch: `feat/pc-version-update-triage`.
- Worktree: `/home/lolben/TerraPedia/.worktrees/pc-version-update-triage`.
- Base: `main@42ab9d1a7bcd939b2831bff20773e90383b78902` (`origin/main` at creation).
- Plan: `docs/superpowers/plans/2026-10-23-pc-version-update-triage.md`.
- Parent/child: no parent entry; plan and implementation remain one task in this branch.
- Session split: implementation is confined to this branch/worktree. The user continues the separate V2 automatic-ingestion discussion from `main` in another session. Keep code and devlog ownership separate; this task will not start/stop shared services or write shared databases.

## Direction / Decisions

- The probe will use PC release version pages as the only new-update trigger. Source revision/hash data may identify the announcement but will not trigger a new candidate.
- Probe cadence is six hours with an admin-only manual rerun. The schedule is separate from crawler auto-dispatch and only creates temporary candidates.
- The missing-state bootstrap baseline is pinned to the verified Desktop version `1.4.5.8`, so a newer release appearing before deployment is caught up rather than silently accepted as the baseline.
- Candidate handling is per bulletin and mapped target. Older pending candidates remain visible across new releases; an admin can mark a target handled or return it to pending. Unmapped/non-domain bullets remain visible as informational rows with no handling control or domain trigger.
- Probe serialization and candidate-state mutation use separate locks: one probe lock prevents scheduled/manual overlap, while a short state transaction lock protects report merge/cursor advance and manual status updates. Wiki network waits must not block admin acknowledgement.
- Candidate output is operational temporary state exposed on the existing crawler-monitor admin page. It is not a domain-data refresh and does not write formal DB tables.
- Unmapped changes stay visible for review but do not dispatch a domain. Existing crawler hash/fingerprint behavior remains unchanged and runs independently.
- No external notifications are in scope.

## Execution Ownership

- Coordinator: Codex; owns this entry, `docs/devlog/current.md`, plan updates, integration, and review.
- Implementer: `pc_release_parser_mapping`; first pass completed on the probe/mapping modules and tests. RED/GREEN was verified; coordinator review identified a material gap: the empty production rules left all rows informational with no handling control. No Wiki request, crawler, DB access, commit, or push occurred.
- Coordinator decision: extend Task 1 to load exact stable entity identity from tracked domain catalogs. Exact Wiki link matches may be mapped with an explicit `unspecified_by_release_note` impact-field state; unresolved/ambiguous targets remain informational. No guessed mapping rules are added. Audio stays unmapped until a maintained identity catalog exists.
- Review findings: quality review found link references/comments could create false mappings, full-title lowercasing was broader than MediaWiki first-letter case semantics, and current-version parsing accepted commented examples. These were reproduced with failing tests and fixed. A minor downstream candidate-identity risk from bullet reordering was fixed with content-derived bulletin IDs and added to Task 2 state-merge acceptance.
- Review disposition: Task 1 spec review passed with no blocking finding. The initial code-quality review's three Important findings and bulletin-ID risk were fixed and tested. Task 2-4 spec review found an Important symlink-path gap; regression tests reproduced it, the path guards were fixed, and spec re-review cleared the finding. Final code-quality review is pending.
- Follow-up implementation added `pc-version-update-identity-catalog.mjs`, backend temporary state/API, and the admin worklist panel. The report contract now includes `plannedReleaseVersions`; backend merge rejects a report whose fetched versions differ from that full list or fail to reach the current PC version.

## Current Progress

- Tasks 1-4 and Task 5 validation are complete. Integrated spec and code-quality reviews passed with no remaining code findings.
- The probe/state contract rejects partial release reports. A new regression test failed before the fix because a report omitting a planned version advanced the cursor; after adding `plannedReleaseVersions` comparison, the focused backend suite passed.
- Symlink regression tests failed before the fix: the monitor read external progress and launched with a symlinked `runs` directory. The backend now validates log/report/progress paths before launch and uses guarded reads for run reports, candidate state, and registered monitor progress.
- Read-only identity catalog load against the tracked datasets found `3,880` distinct Wiki-title keys. Seven maintained domain catalogs are available; Audio has no maintained identity catalog and its updates remain informational.

## Scope

- Implement the approved plan in `feat/pc-version-update-triage` at `/home/lolben/TerraPedia/.worktrees/pc-version-update-triage`.
- Planned surfaces: version probe, explicit mapping contract, monitor progress/API read/handling, and admin candidate panel.
- User authorized implementation and planned tests on 2026-10-23. That authorization covers fixture tests and one read-only PC version-page probe only; domain crawling, dispatch, import, formal DB writes, and shared service lifecycle operations remain out of scope.

## Validation

- `git status` and worktree registration verified: branch `feat/pc-version-update-triage` and worktree `/home/lolben/TerraPedia/.worktrees/pc-version-update-triage` both start at `main@42ab9d1a`.
- Existing service, route, and test paths cited by the plan were checked against the `main` worktree.
- `git diff --check` passed for tracked documentation changes; no whitespace diagnostics were emitted for the two new untracked Markdown files. Targeted consistency scan confirmed the plan records the branch/worktree, PC baseline, schedule, manual state, and crawler/data-write boundaries.
- Baseline regressions passed before implementation: `node --test pipelines/monitor/check-source-updates.test.mjs` (`14/14`) and `node --test pipelines/workflow/run-wiki-sync.test.mjs` (`14/14`).
- Branch `feat/pc-version-update-triage` was created from `main@42ab9d1a7bcd939b2831bff20773e90383b78902`; this closeout stages only files belonging to the feature.
- Fresh validation after the path-safety fix: probe/mapping/catalog fixture tests `42/42`; source-monitor and `run-wiki-sync` regressions `28/28`; backend `CrawlerMonitorServiceImplTest`, `AdminCrawlerMonitorControllerTest`, and `PcVersionUpdateStateStoreTest` `347/347`; admin typecheck passed and its panel/page tests passed `62/62`.
- The authorized live read-only probe report `reports/crawler-monitor/pc-version-update-triage/runs/task2-live-readonly.json` records Desktop `1.4.5.8`, current-version source revision `1032950`, history source revision `1023996`, and `releases=[]`. It fetched only the two version sources and did not request release detail pages.
- The local admin page responds with HTTP `302` to the login flow at `http://127.0.0.1:3030/operations/crawler-monitor`. No backend or shared local stack was started, so authenticated browser/API interaction was not exercised.
- Pre-commit checks: `git diff --check` passed; `git status` and `git diff --cached --stat` confirmed 22 staged feature files and no staged paths from the separate `main` worktree. No domain crawl, import, shared service lifecycle operation, or database write was performed.

## Result

- Implemented the PC version probe, catalog-backed conservative mapping, file-backed temporary candidate state, admin-only API, and separate admin panel in the dedicated branch/worktree.
- The separate `main` session remains the user's workspace for V2 automatic-ingestion discussion; its modified eight-domain plan is outside this staged commit and must remain intact.

## Residual Risks

- Audio has no maintained identity catalog, so Audio-related release notes remain visible as informational entries without a handling target.
- Identity catalogs are snapshots from 2026-03 through 2026-08. Exact linked-title matches are conservative identity evidence, not proof that the release note specifies a structured field change.
- Authenticated browser/API behavior was not exercised because the backend/shared stack was intentionally not started; API authorization and UI states are covered by focused tests.
- Registered monitor overview uses the same tested guarded progress reader as the candidate-state API; it has no separate overview-level symlink test.

## Follow-up

- No implementation follow-up remains. The user requested a local merge into `main`; no remote push was requested.

## Commits

- Commit SHA pending in final response.
