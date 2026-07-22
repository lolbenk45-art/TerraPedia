# Devlog: Light Theme Button System

## Status

`active`

## Context

- User goal: replace the rejected heavy light-theme button options with the
  approved cool-gray Mist Workbench and beige Linen Paper systems, then adapt
  the production public frontend.
- Branch: `feat/front-p2-integration`.
- Worktree: `/home/lolben/TerraPedia/.claude/worktrees/front-p2-integration`.
- Base: `8eb17348`.
- Related docs:
  `docs/superpowers/specs/2026-07-22-light-theme-button-system-design.md`.
- Related prior entries:
  `docs/devlog/entries/2026-07-22-front-p2-local-integration.md`.

## Direction / Decisions

- Chosen approach: flat low-saturation semantic button tokens with dark text,
  shallow state changes, and a small inset primary marker.
- Reasoning: the user rejected gradients, saturated fills, large shadows, and
  the visual weight of a solid primary button; two revised browser mockups were
  accepted.
- Rejected options: editorial ink-line, translucent glass, layered tool panels,
  all six original Paper/Slate variants, and a solid blue-gray primary fill.
- Corrected ownership: light controls resolve to no elevation through
  `tokens.css` (`--tp-shadow-control: none`), while every legacy
  `--button-control-shadow` declaration remains the WP-11 compatibility alias
  `var(--tp-shadow-control)` in `hifi-preview.css`.

## Scope

- Frontend: two light-theme token mappings, shared consumers, focused
  contracts, prototype replacement, and browser acceptance.
- Backend: none.
- Data: none.
- Docs/process: approved design, implementation plan, validation evidence, and
  task handoff.
- Out of scope: dark-theme redesign, page layout, typography, backend, data,
  crawler, push, and cleanup.

## Validation

- Commands run: `git diff --check`, placeholder scan, and targeted theme,
  path, scope, accessibility, and runtime-theme consistency scans.
- Results: documentation checks passed; the spec has no placeholders and
  names both approved themes, all three CSS ownership layers, the 44px target,
  and the dark-theme preservation boundary.
- RED contract: `cd front-nuxt && pnpm run check:light-button-tokens` exited 1
  intentionally. The script read `assets/css/hifi-preview.css`, parsed both
  exact standalone theme blocks, and reported all 24 expected-declaration
  mismatches for each theme. Its explicit invariant failures were the three
  gradient surfaces and the primary, secondary, and active-control external
  shadows in each theme, plus missing `--button-primary-marker`,
  `--button-focus-ring`, `inset 3px 0 0 var(--button-primary-marker)`, and
  `outline: 3px solid var(--button-focus-ring);` shared markers. This was a
  behavioral RED, not a syntax or missing-file failure.
- Hardened RED: parser fixtures first reproduced failures for duplicate
  declarations, selector-leading comments, and quoted delimiters; the
  multiline-value fixture already passed. After repair, all fixtures pass
  silently and the same command still exits 1 only for actual CSS ownership
  and palette violations: both dark defaults are absent from the exact
  `:root`, the exact 12-consumer shared focus rule count is zero, and the old
  theme values, gradients, and external shadows remain.
- Task 2 GREEN: `cd front-nuxt && pnpm run check:light-button-tokens` exited 0
  and printed `Light button token contract passed.`; the contract now verifies
  both exact palettes, the 12-consumer focus owner, the dark semantic defaults,
  the legacy control-shadow aliases, both light semantic `none` values, and
  the unchanged dark semantic shadow.
- Task 2 static regressions: `pnpm run check:visual-system` exited 0 and printed
  `Visual system contract checks passed.`; `pnpm run check:public-pages` exited
  0 for 25 routes; `pnpm run check:nav-layout` exited 0.
- Task 2 focus repair: both changed Node scripts passed `node --check`;
  `pnpm run check:light-button-tokens` and `pnpm run check:css-ratchet`
  exited 0. The strengthened contract requires the exact shared
  `.theme-choice` owner, the five real catalog consumers after their outline
  reset, and solid focus tokens with at least 3:1 contrast against the page,
  control, and primary reference surfaces. The CSS ratchet finished at
  10279/10280 lines.
