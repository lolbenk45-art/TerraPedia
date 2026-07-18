# Devlog: Armor-set piece aggregate (WP-10)

## Status

`closed`

## Context

- User goal: continue after P1 tail and implement WP-10 locally without
  merging `main`.
- Branch: `feat/front-p1-wp10-armor-aggregate`.
- Worktree: `/home/lolben/TerraPedia/.claude/worktrees/front-p1-wp10`.
- Base: `refactor/front-p1-tail` at `cbca943`.
- Related docs:
  `docs/todo/2026-07-17_armor-sets-aggregate-endpoint-request.md`,
  `docs/plans/2026-07-17_front-pages-remediation-p0-p2-plan.md`,
  `docs/superpowers/specs/2026-07-18-armor-set-aggregate-design.md`, and
  `docs/superpowers/plans/2026-07-18-armor-set-aggregate.md`.
- Related prior entry:
  `docs/devlog/entries/2026-07-18-front-p1-tail-refactor.md` (closed).

## Direction / Decisions

- Chosen approach: optional detail subtype, dedicated armor aggregate service,
  and a shared public recipe-tree facade used by both public consumers.
- Reasoning: this preserves the no-include response, keeps list DTO ownership
  clean, and prevents the new aggregate path from bypassing managed-image
  sanitization.
- Approved error semantics: the base detail succeeds when individual pieces
  fail; failed effects become an empty list and failed recipes are omitted.
- Runtime acceptance exposed three P1-tail client-navigation blockers outside
  the aggregate data path: a preview SEO TDZ, a circular armor-build computed,
  and an unresolved dynamic `NuxtLink`. They were accepted as the minimum
  repairs required to execute the approved client-navigation smoke, with no
  API, data, or visual behavior expansion.
- Rejected options: controller-owned orchestration, adding fields to the list
  DTO, a separate aggregate route, visual changes, and P2 work.

## Scope

- Frontend: request and consume optional `pieceEffects` / `pieceRecipes`, with
  field-presence fallback to the existing per-piece calls, plus the three
  client-navigation blocker repairs and their source contracts.
- Backend: extend the existing armor detail route, add an aggregate service and
  detail DTO, and share the public recipe-tree copy/sanitizer boundary.
- Data: read-only existing projections and item/recipe services; no data write.
- Docs/process: design spec, implementation plan, validation evidence, and
  task handoff.
- Out of scope: P2, crawling/import/backfill, schema changes, visual redesign,
  push, merge, and unrelated worktree cleanup.

## Validation

- Backend: the final four-class focused Maven suite passed 16/16 with zero
  failures or errors. Expected test WARN output covered per-piece degradation
  and public image stripping.
- Frontend: the full `pnpm run check` passed after the runtime repairs. Known
  non-failing baseline output remains Chromium DBus/UPower/GPU messages, Node
  `DEP0205`, and the duplicate `formatEffectValue` auto-import warning.
- API runtime: armor `155861118` returned successful object-valued
  `pieceEffects` and `pieceRecipes` maps with keys `3874`, `3875`, and `3876`;
  the no-include response omitted both properties.
- Browser runtime: a real catalog-card click navigated to the detail route with
  one armor-detail request, zero per-piece equipment-effect or recipe-tree
  requests, zero hydration warnings, zero page errors, zero `NuxtLink`
  warnings, and the expected detail name rendered.
- TDD runtime repairs: the public-page SEO-order, armor-build cycle, and
  explicit `NuxtLink` contracts were observed RED before their minimal fixes
  and GREEN afterward.
- Repository/review: committed and uncommitted `git diff --check` passed;
  final independent review of `refactor/front-p1-tail...HEAD` plus the runtime
  repairs found no Critical or Important issue.

## Result

- Completed: optional armor piece effects/recipes aggregation, shared public
  recipe-tree safety boundary, frontend field-presence consumption, legacy
  fallback preservation, runtime blocker repairs, integrated runtime evidence,
  final review, and local branch handoff.
- Not completed: P2, push, and merge remain outside this task.

## Residual Risks

- `PublicRecipeTreeFacade` uses string-based `BeanUtils` exclusions; a future
  mutable recipe-node collection needs a matching detached copy and mutation
  test.
