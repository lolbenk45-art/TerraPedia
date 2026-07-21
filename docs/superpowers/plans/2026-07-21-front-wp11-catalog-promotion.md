# Front WP-11.4 Catalog Stylesheet Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the complete contents of `assets/css/catalog-image-fixes.css` into `assets/css/domains/catalog.css`, retire the patch file and its ratchet budget, and keep the seven catalog list pages pixel-equivalent.

**Architecture:** This is a file-ownership migration, not a visual redesign. The catalog patch becomes a domain stylesheet loaded through `domains/index.css` after tokens/primitives (the design-system layering already documented in `app.css`). Selector order inside the file is preserved byte-for-byte. Cascade position relative to hifi remains "after" (catalog still wins equal-specificity fights with hifi). `light-theme-contrast-fixes.css` and `discovery-page-fixes.css` contain zero catalog selectors, so moving catalog after them does not invert any light-theme override. Contracts and inventories that name the old path are updated RED-first; the promotion turns them GREEN; an 18-record theme-token parity compare on catalog-heavy routes plus focused visual checks on the seven list pages prove pixel equivalence.

**Tech Stack:** Nuxt 4, CSS `@import` cascade, Node.js source contracts, CDP/Chromium theme-token parity, pnpm.

**Scope:** One new domain file, one deleted patch file, `app.css`, `domains/index.css`, CSS ratchet, six contract/inventory scripts, WP-11.4 plan + devlog. No Vue/TS behavior changes, no theme-store changes, no backend/data writes.

**No-write boundary:** No push, merge to `main`, crawler action, database write, migration, worktree cleanup, or use of port `13012`. Port `5181` (WP-11.1 baseline preview) must not be touched. Local stack backend is read-only — stack-assigned port (currently `18091`, not the integration-stage `18088`). Candidate runs on isolated port `15186`.

**Measured baseline (at `dfa5cfae`):**

| Item | Value |
|---|---|
| `assets/css/catalog-image-fixes.css` | 1878 lines (ratchet budget 1878) |
| `assets/css/domains/catalog.css` | does not exist |
| `domains/index.css` | imports crafting, biome, public-layout only; comments already name `./catalog.css` as the intended slot |
| `app.css` import of patch | line 17: `@import "./catalog-image-fixes.css";` (between mobile-typography and discovery) |
| Catalog selectors in light-contrast / discovery | 0 (cascade inversion risk empty) |
| Catalog-class consumers | `pages/items/index.vue` (primary), `pages/npcs/index.vue` (partial), `components/catalog/*` |
| Seven catalog list pages (acceptance) | `/items`, `/armor-sets`, `/biomes`, `/bosses`, `/npcs`, `/buffs`, `/projectiles` |

**Contract/inventory references to retarget (all Task 2):**

| Script | Current path usage |
|---|---|
| `check-public-pages.mjs:1090` | `scanFiles` entry |
| `check-public-pages.mjs:3284` | path-gated marker block |
| `check-visual-system-contract.mjs:663` | path-gated active-control rule |
| `check-loading-skeleton-contract.mjs:88,102` | assertMarkers / assertNoMarkers |
| `check-preview-image-fallback-contract.mjs:144` | has-fallback-icon inventory |
| `check-css-ratchet.mjs:14` | budget entry (delete) |
| `check-visual-regression.mjs:963` | publicCss inventory |
| `check-visual-regression.mjs:1229` | app.css import marker (must stop requiring the retired name; require domains import instead) |

**Cascade after promotion (nuxt.config + app.css):**

1. `app.css` → loading-skeleton, hifi, mobile-typography, discovery, light-contrast (no catalog patch)
2. `detail-layout.css`
3. `tokens.css` → `primitives.css`
4. `domains/index.css` → crafting, biome, public-layout, **catalog**
5. `pages/exceptions.css`

---

### Task 0: Baseline, Parity Capture, and Plan Checkpoint