- Task 2 runtime focus evidence: the full local stack started successfully via
  `bash ./scripts/dev/start-local-stack.sh` after selecting the installed
  Playwright Chromium through `CHROMIUM_BIN`; the first default-browser
  preflight attempt had stopped before service launch on the environment's
  Snap Chromium mount-namespace error. Against the printed public URL
  `http://127.0.0.1:15186`, the first runtime RED proved programmatic
  `.focus()` did not establish `:focus-visible`; a bounded CDP Tab traversal
  then covered the real active element for `primary`, `theme`, `nav`,
  `filter`, `catalog-chip`, and `catalog-pagination` in each light theme. That
  keyboard RED exposed the actual `.theme-toggle` overflow clipping the valid
  3px/2px theme-choice ring (contrast 3.96:1 Morning Paper and 4.01:1 Warm
  Slate). After the light-theme-only overflow repair, the audit printed an
  explicit pass summary for all six families, six samples, and zero focus
  issues in each theme. See git for code-level diff details.
- Task 2 final regressions: fresh `check:visual-system`,
  `check:public-pages`, `check:nav-layout`, and `check:css-ratchet` all exited
  0. `CHROMIUM_BIN=<playwright-chromium> pnpm run check` exited 0; it retained
  the existing Node deprecation, duplicate `formatEffectValue` import, and
  headless Chromium DBus warnings without test failures.
- Task 2 specification follow-up: the focused ownership contract first went
  intentionally RED because the prior exact-only discovery ignored shared
  subset/superset and catalog subset focus owners. Candidate discovery now
  includes every matching `:focus-visible` rule that contains any required
  consumer, and parser self-tests reject shared and catalog subset, superset,
  and duplicate candidates while accepting one formatted exact owner. The
  runtime lane now requires computed `outline-style: solid` exactly and uses
  real CDP Shift+Tab after every forward family sample. Both themes reported
  all six families, six forward samples, six successful reverse samples, and
  zero focus issues. The overall light-theme audit remained red only for the
  previously recorded unrelated text baseline. Fresh syntax, focused/static,
  and full frontend gates passed; the project stop script again closed
  `15186`, `18200`, and `13013` while preserving shared Redis `16380`.
- Task 2 concrete-consumer follow-up: quality re-review found that six broad
  families allowed one member to cover another. The runtime lane now tracks
  17 independent consumer IDs per theme. Fifteen rendered consumers each
  require real forward Tab, exact active-element and solid-ring checks, reverse
  Shift+Tab, and forward restoration evidence. `detail-tab` and
  `filter-option` are narrowly allowlisted because maintained markup does not
  render them; every route in both theme matrices asserts that they remain
  absent. Both themes covered all 15 rendered consumers with 15 forward and
  15 reverse samples and zero issues. Morning Paper restored all 15 exactly;
  Warm Slate restored 14 exactly and used the documented account-menu dynamic
  exception once because focus-in changes the menu tab order. Fresh syntax,
  focused/static, and full frontend gates passed; overall light-theme status
  remained red only for the existing unrelated text baseline. The project
  stop script closed task ports and preserved shared Redis `16380`.
- Task 2 runtime limitation: the default `pnpm run check:light-theme` exited 1
  after timing out at `http://localhost:5176/`, where no process was listening.
  The same-worktree Nuxt process was already serving HTTP 200 on port 5181, so
  `TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:5181 pnpm run check:light-theme`
  was run to completion and exited 1 on environment/baseline contrast issues.
  Backend-dependent detail routes rendered the dark-colored unavailable-route
  fallback under light themes, with representative label ratios of 1.21,
  heading ratios of 1.42-1.50, and action-label ratios of 1.00-1.08. Existing
  non-assigned failures also included Morning Paper `.hero-status-pill` at
  4.00, password visibility controls at 4.43, and category child counts/actions
  at 1.99/3.12 (Warm Slate 2.08/3.36). The audit reported no missing focus or
  control sample, and attributed no failure to the newly assigned primary or
  control foregrounds or markers. Task 5 owns the full-stack rerun; this is not
  recorded as a runtime pass.
