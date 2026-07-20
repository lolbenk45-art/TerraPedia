# Front WP-11.3 Theme Selector Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the runtime theme alias `[data-theme="light"]` from all public stylesheets via a machine-checkable discrimination scan, while preserving the theme-store normalization that maps old persisted `light` cookies to `morning-paper`.

**Architecture:** A new scan script (`scripts/scan-theme-light-selectors.mjs`) encodes the spec's discrimination rule — a `[data-theme="light"]` selector is a removable alias only when the same rule block also targets `[data-theme="morning-paper"]` with identical declarations; anything else is listed for review and blocks removal. The same script performs the removal under `--apply` with a fail-closed re-scan. Source contracts are updated first (RED), the scripted removal turns them GREEN, and an 18-record theme-token parity comparison plus SSR cookie probes prove runtime equivalence. Because 801 of the 817 occurrences sit inside zero-specificity `:where()` groups and the other 16 are redundant selector-list members of blocks that already target `morning-paper`, the rendered output for `dark`/`morning-paper`/`warm-slate` is byte-identical.

**Tech Stack:** Nuxt 4, Node.js source contracts, CDP/Chromium parity harness, pnpm, curl SSR probes.

**Scope:** Six stylesheets under `front-nuxt/assets/css/` (817 occurrences), five contract scripts, two runtime check matrices, the CSS ratchet budgets, the new scan script, and WP-11.3 devlog records. `stores/theme.ts` and `composables/useUserApi.ts` are explicitly NOT modified — their `light → morning-paper` normalization is the compatibility layer the spec preserves, and a new source guard locks it.

