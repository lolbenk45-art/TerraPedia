# Front WP-11.1 Theme Token Alias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `--tp-*` the source of truth for six legacy theme variables while preserving the computed and rendered output for `dark`, `morning-paper`, and `warm-slate` exactly.

**Architecture:** `assets/css/tokens.css` owns raw semantic values. `assets/css/hifi-preview.css` contains legacy-to-semantic aliases at the declarations that formerly held raw values. `check-visual-system-contract.mjs` checks exact selector blocks, and `check-theme-token-visual-parity.mjs` captures theme-aware baseline/candidate screenshots and compares SHA-256 hashes. `[data-theme="light"]` remains a compatibility selector for `morning-paper`, not a fourth runtime theme.

**Tech Stack:** Nuxt 3, CSS custom properties, Node.js CDP scripts, SHA-256, pnpm.

**Scope:** Only `front-nuxt/assets/css/tokens.css`, `front-nuxt/assets/css/hifi-preview.css`, two focused scripts, and the active WP-11.1 devlog/current-state records. No consumer migration, layout change, data write, crawler operation, push, merge, or worktree cleanup.

**Source and no-write boundary:** CSS declarations are the sole source for this preview migration. The browser is used only against the local stack. Screenshot output stays local under `front-nuxt/test-results/theme-token-parity/`; the devlog records command, timestamp, output path, and result, but no generated image is staged.

---

### Task 0: Establish the isolated baseline

**Files:**
- Modify: none
- Test: `front-nuxt/scripts/check-visual-system-contract.mjs`

- [ ] **Step 1: Verify branch and dependency baseline**

Run:

```bash
git status --short --branch
cd front-nuxt
pnpm install --frozen-lockfile
node scripts/check-visual-system-contract.mjs
pnpm run check
```

Expected: the task worktree has no tracked changes before this task; the focused contract and frontend gate exit `0`. Record known Node/Chromium warnings only if they do not change an exit code.

- [ ] **Step 2: Re-read the declaration blocks before changing them**

Run:

```bash
cd front-nuxt
rg -n -- '--index-line|--index-surface|--accent-gold|--button-control-shadow' assets/css/hifi-preview.css
sed -n '1,100p' assets/css/tokens.css
```

Expected: raw legacy definitions occur only in the root, generic light-family, light/morning-paper, and warm-slate blocks; semantic tokens still point back to legacy variables and therefore cannot yet be source owners.

### Task 1: Lock exact semantic ownership first (RED)

**Files:**
- Modify: `front-nuxt/scripts/check-visual-system-contract.mjs`
- Modify: `docs/devlog/entries/2026-07-19-front-wp11-token-alias.md`

- [ ] **Step 1: Add exact CSS-block helpers immediately after `requireRegex`**

