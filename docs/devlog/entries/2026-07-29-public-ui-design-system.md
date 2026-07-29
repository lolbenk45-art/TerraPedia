# Public UI Design System Baseline

## Status

`closed`

## Goal

Establish one public-page design baseline from the homepage and the approved
item, NPC, and article high-fidelity directions so future work cannot drift
into unrelated palette, hierarchy, or layout systems.

## Result So Far

- Created `docs/design/terrapedia-public-ui-design-system-v1.md`.
- Created the three-theme visual specimen:
  `.superpowers/brainstorm/3542442-1785229764/content/public-ui-design-system-v1.html`.
- Recovered and formalized the three existing runtime themes: `dark` / Forest
  Archive, `morning-paper` / Linen Paper, and `warm-slate` / Mist Workbench.
- Defined page archetypes, material/depth system, information-density rules,
  component constraints, forbidden patterns, and review checklist.

## Evidence

- Current token sources: `front-nuxt/assets/css/hifi-preview.css`,
  `front-nuxt/assets/css/tokens.css`, and `front-nuxt/stores/theme.ts`.
- Historical approved light-theme source: commit `5b599fdc` and
  `docs/superpowers/specs/2026-07-22-light-theme-button-system-design.md`.
- Approved high-fidelity references remain under the item/NPC and article
  brainstorm directories named in the design-system document.
- Browser validation for the specimen passed at `1440x1000` and `390x844` for
  all three themes: no horizontal overflow, console errors, or request
  failures.
- Root `AGENTS.md` now makes the baseline mandatory for every public visual
  task and names theme, archetype, forbidden-pattern, review, and validation
  gates.

## Scope And Follow-up

- No production Vue/CSS implementation is authorized by this entry.
- The baseline is mandatory for future visual work. No production Vue/CSS page
  implementation is included in this documentation-only change.

## Closeout

- Commit: `52a83c59` (`docs(front): establish public UI design baseline`).
- Validation: the committed specimen passed the recorded three-theme desktop
  and mobile browser checks; the Markdown baseline and root `AGENTS.md` are in
  the same commit.
- Residual risk: none for the documentation baseline; production fidelity is
  tracked separately by `2026-07-29-approved-public-pages-production.md`.
- Follow-up: none in this entry.
