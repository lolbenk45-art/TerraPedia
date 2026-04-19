# NPC Rich Closure Design

**Goal:** Deepen the existing `npc` closure in `data/wiki-crawler` so the crawler produces structured, consumer-ready NPC fields from raw wiki pages without introducing heavyweight template expansion or application-side import logic.

**Scope:** Only the crawler workspace under `data/wiki-crawler`, focused on the `npc` domain. No new top-level domain such as `boss`, no frontend work, and no binary/media download.

## Why This Change

The current `npc` closure is operationally complete but semantically thin:

- raw page info and relations are preserved
- `normalized-light`, `canonical`, and `audit` outputs regenerate correctly
- targeted entity recovery works

But the produced NPC record still lacks the fields that make NPC pages useful to downstream consumers:

- infobox fields such as type and environment
- shop inventory
- happiness and living preference signals
- shimmer/bound-state hints
- concise page summary

For example, pages such as Goblin Tinkerer already contain stable structure in:

- `{{npc infobox ...}}`
- `{{shop row|...}}`
- `{{living preferences}}`
- `{{NPC shimmered form|...}}`
- the lead paragraph and named sections

The crawler should project those structures into `npc` outputs while keeping the raw-first architecture intact.

## Design Choice

Use a **semi-structured extraction** strategy.

This means:

- parse only the highest-value, repeatable wiki patterns already present in NPC pages
- preserve difficult sections as structured raw text blocks instead of over-parsing them
- avoid MediaWiki `parse` / `expandtemplates` for this phase

This is the recommended middle path because it raises consumer value substantially without turning the crawler into a full wiki renderer.

## Rejected Alternatives

### Full Template Expansion

Parse or expand all templates to reconstruct near-final page meaning.

Rejected because:

- implementation cost is high
- behavior is more sensitive to wiki template changes
- operational stability would drop before the current closure quality is fully proven

### Raw Section Projection Only

Split NPC pages into rough sections and store section text with little structured extraction.

Rejected because:

- downstream consumers still cannot reliably answer basic NPC questions
- the crawler would remain too close to raw text for search/index/useful frontend projection

## Closure Target

After this upgrade, the `npc` domain should answer the following clearly:

- data comes from raw page info, raw relations, and stable wiki markup blocks in the page revision text
- edits are maintained by rerunning `entity`, `recent-changes`, `backfill`, and full crawl phases
- correctness is validated by NPC-specific audits on required structured fields
- downstream consumers can read canonical NPC records without reparsing page wikitext
- completion means a representative NPC page can be fetched, normalized, canonicalized, audited, and inspected with rich structured fields present

## Data Model Additions

### Normalized-Light NPC Record

Extend `normalized-light/npc/<entity>.latest.json` with the following sections.

#### Identity And Summary

- `display.name`
- `summary.leadText`
- `summary.sourceDescription`

Purpose:

- keep a concise, human-readable summary
- retain page-level description signals from pageprops or the lead paragraph

#### NPC Profile

- `profile.kind`
- `profile.subtypes[]`
- `profile.environment[]`
- `profile.boundVariantName`
- `profile.shimmerForm`

Purpose:

- expose core infobox meaning without requiring consumers to inspect raw template text

#### Combat Or Stats Hints

- `combat.baseDamageText`
- `combat.extraDamageText`
- `combat.projectileId`

Purpose:

- preserve stable, high-signal numeric or pseudo-numeric fields from the infobox
- keep them as text where exact semantic parsing is not yet safe

#### Shop

- `shop.items[]`

Each item entry should include:

- `name`
- `availabilityNote`
- `valueText`

Purpose:

- allow downstream consumers to show NPC inventory immediately
- retain conditions as text instead of forcing premature normalization

#### Happiness

- `happiness.sourceTemplatePresent`
- `happiness.notes[]`

Purpose:

- record whether structured living preference content exists
- preserve parsed preference signals when recoverable
- allow partial extraction without failing the whole record

#### Relationships

- `relationships.relatedNpcs[]`
- `relationships.relatedItems[]`
- `relationships.relatedBiomes[]`

Purpose:

- expose important linked entities from infobox, lead text, and shop blocks
- make `npc` records more navigable even before full cross-domain graph work

#### Content Blocks

- `contentBlocks.dialogue`
- `contentBlocks.tips`
- `contentBlocks.history`

