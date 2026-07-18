# Front WP-11.1 Theme Token Alias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `--tp-*` the source of truth for six legacy theme variables while preserving dark, light, morning-paper, and warm-slate visuals exactly.

**Architecture:** `assets/css/tokens.css` owns the raw semantic values using selectors with the same specificity as the legacy theme rules. `assets/css/hifi-preview.css` keeps only compatibility aliases for existing consumers. `check-visual-system-contract.mjs` locks selector specificity, raw-value ownership, and alias direction.

**Tech Stack:** Nuxt 3, CSS custom properties, Node.js contract scripts, pnpm, audit screenshot harness.

---

### Task 0: Prepare the isolated frontend baseline

**Files:**
- Modify: none
- Test: `front-nuxt/package.json`

- [ ] **Step 1: Install the locked frontend dependencies in this worktree**

Run:

```bash
cd front-nuxt && pnpm install --frozen-lockfile
```

Expected: `front-nuxt/node_modules` exists; no tracked manifest or lockfile file changes.

- [ ] **Step 2: Run the existing visual-system contract baseline**

Run: `cd front-nuxt && node scripts/check-visual-system-contract.mjs`

Expected: PASS before adding the new ownership assertions.

### Task 1: Lock the semantic ownership contract (TDD)

**Files:**
- Modify: `front-nuxt/scripts/check-visual-system-contract.mjs:88-107`

- [ ] **Step 1: Add the failing ownership assertions**

After the existing `assets/css/tokens.css` marker loop, add this exact contract:

```js
for (const marker of [
  '--tp-color-border: rgba(217, 185, 91, 0.18);',
  '--tp-color-border-strong: rgba(217, 185, 91, 0.26);',
  '--tp-color-surface-soft: rgba(244,234,208,0.025);',
  '--tp-color-surface-raised: rgba(244,234,208,0.035);',
  '--tp-shadow-control: inset 0 1px 0 rgba(244, 234, 208, 0.035);',
  '[data-theme="light"],\n[data-theme="morning-paper"] {\n  --tp-color-surface-soft: rgba(255, 250, 241, 0.72);',
  '[data-theme="warm-slate"] {\n  --tp-color-surface-soft: rgba(255, 255, 255, 0.72);',
]) {
  requireIncludes(path, content, marker, `missing theme token source ${marker}`)
}
```

Inside the existing `assets/css/hifi-preview.css` block, add this exact compatibility contract:

```js
for (const marker of [
  '--index-line: var(--tp-color-border);',
  '--index-line-strong: var(--tp-color-border-strong);',
  '--index-surface: var(--tp-color-surface-soft);',
  '--index-surface-strong: var(--tp-color-surface-raised);',
  '--accent-gold: var(--tp-color-accent);',
  '--button-control-shadow: var(--tp-shadow-control);',
]) {
  requireIncludes(path, content, marker, `missing legacy compatibility alias ${marker}`)
}

for (const rawLegacyDefinition of [
  /--index-line(?:-strong)?:\s*rgba\(/,
  /--index-surface(?:-strong)?:\s*rgba\(/,
  /--button-control-shadow:\s*inset\s+0\s+1px\s+0\s+rgba\(/,
]) {
  if (rawLegacyDefinition.test(content)) {
    violations.push(`${path}: legacy theme values must be sourced from --tp-* tokens (${rawLegacyDefinition})`)
  }
}
```

- [ ] **Step 2: Verify RED**

Run: `cd front-nuxt && node scripts/check-visual-system-contract.mjs`

Expected: FAIL because `tokens.css` has no per-theme semantic source values and `hifi-preview.css` still owns raw legacy values.

- [ ] **Step 3: Commit the red contract only**

```bash
git add front-nuxt/scripts/check-visual-system-contract.mjs
git commit -m "test(front): lock theme token ownership"
```

Expected: one intentional RED commit; do not change production CSS in this task.

### Task 2: Move the six values into the token source of truth

**Files:**
- Modify: `front-nuxt/assets/css/tokens.css:1-24`
- Modify: `front-nuxt/assets/css/hifi-preview.css:21-76, 128-165, 194-231, 295-332`

- [ ] **Step 1: Add dark semantic values and compatibility aliases in `tokens.css`**

Replace the six root semantic definitions with these values and aliases:

```css
:root {
  --tp-color-surface-soft: rgba(244,234,208,0.025);
  --tp-color-surface-raised: rgba(244,234,208,0.035);
  --tp-color-border: rgba(217, 185, 91, 0.18);
  --tp-color-border-strong: rgba(217, 185, 91, 0.26);
  --tp-color-accent: var(--gold);
  --tp-shadow-control: inset 0 1px 0 rgba(244, 234, 208, 0.035);
  --index-surface: var(--tp-color-surface-soft);
  --index-surface-strong: var(--tp-color-surface-raised);
  --index-line: var(--tp-color-border);
  --index-line-strong: var(--tp-color-border-strong);
  --accent-gold: var(--tp-color-accent);
  --button-control-shadow: var(--tp-shadow-control);
}
```

- [ ] **Step 2: Add light/morning-paper and warm-slate semantic overrides in `tokens.css`**

Append these blocks before the mobile media query so later equal-specificity selectors override the legacy aliases:

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

- [ ] **Step 3: Replace raw legacy definitions in `hifi-preview.css` with aliases**

In every root/theme block that defines one of the six variables, keep the property name but replace its value with the matching semantic alias. For example:

```css
--index-line: var(--tp-color-border);
--index-line-strong: var(--tp-color-border-strong);
--index-surface: var(--tp-color-surface-soft);
--index-surface-strong: var(--tp-color-surface-raised);
--button-control-shadow: var(--tp-shadow-control);
```

Keep `--accent-gold: var(--tp-color-accent);` in the root block. Do not alter `--gold`, control active shadows, layouts, selectors, or any consumer declaration.

- [ ] **Step 4: Verify GREEN**

Run: `cd front-nuxt && node scripts/check-visual-system-contract.mjs`

Expected: PASS with the semantic values in `tokens.css` and all six legacy aliases in `hifi-preview.css`.

- [ ] **Step 5: Run the complete frontend gate**

Run: `cd front-nuxt && pnpm run check`

Expected: exit 0; any baseline Chromium/DBus/Node warnings are recorded separately from contract failures.

### Task 3: Preview-only visual acceptance and closeout

**Files:**
- Create: `reports/audit/wp11-token-alias-<run-id>/`
- Modify: `docs/devlog/entries/2026-07-19-front-wp11-token-alias.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Capture dark and morning-paper comparison screenshots**

Run the tracked screenshot harness against the compatible local stack with `AUDIT_BASE` and `AUDIT_OUT` set to this worktree's allocated frontend origin and report directory. Capture the planned representative public routes in both themes.

Expected: no unexpected visual difference; record any environment failure as a blocked runtime validation, not a code pass.

- [ ] **Step 2: Record preview-only status and validation evidence**

Update the P2 devlog entry with the focused contract, full check, screenshot result, and the unresolved data-audit baseline. Keep the task `active` until all selected validation is available; do not claim release readiness.

- [ ] **Step 3: Commit the CSS migration and closeout documentation**

```bash
git add front-nuxt/assets/css/tokens.css front-nuxt/assets/css/hifi-preview.css docs/devlog/entries/2026-07-19-front-wp11-token-alias.md docs/devlog/current.md
git commit -m "refactor(front): centralize theme token aliases"
```

Expected: local-only branch remains unmerged; its devlog entry is closed only after the validation evidence is recorded.
