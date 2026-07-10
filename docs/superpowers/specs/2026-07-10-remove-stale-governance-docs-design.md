# Remove Stale Governance Root Documents

Status: approved design
Date: 2026-07-10

## Goal

Remove obsolete root governance documents that can misdirect future work, while
keeping current authority routes complete and preserving historical provenance
in Git and existing devlog entries.

Success means:

- the eight approved stale files no longer exist in the working tree;
- current governance documents no longer present those files as usable
  references;
- current status, risk, and devlog state describe the removal accurately;
- historical devlog entries remain unchanged as audit evidence;
- focused documentation checks pass without application, data, or runtime
  changes.

## Approved Deletion Set

Delete exactly these files:

1. `docs/project-governance/03_TECH_STACK.md`
2. `docs/project-governance/04_ARCHITECTURE.md`
3. `docs/project-governance/07_TESTING_STRATEGY.md`
4. `docs/project-governance/08_CICD_DEPLOYMENT.md`
5. `docs/project-governance/09_SECURITY.md`
6. `docs/project-governance/10_OPERATIONS.md`
7. `docs/project-governance/11_DOCUMENTATION_SYSTEM.md`
8. `docs/project-governance/12_RELEASE_CHECKLIST.md`

Do not delete or rewrite:

- `01_OVERVIEW.md`, `02_REQUIREMENTS.md`, or `06_UI_UX_GUIDELINES.md`;
- anything under `docs/project-governance/archive/` or `legacy/`;
- historical devlog entries that record the deleted paths;
- application, crawler, data, dependency, or runtime files.

## Decision

Use hard deletion from the current tree. Git history remains the recovery and
provenance mechanism.

Rejected alternatives:

- Moving the files to `archive/`: they would remain searchable and easier to
  mistake for usable project guidance.
- Replacing them with tombstone files: the root paths would remain visible and
  continue to invite accidental opening.
- Rewriting the old bodies: that would create competing current authorities
  instead of removing them.

## Current-State Synchronization

Update these live records in the same task:

- `docs/project-governance/INDEX.md`: remove usable routing for the eight files
  and record that the stale root set was intentionally removed.
- `docs/project-governance/current/PROJECT_CONTROL.md`: remove the eight table
  rows and replace stale-file control wording with the current companion-doc
  boundary.
- `docs/project-management/current-status.md`: replace statements that the
  files remain in place with the completed removal state.
- `docs/project-management/risk-register.md`: mark the stale-root-document risk
  mitigated and name Git history as the recovery path.
- `docs/devlog/current.md` and the task entry: keep handoff, validation, review,
  and residual-risk evidence current.

`docs/project-governance/00_CURRENT_SPEC.md` does not need a fact change: its
authority order and placement rules already route historical material through
`archive/` and `legacy/`, not the deleted root files.

## Historical Evidence Policy

Existing devlog entries remain immutable historical evidence even when they
mention a deleted path. Those references describe what existed at the time and
must not be rewritten as if the files never existed.

Current routing scans must separate live authority files from historical
records so historical provenance does not produce a false failure.

## Verification Design

Add `scripts/dev/stale-governance-removal.test.mjs` as a focused contract test.
It must assert:

- all eight approved paths are absent;
- `01`, `02`, and `06` remain present;
- the live governance index and control panel describe the stale-root set as
  removed rather than routable;
- current status and risk records describe the completed mitigation;
- historical devlog entries remain available.

Use a red-green sequence:

1. Run the focused test before deletion and confirm it fails because the stale
   files still exist.
2. Delete the eight files and update live current-state records.
3. Run the focused test again and require all assertions to pass.
4. Run `node --test scripts/dev/code-style-governance.test.mjs` to prove current
   code-style routing remains intact.
5. Run `git diff --check` and targeted live-reference scans that exclude
   historical devlog, archive, legacy, spec, and plan records.
6. Review the exact staged scope before commit.

Application, backend, frontend, database, crawler, and full runtime gates are
not required because this task changes documentation governance only.

## Failure Handling And Rollback

- If a live consumer links to a deletion target, update that live consumer in
  the same task before deletion is accepted.
- If a deleted document contains unique current knowledge not represented by a
  maintained companion document, stop and revise the design rather than copy
  stale content blindly.
- If validation or review finds a material gap, keep the devlog `active` and do
  not commit or merge.
- Git history and the task commit provide rollback; no backup copies or
  replacement tombstones are created.

## Commit Boundary

The design and implementation may use separate focused commits. The final
implementation commit must contain only the eight deletions, live governance
updates, the focused test, the implementation plan, and task devlog closeout.
