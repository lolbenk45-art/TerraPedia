# Devlog: Armor-set piece aggregate (WP-10)

## Status

`active`

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
- Rejected options: controller-owned orchestration, adding fields to the list
  DTO, a separate aggregate route, visual changes, and P2 work.

## Scope

- Frontend: request and consume optional `pieceEffects` / `pieceRecipes`, with
  field-presence fallback to the existing per-piece calls.
- Backend: extend the existing armor detail route, add an aggregate service and
  detail DTO, and share the public recipe-tree copy/sanitizer boundary.
- Data: read-only existing projections and item/recipe services; no data write.
- Docs/process: design spec, implementation plan, validation evidence, and
  task handoff.
- Out of scope: P2, crawling/import/backfill, schema changes, visual redesign,
  push, merge, and unrelated worktree cleanup.

## Validation

- Commands run: branch/worktree/ignore/remote-state checks, read-only chain
  inspection, spec and plan placeholder/contract scans, plan-audit coverage
  checks, `git diff --check`, worktree-local `pnpm install`, focused baseline
  Maven controller tests, and the full public frontend gate.
- Results: the base worktree is clean; the new task branch is stacked from
  `cbca943`; current armor, effects, and recipe entrypoints were verified; the
  existing item aggregate endpoint is deprecated and is not reused as the
  public contract; the written design and TDD plan self-reviews found no
  remaining critical or important placeholder, contract, boundary, evidence,
  continuity, or type-consistency issue. Task 1 baseline passed 5/5 Maven tests
  and `pnpm run check`; independent spec and quality reviews approved it with no
  Critical or Important findings and no tracked/untracked scope pollution.
- Not run: new-code tests and runtime acceptance; implementation has not
  started.

## Result

- Completed: user-approved architecture, compatibility/error semantics,
  written-spec review, and execution-ready TDD implementation plan.
- Not completed: code, runtime acceptance, review, and closeout.

## Residual Risks

- Runtime request-count and hydration evidence require a serving build; they
  block closeout if no compatible process or service-lifecycle authorization
  is available.
- The recipe-tree public image policy currently lives in a controller and must
  be extracted without mutating cached internal DTOs.

## Follow-up

- Execute the committed plan through serialized subagent-driven development on
  this branch without push or merge.

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
    - Status: pending sequential assignment after the prior task's two-stage
      review passes.
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
  - Task 6 integration and closeout:
    - Status: pending Tasks 2–5 and final integrated review.
    - Task scope: full focused gates, frontend gate, authorized runtime smoke,
      final review, and coordinator-owned devlog closeout.
    - Allowed files: coordinator-only devlog paths; reviewers are read-only.
    - Forbidden files: feature code unless a failing test and review finding
      require a serialized repair task.
    - Dependencies: all implementation tasks and reviews approved.
    - Validation: plan Task 6.
    - Blockers: missing runtime authorization/process or material review gap.
    - Handoff notes: no task closeout without runtime request-count evidence.
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
    contract `78a9220`; frontend consumer acknowledgement is pending.
  - Breaking or compatible: compatible; absent fields trigger legacy fallback.
  - Fixtures/types updated: backend DTO/controller tests and frontend public
    API type/contract.
  - Consumer acknowledgement: pending backend contract commit and Task 5.
- Serialization rule: Task 1 -> Task 2 implement/review -> Task 3
  implement/review -> Task 4 implement/review -> Task 5 implement/review ->
  Task 6 integrated review/validation/closeout.
- Result merge owner: coordinator; this task does not authorize a merge.
- Cross-boundary validation: focused Maven suite, `pnpm run check`, executable
  aggregate/fallback contract, and authorized runtime browser request capture.