- Aggregate ownership and the new navigation repairs use strict structural
  source contracts. Runtime acceptance covers the current behavior, but the
  armor-build replacement predicate lacks a direct plain/single-variant/
  multi-variant fixture and harmless formatting changes can trip regex checks.

## Follow-up

- P2 remains a separate task; no automatic merge, push, or worktree cleanup.

## Commits

- `1696f83` — define the armor-set aggregate design contract.
- `eb85d36` — define the audited TDD implementation plan.
- `6434a03` — lock serialized execution coordination.
- `4e6fe02` — record the clean Task 1 baseline and review evidence.
- `2b28764` — initial Task 2 public recipe-tree facade implementation; spec
  review found one mutable-list alias.
- `5f0a774` — detach public recipe group names and close the Task 2 finding.
- `8324bfd` — add the Task 3 armor aggregate DTO/service and focused tests.
- `78a9220` — expose the Task 4 optional include controller contract.
- `f7c43e7` — initial Task 5 frontend aggregate consumer; specification
  review found two contract blind spots.
- `88d53e8` — harden present-null and shared-resolver contract coverage.
- `97b956d2` — restore armor catalog/detail client navigation and record the
  integrated runtime evidence.
- `commit SHA pending in final response` — close the WP-10 local handoff.

## Optional: Cross-Review

- Reviewer: fresh Task 2 specification reviewer.
- Scope: `4e6fe02..2b28764`, public recipe-tree facade and controller rewiring.
- Findings: Important — `RecipeTreeNodeDTO.groupMemberNames` remains shallow
  copied through `BeanUtils`, so the public result can mutate cached source
  state; the facade test did not cover this mutable-list alias.
- Disposition: fixed by a RED alias-mutation test and explicit detached copy;
  specification re-review passed and quality review found no Critical or
  Important issue.
- Re-review required: no; completed.
- Resolved by: Task 2 implementer at `5f0a774`.
- Arbitration decision: accept the finding; it directly violates the approved
  deep-copy boundary.
- Decision owner: coordinator.
- Rationale: all mutable nested collections exposed publicly must be detached
  from the recipe-tree cache, even when they do not carry images.
- Remaining risks: Minor — string-based `BeanUtils` exclusions require a new
  mutation assertion if a future mutable node collection is added.

### Task 3 armor aggregate service

- Reviewer: fresh specification and code-quality reviewers.
- Scope: `6883fe8..8324bfd`, detail DTO, aggregate service, and focused tests.
- Findings: none; both reviews approved.
- Disposition: accepted.
- Re-review required: no.
- Resolved by: not applicable.
- Arbitration decision: none required.
- Decision owner: coordinator.
- Rationale: exact base-instance compatibility, deterministic IDs/maps,
  selective nullable fields, and per-piece degradation are covered.
- Remaining risks: controller JSON serialization/presence remains owned by
  Task 4 as planned.

### Task 4 controller include contract

- Reviewer: fresh specification and code-quality reviewers.
- Scope: `d6ebfab1..78a9220`, armor controller and MockMvc contract tests.
- Findings: none; both reviews approved.
- Disposition: accepted.
- Re-review required: no.
- Resolved by: not applicable.
- Arbitration decision: none required.
- Decision owner: coordinator.
- Rationale: no-include, combined, partial, unknown, and successful-null JSON
  behavior is covered while list/detail service ownership remains separated.
- Remaining risks: frontend consumer acknowledgement remains pending Task 5.

### Task 5 frontend consumer

- Reviewer: fresh specification reviewer.
- Scope: `4f890905..f7c43e7`, frontend types/request/page/helper/contract/gate.
- Findings: Important — the executable helper test covers present `{}` but not
  present `null`, so a truthiness regression passes; page-source assertions do
  not require actual `resolveArmorAggregateOrFallback` calls, so a local chooser
  can bypass shared ownership while the contract stays green.
- Disposition: fixed with an executable present-null case and an in-memory
  resolver-bypass mutation proof; specification re-review passed and quality
  review found no Critical or Important issue.
