# Page CSS Exception Registry

Page-level CSS exceptions are allowed only when a page cannot use the shared
tokens, primitives, or a domain CSS file without losing a required layout.

Every exception must record:

| Page | Reason | Owner | Allowed selector scope | Deletion condition |
| --- | --- | --- | --- | --- |
| None | No active page exceptions. | P0 Foundation | `front-nuxt/assets/css/pages/exceptions.css` comment only | Add a real row before adding selectors. |

Rules:

- Register the exception before adding selectors.
- Keep selectors scoped to one page root or one stable data marker.
- Do not use page exceptions for reusable cards, panels, relation rows, or
  crafting/detail/catalog modules.
- Remove the exception after the relevant domain CSS can own the layout.

## Visual Contract Registries

These registries define the whitelist format used by the P4 visual-system
contract check. If a row is not registered here, the later checker must treat it
as blocked.

### Small Text Whitelist

Core visible text must be at least `12px` and mobile core reading text must be
at least `14px`. `10px` or `11px` text is allowed only for non-core decoration.

| CSS file | Selector | Size | Reason | Owner | Deletion condition |
| --- | --- | --- | --- | --- | --- |
| None | No active small-text exceptions. | N/A | N/A | P0 Foundation | Add a real row before adding selectors. |

### Nested Surface Whitelist

Use `.tp-subsection`, `.tp-token`, `.tp-chip`, or `.tp-dense-row` for nested
recipe sheets, relation rows, and compact local content. Nested `.tp-panel`
inside `.tp-panel` and `.tp-card` inside `.tp-card` are blocked unless listed
here.

| CSS file | Selector | Reason | Owner | Deletion condition |
| --- | --- | --- | --- | --- |
| None | No active nested card/panel exceptions. | N/A | P0 Foundation | Add a real row before adding selectors. |

### Horizontal Scroll Whitelist

The page root must not horizontally scroll. Internal horizontal scrolling is
allowed only for `.tp-scroll-region` or a selector listed here. Do not use
`overflow-x: hidden` on `html`, `body`, `main`, `.tp-page-shell`, or a page root
to mask layout overflow.

| CSS file | Selector | Reason | Owner | Deletion condition |
| --- | --- | --- | --- | --- |
| `front-nuxt/assets/css/primitives.css` | `.tp-scroll-region` | Shared table/detail comparison scroll container. | P0 Foundation | Keep while comparison/table overflow exists. |
