# Front WP-11.1 Theme Token Alias Design

**Goal:** Move six high-frequency legacy visual variables to the `--tp-*` token layer without changing any computed theme value or making a data-readiness claim.

## Scope

This preview-only P2 task migrates exactly these legacy variables:

| Legacy variable | Semantic owner |
| --- | --- |
| `--index-line` | `--tp-color-border` |
| `--index-line-strong` | `--tp-color-border-strong` |
| `--index-surface` | `--tp-color-surface-soft` |
| `--index-surface-strong` | `--tp-color-surface-raised` |
| `--accent-gold` | `--tp-color-accent` |
| `--button-control-shadow` | `--tp-shadow-control` |

It does not migrate consumers, selectors, breakpoints, layout, data fetching, crawler behavior, or remaining WP-11/12/13/14 scope. It does not merge or push.

## Design

`hifi-preview.css` becomes a compatibility consumer: each of the six legacy variables points at its corresponding `--tp-*` variable. `tokens.css`, which Nuxt loads after the legacy sheet, owns the raw computed values for the dark root, the combined light/morning-paper selector, and warm-slate selector.

The theme selectors in `tokens.css` must match the attribute specificity of the legacy theme selectors. `:where(...)` is not used for these assignments because it would lose to the legacy attribute rules despite the later stylesheet order. The raw values moved into `tokens.css` must be byte-for-byte equivalent to the prior values, preserving contrast, surfaces, borders, and control elevation in all four runtime themes.

The existing visual-system contract gains focused structural assertions for ownership, selector specificity, alias direction, and absence of the six raw legacy definitions. Runtime verification compares the current audit routes in dark and a light-family theme only after code contracts pass. This is a preview-only UI task: passing visual checks proves equivalence, not project release readiness.

## Validation

1. Extend the visual-system contract first; verify it fails against the pre-migration CSS.
2. Apply the smallest CSS move and run the focused contract until it passes.
3. Run `pnpm run check` in `front-nuxt`.
4. Run the existing route screenshot harness for dark and morning-paper against a compatible local stack; compare only unexpected byte/visual differences.
5. Record that the data-audit baseline remains blocked and that this branch is preview-only.

## Commit Boundaries

- `docs(front)`: approved design, executable plan, and coordination record.
- `test(front)`: failing-to-passing visual-system ownership contract.
- `refactor(front)`: token source-of-truth migration and validation closeout.

P2 follow-up packages remain separate tasks after this branch is committed.
