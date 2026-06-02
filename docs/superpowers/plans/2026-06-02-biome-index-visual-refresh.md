# Biome Index Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the public biome index so the first viewport clearly shows recognizable biome environments, never distorts source images, and removes duplicate category/featured/list presentation.

**Architecture:** Keep `usePublicBiomes()` and `biomeDisplayItems` as the single filtered data source. Change only presentation-level computed values and CSS: a full-width hero carousel for large environment viewing, display-layer dedupe for featured/list items, compact list cards, and static checks that reject non-proportional image transforms.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, `CommonPreviewImage`, existing `front-nuxt/assets/css/hifi-preview.css`, existing Node contract scripts.

---

## Scope And Success Criteria

**In scope**

- Public biome index page: `front-nuxt/pages/biomes/index.vue`.
- Biome index and shared biome image styling in `front-nuxt/assets/css/hifi-preview.css`.
- Preview-image and public-page contract scripts:
  - `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`
  - `front-nuxt/scripts/check-public-pages.mjs`
- Browser screenshot validation for `/biomes` desktop and mobile.

**Out of scope**

- Data crawling, API schema changes, or changing `usePublicBiomes()` normalization semantics.
- Replacing source images.
- Committing or merging before visual approval.

**Success criteria**

- Desktop first viewport uses a true large carousel, not a right-side small strip or 2x3 wall.
- A desktop screenshot at `1860x900` can identify the active biome environment at a glance.
- No biome environment image uses `scaleX(...)`, `scaleY(...)`, `matrix(...)`, `object-fit: fill`, or non-proportional width/height hacks.
- Cropping is allowed only through `overflow: hidden`, `object-fit: cover`, `object-position`, and optional proportional `scale(...)`.
- Search/filter result count continues to use `biomeDisplayItems.length`.
- Search or group filtering never hides matching biome rows.
- Default page view does not repeat the same three featured biomes in the main list.
- The bottom taxonomy/category band does not duplicate the group filter chips.

## File Map

- Modify `front-nuxt/pages/biomes/index.vue`
  - Add display-only computed values for hero slides, featured visibility, featured ids, and list items.
  - Convert the hero carousel to a full-width background layer with foreground copy.
  - Hide/remove duplicated taxonomy band and prevent featured/list duplication.

- Modify `front-nuxt/assets/css/hifi-preview.css`
  - Replace compact right-column carousel rules with full-width immersive carousel rules.
  - Replace any biome image `scaleX` rules with proportional `cover + scale(...)` or `cover + object-position`.
  - Compact `biome-feature-grid` and `biome-list-grid` cards.
  - Preserve responsive behavior.

- Modify `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`
  - Add assertions that biome image CSS does not contain non-proportional transforms or `object-fit: fill`.

- Modify `front-nuxt/scripts/check-public-pages.mjs`
  - Update required markers for the final carousel, list items, and duplicate-category removal.

## Multi-Agent Review Inputs

Three read-only reviews informed this plan:

- Hero review: the current right-side carousel is too small and over-cropped; desktop should use a full-width hero carousel with copy overlay and large recognizable environment art.
- Image safety review: current card image CSS includes `scaleX(1.18)`, which is a deformation risk. Biome environment images must use `object-fit: cover` plus proportional cropping only.
- List/dedupe review: `biomeFeaturedItems`, `biome-list-grid`, and `biome-taxonomy-band` duplicate the same underlying `biomeDisplayItems`. Dedupe must happen only at display level, not in search/filter data.

## Task 1: Lock Display-State Computed Values

**Files:**

- Modify: `front-nuxt/pages/biomes/index.vue`

- [ ] **Step 1: Add display state computed values**

Add these computed values after `biomeFeaturedItems`:

```ts
const biomeIsDefaultBrowse = computed(() => (
  !biomeSearchQuery.value.trim()
  && selectedBiomeGroup.value === biomeAllGroupLabel
))

const biomeHeroSlides = computed(() => {
  const sourceItems = biomeDisplayItems.value.length ? biomeDisplayItems.value : biomeItems.value
  const seen = new Set<string | number>()
  const slides: typeof sourceItems = []

  for (const biome of sourceItems) {
    if (seen.has(biome.id)) continue
    seen.add(biome.id)
    slides.push(biome)
    if (slides.length === 6) break
  }

  return slides
})

const biomeShowFeatured = computed(() => biomeIsDefaultBrowse.value && biomeFeaturedItems.value.length > 0)

const biomeFeaturedIds = computed(() => new Set(
  biomeShowFeatured.value ? biomeFeaturedItems.value.map((biome) => biome.id) : [],
))

const biomeListItems = computed(() => {
  if (!biomeIsDefaultBrowse.value) return biomeDisplayItems.value
  return biomeDisplayItems.value.filter((biome) => !biomeFeaturedIds.value.has(biome.id))
})
```

