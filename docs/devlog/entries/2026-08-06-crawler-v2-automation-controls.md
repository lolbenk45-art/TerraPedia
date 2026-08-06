# Devlog: crawler-v2-automation-controls

## Status

`closed`

## Context

- User goal: restore controllable automation in V2 and add a mock crawl test using real base-domain input.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`

## Direction / Decisions

- V1 remains retired from live routing.
- V2 automation is disabled by default and its manual scan cannot enqueue while disabled.
- The acceptance fixture reads items input only and writes no database or canonical data.
- Biomes is deliberately excluded from changed-only automation because its
  preview action does not advance the ingestion manifest.
- Scheduler due checks and source scans execute under one V2 mutation permit.

## Scope

- Backend: V2 automation config, sweep endpoint, and V2-only source-change enqueue path.
- Frontend: stable system drawer and V2 automation controls.
- Fixture: isolated items-input simulation with monitor-visible V2 artifacts.
- Out of scope: enabling real automation or a real crawl.

## Validation

- Backend focused suites: `357/357` passed.
- Admin page and engine-mode contracts: `61/61` passed.
- Fixture and smoke-script contracts: `7/7` passed; `bash -n` passed.
- `pnpm run check` passed for `data-query-app`.
- Runtime readback after restart: `queueContractVersion=2`, V2 automation
  `enabled=false`, interval `60`, live queue count `0`.
- Standalone real-data acceptance read three tracked items (`IronPickaxe`,
  `DirtBlock`, `StoneBlock`) and wrote only `/tmp/terrapedia-items-fixture-*`.
- `git diff --check` passed.

## Review

- Independent review initially blocked commit on repeated biome preview,
  fixture failure progress, and scheduler due-check concurrency.
- Disposition: excluded biomes from automation, added terminal failed progress
  and regression coverage, and moved due evaluation into the mutation permit.
- Re-review then found the network checker still held the global V2 mutation
  permit. The sweep now uses a dedicated cross-process automation claim, holds
  the global permit only for short mode/due checks, and re-enters the normal V2
  dispatch path for each enqueue. A regression test asserts source detection
  executes outside the global permit.
- A later review found an enabled-check/enqueue window. The final implementation
  performs V2 mode validation, enabled re-read, and enqueue inside one short
  mutation permit; deterministic coverage disables automation immediately
  before that permit executes and verifies no enqueue occurs. Final re-review
  found no remaining high or medium severity findings and cleared the commit
  block.

## Residual Risks

- Existing generated Town NPC files and `data/generated/resume/` are unrelated
  runtime artifacts and remain untouched.
- The full alternate fixture-stack V2 smoke was not run because it requires a
  dedicated fixture namespace/root/Redis DB gate. Its script and refusal guards
  are covered, and no production Redis namespace was modified.

## Follow-up

- Run the full isolated fixture-stack smoke when that operational gate is next approved.

## Commits

- Commit SHA pending in final response.