- Task 2 overall runtime status remains red honestly: the final
  `check:light-theme` exited 1 on the unrelated text baseline already listed
  above (including the 4.00 hero pills, 4.43 password controls, category
  child text/actions, and dark unavailable-route fallback rendering). Its
  independently printed focus lane is executable GREEN for both themes and
  all six required families; no focus issue remains in that run.
- Lifecycle: startup owned backend `18200`, public frontend `15186`, admin
  `13013`, and the worktree Redis `16380`; MinIO `19100` was already shared.
  `bash ./scripts/dev/stop-local-stack.sh` stopped the task-owned backend,
  frontend, admin, image-compat, and task-started MinIO processes, preserved
  shared Redis per script policy, and a final socket check found `15186`,
  `18200`, and `13013` closed with only Redis `16380` still listening.
- Not run: production browser geometry and screenshots, which remain Task 5
  integrated-acceptance scope.

## Result

- Completed: context exploration, visual approval, written-spec approval, the
  task-by-task TDD implementation plan, and Task 2's two production palettes,
  shared focus semantics, corrected shadow ownership, real keyboard focus
  coverage, clipping repair, and focused/full frontend validation.
- Not completed: prototype replacement, full-stack runtime acceptance, final
  integrated validation, and task-level commit closeout.

## Residual Risks

- Shared light-theme specificity layers may override token values in isolated
  component states and require focused consumer cleanup.
- Exact reference colors may need foreground-only contrast adjustment.
- The two existing untracked prototype copies can drift unless implementation
  gives them one source or an identity contract.
- The initial Task 2 plan placed raw `none` values at the legacy alias layer;
  the existing visual-system contract correctly blocked that architecture.
- Task 2 quality-review focus findings are repaired but require the assigned
  reviewer to re-review before Task 3 starts.
- Task 2 runtime contrast remains unaccepted because the available standalone
  frontend process had no backend-dependent detail data and the audit also
  exposed unrelated pre-existing light-theme contrast failures. Task 5 must
  rerun the audit with the intended full stack and consolidate those results.

## Follow-up

- Complete Task 2 specification and quality re-review before Task 3.

## Commits

- `0af6df56` — approved design specification and task traceability.
- `4586a4f2` — task-by-task TDD implementation plan.
- `a586c587` — initial light-button token RED contract.
- `54f00e3d` — hardened ownership/declaration parser after quality review.
- `d41a8b90` — corrected control-shadow semantic ownership in the plan/devlog.
- `55cd4fc0` — authorized the matching visual-system contract correction.
- `35e90ac2` — implemented the two production button palettes and contracts.
- `d594eebb` — repaired Task 2 focus contrast, consumers, clipping, and real
  forward-keyboard runtime evidence.
- `627b008c` — hardened focus ownership candidates, exact solid outlines, and
  reverse-keyboard evidence.

## Optional: Multi-Agent Coordination

- Coordinator: root Codex agent.
- Parallel work allowed: no; Tasks 1 through 5 are dependency-ordered and
  share package, CSS, prototype, or devlog state.
- Agent ownership:
  - Task implementer:
    - Status: dispatched one task at a time.
    - Task scope: exactly one numbered task from the approved implementation
      plan.
    - Allowed files: only the files listed by that numbered task.
    - Forbidden files: `docs/devlog/current.md`, unrelated source, data,
      backend, crawler, reports, and other worktrees.
    - Dependencies: prior task commit plus both approved design documents.
    - Validation: run the exact RED/GREEN commands named by the task.
    - Blockers: return to the coordinator instead of expanding scope.
    - Handoff notes: report status, commit SHA, commands, files, and concerns.
    - Return format: subagent-driven-development implementer report.
  - Spec and quality reviewers:
    - Status: dispatched after each implementation task.
    - Task scope: read-only review of the just-completed task commit.
    - Allowed files: read the task diff and directly related requirements.
    - Forbidden files: all writes and commits.
    - Dependencies: implementer report and exact base/head SHAs.
    - Validation: inspect real diff and focused command evidence.
    - Blockers: report precise file/line findings to the coordinator.
    - Handoff notes: spec verdict first; quality verdict only after spec passes.
    - Return format: required reviewer template.
- Shared files or state: package scripts, `hifi-preview.css`, both prototype
  copies, and this entry; ownership is serialized by task.
- Parent entry: this entry.
- Contract handoff: none; this is a frontend visual token task with no API,
  schema, or data contract.
