# Armor Set Detail Dedup Design

## Goal

Optimize the public armor set detail page so structured numeric values are the primary reading path and repeated effect text is removed.

## Approved Direction

Use build cards as the only primary stat display. Each card represents one usable head variant plus the shared body and leg pieces. The card combines:

- matched single-piece effects for the card's pieces;
- set effects that apply after equipping the full set;
- structured numeric values such as defense, damage, crit, speed, mana, summon, or special effects.

## Display Rules

- Prefer structured `effects` from the public armor set API.
- Use fallback benefit text only when structured effects are unavailable.
- Deduplicate stat lines inside each build card by normalized text.
- Hide the old standalone benefit-chip block when structured effects exist, because it repeats the same information in prose form.
- If fallback prose is needed, show it as compact source context after the build cards.
- Keep grouped armor pieces and preview images, but do not reintroduce repeated equipment thumbnails in the stat area.

## Scope

In scope:

- `front-nuxt/pages/armor-sets/[id].vue`
- existing front-end contract scripts under `front-nuxt/scripts`
- focused tests for deduplication markers and structured-value priority

Out of scope:

- backend API changes;
- database refreshes;
- armor set index page redesign;
- item detail page changes.

## Validation

- Add or update a front-end contract script so the page must keep build-card-first rendering.
- Verify repeated prose fallback is not rendered when structured effects are present.
- Run the relevant front-end checks, including armor stat visual checks.