- Re-review required: no; completed.
- Resolved by: Task 5 implementer at `88d53e8`.
- Arbitration decision: accept both findings.
- Decision owner: coordinator.
- Rationale: implementation is currently correct, but the approved contract
  explicitly requires present-null suppression and shared resolver ownership;
  mutation-resistant coverage is part of Task 5.
- Remaining risks: Minor — ownership regex is formatting/order sensitive and
  may reject a harmless resolver-call refactor.

### Task 6 integrated review

- Reviewer: fresh final code reviewer.
- Scope: `refactor/front-p1-tail...8206d074` plus the five uncommitted runtime
  blocker/source-contract files.
- Findings: no Critical or Important issue; two Minor test-strength gaps for
  the armor-build replacement predicate and structural SEO/NuxtLink contracts.
- Disposition: accepted as non-blocking because the exact runtime failures were
  reproduced and the final real-click browser smoke covers the integrated path.
- Re-review required: no.
- Resolved by: not applicable.
- Arbitration decision: defer broader executable component/fixture coverage;
  retain the current runtime evidence and focused source contracts.
- Decision owner: coordinator.

## Optional: State Changes

### 2026-07-18 21:47 CST

- Change: WP-10 began on a new stacked branch after the user approved the
  recommended architecture and per-piece partial-failure behavior.
- Reason: WP-10 changes an API contract and UI request flow, so it must not
  reuse the closed P1-tail entry or modify `main` directly.
- Evidence: base `cbca943` is clean; target entrypoints and sanitizer boundary
  were inspected read-only before the design was written.

### 2026-07-18 22:06 CST

- Change: the user approved the written spec and the task advanced to an
  execution-ready TDD plan.
- Reason: implementation spans a shared backend security boundary, an optional
  API contract, and a frontend legacy fallback, so red/green order and runtime
  closure evidence must be explicit before code changes.
- Evidence: plan self-review and TerraPedia plan audit found and repaired the
  runtime-closure, executable fallback-test, controller-fixture, and type/detail
  gaps; no critical or important plan defect remains.

### 2026-07-18 22:11 CST

- Change: the user selected subagent-driven execution; coordination ownership
  is locked before Task 1 dispatch.
- Reason: implementation tasks share contracts and must execute serially with
  independent specification and quality reviews.
- Evidence: `/root` is coordinator; only the coordinator edits the plan,
  active entry, and `current.md`; implementers and reviewers are read/write or
  read-only within the task boundaries below.

### 2026-07-18 22:25 CST

- Change: Task 1 baseline and both review stages passed; ownership advances to
  Task 2 public recipe-tree facade implementation.
- Reason: production TDD may start only after the isolated baseline is proven
  clean and independent reviewers confirm no setup pollution.
- Evidence: Maven controller tests 5/5, full frontend gate exit 0, clean
  tracked/staged/untracked scans, spec review approved, quality review found no
  Critical or Important issue.

### 2026-07-18 22:37 CST

- Change: Task 2 remains active after specification review found a mutable-list
  alias across the public/cached recipe-tree boundary.
- Reason: `groupMemberNames` was not excluded from `BeanUtils` shallow copying.
- Evidence: reviewer traced the shared list from `PublicRecipeTreeFacade` to
  `RecipeTreeNodeDTO`; the existing test fixture omitted the field.

### 2026-07-18 22:48 CST

- Change: Task 2 passed its fix loop, specification re-review, and code-quality
  review; ownership advances to Task 3 armor aggregation.
- Reason: `groupMemberNames` is now detached and the regression test observes
  the original alias before the production fix.
- Evidence: focused tests 4/4; spec re-review approved; quality review found no
  Critical or Important issue and one future-proofing Minor.

### 2026-07-18 23:01 CST

- Change: Task 3 passed specification and quality review without findings;
  ownership advances to Task 4 controller contract.
- Reason: aggregate orchestration is complete and must now be exposed without
  altering the successful-null quirk or no-include JSON shape.
- Evidence: focused service tests 5/5; both independent reviews approved; clean
  worktree and diff check.

### 2026-07-18 23:15 CST

- Change: Task 4 passed both review stages without findings; backend producer
  contract is frozen for Task 5 consumption.
- Reason: the optional maps now serialize at the existing detail `data` level
  without changing list or missing-detail behavior.
