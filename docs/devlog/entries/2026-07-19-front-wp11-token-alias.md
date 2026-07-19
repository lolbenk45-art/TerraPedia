# Devlog: Front P2 WP-11.1 theme token aliases

## Status

`closed`

## Context

- User goal: continue WP-11.1 after approving P2 as preview-only work; write and independently review the execution plan, then execute it with multiple agents.
- Branch: `feat/front-p2-wp11-tokens-preview`.
- Worktree: `/home/lolben/TerraPedia/.claude/worktrees/front-p2-wp11-tokens`.
- Base: `b4c38843` from the local WP-10/data-audit chain.
- Related docs: `docs/superpowers/specs/2026-07-19-front-wp11-token-alias-design.md`, `docs/superpowers/plans/2026-07-19-front-wp11-token-alias.md`, and `docs/devlog/entries/2026-07-19-data-audit-report-compat.md`.

## Direction / Decisions

- Chosen approach: token-layer semantic values own six theme values; legacy CSS retains aliases for all existing consumers.
- Reasoning: assigning a legacy variable to a semantic token while the semantic token reads the legacy variable forms a CSS custom-property cycle. Equal-specificity theme selectors in the later token stylesheet avoid both that cycle and theme flattening.
- Preview boundary: user explicitly accepted preview-only P2; this task cannot clear the missing historical data-baseline or crawler-stability gates.

## Scope

- Frontend: `tokens.css`, `hifi-preview.css`, and the visual-system contract only.
- Docs/process: design, execution plan, devlog, reviews, and local commits.
- Out of scope: data mutation, crawler execution, P2 packages other than WP-11.1, push, merge, and worktree cleanup.

## Validation

- Baseline completed before plan repair: `cd front-nuxt && pnpm install --frozen-lockfile`, `node scripts/check-visual-system-contract.mjs`, and `pnpm run check` all exited `0`.
- Commands run: source/contract inspection before plan creation and two independent read-only plan reviews.
- Results: the original one-file alias wording would cycle for border/surface/shadow tokens; revised two-file ownership preserves selector specificity. The original plan did not prove all values/blocks and named a screenshot harness that neither sets a theme nor compares images.
- Final validation (2026-07-19 CST): the GREEN ownership contract, four sentinel classes, old/current theme-aware parity, and post-migration full frontend check all ran successfully.
- RED evidence (2026-07-19 01:16 CST): `cd front-nuxt && node scripts/check-visual-system-contract.mjs` exited `1` as intended after the ownership assertions were added. It reported missing root/light/warm semantic owner declarations and raw legacy hifi definitions; no parser/runtime error occurred. `git diff --check` exited `0`.

## Result

- Completed: semantic tokens own the six theme values and all 21 legacy declarations are compatibility aliases without consumer or layout changes.
- Completed: the parity harness bounds screenshot/frame CDP calls by remaining time, emits hash/DOM diagnostics, defers complete-matrix publication, preserves prior evidence on failure, and requires three consecutive equal full-viewport hashes after font/image/geometry/compositor readiness.
- Completed: old CSS at `509d5d04` captured 18/18 twice with `changed=0`; current CSS compared equal to that baseline 18/18 twice and its two candidate manifests also reported `changed=0`.

## Residual Risks

- The data-audit branch remains blocked on an absent archival comparison database; this P2 branch is preview-only.
- Screenshot evidence is local and ignored; it depends on the verified local runtime and is not a release or data-readiness claim.

## Follow-up

- Start WP-11.2 or later only under a separate plan; this task does not unblock the data-audit or crawler-stability prerequisites.

## Commits

- `aaa58cf7` — record approved design, executable plan, and preview-only task entry.
- `4a86a96f` — record coordinated plan reviews.
- `6b39591a` — repair the execution plan.
- `8e925237` — lock theme token ownership.
- `509d5d04` — add the theme token parity harness.
- `257bde19` — centralize theme token aliases and close WP-11.1.

## Optional: Multi-Agent Coordination

