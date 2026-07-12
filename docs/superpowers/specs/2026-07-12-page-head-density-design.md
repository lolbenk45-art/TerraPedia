# Page Head Density Design

## Goal

Make ordinary public page heads less card-like and more information-dense while preserving title hierarchy and primary CTA access.

## Approved Responsive Direction

- Desktop (720px and above): use a thin contextual header. Keep eyebrow, title, description, and right-aligned CTA, but remove the inner card border, background, radius, and extra padding.
- Mobile item and NPC catalogs: use a command header. Keep the title, count eyebrow, and CTA in one row; hide the redundant description paragraph.
- Biome environment hero: unchanged. Its image-led presentation is an intentional opt-out.
- Other ordinary pages: inherit the thin contextual header and retain their existing mobile stacked content until separately reviewed.

## Layout Contract

- `page-head-inner` remains the layout wrapper. It owns the desktop two-column CTA alignment and must not be globally removed.
- The visual card shell belongs to the wrapper styling, not to the semantic structure; normal headers render it transparent.
- Mobile command mode is opt-in through `page-head--command`, initially on `items/index.vue` and `npcs/index.vue`.
- Touch targets remain at least 44px high. The visible title remains the page `h1`.

## Validation Contract

- Focused static checks assert the thin-header CSS and the two opt-in catalog modifiers.
- Browser screenshots verify item and NPC routes at 1440px and 390px.
- The public frontend full check remains the shared regression gate.
