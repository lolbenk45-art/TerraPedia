# Public Front Tiered Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the approved Tiered Atlas public-front redesign from the current in-progress `front` state by removing structural emoji UI, centralizing glyph/fallback logic, and verifying the shared shell behaves cleanly across public pages.

**Architecture:** The current worktree already contains most of the shared `public-workbench` / `public-editorial` shell implementation and passing shell tests. This plan focuses on the remaining spec gap: replace emoji-based structural UI with shared glyph helpers and component-level fallback marks, then verify the public front still type-checks, tests, and builds cleanly.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Vitest, Vue Test Utils, shared CSS tokens in `front/src/assets/main.css`

**Execution note:** The repository has unrelated in-flight changes in the main workspace. Implement in-place with strict file scope. During execution, do not revert or restage unrelated files. Defer git commits unless the user explicitly asks for a clean integration pass.

---

## File Map

### New Shared Helpers

- Create: `front/src/utils/categoryGlyph.ts`
  - Centralize category-to-glyph mapping for workbench navigation and entity fallbacks
- Create: `front/src/utils/itemFallbackMark.ts`
  - Centralize deterministic item fallback mark selection without emoji

### Component Updates

- Modify: `front/src/components/CategoryTreeItem.vue`
  - Replace local emoji mapping with shared category glyph helper
- Modify: `front/src/components/CategoryDrawer.vue`
  - Replace local emoji mapping with shared category glyph helper
- Modify: `front/src/components/CategorySidebar.vue`
  - Replace local emoji mapping with shared category glyph helper
- Modify: `front/src/components/ItemSearchInput.vue`
  - Replace search suggestion emoji with shared glyph/fallback mark
- Modify: `front/src/components/ItemCard.vue`
  - Replace random emoji fallback icon with deterministic shared mark
- Modify: `front/src/components/ItemDetailModal.vue`
  - Replace random emoji fallback icon with deterministic shared mark
- Modify: `front/src/components/ErrorState.vue`
  - Remove decorative emoji heading marker
- Modify: `front/src/components/OfflineState.vue`
  - Remove decorative emoji heading marker

### View Updates

- Modify: `front/src/views/HomeView.vue`
  - Replace structural emoji markers in mobile/header controls
- Modify: `front/src/views/ItemDetailView.vue`
  - Replace local emoji-based category fallback with shared glyph helper

### Tests

- Create: `front/src/tests/category-glyph.spec.ts`
  - Lock the shared category glyph mapping and helper behavior
- Create: `front/src/tests/item-fallback-mark.spec.ts`
  - Lock deterministic item fallback marks
- Modify: `front/src/tests/public-front-style-shell.spec.ts`
  - Add render-level icon hygiene assertions for key public pages

---

### Task 1: Lock the glyph and icon-hygiene gap with failing tests

**Files:**
- Create: `front/src/tests/category-glyph.spec.ts`
- Create: `front/src/tests/item-fallback-mark.spec.ts`
- Modify: `front/src/tests/public-front-style-shell.spec.ts`

- [ ] **Step 1: Write the failing category glyph unit test**

```ts
import { describe, expect, it } from 'vitest'
import { getCategoryGlyph } from '@/utils/categoryGlyph'

describe('category glyph mapping', () => {
  it('returns deterministic letter glyphs instead of emoji for common categories', () => {
    expect(getCategoryGlyph('Weapons')).toBe('WP')
    expect(getCategoryGlyph('Armor')).toBe('AR')
    expect(getCategoryGlyph('Materials')).toBe('MT')
    expect(getCategoryGlyph('消耗品')).toBe('AL')
  })

  it('falls back to AT for unknown category labels', () => {
    expect(getCategoryGlyph('Unknown Category')).toBe('AT')
  })
})
```

- [ ] **Step 2: Write the failing item fallback mark unit test**

```ts
import { describe, expect, it } from 'vitest'
import { getItemFallbackMark } from '@/utils/itemFallbackMark'

describe('item fallback mark', () => {
  it('uses deterministic two-letter marks instead of emoji icons', () => {
    expect(getItemFallbackMark({ id: 1, category: 'Weapons', name: 'Copper Shortsword' })).toBe('WP')
    expect(getItemFallbackMark({ id: 2, category: 'Materials', name: 'Gel' })).toBe('MT')
  })

  it('falls back to the item name initials when category is absent', () => {
    expect(getItemFallbackMark({ id: 3, name: 'Magic Mirror' })).toBe('MM')
  })
})
```

