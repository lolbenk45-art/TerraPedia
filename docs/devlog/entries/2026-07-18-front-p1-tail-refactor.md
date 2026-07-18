# Devlog: 前台 P1 残尾拆分

## Status

`closed`

## Context

- User goal: 继续 2026-07-18 交接中的 WP-1 第三刀与 WP-3 编辑器布局残尾。
- Branch: `refactor/front-p1-tail`
- Worktree: `/home/lolben/TerraPedia/.claude/worktrees/front-p1-tail`
- Base: `main` at `218dfc0`
- Related docs: `docs/plans/2026-07-17_front-pages-remediation-p0-p2-plan.md`; `docs/plans/2026-07-18_front-p1-tail-refactor.md`
- Related prior entries: none on main; continuation facts were supplied in the user handoff.

## Direction / Decisions

- Chosen approach: keep page data/behavior ownership; extract presentation components and contract sources; preserve editor page shell and form IDs.
- Reasoning: this closes the accepted P1 decomposition without changing API, data flow, or visuals and keeps existing layering contracts meaningful.
- Rejected options: direct development on main; moving editor `<main>`/`form` into the component; visual or CSS token redesign; armor aggregate endpoint work.

## Scope

- Frontend: armor detail skeleton/build/recipe presentation and user article form-internal layout.
- Backend: none.
- Data: none.
- Docs/process: focused execution plan, active devlog, contract source-list updates.
- Out of scope: WP-10, all P2 work, runtime service lifecycle, screenshots unless a visual discrepancy is discovered.

## Validation

- Commands run: baseline and final `cd front-nuxt && pnpm run check`; focused WP-1/WP-3 contracts, compiled-selector probes, owner-specific mutation checks, Nuxt typecheck, line thresholds, targeted source scans, and `git diff --check`.
- Results: the fresh final full check exited 0 on the closeout working tree; focused detail-layout, armor-stat, armor-build, public-page, user/editor, layering, and runtime contracts passed. The armor page is 658 lines and the article new/edit pages are 240/395 lines. The final WP-1 specification, quality, and integrated re-reviews reported no Critical, Important, or Minor findings. Existing Chromium/UPower, duplicate `formatEffectValue`, and Node deprecation warnings remain baseline noise.
- Mutation evidence: the old combined-source contract accepted removal of the loaded-page sticky rule; after the repair, a no-write actual-contract harness rejected the same mutation while Skeleton retained its separate sticky rule.
- Not run: representative runtime screenshot comparison; the final repair changes only contract code and removes three non-runtime template comments, while visual equivalence remains covered by preserved declarations, scoped-selector contracts, and the full frontend gate.

## Result

- Completed: WP-1 armor skeleton/build/recipe presentation extraction; WP-3 shared form-internal editor layout; page-owned data, API, submit/review/draft/upload behavior and stable editor shell/form IDs; owner-specific armor/editor contracts; final validation and review closeout.
- Not completed: WP-10 backend aggregation and all P2 work remain explicitly outside this task.

## Residual Risks

- A representative runtime screenshot comparison was not rerun. Contract/source ownership, compiled scoped selectors, preserved CSS declarations, and the full frontend gate provide the automated equivalence evidence.
- Existing duplicate auto-import, Chromium/UPower, and Node deprecation warnings remain unrelated baseline noise.

## Follow-up

- WP-10 and P2 continue as separate work; this task does not authorize backend, data, visual redesign, push, or merge work.

## Commits

- `fb6ef52` — extract armor detail presentation components.
- `cfb4821` — restore complete positive/negative contract coverage for extracted sources.
- `0c83e48` — share the user article editor form-internal layout.
- `c0d223b` — restore page/style/contract ownership boundaries after quality review.
- `4c8ff73` — align public-page armor assertions with extracted component ownership.
- Final source-ownership and devlog closeout commit SHA pending in final response.

## Optional: Multi-Agent Coordination