- Coordinator: `/root`.
- Parallel work allowed: plan reviews only; implementation is serialized because `tokens.css`, `hifi-preview.css`, and the visual-system contract form one CSS cascade.
- Agent ownership:
  - `/root/wp11_plan_spec_review`:
    - Status: completed; critical runtime acceptance and important ownership/preflight findings require repair.
    - Task scope: read-only specification/plan coverage review.
    - Allowed files: design, plan, current CSS, and contracts.
    - Forbidden files: all writes and commits.
    - Dependencies: `aaa58cf7`.
    - Validation: identify missing requirements, unsafe scope, and non-executable plan steps.
    - Blockers: none.
    - Handoff notes: return severity, exact path/line evidence, and disposition recommendation.
  - `/root/wp11_cascade_review`:
    - Status: completed; no cascade cycle in the intended design, but important contract coverage and alias-ownership corrections require repair.
    - Task scope: read-only CSS custom-property/cascade equivalence review.
    - Allowed files: `tokens.css`, `hifi-preview.css`, Nuxt CSS order, and visual contracts.
    - Forbidden files: all writes and commits.
    - Dependencies: `aaa58cf7`.
    - Validation: trace all four themes and flag cycles, specificity losses, or raw-value drift.
    - Blockers: none.
    - Handoff notes: return a selector/value mapping and any required plan correction.
