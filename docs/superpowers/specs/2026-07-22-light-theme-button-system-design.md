# Light Theme Button System Design

## Goal

Replace the heavy, gradient-led light-theme button styling with two approved
low-saturation systems:

- `warm-slate`: **Mist Workbench**, using warm-white page surfaces and cool
  gray controls.
- `morning-paper`: **Linen Paper**, using warm-white page surfaces and beige,
  oat, and brown-gray controls.

Both systems must feel light and precise at high control density. They must
preserve the existing dark theme, component markup, behavior, responsive
geometry, and minimum 44px interactive targets.

## Approved Direction

The user rejected the earlier Paper A/B/C and Slate A/B/C previews because
their saturated fills, gradients, inset highlights, and large shadows made the
interface feel heavy and ordinary.

The approved replacement has these rules:

1. Light-theme button surfaces use flat, low-saturation colors. Decorative
   gradients are not used.
2. Default controls have no external elevation. Hover may add only a shallow,
   low-opacity shadow.
3. Primary actions do not use a solid dark accent or white foreground. They
   stay within the light surface family and use dark text.
4. Primary hierarchy is expressed with a 3px inset marker, a subtle border,
   and one surface-step difference instead of a large colored fill.
5. Active controls and the current page use a pale surface plus an existing
   dot or other non-color state cue where the component already exposes one.
6. Focus remains a visible 3px ring with a 2px offset. Disabled controls keep
   semantic disabled behavior and reduced emphasis.
7. Motion is limited to 120–180ms color, border, shadow, and one-pixel press
   feedback. Reduced-motion preferences remove non-essential transitions.

## Theme Tokens

`front-nuxt/assets/css/hifi-preview.css` remains the compatibility owner of the
button variables already consumed throughout the public frontend. The change
updates the two light-theme mappings rather than introducing per-page colors.

### Warm Slate: Mist Workbench

| Role | Approved value |
| --- | --- |
| Primary surface | `#e3eaec` |
| Primary hover | `#dae4e7` |
| Primary text | `#304e5a` |
| Primary border | `rgba(73, 111, 128, 0.18)` |
| Primary marker | `#668493` |
| Control surface | `#eaedef` |
| Control hover | `#e3e8ea` |
| Control text | `#35424b` |
| Control border | `rgba(55, 68, 78, 0.09)` |
| Active surface | `#e3eaec` |
| Active text | `#304e5a` |
| Focus ring | `#50798c` |

### Morning Paper: Linen Paper

| Role | Approved value |
| --- | --- |
| Primary surface | `#e9dfd1` |
| Primary hover | `#e2d5c5` |
| Primary text | `#55483a` |
| Primary border | `rgba(121, 93, 64, 0.17)` |
| Primary marker | `#967b5f` |
| Control surface | `#eee8de` |
| Control hover | `#e8dfd2` |
| Control text | `#4e4941` |
| Control border | `rgba(79, 70, 58, 0.09)` |
| Active surface | `#ebe1d3` |
| Active text | `#55483a` |
| Focus ring | `#8b6c4c` |

The palette values are reference values for the implementation plan. If a
contrast check requires a small adjustment, the implementation may darken
foreground text or the marker without increasing the surface saturation. Any
surface change outside these values requires new visual acceptance.

## CSS Architecture

The implementation keeps the existing token-driven flow:

```text
theme selector in hifi-preview.css
  -> --button-primary-* / --button-secondary-* / --button-control-*
  -> shared component rules
  -> light-theme specificity and contrast protection
  -> nav, filters, tabs, pagination, icon controls, and page actions
```

The primary marker should be implemented in the shared primary shadow token as
an inset 3px edge, not with new markup or a page-specific pseudo-element. This
keeps links and buttons visually aligned and avoids changing accessible names
or layout geometry.

The implementation may add semantic tokens for the primary marker and
theme-specific focus ring if the current shared rules lack an equivalent.
Those tokens must be declared for all runtime themes so the dark theme remains
explicit and stable. Existing button tokens continue to own backgrounds,
foregrounds, borders, and shadows.

`front-nuxt/assets/css/pages/light-theme-specificity-overrides.css` and
`front-nuxt/assets/css/light-theme-contrast-fixes.css` may only consume the
semantic tokens or remove obsolete visual compensation. They must not become a
second source of raw button palette values.

## Component Coverage

The shared system applies to:

- `.primary-button`, `.secondary-button`, `.small-button`, and `.icon-button`;
- nav search, theme, account, notification, and menu controls;
- entity filters, detail tabs, filter options, and category/density chips;
- catalog dock pagination and ordinary page-number controls;
- saved-route and equivalent page actions already routed through button
  tokens.

The audit prototype must display, for both light themes:

- ordinary, quiet, primary, destructive, and disabled actions;
- default, hover, pressed, active/selected, and keyboard-focus states;
- segmented filters and pagination;
- representative icon-and-label and icon-only controls.

The durable audit page and its public served copy must be generated from one
shared source or validated as byte-identical so they cannot drift.

## Interaction And Accessibility

- Existing controls retain at least 44px interactive height and their current
  responsive width behavior.
- Normal button labels must meet WCAG AA 4.5:1 against their final computed
  surfaces. Non-text focus and active indicators must remain at least 3:1
  against adjacent colors where WCAG requires it.
- Active state must not rely on color alone. Existing text, `aria-current`,
  `aria-pressed`, weight, dot, or inset-marker cues remain intact.
- Keyboard focus must be visible on both themes and must not be replaced by a
  hover-only treatment.
- Keyboard focus rings must reach at least 3:1 against the adjacent approved
  page, control, and primary surfaces. Theme-choice and catalog controls must
  consume the ring on the actual focusable element; container-only focus rules
  and `outline: none` cascade winners are not acceptable.
- Hover and pressed states must not change layout bounds or cause navigation,
  toolbar, or document overflow.
- `prefers-reduced-motion: reduce` must remain supported.

## Validation Design

Implementation validation must include:

1. A focused structural contract proving both light themes use flat token
   values for primary and active surfaces and do not restore light-theme button
   gradients or large external shadows.
2. Token-consumer contracts proving shared primary, control, active, and focus
   states still route through semantic variables.
3. Contrast checks for representative primary, normal, active, disabled, and
   focus states in `morning-paper` and `warm-slate`.
4. `pnpm run check` from `front-nuxt`.
5. Browser screenshots and geometry checks on representative nav, filter,
   pagination, and action-heavy pages at desktop and mobile widths.
6. A byte-identity or shared-source check for the durable and public prototype
   copies.

## Scope Boundaries

In scope:

- the two light-theme button/control palettes;
- their shared semantic tokens and state styling;
- focused contracts, contrast evidence, and browser acceptance;
- replacement of the rejected button-option audit with the two approved
  systems.

Out of scope:

- dark-theme redesign;
- page layout, typography, data fetching, backend, database, or crawler work;
- component markup changes unless validation proves a semantic state is
  currently impossible without one;
- unrelated CSS consolidation or mass formatting;
- push, remote mutation, or worktree cleanup.

## Acceptance Criteria

The adaptation is accepted when:

- both approved palettes appear consistently across representative public
  controls;
- no light-theme primary or active button uses a saturated full fill,
  decorative gradient, or large floating shadow;
- primary hierarchy remains identifiable without white text or a dark fill;
- all required contrast, focus, disabled, hover, active, and reduced-motion
  checks pass;
- button dimensions and responsive overflow behavior do not regress;
- the public and durable prototypes show only the two approved systems;
- the dark theme has no computed-style regression in the touched shared rules.