- Serialization rule: only one implementer or fixer may write at a time;
  reviewers run only after the implementer commit and remain read-only.
- Result merge owner: root Codex agent.
- Cross-boundary validation: focused contracts, full frontend gate, runtime
  contrast, browser geometry, and final whole-range review.

## Optional: Cross-Review

- Reviewer: Task 1 specification and code-quality review agents.
- Scope: commits `a586c587` and `54f00e3d`, covering the intentional-RED light
  button token contract.
- Findings: initial specification review passed; initial quality review found
  two Important false-green paths in global ownership and duplicate declaration
  handling, plus one Minor selector-comment parsing defect.
- Disposition: fixed.
- Re-review required: no; fresh quality re-review passed with no remaining
  Critical, Important, or Minor findings.
- Resolved by: Task 1 implementer in `54f00e3d`.
- Arbitration decision: accept the strengthened contract and proceed to Task 2.
- Decision owner: root Codex coordinator.
- Rationale: exact root/focus ownership, duplicate rejection, parser fixtures,
  and fresh intentional RED now constrain the production CSS change.
- Remaining risks: none within Task 1; production contrast and browser behavior
  remain Task 2 and Task 5 validation duties.

### Task 2 quality review

- Reviewer: Task 2 code-quality review agent.
- Scope: production palette implementation through `9117f6b6`.
- Findings: three Important findings covering sub-3:1 focus tokens, incorrect
  theme/catalog focus consumers and cascade winners, and unsupported runtime
  focus evidence.
- Disposition: repaired with solid focus tokens, exact real consumers, catalog
  cascade ownership, bounded CDP keyboard traversal, and light-theme
  theme-choice clipping removal in `d594eebb` and `627b008c`; re-review remains
  required before Task 3.
- Re-review required: yes.
- Resolved by: Task 2 implementer in `d594eebb` and `627b008c`.
- Arbitration decision: reopen Task 2; do not start the prototype contract.
- Decision owner: root Codex coordinator.
- Rationale: keyboard focus is an acceptance requirement and the structural
  contract had false-green paths for real focusable elements.
- Remaining risks: Task 2 re-review is still required; unrelated text contrast
  baseline failures remain outside this focus repair.

### Task 2 focus specification follow-up

- Reviewer: Task 2 specification review agent.
- Scope: focus repair commit `d594eebb`.
- Findings: four findings covering missing reverse Shift+Tab evidence,
  non-exact outline-style acceptance, exact-only structural owner discovery,
  and a stale repair-oriented follow-up.
- Disposition: fixed in `627b008c` through real bounded
  reverse traversal, exact solid outline enforcement, any-consumer candidate
  discovery with subset/superset/duplicate fixtures, and corrected handoff.
- Re-review required: yes, specification and quality review before Task 3.
- Resolved by: Task 2 implementer in `627b008c`.
- Remaining risks: unrelated overall light-theme text contrast failures remain
  outside Task 2 focus evidence.

### Task 2 concrete-consumer quality follow-up

- Reviewer: Task 2 quality re-review agent.
- Scope: focus evidence through `627b008c`.
- Findings: one Important false green because broad focus families credited
  only the first matching member, plus one Minor stale commit record.
- Disposition: fixed by independent 17-ID coverage, targeted representative
  routes, two narrowly asserted absent consumers, concrete coverage self-test,
  exact/dynamic reverse-restore accounting, and durable commit records.
- Re-review required: yes, complete Task 2 specification and quality re-review
  before Task 3.
- Resolved by: Task 2 implementer; commit SHA reported in the final response.
- Remaining risks: unrelated overall light-theme text contrast failures remain
  outside this focus coverage repair.

## Optional: State Changes

### 2026-07-22 19:38

- Change: approved two light-theme button systems and locked production scope.
- Reason: user accepted the cool-gray revision and requested the corresponding
  beige system, then authorized adaptation of both.
- Evidence: browser visual companion revisions 2 and 3 plus user confirmation.

### 2026-07-22 19:47

- Change: written specification approved and detailed implementation plan
  created.
- Reason: user authorized production adaptation of both accepted palettes.
- Evidence:
  `docs/superpowers/plans/2026-07-22-light-theme-button-system.md`.

