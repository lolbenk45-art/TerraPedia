# TerraPedia Front Home Atlas Gate Design

- Date: `2026-04-10`
- Scope: `front`
- Status: `approved-for-spec`
- Design direction: `Atlas Gate`
- Color system: `Moss Lantern`

## 1. Goal

Rebuild the `front` homepage visual language so TerraPedia feels like a Terraria adventure atlas rather than a generic landing page or utility dashboard.

The homepage should:

- present a strong first-screen identity
- keep search and category exploration as the primary user actions
- preserve the current data-driven structure
- establish a visual system that can extend to the list page and detail page later

## 2. Success Criteria

This design is successful when:

- the homepage has clear Terraria world flavor without becoming noisy or gimmicky
- the navigation, hero, stats, features, categories, and footer feel like one system
- the page remains readable and scan-friendly in both desktop and mobile layouts
- the color system works in light and dark themes with accessible contrast
- later list/detail redesigns can inherit the same tokens and atmosphere

## 3. Out Of Scope

This design does not include:

- immediate code implementation
- redesign of `front/src/views/HomeView.vue`
- redesign of `front/src/views/ItemDetailView.vue`
- backend or data contract changes
- replacing the existing theme-switching mechanism

Those items are reserved for later implementation and later redesign batches.

## 4. Current-State Summary

The current homepage already contains useful building blocks:

- hero area with search
- quick tags
- statistics section
- feature cards
- top-category preview
- site footer

The current issues are mostly visual and structural:

- the hero reads like a generic centered landing page
- emoji-based feature/category signals reduce perceived quality
- sections feel visually related but not systemically designed
- the homepage and internal pages do not yet feel like the same product family

## 5. Chosen Direction

The approved direction is `Atlas Gate`.

Core idea:

- the homepage behaves like the entrance hall to the Terraria item atlas
- the hero becomes a "departure point" instead of a simple marketing banner
- search becomes the primary start action
- atmosphere comes from terrain layering, artifact cues, mineral light, and restrained depth

The design should feel:

- adventurous
- collectible
- crafted
- readable

It should not feel:

- overly game-UI heavy
- fantasy cluttered
- SaaS-generic
- emoji-driven

## 6. Visual Narrative

### 6.1 Homepage Story

The homepage should tell this story in order:

1. You have entered the atlas.
2. You can begin exploring immediately.
3. The data is broad and trustworthy.
4. There are multiple routes into the world.
5. TerraPedia is a structured front-end product, not just a list of pages.

### 6.2 Visual Anchors

Use these anchors consistently:

- moss and parchment surfaces
- warm relic-gold highlights
- quiet mineral teal as support accent
- terrain silhouettes and depth layers
- subtle artifact framing
- soft, consistent elevated panels

## 7. Color System

The selected palette is `Moss Lantern`.

### 7.1 Core Light Tokens

- `--bg-primary: #F4F1E6`
- `--bg-secondary: #ECE6D7`
- `--bg-tertiary: #DDD6C5`
- `--surface-panel: rgba(251, 248, 240, 0.86)`
- `--surface-soft: rgba(242, 236, 224, 0.82)`
- `--surface-elevated: rgba(255, 251, 244, 0.92)`
- `--text-primary: #1E2A20`
- `--text-secondary: #4B5C4D`
- `--text-muted: #7E8C7E`
- `--border-color: #D4CCBC`
- `--border-strong: #BFB39D`
- `--accent-primary: #6F8F4E`
- `--accent-secondary: #8FAE72`
- `--accent-gold: #D6B263`
- `--accent-support: #5F8D84`

### 7.2 Core Dark Tokens

- `--bg-primary: #111712`
- `--bg-secondary: #18201A`
- `--bg-tertiary: #223026`
- `--surface-panel: rgba(24, 33, 27, 0.88)`
- `--surface-soft: rgba(28, 39, 32, 0.82)`
- `--surface-elevated: rgba(31, 44, 35, 0.92)`
- `--text-primary: #F2EFDF`
- `--text-secondary: #C4CEB9`
- `--text-muted: #93A08E`
- `--border-color: #334135`
- `--border-strong: #4A5D4D`
- `--accent-primary: #9AC26B`
- `--accent-secondary: #B3CF8B`
- `--accent-gold: #D6B263`
- `--accent-support: #78A89F`

### 7.3 Semantic Tokens

- `--accent-success: #5B9462`
- `--accent-warning: #C79A45`
- `--accent-error: #BF6C66`
- `--focus-ring: color-mix(in srgb, var(--accent-primary) 45%, transparent)`

### 7.4 Color Rules

- primary action uses green, not blue
- relic emphasis uses gold sparingly for valuable or highlighted content
- support teal is for secondary emphasis, not primary CTA
- color must not be the only way to indicate state
- all interaction states must be visible in both themes