- Coordinator: `/root` (Codex); only coordinator edits devlog/current and integrates results.
- Parallel work allowed: no; tasks and reviews are serialized.
- Agent ownership:
  - WP-1 implementer/reviewers:
    - Status: complete; source-ownership repair passed serial specification, quality, and final integrated re-review.
    - Task scope: armor detail components, page, scoped styles, armor contracts.
    - Allowed files: the WP-1 file list in the execution plan.
    - Forbidden files: editor pages/components/contracts, devlog/current, backend/data.
    - Dependencies: main baseline and first two WP-1 knives already merged.
    - Validation: focused armor contracts, Nuxt typecheck, page line threshold.
    - Blockers: none.
    - Handoff notes: loaded-page, Skeleton, Matrix, Recipe, composable, and parser assertions now remain source-owned.
    - Return format: status, changed files, RED/GREEN evidence, concerns, commit.
  - WP-3 implementer/reviewers:
    - Status: complete at `0c83e48` + `c0d223b`; spec compliant and quality-approved after three Important findings were fixed.
    - Task scope: shared user article editor layout, two pages, user contracts.
    - Allowed files: the WP-3 file list in the execution plan, including the runtime contract and page-owned domain CSS discovered during review.
    - Forbidden files: armor files, devlog/current, backend/data.
    - Dependencies: WP-1 review complete; no code dependency.
    - Validation: focused user/editor contracts, Nuxt typecheck, page line thresholds.
    - Blockers: none known.
    - Handoff notes: page-level main/form markers remain in each page.
    - Return format: status, changed files, RED/GREEN evidence, concerns, commit.
- Shared files or state: no subagent may edit the plan or devlog; coordinator serializes commits and review disposition.
- Parent entry: this entry.
- Contract handoff:
  - Producer: each implementer.
  - Consumer: corresponding contract scripts and coordinator integration.
  - Endpoint/schema/state: no API/schema/state change; compatible source concatenation only.
  - Version/hash: base `218dfc0`; implementation commits through `4c8ff73`; final closeout SHA pending in final response.
  - Breaking or compatible: compatible refactor.
  - Fixtures/types updated: component props/types and contract source paths only.
  - Consumer acknowledgement: complete through focused mutation checks, Nuxt typecheck, and the final full frontend gate.
- Serialization rule: WP-1 implementation -> spec review -> quality review -> WP-3 implementation -> spec review -> quality review -> final integrated review.
- Result merge owner: coordinator.
- Cross-boundary validation: final `front-nuxt/pnpm run check`.

## Optional: Cross-Review

- Reviewer: per-package spec/quality reviewers and final integrated reviewer.
- Scope: requirements, behavior preservation, component boundaries, CSS ownership, contract coverage, and integrated range.
- Findings: all three WP-3 quality findings were resolved. The final integrated review then found one Important WP-1 blind spot: combined page/domain/Skeleton CSS allowed the Skeleton sticky rule to mask deletion of the loaded-page rule; three legacy page marker comments also sustained obsolete Matrix assertions.
- Disposition: resolved. Armor positives are grouped by page, page-domain CSS, Skeleton, Matrix, Recipe, composable, and parser owners; combined presentation is limited to global forbidden checks; the page mutation is rejected; legacy markers were removed in favor of real Matrix DOM.
- Re-review required: no. Serial WP-1 specification and quality re-reviews plus the final integrated re-review reported no remaining findings.
- Resolved by: WP-1 implementation owner, verified by independent spec, quality, and integrated reviewers.
- Arbitration decision: accept all three WP-3 quality findings, but use a typed writing-mode prop plus component-local modifier classes instead of the suggested partial-global ancestor selector.
- Decision owner: coordinator.
- Rationale: Vue 3.5 `compileStyle` reduces `:global(.parent) .child` to `.parent`, dropping the scoped target; local modifiers preserve encapsulation and the same visual state without relying on invalid selector output.
- Remaining risks: representative runtime screenshot comparison was not rerun; no API, backend, data, or service-lifecycle changes are present.

## Optional: State Changes

### 2026-07-18 17:23 CST

