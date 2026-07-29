# TerraPedia Public UI Design System v1

## Status

Approved design baseline for future public-page high-fidelity work and frontend
implementation. This document does not itself change any runtime page.

## Purpose

TerraPedia is a game knowledge system, not a marketing site. Public pages must
help a player identify an entity, compare facts, understand a relation, or find
the next article with minimal visual ambiguity.

This baseline prevents page-by-page reinvention. It fixes the shared visual
language while leaving each page type free to use the structure appropriate to
its data.

## Source Order

When a design decision conflicts, use this order:

1. Current production token ownership in `front-nuxt/assets/css/hifi-preview.css`
   and `front-nuxt/assets/css/tokens.css`.
2. The approved homepage information framing in `front-nuxt/pages/index.vue`
   and `front-nuxt/components/home/`.
3. Approved high-fidelity references:
   - item/NPC: `.superpowers/brainstorm/339185-1785149609/content/`
   - articles: `.superpowers/brainstorm/3542442-1785229764/content/articles-story-led-v22.html`
4. This document.
5. Historical previews and individual page CSS.

The homepage is a palette, material, and proportion reference. It is not a
layout template for article or entity-detail pages.

## Product Character

The public UI should read as a **field archive**:

- dark theme: focused, subterranean, precise, with warm metal and moss signals;
- light themes: quiet work surfaces, low saturation, readable tables and dense
  controls;
- data is the visual subject. Artwork confirms recognition but does not replace
  facts, relations, or navigation.

Avoid marketing-page composition, decorative floating cards, oversized empty
hero zones, and generic dashboard styling.

## Theme Contract

There are exactly three runtime themes. New pages consume semantic variables;
they do not introduce a local palette or a fourth theme.

| Runtime key | System name | Purpose | Character |
| --- | --- | --- | --- |
| `dark` | Forest Archive | Default public experience | deep forest surfaces, warm gold actions, moss status |
| `morning-paper` | Linen Paper | Long reading and low-light work | paper white, oat controls, brown-gray ink, muted moss |
| `warm-slate` | Mist Workbench | Dense utility and comparison work | cool gray-white, slate ink, restrained amber, muted green |

### Forest Archive: default dark

| Role | Token / reference value | Use |
| --- | --- | --- |
| Page depth | `--bg #050806`, `--bg-2 #0a110b` | page bands and viewport ground |
| Surface | `--panel`, `--panel-2` | data surfaces, not every section |
| Primary text | `--paper #f4ead0`, `--paper-3 #fff7e5` | titles and key values |
| Primary accent | `--gold #d6b15a`, `--gold-2 #f0cf74` | primary action, current state, ranking |
| Support accent | `--moss #7da55b`, `--moss-2 #96c67a` | success, availability, route support |
| Rule line | `--line` / `--tp-color-border` | structural separation, never heavy frames |

Gold denotes a decision or primary action. Moss denotes a positive/supporting
state. Neither should be used as a full-page fill. The dark theme may use one
subtle radial field and a fine grid, but no unrelated color glow or bokeh.

### Linen Paper: morning-paper

| Role | Reference value | Use |
| --- | --- | --- |
| Page | `#f3ead8` to `#eadcc3` | paper ground |
| Surface | `#fffaf1` | panels and controls |
| Ink | `#1a1f18` | all critical text |
| Archive accent | `#b8820d`, `#7a5a21` | links, ranking, selected state |
| Support | `#2e5c24` | success and secondary route state |
| Primary control | `#e9dfd1` with `#967b5f` inset marker | primary action |

This theme is not beige decoration. It is flat paper with dark typography.
Avoid strong gradients, warm shadows, white text on colored controls, and
saturated brown panels.

### Mist Workbench: warm-slate

| Role | Reference value | Use |
| --- | --- | --- |
| Page | `#eef1f4` to `#e2e7ed` | cool work surface |
| Surface | `#ffffff` | panels and controls |
| Ink | `#1d2430` | all critical text |
| Archive accent | `#293241`, `#c07a20` | links, ranking, restrained amber signal |
| Support | `#2f5b25` | success and route support |
| Primary control | `#e3eaec` with `#668493` inset marker | primary action |