**Files:**
- Create: `docs/devlog/entries/2026-07-21-front-wp11-catalog-promotion.md`
- Create: `docs/superpowers/plans/2026-07-21-front-wp11-catalog-promotion.md` (this file)

- [ ] **Step 1: Verify branch, base, and worktree state**

From `/home/lolben/TerraPedia/.claude/worktrees/front-p2-wp11-catalog`:

```bash
git status --short --branch
git log --oneline -1
git merge-base --is-ancestor dfa5cfaefa3ad24806b581f76636c212b739f40b HEAD
ls scripts/dev/config/local-stack.config.json
test -d front-nuxt/node_modules && echo deps-ok
```

Expected: branch `feat/front-p2-wp11-catalog`, HEAD is `dfa5cfae` (or this plan checkpoint once committed), ancestor check exit 0, `local-stack.config.json` present, deps installed.

- [ ] **Step 2: Clean baselines**

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
node scripts/check-visual-system-contract.mjs
node scripts/check-preview-image-fallback-contract.mjs
node scripts/check-css-ratchet.mjs
pnpm run check
test -f assets/css/catalog-image-fixes.css && test ! -f assets/css/domains/catalog.css && echo patch-present-domain-absent
wc -l assets/css/catalog-image-fixes.css
```

Expected: the four focused contracts above pass, full check exit 0, patch present / domain absent, `wc -l` = 1878. If an unrelated baseline fails, stop for plan repair.

**Known residual (not a WP-11.4 blocker):** `check-loading-skeleton-contract.mjs` is **not** in the `pnpm run check` chain and currently fails on `pages/armor-sets/[id].vue` markers that now live in `components/detail/DetailArmorSetSkeleton.vue`. This package only retargets its catalog CSS path; do not require that script's full exit 0.

- [ ] **Step 3: Capture 18-record parity baseline from candidate**

Use port `15186` unless occupied. Backend must be the live stack port (currently `18091`):

```bash
cd front-nuxt
PORT=15186 NUXT_PUBLIC_API_BASE=http://127.0.0.1:18091/api pnpm exec nuxt dev --host 127.0.0.1 --port 15186
```

Wait for HTTP 200, then:

```bash
THEME_TOKEN_PARITY_BASE=http://127.0.0.1:15186 \
THEME_TOKEN_PARITY_MODE=capture \
THEME_TOKEN_PARITY_OUT=test-results/wp11-catalog-promotion-parity \
node scripts/check-theme-token-visual-parity.mjs
```

Expected: 18 records (`dark`/`morning-paper`/`warm-slate` × `/`, `/items`, `/armor-sets` × 2 viewports) at `front-nuxt/test-results/wp11-catalog-promotion-parity/baseline.json` (gitignored). Stop only the 15186 process afterward. Do not touch 5181 / stack front 15177 / backend 18091.

- [ ] **Step 4: Create the devlog entry**

Create `docs/devlog/entries/2026-07-21-front-wp11-catalog-promotion.md`:

```markdown
# Devlog: Front P2 WP-11.4 catalog stylesheet promotion

## Status

`in_progress`

## Context

- User goal: continue Front P2; WP-11.4 promotes catalog-image-fixes into domains.
- Branch: `feat/front-p2-wp11-catalog`
- Worktree: `.claude/worktrees/front-p2-wp11-catalog`
- Base: `feat/front-p2-wp11-theme-cleanup` at `dfa5cfae` (WP-11.3 closed).
- Related docs:
  `docs/superpowers/specs/2026-07-19-front-p2-remaining-design.md` and
  `docs/superpowers/plans/2026-07-21-front-wp11-catalog-promotion.md`.
- Related prior entry:
  `docs/devlog/entries/2026-07-20-front-wp11-theme-selector-cleanup.md`.

## Direction / Decisions

- Chosen approach: byte-copy the patch into `domains/catalog.css`, load it from
  `domains/index.css`, drop the app.css import and the patch file, retarget
  contracts RED-first, prove pixel equivalence with theme-token parity.
