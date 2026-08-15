# Project Structure Compatibility Window Closure

## Status

`closed`

## Goal

Close the post-migration compatibility window after a full current-consumer scan, then remove the eight legacy symlink entrypoints without touching data, reports, or runtime behavior.

## Scope

- Owner: Codex
- Branch: `refactor/close-structure-compat-window`
- Worktree: `/home/lolben/TerraPedia/.worktrees/close-structure-compat-window`
- Parent: project structure professionalization migration (`9f386e40`)
- Dependencies: canonical directory migration is already integrated; current consumer scan must pass before deletion.
- Contract handoff: `docs/architecture/project-structure-v2.md` and `scripts/config/project.constants.json`

## Current state

- Eight legacy symlink paths have been removed; canonical directories are the
  only code entrypoints.
- Main worktree Shimmer data, authorization reports, and unrelated uncommitted work are out of scope and untouched.
- Initial code/CI scan is canonical. Expanded documentation review repaired current governance, README, runbook, design, operations, and contract references; historical audits, reports, plans, and design specimens retain old paths as evidence.

## Validation plan

- Read-only current/history reference census before edits.
- Manifest and Node path-contract tests.
- `git diff --check` and targeted canonical-path scans.
- Canonical public/admin/backend checks proportional to changed surfaces.
- Symlink absence and canonical directory existence checks after deletion.

## Validation evidence

- Eight retired paths absent; nine canonical roots are real directories.
- Node path suites 9/9 and Shell/PowerShell/crawler contracts 6/6 pass.
- Admin canonical `pnpm run check` passes after frozen-lockfile dependency install.
- Backend focused path/acceptance Maven suite passes 307/307.
- Runtime/CI scan has no retired-path references outside the intentional
  absence-guard test. Expanded active-document review repaired the mandatory
  public UI baseline, design references, operations guide, contracts,
  governance, and runbooks; dated evidence and plans remain explicitly
  historical in the closure audit.
- Public sitemap check remains blocked by the pre-existing missing
  `apps/public-web/public/sitemap.xml` prerequisite.
- Read-only local quality gate (front/admin/backend skipped) reports 321/326;
  five failures are missing authorization/owner-phase fixtures in this isolated
  worktree and are unrelated to symlink closure.
- Review repair: the mandatory public UI baseline, active design/operations/
  contract/governance references, and root/architecture structure indexes now
  point to canonical roots; the 2026-04-27 redesign is explicitly historical.

## Risks and boundaries

- Do not rewrite historical evidence merely to remove old path strings.
- Do not move or regenerate `data/`, `reports/`, Shimmer, authorization, or build artifacts.
- Do not run database writes, crawler apply/force, Redis reset, or external refreshes.
- Existing public sitemap prerequisite and standardized-data hash drift are unrelated residual variances if encountered.

## Next step

Commit SHA pending in final response. The main worktree's Shimmer and
authorization changes remain outside this branch and must not be staged.

## Closeout

- Result: compatibility window closed; all eight tracked symlink entrypoints
  were removed and current canonical-path contracts/governance are updated.
- Review: independent review repaired active-document and architecture-index
  gaps; final re-review found no critical or important findings.
- Residual risks: public sitemap and isolated-worktree authorization fixture
  baselines remain unrelated validation variances.
- Follow-up: none for the structure migration; restore only through Git revert
  if a future current consumer is discovered.
