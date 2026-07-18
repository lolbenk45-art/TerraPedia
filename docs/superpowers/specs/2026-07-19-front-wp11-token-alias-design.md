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

`hifi-preview.css` becomes a compatibility consumer: every existing declaration of one of the six legacy variables points at its corresponding `--tp-*` variable. `tokens.css`, which Nuxt loads after the legacy sheet, owns the raw computed values for the dark root, the combined light/morning-paper selector, and warm-slate selector. `--accent-gold` is declared only in the root compatibility block because its semantic owner remains `var(--gold)`, whose value is already theme-specific.

The theme selectors in `tokens.css` must match the attribute specificity of the legacy theme selectors. `:where(...)` is not used for these assignments because it would lose to the legacy attribute rules despite the later stylesheet order. The raw values moved into `tokens.css` must be byte-for-byte equivalent to the prior values, preserving contrast, surfaces, borders, and control elevation in the three supported runtime themes: `dark`, `morning-paper`, and `warm-slate`. `[data-theme="light"]` is retained only as a compatibility selector and is normalized to `morning-paper`; it is not a fourth runtime theme.

The existing visual-system contract gains focused structural assertions for exact selector-block ownership, selector specificity, alias direction, and absence of raw legacy definitions. A dedicated theme-aware parity script captures baseline and candidate screenshots for dark, morning-paper, and warm-slate after setting the `terrapedia-theme` cookie and `html[data-theme]`; it fails on a hash mismatch. This is a preview-only UI task: passing visual checks proves equivalence, not project release readiness.

## Validation

1. Extend the visual-system contract first; verify it fails against the pre-migration CSS.
2. Apply the smallest CSS move and run the focused contract until it passes.
3. Run `pnpm run check` in `front-nuxt`.
4. Capture baseline and candidate screenshots for dark, morning-paper, and warm-slate with the dedicated parity script; require every candidate SHA-256 hash to equal its matching baseline hash.
5. Record that the data-audit baseline remains blocked and that this branch is preview-only.

## Commit Boundaries

- `docs(front)`: approved design, executable plan, and coordination record.
- `test(front)`: failing-to-passing visual-system ownership contract.
- `refactor(front)`: token source-of-truth migration and validation closeout.

P2 follow-up packages remain separate tasks after this branch is committed.
