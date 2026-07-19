# Devlog: Admin P1 + P2 audit follow-up batch

## Status

`closed`

## Context

- User goal: Continue the reviewed admin/backend P1+P2 batch from the new main line, without taking code from the archived P0 branch.
- Branch: `fix/admin-p1-p2-batch`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/admin-p1-p2-batch`
- Base: local `main@218dfc0`; handoff base `2cbcf99` is its direct ancestor.
- Related docs: `docs/superpowers/plans/2026-07-17-admin-p1-p2-batch.md`; `docs/audits/2026-07-17-admin-backend-audit/scout-*.md`
- Related prior entries: `docs/devlog/entries/2026-07-17-admin-p0-security-batch.md`; archived branch entry `docs/devlog/entries/2026-07-17-admin-p0-fixes.md` is read-only handoff context.

## Direction / Decisions

- 2026-07-19 sidebar acceptance follow-up: on each fresh admin layout mount,
  collapse every menu group except the current route's group. After this initial
  setup, manual toggles are authoritative and route changes must not automatically
  expand or collapse groups. Dashboard, login, article, and sidebar styling are
  out of scope.

- 2026-07-19 user acceptance reopened the branch for two findings. Login styling must be restored exactly from `3a1d1780^` rather than redesigned; keep the later Lucide icon. Article `31` has complete stored HTML, so no data migration is allowed. Add an edit/public-effect switch that reuses `AdminArticleRuntimePreview` without serializing runtime graph DOM.

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

- 2026-07-19 sidebar follow-up: focused contracts observed the intended 5/20
  RED against the old persistence/route-expansion behavior, then passed 20/20;
  the adjacent Chinese-copy contract was updated from the obsolete initializer
  and the combined sidebar suite passed 27/27. Admin typecheck passed and the
  full unit suite passed 402/402. Read-only Chromium acceptance proved a fresh
  `/` opens only `资料目录`, a fresh `/articles` opens only `内容运营`, manually
  opening `制作管理` leaves both groups open after client navigation to `/users`,
  every toggle reports the matching `aria-expanded`, and there are no console
  errors or target request failures. Dashboard, login, and article editor diffs
  are zero. `ui-ux-pro-max` recommendations were read, but its optional search
  script could not run because this checkout installs `scripts`/`data` as files
  rather than directories; no project dependency or code path is affected.

- 2026-07-19 acceptance follow-up: both focused contracts observed the intended RED before implementation, then passed 36/36. Fresh closeout reruns passed the same 36/36 contracts, Admin typecheck, the full 401/401 unit suite, and the production build. Read-only Chromium acceptance at 1280x900 confirmed the login computed styles match `3a1d1780^`, article `31` renders two shared recipe graphs and four content references in the new public-effect view, switching views emits zero editor input events, and no save/review request occurs. Ports `13010`, `15183`, and `18197` are listening; the login, article editor, public frontend, and article API probes return HTTP 200. Ignored evidence: `reports/admin-p1-p2/acceptance-followup/`.

- Commands run: focused backend auth baseline; admin dependency install with frozen lockfile; admin typecheck; branch/base/ancestry checks; A2 focused and broad controller regressions; B1 crawler-monitor page contracts; B2 focused contracts and full admin unit suite; C1 icon/font contracts, typecheck, DOM inspection, and Playwright screenshots; C2 focused contracts, typecheck, diff check, and Chromium computed-box probes.
- Results: backend auth baseline 13 tests, zero failures/errors; admin typecheck passed; worktree clean at creation; `2cbcf99` confirmed as an ancestor of `218dfc0`. A2 observed the expected pre-fix 400-versus-401 red, then passed its focused 4/4 and broad article/user 130/130 runs; quality review additionally passed the 10 owning controller classes at 49/49. B1 observed the expected panel-root absence RED, then passed page contract 54/54, the four-file crawler-monitor bundle 140/140, and admin typecheck; the hardened review-fix contract independently passed 54/54. B2 observed the expected legacy-page absence RED, then passed NPC projection 19/19, approved stale-contract checks 16/16, typecheck, and the full admin unit suite 367/367; quality review independently passed focused contracts 35/35 and the same broad gates. C1 observed the expected font/icon contract RED, then passed focused 9/9, combined 16/16, and typecheck. Browser evidence measured a 24x24 Package and three 18x18 Folder/FileText icons with no structural emojis; screenshots show the icons crisp and non-tofu. C2's final specificity contract observed the expected 10/11 RED under the old `:where` selector and 11/11 GREEN after `fd3689e`; independent typecheck and 11/11 rerun passed. Browser probes at 1280/1130/1024/900/800/761/760 measured all six controls at computed/actual 44px with no document, command-bar, or toolbar overflow; specification and quality re-review reported no remaining findings.
- C3 initial implementation observed the expected focused 5/8 RED, then passed focused 8/8, admin typecheck, and specification review. Quality review found one Important transactional pagination failure and a related static-test weakness. The repair observed 6/13 RED then 13/13 GREEN, executes the actual aggregation/load/handler functions, and proves deferred commit, failed-target retry, 2→1/zero-result clamping, and waiting-state preservation. Final specification and quality re-review reported no findings.
- C4 initial implementation observed the expected focused 9/12 RED, then passed focused 12/12, combined 19/19, admin typecheck, diff check, specification review, and light/dark runtime geometry checks. Quality review found three Important accessibility/semantic issues and one related test-quality Minor. The repair observed effective 11/14 RED then 14/14 GREEN and final combined 21/21; independent WCAG checks measured at least 5.30:1 for login text, 5.54:1 for semantic tags, and 6.40:1 for submit endpoints. Fresh specification and quality re-review reported no blocking findings.
- C5 observed audio 7/10 RED then 10/10 GREEN and items 11/13 RED then 13/13 GREEN; initial focused 23/23, admin typecheck, diff check, and specification review passed. Quality review found submission/stale-edit races and a source-only whitelist test. The first repair observed 13/15 RED then 15/15 GREEN and combined 25/25; the second observed 15/18 RED then 18/18 GREEN and combined 28/28, preserving default store callers while blocking strict edit failures. Final fresh specification and quality reviews report no findings.
- D1 initial implementation observed the expected missing-class RED, then focused 5/5 GREEN, seven successful compile checkpoints, and 35-owner structural scans. Specification review found five former `isBlank`/`hasText` variants are not equivalent for Unicode-only whitespace and seven `firstNonBlank` bodies were textually modified; repair and re-review remain pending.
- D1 repair observed four expected missing-method RED compile errors, then focused 10/10 GREEN and normal-JVM compilation success. It preserves 24 Unicode-blank calls in five owners and restores seven firstNonBlank bodies byte-for-byte; final fresh specification and quality reviews report no findings.
- Merge closeout reran the complete Admin gate successfully: typecheck, 402/402
  unit tests, and production build. Backend `mvn -DskipTests test-compile`
  completed with `BUILD SUCCESS`.

## Result

- Sidebar follow-up complete: each fresh admin layout mount resets section state
  to only the current route's owning group, while all later manual toggles remain
  authoritative across client-side navigation. Section expansion is no longer
  persisted across refreshes; desktop sidebar width preference remains persisted.
  See git for code-level diff details.

- Acceptance follow-up complete: restored the Git-authoritative pre-token-migration login visual treatment while retaining the Lucide package icon. Article `31` required no data update; the editor now exposes a clean `编辑` / `前台效果` switch backed by the existing shared admin runtime preview, with the editable DOM kept as the sole save source.

- Completed: isolated worktree, current-main reconciliation, plan audit, A1 coverage verification, A2, B1, B2, C1, and C2 with specification, quality, and required runtime approval.
- Completed: C3 token repair and transactional shared pagination with specification and quality approval.
- Completed: C4 accessible token migration, semantic KPI gradients, global categories control delegation, and executable light/dark contrast contract with specification and quality approval.
- Completed: C5 exact audio status/cookie/URL reuse, items whitelist/transforms, request identity/submission safety, failure-aware recipe loads, and executable production-handler/store coverage with final specification and quality approval.
- Completed: D1 35-owner trimToNull consolidation, Unicode-blank preservation, firstNonBlank source preservation, and focused utility coverage with final specification and quality approval.
- Completed: D2 eight-controller trusted-proxy resolver migration, direct-constructor test adaptation, exact IP propagation contracts, and routed-request identity coverage with final specification and quality approval.
- Completed: D3 category-management error status propagation with focused 404/400/500 MockMvc coverage and final specification and quality approval.
- Completed: D4 reviewStatus filtering with blank-as-no-filter semantics and admin comment-count N+1 removal with final specification and quality approval.
- Completed: D5 NPC shop-entry conditions cascade coverage with final specification and quality approval.
- Completed: D6 admin formatting/status/CSS consolidation and rule-bounded CSS contracts with final specification and quality approval.
- Completed: authenticated 1280px runtime screenshots for login/query/items/users/categories/classification-audit, stable-state console/network checks, and local stack shutdown.

## Residual Risks

- Scout line numbers predate P0 B and must be relocated before every task.
- C2 runtime screenshots are stored in the ignored `reports/admin-p1-p2/c2-visual/` directory. Snap Chromium still does not rasterize CJK text reliably; exact DOM/computed-box measurements remain the acceptance source for this environment.
- Broad backend baseline has previously documented unrelated failures; final focused gates must prove no new failures.
- Shared `AppPagination` still has an existing 38px control-height and missing `aria-current` accessibility Minor. It is outside C3's two-file scope and should be handled in a separate component task.
- C4's focused CSS evaluator supports the current repository hex/rgb/rgba/`var()`/sRGB `color-mix()` subset. It can miss a future cross-semantic KPI mix, decorative page-layer contrast change, or unsupported CSS color syntax; current production expressions were independently checked and remain above 4.5:1.
- C5's source-execution harness is intentionally scoped to the current SFC/store function syntax; future syntax changes may require adapting the extractor. Current store/page bodies and all relevant async orders execute in the 28-test focused suite.
- D1's shared helper has a deliberate split: Object `trimToNull` preserves non-ASCII whitespace, while the Unicode-blank variant is limited to the five original `isBlank`/`hasText` owners. The broad backend suite has the same two baseline failures on main and D1: audio stream byte content under broad ordering and Wiki recipe Mockito unnecessary stubbing.

## Follow-up

- User authorized local integration into `main`. No implementation or acceptance
  follow-up remains. Merge, push, and worktree cleanup remain separate actions;
  this closeout performs only the authorized local merge. Commit SHA pending in
  final response.

## Commits

- `0f906c9a` — completed sidebar implementation-plan evidence after runtime acceptance.
- `64b45947` — initialized only the entry route's sidebar section and preserved later manual toggles.
- `21d15da6` — defined the approved sidebar initial-expansion behavior.
- `8485aed8` — restored the Git-authoritative login style and added the article public-effect preview.
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
- `4abfd63` — recorded C2 approval and advanced the serialized handoff to C3.
- `c20d7b2` — repaired seven classification-audit tokens and added the initial shared five-section pager; its quality finding was resolved by `dcf214c`.
- `1457ea3` — recorded the C3 transactional pagination review blocker in the coordinator-owned plan and devlog.
- `dcf214c` — made classification-audit page/data commits transactional and added executable retry/clamp behavior coverage.
- `3a1d178` — initial C4 hardcoded-color migration; specification-approved but quality-blocked pending contrast/semantic repair.
- `3a8551c` — recorded the C4 contrast/semantic quality-review blocker.
- `06d655b` — restored accessible token contrast, semantic KPI endpoints, and executable light/dark color contracts.
- `630ddb5` — implemented C5 cookie/URL reuse, exact audio status tokens, and the items form whitelist; specification-approved but quality-blocked pending recipe-race and executable-test repair.
- `4e3957e` — recorded the first C5 quality-review blocker.
- `02df27b` — guarded pending/stale edit recipe loading and added executable handler behavior coverage; its remaining failure-path finding is pending repair.
- `6d09f62` — recorded the remaining C5 recipe-failure blocker.
- `2e101c9` — preserved recipes after strict edit-load failure while retaining default caller compatibility; final reviews approved.
- `a801455` — initial 35-owner AdminTextUtils consolidation; specification-blocked pending semantic and source-preservation repair.
- `93990ab` — recorded the D1 specification blocker.
- `d2a8782` — preserved Unicode blank semantics and firstNonBlank source bodies; final reviews approved.
- `4ab211e7` — replaced eight naive controller IP parsers with trusted-proxy resolver injection; specification-approved, quality-blocked on seven test propagation assertions.
- `7d6457fc` — asserted seven exact resolver-IP propagation paths; repair specification-blocked until resolver invocations use the actual routed request.
- `c86ddcd1` — constrained seven resolver tests to unique routed request URI/header identity; final reviews approved.
- `c13ce117` — surfaced category-management error HTTP statuses with focused 404/400/500 coverage; final reviews approved.
- `c7835ee7` — added optional article reviewStatus filtering and removed comment-count N+1; final reviews approved.
- `8c5feff9` — covered NPC shop-entry conditions cascade writes; final reviews approved.
- `513ab4db` — consolidated admin formatting, status tones, and coin styles; specification-approved, quality Minor pending test repair.
- `fda1484c` — bounded CSS property contracts to individual rules; final quality review approved.

## Optional: Multi-Agent Coordination

- Coordinator: `/root`; sole writer of this entry and `docs/devlog/current.md`.
- Parallel work allowed: no implementation parallelism; tasks and review gates are serialized.
- Agent ownership:
  - Fresh per-task implementer:
    - Status: A2, B1, B2, C1, C2, C3, C4, C5, D1, D2, D3, and D4 closed; D5 is the next fresh implementation assignment.
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
- C3 review: specification review approved `4abfd63..c20d7b2`. Quality review found one Important: `handlePageChange` committed `page` before the request, suppressing failed-target retry and allowing contraction to hide the pager on an out-of-range page. It also found the source-only contract did not execute aggregation or async transitions. `dcf214c` changed `loadAudit(targetPage)` to commit data/page only after a final valid response and to re-fetch a clamped page after contraction or zero results; executable tests cover `[2,2]` retry, `[2,1]` clamp, and preservation during the second pending request. Replacement specification and quality reviewers approved `4abfd63..dcf214c` with no Critical, Important, or Minor findings and allowed C4 progression. Existing AppPagination 38px/ARIA limitations remain a non-blocking shared-component follow-up outside C3 scope.
- C4 review: specification review approved `45c5069..3a1d178` with exact preservation of violet/fuchsia/rose/orange/cyan and no out-of-scope token-layer edits. Quality review found three Important issues: semantic tag and login text/button pairs fall below 4.5:1 in one or both themes, info/warning KPI gradients use unrelated primary endpoints, and the contract does not enforce those semantic/contrast boundaries. The related Minor notes exact single-line CSS assertions are formatting-brittle. Disposition: verified against current token values, kept C4 active, assigned repair to the original implementer, and required fresh spec then quality re-review.
- C4 repair review: fresh specification review approved both implementation ranges while excluding the coordinator-only `3a8551c` docs commit. Fresh quality review independently verified the test color cascade/compositing/luminance math and the production CSS, reported no Critical or Important findings, and allowed C5 progression. Three non-blocking evaluator boundaries remain: the KPI domain assertion excludes primary but is not a general semantic purity proof; login tests do not model decorative page layers; and the helper intentionally parses only the current CSS color subset.
- C5 review: specification review approved `cf42f99..630ddb5`. Quality review found two Important items findings: the writable modal permits save before recipes resolve and late A/B requests can cross identities; the whitelist contract only inspects source and can miss removed reset or post-loop metadata writes. Coordinator arbitration: although the async window predates C5, the required new reset makes the empty-recipe submission path directly relevant, so accept a minimal safety repair without modal refactoring. `02df27b` then added dual submission gates, request identity, and production-handler execution. Fresh specification review approved it; quality re-review confirmed both original findings resolved, but found the same destructive chain remains after a caught fetch error because the store returns `[]`. Disposition: accept a minimal failure-aware store option for this edit caller while preserving all other callers' defaults. Minor follow-ups are shared audio token parsing, stronger whitelist exhaustiveness, and the uncovered stale-A-first test order.
- C5 final review: `2e101c9` added an overloaded strict null-on-error store option used only by item edit, failure state gates, executable default/strict store failure behavior, legal empty success, stale-A-first/current-B-pending, and failed-submit coverage. Fresh specification review approved all three code ranges and caller compatibility. Final fresh quality review confirmed the original two Important findings and the later failure-path Important are resolved, reported no Critical/Important/Minor findings, and allowed D1 progression.
- D1 review: specification review verified the 37-path/35-owner scope, local-definition removal, imports, method references, focused utility test, and unchanged firstNonBlank counts, but found a semantic audit error: five originals rely on Unicode-aware blank detection before ASCII trim. It also found seven firstNonBlank bodies changed only by qualification, violating the explicit no-change boundary. Coordinator verified the five baseline bodies and accepted the minimal repair: a separate Unicode-blank utility variant for only those five owners plus static imports that restore the seven original firstNonBlank bodies. Fresh spec then quality re-review is required.
- D1 final review: `d2a8782` added a Unicode-blank helper used by exactly 24 calls in the five original Unicode-aware owners and restored all seven firstNonBlank bodies byte-identically through static import. Fresh specification review found no issues. Final quality review confirmed both initial blockers resolved, all 35 local definitions removed, method-reference compatibility, focused 10/10, normal compilation, and main-reproduced broad baselines; it reported no Critical/Important/Minor findings and allowed D2 progression.
- D2 review: specification review approved `4ab211e7` for the exact eight-controller/eight-test scope, resolver injection, removal of naive parsers, request propagation, and no policy changes. Quality review found one Important coverage gap: seven tests mock a fixed resolver IP but verify downstream calls with `anyString()`, so they do not prove trusted resolver output reaches the audit/service boundary. `7d6457fc` added exact fixed-IP and resolver-invocation assertions, with a seven-call wrong-IP mutation producing 7 failures across 38 tests before restoration. Fresh repair specification review found an Important remaining gap: all seven invocation checks use `resolve(any())`, which does not prove the actual routed request is supplied. `c86ddcd1` replaced them with non-null URI-plus-unique-header `argThat` matchers; a wrong UserFavorite identity header produced the expected resolver-matcher failure before restoration. Final fresh specification and quality reviews reported no Critical/Important/Minor findings and approved D3. Coordinator reran `mvn -Dtest='*Article*,*User*,*Auth*' test` (151/151) and `mvn -DskipTests compile` (BUILD SUCCESS) on the final range.
- D3 review: specification review confirmed the exact six catch removals, the new bare-null `ResourceNotFoundException` path, global 404 mapping, and standalone MockMvc 404/400/500 coverage. Final quality review found no Critical/Important/Minor issue: specific handlers are not shadowed, the 500 body remains sanitized, and scope is limited to controller/handler/exception/test. Coordinator reran the focused MockMvc suite 3/3, compilation, and diff check successfully; D4 may proceed.
- D4 review: specification review confirmed allow-null reviewStatus normalization, parameterized mapper condition, unchanged commentCount SQL, and removed N+1 surfaces. Final quality review found no Critical/Important/Minor issue: sort/pagination and response shape remain intact, invalid values retain HTTP 400, and actual comment workflows remain. Coordinator reran backend 62/62, admin typecheck, three front contracts 33/33, and diff check; D5 may proceed.
- D6 review: specification review approved the exact six/two/two consolidation scope and protected 2-digit variants. Quality review found one Minor: CSS contract regexes can cross rule boundaries via greedy `[\s\S]*`; production behavior is correct. Disposition: repair tests with rule-bounded matching and run fresh quality re-review.
- D6 final review: `fda1484c` bounds all six CSS assertions to their rule bodies; mutation evidence proved property loss fails. Fresh quality review found no remaining issues. Coordinator reran admin typecheck and 400/400 unit tests. The backend final gate ran 305 tests and reproduced only the two D1/main baselines: audio stream bytes and Wiki Mockito unnecessary stubbing.

### 2026-07-19 16:33

- Change: Closed the A2-D6 batch after authenticated runtime acceptance.
- Reason: all implementation/review gates are complete, six required pages render without horizontal overflow or header/main overlap, and stable-state browser probes report no console errors or failed requests.
- Evidence: screenshots and metrics under ignored `reports/admin-p1-p2/final-visual/`; login/query/items/users/categories/classification-audit HTTP 200 at 1280x900; admin 400/400 plus typecheck; backend 305 with only two main-reproduced baselines; target stack ports 18197/15183/13010 stopped. Closeout commit: `9c28a6d4`.
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

### 2026-07-18 21:31

- Change: Kept C3 active and recorded its quality-review repair instead of advancing to C4.
- Reason: request-first page state is not transactional, making failed targets unretryable from the pager and allowing a page-count contraction to hide navigation on an out-of-range empty page.
- Evidence: commit `c20d7b2`; expected focused 5/8 RED then 8/8 GREEN; independent typecheck and focused 8/8; specification approval; quality verdict `Ready to proceed to C4? No`; Important finding assigned to the original implementer with behavior-test and re-review requirements.

### 2026-07-18 22:04

- Change: Closed the C3 review gate and advanced the serialized handoff to C4.
- Reason: transactional page/data commit, failed-target retry, and contraction/zero-result clamp now have executable behavior evidence and both review stages approved the final range.
- Evidence: commits `c20d7b2` and `dcf214c`; initial 5/8 RED→8/8 GREEN; repair 6/13 RED→13/13 GREEN; independent typecheck and focused 13/13; replacement specification approval; final quality review with no findings and `Ready to proceed to C4? Yes`.

### 2026-07-18 22:30

- Change: Kept C4 active and recorded its quality-review repair instead of advancing to C5.
- Reason: initial token migration preserves scope and layout, but current foreground/background combinations fail normal-text contrast in light/dark themes, two KPI gradients cross semantic color domains, and the focused contract does not detect these regressions.
- Evidence: commit `3a1d178`; expected focused 9/12 RED→12/12 GREEN; combined 19/19; admin typecheck; light/dark runtime geometry; specification approval; quality verdict `Ready to proceed to C5? No`; findings verified against current light/dark token definitions.

### 2026-07-18 22:52

- Change: Closed the C4 review gate and advanced the serialized handoff to C5.
- Reason: the repair restores accessible light/dark contrast, semantic KPI endpoints, and executable coverage without changing shared tokens or the protected data palette; both fresh review stages approved progression.
- Evidence: commit `06d655b`; effective focused 11/14 RED→14/14 GREEN; combined 21/21; admin typecheck; diff check; independent contrast minima 5.30/5.54/6.40; fresh specification approval; fresh quality review with no Critical/Important findings and `Ready to proceed to C5? Yes`.

### 2026-07-18 23:16

- Change: Kept C5 active and recorded its quality-review repair instead of advancing to D1.
- Reason: the new reset-backed whitelist needs submission and stale-request safety while recipes load, and its source-only test does not prove missing-field reset, metadata exclusion, non-aliasing, or transforms through the actual handler.
- Evidence: commit `630ddb5`; audio 7/10 RED→10/10 GREEN; items 11/13 RED→13/13 GREEN; combined 23/23; admin typecheck; specification approval; quality verdict `Ready to proceed to D1? No`; baseline inspection confirmed the async window predates C5 but the empty reset state is newly relevant.

### 2026-07-18 23:36

- Change: Kept C5 active after its first repair and recorded the remaining recipe-fetch failure path.
- Reason: pending and stale-request safety now works, but a caught API error is still indistinguishable from a legitimate empty recipe response and can unlock destructive empty submission.
- Evidence: commit `02df27b`; repair 13/15 RED→15/15 GREEN; combined 25/25; admin typecheck; fresh specification approval; quality re-review confirmed the two original findings resolved and returned `Ready to proceed to D1? No` only for the failure-path ambiguity.

### 2026-07-18 23:53

- Change: Closed the C5 review gate and advanced the serialized handoff to D1.
- Reason: strict edit-load failure is now distinguishable from legal empty recipes, all pending/stale/failure paths remain write-safe, and final fresh reviews found no remaining issues.
- Evidence: commit `2e101c9`; final repair 15/18 RED→18/18 GREEN; combined 28/28; admin typecheck; diff checks; final fresh specification approval; final quality review with no Critical/Important/Minor findings and `Ready to proceed to D1? Yes`.

### 2026-07-19 00:21

- Change: Kept D1 active and recorded its specification-review repair instead of advancing to D2.
- Reason: five copied helpers treat Unicode-only whitespace as blank while the shared Object helper preserves it, and seven firstNonBlank bodies must remain textually untouched.
- Evidence: commit `a801455`; focused 5/5; seven compile checkpoints; main baseline broad rerun reproduced D1's same audio-stream and Wiki Mockito failures; specification verdict `Not ready for quality review`.

### 2026-07-19 00:39

- Change: Closed the D1 review gate and advanced the serialized handoff to D2.
- Reason: the repair restores the five Unicode-aware helper semantics and seven firstNonBlank source bodies without changing the 30-owner Object contract; fresh reviews found no remaining issues.
- Evidence: commit `d2a8782`; four-error RED→focused 10/10 GREEN; normal compilation; local definitions 0; Unicode calls 24; fresh specification approval; final quality review with no Critical/Important/Minor findings and `Ready to proceed to D2? Yes`.

### 2026-07-19 00:54

- Change: Kept D2 active and assigned a tests-only quality repair instead of advancing to D3.
- Reason: seven mocks accept `anyString()` downstream, so the new trusted-proxy resolver result is not behavior-proven at those service/audit boundaries.
- Evidence: commit `4ab211e7`; expected constructor RED; owning 41/41 GREEN; coordinator rerun 150/150 and compilation success; fresh specification approval; quality verdict `Ready to proceed to D3? No` pending seven exact resolver-result assertions.

### 2026-07-19 01:02

- Change: Kept D2 active after its tests-only repair and assigned a narrower assertion repair.
- Reason: `7d6457fc` proves fixed IP propagation but verifies `ClientIpResolver.resolve(any())`, so request identity at the resolver boundary remains unproven.
- Evidence: expected seven-call mutation RED (38 tests, 7 failures) then final 42 owning/151 broad GREEN and compilation; fresh repair specification verdict `Ready for quality review? No` pending actual-request matchers in all seven tests.

### 2026-07-19 01:12

- Change: Closed the D2 review gate and advanced the serialized handoff to D3.
- Reason: final request-identity tests now prove the exact routed request reaches the resolver as well as exact trusted IP propagation to each downstream service/audit boundary.
- Evidence: commit `c86ddcd1`; intentional wrong-header RED at the resolver matcher, then final 38 focused/42 owning/151 broad GREEN, compilation success, final specification approval, final quality approval with no Critical/Important/Minor findings, and coordinator final rerun 151/151 plus compilation.

### 2026-07-19 01:20

- Change: Closed the D3 review gate and advanced the serialized handoff to D4.
- Reason: the controller now lets category errors reach exact global 404/400/500 semantics instead of encoding failures in HTTP 200 envelopes.
- Evidence: commit `c13ce117`; expected 404/400 RED from HTTP 200, final MockMvc 3/3 GREEN, compilation success, final specification approval, final quality approval with no Critical/Important/Minor findings, and coordinator rerun of focused tests/compile/diff check.
