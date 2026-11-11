# Repository cleanup and recrawl MySQL archive

## Status

`closed`

## Context

- User stopped all prior tasks, authorized branch/worktree cleanup after recoverable GitHub snapshots, and requested a handoff Markdown per branch.
- The clarified local-data scope is only the inactive recrawl MySQL directory; other root `.local` content is retained.
- Branch: `main`; worktree: `/home/lolben/TerraPedia`; owner: Codex; parent: none.

## Direction / Decisions

- Preserve each branch independently, without integrating unfinished branches into main.
- Nineteen original branches plus one stash archive branch are committed and pushed; official GitHub refs were checked against all twenty exact local commit hashes.
- Four stashes have a self-contained bundle on the archive branch and an independent fetch/commit-graph recovery proof.
- Before local removal, preserve non-rebuildable ignored files, `.local` evidence and machine configuration in `.local/tmp/workspace-closeout-20261111/preserved-worktrees/` and verify every copied file.

## Validation

- Changed-source JavaScript syntax: 198 checks; JSON parsing: 2497 files; zero failures.
- All staged whitespace checks passed. Full functional acceptance was intentionally not run for cancelled work.
- Pre-cleanup and post-snapshot Git bundles verified; exact GitHub refs and clean worktrees verified for all twenty branches.
- MySQL source hashes and full archive readback match for 577/577 files; archive SHA-256 is `adfa5db7edc08dd034a1786af8a0aedd6964f408d3b2f8d8fa41e5b878df62cf`. Source directory was removed only after verification.

## Result

- Twenty independently recoverable GitHub branch snapshots are verified. Local Git now retains only main and the root worktree; 19 task/temporary worktrees and 19 local task branches were removed; 4 archived stashes were cleared.
- MySQL archive: `/mnt/d/Mysql/TerriaData/terrapedia-recrawl-mysql-20261111/mysql-full-recrawl-20261013.tar.gz` (4,093,318,674 bytes); 33,277,803,240 source logical bytes archived and the inactive source directory removed. Formal `/var/lib/mysql` and other root `.local` state remain unchanged by cleanup.
- Handoff index and machine-readable result: `docs/handoffs/2026-11-11-cleanup-summary.md` and `docs/handoffs/2026-11-11-cleanup-result.json`.
- Preserved machine-only configuration/evidence: `.local/tmp/workspace-closeout-20261111/preserved-worktrees/`; all selected copies were hash-verified before removal.
- Spec impact: no maintained boundaries, source ownership, default commands, or durable workflow rules changed; current spec is unchanged. Current status, risks and stop decision are recorded in project-management documents.

## Residual Risks

- Historical implementation blockers, expired authorization and unvalidated unfinished code remain in branch handoffs.
- Local-only configuration and runtime evidence must be restored separately if work resumes. The physical MySQL archive has content integrity verification, but no new MySQL restore/start rehearsal was performed.

## Follow-up

- None for this cleanup. Any feature resumption needs a new user objective and new active entry; branch recovery instructions are in the summary.

## Commits

- Twenty branch snapshot hashes are recorded in the tracked cleanup result; main closeout uses `commit SHA pending in final response`.