```js
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const requireRuleBlock = (path, content, selector) => {
  const start = content.indexOf(`${selector} {`)
  if (start < 0) {
    violations.push(`${path}: missing exact selector block ${selector}`)
    return ''
  }

  const end = content.indexOf('\n}', start)
  if (end < 0) {
    violations.push(`${path}: unterminated selector block ${selector}`)
    return ''
  }

  return content.slice(start, end + 2)
}

const requireDeclarations = (path, block, selector, declarations) => {
  for (const [property, value] of Object.entries(declarations)) {
    requireRegex(path, block, new RegExp(`${escapeRegex(property)}\\s*:\\s*${escapeRegex(value)};`), `${selector} must declare ${property}: ${value};`)
  }
}
```

- [ ] **Step 2: Add this ownership contract in the existing `tokens.css` block**

```js
const semanticThemeBlocks = {
  ':root': {
    '--tp-color-border': 'rgba(217, 185, 91, 0.18)',
    '--tp-color-border-strong': 'rgba(217, 185, 91, 0.26)',
    '--tp-color-surface-soft': 'rgba(244,234,208,0.025)',
    '--tp-color-surface-raised': 'rgba(244,234,208,0.035)',
    '--tp-color-accent': 'var(--gold)',
    '--tp-shadow-control': 'inset 0 1px 0 rgba(244, 234, 208, 0.035)',
  },
  '[data-theme="light"],\n[data-theme="morning-paper"]': {
    '--tp-color-border': 'rgba(122, 90, 33, 0.2)',
    '--tp-color-border-strong': 'rgba(122, 90, 33, 0.34)',
    '--tp-color-surface-soft': 'rgba(255, 250, 241, 0.72)',
    '--tp-color-surface-raised': 'rgba(255, 250, 241, 0.92)',
    '--tp-shadow-control': 'inset 0 1px 0 rgba(255, 255, 255, 0.66), 0 8px 18px rgba(30, 28, 24, 0.05)',
  },
  '[data-theme="warm-slate"]': {
    '--tp-color-border': 'rgba(41, 50, 65, 0.18)',
    '--tp-color-border-strong': 'rgba(41, 50, 65, 0.3)',
    '--tp-color-surface-soft': 'rgba(255, 255, 255, 0.72)',
    '--tp-color-surface-raised': 'rgba(255, 255, 255, 0.94)',
    '--tp-shadow-control': 'inset 0 1px 0 rgba(255, 255, 255, 0.68), 0 8px 18px rgba(0, 0, 0, 0.045)',
  },
}

for (const [selector, declarations] of Object.entries(semanticThemeBlocks)) {
  requireDeclarations(path, requireRuleBlock(path, content, selector), selector, declarations)
}

if (/--tp-(?:color-border(?:-strong)?|color-surface-(?:soft|raised)|color-accent|shadow-control)\s*:\s*var\(--(?:index-line(?:-strong)?|index-surface(?:-strong)?|accent-gold|button-control-shadow)\)/.test(content)) {
  violations.push(`${path}: semantic theme tokens must not read legacy aliases`)
}

if (/--(?:index-line(?:-strong)?|index-surface(?:-strong)?|accent-gold|button-control-shadow)\s*:/.test(content)) {
  violations.push(`${path}: legacy aliases belong only in hifi-preview.css`)
}
```

- [ ] **Step 3: Add this compatibility contract in the existing `hifi-preview.css` block**

```js
const legacyAliases = {
  '--index-line': 'var(--tp-color-border)',
  '--index-line-strong': 'var(--tp-color-border-strong)',
  '--index-surface': 'var(--tp-color-surface-soft)',
  '--index-surface-strong': 'var(--tp-color-surface-raised)',
  '--accent-gold': 'var(--tp-color-accent)',
  '--button-control-shadow': 'var(--tp-shadow-control)',
}
const withoutAccent = Object.fromEntries(Object.entries(legacyAliases).filter(([property]) => property !== '--accent-gold'))
const hifiAliasBlocks = {
  ':root': legacyAliases,
  '[data-theme="light"],\n[data-theme="morning-paper"],\n[data-theme="warm-slate"]': withoutAccent,
  '[data-theme="light"],\n[data-theme="morning-paper"]': withoutAccent,
  '[data-theme="warm-slate"]': withoutAccent,
}

for (const [selector, declarations] of Object.entries(hifiAliasBlocks)) {
  requireDeclarations(path, requireRuleBlock(path, content, selector), selector, declarations)
}

for (const [property, alias] of Object.entries(legacyAliases)) {
  const declarations = [...content.matchAll(new RegExp(`${escapeRegex(property)}\\s*:\\s*([^;]+);`, 'g'))]
  if (declarations.some(([, value]) => value.trim() !== alias)) {
    violations.push(`${path}: ${property} must be the compatibility alias ${alias}`)
  }
}
```

- [ ] **Step 4: Verify the deliberate RED result**

Run: `cd front-nuxt && node scripts/check-visual-system-contract.mjs`

Expected: non-zero exit that names absent raw semantic values in `tokens.css`, semantic-to-legacy references, and raw legacy definitions in `hifi-preview.css`. Fix only test syntax or an assertion that fails for the wrong reason; do not edit CSS yet.

- [ ] **Step 5: Record RED evidence and commit only the contract**

Append command, timestamp, failure categories, reviewer disposition, and serialization rule to the active WP-11.1 devlog. Then run:

```bash
git status --short
git add front-nuxt/scripts/check-visual-system-contract.mjs docs/devlog/entries/2026-07-19-front-wp11-token-alias.md
git diff --cached --stat
git diff --cached --check
git commit -m "test(front): lock theme token ownership"
```

Expected: a focused intentional-RED commit; no production CSS, screenshots, or unrelated devlog index file is staged.

### Task 2: Create a repeatable, theme-aware parity harness

**Files:**
- Create: `front-nuxt/scripts/check-theme-token-visual-parity.mjs`
- Modify: `docs/devlog/entries/2026-07-19-front-wp11-token-alias.md`

- [ ] **Step 1: Add local-only configuration and a stable matrix**

```js
const baseUrl = (process.env.THEME_TOKEN_PARITY_BASE || 'http://localhost:5176').replace(/\/$/, '')
const outputDir = resolve(process.env.THEME_TOKEN_PARITY_OUT || 'test-results/theme-token-parity')
const mode = process.env.THEME_TOKEN_PARITY_MODE
const baselineManifest = resolve(process.env.THEME_TOKEN_PARITY_BASELINE || join(outputDir, 'baseline.json'))
const themes = ['dark', 'morning-paper', 'warm-slate']
const routes = ['/', '/items', '/armor-sets']
const viewports = [{ name: 'mobile', width: 390, height: 900, mobile: true }, { name: 'desktop', width: 1440, height: 1000, mobile: false }]

if (!['capture', 'compare'].includes(mode)) throw new Error('THEME_TOKEN_PARITY_MODE must be capture or compare')
```

- [ ] **Step 2: Reuse the existing CDP connection pattern and make theme setting observable**

Reuse the `connectToChrome`, `setViewport`, and `Runtime.evaluate` request/timeout pattern from `scripts/check-light-theme-typography.mjs`. Before each route capture call `Network.setCookie` with `name: 'terrapedia-theme'`, `value: theme`, and `url: baseUrl`; then run this expression and require `actualTheme === theme`:

```js
const applyThemeExpression = (theme) => `(() => {
  document.cookie = 'terrapedia-theme=${theme}; Path=/; SameSite=Lax';
  localStorage.setItem('terrapedia-theme', ${JSON.stringify(theme)});
  document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
  const style = document.createElement('style');
  style.id = 'theme-token-parity-motion-reset';
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  document.head.append(style);
  return document.documentElement.getAttribute('data-theme');
})()`
```

- [ ] **Step 3: Capture hashes and compare candidate output**

After a route-ready wait matching `check-visual-regression.mjs`, save each PNG below `${outputDir}/${mode}/` and add this exact record to the JSON manifest:

```js
const key = `${theme}|${route}|${viewport.name}`
const sha256 = createHash('sha256').update(pngBuffer).digest('hex')
records.push({ key, theme, route, viewport: viewport.name, actualTheme, path: relative(outputDir, filePath), sha256 })
```

`capture` writes `{ baseUrl, generatedAt, themes, routes, viewports, records }` to `baselineManifest`. `compare` loads that manifest, requires an equal key set, and fails on every SHA-256 mismatch. Always write `candidate.json`; exit `1` for theme, readiness, matrix, or hash failure. Print both manifest paths and `18` successful comparison records on success.

- [ ] **Step 4: Capture baseline and commit the harness**

First run the capture:

```bash
cd front-nuxt
THEME_TOKEN_PARITY_BASE=http://localhost:<allocated-port> THEME_TOKEN_PARITY_OUT=test-results/theme-token-parity THEME_TOKEN_PARITY_MODE=capture node scripts/check-theme-token-visual-parity.mjs
```

Record that command, timestamp, local output directory, and either the 18-record result or explicit local-stack blocker in the WP-11.1 entry before staging. If capture was blocked, do not make this commit; keep the parent task active. For a successful capture, run:

```bash
cd front-nuxt
git status --short
git add scripts/check-theme-token-visual-parity.mjs ../docs/devlog/entries/2026-07-19-front-wp11-token-alias.md
git diff --cached --stat
git diff --cached --check
git commit -m "test(front): add theme token parity harness"
```

Expected: `baseline.json` has 18 records (3 themes × 3 routes × 2 viewports) and test-results remains unstaged. If no compatible local stack is available, record a runtime blocker and keep the task active.

### Task 3: Move the six source values (GREEN)

**Files:**
- Modify: `front-nuxt/assets/css/tokens.css:1-64`
- Modify: `front-nuxt/assets/css/hifi-preview.css:1-76, 118-160, 184-226, 285-327`

- [ ] **Step 1: Replace the six root semantic aliases in `tokens.css` with raw owners**

```css
  --tp-color-surface-soft: rgba(244,234,208,0.025);
  --tp-color-surface-raised: rgba(244,234,208,0.035);
  --tp-color-border: rgba(217, 185, 91, 0.18);
  --tp-color-border-strong: rgba(217, 185, 91, 0.26);
  --tp-color-accent: var(--gold);
  --tp-shadow-control: inset 0 1px 0 rgba(244, 234, 208, 0.035);
```

Do not declare legacy `--index-*`, `--accent-gold`, or `--button-control-shadow` in this file.

- [ ] **Step 2: Add equal-specificity light/morning-paper and warm-slate semantic overrides before the first media query**

```css
[data-theme="light"],
[data-theme="morning-paper"] {
  --tp-color-surface-soft: rgba(255, 250, 241, 0.72);
  --tp-color-surface-raised: rgba(255, 250, 241, 0.92);
  --tp-color-border: rgba(122, 90, 33, 0.2);
  --tp-color-border-strong: rgba(122, 90, 33, 0.34);
  --tp-shadow-control: inset 0 1px 0 rgba(255, 255, 255, 0.66), 0 8px 18px rgba(30, 28, 24, 0.05);
}

[data-theme="warm-slate"] {
  --tp-color-surface-soft: rgba(255, 255, 255, 0.72);
  --tp-color-surface-raised: rgba(255, 255, 255, 0.94);
  --tp-color-border: rgba(41, 50, 65, 0.18);
  --tp-color-border-strong: rgba(41, 50, 65, 0.3);
  --tp-shadow-control: inset 0 1px 0 rgba(255, 255, 255, 0.68), 0 8px 18px rgba(0, 0, 0, 0.045);
}
```

- [ ] **Step 3: Replace raw legacy definitions in all four hifi theme blocks**

Use only these aliases at declarations that already exist; do not add a theme-local `--accent-gold` declaration where none existed:

```css
--index-line: var(--tp-color-border);
--index-line-strong: var(--tp-color-border-strong);
--index-surface: var(--tp-color-surface-soft);
--index-surface-strong: var(--tp-color-surface-raised);
--accent-gold: var(--tp-color-accent);
--button-control-shadow: var(--tp-shadow-control);
```

Do not change `--gold`, active-control shadows, selector order, layouts, or consumers.

- [ ] **Step 4: Verify GREEN and the complete frontend gate**

```bash
cd front-nuxt
node scripts/check-visual-system-contract.mjs
pnpm run check
```

Expected: both exit `0`; the contract proves all five non-accent semantic values in each relevant runtime selector, root accent ownership, exact hifi aliases, no raw legacy declaration, and no semantic-to-legacy reference.

### Task 4: Compare runtime output and locally close out the refactor

**Files:**
- Modify: `docs/devlog/entries/2026-07-19-front-wp11-token-alias.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run candidate comparison against the pre-migration manifest**

```bash
cd front-nuxt
THEME_TOKEN_PARITY_BASE=http://localhost:<allocated-port> THEME_TOKEN_PARITY_OUT=test-results/theme-token-parity THEME_TOKEN_PARITY_MODE=compare THEME_TOKEN_PARITY_BASELINE=test-results/theme-token-parity/baseline.json node scripts/check-theme-token-visual-parity.mjs
```

Expected: 18 equal SHA-256 pairs for dark, morning-paper, and warm-slate. A differing hash is a visual regression: inspect paired local screenshots, repair CSS or the harness, then rerun the focused contract, full check, and comparison; do not close or commit while it differs.

- [ ] **Step 2: Record validation and review disposition**

The coordinator updates the WP-11.1 entry with RED evidence, both plan reviews and repair disposition, GREEN contract, full check, screenshot command/timestamp/local paths, exact 18/18 result, preview-only boundary, and residual data-audit blocker. The coordinator alone edits `docs/devlog/current.md`.

- [ ] **Step 3: Create the local-only refactor commit**

```bash
git status --short
git add front-nuxt/assets/css/tokens.css front-nuxt/assets/css/hifi-preview.css docs/devlog/entries/2026-07-19-front-wp11-token-alias.md docs/devlog/current.md
git diff --cached --stat
git diff --cached --check
git commit -m "refactor(front): centralize theme token aliases"
git status --short --branch
```

Expected: one focused local commit with no generated images staged. Keep `feat/front-p2-wp11-tokens-preview` unmerged and unpushed by user direction; do not claim data, crawler, or release readiness.

### Execution continuity and agent ownership

- The coordinator owns this plan, `docs/devlog/current.md`, final integration, and commits.
- Plan and cascade review may run in parallel only while read-only. The contract, parity script, and CSS migration are serialized because they share the visual acceptance chain.
- After each implementation task, run a read-only spec-compliance review; only after it approves, run a read-only code-quality review. Material findings return the parent entry to `active`, are recorded with a resolver, repaired, and re-reviewed before the next task.
- A missing local stack blocks only runtime parity. It does not authorize substituting screenshots, omitting comparison, merging, or release claims; record the blocker and keep the branch active.