This theme is a cool neutral workbench, not a blue dashboard. Blue-gray remains
an ink/control family; amber is a small archival signal only.

### Theme implementation rules

- Use existing semantic variables such as `--tp-color-*`, `--button-*`,
  `--index-*`, and `--theme-*`; no raw local hex values in a page component.
- Preserve the existing `dark`, `morning-paper`, and `warm-slate` keys in
  `front-nuxt/stores/theme.ts`.
- Entity rarity, danger, completion, and source type are semantic data colors.
  They can tint a chip, icon, or narrow edge but cannot replace the page theme.
- Light themes use flat low-saturation control surfaces, an inset 3px primary
  marker, a subtle border, and dark text. They do not use dark fills, large
  shadows, or decorative gradients for ordinary controls.
- Text, focus, active, hover, and disabled states must remain distinguishable
  without color alone.

## Shared Material And Depth

Every page uses four perceptual levels. A page may omit a level but must not
invent additional card layers.

| Level | Job | Default treatment |
| --- | --- | --- |
| 0. Ground | anchor the page | theme page background plus a restrained grid or field texture |
| 1. Band | group a page phase | full-width band, one boundary line, no floating card shell |
| 2. Surface | frame a tool or a repeated datum | `--tp-color-surface*`, one border, 6-8px radius |
| 3. Object | identify a featured entity or actionable control | compact sprite/art frame, selected line, primary button, or emphasis edge |

Rules:

- Use a grid at 40-56px only as a low-opacity grounding device. It is a page
  material, not a background pattern on every individual card.
- Use a maximum of one radial field per viewport. It must reinforce a real
  focal region and cannot be a detached decorative orb.
- The edge system is fine rule lines and small inset depth, not heavy borders
  or stacked drop shadows.
- Repeated page sections are bands or unframed layouts. Cards are reserved for
  repeated items, modals, and genuinely framed tools. Never place cards inside
  cards by default.
- Corner radii: chips 6px, data cards 8px, panels 10px maximum. Do not use
  pill-shaped text controls where a known control type exists.

## Layout And Density

### Global frame

- Use `--tp-container-wide` / approximately 1380px for data-rich desktop pages.
- Use the standard responsive gutter: 16px mobile, up to 32px desktop.
- Page sections are full-width bands with one constrained inner shell.
- Desktop title rows should sit above the primary working surface, not inside a
  large decorative hero card.
- Mobile changes composition, not typography by viewport scaling. Preserve
  readable 14px body text and 44px interactive targets.

### Density rules

- Entity pages may be dense. A long page is acceptable only when each viewport
  contains multiple facts, relations, or actions.
- Article lists should normally show 5-7 archive rows on a 1440px viewport
  after the featured fold; one row should communicate topic, title, one-line
  value, author, date, and reading signal without opening it.
- Use stable grid tracks and tabular numbers for counts, time, prices, and
  item stats so rows do not shift.
- A module exists only if it answers a user question. Do not preserve empty
  placeholders for an absent capability or relation.

## Page Archetypes

### Homepage: public index

Job: orient the player and route them to a record or workflow.

- Home may use a richer first viewport because it is the site index.
- It combines search, core domains, progression paths, and a public index
  overview. Its colors, rule lines, grid scale, and typography establish the
  shared language.
- Other pages may borrow its palette and proportions, not its split hero or
  navigation composition.

### Item detail: object and relation archive

Job: answer what the item is, what it does, how it is acquired/crafted, and
what it connects to.

- Start with the named object, actual sprite, rarity/identity, decisive stats,
  and action-oriented facts.
- Keep facts, recipes, sources, drops, uses, and relations as data modules.
- Use the approved complete item samples as structural reference. The page is
  not a product showcase and must not hide source, drop, or crafting data below
  a large empty hero.
- Coins must use actual currency art from the available asset chain, not drawn
  substitutes.

### NPC detail: actor and capability archive

