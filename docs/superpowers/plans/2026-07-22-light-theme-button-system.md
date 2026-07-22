# Light Theme Button System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the public frontend to the approved Mist Workbench and Linen Paper button systems without changing dark-theme default rendering, component markup, or responsive geometry.

**Architecture:** Keep `hifi-preview.css` as the compatibility owner of shared button variables and map each light theme to a flat, low-saturation palette. Add focused Node contracts for token shape and prototype identity, then validate the existing consumers through the public frontend gate and runtime browser checks. The durable audit HTML is the canonical prototype source; its served public copy must remain byte-identical.

**Tech Stack:** Nuxt 4, CSS custom properties, Node.js ESM contract scripts, pnpm, Chromium/CDP runtime checks.

---

## File Map

- Create `front-nuxt/scripts/check-light-button-tokens.mjs`: focused structural
  contract for exact light-theme token ownership, flat surfaces, light shadows,
  and shared focus consumption.
- Create `front-nuxt/scripts/check-button-style-options.mjs`: verifies the
  durable/public prototype identity and required two-theme/state coverage.
- Modify `front-nuxt/package.json`: expose both focused checks and include them
  in `pnpm run check`.
- Modify `front-nuxt/assets/css/hifi-preview.css`: own the two approved palettes
  and the shared focus/primary-marker behavior.
- Modify `front-nuxt/assets/css/tokens.css`: preserve the WP-11 legacy alias
  boundary while making light-theme control elevation resolve to `none`.
- Modify `front-nuxt/assets/css/domains/catalog.css`: restore token-driven
  keyboard focus on the real catalog filter and pagination controls.
- Modify
  `docs/audits/2026-07-21-light-theme-button-style-options.html`: canonical
  interactive comparison containing only the two approved systems.
- Modify `front-nuxt/public/button-style-options.html`: byte-identical served
  copy of the canonical audit.
- Modify `docs/devlog/entries/2026-07-22-light-theme-button-system.md`: record
  RED/GREEN evidence, runtime results, risks, and closeout.
- Modify `docs/devlog/current.md`: keep the active handoff current and remove it
  only during final commit closeout.

### Task 1: Add the Light Button Token RED Contract

**Files:**
- Create: `front-nuxt/scripts/check-light-button-tokens.mjs`
- Modify: `front-nuxt/package.json`
- Modify: `docs/devlog/entries/2026-07-22-light-theme-button-system.md`

- [ ] **Step 1: Create the focused contract**

Create an ESM script that reads `assets/css/hifi-preview.css`, extracts exact
top-level selector blocks, and compares these declarations:

```js
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = 'assets/css/hifi-preview.css'
const css = readFileSync(join(root, path), 'utf8')
const violations = []

const blockFor = (selector) => {
  const selectorIndex = css.indexOf(`${selector} {`)
  const openingIndex = css.indexOf('{', selectorIndex)
  if (selectorIndex < 0 || openingIndex < 0) return ''
  let depth = 0
  for (let index = openingIndex; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') depth -= 1
    if (depth === 0) return css.slice(openingIndex + 1, index)
  }
  return ''
}

const valueFor = (block, property) => {
  const match = block.match(new RegExp(`${property.replaceAll('-', '\\-')}\\s*:\\s*([^;]+);`))
  return match?.[1].trim() ?? ''
}

const expected = {
  '[data-theme="morning-paper"]': {
    '--button-primary-bg': '#e9dfd1',
    '--button-primary-bg-hover': '#e2d5c5',
    '--button-primary-fg': '#55483a',
    '--button-primary-border': 'rgba(121, 93, 64, 0.17)',
    '--button-primary-marker': '#967b5f',
    '--button-primary-shadow': 'inset 3px 0 0 var(--button-primary-marker), inset 0 1px 0 rgba(255, 255, 255, 0.66)',
    '--button-secondary-bg': '#eee8de',
    '--button-secondary-bg-hover': '#e8dfd2',
    '--button-secondary-fg': '#4e4941',
    '--button-secondary-border': 'rgba(79, 70, 58, 0.09)',
    '--button-secondary-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.66)',
    '--button-control-bg': '#eee8de',
    '--button-control-bg-hover': '#e8dfd2',
    '--button-control-fg': '#4e4941',
    '--button-control-hover-fg': '#3d3933',
    '--button-control-border': 'rgba(79, 70, 58, 0.09)',
    '--button-control-active-bg': '#ebe1d3',
    '--button-control-active-fg': '#55483a',
    '--button-control-active-border': 'rgba(121, 93, 64, 0.16)',
    '--button-control-shadow': 'var(--tp-shadow-control)',
    '--button-control-active-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.66)',
    '--button-control-dot-active-bg': '#967b5f',
    '--button-control-accent-fg': '#6f5842',
    '--button-focus-ring': '#8b6c4c',
  },
  '[data-theme="warm-slate"]': {
    '--button-primary-bg': '#e3eaec',
    '--button-primary-bg-hover': '#dae4e7',
    '--button-primary-fg': '#304e5a',
    '--button-primary-border': 'rgba(73, 111, 128, 0.18)',
    '--button-primary-marker': '#668493',
    '--button-primary-shadow': 'inset 3px 0 0 var(--button-primary-marker), inset 0 1px 0 rgba(255, 255, 255, 0.72)',
    '--button-secondary-bg': '#eaedef',
    '--button-secondary-bg-hover': '#e3e8ea',
    '--button-secondary-fg': '#35424b',
    '--button-secondary-border': 'rgba(55, 68, 78, 0.09)',
    '--button-secondary-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    '--button-control-bg': '#eaedef',
    '--button-control-bg-hover': '#e3e8ea',
    '--button-control-fg': '#35424b',
    '--button-control-hover-fg': '#29333b',
    '--button-control-border': 'rgba(55, 68, 78, 0.09)',
    '--button-control-active-bg': '#e3eaec',
    '--button-control-active-fg': '#304e5a',
    '--button-control-active-border': 'rgba(73, 111, 128, 0.18)',
    '--button-control-shadow': 'var(--tp-shadow-control)',
    '--button-control-active-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    '--button-control-dot-active-bg': '#668493',
    '--button-control-accent-fg': '#486a79',
    '--button-focus-ring': '#50798c',
  },
}

for (const [selector, declarations] of Object.entries(expected)) {
  const block = blockFor(selector)
  if (!block) violations.push(`${path}: missing ${selector}`)
  for (const [property, expectedValue] of Object.entries(declarations)) {
    const actualValue = valueFor(block, property)
    if (actualValue !== expectedValue) {
      violations.push(`${path}: ${selector} ${property} expected ${expectedValue}; found ${actualValue || '<missing>'}`)
    }
  }
  for (const property of ['--button-primary-bg', '--button-primary-bg-hover', '--button-control-active-bg']) {
    if (valueFor(block, property).includes('gradient(')) {
      violations.push(`${path}: ${selector} ${property} must be a flat surface`)
    }
  }
  for (const property of ['--button-primary-shadow', '--button-secondary-shadow', '--button-control-shadow', '--button-control-active-shadow']) {
    if (/,(?![^()]*(?:\)|$))\s*0\s+\d+px\s+\d+px/.test(valueFor(block, property))) {
      violations.push(`${path}: ${selector} ${property} must not add a large external shadow`)
    }
  }
}

for (const marker of [
  '--button-primary-marker:',
  '--button-focus-ring:',
  'inset 3px 0 0 var(--button-primary-marker)',
  'outline: 3px solid var(--button-focus-ring);',
  'outline-offset: 2px;',
]) {
  if (!css.includes(marker)) violations.push(`${path}: missing shared light-button marker ${marker}`)
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Light button token contract passed.')
```

- [ ] **Step 2: Wire the focused command into the frontend gate**

Add this package script:

```json
"check:light-button-tokens": "node scripts/check-light-button-tokens.mjs"
```

Insert `pnpm run check:light-button-tokens` immediately after
`pnpm run check:visual-system` in the `check` chain.

- [ ] **Step 3: Run the contract and verify intentional RED**

Run:

```bash
cd front-nuxt
pnpm run check:light-button-tokens
```

Expected: exit 1. It must report the old gradient primary/active tokens and
missing `--button-primary-marker` / `--button-focus-ring`; a syntax or
file-not-found failure is not an acceptable RED.

- [ ] **Step 4: Record RED evidence and commit only the contract**

Update the devlog with the exact failed assertions, then run:

```bash
git add front-nuxt/scripts/check-light-button-tokens.mjs front-nuxt/package.json docs/devlog/entries/2026-07-22-light-theme-button-system.md
git diff --cached --check
git diff --cached --stat
git commit -m "test(front): lock light button palettes"
```

Expected: one focused intentional-RED commit with no production CSS or HTML.

### Task 2: Implement The Two Token Palettes

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/tokens.css`
- Modify: `front-nuxt/assets/css/domains/catalog.css`
- Modify: `front-nuxt/scripts/check-light-button-tokens.mjs`
- Modify: `front-nuxt/scripts/check-visual-system-contract.mjs`
- Modify: `front-nuxt/scripts/check-light-theme-typography.mjs`
- Modify: `docs/devlog/entries/2026-07-22-light-theme-button-system.md`

- [ ] **Step 1: Repair the control-shadow ownership assertion**

The reviewed WP-11 visual-system contract requires every legacy
`--button-control-shadow` declaration in `hifi-preview.css` to remain exactly
`var(--tp-shadow-control)`. Update the focused light-button contract so both
theme blocks expect that alias, then make it additionally read
`assets/css/tokens.css` and require exactly one
`--tp-shadow-control: none` declaration in each standalone
`[data-theme="morning-paper"]` and `[data-theme="warm-slate"]` block.

Run `pnpm run check:light-button-tokens` before changing `tokens.css`.
Expected: intentional RED for both missing semantic `none` values plus the
other unimplemented palette/focus assertions. Run
`pnpm run check:visual-system` against the in-progress raw `none` aliases to
confirm the old contract rejects them before restoring the aliases.

- [ ] **Step 2: Add shared marker and focus tokens**

Add explicit dark defaults beside the root button tokens so every runtime
theme declares the semantic interface:

```css
--button-primary-marker: #d6b15a;
--button-focus-ring: rgba(240, 207, 116, 0.58);
```

Add this shared focus rule after the shared button hover/active rules:

```css
:where(
  .primary-button,
  .secondary-button,
  .icon-button,
  .small-button,
  .detail-tab,
  .filter-option,
  .entity-filter,
  .theme-choice,
  .nav-menu-text-trigger,
  .nav-notification-link,
  .nav-user-article-link,
  .account-avatar-link
):focus-visible {
  outline: 3px solid var(--button-focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Replace the Morning Paper button declarations**

Use these exact values in `[data-theme="morning-paper"]`:

```css
--button-primary-bg: #e9dfd1;
--button-primary-bg-hover: #e2d5c5;
--button-primary-fg: #55483a;
--button-primary-border: rgba(121, 93, 64, 0.17);
--button-primary-marker: #967b5f;
--button-primary-shadow: inset 3px 0 0 var(--button-primary-marker), inset 0 1px 0 rgba(255, 255, 255, 0.66);
--button-secondary-bg: #eee8de;
--button-secondary-bg-hover: #e8dfd2;
--button-secondary-fg: #4e4941;
--button-secondary-border: rgba(79, 70, 58, 0.09);
--button-secondary-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.66);
--button-control-bg: #eee8de;
--button-control-bg-hover: #e8dfd2;
--button-control-fg: #4e4941;
--button-control-hover-fg: #3d3933;
--button-control-border: rgba(79, 70, 58, 0.09);
--button-control-shadow: var(--tp-shadow-control);
--button-control-active-bg: #ebe1d3;
--button-control-active-fg: #55483a;
--button-control-active-border: rgba(121, 93, 64, 0.16);
--button-control-active-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.66);
--button-control-dot-active-bg: #967b5f;
--button-control-accent-fg: #6f5842;
--button-focus-ring: #8b6c4c;
```

- [ ] **Step 4: Replace the Warm Slate button declarations**

Use these exact values in `[data-theme="warm-slate"]`:

```css
--button-primary-bg: #e3eaec;
--button-primary-bg-hover: #dae4e7;
--button-primary-fg: #304e5a;
--button-primary-border: rgba(73, 111, 128, 0.18);
--button-primary-marker: #668493;
--button-primary-shadow: inset 3px 0 0 var(--button-primary-marker), inset 0 1px 0 rgba(255, 255, 255, 0.72);
--button-secondary-bg: #eaedef;
--button-secondary-bg-hover: #e3e8ea;
--button-secondary-fg: #35424b;
--button-secondary-border: rgba(55, 68, 78, 0.09);
--button-secondary-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
--button-control-bg: #eaedef;
--button-control-bg-hover: #e3e8ea;
--button-control-fg: #35424b;
--button-control-hover-fg: #29333b;
--button-control-border: rgba(55, 68, 78, 0.09);
--button-control-shadow: var(--tp-shadow-control);
--button-control-active-bg: #e3eaec;
--button-control-active-fg: #304e5a;
--button-control-active-border: rgba(73, 111, 128, 0.18);
--button-control-active-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
--button-control-dot-active-bg: #668493;
--button-control-accent-fg: #486a79;
--button-focus-ring: #50798c;
```

- [ ] **Step 5: Remove light control elevation at the semantic owner**

In the standalone theme blocks of `assets/css/tokens.css`, replace only these
values:

```css
[data-theme="morning-paper"] {
  --tp-shadow-control: none;
}

[data-theme="warm-slate"] {
  --tp-shadow-control: none;
}
```

Keep the root dark `--tp-shadow-control` unchanged. Do not move other border,
surface, radius, or elevation tokens.

Update only the two light-theme `--tp-shadow-control` expected values in
`scripts/check-visual-system-contract.mjs` from their former inset-plus-external
shadows to `none`. Keep the root dark expected value, semantic-to-legacy source
map, exact theme blocks, and alias-only checks unchanged. This is an intentional
behavior-contract update, not a weakening of token ownership.

Add a light-theme catalog focus rule after the existing light catalog control
surface rules. Its specificity must beat the earlier two-class
`:focus-visible { outline: none; }` rule and target exactly the real focusable
controls:

```css
:is([data-theme="morning-paper"], [data-theme="warm-slate"]) :is(
  .catalog-category-chip,
  .catalog-density-chip,
  .catalog-dock-button,
  .catalog-dock-icon-button,
  .catalog-dock-page-button
):focus-visible {
  outline: 3px solid var(--button-focus-ring);
  outline-offset: 2px;
}
```

Extend the focused contract to require this exact consumer set and declarations
in `domains/catalog.css`. Replace `.theme-toggle` with the actual focusable
`.theme-choice` in the shared focus consumer set. Add a WCAG contrast helper
that compares each light focus token against its page, control, and primary
reference surfaces and fails below 3:1; the approved solid rings yield at least
3.67:1 across those samples.

- [ ] **Step 6: Run focused GREEN and existing structural contracts**

Run:

```bash
cd front-nuxt
pnpm run check:light-button-tokens
pnpm run check:visual-system
pnpm run check:public-pages
pnpm run check:nav-layout
```

Expected: all four commands exit 0. The new command prints
`Light button token contract passed.`

- [ ] **Step 7: Run the runtime light-theme contrast check**

Run:

```bash
cd front-nuxt
pnpm run check:light-theme
```

Expected: exit 0 with no label below 4.5:1 and no missing/hidden focus or
control sample. If a foreground fails, darken only the affected foreground or
marker; do not increase surface saturation without renewed visual approval.

The runtime audit must programmatically focus representative actual controls
for primary actions, theme choices, navigation, filters, catalog chips, and
catalog pagination. It must inspect the cascade winner for outline style,
width, offset, color, clipping, and contrast against the adjacent surface;
require a 3px ring, 2px offset, and at least 3:1 contrast. Track samples across
the route matrix and fail if a required focus family was never exercised. Do
not report “no missing focus sample” from the text-only audit path.

- [ ] **Step 8: Record GREEN evidence and commit the token implementation**

```bash
git add front-nuxt/assets/css/hifi-preview.css front-nuxt/assets/css/tokens.css front-nuxt/assets/css/domains/catalog.css front-nuxt/scripts/check-light-button-tokens.mjs front-nuxt/scripts/check-visual-system-contract.mjs front-nuxt/scripts/check-light-theme-typography.mjs docs/devlog/entries/2026-07-22-light-theme-button-system.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(front): lighten public button themes"
```

### Task 3: Add The Prototype Identity RED Contract

**Files:**
- Create: `front-nuxt/scripts/check-button-style-options.mjs`
- Modify: `front-nuxt/package.json`
- Modify: `docs/devlog/entries/2026-07-22-light-theme-button-system.md`

- [ ] **Step 1: Create the prototype contract**

```js
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(frontRoot, '..')
const durablePath = join(repoRoot, 'docs/audits/2026-07-21-light-theme-button-style-options.html')
const publicPath = join(frontRoot, 'public/button-style-options.html')
const durable = readFileSync(durablePath)
const served = readFileSync(publicPath)
const source = durable.toString('utf8')
const violations = []

if (!durable.equals(served)) violations.push('button style option copies must be byte-identical')

for (const marker of [
  'Mist Workbench',
  'Linen Paper',
  'data-theme-preview="warm-slate"',
  'data-theme-preview="morning-paper"',
  'data-state="default"',
  'data-state="hover"',
  'data-state="selected"',
  'data-state="focus"',
  'data-state="disabled"',
  '--primary-marker:',
  'min-height: 44px;',
  '@media (prefers-reduced-motion: reduce)',
]) {
  if (!source.includes(marker)) violations.push(`prototype missing ${marker}`)
}

for (const rejected of ['Paper A', 'Paper B', 'Paper C', 'Slate A', 'Slate B', 'Slate C', 'linear-gradient(']) {
  if (source.includes(rejected)) violations.push(`prototype retains rejected treatment ${rejected}`)
}

if ((source.match(/class="theme-card"/g) ?? []).length !== 2) {
  violations.push('prototype must render exactly two approved theme cards')
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Button style options contract passed.')
```

- [ ] **Step 2: Add it to the package gate**

Add:

```json
"check:button-style-options": "node scripts/check-button-style-options.mjs"
```

Place `pnpm run check:button-style-options` immediately after
`pnpm run check:light-button-tokens` in the `check` chain.

- [ ] **Step 3: Run and verify intentional RED**

Run `cd front-nuxt && pnpm run check:button-style-options`.

Expected: exit 1 because the current copies retain the rejected six variants
and do not expose the approved two-theme/state contract.

- [ ] **Step 4: Commit the prototype contract**

```bash
git add front-nuxt/scripts/check-button-style-options.mjs front-nuxt/package.json docs/devlog/entries/2026-07-22-light-theme-button-system.md
git diff --cached --check
git diff --cached --stat
git commit -m "test(front): lock approved button previews"
```

### Task 4: Replace The Rejected Prototype

**Files:**
- Modify: `docs/audits/2026-07-21-light-theme-button-style-options.html`
- Modify: `front-nuxt/public/button-style-options.html`
- Modify: `docs/devlog/entries/2026-07-22-light-theme-button-system.md`

- [ ] **Step 1: Rebuild the durable audit as the canonical source**

Retain a standalone accessible HTML document. Its `body` must contain exactly
two `.theme-card` sections:

```html
<section class="theme-card" data-theme-preview="warm-slate">
  <header><p>Mist Workbench</p><h2>雾面工作台</h2></header>
  <div class="state-grid" aria-label="雾面工作台按钮状态">
    <button data-state="default">查看详情</button>
    <button class="primary" data-state="hover">应用筛选</button>
    <button class="selected" data-state="selected" aria-pressed="true">已收藏</button>
    <button class="primary focus-demo" data-state="focus">保存修改</button>
    <button data-state="disabled" disabled>暂不可用</button>
  </div>
</section>
<section class="theme-card" data-theme-preview="morning-paper">
  <header><p>Linen Paper</p><h2>亚麻纸面</h2></header>
  <div class="state-grid" aria-label="亚麻纸面按钮状态">
    <button data-state="default">查看详情</button>
    <button class="primary" data-state="hover">应用筛选</button>
    <button class="selected" data-state="selected" aria-pressed="true">已收藏</button>
    <button class="primary focus-demo" data-state="focus">保存修改</button>
    <button data-state="disabled" disabled>暂不可用</button>
  </div>
</section>
```

Each card must also show ordinary/quiet/primary/destructive controls,
segmented filters, pagination, and icon-only controls. Use local per-card CSS
variables whose values exactly mirror the approved production tokens. Primary
buttons use this structure without pseudo-elements:

```css
.theme-card {
  --primary-marker: #668493;
}
.theme-card[data-theme-preview="morning-paper"] {
  --primary-marker: #967b5f;
}
.primary {
  min-height: 44px;
  border: 1px solid var(--primary-border);
  background: var(--primary-bg);
  color: var(--primary-fg);
  box-shadow: inset 3px 0 0 var(--primary-marker), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.focus-demo,
button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; }
}
```

Do not use gradients, emoji icons, external font/network resources, solid dark
primary fills, or white primary text. Use inline SVG from one outline icon
family for icon examples.

- [ ] **Step 2: Synchronize the served copy**

Copy the canonical bytes without editing the served copy independently:

```bash
cp docs/audits/2026-07-21-light-theme-button-style-options.html front-nuxt/public/button-style-options.html
```

- [ ] **Step 3: Run prototype GREEN and inspect locally**

Run:

```bash
cd front-nuxt
pnpm run check:button-style-options
```

Expected: exit 0 and `Button style options contract passed.` Open
`/button-style-options.html` and inspect both cards at 1280px and 375px. The
document must have no horizontal overflow, every button must remain at least
44px high, and focus/selected/disabled states must be visibly distinct.

- [ ] **Step 4: Commit both byte-identical copies**

```bash
git add docs/audits/2026-07-21-light-theme-button-style-options.html front-nuxt/public/button-style-options.html docs/devlog/entries/2026-07-22-light-theme-button-system.md
git diff --cached --check
git diff --cached --stat
git commit -m "docs(front): replace heavy button previews"
```

### Task 5: Integrated Validation And Closeout

**Files:**
- Modify: `docs/devlog/entries/2026-07-22-light-theme-button-system.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run focused and full static gates**

```bash
cd front-nuxt
pnpm run check:light-button-tokens
pnpm run check:button-style-options
pnpm run check:light-theme
pnpm run check
```

Expected: all commands exit 0. Record any baseline warnings separately; do not
describe them as failures or silently omit them.

- [ ] **Step 2: Run production browser acceptance**

Start the existing local stack with
`bash ./scripts/dev/start-local-stack.sh`. For both `morning-paper` and
`warm-slate`, inspect `/`, `/items`, `/search-tool`, and `/categories` at
1280x800 and 375x812. Record computed background, foreground, border,
box-shadow, outline, height, and overflow for representative primary, ordinary,
active, pagination, nav, and icon controls.

Expected:

- every sampled interactive target has height at least 44px;
- `document.documentElement.scrollWidth === window.innerWidth`;
- primary/active backgrounds are the approved flat RGB values;
- primary labels meet 4.5:1 contrast;
- focus indicators are visible and selected/disabled states are distinct;
- no console error or failed target request appears;
- dark-theme default-state screenshot comparison shows no button surface,
  border, foreground, shadow, geometry, or overflow regression.

Save generated evidence under ignored `reports/front-nuxt/`; do not stage
screenshots unless the user explicitly promotes them as durable audit evidence.

- [ ] **Step 3: Review the total diff against the approved spec**

Run:

```bash
git diff --check
git status --short
git log --oneline 0af6df56..HEAD
```

Confirm only the two light palettes, their focused contracts, both prototype
copies, and devlog state changed. Reject any unrelated CSS cleanup, dark-theme
redesign, layout edit, generated report, or browser profile.

- [ ] **Step 4: Close the devlog and create the closeout commit**

Record exact validation results and residual risks. Set the entry to `closed`
with `commit SHA pending in final response`, remove it from `current.md` Open
Work, and stage only the two devlog files:

```bash
git add docs/devlog/entries/2026-07-22-light-theme-button-system.md docs/devlog/current.md
git status --short
git diff --cached --stat
git diff --cached --check
git commit -m "docs(front): close light button adaptation"
```

- [ ] **Step 5: Report without push or cleanup**

Run `git status --short --branch`, `git branch -vv`, and
`git worktree list --porcelain`. Report all new commit SHAs, validation evidence,
the two unchanged out-of-scope themes/boundaries, and any remaining untracked
artifact. Do not push, merge, or remove the existing worktree unless the user
separately authorizes it.