- Rejected options: leaving a forwarding `@import` in the retired patch path
  (spec forbids), and hand-rewriting selectors during the move (ownership-only).

## Scope

- Frontend: catalog CSS ownership, import graph, contracts, ratchet, parity.
- Backend: none. Data: no writes.
- Out of scope: WP-12 onward, visual redesign, push, merge.

## Validation

- (filled at close)

## Result

- (filled at close)

## Residual Risks

- (filled at close)

## Follow-up

- WP-12 (next): breakpoint convergence per the P2 remaining design.
- Local integration: coordinator merges WP-11.2 + WP-11.3 + WP-11.4 into
  `feat/front-p2-integration` before user acceptance.

## State Changes

### 2026-07-21 (opening)

- Change: WP-11.4 plan checkpoint; baselines green at `dfa5cfae`; 18-record
  parity baseline captured on candidate port 15186 / backend 18091.
- Evidence: this plan file.

## Commits

- (filled at close)
```

- [ ] **Step 5: Commit the plan checkpoint**

```bash
git add docs/superpowers/plans/2026-07-21-front-wp11-catalog-promotion.md \
  docs/devlog/entries/2026-07-21-front-wp11-catalog-promotion.md
git commit -m "$(cat <<'EOF'
docs(front): plan wp11.4 catalog stylesheet promotion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: RED — Ownership Contract Lock

**Files:**
- Modify: `front-nuxt/scripts/check-public-pages.mjs:1090,3284`
- Modify: `front-nuxt/scripts/check-visual-system-contract.mjs:422-430,663`
- Modify: `front-nuxt/scripts/check-loading-skeleton-contract.mjs:88,102`
- Modify: `front-nuxt/scripts/check-preview-image-fallback-contract.mjs:144`
- Modify: `front-nuxt/scripts/check-css-ratchet.mjs:12-18`
- Modify: `front-nuxt/scripts/check-visual-regression.mjs:963,1229`

Do **not** create `domains/catalog.css` or delete the patch in this task. Contracts must fail RED against the pre-promotion tree.

- [ ] **Step 1: Retarget `check-public-pages.mjs`**

1a. In `scanFiles` (near line 1090), replace:

```js
  'assets/css/catalog-image-fixes.css',
```

with:

```js
  'assets/css/domains/catalog.css',
```

1b. In the path-gated block (near line 3284), replace:

```js
  if (path === 'assets/css/catalog-image-fixes.css') {
```

with:

```js
  if (path === 'assets/css/domains/catalog.css') {
```

1c. Immediately after the `violations` array is declared (after the block that defines `lightThemeSelector` / retirement sweep is fine; after `const violations = []` is required), add a retirement guard so the old patch cannot return:

```js
// WP-11.4: catalog-image-fixes.css is retired; ownership lives in domains/catalog.css.
if (existsSync(file('assets/css/catalog-image-fixes.css'))) {
  violations.push('assets/css/catalog-image-fixes.css: retired patch must be deleted after promotion into domains/catalog.css')
}
if (!existsSync(file('assets/css/domains/catalog.css'))) {
  violations.push('assets/css/domains/catalog.css: catalog domain stylesheet is required after WP-11.4 promotion')
}
```

Confirm `existsSync` is already imported from `node:fs` (it is, from WP-11.3). Confirm the `file()` helper is the same join-to-root helper used elsewhere in the script.

- [ ] **Step 2: Retarget `check-visual-system-contract.mjs`**

2a. In the `domains/index.css` block (near lines 422-430), add a required import marker:

```js
  requireIncludes(path, content, '@import "./catalog.css";', 'must load catalog domain CSS after the catalog patch promotion')
```

2b. Replace the path-gated block (near line 663):

```js
  const path = 'assets/css/catalog-image-fixes.css'
```

with:

```js
  const path = 'assets/css/domains/catalog.css'
```