- Evidence: four-class focused backend suite 16/16; specification and quality
  reviews approved; clean worktree.

### 2026-07-18 23:27 CST

- Change: Task 5 remains active after specification review found two contract
  blind spots, while production behavior itself remains correct.
- Reason: present-null and shared resolver ownership were asserted only
  indirectly or not at all.
- Evidence: reviewer demonstrated that truthiness-based helper behavior and a
  page-local chooser could pass the current contract.

### 2026-07-18 23:40 CST

- Change: Task 5 passed the contract fix loop, specification re-review, and
  quality review; ownership advances to Task 6 integration.
- Reason: present-null suppression and shared resolver use are now executable
  contract requirements, and the frontend acknowledges producer `78a9220`.
- Evidence: focused contracts and Nuxt typecheck pass; full reviewer-run
  `pnpm run check` passes; no Critical or Important finding remains.

### 2026-07-19 00:13 CST

- Change: Task 6 runtime authorization cleared the service-lifecycle blocker;
  integrated API/browser acceptance and final review passed after three
  independently reproduced P1-tail navigation blockers were repaired by TDD.
- Reason: the approved plan requires a real catalog client navigation, rendered
  detail, aggregate request counts, and zero hydration warnings before closeout.
- Evidence: slot 10 served backend `18198` and frontend `15184`; armor
  `155861118` exposed both maps; real card click produced one armor request,
  zero per-piece requests, zero hydration/page/NuxtLink errors, and rendered
  the expected name. Final review found no Critical or Important issue.

## Optional: Multi-Agent Coordination

- Coordinator: `/root` (Codex).
- Parallel work allowed: no; Task 1 baseline, Tasks 2–5 implementation, and
  Task 6 integration/closeout execute serially.
