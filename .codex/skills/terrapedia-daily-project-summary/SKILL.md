---
name: terrapedia-daily-project-summary
description: Use when managing TerraPedia daily or long-term project progress, including daily summaries, project-manager reviews, plan alignment, milestone drift, risks, gaps, blockers, next priorities, rollbacks, features, bug fixes, and optimization suggestions.
---

# Terrapedia Daily Project Manager

## Overview

Act like the TerraPedia project manager for daily and long-running project control. Create evidence-based daily records, map work back to long-term plans, maintain risks and decisions, and recommend the next priorities without inventing progress.

## Safety Boundaries

- Do not run crawler, import, backfill, DB-writing, rollback, service restart, cleanup, staging, commit, stash, or revert commands.
- Do not copy full diffs, long logs, or code blocks into management records.
- Treat unrelated dirty worktree files as existing user or parallel-task changes; mention them without modifying them.
- Do not write "verified", "passed", or "fixed" unless a command was actually run and its result is known.
- If runtime, DB, or test verification is requested, run only the relevant read-only or test command and record the command and result.

## Default Records

Default to git-trackable project-management records:

```text
docs/project-management/daily/YYYY-MM-DD.md
docs/project-management/current-status.md
docs/project-management/risk-register.md
docs/project-management/decision-log.md
```

Use `task/YYYY-MM-DD_daily-project-summary/` only when the user explicitly asks for local task archival or when large logs/artifacts are generated. `task/` is ignored in this repo, so it is not the default long-term management record.

## Evidence Workflow

1. Identify repo root with `git rev-parse --show-toplevel`.
2. Establish the report date. Default to today's local date unless the user names another date.
3. Inspect git evidence:

```powershell
git log --since='<YYYY-MM-DD 00:00>' --until='<YYYY-MM-DD 23:59:59>' --oneline --decorate --date=short --pretty=format:'%h %ad %s'
git status --short
git diff --stat
git diff --name-status
```

4. Read project-management context, newest first where applicable:

- `docs/plans/*.md`
- `docs/superpowers/plans/*.md`
- `docs/superpowers/specs/*.md`
- `project-plan/00_*.md`
- `docs/project-management/current-status.md`
- `docs/project-management/risk-register.md`
- `docs/project-management/decision-log.md`
- `task/*/docs/summary.md` only as supplementary local history

5. Classify daily work:

- **Rollback or revert:** revert/rollback wording, restored behavior, or explicit user notes.
- **New feature:** user-facing capability, API/page/script flow, or maintained data chain.
- **Bug fix:** fix commits, defensive behavior, failed-state repair, or regression tests.
- **Data or script work:** crawler, normalization, import, sync, projection, audit, workflow, or report changes.
- **Docs or process:** plans, specs, skills, SOP, quality gates, runbooks, or task summaries.
- **Unfinished work:** dirty files, open items, blocked validations, plan drift, or follow-ups.

## Project-Manager Analysis

After summarizing work, always answer these management questions:

- Which long-term plan, milestone, phase, or project goal did this work advance?
- Did the day move the project toward Phase B stabilization, Phase C public quality, or another stated goal?
- Is progress on track, drifting, blocked, or expanding scope?
- What quality gates, acceptance checks, runtime checks, or data checks are missing?
- What risks were created, reduced, escalated, or closed?
- What should be the next P0/P1/P2 priorities?
- Should the project keep building features, stabilize the foundation first, or adjust the plan?

If a conclusion is based only on docs or git history, label it as document-level judgment. If a conclusion is based on a fresh command, cite the command.

## Daily Report Shape

Match the user's language in generated reports. For Chinese requests, write natural Chinese headings and bullets.

```md
# Daily Project Management - YYYY-MM-DD

## Daily Summary
- Rollbacks:
- Features:
- Bug fixes:
- Data/scripts:
- Docs/process:

## Plan Alignment
- Long-term plan:
- Milestone or phase:
- Progress verdict:
- Drift or blockers:

## Project Health
- Stable:
- Weak:
- Needs management attention:

## Risk Register Updates
- New:
- Escalated:
- Reduced:
- Closed:

## Priority Plan
- P0:
- P1:
- P2:

## PM Conclusion
- Decision:
- Reason:
- Next management checkpoint:

## Evidence And Unverified Items
- Reviewed:
- Verified by command:
- Not verified:
```

If a category has no evidence, write the user's-language equivalent of `no clear evidence`.

## Long-Term Record Updates

When writing `docs/project-management/current-status.md`, keep it short:

- current phase
- active focus
- current blockers
- next P0/P1/P2
- last updated date

When writing `risk-register.md`, maintain a compact table with:

- id
- risk
- status: new, active, escalated, reduced, closed
- impact
- evidence
- next action
- last seen

When writing `decision-log.md`, add only management-level decisions:

- date
- decision
- reason
- evidence
- expected follow-up

Do not duplicate the full daily report in these files.

## Output Discipline

- In chat, report the daily file path and the top management conclusions only.
- Keep each bullet actionable and evidence-based.
- Separate committed work from uncommitted work.
- Mark uncertain classifications as suspected or tentative.
- Prefer specific risks: missing tests, plan drift, stale docs, unmanaged data chain ownership, unclear API contracts, weak acceptance gates, or ignored dirty worktree.
- Do not repeat long background from `project-plan/00_*.md`; cite only the current phase, risk, or gate when relevant.
- If the user asks for a pure chat summary, skip file writes but keep the same management structure.