- [ ] **Step 3: Retarget loading-skeleton and preview-image contracts**

In `check-loading-skeleton-contract.mjs`, replace both path strings:

```js
assertMarkers('assets/css/catalog-image-fixes.css', [
```

and

```js
assertNoMarkers('assets/css/catalog-image-fixes.css', [
```

with `assets/css/domains/catalog.css`.

In `check-preview-image-fallback-contract.mjs` (near line 144), replace the inventory entry:

```js
  'assets/css/catalog-image-fixes.css',
```

with:

```js
  'assets/css/domains/catalog.css',
```

- [ ] **Step 4: Retarget CSS ratchet**

In `check-css-ratchet.mjs`, delete the budget line entirely:

```js
  'assets/css/catalog-image-fixes.css': 1878,
```

Do not add a domains/catalog budget — domains are the destination layer and are intentionally outside the patch-layer ratchet (see the file header comment). After deletion the BUDGETS object must still be valid JS.

- [ ] **Step 5: Retarget visual-regression inventory**

5a. Near line 963, replace:

```js
  'assets/css/catalog-image-fixes.css',
```

with:

```js
  'assets/css/domains/catalog.css',
```

5b. Near line 1229, replace the app.css import marker loop so it no longer requires the retired patch name, and instead asserts the domain import. Replace:

```js
for (const marker of ['mobile-typography-fixes.css', 'catalog-image-fixes.css', 'discovery-page-fixes.css']) {
  if (!css.includes(marker)) {
    failures.push(`assets/css/app.css must import ${marker}`)
  }
}
```

with:

```js
for (const marker of ['mobile-typography-fixes.css', 'discovery-page-fixes.css']) {
  if (!css.includes(marker)) {
    failures.push(`assets/css/app.css must import ${marker}`)
  }
}
if (css.includes('catalog-image-fixes.css')) {
  failures.push('assets/css/app.css must not import the retired catalog-image-fixes.css patch')
}
const domainsIndex = readFileSync(file('assets/css/domains/index.css'), 'utf8')
if (!domainsIndex.includes('@import "./catalog.css";')) {
  failures.push('assets/css/domains/index.css must import ./catalog.css after the catalog patch promotion')
}
```

- [ ] **Step 6: Observe RED**

```bash
cd front-nuxt
node scripts/check-public-pages.mjs; echo "public-pages exit $?"
node scripts/check-visual-system-contract.mjs; echo "visual-system exit $?"
node scripts/check-preview-image-fallback-contract.mjs; echo "preview-images exit $?"
node scripts/check-css-ratchet.mjs; echo "ratchet exit $?"
# loading-skeleton: only require the retargeted catalog path to fail (script also has pre-existing armor-detail residuals)
node scripts/check-loading-skeleton-contract.mjs 2>&1 | tee /tmp/wp114-loading-red.log | tail -20
grep -F "assets/css/domains/catalog.css" /tmp/wp114-loading-red.log && echo loading-catalog-path-red-ok
```

Expected:
- `check-public-pages` FAILS: domain missing + retired patch still present (and any path-gated marker failures from the retargeted path).
- `check-visual-system` FAILS: domains/index missing `@import "./catalog.css";` and/or domain file missing for the active-control rule.
- `check-preview-image-fallback` FAILS: domain file missing.
- `check-css-ratchet` PASSES (budget entry already removed; remaining files still within budget).
- `check-loading-skeleton` output mentions `assets/css/domains/catalog.css` as missing/failing (catalog path RED). Pre-existing armor-detail marker failures may also appear — ignore those for this package.

If any of public-pages / visual-system / preview-images unexpectedly pass, stop — the RED lock is not real.

- [ ] **Step 7: Commit RED**