Job: answer who the NPC is, where they belong, and what the player can do with
them.

- Keep portrait/map/location meaningful and large enough to inspect.
- Select modules by capability: resident shop, temporary merchant appearance,
  service, drop, relation, and conditions. Do not render an empty generic
  module merely to make every NPC look identical.
- Temporary merchant stock must distinguish the full catalog from a single
  visit's offered set when data supports that distinction.
- Use the approved merchant, guide, pirate, and traveling-merchant samples as
  layout references for their respective capability profiles.

### Article index: editorial discovery plus archive

Job: let a player choose what to read now, then browse the full knowledge set.

- `fold`: one featured article plus five compact article entries. Article
  title, deck, author, date, reading time, and clear small art are the focal
  hierarchy. The fold is not an article detail page and does not need a giant
  cover image.
- `content shell`: full archive. Show theme filtering, sort choice, dense rows,
  and auxiliary popular/topic data. It must not repeat the featured presentation.
- The approved v22 uses six theme entries and six archive rows as the desktop
  density reference; scale by real data without becoming sparse.

## Component Rules

### Typography

- Chinese display titles are strong but practical: entity/article headings use
  600-900 weight, normal body 500, labels and metadata 700-800.
- Keep letter spacing at normal browser default; do not use negative tracking.
- Body copy uses 1.55-1.75 line height. Titles use approximately 1.2-1.35.
- Metadata is subordinate but readable. Do not drop real metadata below 12px
  in production.
- Use a visible title and descriptive label for every primary working region.

### Controls

- Use icon buttons for familiar single-purpose tools, with accessible labels
  and tooltips. Use text or icon-plus-text buttons for explicit commands.
- Use chips/tabs for categories and modes, not rounded generic buttons.
- Minimum target: 44px. Visual compactness may use an extended hit area but
  must not shrink the actual target.
- Current/selected state uses text, position, marker, or `aria-current` in
  addition to color.
- Motion is 120-180ms and only for color, border, shadow, opacity, or a
  one-pixel press response. Respect reduced-motion preferences.

### Art and images

- Use real local/entity images whenever available. Reserve image dimensions to
  avoid layout shift.
- Pixel art uses contained rendering and an art frame; it must not be blurred,
  stretched, or used as a dark atmospheric crop.
- Do not use external placeholders in high-fidelity work. A visible broken
  image is a validation failure.
- Art supports recognition; text and data carry meaning.

## Forbidden Patterns

- Copying the homepage's hero composition into data/detail pages.
- Single-hue, over-saturated, or overly dark/heavy page palettes.
- A large image or color block that displaces essential facts below the fold.
- Nested cards, unrelated decorative gradients, blobs/orbs, or fake illustrations.
- One-off page hex values that bypass theme tokens.
- Empty modules, sparse long pages, or a fold that repeats the archive list.
- Using color as the only state signal.
- Rounded text rectangles where a conventional icon control is available.

## Design Review Checklist

Before showing a high-fidelity direction or implementing a public page, verify:

1. The page declares its archetype and the user question it answers.
2. The layout follows the page archetype rather than copying homepage structure.
3. All colors route through the three-theme semantic token system.
4. The default dark page has clear ground, band, surface, and object hierarchy.
5. Light themes remain low saturation, flat, and readable at full data density.
6. Real information is visible in the first desktop viewport; no oversized
   decorative space displaces it.
7. Images resolve, retain aspect ratio, and do not replace facts.
8. 1440px and 390px checks show no horizontal overflow, clipped text, failed
   requests, console errors, or unreadable controls.
9. Controls remain keyboard-visible and 44px touch-accessible.
10. The design names the source data/module conditions for every dynamic area.

## Implementation Boundary

This is a design baseline, not authorization to mass-refactor existing CSS.
When a production page is authorized, its implementation plan must identify:

- semantic tokens already available versus tokens that must be added;
- the page archetype and data contract;
- reusable components versus page-owned layout;
- focused visual/runtime validation at desktop and mobile widths;
- any deliberate exception to this document and its user approval.