Purpose:

- preserve valuable page sections in stable named slots
- avoid losing meaning when exact structural parsing is not yet worth the complexity

### Canonical NPC Record

Extend `canonical/npc/<entity>.latest.json` with a thinner, consumer-focused projection:

- `summary`
- `profile`
- `shop`
- `happiness`
- `relationships`

Canonical should intentionally omit verbose raw text except for short summaries and directly useful structured arrays. Larger narrative sections remain primarily a normalized-light concern.

## Extraction Rules

### Lead Summary

Primary source order:

1. `pageprops.description`
2. lead paragraph from revision text
3. empty string if neither is available

The summary should remain text-only and not attempt deep wiki markup rendering.

### Infobox Extraction

Parse the first `npc infobox` block found in revision text.

Initial fields to extract:

- `type`
- `type2`
- `environment`
- `damage`
- `damage2`
- `idprojectile`

Rules:

- preserve raw text values where exact typing is unclear
- treat repeated or alternate infoboxes as secondary variants, not parse failures

### Shop Extraction

Find `{{shop ...}}` and nested `{{shop row|...}}` entries.

For each row:

- first positional value becomes the item name
- `value=` becomes `valueText`
- trailing free text becomes `availabilityNote`

If a row cannot be fully parsed, keep at least the item name when possible.

### Happiness Extraction

Do not attempt full expansion of `{{living preferences}}`.

Instead:

- mark template presence
- capture recoverable preference signals from explicit nearby NPC or biome mentions when available
- keep unresolved text as notes

This keeps the first version stable while leaving room for a later preference-db integration step.

### Shimmer And Bound-State Extraction

Detect:

- `{{NPC shimmered form|...}}`
- `{{Lifeform Analyzer note|...}}`

Project:

- shimmer form presence and label
- bound-state or rescue-form name when clearly available

### Section Block Extraction

Split wikitext by stable section headings:

- `== ... ==`
- `=== ... ===`

Capture first-pass named blocks:

- dialogue
- tips
- history

Store them as cleaned text or minimally cleaned wiki text blocks. Do not over-render.

## Audit Changes

Extend NPC audit rules so rich closure quality is measurable.

### Pass

Pass when:

- source metadata remains complete
- canonical record exists
- summary is present
- at least one of `profile.environment`, `shop.items`, or `contentBlocks.dialogue/history` is present

### Warn

Warn when:

- infobox exists but no profile fields were extracted
- shop template appears but shop items are empty
- happiness template appears but no happiness projection was captured

### Fail

Fail when:

- raw NPC page exists but rich normalization cannot be built at all
- canonical record is missing required summary/profile structure

## File And Module Impact

Primary files expected to change:

- `data/wiki-crawler/src/domains/npc-domain.mjs`
- `data/wiki-crawler/src/lib/closure-pipeline.mjs`
- `data/wiki-crawler/src/phases/audit.mjs`
- `data/wiki-crawler/src/phases/canonicalize.mjs`
- `data/wiki-crawler/tests/...`

Likely new helper modules:

- `data/wiki-crawler/src/domains/npc-parser.mjs`

Purpose of the helper:

- isolate wikitext extraction heuristics from domain assembly
- keep `npc-domain.mjs` readable and testable

## Validation Plan

### Automated

- add parser-focused unit tests for infobox, shop, shimmer, and section extraction
- add normalized-light and canonical assertions for representative NPC fixtures
- keep full `node --test data/wiki-crawler/tests/**/*.test.mjs` green

### Live

Validate at least one representative NPC page such as Goblin Tinkerer by running:

- `entity --domain=npc --page-id=<id> --skip-files`

Check:

- raw page info exists
- normalized-light NPC contains rich sections
- canonical NPC contains projected consumer fields
- audit result is `pass` or at worst `warn` with explicit reasons

## Completion Criteria

This work is complete when:

- `npc` normalized-light records contain structured summary, profile, shop, and content blocks
- canonical NPC records expose a thin consumer-facing projection of those fields
- audits can distinguish missing rich extraction from healthy extraction
- targeted NPC rebuilds remain stable in light or medium file-fanout modes

## Out Of Scope

- separate `boss` domain introduction
- full dialogue line expansion by condition
- full happiness database reconstruction from wiki templates
- complete cross-domain graph formalization
- frontend consumption changes
