# Workspace Hygiene Baseline - 2026-05-24

## Main State
- Main worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-admin-npc-zh-merge-2026-05-22`
- Main commit: `d127331`
- Origin main commit: `d127331`
- Status command: `git status --short --branch`
- Result: `## main...origin/main`

## Execution State
- Cleanup execution worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/chore-workspace-hygiene-closeout-2026-05-24`
- Cleanup branch: `chore/workspace-hygiene-closeout-2026-05-24`
- Cleanup branch baseline commit after plan cherry-pick: `86084f1`
- Plan source branch: `plan/workspace-hygiene-closeout-2026-05-24`
- Plan source commit: `97b72a9`

## Inventory
- Worktree count before cleanup: `68`
- Merged local branch count before cleanup: `80`
- Unmerged local branch count before cleanup: `7`
- Unmerged local branches before cleanup:
  - `chore/local-stack-front-nuxt-2026-05-23`
  - `chore/workspace-hygiene-closeout-2026-05-24`
  - `feat/home-hero-density-options-2026-05-21`
  - `feat/public-item-detail-data-layer-2026-05-20`
  - `fix/catalog-pagination-density-2026-05-20`
  - `plan/basic-public-site-v0.1-2026-05-23`
  - `plan/workspace-hygiene-closeout-2026-05-24`

## Dirty Worktrees
- Result: no dirty worktrees were found.
- Evidence file: `/tmp/terrapedia-dirty-worktrees-before.txt`

## Runtime Roots
- Ports checked: `18088`, `5174`, `3001`, `6380`, `9000`
- Result: TerraPedia local stack ports were listening.
- Runtime cwd evidence:
  - MinIO/public asset process `512922`: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24`
  - Backend process `513210`: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24/back`
  - Front Nuxt process `513460`: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24/front-nuxt`
  - Admin process `513565`: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-local-stack-preview-closeout-smoke-2026-05-24/data-query-app`
- Evidence file: `/tmp/terrapedia-runtime-before.txt`

## Cleanup Policy
- Remove only clean worktrees whose branch tips are contained by both `main` and `origin/main`.
- Preserve unmerged branches unless the operator explicitly approves a separate archival/delete pass.
- Stop or migrate runtime before removing any worktree that owns a running local stack process.
- Do not delete remote branches.