## 8. Typography And Tone

Typography remains modern and readable rather than retro-pixel.

Rules:

- retain a premium sans-serif foundation
- headings can be tighter and more dramatic than body text
- body text should stay highly legible and calm
- labels and chips should use uppercase or tracking only where they help hierarchy

Tone:

- concise
- crafted
- knowledgeable
- never noisy or theatrical

## 9. Homepage Structure

### 9.1 Navbar

Navbar changes:

- stronger brand crest / mark
- pill-like navigation items with a clear active state
- premium translucent shell with restrained blur
- account and theme actions integrated into the same atlas language

Navbar should feel like the top bar of an atlas interface, not a generic blog header.

### 9.2 Hero

Hero changes:

- replace the centered banner with a two-column composition
- left side: title, description, CTA, search, quick tags
- right side: layered visual scene, floating item artifacts, route cards, terrain silhouette

Hero priorities:

1. strong title
2. clear search action
3. category jump cues
4. atmospheric depth

### 9.3 Stats

Stats should become part of the same visual system rather than a generic number strip.

Rules:

- use 4 concise stats
- use a compact elevated card style
- numbers should feel trustworthy and structural
- use tabular figures if needed for visual stability

### 9.4 Features

Feature section changes:

- remove emoji icons
- convert to a tighter bento-style layout
- frame features as exploration capabilities rather than generic app features

Example framing:

- intelligent search
- category routes
- trustworthy attributes

### 9.5 Category Preview

Category cards should feel like exploration routes.

Rules:

- retain top root categories
- use subtle progress or count emphasis
- visually separate categories while keeping them in the same system
- make them feel collectible and directional, not administrative

### 9.6 Footer

Footer should behave like a calm exit layer from the atlas.

Rules:

- carry over the same visual language at lower intensity
- keep core navigation and brand identity
- avoid generic marketing footer layout

## 10. Motion

Motion should be present but restrained.

Allowed:

- soft floating artifacts
- staggered section reveal
- hover lift on high-value cards
- subtle CTA emphasis

Not allowed:

- constant busy motion
- layout-shifting animation
- decorative motion with no interface purpose

Motion rules:

- micro-interactions: `150ms–220ms`
- section reveal: `220ms–320ms`
- use `transform` and `opacity`
- respect `prefers-reduced-motion`

## 11. Interaction Rules

- search remains the primary homepage action
- quick tags should be clear and tappable
- primary CTA must stay visually dominant
- all tappable elements must meet comfortable mobile target sizes
- hover cues should degrade cleanly on touch devices

## 12. Responsive Strategy

### 12.1 Desktop

- use the full dual-column hero
- keep atmospheric scene on the right
- preserve breathing room around sections

### 12.2 Tablet

- reduce hero width contrast
- compress the scene area
- keep search dominant

### 12.3 Mobile

- hero becomes stacked
- top controls should not be forced into one crowded row
- search should become a full-width action block
- keep atmosphere, but with fewer floating artifacts and less decorative depth

Mobile rule:

- content priority over spectacle

## 13. Accessibility

The design must respect these constraints:

- body text contrast at or above WCAG AA
- visible focus states for links, buttons, and inputs
- no important meaning conveyed by color alone
- maintain readable text sizes on mobile
- support reduced motion

## 14. Asset And Icon Direction

- remove emoji as structural icons
- prefer one vector icon family across homepage and future internal pages
- item imagery should come from real item assets where available
- visual identity should rely on composition, color, and framing rather than novelty icons

## 15. Batch Plan Context

This homepage batch establishes the base system.

### Batch 1

- homepage
- navbar
- footer
- front-end color token refresh

### Batch 2

List page direction, based on parallel review findings:

- reduce compressed utility-grid feeling
- unify active states under TerraPedia tokens
- remove off-brand blue states
- improve mobile filter/sort hierarchy

### Batch 3

Detail page direction, based on parallel review findings:

- reduce card-soup effect
- strengthen content hierarchy after the hero
- surface supporting item assets and references more effectively
- narrow secondary rails and increase editorial clarity

## 16. Risks

- too much atmosphere could reduce clarity if not restrained
- gold usage could become noisy if over-applied
- homepage could drift away from internal pages if token rollout is incomplete
- dark mode could lose readability if light-mode choices are translated too literally

## 17. Implementation Guardrails

- do not discard the existing homepage information architecture without replacement
- do not introduce emoji or mixed icon languages
- do not rely on one-off raw hex values inside components
- do not make the homepage feel like a fantasy game launcher
- do not make the page look like a SaaS template with green paint

## 18. Deliverables From This Spec

Implementation based on this spec should produce:

- updated homepage visual composition
- updated shared front-end tokens
- updated navbar and footer styling
- a reusable visual language for later page redesigns