```bash
git add front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/scripts/check-visual-system-contract.mjs \
  front-nuxt/scripts/check-loading-skeleton-contract.mjs \
  front-nuxt/scripts/check-preview-image-fallback-contract.mjs \
  front-nuxt/scripts/check-css-ratchet.mjs \
  front-nuxt/scripts/check-visual-regression.mjs
git commit -m "$(cat <<'EOF'
test(front): lock catalog domain ownership after patch retirement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify: `git diff HEAD~1 --stat -- front-nuxt/assets/css` is empty.

---

### Task 2: GREEN — Promote File, Wire Imports, Delete Patch

**Files:**
- Create: `front-nuxt/assets/css/domains/catalog.css` (exact copy of the patch)
- Modify: `front-nuxt/assets/css/domains/index.css`
- Modify: `front-nuxt/assets/css/app.css`
- Delete: `front-nuxt/assets/css/catalog-image-fixes.css`

- [ ] **Step 1: Create the domain file as a byte-identical copy**

```bash
cd front-nuxt
cp assets/css/catalog-image-fixes.css assets/css/domains/catalog.css
cmp assets/css/catalog-image-fixes.css assets/css/domains/catalog.css && echo byte-identical
```

Expected: `byte-identical`. Do not reformat, reorder, or edit selectors.

- [ ] **Step 2: Wire `domains/index.css`**

Replace the import list so catalog loads after the existing page-family imports (order among crafting/biome/public-layout is preserved; catalog is appended):

```css
/*
  Domain CSS imports live here after P0.

  Import order inside this file should remain page-family scoped, for example:
  @import "./detail.css";
  @import "./catalog.css";
  @import "./entity.css";
  @import "./nav.css";

  Do not add business selectors to hifi-preview.css during new domain work.
*/
@import "./crafting.css";
@import "./biome.css";
@import "./public-layout.css";
@import "./catalog.css";
```

- [ ] **Step 3: Drop the patch import from `app.css`**

Remove the line:

```css
@import "./catalog-image-fixes.css";
```

Leave loading-skeleton / hifi / mobile-typography / discovery / light-contrast imports and the cascade-contract comment intact. After the edit, `app.css` must not contain the string `catalog-image-fixes`.

- [ ] **Step 4: Delete the retired patch**

```bash
rm assets/css/catalog-image-fixes.css
test ! -f assets/css/catalog-image-fixes.css && echo patch-gone
```

- [ ] **Step 5: Observe GREEN**

```bash
cd front-nuxt
node scripts/check-public-pages.mjs
node scripts/check-visual-system-contract.mjs
node scripts/check-preview-image-fallback-contract.mjs
node scripts/check-css-ratchet.mjs
pnpm run check
git diff --check
# loading-skeleton catalog path only: must NOT report domains/catalog.css missing after promotion
node scripts/check-loading-skeleton-contract.mjs 2>&1 | tee /tmp/wp114-loading-green.log | tail -20
! grep -F "assets/css/domains/catalog.css" /tmp/wp114-loading-green.log && echo loading-catalog-path-green-ok
```

Expected: public-pages / visual-system / preview-images / ratchet / full check all exit 0; `git diff --check` clean; loading-skeleton no longer mentions the catalog domain path as missing (pre-existing armor-detail residuals may still fail — not a WP-11.4 gate). Known baseline warnings only (module.register deprecation, duplicate formatEffectValue).

- [ ] **Step 6: Commit GREEN**

```bash
git add front-nuxt/assets/css/domains/catalog.css \
  front-nuxt/assets/css/domains/index.css \
  front-nuxt/assets/css/app.css \
  front-nuxt/assets/css/catalog-image-fixes.css
git commit -m "$(cat <<'EOF'
feat(front): promote catalog-image-fixes into domains/catalog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

`git show --stat HEAD` must list the new domain file, domains/index.css, app.css, and the deleted patch (and nothing else).

---

### Task 3: Runtime Pixel-Equivalence Evidence

**Files:** none modified (evidence only under gitignored `test-results/`)

- [ ] **Step 1: Restart candidate on the promoted tree**

