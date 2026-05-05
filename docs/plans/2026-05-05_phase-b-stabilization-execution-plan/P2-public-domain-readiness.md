# P2 Public Domain Readiness Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record P2 readiness conditions without implementing new public domain code.

**Architecture:** P2 remains a documentation and readiness-gate planning task. It records future entry criteria for Boss/NPC aggregation and Buff/Projectile/ArmorSet public surfaces while preserving `planned-public` as non-route-ready.

**Tech Stack:** Markdown plans and project-management records.

---

## Files

- Create: `docs/plans/2026-05-05_phase-b-p2-public-domain-readiness.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`

## Steps

- [ ] **Step 1: Create P2 readiness doc**

Use this content:

```markdown
# Phase B P2 Public Domain Readiness

## Scope

This document records readiness conditions only. It does not authorize public Boss, Buff, Projectile, or ArmorSet route implementation.

## Boss Candidate

Boss can be evaluated as an NPC aggregate/filter candidate after Domain Acceptance is fresh or explicitly warning-only.

## Buff Entry Conditions

- sourceReadiness fresh or accepted warning
- imageReadiness fresh or accepted warning
- publicReadiness pass
- public route/API contract approved

## Projectile Entry Conditions

- sourceReadiness fresh or accepted warning
- relationReadiness fresh or accepted warning
- imageReadiness fresh or accepted warning
- public route/API contract approved

## ArmorSet Entry Conditions

- sourceReadiness fresh or accepted warning
- relationReadiness fresh or accepted warning
- imageReadiness fresh or accepted warning
- public route/API contract approved

## Blocking Rules

- Any public-blocking missing/unknown evidence blocks implementation.
- `publicExposure=planned-public` does not permit route creation by itself.
- UI fallback cannot convert readiness to pass.
```

- [ ] **Step 2: Update project records**

Add to `current-status.md`:

```markdown
## P2 Status

P2 is readiness-only after P1. No new public Boss, Buff, Projectile, or ArmorSet code is scheduled in Phase B.
```

Add risk row:

```markdown
| R-2026-05-05-07 | High | Public domains | Planned-public domain is treated as route-ready | P2 document requires Domain Acceptance evidence before implementation | Open |
```

- [ ] **Step 3: Validate docs**

Run:

```powershell
Test-Path .\docs\plans\2026-05-05_phase-b-p2-public-domain-readiness.md
Select-String -Path .\docs\plans\2026-05-05_phase-b-p2-public-domain-readiness.md -Pattern "readiness conditions only"
Select-String -Path .\docs\project-management\current-status.md -Pattern "P2 is readiness-only"
```

Expected: all commands return success or visible matches.

- [ ] **Step 4: Commit**

Run:

```powershell
git add docs/plans/2026-05-05_phase-b-p2-public-domain-readiness.md docs/project-management/current-status.md docs/project-management/risk-register.md
git commit -m "docs: record phase b p2 public domain readiness"
```