- Shared files or state: none during reviews; coordinator alone owns `docs/devlog/current.md` and this entry.
- Parent entry: this entry.
- Review disposition: both findings are accepted. The plan now requires exact selector-block assertions, all five non-accent values in root/light-family/warm-slate, root `--tp-color-accent: var(--gold)`, hifi-only aliases, three runtime themes, mandatory staged-scope checks, and a cookie-aware SHA-256 parity harness.
- Re-review: `/root/wp11_plan_spec_review` accepted the first-round critical fixes but found two important execution gaps: repeated `cd front-nuxt` in the baseline command and no pre-commit devlog evidence for Task 2 capture/blocker. Coordinator accepted both; repaired-plan re-review remains required.
- Re-review: `/root/wp11_cascade_review` approved the repaired CSS cascade/value plan with no findings; it confirmed raw semantic ownership, hifi-only aliases, selector specificity, root accent direction, and `light` compatibility normalization.
- Re-review: `/root/wp11_plan_spec_review` approved both execution repairs with no remaining important finding. Plan is execution-ready; implementation remains serialized until the documentation checkpoint is committed.
- Execution assignment: `/root/wp11_contract_implementer` completed after documentation checkpoint `6b39591a`; it modified only `front-nuxt/scripts/check-visual-system-contract.mjs`, produced the intended RED result, and made no commit or devlog edit. The coordinator owns the RED evidence and commit.
- Review assignment: `/root/wp11_contract_spec_review` is active and read-only; it may inspect the Task 1 contract diff and plan/spec, but may not edit or commit. It must verify the exact required owner/alias behavior and report findings before quality review starts.
- Review result: `/root/wp11_contract_spec_review` rejected the RED contract. Important findings: comment/suffix-property text can satisfy raw checks, required values are presence-only and allow later override, and semantic negative checks miss cross-legacy, whitespace, and fallback references. Commit is blocked; `/root/wp11_contract_implementer` must harden the parser/duplicate/value checks, then the same spec review must re-run before quality review.
- Repair result: `/root/wp11_contract_implementer` completed the contract hardening without touching CSS/docs or committing. It now strips comments, matches top-level selector braces, parses delimiter-bounded semicolon declarations, requires exactly one exact normalized value, and rejects all six legacy `var()` references from all six semantic properties. A helper probe covered comment/suffix and duplicate cases; `node --check` exited `0`, the RED contract exited `1` only for intended ownership violations, and `git diff --check` exited `0`. `/root/wp11_contract_spec_review` is re-assigned read-only re-review.
- Re-review result: `/root/wp11_contract_spec_review` rejected one remaining important parser loophole: CSS allows a final declaration without a semicolon before `}`, while the new declaration regex requires `;`; that can hide a final wrong/legacy override. Commit remains blocked. `/root/wp11_contract_implementer` must accept `}` as a declaration terminator while retaining rule-block boundaries, then re-run the review.
- Repair result: `/root/wp11_contract_implementer` changed only the contract parser to retain a rule-block closing brace and accept `;` or `}` termination. Its probe captured final no-semicolon hifi and semantic legacy overrides; `node --check` exited `0`, focused RED remained an intended exit `1`, and `git diff --check` exited `0`. `/root/wp11_contract_spec_review` is re-assigned for final Task 1 spec re-review.
- Spec review result: `/root/wp11_contract_spec_review` approved Task 1 with no findings. It verified final no-semicolon declarations, comment stripping, top-level selector matching, delimiter-bound property parsing, exact-one value enforcement, and all-six cross-reference scanning. `/root/wp11_contract_quality_review` is now assigned a read-only quality review; it may not edit or commit.
- Quality review result: `/root/wp11_contract_quality_review` rejected an important parser edge case. Regex comment stripping can remove valid quoted `/*` / `*/` string content and hide a later invalid duplicate declaration. Commit is blocked; `/root/wp11_contract_implementer` must make comment stripping quote-aware, then quality review must re-run.
- Repair result: `/root/wp11_contract_implementer` changed only comment stripping to a quote/escape-aware scanner. Its probe retained quoted comment markers and collected the later invalid duplicate; `node --check` exited `0`, the focused RED contract remained intended exit `1`, and `git diff --check` exited `0`. `/root/wp11_contract_quality_review` is re-assigned for final read-only quality review.
- Quality review result: `/root/wp11_contract_quality_review` approved Task 1 with no findings. It verified quote/escape-aware comment stripping, final-brace handling, exact-one values, six-way semantic legacy detection, and hifi alias enforcement. Coordinator independently re-ran `node --check` (exit `0`), focused RED (exit `1` with expected missing-owner/raw-legacy violations), and `git diff --check` (exit `0`); the intentional RED contract is ready for its isolated local commit.
- Commit: `8e925237` — `test(front): lock theme token ownership` (intentional RED contract; no CSS change).
- Execution assignment: `/root/wp11_parity_implementer` is active for Task 2 after `8e925237`; it may create only `front-nuxt/scripts/check-theme-token-visual-parity.mjs`, may run non-destructive local browser checks, and must not edit CSS/docs/devlog/current state or commit. Coordinator owns runtime evidence and downstream review.
- Execution result: `/root/wp11_parity_implementer` created only `front-nuxt/scripts/check-theme-token-visual-parity.mjs`; `node --check`, invalid-mode no-output behavior, and diff checks passed. No local stack, capture, generated output, docs edit, or commit occurred. `/root/wp11_parity_spec_review` is active read-only before quality review.
- Spec review result: `/root/wp11_parity_spec_review` rejected Task 2. Important gaps: records serialize the viewport object instead of its name and compare does not validate record schema; hydration can overwrite the theme after the early verification; temporary Chrome profile/process cleanup is incomplete; readiness fetch can hang and successful timeout timers remain live; the configurable base URL is not limited to the local loopback boundary. Commit is blocked; `/root/wp11_parity_implementer` must repair all five before spec re-review.
- Repair result: `/root/wp11_parity_implementer` changed only the parity script. It now serializes/validates string viewport records and the exact matrix, reapplies/verifies theme after route readiness, awaits and removes a unique Chrome profile, uses abortable fetch and cleared timers, and rejects non-loopback/non-HTTP bases. Node/diff checks and no-server rejection probes passed without output creation. `/root/wp11_parity_spec_review` is re-assigned final read-only re-review.
- Spec review result: `/root/wp11_parity_spec_review` approved all five repairs with no findings. `/root/wp11_parity_quality_review` is assigned a final read-only code-quality review before any browser capture or commit.
- Quality review result: `/root/wp11_parity_quality_review` rejected Task 2. Important findings: capture created output and could overwrite a valid baseline before server readiness; CDP evaluated before a navigation load boundary; invalid Chromium spawn lacked a controlled error path. Commit and capture remained blocked.
- Repair result: `/root/wp11_parity_implementer` changed only the parity script. An unreachable-server probe preserved a sentinel baseline byte-for-byte and created no capture directory; navigation now has a load boundary and Chromium spawn errors are handled. Node/diff checks passed. `/root/wp11_parity_quality_review` is re-assigned read-only re-review.
- Quality re-review result: `/root/wp11_parity_quality_rereview` approved Task 2 with no findings. It verified deferred/atomic baseline writes, navigation load ordering, controlled Chromium spawn failure, bounded cleanup, exact 18-case matrix, and strict manifest schema. Coordinator runtime verification remains required before commit.
- Runtime result: coordinator started the worktree Nuxt at `http://127.0.0.1:5181` and ran capture. No baseline manifest was written; six desktop cases for `/items` and `/armor-sets` failed only because readiness required a visible `h1`. Investigation confirmed both routes intentionally hide their page-head/h1 at desktop while their stable main containers are present. `/root/wp11_parity_readiness_fix` is assigned only the parity script to replace the invalid readiness criterion with route-specific stable containers and settled `aria-busy`; it may not edit CSS/docs or commit.
- Readiness repair: `/root/wp11_parity_readiness_fix` changed only the parity script. It now waits for visible `.home-screen`, settled visible `.catalog-pixel-stage`, or settled visible `.armor-layout` by exact route while retaining document/path/body checks and expanded diagnostics. Focused RED/post-fix contract, node syntax, and diff checks passed. `/root/wp11_parity_readiness_spec_review` is assigned read-only review before quality review.
- Readiness spec review: `/root/wp11_parity_readiness_spec_review` approved with no findings and confirmed all path/body/theme/matrix requirements remain intact. `/root/wp11_parity_readiness_quality_review` is assigned final read-only quality review before runtime capture.
- Readiness quality review: `/root/wp11_parity_readiness_quality_review` approved with no findings. It verified actual page-root selectors, busy semantics, route/geometry diagnostics, navigation/theme ordering, resource bounds, deferred artifacts, and atomic baseline writes. Runtime capture is unblocked.
- Runtime evidence (2026-07-19 16:28 CST): coordinator started only the worktree Nuxt on `127.0.0.1:5181` and backend on `127.0.0.1:18088` using the existing local config, database proxy, and Redis. Flyway validated 54 migrations and reported schema version 54 current with no migration necessary. Public items and armor-set proxy requests returned HTTP 200. `THEME_TOKEN_PARITY_MODE=capture` then passed 18/18 records (3 themes x 3 routes x 2 viewports); the manifest had 18 unique keys and valid SHA-256 fields. Output remains local under `front-nuxt/test-results/theme-token-parity/` and is not staged. The parity harness and evidence are ready for a focused local commit.
- Commit: `509d5d04` — `test(front): add theme token parity harness`.
- Execution assignment: `/root/wp11_css_migration` is active after `509d5d04`; it may modify only `front-nuxt/assets/css/tokens.css` and `front-nuxt/assets/css/hifi-preview.css`, must turn the ownership contract GREEN without changing consumers/layouts, and must not edit docs or commit. Coordinator owns reviews, parity comparison, and closeout.
- Execution result: `/root/wp11_css_migration` changed only the two assigned CSS files. The ownership contract moved from intended RED exit `1` to GREEN exit `0`; `pnpm run check` and `git diff --check` exited `0`, and tokens.css contains no migrated legacy declarations. Known non-failing Node/DBus/UPower and duplicate-import warnings remain. `/root/wp11_css_spec_review` is assigned read-only review before quality review.
- CSS spec review: `/root/wp11_css_spec_review` approved with no findings. It confirmed exact raw semantic values/selectors, 21 hifi aliases (6 root plus 5 in each theme block), root-only accent alias, and zero consumer/layout/active-shadow/gold scope drift. `/root/wp11_css_quality_review` is assigned final read-only quality review.
- CSS quality review: `/root/wp11_css_quality_review` approved with no findings. It confirmed acyclic semantic-to-compatibility direction, equal selector specificity with later token load order, identical moved values, and no maintained path that loads hifi without tokens. The 18-case parity comparison remains the final runtime acceptance step.
- Runtime parity blocker (2026-07-19 17:18 CST): after restoring Nuxt on `127.0.0.1:5181` and the public backend on `127.0.0.1:18088`, both `/api/public/items` and `/api/public/armor-sets` returned HTTP 200. Two unchanged 18-case candidate runs then differed from each other in 11 keys. Paired evidence localizes large differences to the items transition/content mount and lazy/async armor images; the remaining home-mobile difference is confined to the right-edge scrollbar. The existing baseline and candidate timing are therefore non-deterministic and cannot prove or reject CSS equivalence. Commit remains blocked and this entry remains active.
- Runtime blocker review: `/root/wp11_parity_diagnosis` completed a read-only review with no writes or service changes. It confirmed the current readiness checks only the outer settled container, does not wait for the actual grid, visible image load/decode, fonts, scroll normalization, or stable frames, and recommended repairing those boundaries without weakening exact SHA comparison. Coordinator accepted the finding and repaired Task 4 of the execution plan.
- Repair ownership: coordinator owns the plan/devlog and service lifecycle. A serialized implementation agent may modify only `front-nuxt/scripts/check-theme-token-visual-parity.mjs`; specification review must approve before quality review. After both approve, coordinator will capture a fresh baseline from a detached read-only worktree at `509d5d04`, compare current CSS twice, run the focused/full gates, and only then close and commit WP-11.1.
- Determinism plan review: `/root/wp11_determinism_plan_review` initially rejected missing staged script scope, abstract settling rules, single-run old baseline, unpreserved A/B manifests, and undefined detached-worktree dependency reuse. Coordinator repaired all findings with exact route selectors, bounded font/image/three-frame geometry settling, identical `--hide-scrollbars` policy, named failure probes, old/current double-run evidence, authoritative `run-old-a/baseline.json`, ignored dependency symlink checks, and complete staged paths. Final re-review approved with no remaining blockers; implementation is serialized to one script owner.
- First rebuilt-baseline result (2026-07-19): the repaired harness captured 18/18 twice from detached old CSS commit `509d5d04`, but exact A/B comparison still changed 7 keys. Decoded pixels proved real raster differences rather than PNG metadata: dark home desktop changed 22,756 pixels only in `y=0..90` (the sticky/backdrop-filter nav outside `.home-main`), while morning items changed only 58 desktop and 25 mobile pixels across rendered edges. Armor was 6/6 stable. Three-frame content geometry therefore does not observe all full-viewport compositor state. Baseline promotion and current-CSS comparison remain blocked; the plan now requires two consecutive identical full-viewport screenshot hashes per record before artifact acceptance.
- Pixel-stability plan review: `/root/wp11_pixel_plan_review` accepted exact consecutive PNG hashes and bounded execution but rejected one important artifact-integrity gap: a never-stable record could still overwrite partial compare evidence. Coordinator accepted the finding and repaired the plan to require a pixel-instability sentinel probe plus complete-matrix, same-parent temporary publication; any timeout or baseline mismatch must preserve existing baseline/candidate/capture/compare evidence byte-for-byte.
- Pixel-stability spec review: `/root/wp11_pixel_spec_review` rejected two important implementation gaps. CDP screenshot/frame operations could time out through the generic command deadline without attempt-hash/DOM diagnostics or bounded remaining time; publication cleanup could fail after replacing evidence while rollback state was already treated as committed. Commit remains blocked. `/root/wp11_pixel_implementer` owns a serialized repair and must rerun all sentinel probes before spec re-review.
- Pixel-stability repair (2026-07-19): CDP commands now accept a per-call timeout; screenshot and frame waits receive only the remaining pixel deadline, and either operation failure is wrapped with the accumulated `attemptHashes` plus DOM signature. Artifact publication still rolls back any pre-commit or replacement failure, while backup/temporary cleanup after both atomic replacements is best-effort and cannot turn already-published evidence into a false failure. See git for code-level diff details.
- Sentinel evidence (2026-07-19): `node --check` and the focused source contract exited `0`; an unreachable loopback capture exited nonzero with its sentinel baseline unchanged and no capture directory; a selector-free loopback page exited nonzero with route, selector/content count, image-state, and geometry diagnostics; a deterministic three-color full-viewport animation exited nonzero through both deadline and bounded frame-command paths with `attemptHashes` plus DOM signature, while pre-existing baseline, candidate, capture, and compare artifacts remained byte-for-byte unchanged. `git diff --check` exited `0`.
- Pixel-stability specification re-review: approved both Important repairs with no remaining finding. The remaining-time bound is applied at each screenshot/frame CDP boundary, all pixel failure paths preserve diagnostics, and publication cannot report failure after replacing old evidence solely because backup cleanup failed.
- Pixel-stability quality review: approved with no findings. The change reuses the existing CDP timeout mechanism, keeps rollback strict before commit, isolates post-commit cleanup as best-effort, and does not weaken exact PNG hashes, matrix completeness, or deferred publication.
- Final runtime evidence (2026-07-19 CST): WSL restarted during the first old-baseline run, terminating the services and shell; disk/inodes were healthy and the interrupted ignored output was discarded. The standard local-stack entrypoint was restored at front `5181` and backend `18088`; Flyway validated 54 migrations and reported schema version 54 current with no migration. Snap Chromium had a post-restart mount-namespace failure, so all fresh browser gates used the existing native Playwright Chromium via `CHROMIUM_BIN`. The old detached worktree ran on `5182` with the same backend and image origin, then was stopped and removed with its dependency symlink and temporary `.git/info/exclude` entry.
- Final gate evidence (2026-07-19 CST): `node scripts/check-visual-system-contract.mjs`, `node --check scripts/check-theme-token-visual-parity.mjs`, `pnpm run check`, and `git diff --check` exited `0`. Known non-failing UPower, Node deprecation, and duplicate-import warnings remain unchanged. Generated parity artifacts stayed ignored and unstaged.
- Serialization rule: both reviews → coordinator resolves/commits plan findings → repaired-plan re-review → one implementation agent → spec review → quality review → runtime validation agent.
- Result merge owner: `/root`.
- Cross-boundary validation: focused contract, full frontend check, and preview screenshot evidence.