**No-write boundary:** No push, merge to `main`, crawler action, database write, migration, worktree cleanup, or use of port `13012`. Port `5181` (WP-11.1 preview) must not be touched; the local stack backend is used read-only — its port is stack-assigned (recorded in the devlog entry; currently `18091`, not the spec's integration-stage `18088`). The WP-11.3 candidate runs on isolated port `15185`.

**Measured occurrence map (baseline `2ede052e`):**

| File | Total | `:where()` aliases | Standalone list lines |
|---|---|---|---|
| `assets/css/hifi-preview.css` | 495 | 493 | 2 (lines 100, 168) |
| `assets/css/light-theme-contrast-fixes.css` | 229 | 226 (incl. 2 two-theme groups at 415, 439) | 3 (lines 41, 370, 384) |
| `assets/css/catalog-image-fixes.css` | 63 | 63 | 0 |
| `assets/css/discovery-page-fixes.css` | 19 | 19 | 0 |
| `assets/css/primitives.css` | 10 | 0 | 10 (armor lines 404–436) |
| `assets/css/tokens.css` | 1 | 0 | 1 (line 113) |
| **Total** | **817** | **801** | **16** |

Only two `:where()` shapes exist: `:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])` (799×) and `:where([data-theme="light"], [data-theme="morning-paper"])` (2×). Every standalone line ends with `,` and has a same-block `morning-paper` counterpart. There are no single-quoted variants, no occurrences in `.vue`/`.ts` files, none in comments, and none outside `front-nuxt`.

**Contract scripts referencing the alias (all updated in Task 2):** `check-public-pages.mjs` (9), `check-home-j1-index.mjs` (22), `check-visual-system-contract.mjs` (5), `check-nav-layout-contract.mjs` (1). Runtime matrices: `check-light-theme-typography.mjs` (`targetThemes` includes `light`), `check-home-visual-lightweight-runtime.mjs` (`themes` includes `light`). `check-typography-spacing.mjs` and `check-theme-token-visual-parity.mjs` already use `['dark', 'morning-paper', 'warm-slate']` — no change.

---

### Task 0: Baseline, Parity Capture, and Plan Checkpoint

**Files:**
- Create: `docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md`
- Create: `docs/superpowers/plans/2026-07-20-front-wp11-theme-cleanup.md` (this file)

- [ ] **Step 1: Verify branch, base, and worktree state**

From the worktree root `/home/lolben/TerraPedia/.claude/worktrees/front-p2-wp11-theme`:

```bash
git status --short --branch
git log --oneline -1
ls scripts/dev/config/local-stack.config.json
```

Expected: branch `feat/front-p2-wp11-theme-cleanup`, clean worktree, HEAD `2ede052e`, and the gitignored `local-stack.config.json` present (without it the MinIO image proxy falls back to empty port 19000 and runtime checks time out on image 404s).

- [ ] **Step 2: Verify dependencies**

```bash
cd front-nuxt
pnpm install --frozen-lockfile
```

Expected: exit `0`.

- [ ] **Step 3: Run the clean baselines**

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
node scripts/check-visual-system-contract.mjs
node scripts/check-nav-layout-contract.mjs
node scripts/check-home-j1-index.mjs
pnpm run check
grep -ro 'data-theme="light"' assets/css | wc -l
```

Expected: all contracts pass, full check exits `0`, and the grep count is exactly `817`. If the full check exposes an unrelated baseline failure, record the exact failing command and stop for plan repair instead of weakening a gate.

- [ ] **Step 4: Start the candidate server and capture the parity baseline**

Use port `15185` unless occupied; if occupied, choose another unused loopback port and record it. Run the server in the background:

```bash
cd front-nuxt
PORT=15185 NUXT_PUBLIC_API_BASE=http://127.0.0.1:18091/api pnpm exec nuxt dev --host 127.0.0.1 --port 15185
```

(`18091` is the stack-assigned backend port this boot — check the devlog entry if the stack was restarted since.) Wait for the server to answer `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:15185/` with `200`, then capture:

```bash
cd front-nuxt
THEME_TOKEN_PARITY_BASE=http://127.0.0.1:15185 \
THEME_TOKEN_PARITY_MODE=capture \
THEME_TOKEN_PARITY_OUT=test-results/wp11-theme-cleanup-parity \
node scripts/check-theme-token-visual-parity.mjs
```

Expected: 18 baseline records (`dark`/`morning-paper`/`warm-slate` × `/`, `/items`, `/armor-sets` × 2 viewports) written to `front-nuxt/test-results/wp11-theme-cleanup-parity/baseline.json` (gitignored). Also record the SSR compatibility baseline:

```bash
curl -s -H 'Cookie: terrapedia-theme=light' http://127.0.0.1:15185/ | grep -o '<html[^>]*data-theme="[^"]*"'
curl -s -H 'Cookie: terrapedia-theme=warm-slate' http://127.0.0.1:15185/ | grep -o '<html[^>]*data-theme="[^"]*"'
curl -s http://127.0.0.1:15185/ | grep -o '<html[^>]*data-theme="[^"]*"'
```

Expected: `data-theme="morning-paper"`, `data-theme="warm-slate"`, `data-theme="dark"` respectively. Keep the server running or stop it — Task 4 restarts it either way.

- [ ] **Step 5: Create the devlog entry**

Create `docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md`:

```markdown
# Devlog: Front P2 WP-11.3 theme selector cleanup

## Status

`in_progress`

## Context

- User goal: continue Front P2 through the local integration chain; WP-11.3
  removes the runtime theme alias `[data-theme="light"]` from stylesheets.
- Branch: `feat/front-p2-wp11-theme-cleanup`
- Worktree: `.claude/worktrees/front-p2-wp11-theme`
- Base: `feat/front-p2-wp11-layout` at `2ede052e` (WP-11.2 default layout).
- Related docs:
  `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md` and
  `docs/superpowers/plans/2026-07-20-front-wp11-theme-cleanup.md`.
- Related prior entry:
  `docs/devlog/entries/2026-07-19-front-wp11-default-layout.md`.

## Direction / Decisions

- Chosen approach: a scripted discrimination scan classifies all 817
  `[data-theme="light"]` occurrences before any removal; removal is executed
  by the same script under `--apply` with a fail-closed re-scan; contracts are
  updated RED-first.
- Discrimination rule (from the spec): a `[data-theme="light"]` selector is a
  removable alias when the same rule block also targets
  `[data-theme="morning-paper"]` with identical declarations — trivially true
  for same-prelude selector lists and `:where()` groups; anything else lands
  on a review list that blocks `--apply`.
- Rejected options: manual per-selector judgment (817 occurrences), and
  removing the theme-store `light → morning-paper` normalization (old
  persisted cookies must keep working).

## Scope

- Frontend: six stylesheets under `assets/css/`, five contract scripts, two
  runtime check matrices, CSS ratchet budgets, the new scan script.
- Backend: none. Data: no writes.
- Out of scope: `stores/theme.ts` and `composables/useUserApi.ts` (compat
  normalization preserved), WP-11.4 onward, visual redesign, push, merge.

## Validation

- (filled at close)

## Result

- (filled at close)

## Residual Risks

- (filled at close)

## Follow-up

- WP-11.4 (next): catalog stylesheet promotion per the P2 remaining design.
- Local integration: coordinator merges the WP-11.3 commit into local
  `feat/front-p2-integration` (branch may need creating) together with the
  pending WP-11.2 commit.

## State Changes

### 2026-07-20 (opening)

- Change: WP-11.3 plan checkpoint committed; baseline gates green at
  `2ede052e`; 18-record parity baseline and SSR cookie-compat probes captured
  from the candidate port.
- Evidence: `docs/superpowers/plans/2026-07-20-front-wp11-theme-cleanup.md`.

## Commits

- (filled at close)
```

- [ ] **Step 6: Commit the plan checkpoint**

```bash
git add docs/superpowers/plans/2026-07-20-front-wp11-theme-cleanup.md docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md
git commit -m "docs(front): plan wp11.3 theme selector cleanup"
```

---

### Task 1: Discrimination Scan Script

**Files:**
- Create: `front-nuxt/scripts/scan-theme-light-selectors.mjs`

- [ ] **Step 1: Write the scan script**

Create `front-nuxt/scripts/scan-theme-light-selectors.mjs` with exactly this content:

```js
// WP-11.3 判别扫描:样式层的 [data-theme="light"] 只在"同一 rule block 内存在
// [data-theme="morning-paper"] 对应选择器(声明因此天然一致)"时才是可删的运行时别名。
// 规则外的一律进 review 清单并以非零退出;--apply 仅在 review 为空时执行删除,
// 且删除后就地复扫,残留任何 light 选择器则不落盘并报错。
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const apply = process.argv.includes('--apply')
const LIGHT = '[data-theme="light"]'
const MORNING = '[data-theme="morning-paper"]'

const listCssFiles = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = `${dir}/${entry.name}`
  if (entry.isDirectory()) {
    return listCssFiles(path)
  }
  return entry.name.endsWith('.css') ? [path] : []
})