- Change: task continued from handoff on a new isolated branch and current-main baseline was verified.
- Reason: prior WP branches were already merged; direct main development is prohibited.
- Evidence: `pnpm run check` exited 0 before implementation.

### 2026-07-18 17:57 CST

- Change: WP-1 spec review rejected contract coverage and kept the task active.
- Reason: combined positive/negative checks did not cover every extracted source.
- Evidence: reviewer found one Important issue, no Critical or Minor issues; implementation behavior checks remained green.

### 2026-07-18 18:06 CST

- Change: WP-1 specification re-review passed after contract coverage repair.
- Reason: parser, page, extracted components, and domain CSS now participate in the appropriate positive/negative source checks.
- Evidence: reviewer reported no residual findings and allowed code-quality review.

### 2026-07-18 18:16 CST

- Change: WP-1 quality review passed; ownership moves serially to WP-3.
- Reason: no remaining review findings on the armor split.
- Evidence: reviewer reported zero Critical, Important, or Minor issues after fresh focused contracts and typecheck.

### 2026-07-18 18:31 CST

- Change: WP-3 scope adds `check-user-article-editor-runtime.mjs` for source-concatenation synchronization.
- Reason: the existing runtime contract reads page-only aside/reference/style markers and would become blind after a legitimate form-internal extraction.
- Evidence: implementer stopped before touching the file; coordinator selected the minimal contract repair and rejected duplicate page CSS/comment markers.

### 2026-07-18 18:52 CST

- Change: WP-3 implementation and specification review completed.
- Reason: shared form-internal layout preserves page-owned behavior and stable page shell/form contracts.
- Evidence: reviewer found zero Critical, Important, or Minor gaps after fresh user/editor contracts, selector compilation probes, and typecheck.

### 2026-07-18 19:03 CST

- Change: WP-3 remains active after quality review; scope adds a page-owned domain stylesheet and compiler-produced CSS contract coverage.
- Reason: fully global child CSS and raw-CSS runtime probes weakened encapsulation and regression detection; page behavior markers also need page-only ownership.
- Evidence: quality reviewer reported three Important findings, no Critical or Minor findings; `vue/compiler-sfc` is available through the installed `vue` package.

### 2026-07-18 19:33 CST

- Change: WP-3 quality fixes and re-review completed; task moves to integrated validation.
- Reason: all per-package findings are resolved.
- Evidence: reviewer reported zero residual Critical, Important, or Minor issues; focused user/editor contracts, compiled-selector mutation probes, and typecheck passed.

### 2026-07-18 19:36 CST

- Change: integrated `pnpm run check` failed at `check:public-pages`; WP-1 scope adds the public-page contract for a source-ownership repair.
- Reason: two presentation markers moved into armor child components while the public-page armor block remained page-only.
- Evidence: failure reproduced twice; both markers exist in their extracted components, and the page explicitly renders those components. The existing item-detail contract provides the component-owned marker pattern.

### 2026-07-18 19:42 CST

- Change: the integrated public-page contract was repaired and the full front gate passed from the beginning.
- Reason: page markers now assert component composition while component contracts own skeleton/build/recipe internals.
- Evidence: `4c8ff73`; public-page mutation rejected a broken recipe empty-state marker, then final `pnpm run check` exited 0.

### 2026-07-18 19:58 CST

- Change: final integrated review reopened WP-1 and blocked closeout on one Important contract blind spot.
- Reason: combined CSS sources allow Skeleton rules to substitute for loaded-page domain rules.
- Evidence: removing the page/domain desktop sticky rule still left `check-detail-layout-contract.mjs` green; reviewer requested owner-specific assertions and re-review.

### 2026-07-18 20:49 CST

- Change: the WP-1 blind spot was repaired, all review gates cleared, and the task closed for commit.
- Reason: positive assertions now follow their true source owners, the page-sticky mutation is rejected independently of Skeleton, and obsolete comment markers no longer satisfy Matrix contracts.
- Evidence: focused contracts, Nuxt typecheck, final `pnpm run check`, line thresholds, targeted scans, and `git diff --check` exited 0; specification, quality, and final integrated re-reviews reported zero findings.