Keep `biomeDisplayItems` unchanged. It remains the source of truth for search/filter results and counts.

- [ ] **Step 2: Update list rendering**

Change the main list loop from:

```vue
v-for="biome in biomeDisplayItems"
```

to:

```vue
v-for="biome in biomeListItems"
```

Do not change the stats display:

```vue
<div><b>{{ biomeDisplayItems.length }}</b><span>当前结果</span></div>
```

- [ ] **Step 3: Gate the featured grid**

Change the loaded featured section from:

```vue
<section class="biome-feature-grid" aria-label="重点群系">
```

to:

```vue
<section v-if="biomeShowFeatured" class="biome-feature-grid" aria-label="重点群系">
```

Search and group-filter views must not render the featured grid.

- [ ] **Step 4: Remove duplicate taxonomy rendering**

Remove this section from the template:

```vue
<section v-if="visibleBiomeGroups.length" class="taxonomy-band biome-taxonomy-band" aria-label="群系分组">
  <article v-for="group in visibleBiomeGroups" :key="group.label" class="support-panel">
    <span class="eyebrow">生态分组</span>
    <h2>{{ group.label }}</h2>
    <p>{{ group.items.length }} 个群系 · {{ group.items.reduce((total, item) => total + item.resourceCount, 0) }} 项资源。</p>
    <div class="biome-group-samples">
      <a
        v-for="biome in group.items.slice(0, 3)"
        :key="`group-${group.label}-${biome.id}`"
        :href="biome.detailPath"
      >
        {{ biome.displayName }}
      </a>
    </div>
  </article>
</section>
```

Also remove `visibleBiomeGroups` if it becomes unused. Keep `biomeGroups` if it is still needed by future checks or grouping logic; otherwise remove it only if all checks are updated.

- [ ] **Step 5: Run a focused syntax check**

Run:

```bash
cd front-nuxt
pnpm exec vue-tsc --noEmit --pretty false
```

Expected: typecheck passes, or any failure is unrelated and documented with exact file path.

## Task 2: Rebuild Hero As Full-Width Carousel

**Files:**

- Modify: `front-nuxt/pages/biomes/index.vue`
- Modify: `front-nuxt/assets/css/hifi-preview.css`

- [ ] **Step 1: Update carousel image intent in the template**

In the hero carousel `CommonPreviewImage`, use larger intrinsic dimensions and eager loading for the first-viewport carousel:

```vue
<CommonPreviewImage
  class="biome-environment-slide-image"
  :src="biome.image"
  :alt="biome.displayName"
  :fallback="biome.fallback"
  fallback-icon="icon-biome"
  :source-image="biome.sourceImage"
  :auto-center-visible="false"
  width="1600"
  height="900"
  loading="eager"
/>
```

Remove permanent `featured` opacity behavior from real slides. Do not keep a rule that makes index `0` always visible while other slides animate.

- [ ] **Step 2: Make the carousel the hero background layer**

Replace the desktop hero/carousel CSS with this structure:

```css
.biome-environment-hero {
  position: relative;
  min-height: clamp(520px, 68dvh, 760px);
  overflow: hidden;
  border-bottom: 1px solid var(--index-line);
  background: #07110b;
}

.biome-environment-hero-inner {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-columns: minmax(0, 560px);
  min-height: inherit;
  align-items: center;
  max-width: 1440px;
  padding: 54px 42px;
}

.biome-environment-carousel {
  position: absolute;
  inset: 0;
  display: block;
  min-width: 0;
  min-height: 100%;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #07110b;
}
```

- [ ] **Step 3: Make the copy an overlay, not a card**

Use a readable overlay without turning the hero into a floating card:

```css
.biome-environment-hero-copy {
  position: relative;
  z-index: 4;
  display: grid;
  justify-items: start;
  gap: 14px;
  max-width: 560px;
}

.biome-environment-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(3, 7, 4, 0.86), rgba(3, 7, 4, 0.48) 36%, rgba(3, 7, 4, 0.1) 68%),
    linear-gradient(180deg, rgba(3, 7, 4, 0.24), rgba(3, 7, 4, 0.4));
}
```

Do not use a full opaque card behind the hero text.

- [ ] **Step 4: Use proportional image cropping only**

Use these carousel image rules:

```css
.biome-environment-slide {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  overflow: hidden;
  opacity: 0;
  color: var(--paper);
  text-decoration: none;
  pointer-events: none;
  animation: biome-carousel-fade 24s ease-in-out infinite;
  animation-delay: calc(var(--biome-slide-order, 0) * 4s);
}

.biome-environment-slide-image,
.biome-environment-slide-image.item-art.tp-preview-image {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  aspect-ratio: auto;
  contain: none;
  clip-path: inset(0);
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.biome-environment-carousel .item-art.tp-preview-image.biome-environment-slide-image img {
  display: block;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: cover;
  object-position: center 46%;
  image-rendering: pixelated;
  transform: none !important;
}
```

If wiki edge artifacts still show in screenshots, use only proportional scaling:

```css
transform: scale(1.04) !important;
```

Never use `scaleX`, `scaleY`, `matrix`, `object-fit: fill`, or `width: 130%; height: 100%` for biome environment images.

- [ ] **Step 5: Set responsive hero sizes**

Add or update breakpoints:

```css
@media (max-width: 1180px) {
  .biome-environment-hero {
    min-height: clamp(440px, 56dvh, 620px);
  }

  .biome-environment-hero-inner {
    padding: 42px 28px;
  }
}

@media (max-width: 720px) {
  .biome-environment-hero {
    min-height: 420px;
  }

  .biome-environment-hero-inner {
    padding: 32px 18px;
  }

  .biome-environment-hero-copy h1 {
    font-size: 38px;
  }
}
```

This keeps the desktop hero large enough to identify the biome while still allowing the next section to appear below the fold on tall screens.

## Task 3: Remove Image Deformation From Cards

**Files:**

- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`

- [ ] **Step 1: Replace stretched card image rules**

Find all biome tile image rules that contain:

```css
scaleX(1.18)
```

Replace them with proportional rules:

```css
.biome-tile-art .item-art.tp-preview-image.biome-tile-backdrop img,
.biome-tile-art .item-art.tp-preview-image.biome-tile-thumb img,
.biome-tile-art .biome-tile-backdrop img,
.biome-tile-art .biome-tile-thumb img {
  display: block;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  min-width: 0;
  min-height: 0;
  object-fit: cover;
  object-position: center;
  image-rendering: pixelated;
  transform: scale(var(--biome-edge-crop-scale, 1.04)) !important;
}
```

- [ ] **Step 2: Add contract checks for forbidden transforms**

In `front-nuxt/scripts/check-preview-image-fallback-contract.mjs`, after reading `assets/css/hifi-preview.css`, add checks equivalent to:

```js
const hifiPreviewCss = read('assets/css/hifi-preview.css')
const forbiddenBiomeImagePatterns = [
  /\\.biome-[\\s\\S]*?scaleX\\(/,
  /\\.biome-[\\s\\S]*?scaleY\\(/,
  /\\.biome-[\\s\\S]*?object-fit:\\s*fill/,
]

for (const pattern of forbiddenBiomeImagePatterns) {
  if (pattern.test(hifiPreviewCss)) {
    failures.push(`assets/css/hifi-preview.css: biome environment images must not use non-proportional scaling or object-fit: fill`)
  }
}
```

Make the final implementation precise enough that it does not flag the JavaScript `scaleX` variable inside `PreviewImage.vue`.

- [ ] **Step 3: Verify forbidden patterns are gone**

Run:

```bash
rg -n "scaleX\\(|scaleY\\(|object-fit:\\s*fill|matrix\\(" front-nuxt/assets/css/hifi-preview.css
```

Expected: no biome image CSS uses these patterns. If unrelated CSS uses them, document the selector and confirm it is not a biome image selector.

## Task 4: Compact And Dedupe Biome Cards

**Files:**

- Modify: `front-nuxt/pages/biomes/index.vue`
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Keep filter chips, remove duplicate taxonomy band**

The search command section keeps `biome-filter-strip`. The bottom `biome-taxonomy-band` is removed because it repeats the same group taxonomy and sample links.

Update public-page checks by removing required markers that only exist in the removed taxonomy band:

```js
'visibleBiomeGroups'
'v-for="group in visibleBiomeGroups"'
```

Keep markers for:

```js
'biomeGroupOptions'
'v-for="group in biomeGroupOptions"'
'biome-filter-strip'
```

- [ ] **Step 2: Use `biomeListItems` for main cards**

Update public-page checks to require:

```js
'biomeListItems'
'v-for="biome in biomeListItems"'
```

This confirms dedupe is display-level and does not mutate `biomeDisplayItems`.

- [ ] **Step 3: Compact desktop list cards**

Update list CSS:

```css
.biome-list-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.biome-list-grid .biome-tile {
  gap: 9px;
  padding: 10px 12px;
}

.biome-list-grid .biome-tile-title {
  font-size: 16px;
  line-height: 1.2;
}

.biome-list-grid .biome-tile-description {
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

.biome-list-grid .biome-chip {
  min-height: 24px;
  padding: 4px 7px;
  font-size: 11px;
}

.biome-list-grid .biome-tile-meta {
  padding: 6px 8px;
  font-size: 11px;
}
```

- [ ] **Step 4: Keep tablet and mobile readable**

Update responsive rules:

```css
@media (max-width: 1180px) {
  .biome-list-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .biome-list-grid {
    grid-template-columns: 1fr;
  }

  .biome-list-grid .biome-tile {
    padding: 10px;
  }

  .biome-list-grid .biome-tile-art {
    max-height: 96px;
  }
}
```

Do not compress mobile below readable/tappable sizes.

## Task 5: Runtime Screenshot Validation

**Files:**

- No source files unless screenshot reveals defects.

- [ ] **Step 1: Ensure the local page is running**

Run:

```bash
curl -I --max-time 5 http://localhost:3002/biomes
```

Expected: `HTTP/1.1 200 OK`.

If not running, start the front server in this worktree:

```bash
cd front-nuxt
pnpm dev --host 0.0.0.0 --port 3002
```

- [ ] **Step 2: Capture desktop first viewport**

Run:

```bash
mkdir -p front-nuxt/reports/front-nuxt/biome-preview
/snap/bin/chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=8000 \
  --window-size=1860,900 \
  --screenshot=front-nuxt/reports/front-nuxt/biome-preview/biomes-hero-desktop.png \
  http://localhost:3002/biomes
```

Expected visual result:

- The first viewport shows a large environment carousel, not a small strip.
- The active biome is recognizable without zooming.
- Image is not stretched horizontally or vertically.
- No wiki edge bars dominate the image.
- Hero does not hide the entire rest of the page on tall desktop screens.

- [ ] **Step 3: Capture mobile first viewport**

Run:

```bash
/snap/bin/chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=8000 \
  --window-size=495,900 \
  --screenshot=front-nuxt/reports/front-nuxt/biome-preview/biomes-hero-mobile.png \
  http://localhost:3002/biomes
```

Expected visual result:

- No horizontal page scroll.
- Hero image remains proportional.
- Text does not overlap dots or image label.
- Search section is reachable immediately after the hero.

- [ ] **Step 4: Capture list density**

Use a browser or scroll screenshot to inspect the main card list.

Expected visual result:

- Desktop main list is 4 columns.
- Cards are smaller than the previous 3-column version.
- Default view does not repeat featured items in the main list.
- Search/filter view shows all matching items in the list.

- [ ] **Step 5: Clean screenshots**

Run:

```bash
rm -rf front-nuxt/reports/front-nuxt/biome-preview
find front-nuxt/reports -maxdepth 4 -type f -print
```

Expected: no temporary biome preview screenshots remain for commit.

## Task 6: Static Validation

**Files:**

- No source files unless validation fails due to this task.

- [ ] **Step 1: Run preview-image contract**

Run:

```bash
cd front-nuxt
pnpm run check:preview-images
```

Expected: `Preview image fallback contract passed.`

- [ ] **Step 2: Run visual-system contract**

Run:

```bash
cd front-nuxt
pnpm run check:visual-system
```

Expected: `Visual system contract checks passed.`

- [ ] **Step 3: Run public page contract**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
```

Expected for this branch: any failure must be inspected. If the only failure remains the pre-existing `components/crafting/CraftingTargetBar.vue: missing public data layer marker searchUnavailable`, document it as unrelated. Any new biome page failure must be fixed before handoff.

- [ ] **Step 4: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

## Final Review Checklist

- [ ] `front-nuxt/pages/biomes/index.vue` does not mutate search/filter source data to dedupe display.
- [ ] `biomeDisplayItems.length` remains the result count.
- [ ] `biomeListItems` preserves full search/group results.
- [ ] `biome-taxonomy-band` no longer duplicates group filter chips.
- [ ] Hero carousel is full-width and large enough to identify the active biome.
- [ ] No biome image CSS uses `scaleX`, `scaleY`, `matrix`, or `object-fit: fill`.
- [ ] Desktop and mobile screenshots were inspected manually.
- [ ] Temporary screenshot files were removed.
- [ ] Validation commands and any unrelated failures are reported in the handoff.