// 注释体替换为等长空白,保持行号与索引稳定。
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

// 每个 '{' 前、自上一个 '{'/'}'/';' 起的文本即 prelude;@ 块 prelude 不含
// 目标 token,天然被忽略,块内 rule 由同一游标继续覆盖。
const collectPreludes = (css) => {
  const preludes = []
  let anchor = 0
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index]
    if (character === '"' || character === "'") {
      const quote = character
      index += 1
      while (index < css.length && css[index] !== quote) {
        if (css[index] === '\\') {
          index += 1
        }
        index += 1
      }
      continue
    }
    if (character === '{') {
      preludes.push({ prelude: css.slice(anchor, index), start: anchor })
      anchor = index + 1
      continue
    }
    if (character === '}' || character === ';') {
      anchor = index + 1
    }
  }
  return preludes
}

const splitTopLevelCommas = (text) => {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
    }
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

const countOccurrences = (text, token) => text.split(token).length - 1

const classifyPrelude = (prelude) => {
  let removable = 0
  const reviewSelectors = []
  const selectors = splitTopLevelCommas(prelude).map((selector) => selector.trim())
  for (const selector of selectors) {
    // :where(...) 组内:同组含 morning-paper 即为别名(:where 零特异性,删除不改级联)。
    for (const group of selector.match(/:where\(([^)]*)\)/g) ?? []) {
      const args = group.slice(':where('.length, -1)
      const count = countOccurrences(args, LIGHT)
      if (count === 0) {
        continue
      }
      if (args.includes(MORNING)) {
        removable += count
      } else {
        reviewSelectors.push(selector)
      }
    }
    // :where 之外:同一选择器列表存在 light→morning-paper 替换后的完全对应体即为别名。
    const outside = countOccurrences(selector.replace(/:where\([^)]*\)/g, ''), LIGHT)
    if (outside > 0) {
      const counterpart = selector.replaceAll(LIGHT, MORNING).trim()
      if (selectors.includes(counterpart)) {
        removable += outside
      } else {
        reviewSelectors.push(selector)
      }
    }
  }
  return { removable, reviewSelectors }
}

const scanFile = (path, css) => {
  const stripped = stripComments(css)
  const result = { path, occurrences: countOccurrences(stripped, LIGHT), removable: 0, reviewItems: [] }
  for (const { prelude, start } of collectPreludes(stripped)) {
    if (!prelude.includes(LIGHT)) {
      continue
    }
    const { removable, reviewSelectors } = classifyPrelude(prelude)
    result.removable += removable
    for (const selector of reviewSelectors) {
      result.reviewItems.push({ path, line: stripped.slice(0, start).split('\n').length, selector })
    }
  }
  return result
}