- [ ] **Step 3: Add a failing render-level public-shell assertion**

Append to `front/src/tests/public-front-style-shell.spec.ts`:

```ts
it('does not render structural emoji markers in the item workbench shell', async () => {
  applyRoute('/items')

  const wrapper = mount(HomeView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        ItemCard: { template: '<div class="item-card-stub" />' },
        VirtualItemGrid: { template: '<div class="virtual-grid-stub" />' },
        CategoryTreeItem: { template: '<div class="category-tree-item-stub" />' },
        CategoryDrawer: { template: '<div class="category-drawer-stub" />' },
        ItemSearchInput: { template: '<div class="item-search-input-stub" />' },
        ErrorState: { template: '<div class="error-state-stub" />' },
      },
    },
  })

  await flushPromises()

  expect(wrapper.text()).not.toContain('📦')
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```powershell
pnpm --dir front test:unit -- category-glyph.spec.ts item-fallback-mark.spec.ts public-front-style-shell.spec.ts
```

Expected:

- `category-glyph.spec.ts` fails because `categoryGlyph.ts` does not exist yet
- `item-fallback-mark.spec.ts` fails because `itemFallbackMark.ts` does not exist yet
- the new shell assertion fails because `HomeView.vue` still contains `📦`

- [ ] **Step 5: Defer commit**

Do not commit in execution unless the user asks for a clean commit pass.

### Task 2: Build the shared category glyph system and replace navigation emoji

**Files:**
- Create: `front/src/utils/categoryGlyph.ts`
- Modify: `front/src/components/CategoryTreeItem.vue`
- Modify: `front/src/components/CategoryDrawer.vue`
- Modify: `front/src/components/CategorySidebar.vue`
- Modify: `front/src/views/ItemDetailView.vue`

- [ ] **Step 1: Implement the shared category glyph helper**

```ts
const ENGLISH_RULES: Array<[RegExp, string]> = [
  [/(weapon|sword|gun|bow|ammo)/i, 'WP'],
  [/(tool|pickaxe|axe|hammer)/i, 'TL'],
  [/(armor|helmet|leggings|chestplate)/i, 'AR'],
  [/(accessory)/i, 'AC'],
  [/(consumable|potion|food)/i, 'AL'],
  [/(material)/i, 'MT'],
  [/(furniture|wall|block|platform)/i, 'HB'],
  [/(wire|mechanism)/i, 'MC'],
]

const CHINESE_RULES: Array<[RegExp, string]> = [
  [/(武器|弹药)/, 'WP'],
  [/(工具)/, 'TL'],
  [/(护甲|盔甲|时装)/, 'AR'],
  [/(饰品)/, 'AC'],
  [/(消耗品|药)/, 'AL'],
  [/(材料)/, 'MT'],
  [/(家具|方块|墙壁)/, 'HB'],
  [/(电线|机械)/, 'MC'],
]

export function getCategoryGlyph(name?: string | null): string {
  const value = name?.trim() || ''

  for (const [pattern, glyph] of ENGLISH_RULES) {
    if (pattern.test(value)) return glyph
  }

  for (const [pattern, glyph] of CHINESE_RULES) {
    if (pattern.test(value)) return glyph
  }

  return 'AT'
}
```

- [ ] **Step 2: Replace local category icon functions with the shared helper**

Use this import pattern in each component:

```ts
import { getCategoryGlyph } from '@/utils/categoryGlyph'
```

Replace local emoji-returning functions with:

```ts
const categoryIcon = (name: string) => getCategoryGlyph(name)
```

Update template icon containers from emoji-sized presentation to compact glyph badges:

```vue
<span class="category-glyph">
  {{ categoryIcon(category.name) }}
</span>
```

- [ ] **Step 3: Replace the item detail category fallback**

In `front/src/views/ItemDetailView.vue`, replace the local `categoryIcon` implementation with:

```ts
import { getCategoryGlyph } from '@/utils/categoryGlyph'

const categoryIcon = (name: string) => getCategoryGlyph(name)
```

Keep the existing visual container, but the rendered content must now be a 2-letter glyph rather than an emoji.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pnpm --dir front test:unit -- category-glyph.spec.ts
```

