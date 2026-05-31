# Armor Set Detail Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public armor set detail page use build cards as the primary structured stat display and remove repeated prose/effect output.

**Architecture:** Keep the existing single-page implementation in `front-nuxt/pages/armor-sets/[id].vue`. Add a source-aware stat-line formatter so structured API effects are shown once per build card, while fallback benefit prose is only shown when structured effects are missing. Extend the existing contract script so future edits cannot reintroduce repeated benefit chips or duplicate stat lines.

**Tech Stack:** Nuxt 3, Vue SFC, TypeScript, Node contract scripts.

---

## File Map

- Modify `front-nuxt/scripts/check-armor-stat-visuals.mjs`: add contract markers for build-card-first rendering, structured-effect detection, and fallback-only benefit display.
- Modify `front-nuxt/pages/armor-sets/[id].vue`: introduce deduped build stat line helpers, structured-effect availability checks, and fallback-only source context rendering.

## Task 1: Add Contract Coverage

**Files:**

- Modify: `front-nuxt/scripts/check-armor-stat-visuals.mjs`

- [ ] **Step 1: Add failing contract markers**

Update `requiredMarkers` in `front-nuxt/scripts/check-armor-stat-visuals.mjs` to include these exact strings:

```js
  'hasStructuredArmorEffects',
  'dedupeEffectLines',
  'armorFallbackBenefitLines',
  'armor-structured-build-board',
```

Update `forbiddenMarkers` to include:

```js
  'class="armor-benefit"',
  'armorBenefitLines.length',
```

The full relevant arrays should include the existing markers plus the new entries:

```js
const requiredMarkers = [
  'armor-build-board',
  'armor-build-card',
  'armor-build-piece-strip',
  'armorSetBuildCards',
  'armorBuildCardStats',
  'effectBelongsToItem',
  'uniqueArmorItems',
  'hasStructuredArmorEffects',
  'dedupeEffectLines',
  'armorFallbackBenefitLines',
  'armor-structured-build-board',
]

const forbiddenMarkers = [
  'armor-stat-source-images',
  'armorStatPreviewItems',
  'statVisualMeta(effect).icon',
  'sprite-icon compact',
  'armor-variant-sprite',
  'armor-variant-card',
  'armor-summary-lines',
  'armor-equipment-board',
  'class="armor-benefit"',
  'armorBenefitLines.length',
]
```

- [ ] **Step 2: Run contract and verify it fails**

Run:

```bash
cd front-nuxt
node scripts/check-armor-stat-visuals.mjs
```

Expected: FAIL because `hasStructuredArmorEffects`, `dedupeEffectLines`, `armorFallbackBenefitLines`, and `armor-structured-build-board` are not present yet, and the page still contains `class="armor-benefit"` plus `armorBenefitLines.length`.

## Task 2: Implement Build-Card-First Dedup

**Files:**

- Modify: `front-nuxt/pages/armor-sets/[id].vue`

- [ ] **Step 1: Add structured-effect and dedup helpers**

In `front-nuxt/pages/armor-sets/[id].vue`, replace the existing `armorShownEffects`, `mergeEffectLines`, `armorSetEffectLines`, and `armorBuildCardStats` blocks with helpers that:

```ts
const hasStructuredArmorEffects = computed(() => Boolean(armorDetail.value?.effects?.length))
const armorShownEffects = computed(() => {
  if (hasStructuredArmorEffects.value) return (armorDetail.value?.effects ?? []).slice(0, 40)
  return armorBenefitFallbackEffects.value
})

const normalizeEffectLine = (line: string) => line
  .toLowerCase()
  .replace(/[+\s:：，、；;（）()[\]·・.'"]/g, '')
  .replace(/−/g, '-')

const dedupeEffectLines = (lines: string[]) => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of lines.map((entry) => String(entry ?? '').trim()).filter(Boolean)) {
    const key = normalizeEffectLine(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(line)
  }

  return result
}

const mergeEffectLines = (effects: EquipmentEffectAttribute[]) => dedupeEffectLines(
  effects.map(effectSummaryLine),
)

const armorFallbackBenefitLines = computed(() => {
  if (hasStructuredArmorEffects.value) return []
  const effectLines = new Set(mergeEffectLines(armorBenefitFallbackEffects.value).map(normalizeEffectLine))
  return armorBenefitLines.value.filter((line) => !effectLines.has(normalizeEffectLine(line)))
})
```

Then update `armorBuildCardStats` so it uses `dedupeEffectLines([...mergeEffectLines(itemEffects), ...mergeEffectLines(setEffects)])` and keeps the existing fallback text `['暂无独立属性']`.

- [ ] **Step 2: Replace repeated benefit-chip rendering**

In the template, replace:

```vue
<div v-if="armorBenefitLines.length" class="armor-benefit">
  <span v-for="line in armorBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
</div>
```

with:

```vue
<div v-if="armorFallbackBenefitLines.length" class="armor-source-context">
  <span v-for="line in armorFallbackBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
</div>
```

Add `armor-structured-build-board` to the existing build board class:

```vue
<div class="armor-build-board armor-structured-build-board">
```

- [ ] **Step 3: Rename benefit styles**

Rename the existing scoped CSS selectors:

```css
.armor-benefit { ... }
.armor-benefit span { ... }
```

to:

```css
.armor-source-context { ... }
.armor-source-context span { ... }
```

Keep the declarations unchanged.

- [ ] **Step 4: Run focused checks**

Run:

```bash
cd front-nuxt
node scripts/check-armor-stat-visuals.mjs
node scripts/check-detail-layout-contract.mjs
pnpm run check:armor-stat-visuals
```

Expected: all commands pass.

## Task 3: Full Front Verification And Local Smoke

**Files:**

- No production file edits unless a previous step fails.

- [ ] **Step 1: Run Nuxt front check**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected: exit 0.

- [ ] **Step 2: Restart local stack from this worktree**

Run from repo root:

```bash
bash ./scripts/dev/start-local-stack.sh
```

Expected: backend, front, admin, Redis, and MinIO ports report `true`.

- [ ] **Step 3: Run local smoke**

Run:

```bash
bash ./scripts/dev/smoke-local-stack.sh
```

Expected: `failed=0`.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git status --short
git diff --cached --stat
git add -- front-nuxt/scripts/check-armor-stat-visuals.mjs front-nuxt/pages/armor-sets/[id].vue docs/superpowers/plans/2026-05-31-armor-set-detail-dedup.md
git diff --cached --stat
git commit -m "fix: dedupe armor set detail stats"
```

Expected: commit succeeds with only the two front-end files and this plan staged.