// 删除变换只作用于两种已分类形态;其余形态经由复扫兜底拒绝。
const applyRemoval = (css) => {
  const collapsed = css.replaceAll(`:where(${LIGHT}, `, ':where(')
  return collapsed.split('\n').filter((line) => {
    const trimmed = line.trim()
    return !(trimmed.startsWith(LIGHT) && trimmed.endsWith(',') && !trimmed.slice(0, -1).includes(','))
  }).join('\n')
}

const files = listCssFiles('assets/css')
const results = files.map((path) => scanFile(path, readFileSync(join(root, path), 'utf8')))
const totals = results.reduce((sum, result) => ({
  occurrences: sum.occurrences + result.occurrences,
  removable: sum.removable + result.removable,
  review: sum.review + result.reviewItems.length,
}), { occurrences: 0, removable: 0, review: 0 })

const outDir = join(root, 'test-results', 'wp11-theme-light-scan')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'report.json'), `${JSON.stringify({ totals, files: results }, null, 2)}\n`)

for (const result of results.filter((entry) => entry.occurrences > 0)) {
  console.log(`${result.path}: ${result.occurrences} occurrences, ${result.removable} removable, ${result.reviewItems.length} review`)
}
console.log(`total: ${totals.occurrences} occurrences, ${totals.removable} removable, ${totals.review} review`)

if (totals.review > 0) {
  for (const item of results.flatMap((result) => result.reviewItems)) {
    console.error(`[review] ${item.path}:${item.line} ${item.selector}`)
  }
  console.error('review list is not empty; manual adjudication required before removal')
  process.exit(1)
}

if (apply) {
  const rewrites = []
  for (const path of files) {
    const css = readFileSync(join(root, path), 'utf8')
    if (!css.includes(LIGHT)) {
      continue
    }
    const next = applyRemoval(css)
    const remaining = countOccurrences(stripComments(next), LIGHT)
    if (remaining > 0) {
      console.error(`[apply] ${path}: ${remaining} occurrences survive the transform; aborting without writing`)
      process.exit(1)
    }
    rewrites.push({ path, next, removedLines: css.split('\n').length - next.split('\n').length })
  }
  for (const { path, next, removedLines } of rewrites) {
    writeFileSync(join(root, path), next)
    console.log(`[apply] ${path}: rewritten, ${removedLines} selector lines removed`)
  }
}
```

- [ ] **Step 2: Run the scan and verify the classification**

```bash
cd front-nuxt
node scripts/scan-theme-light-selectors.mjs
grep -ro 'data-theme="light"' assets/css | wc -l
```

Expected: exit `0`; per-file lines matching the occurrence map in the plan header (hifi 495, contrast 229, catalog 63, discovery 19, primitives 10, tokens 1); summary `total: 817 occurrences, 817 removable, 0 review`; grep cross-check `817`. If any review item appears or totals differ from the grep count, stop — the corpus changed or the parser is wrong; do not proceed to removal.

- [ ] **Step 3: Commit**

```bash
git add front-nuxt/scripts/scan-theme-light-selectors.mjs
git commit -m "chore(front): add light selector discrimination scan"
```

---

### Task 2: RED — Contract Retirement Lock

**Files:**
- Modify: `front-nuxt/scripts/check-public-pages.mjs:1,1098,1205,3650-3657,3762,3820-3826`
- Modify: `front-nuxt/scripts/check-visual-system-contract.mjs:268,483-484,550,670`
- Modify: `front-nuxt/scripts/check-nav-layout-contract.mjs:174`
- Modify: `front-nuxt/scripts/check-home-j1-index.mjs` (22 occurrences)
- Modify: `front-nuxt/scripts/check-light-theme-typography.mjs:5,8-14`
- Modify: `front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs:16-17,238,345`

All edits below use the post-cleanup selector forms: the triple group becomes `:where([data-theme="morning-paper"], [data-theme="warm-slate"])` and the double becomes `:where([data-theme="morning-paper"])`.

- [ ] **Step 1: Update `check-public-pages.mjs`**

1a. Line 1 — add `readdirSync` to the import:

```js
import { readFileSync, existsSync, readdirSync } from 'node:fs'
```

1b. Line 1098 — replace:

```js
const lightThemeSelector = ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])'
```

with:

```js
const lightThemeSelector = ':where([data-theme="morning-paper"], [data-theme="warm-slate"])'
```

1c. Directly after the (new) line 1098, insert the retirement sweep and store guard:

```js
// WP-11.3:运行时主题别名 [data-theme="light"] 已退役,样式层不得再出现该选择器;
// 兼容归一化保留在 stores/theme.ts(旧 cookie 'light' → 'morning-paper')。
const listThemeCssFiles = (dir) => readdirSync(file(dir), { withFileTypes: true }).flatMap((entry) => {
  const path = `${dir}/${entry.name}`
  if (entry.isDirectory()) {
    return listThemeCssFiles(path)
  }
  return entry.name.endsWith('.css') ? [path] : []
})