### 2026-07-22 20:34

- Change: corrected Task 2 control-shadow ownership after the existing
  visual-system gate blocked raw `none` declarations in the legacy CSS layer.
- Reason: WP-11 makes `tokens.css` the semantic source of truth and requires
  `hifi-preview.css` to retain `var(--tp-shadow-control)` aliases.
- Evidence: the focused token contract passed the planned raw values, while
  `pnpm run check:visual-system` failed four exact alias-ownership assertions.

### 2026-07-22 20:38

- Change: Task 2 specification review found one stale handoff: `## Follow-up`
  still pointed to Task 2 and the commit trace omitted its implementation SHA.
- Disposition: fixed the next action to Task 3 and recorded `35e90ac2`; no
  source change was required. Re-review required before Task 3 dispatch.

### 2026-07-22 20:41

- Change: authorized the existing visual-system value contract to replace only
  the two light-theme semantic control-shadow expectations with `none`.
- Reason: after ownership was corrected, the gate still intentionally retained
  the old light-theme external-shadow snapshots; this task changes that visual
  behavior while preserving exact selector, semantic owner, dark root, and
  legacy alias contracts.
- Evidence: corrected focused contract passed, then visual-system failed only
  the two former light semantic shadow expected values.

### 2026-07-22 21:02

- Change: reopened Task 2 for keyboard-focus contrast, real consumer coverage,
  catalog cascade repair, and executable runtime focus evidence.
- Reason: quality review demonstrated that the 0.28-alpha rings were only
  about 1.36–1.44:1, `.theme-toggle` was not focusable, catalog focus rules
  cleared outlines, and the prior runtime audit did not focus controls.
- Evidence: reviewer computed contrast and inspected the actual nav/catalog
  templates and cascade winners; re-review is required after repair.

### 2026-07-22 21:52

- Change: repaired all reopened Task 2 focus findings and recorded full-stack
  executable keyboard evidence without changing the unrelated text baseline.
- Reason: real CDP Tab traversal proved the shared and catalog focus owners,
  then exposed and verified the light-theme theme-choice clipping fix.
- Evidence: both themes covered all six required focus families with six
  samples and zero focus issues; focused/static/full frontend gates passed,
  the overall light-theme audit remained red only for recorded unrelated text
  contrast findings, and task-owned service ports closed after project-script
  shutdown.

### 2026-07-22 22:05

- Change: fixed all four Task 2 focus specification-review findings without
  changing production CSS.
- Reason: structural ownership needed to reject partial/extra candidate rules,
  and runtime evidence needed exact solid outlines plus real reverse keyboard
  traversal rather than forward-only coverage.
- Evidence: intentional ownership-fixture RED became GREEN; both light themes
  produced six forward and six reverse keyboard samples with zero focus
  issues; syntax, focused/static, and full frontend gates passed; task-owned
  service ports closed after validation.

### 2026-07-22 22:38

- Change: replaced broad family credit with independent evidence for every
  concrete shared and catalog focus consumer.
- Reason: quality re-review proved that one member could make untested sibling
  consumers appear covered.
- Evidence: both themes covered 15 rendered consumer IDs with 15 forward and
  15 reverse samples and zero focus issues; two absent IDs were asserted on
  all 31 routes per theme; focused/static/full frontend gates passed and
  task-owned ports closed after validation.

### 2026-07-22 19:59

- Change: added the focused light-button token contract to the frontend check
  chain and verified the required RED state without editing production CSS.
- Reason: lock both approved palettes and shared flat-surface, shallow-shadow,
  primary-marker, and focus-ring behavior before Task 2 implementation.
- Evidence: `pnpm run check:light-button-tokens` exited 1 with the exact token
  and invariant failures recorded in `## Validation`; see git for code-level
  diff details.

### 2026-07-22 20:12

- Change: resolved the Task 1 quality-review ownership and parser findings;
  fresh re-review passed before Task 2.
- Reason: prevent unrelated CSS substrings, duplicate declarations, comments,
  or quoted delimiters from creating false contract results.
- Evidence: requested parser fixtures pass silently; the focused contract
  remains intentional RED for actual pre-Task-2 CSS mismatches.
