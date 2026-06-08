# Front Nav Lightweight Header States Design

## Goal

Reduce the visual weight of top navigation highlighted states in light themes. Selected or unread header controls should no longer read as solid color blocks.

## Approved Direction

Use the selected option A:

- Active primary links use stronger text color and a thin bottom underline.
- Hover may use a very light translucent wash, but not the same solid active block.
- Link dimensions and spacing stay unchanged so the header does not shift.
- Unread notification links in light and warm slate themes use a translucent control surface.
- The notification count badge keeps the stronger color signal, because it is the actual unread count indicator.
- Dark theme notification styling remains on the existing adapted treatment.

## Scope

Modify only the primary `.site-link` navigation styling, unread notification light-theme tokens, and their contract checks.

Do not change route structure, notification data, article link behavior, resource menu behavior, theme switching, or account controls.

## Validation

- `pnpm --dir front-nuxt run check:nav-layout`
- `pnpm --dir front-nuxt run check:visual-system`
- `pnpm --dir front-nuxt exec nuxt typecheck`
- `git diff --check`
- Runtime computed-style check for `morning-paper`, `warm-slate`, and `dark` notification unread surfaces.
