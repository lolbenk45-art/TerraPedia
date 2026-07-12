# Devlog: Page Head Density

## Status

`closed`

## Context

- User goal: reduce visual weight and first-screen height of ordinary public page headers without losing page orientation or primary navigation.
- Branch: `review/page-head-inner-density`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/page-head-inner-density`
- Base: `5738633`
- Related docs: `docs/project-governance/00_CURRENT_SPEC.md`, `docs/project-governance/00_WORKFLOW.md`, `docs/superpowers/specs/2026-07-12-page-head-density-design.md`, `docs/superpowers/plans/2026-07-12-page-head-density.md`
- Related prior entries: crawler runtime work is isolated and does not share frontend files or this service lifecycle.

## Direction / Decisions

- Chosen approach: desktop ordinary public headers use the approved C variant and do not render; item and NPC catalog pages retain the mobile command header that keeps the title, count, and action on one row and hides redundant description copy.
- Reasoning: the user selected C after reviewing the PC preview, prioritizing direct access to first-screen content over persistent contextual copy.
- Rejected options: retain the thin desktop contextual header; remove `page-head-inner` globally; change the biome environment hero.

## Scope

- Frontend: `front-nuxt/assets/css/primitives.css`, item/NPC index templates, and focused frontend contract checks.
- Backend: none.
- Data: none.
- Docs/process: this entry, current devlog, approved design specification, and implementation plan.
- Out of scope: other page-family content rewrites, nav redesign, biome hero, API changes, database writes, and service lifecycle changes.

## Validation

- RED: focused visual-system and public-page contracts failed as expected before the command modifier and thin-shell CSS existed.
- GREEN: `node scripts/check-visual-system-contract.mjs` and `node scripts/check-public-pages.mjs` both passed after implementation.
- Browser: inspected `/items` and `/npcs` at 1440x900 and 390x844 from the isolated frontend on port 15179. Evidence is in `reports/page-head-inner-design-previews/final-2026-07-12-r2/` (ignored generated artifacts).
- Shared frontend gate: `cd front-nuxt && pnpm run check` passed. Chromium emitted existing DBus `UPower` and Node `DEP0205` environment warnings only; no check or type failures.
- C revision: focused visual-system and public-page contracts passed after adding the desktop-only C rule; `/npcs` was checked at 1440px on the new port 15180 with real API data and no normal page header rendered.
- Not run: full local stack lifecycle, backend tests, data operations, or browser tests requiring authentication.

## Result

- Completed: ordinary desktop public headers use the user-selected C treatment and do not render; biome environment heroes are excluded. Item and NPC catalogs retain the mobile command header. NPC uses a compact mobile-only `Boss 路线` label so title, count, and action remain on one line at 390px; desktop catalog content begins directly under navigation.
- Affected implementation paths: `front-nuxt/assets/css/primitives.css`, `front-nuxt/pages/items/index.vue`, `front-nuxt/pages/npcs/index.vue`, `front-nuxt/scripts/check-visual-system-contract.mjs`, and `front-nuxt/scripts/check-public-pages.mjs`. See git for code-level diff details.

## Residual Risks

- Desktop header removal is global for ordinary `page-head` instances; future routes that require contextual desktop copy need an explicit hero/exception treatment. The command modifier remains limited to item and NPC catalog pages.

## Follow-up

- None.

## Commits

- Commit SHA pending in final response.