for (const cssPath of listThemeCssFiles('assets/css')) {
  if (readFileSync(file(cssPath), 'utf8').includes('[data-theme="light"]')) {
    violations.push(`${cssPath}: retired runtime theme alias [data-theme="light"] must not appear in stylesheets`)
  }
}

const themeStoreSource = readFileSync(file('stores/theme.ts'), 'utf8')
if (!themeStoreSource.includes("if (value === 'light')") || !themeStoreSource.includes("return 'morning-paper'")) {
  violations.push("stores/theme.ts: legacy persisted 'light' must keep normalizing to 'morning-paper'")
}
```

Note: this block must come after the `violations` array and `file` helper are defined (both are — `violations` at line 1095, `file` earlier); placing it right after `lightThemeSelector` satisfies that.

1d. Line 1205 (now shifted) — replace the regex:

```js
if (!/\[data-theme="light"\]\s*,\s*\n\[data-theme="morning-paper"\]\s*,\s*\n\[data-theme="warm-slate"\]\s*\{[\s\S]*--theme-surface-shadow:/m.test(lightContrastCss)) {
```

with:

```js
if (!/\[data-theme="morning-paper"\]\s*,\s*\n\[data-theme="warm-slate"\]\s*\{[\s\S]*--theme-surface-shadow:/m.test(lightContrastCss)) {
```

1e. Around line 3650 — replace:

```js
    const sharedLightSelector = ':where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])'
    const lightHeroJ1CellRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.hero-j1-cell\s*\{[^}]*background\s*:/m
```

with:

```js
    const sharedLightSelector = ':where([data-theme="morning-paper"], [data-theme="warm-slate"])'
    const lightHeroJ1CellRule = /:where\(\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.hero-j1-cell\s*\{[^}]*background\s*:/m
```

and the sibling `lightHeroJ1PathRule` (line 3656):

```js
    const lightHeroJ1PathRule = /:where\(\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)\s+\.hero-j1-path-link\s*\{[^}]*background\s*:/m
```

1f. Line 3762 — replace:

```js
    for (const selector of ['[data-theme="morning-paper"]', '[data-theme="warm-slate"]', '[data-theme="light"]']) {
```

with:

```js
    for (const selector of ['[data-theme="morning-paper"]', '[data-theme="warm-slate"]']) {
```

1g. Lines 3820–3826 — in the forbidden `.item-art` resize list, delete these three (now vacuous) entries, keeping the six `morning-paper`/`warm-slate` entries:

```js
      '[data-theme="light"] .item-art',
      '[data-theme="light"] .boss-medallion .item-art',
      '[data-theme="light"] .loot-grid .item-art',
```

- [ ] **Step 2: Update `check-visual-system-contract.mjs`**

2a. Line 268 (tokens.css semantic block key) — replace:

```js
    '[data-theme="light"],\n[data-theme="morning-paper"]': {
```

with:

```js
    '[data-theme="morning-paper"]': {
```

2b. Lines 483–484 (hifi legacy alias block keys) — replace:

```js
    '[data-theme="light"],\n[data-theme="morning-paper"],\n[data-theme="warm-slate"]': withoutAccent,
    '[data-theme="light"],\n[data-theme="morning-paper"]': withoutAccent,
```

with:

```js
    '[data-theme="morning-paper"],\n[data-theme="warm-slate"]': withoutAccent,
    '[data-theme="morning-paper"]': withoutAccent,
```

2c. Line 550 — replace:

```js
  const lightThemeSelectorPattern = String.raw`:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)`
```

with:

```js
  const lightThemeSelectorPattern = String.raw`:where\(\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)`
```

2d. Line 670 — in `activeCatalogControlsRule`, replace the leading `:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)` with `:where\(\[data-theme="morning-paper"\],\s*\[data-theme="warm-slate"\]\)` (rest of the regex unchanged).

- [ ] **Step 3: Update `check-nav-layout-contract.mjs` line 174**

Replace the negative-assertion marker string:

```js
if (hifiCss.includes(']) .site-link.active,\n:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"]) .site-link:hover {\n  background: var(--theme-active-bg);')) {
```

with:

```js
if (hifiCss.includes(']) .site-link.active,\n:where([data-theme="morning-paper"], [data-theme="warm-slate"]) .site-link:hover {\n  background: var(--theme-active-bg);')) {
```

- [ ] **Step 4: Update `check-home-j1-index.mjs` (21 plain-string + 1 regex occurrence)**

Mechanical replacement for the plain JS strings:

```bash
cd front-nuxt
sed -i \
  -e 's/:where(\[data-theme="light"\], \[data-theme="morning-paper"\], \[data-theme="warm-slate"\])/:where([data-theme="morning-paper"], [data-theme="warm-slate"])/g' \
  -e 's/:where(\[data-theme="light"\], \[data-theme="morning-paper"\])/:where([data-theme="morning-paper"])/g' \
  scripts/check-home-j1-index.mjs
```

Then one manual edit for the regex literal at line 633 — replace:

```js
  const lightHomeGridRule = /:where\(\[data-theme="light"\],\s*\[data-theme="morning-paper"\]\)\s+\.home-screen\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*background-size\s*:\s*64px 64px,\s*64px 64px/m
```

with:

```js
  const lightHomeGridRule = /:where\(\[data-theme="morning-paper"\]\)\s+\.home-screen\s*\{[^}]*var\(--index-grid-x\)[^}]*var\(--index-grid-y\)[^}]*background-size\s*:\s*64px 64px,\s*64px 64px/m
```

Verify zero remaining references:

```bash
grep -c 'data-theme="light"' scripts/check-home-j1-index.mjs
```

Expected: `0`.

- [ ] **Step 5: Update the typography runtime matrix (`check-light-theme-typography.mjs`)**

5a. Line 5 — replace:

```js
const targetThemes = ['light', 'morning-paper', 'warm-slate']
```

with:

```js
const targetThemes = ['morning-paper', 'warm-slate']
```

5b. Lines 8–14 — delete the `light` entry from `expectedThemeTokens`, so it begins:

```js
const expectedThemeTokens = {
  'morning-paper': {
```

(The `colorScheme.includes('light')` assertions at lines 463/579 refer to the CSS `color-scheme` keyword, not the retired theme — leave them untouched.)

- [ ] **Step 6: Update `check-home-visual-lightweight-runtime.mjs`**

6a. Lines 16–17 — replace:

```js
const themes = ['dark', 'light', 'morning-paper', 'warm-slate']
const normalizeRuntimeTheme = (theme) => theme === 'light' ? 'morning-paper' : theme
```

with:

```js
const themes = ['dark', 'morning-paper', 'warm-slate']
```

6b. Line 238 (now shifted) — replace:

```js
  const runtimeTheme = ${JSON.stringify(normalizeRuntimeTheme(theme))};
```

with:

```js
  const runtimeTheme = ${JSON.stringify(theme)};
```

6c. Line 345 — replace:

```js
        assertMetric(value.actualTheme === normalizeRuntimeTheme(theme), `${label}: expected theme to apply`, value)
```

with:

```js
        assertMetric(value.actualTheme === theme, `${label}: expected theme to apply`, value)
```

Verify no `normalizeRuntimeTheme` reference survives:

```bash
grep -c 'normalizeRuntimeTheme' scripts/check-home-visual-lightweight-runtime.mjs
```

Expected: `0`.

- [ ] **Step 7: Observe RED**

```bash
cd front-nuxt
node scripts/check-public-pages.mjs; echo "public-pages exit $?"
node scripts/check-visual-system-contract.mjs; echo "visual-system exit $?"
node scripts/check-home-j1-index.mjs; echo "home-j1 exit $?"
node scripts/check-nav-layout-contract.mjs; echo "nav-layout exit $?"
```

Expected: `check-public-pages` FAILS — the violation list includes the six `retired runtime theme alias` entries (one per stylesheet), and the `lightThemeSelector`-based includes-checks around lines 1163–1171 (the CSS still holds the triple form); the store guard itself passes. (The updated 1205 surface-shadow regex is unanchored and already matches the pre-removal CSS — it is NOT expected to fail RED.) `check-visual-system` FAILS on the three exact-block keys plus the two regex patterns; `check-home-j1-index` FAILS on its post-cleanup selector requirements; `check-nav-layout` PASSES (its light reference is a negative assertion). If `check-public-pages` instead fails on the store guard, stop — `stores/theme.ts` changed unexpectedly.

- [ ] **Step 8: Commit RED**

```bash
git add front-nuxt/scripts/check-public-pages.mjs front-nuxt/scripts/check-visual-system-contract.mjs front-nuxt/scripts/check-nav-layout-contract.mjs front-nuxt/scripts/check-home-j1-index.mjs front-nuxt/scripts/check-light-theme-typography.mjs front-nuxt/scripts/check-home-visual-lightweight-runtime.mjs
git commit -m "test(front): lock light theme selector retirement"
```

---

### Task 3: GREEN — Scripted Removal and Ratchet Tightening

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`, `light-theme-contrast-fixes.css`, `catalog-image-fixes.css`, `discovery-page-fixes.css`, `primitives.css`, `tokens.css` (via `--apply`)
- Modify: `front-nuxt/scripts/check-css-ratchet.mjs:13-19`

- [ ] **Step 1: Apply the scripted removal**

```bash
cd front-nuxt
node scripts/scan-theme-light-selectors.mjs --apply
node scripts/scan-theme-light-selectors.mjs
grep -ro 'data-theme="light"' assets/css | wc -l
```

Expected: apply reports six rewritten files; the re-scan reports `total: 0 occurrences, 0 removable, 0 review`; grep count `0`. Six standalone lines disappear entirely (hifi −2, contrast −3, tokens −1) and primitives loses its 10 armor alias lines.

- [ ] **Step 2: Tighten the CSS ratchet**

Measure and update the two affected budgets in `scripts/check-css-ratchet.mjs`:

```bash
cd front-nuxt
wc -l assets/css/hifi-preview.css assets/css/light-theme-contrast-fixes.css
```

Expected: `10280` and `907` (from 10282/910; if the measured numbers differ, use the measured numbers). Then in the `BUDGETS` object replace:

```js
  'assets/css/hifi-preview.css': 10282,
```

with:

```js
  'assets/css/hifi-preview.css': 10280,
```

and:

```js
  'assets/css/light-theme-contrast-fixes.css': 910,
```

with:

```js
  'assets/css/light-theme-contrast-fixes.css': 907,
```

- [ ] **Step 3: Observe GREEN on the focused contracts**

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
node scripts/check-visual-system-contract.mjs
node scripts/check-nav-layout-contract.mjs
node scripts/check-home-j1-index.mjs
node scripts/check-css-ratchet.mjs
```

Expected: all pass with exit `0`.

- [ ] **Step 4: Run the full frontend gate**

```bash
cd front-nuxt
pnpm run check
git diff --check
```

Expected: exit `0` for both (baseline UPower/deprecation warnings acceptable per prior packages).

- [ ] **Step 5: Commit GREEN**

```bash
git add front-nuxt/assets/css front-nuxt/scripts/check-css-ratchet.mjs
git commit -m "feat(front): retire runtime light theme selector alias"
```

---

### Task 4: Runtime Equivalence Evidence

**Files:**
- Modify: none (evidence only; artifacts under gitignored `test-results/`)

- [ ] **Step 1: Restart the candidate server on the cleaned tree**

Stop any Task 0 candidate process, then:

```bash
cd front-nuxt
PORT=15185 NUXT_PUBLIC_API_BASE=http://127.0.0.1:18091/api pnpm exec nuxt dev --host 127.0.0.1 --port 15185
```

The backend base MUST be the same one the Task 0 baseline was captured against (stack-assigned `18091` this boot; see the devlog entry) — parity comparison is only valid in the same backend environment. Wait for `200` from `http://127.0.0.1:15185/`.

- [ ] **Step 2: Compare theme-token parity against the Task 0 baseline**

```bash
cd front-nuxt
THEME_TOKEN_PARITY_BASE=http://127.0.0.1:15185 \
THEME_TOKEN_PARITY_MODE=compare \
THEME_TOKEN_PARITY_OUT=test-results/wp11-theme-cleanup-parity \
node scripts/check-theme-token-visual-parity.mjs
```

Expected: all 18 records match the baseline exactly. Rationale: removal only touched zero-specificity `:where()` membership and redundant selector-list entries for a `data-theme` value the DOM never carries — any mismatch is a real regression; stop and debug (known quirk from WP-11.2: the script exits before writing `candidate.json` on mismatch, so diagnose via the console diff output).

- [ ] **Step 3: Run the reduced typography runtime matrix**

```bash
cd front-nuxt
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:15185 node scripts/check-light-theme-typography.mjs
```

Expected: passes for the 2-theme matrix (`morning-paper`, `warm-slate`) with no forced `light` DOM state.

- [ ] **Step 4: Probe SSR cookie compatibility**

```bash
curl -s -H 'Cookie: terrapedia-theme=light' http://127.0.0.1:15185/ | grep -o '<html[^>]*data-theme="[^"]*"'
curl -s -H 'Cookie: terrapedia-theme=warm-slate' http://127.0.0.1:15185/ | grep -o '<html[^>]*data-theme="[^"]*"'
curl -s -H 'Cookie: terrapedia-theme=bogus-value' http://127.0.0.1:15185/ | grep -o '<html[^>]*data-theme="[^"]*"'
curl -s http://127.0.0.1:15185/ | grep -o '<html[^>]*data-theme="[^"]*"'
```

Expected: `morning-paper`, `warm-slate`, `dark`, `dark` — identical to the Task 0 baseline probes, proving the store normalization still owns compatibility.

- [ ] **Step 5: Stop the candidate server**

Stop only the `15185` process. Do not touch `5181`, the stack backend (`18091`), the stack's own front (`15177`) / data-query-app (`13004`), or other worktree services.

---

### Task 5: Closeout

**Files:**
- Modify: `docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Close the devlog entry**

In `docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md`: set Status to `` `closed` ``; fill Validation with the commands run (scan totals 817/817/0, RED observations, GREEN focused + `pnpm run check`, 18/18 parity match, typography 2-theme pass, four cookie probes); fill Result (817 occurrences removed across six stylesheets, ratchet lowered to the measured 10280/907, contracts updated, store normalization guarded); fill Residual Risks (parity script still exits before writing candidate.json on mismatch — unchanged upstream quirk; `check-home-j1-index.mjs` remains outside the main check chain); append a State Changes entry with the timestamp and evidence; list the four commits (plan/chore/test/feat SHAs — record the docs-close commit as "this commit").

- [ ] **Step 2: Update `docs/devlog/current.md`**

In **Active Focus**, replace the WP-11.2/WP-11.3 paragraph:

```markdown
- Front P2 WP-11.2 is closed on `feat/front-p2-wp11-layout`; the next package
  is WP-11.3 theme-selector cleanup on its own branch/worktree from the
  WP-11.2 commit. Remaining packages stay serialized as WP-11.3, WP-11.4,
  WP-12, WP-13, and WP-14 before local integration into
  `feat/front-p2-integration` and user acceptance.
```

with:

```markdown
- Front P2 WP-11.3 is closed on `feat/front-p2-wp11-theme-cleanup`; the next
  package is WP-11.4 catalog stylesheet promotion on its own branch/worktree
  from the WP-11.3 commit. Remaining packages stay serialized as WP-11.4,
  WP-12, WP-13, and WP-14 before local integration into
  `feat/front-p2-integration` and user acceptance.
```

In **Next Agent Should Start Here**, replace the WP-11.3 bullet with:

```markdown
- For Front P2 work, WP-11.3 is closed at the head commit of
  `feat/front-p2-wp11-theme-cleanup`. Start WP-11.4 (catalog stylesheet
  promotion) on a new branch/worktree based on that commit, per
  `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md`: promote
  the complete `assets/css/catalog-image-fixes.css` contents into
  `assets/css/domains/catalog.css` preserving cascade and selector order,
  update `app.css`/contracts/ratchet, and remove the retired patch file
  without a forwarding import. Seven catalog list pages must stay
  pixel-equivalent. Read
  `entries/2026-07-20-front-wp11-theme-selector-cleanup.md` for the WP-11.3
  handoff (`[data-theme="light"]` is retired from stylesheets and forbidden
  by contract; the theme store still normalizes old `light` cookies).
```

Add to **Recently Closed** (top of the list):

```markdown
- `docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md`
  - branch: `feat/front-p2-wp11-theme-cleanup`
  - status: `closed`
  - commits: plan/scan/RED/GREEN SHAs as recorded in the entry
```

Update the `Last updated` line with the current timestamp.

- [ ] **Step 3: Final verification and commit**

```bash
cd front-nuxt && pnpm run check && cd ..
git diff --check
git add docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md docs/devlog/current.md
git commit -m "docs(devlog): close wp11.3 theme selector cleanup"
git status --short --branch
git log --oneline 2ede052e..HEAD
```

Expected: full gate green, clean tree after commit, and five commits above `2ede052e` (plan, scan, RED, GREEN, docs-close). Report the final SHAs. Do not push, merge, or clean up the worktree.