Expected:

- PASS with both category glyph tests green

- [ ] **Step 5: Defer commit**

Do not commit in execution unless the user asks for a clean commit pass.

### Task 3: Replace item/state emoji fallbacks with deterministic marks

**Files:**
- Create: `front/src/utils/itemFallbackMark.ts`
- Modify: `front/src/components/ItemCard.vue`
- Modify: `front/src/components/ItemDetailModal.vue`
- Modify: `front/src/components/ItemSearchInput.vue`
- Modify: `front/src/components/ErrorState.vue`
- Modify: `front/src/components/OfflineState.vue`
- Modify: `front/src/views/HomeView.vue`

- [ ] **Step 1: Implement the item fallback mark helper**

```ts
import { getCategoryGlyph } from '@/utils/categoryGlyph'

type ItemFallbackInput = {
  id?: number | null
  name?: string | null
  category?: string | null
}

function nameInitials(name?: string | null): string {
  const words = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (words.length === 0) return 'IT'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function getItemFallbackMark(input: ItemFallbackInput): string {
  const categoryGlyph = getCategoryGlyph(input.category)
  if (categoryGlyph !== 'AT') {
    return categoryGlyph
  }
  return nameInitials(input.name)
}
```

- [ ] **Step 2: Replace random emoji arrays in item components**

In both `ItemCard.vue` and `ItemDetailModal.vue`, replace the random icon array logic with:

```ts
import { getItemFallbackMark } from '@/utils/itemFallbackMark'

const itemIcon = computed(() =>
  getItemFallbackMark({
    id: props.item.id,
    name: props.item.nameZh?.trim() || props.item.name,
    category: props.item.categoryName || props.item.category,
  }),
)
```

Keep the existing fallback containers, but ensure the typography is tuned for 2-letter glyphs rather than emoji.

- [ ] **Step 3: Replace remaining structural emoji markers**

Apply these replacements:

- `front/src/components/ItemSearchInput.vue`
  - replace suggestion icon `📦` with a styled glyph like `IT`
- `front/src/views/HomeView.vue`
  - replace home/all-items emoji markers with `TP` or `IT` badges
- `front/src/components/ErrorState.vue`
  - remove `💡` heading marker and replace with plain label or SVG
- `front/src/components/OfflineState.vue`
  - remove `💡` heading marker and replace with plain label or SVG

Example pattern for textual glyph badges:

```vue
<span class="atlas-mark" aria-hidden="true">IT</span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
pnpm --dir front test:unit -- item-fallback-mark.spec.ts public-front-style-shell.spec.ts
```

Expected:

- PASS with deterministic fallback tests green
- PASS with the item workbench shell no longer rendering `📦`

- [ ] **Step 5: Defer commit**

Do not commit in execution unless the user asks for a clean commit pass.

### Task 4: Final verification and icon audit

**Files:**
- Modify: none

- [ ] **Step 1: Run focused front unit tests**

Run:

```powershell
pnpm --dir front test:unit -- category-glyph.spec.ts item-fallback-mark.spec.ts public-front-style-shell.spec.ts npc-public-shell.spec.ts
```

Expected:

- PASS with 0 failures

- [ ] **Step 2: Run the full front type check**

Run:

```powershell
pnpm --dir front check
```

Expected:

- exit `0`
- no TypeScript errors

- [ ] **Step 3: Run the front build**

Run:

```powershell
pnpm --dir front build
```

Expected:

- exit `0`
- Vite production build succeeds

- [ ] **Step 4: Run an emoji audit against public front source**

Run:

```powershell
rg -n "[\x{1F300}-\x{1FAFF}]|📦|🧪|🛡|🏹|💡" front/src/views front/src/components
```

Expected:

- no structural emoji matches in public front source
- documentation files such as `README_NAVIGATION.md` are out of scope if they are not imported by the app

- [ ] **Step 5: Spec checklist review**

Checklist:

- [ ] Public workbench/editorial shell tests still pass
- [ ] Structural emoji UI is removed from public front source
- [ ] Category and item fallback marks are deterministic and reusable
- [ ] Home/item/detail/search/state surfaces stay in the same product family
- [ ] Mobile-facing controls still read clearly after glyph replacement

- [ ] **Step 6: Defer commit**

Do not commit in execution unless the user asks for a clean commit pass.
