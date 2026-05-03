---
name: terrapedia-chain-auditor
description: Audit TerraPedia data, workflow, and acceptance chains before adding or changing features. Use when Codex needs to inspect a TerraPedia chain, verify source-of-truth flow, evidence freshness, refresh plans, quality-gate coverage, manual-only safety boundaries, or decide whether the project foundation is stable enough for the next feature.
---

# TerraPedia Chain Auditor

Use this skill to audit a TerraPedia chain end to end before extending it. The goal is to prove the chain is trustworthy, not to run data mutations.

## Hard Boundaries

- Do not run crawler, import, backfill, load, apply, or DB-writing commands.
- Do not execute evidence commands from a refresh plan.
- Do not write database records.
- Do not use `git add .`.
- Prefer read-only scripts, tests, manifests, reports, and API contracts.
- Treat malformed, unreadable, missing, stale, or unknown evidence as not trustworthy.

## Entry Checklist

Establish these facts before edits:

- Task goal and success criteria.
- Chain name and owner surface: UI page, API, script, report, or DB projection.
- Source of truth and downstream consumers.
- Existing manifest, report, audit, refresh plan, gate, and tests.
- Validation commands that prove the chain is still safe.

## Chain Map

For data-source acceptance style chains, expect this shape:

```text
manifest -> report evidence -> freshness audit -> refresh plan -> quality gate -> UI/API consumption
```

For a new TerraPedia chain, map the equivalent pieces:

- **Manifest:** machine-readable list of panels/entities/reports and commands.
- **Evidence:** report files or read-only API output.
- **Freshness:** fresh/stale/missing/unknown classification.
- **Refresh plan:** manual next actions, never execution.
- **Gate:** automated tests or quality-gate step.
- **Consumer:** backend DTO/API, admin UI, public UI, or downstream script.

If any piece is absent, classify it as a foundation gap before adding feature surface.

## Audit Procedure

1. Inspect branch and worktree:

```powershell
git status --short
git branch -vv
git worktree list
```

2. Locate chain entrypoints with `rg`:

```powershell
rg -n "data-source-acceptance|freshness|refresh-plan|manifest|quality-gate|reportPattern|generatorCommand" scripts back data-query-app front project-plan
```

3. Verify evidence safety:

- Manifest commands must declare whether they write DB or require DB.
- Report readers must not treat invalid JSON as fresh.
- Missing command must block, not disappear.
- Unknown command risk must need confirmation.
- Database-required evidence must need confirmation.
- Database-writing evidence must block.
- External monitor evidence must be opt-in or confirmation-only.

4. Verify refresh plan safety:

- Actions must be `executeMode: "manual"`.
- Production refresh plan code must not call `spawn`, `exec`, `execFile`, `spawnSync`, `writeFile`, `writeFileSync`, crawler/import/backfill/load/apply commands, or DB mutation helpers.
- Refresh plans may display commands as text only.

5. Verify gate coverage:

```powershell
node --test scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate.ps1
```

Use narrower tests first while editing. Run full quality gate before claiming the chain is stable or committing.

## Decision Rules

- **Stable foundation:** every chain piece exists, safety tests cover the risky states, and quality gate passes.
- **Foundation gap:** missing manifest, no freshness audit, no manual refresh plan, no gate coverage, unsafe command ambiguity, invalid evidence can pass as fresh, or UI/API derives freshness independently.
- **Feature-ready:** stable foundation plus no uncommitted unrelated work.

When a gap exists, fix the smallest upstream piece first. Prefer test-first changes.

## Output Template

Report in this shape:

```md
## Chain Status
- Chain:
- Current verdict:
- Source of truth:
- Consumers:

## Foundation Gaps
- Critical:
- Important:
- Minor:

## Safe Next Plan
- Files:
- Tests:
- Commit scope:

## Validation
- Commands run:
- Passed:
- Warnings:
- Blocked:
```