```bash
cd front-nuxt
PORT=15186 NUXT_PUBLIC_API_BASE=http://127.0.0.1:18091/api pnpm exec nuxt dev --host 127.0.0.1 --port 15186
```

Backend base MUST match the Task 0 capture environment (`18091` this boot). Wait for HTTP 200.

- [ ] **Step 2: Compare theme-token parity**

```bash
THEME_TOKEN_PARITY_BASE=http://127.0.0.1:15186 \
THEME_TOKEN_PARITY_MODE=compare \
THEME_TOKEN_PARITY_OUT=test-results/wp11-catalog-promotion-parity \
node scripts/check-theme-token-visual-parity.mjs
```

Expected: `Theme token visual parity compare passed: 18 records`. Any mismatch is a real cascade regression — capture console diff and stop (do not weaken the gate). Known quirk: on mismatch the script exits before writing `candidate.json`.

- [ ] **Step 3: Smoke the seven catalog list pages**

```bash
for path in /items /armor-sets /biomes /bosses /npcs /buffs /projectiles; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:15186${path}")
  echo "$path $code"
done
```

Expected: all `200`. This is an HTTP smoke, not a full visual matrix; the 18-record parity already covers `/items` and `/armor-sets` across three themes × two viewports.

- [ ] **Step 4: Stop only the 15186 candidate**

Confirm 15186 is free and stack services (18091 / 15177 / 19100) remain up. `git status --short` stays clean (only gitignored artifacts under `test-results/`).

---

### Task 4: Closeout

**Files:**
- Modify: `docs/devlog/entries/2026-07-21-front-wp11-catalog-promotion.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Close the devlog entry**

Set Status to `` `closed` ``. Fill Validation with: baseline gates, RED observations, GREEN focused + full check, 18/18 parity, seven-route smoke. Fill Result (patch deleted, domain owns catalog CSS, contracts retargeted, ratchet entry removed). Fill Residual Risks (parity candidate.json-on-mismatch quirk; cascade now loads catalog after tokens/primitives by design; seven-page smoke is HTTP-level, full visual matrix deferred to integration). List commits including this closeout as "this commit".

- [ ] **Step 2: Update `docs/devlog/current.md`**

Active Focus: WP-11.4 closed; next is WP-12 breakpoint convergence from the WP-11.4 head.

Next Agent Should Start Here: point at WP-12 per the remaining-design spec; note catalog CSS now lives at `assets/css/domains/catalog.css` and the patch path is forbidden by contract.

Recently Closed: add the WP-11.4 entry at the top with branch `feat/front-p2-wp11-catalog` and the commit SHAs.

Update `Last updated`.

- [ ] **Step 3: Final gate and commit**

```bash
cd front-nuxt && pnpm run check && cd ..
git diff --check
git add docs/devlog/entries/2026-07-21-front-wp11-catalog-promotion.md docs/devlog/current.md
git commit -m "$(cat <<'EOF'
docs(devlog): close wp11.4 catalog stylesheet promotion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
git status --short --branch
git log --oneline dfa5cfae..HEAD
```

Expected: full gate green, clean tree, four commits above `dfa5cfae` (plan, RED, GREEN, docs-close). Report final SHAs. Do not push, merge, or clean up the worktree.

---

## Self-Review (plan author)

1. **Spec coverage:** promote complete contents ✔; preserve selector order (byte copy) ✔; update app.css / contracts / visual-regression / loading / image-fallback / ratchet ✔; remove retired patch without forwarding import ✔; seven list pages pixel-equivalent (parity + smoke) ✔.
2. **Placeholder scan:** no TBD/TODO; every step has concrete commands and expected output.
3. **Cascade note:** domains load after tokens/primitives by design; light-contrast/discovery have zero catalog selectors so no override inversion; hifi still precedes catalog.
4. **Type/path consistency:** all retargets use `assets/css/domains/catalog.css`; retirement guards forbid the old path in public-pages and visual-regression.
