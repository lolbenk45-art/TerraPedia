# Workspace Hygiene Cleanup - 2026-05-24

## Policy
- Removed only clean worktrees whose branch tips were contained by both `main` and `origin/main`.
- Deleted only local branches with `git branch -d`.
- Preserved dirty, unmerged, missing, protected, or runtime-rooted candidates.
- Did not delete remote branches.
- Did not use `git reset --hard`, `git clean -fd`, or force deletion.

## Removed Worktrees And Branches

```text
fix/front-nuxt-preview-final-smoke-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-front-nuxt-preview-final-smoke-2026-05-24
fix/local-stack-preview-closeout-smoke-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24
docs/project-preview-release-decision-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/docs-project-preview-release-decision-2026-05-24
fix/domain-a-grade-closeout-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-closeout-2026-05-24
fix/domain-a-grade-boss-image-lineage-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-boss-image-lineage-2026-05-24
fix/domain-a-grade-db-read-environment-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-db-read-environment-2026-05-24
fix/domain-a-grade-projectile-relation-coverage-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-domain-a-grade-projectile-relation-coverage-2026-05-24
plan/domain-a-grade-blocker-burn-down-2026-05-23	/home/lolben/.config/superpowers/worktrees/TerraPedia/plan-domain-a-grade-blocker-burn-down-2026-05-23
plan/domain-a-grade-remaining-review-2026-05-24	/home/lolben/.config/superpowers/worktrees/TerraPedia/plan-domain-a-grade-remaining-review-2026-05-24
```

## Preserved Candidates

No static cleanup candidate was rejected after runtime cleanup. Protected and unmerged branches remain outside the auto-clean candidate list.

## Verification
- Worktree inventory before cleanup: `68`
- Worktree inventory after cleanup: `59`
- Merged local branch count before cleanup: `80`
- Merged local branch count after cleanup: `71`
- Unmerged local branch count after cleanup: `7`
- Worktree inventory after cleanup: `/tmp/terrapedia-worktrees-after-cleanup.txt`
- Merged branch inventory after cleanup: `/tmp/terrapedia-branches-merged-main-after-cleanup.txt`
- Unmerged branch inventory after cleanup: `/tmp/terrapedia-branches-unmerged-main-after-cleanup.txt`
- Main status after cleanup: `/tmp/terrapedia-main-status-after-cleanup.txt`

## Runtime After Cleanup
- Backend `18088`: not listening.
- Front Nuxt `5174`: not listening.
- Admin `3001`: not listening.
- MinIO public `9000`: not listening.
- Redis `6380`: still listening; ownership was not verified and it was preserved.

## Primary Checkout
- Path: `/home/lolben/TerraPedia`
- Branch: `chore/local-stack-front-nuxt-2026-05-23`
- Commit: `7aedf91`
- Dirty status: clean.
- Decision: preserved.
- Reason: this branch is not merged into `main`, so switching or deleting it would risk losing unmerged work.
- Follow-up: new work should use the synced main worktree or a new main-derived worktree until `chore/local-stack-front-nuxt-2026-05-23` is reviewed and either merged, archived, or abandoned.

## Preserved Unmerged Branches

```text
chore/local-stack-front-nuxt-2026-05-23
chore/workspace-hygiene-closeout-2026-05-24
feat/home-hero-density-options-2026-05-21
feat/public-item-detail-data-layer-2026-05-20
fix/catalog-pagination-density-2026-05-20
plan/basic-public-site-v0.1-2026-05-23
plan/workspace-hygiene-closeout-2026-05-24
```
