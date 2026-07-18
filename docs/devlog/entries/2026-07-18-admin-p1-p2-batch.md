# Devlog: Admin P1 + P2 audit follow-up batch

## Status

`active`

## Context

- User goal: Continue the reviewed admin/backend P1+P2 batch from the new main line, without taking code from the archived P0 branch.
- Branch: `fix/admin-p1-p2-batch`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/admin-p1-p2-batch`
- Base: local `main@218dfc0`; handoff base `2cbcf99` is its direct ancestor.
- Related docs: `docs/superpowers/plans/2026-07-17-admin-p1-p2-batch.md`; `docs/audits/2026-07-17-admin-backend-audit/scout-*.md`
- Related prior entries: `docs/devlog/entries/2026-07-17-admin-p0-security-batch.md`; archived branch entry `docs/devlog/entries/2026-07-17-admin-p0-fixes.md` is read-only handoff context.

## Direction / Decisions

- Chosen approach: Execute A2-D6 as 14 serialized tasks, each with focused TDD where behavior changes, a focused commit, specification review, and code-quality review.
- Reasoning: P0 B already covers A1 more strongly; the only commit after the handoff base changes an unrelated cutover script. The remaining plan is still applicable after symbol-level relocation on the current code.
- Rejected options: no continuation on `fix/admin-p0-batch`; no cherry-pick or code copy from that archive; no direct work on `main`; no database writes, data refresh, crawler execution, or service lifecycle changes.

## Scope

- Frontend: maintained admin app surfaces named by Tasks B1-B2 and C1-C5/D4/D6.
- Backend: authentication error normalization and Tasks D1-D5.
- Data: none; tracked/generated crawler or standardized outputs are out of scope.
- Docs/process: rebase the plan metadata and maintain this entry/current index.
- Out of scope: all plan exclusions, P0 reimplementation, archive-branch integration, crawler execution, database mutation, and unrelated current-main work.

## Validation

- Commands run: focused backend auth baseline; admin dependency install with frozen lockfile; admin typecheck; branch/base/ancestry checks; A2 focused and broad controller regressions; B1 crawler-monitor page contracts; B2 focused contracts and full admin unit suite; C1 icon/font contracts, typecheck, DOM inspection, and Playwright screenshots; C2 focused contracts, typecheck, diff check, and Chromium computed-box probes.
- Results: backend auth baseline 13 tests, zero failures/errors; admin typecheck passed; worktree clean at creation; `2cbcf99` confirmed as an ancestor of `218dfc0`. A2 observed the expected pre-fix 400-versus-401 red, then passed its focused 4/4 and broad article/user 130/130 runs; quality review additionally passed the 10 owning controller classes at 49/49. B1 observed the expected panel-root absence RED, then passed page contract 54/54, the four-file crawler-monitor bundle 140/140, and admin typecheck; the hardened review-fix contract independently passed 54/54. B2 observed the expected legacy-page absence RED, then passed NPC projection 19/19, approved stale-contract checks 16/16, typecheck, and the full admin unit suite 367/367; quality review independently passed focused contracts 35/35 and the same broad gates. C1 observed the expected font/icon contract RED, then passed focused 9/9, combined 16/16, and typecheck. Browser evidence measured a 24x24 Package and three 18x18 Folder/FileText icons with no structural emojis; screenshots show the icons crisp and non-tofu. C2's final specificity contract observed the expected 10/11 RED under the old `:where` selector and 11/11 GREEN after `fd3689e`; independent typecheck and 11/11 rerun passed. Browser probes at 1280/1130/1024/900/800/761/760 measured all six controls at computed/actual 44px with no document, command-bar, or toolbar overflow; specification and quality re-review reported no remaining findings.
- Not run: C3-D6 task-focused tests, broad final backend/admin gates, and final runtime smoke remain pending implementation.

## Result

- Completed: isolated worktree, current-main reconciliation, plan audit, A1 coverage verification, A2, B1, B2, C1, and C2 with specification, quality, and required runtime approval.
- Not completed: C3-D6 implementation, final gates, and closeout.

## Residual Risks

- Scout line numbers predate P0 B and must be relocated before every task.
- C2 runtime screenshots are stored in the ignored `reports/admin-p1-p2/c2-visual/` directory. Snap Chromium still does not rasterize CJK text reliably; exact DOM/computed-box measurements remain the acceptance source for this environment.
- Broad backend baseline has previously documented unrelated failures; final focused gates must prove no new failures.

## Follow-up

- Coordinator `/root` advances the serialized plan to C3 with a fresh implementer; implementation, specification review, and quality review remain sequential.

## Commits

- `9fd5260` — rebased plan and active traceability baseline.
- `cd800b0` — A2 missing-claims HTTP 401 implementation.
- `7b6d071` — representative null-user-id and wrong-type admin guard regression tests; quality re-review approved.
- `b8bee99` — removed the 32-symbol crawler-monitor panel-era dead chain.
- `c9afd60` — hardened the crawler-monitor dead-root absence contract after quality review.
- `4a3e38a` — removed the confirmed stations/town-NPC/audio dead surfaces and aligned their contracts.
- `7549fae` — added CJK/emoji fallbacks and Lucide brand/tree icons.
- `b825ecc` — added local table overflow, nowrap action columns, initial article toolbar shrinkability, and the focused C2 layout contract.
- `02ee0a7` — made the article command-bar outer tracks shrinkable after the coordinator reproduced a 1024px right-edge clip; its later control-readability finding was resolved by `635f5ba`.
- `6d66c8f` — recorded the first C2 quality-review blocker in the coordinator-owned plan and devlog.
- `635f5ba` — restored readable tiered article filter tracks and replaced the media regex with brace-bounded parsing.
- `fd3689e` — made the 44px toolbar control rule win the CSS cascade and added a specificity regression contract.

## Optional: Multi-Agent Coordination

- Coordinator: `/root`; sole writer of this entry and `docs/devlog/current.md`.
- Parallel work allowed: no implementation parallelism; tasks and review gates are serialized.
- Agent ownership:
  - Fresh per-task implementer:
    - Status: A2, B1, B2, C1, and C2 closed; C3 is the next fresh implementation assignment.
    - Task scope: exactly one full task copied from the rebased plan.
    - Allowed files: only that task's explicit file list and directly required focused tests.
    - Forbidden files: `docs/devlog/**`, the plan, data/generated artifacts, unrelated modules, and files owned by later tasks.
    - Dependencies: preceding plan tasks committed and reviewed; B2 precedes D6.
    - Validation: mandatory red-green-refactor for behavior changes plus the task's focused commands.
    - Blockers: report `NEEDS_CONTEXT` or `BLOCKED`; do not guess or broaden scope.
    - Handoff notes: commit only explicit task paths and report status, tests, files, self-review, and concerns.
    - Return format: subagent-driven-development implementer report.
  - Specification reviewer:
    - Status: pending after each implementation.
    - Task scope: compare actual diff/code against the exact task text.
    - Allowed files: read-only task diff and directly affected code/tests.
    - Forbidden files: all writes and implementation fixes.
    - Dependencies: implementer commit exists.
    - Validation: report exact missing/extra requirements with file and line references.
    - Blockers: open findings return to the same implementer or a scoped fix agent.
    - Handoff notes: approval is required before code-quality review.
    - Return format: spec compliant or explicit issues.
  - Code-quality reviewer:
    - Status: pending after specification approval.
    - Task scope: the single-task git range and requirements.
    - Allowed files: read-only task diff and relevant tests.
    - Forbidden files: all writes.
    - Dependencies: specification review approved.
    - Validation: production readiness, correctness, maintainability, security, and test quality.
    - Blockers: Critical/Important findings must be fixed and re-reviewed.
    - Handoff notes: no next task until approval.
    - Return format: strengths, severity-ranked issues, recommendations, merge-readiness assessment.
- Shared files or state: plan and devlog are coordinator-only; implementation agents are serialized in one worktree.
- Parent entry: this entry.
- Serialization rule: one implementation task at a time, followed by spec review and then quality review; no concurrent implementation agents.
- Result merge owner: `/root`.
- Cross-boundary validation: final focused backend gate, admin typecheck/unit suite, task contract tests, diff checks, and runtime screenshots where authorized.

## Optional: Cross-Review

- Reviewer: `/root/a2_spec_review` and `/root/a2_quality_review` for A2.
- Scope: A2 commit range `9fd5260..7b6d071`; remaining tasks one at a time, then final integrated range.
- Findings: A2 specification review passed. A2 quality review found one Important coverage gap in the distinct admin type and user null-id guards.
- Disposition: fixed by `7b6d071`; quality re-review independently passed the focused tests 10/10 and reported no remaining Critical, Important, or Minor issues.
- B1 review: specification review confirmed exact 32-symbol deletion and protected-chain preservation. Quality review found one Minor brittle/misplaced absence assertion; `c9afd60` moved it to the panel replacement contract and broadened it to whole-symbol checks. Quality re-review reported no remaining findings.
- B2 review: specification review confirmed the exact eight-file scope, live parent/workbench preservation, and two minimal stale-contract corrections. Quality review independently passed focused contracts 35/35, typecheck, and full unit 367/367 with no findings.
- C1 review: specification review confirmed the exact font stack, icon sizes/semantics, accessibility hiding, and four-file scope. Quality review found one non-blocking Minor that the source contract is more formatting-sensitive than necessary; deferred to `/root` for final batch test-contract cleanup. Runtime screenshots confirmed crisp Package/Folder/FileText rendering with measured 24px/18px bounds and no structural emoji.
- C2 review: specification review approved the complete `1eee05f..fd3689e` code range after separating the legitimate coordinator-only docs commit from the implementation allowlist; its initial scope-only `COMMIT BLOCKED` verdict was withdrawn on clarified re-review. The first quality review found unreadable zero-minimum filter tracks and a media-query regex that could cross braces; `635f5ba` repaired both. Runtime then exposed the later 38px base rule overriding the intended 44px rule; `fd3689e` added a higher-specificity selector and regression contract. Final quality re-review reported no Critical, Important, or Minor findings and approved progression to C3. The coordinator's fresh seven-viewport probe confirmed 44px actual controls and no overflow; all temporary ports were closed.
- Re-review required: no for A2; yes for any later Critical or Important finding.
- Resolved by: `/root/a2_implementer`; approved by `/root/a2_quality_review`.
- Arbitration decision: pending only if reviews disagree.
- Decision owner: `/root`.
- Rationale: two-stage review is required by the selected execution workflow.
- Remaining risks: the C1 source contract has a non-blocking formatting-sensitivity Minor. Snap Chromium did not rasterize CJK text despite correct DOM/font state and an accessible user YaHei font; this is recorded as a screenshot-environment limitation, while the task's icon non-tofu acceptance passed. Standalone admin dev also warned that the shared article-runtime CSS is outside its Vite allow list; login/categories evidence was unaffected and the temporary server was stopped.

### 2026-07-18 17:22

- Change: Rebased the execution contract from the archived P0 branch to `fix/admin-p1-p2-batch@218dfc0` and excluded A1 from new implementation.
- Reason: current main contains the stronger P0 B implementation; taking archive code would regress or duplicate it.
- Evidence: ancestry check, one-file base delta, 13/13 auth baseline, and passing admin typecheck.

### 2026-07-18 17:43

- Change: Recorded A2 quality review as open and assigned a focused tests-only fix.
- Reason: production behavior is correct, but duplicated user/admin guard variants lacked representative regression coverage.
- Evidence: specification review passed; 10 owning controller classes passed 49/49; targeted scan confirmed no existing null-user-id or wrong-type admin claims test.

### 2026-07-18 17:49

- Change: Closed the A2 review gate and advanced the serialized handoff to B1.
- Reason: the review-driven guard tests cover both missing variants and the original quality reviewer approved the fix.
- Evidence: focused fix tests 10/10, all owning controller tests 51/51, specification approval, and quality re-review with no remaining findings.

### 2026-07-18 18:15

- Change: Closed the B1 review gate and advanced the serialized handoff to B2.
- Reason: all 32 audited panel-era symbols are removed, protected chains remain, and the only test-quality Minor was fixed and re-reviewed.
- Evidence: expected RED, page contract 54/54, four-file crawler-monitor suite 140/140, admin typecheck, specification approval, and quality re-review with no remaining findings.

### 2026-07-18 18:40

- Change: Closed the B2 review gate and advanced the serialized handoff to C1.
- Reason: all confirmed dead surfaces and their stale contracts were removed without losing live routes or behavior, and both review stages approved the result.
- Evidence: expected absence RED, focused contracts 35/35, admin typecheck, full unit suite 367/367, specification approval, and quality review with no findings.

### 2026-07-18 19:21

- Change: Closed the C1 review/runtime gate and advanced the serialized handoff to C2.
- Reason: code/spec/quality gates passed and isolated browser evidence proved the brand/tree SVG icons render at the intended sizes without emoji/tofu dependence.
- Evidence: expected RED, focused 9/9, combined 16/16, admin typecheck, specification approval, quality approval, DOM font/icon measurements, ignored screenshots under `reports/admin-p1-p2/c1-visual/`, and confirmed admin port shutdown.

### 2026-07-18 20:19

- Change: Kept C2 active and recorded its quality-review repair instead of advancing to C3.
- Reason: runtime evidence proved right-edge overflow was removed, but quality review showed the zero-minimum article filter tracks make controls unreadably narrow at common intermediate viewports; the focused 760px contract also has a brace-scope weakness.
- Evidence: commits `b825ecc` and `02ee0a7`; specification re-approval; fresh typecheck and focused 9/9; browser measurements for query/items/users/NPC/condition-terms and article viewports 1280/1130/1024/900/800/760; quality verdict `Ready to proceed to C3? No`; all temporary ports closed.

### 2026-07-18 21:03

- Change: Closed the C2 review/runtime gate and advanced the serialized handoff to C3.
- Reason: readable tiered tracks, brace-bounded media parsing, and the final CSS-specificity repair cleared both review rounds and the runtime accessibility boundary.
- Evidence: commits `635f5ba` and `fd3689e`; expected 10/11 RED then 11/11 GREEN; independent typecheck and focused 11/11; computed/actual 44px controls with no overflow at 1280/1130/1024/900/800/761/760; specification approval; quality re-review with no findings; ports 3010/9223/18088 closed.