- Agent ownership:
  - Task 1 baseline implementer:
    - Status: complete; implementer reported DONE_WITH_CONCERNS for baseline
      warnings only, and both independent reviews approved.
    - Task scope: install worktree-local frontend dependencies and run the
      exact backend/frontend baseline commands from the committed plan.
    - Allowed files: no tracked files; package-manager-created ignored
      dependency links only.
    - Forbidden files: all source, test, plan, spec, devlog, data, and service
      lifecycle files.
    - Dependencies: commits `1696f83`, `eb85d36`, and this coordination state.
    - Validation: plan Task 1 Steps 1–4.
    - Blockers: any baseline test failure or lockfile mutation request.
    - Handoff notes: report exact exit status and distinguish warnings from
      failures; no tracked or staged change was produced. Baseline warnings are
      Node deprecation, duplicate `formatEffectValue`, Chromium DBus/UPower,
      Maven unchecked notes, and the expected sanitizer log.
    - Return format: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT,
      commands, results, tracked status, concerns.
  - Tasks 2–5 implementers and reviewers:
    - Status: complete through the required serialized implementation and
      two-stage review sequence.
    - Task scope: exactly one complete task from the committed plan per fresh
      implementer, followed by fresh spec and quality reviewers.
    - Allowed files: only that task's Files list.
    - Forbidden files: plan, spec, devlog/current, active entry, data, crawler,
      and service lifecycle state.
    - Dependencies: prior task commit and both prior reviews approved.
    - Validation: exact RED/GREEN and focused commands in the assigned task.
    - Blockers: contract drift, unexpected shared-file need, failing baseline,
      or unresolved reviewer finding.
    - Handoff notes: implementers commit; reviewers are read-only; the same
      implementer fixes findings and reviewers re-review.
    - Return format: role-specific template from
      `subagent-driven-development`.
  - Task 2 public recipe-tree facade:
    - Status: complete at `2b28764` + `5f0a774`; specification and quality
      reviews approved after one Important deep-copy finding was fixed.
    - Task scope: shared public recipe-tree copy/sanitizer and item controller
      delegation.
    - Allowed files: the four Task 2 files in the committed plan.
    - Forbidden files: all frontend/data/crawler and coordinator devlog paths.
    - Dependencies: Task 1 baseline.
    - Validation: facade/controller focused Maven suite 4/4.
    - Blockers: none.
    - Handoff notes: all current mutable node collections are detached; later
      armor aggregation must consume `PublicRecipeTreeFacade`, not the internal
      tree service.
    - Return format: complete.
  - Task 3 armor aggregate service:
    - Status: complete at `8324bfd`; specification and quality reviews found no
      issue.
    - Task scope: optional detail DTO, include parsing, item aggregation, and
      per-piece failure isolation.
    - Allowed files: the three Task 3 files in the committed plan.
    - Forbidden files: controllers/frontend/data/crawler and coordinator docs.
    - Dependencies: Task 2 facade contract `5f0a774`.
    - Validation: focused Maven service suite 5/5.
    - Blockers: none.
    - Handoff notes: controller must use the aggregate service and keep list
      reads on `PublicArmorSetService`.
    - Return format: complete.
  - Task 4 controller contract:
    - Status: complete at `78a9220`; specification and quality reviews found no
      issue.
    - Task scope: optional include binding/delegation and JSON compatibility.
    - Allowed files: the two Task 4 files in the committed plan.
    - Forbidden files: service internals/frontend/data/crawler/coordinator docs.
    - Dependencies: aggregate service `8324bfd`.
    - Validation: four focused backend classes 16/16.
    - Blockers: none.
    - Handoff notes: producer fields are `pieceEffects` and `pieceRecipes`;
      requested empty maps are present, unrequested maps omitted.
    - Return format: complete.
  - Task 5 frontend consumer:
    - Status: complete at `f7c43e7` + `88d53e8`; specification and quality
      reviews approved after two contract blind spots were fixed.
    - Task scope: optional aggregate types/request, independent field-presence
      fallback, page normalization, and executable contract.
    - Allowed files: the six Task 5 files in the committed plan.
    - Forbidden files: backend/data/crawler/coordinator docs.
    - Dependencies: producer controller contract `78a9220`.
    - Validation: armor aggregate/build/stat/detail contracts, Nuxt typecheck,
      and reviewer-run full frontend gate.
    - Blockers: none.
    - Handoff notes: present `{}`/`null` suppresses legacy callbacks; absent
      module independently triggers its old endpoint family.
    - Return format: complete.
  - Task 6 integration and closeout:
    - Status: integration, runtime acceptance, and final review complete;
      focused repair commit and coordinator closeout remain.
    - Task scope: full focused gates, frontend gate, authorized runtime smoke,
      final review, and coordinator-owned devlog closeout.
    - Allowed files: coordinator-only devlog paths; reviewers are read-only.
    - Forbidden files: feature code unless a failing test and review finding
      require a serialized repair task.
    - Dependencies: all implementation tasks and reviews approved.
    - Validation: plan Task 6.
    - Blockers: none.
    - Handoff notes: runtime request-count evidence is recorded above; finish
      the reviewed repair commit and final closeout without push or merge.
    - Return format: validation evidence, findings, disposition, residual risk.
- Shared files or state: `PublicItemRecipeController`,
  `PublicArmorSetController`, armor detail page/contracts, git index, and all
  devlog files are serialized; no parallel writes.
- Parent entry: this entry.
- Contract handoff:
  - Producer: backend Tasks 2–4.
  - Consumer: frontend Task 5 and its executable contract.
  - Endpoint/schema/state: optional `pieceEffects` / `pieceRecipes` on existing
    armor detail `data`; no schema or data change.
  - Version/hash: design `1696f83`, plan `eb85d36`, public recipe producer
    contract `5f0a774`, armor aggregate service `8324bfd`, controller producer
    contract `78a9220`, and frontend consumer acknowledgement `88d53e8`.
  - Breaking or compatible: compatible; absent fields trigger legacy fallback.
  - Fixtures/types updated: backend DTO/controller tests and frontend public
    API type/contract.
  - Consumer acknowledgement: complete at `88d53e8` against producer
    `78a9220`; field names/presence semantics match.
- Serialization rule: Task 1 -> Task 2 implement/review -> Task 3
  implement/review -> Task 4 implement/review -> Task 5 implement/review ->
  Task 6 integrated review/validation/closeout.
- Result merge owner: coordinator; this task does not authorize a merge.
- Cross-boundary validation: focused Maven suite, `pnpm run check`, executable
  aggregate/fallback contract, and authorized runtime browser request capture.
