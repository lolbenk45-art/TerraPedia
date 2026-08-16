---
name: terrapedia-plan-auditor
description: Use when reviewing, self-reviewing, repairing, or approving TerraPedia implementation plans, closure plans, data-source plans, multi-agent plans, or long-running repair plans before or during execution.
---

# TerraPedia Plan Auditor

Use this skill to decide whether a plan can actually close the requested TerraPedia goal before execution continues. The plan is not acceptable just because it lists tasks; it must prove the chain, boundaries, validation, and continuation path.

## Core Standard

A plan is execution-ready only when it answers:

- What exact user-visible or data-visible problem is being closed?
- Which source of truth owns the answer?
- Which code, data, API, UI, script, and report surfaces participate?
- What will prove the original symptom is fixed?
- What happens if a subtask finds a gap while executing?

If these are unclear, repair the plan first. Do not switch the main goal unless the user explicitly changes it.

## Mandatory Audit

Review the plan against these gates:

1. **Goal lock**
   - Restates the user's original problem in concrete terms.
   - Defines closure as a measurable state, not "continue investigation".
   - Separates the main goal from opportunistic cleanup.

2. **Source-chain lock**
   - Names the authoritative data source and every downstream consumer.
   - For data issues, maps the chain from raw or managed source to DB/API/UI.
   - Flags mixed-source risks, fallback risks, stale cache risks, and derived-field risks.

3. **Boundary lock**
   - States what is in scope and out of scope.
   - Names files, modules, tables, endpoints, or pages likely to change.
   - Defines no-write or manual-only boundaries for crawler, import, backfill, production, and destructive work.

4. **Evidence lock**
   - Includes a minimal smoke test that reproduces or detects the original symptom.
   - Includes focused unit/API/UI checks for changed surfaces.
   - Includes final integration validation and restart requirements when runtime behavior matters.

5. **Execution continuity**
   - Defines how to handle discovered gaps: repair the plan, self-review again, then continue.
   - Does not stop at the first defect unless the defect makes the goal unsafe or impossible.
   - Preserves the main goal while allowing implementation details to change.

6. **Multi-agent safety**
   - Splits work by disjoint ownership: files, modules, endpoints, tables, or read-only questions.
   - No two agents write the same file, same DB field, same page section, or same service lifecycle.
   - Delegates verification or exploration only when it can run in parallel without blocking the critical path.

7. **Commit and merge readiness**
   - Has a focused commit scope.
   - Defines pre-commit status and staged-diff checks.
   - Identifies whether the branch should be merged, left open, or followed by data refresh/restart.

## Closure Questions

Ask these before approving a plan:

- If this plan completes, can the user retest the exact complaint without extra guessing?
- Does the plan validate the real runtime path instead of only internal helpers?
- Could the plan pass while the original UI/API/data problem remains broken?
- Are there hidden prerequisites such as missing cached images, stale DB rows, or unrun migrations?
- Is the plan relying on memory, old reports, or unverified assumptions where a read-only check is cheap?
- Does the plan say what to do after a failed smoke test?

Any "yes" to a failure possibility needs a plan repair.

## Repair Loop

When a problem is found:

1. Classify it as critical, important, or minor.
2. Patch the plan, not the goal.
3. Re-audit only the affected gates plus any dependent gates.
4. Repeat until no critical or important plan defects remain.
5. Then execute or hand off with the remaining minor risks called out.

Do not produce a plan that says "investigate and decide later" for a known acceptance problem. Replace it with the smallest concrete smoke check and the next repair branch.

## NPC/Data Closure Bias

For TerraPedia NPC, loot, image, and domain parity work, require this extra chain:

```text
wiki/source evidence -> standardized/domain model -> database tables -> backend DTO/API -> admin/public UI projection -> visual/runtime check
```

The plan must guard against:

- NPC loot being mixed with generic item relations without NPC ownership.
- UI using raw wiki image URLs when managed cached image URLs are required.
- A backend response carrying an image field that sanitization later suppresses.
- Matching loot cards by display text when stable identity keys are available.
- Passing tests with one fixture while multi-drop NPCs, inherited loot, or derived loot remain wrong.

## Output Shape

Return plan review results in this compact shape:

```md
## Verdict
- Status:
- Main goal:
- Closure definition:

## Blocking Plan Defects
- Critical:
- Important:

## Plan Repairs
- Change:
- Reason:
- Validation added:

## Execution-Ready Plan
- Scope:
- Agent split:
- Smoke test:
- Final validation:

## Residual Risk
- Risk:
- Follow-up trigger:
```

If no repairs are needed, say the plan is execution-ready and still list the smoke test and final validation that prove closure.
