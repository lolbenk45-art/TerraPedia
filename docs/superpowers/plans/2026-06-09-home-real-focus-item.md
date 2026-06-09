# Home Real Focus Item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage atlas static focus item with a compact real item summary from a public backend endpoint while preserving the selected D layout.

**Architecture:** Add a backend public home focus endpoint that adapts existing public item detail data for curated item ID `757`. Update `useHomeData()` to fetch that endpoint with a safe fallback and pass a richer focus object into `HomeHero.vue`, which keeps the atlas table unchanged.

**Tech Stack:** Spring Boot, MyBatis, existing `PublicItemService`, Nuxt 4, Vue 3, existing frontend contract scripts.

---

## Files

- Create: `back/src/main/java/com/terraria/skills/dto/PublicHomeFocusItemDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/PublicHomeService.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/PublicHomeServiceImpl.java`
- Create: `back/src/main/java/com/terraria/skills/controller/PublicHomeController.java`
- Modify: `front-nuxt/composables/useHomeData.ts`
- Modify: `front-nuxt/components/home/HomeHero.vue`
- Modify: `front-nuxt/scripts/check-home-j1-index.mjs`

## Task 1: Frontend Contract Red

- [ ] **Step 1: Add focus item contract assertions**

Modify `front-nuxt/scripts/check-home-j1-index.mjs` to assert:

```js
assertIncludes('composables/useHomeData.ts', homeData, '/public/home/focus-item', 'homepage must fetch the real public home focus item')
assertIncludes('components/home/HomeHero.vue', homeHero, 'atlas.focus.image', 'homepage atlas focus must render the real item image')
assertIncludes('components/home/HomeHero.vue', homeHero, 'atlas.focus.meta', 'homepage atlas focus must render real item meta')
assertIncludes('components/home/HomeHero.vue', homeHero, 'atlas.focus.statLine', 'homepage atlas focus must support a compact real stat line')
assertIncludes('components/home/HomeHero.vue', homeHero, '公共资料索引', 'homepage atlas must keep the existing index framing')
assertIncludes('components/home/HomeHero.vue', homeHero, 'atlas.rows', 'homepage atlas table must remain intact')
```

- [ ] **Step 2: Verify red**

Run:

```bash
pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs
```

Expected: fails because the focus item endpoint and image/meta/stat rendering are not implemented.

## Task 2: Backend DTO And Service

- [ ] **Step 1: Create DTO**

Create `back/src/main/java/com/terraria/skills/dto/PublicHomeFocusItemDTO.java`:

```java
package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Data;

import java.io.Serializable;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicHomeFocusItemDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String nameZh;
    private String internalName;
    private String href;
    private String image;
    private String categoryName;
    private String gamePeriod;
    private String rarity;
    private Integer damage;
    private Integer knockback;
    private Integer useTime;
    private Integer sell;
    private String reasonLabel;
}
```

- [ ] **Step 2: Create service interface**

Create `back/src/main/java/com/terraria/skills/service/PublicHomeService.java`:

```java
package com.terraria.skills.service;

import com.terraria.skills.dto.PublicHomeFocusItemDTO;

public interface PublicHomeService {
    PublicHomeFocusItemDTO getFocusItem();
}
```

- [ ] **Step 3: Create service implementation**

Create `back/src/main/java/com/terraria/skills/service/impl/PublicHomeServiceImpl.java`:

```java
package com.terraria.skills.service.impl;

import com.terraria.skills.dto.PublicHomeFocusItemDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.service.PublicHomeService;
import com.terraria.skills.service.PublicItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PublicHomeServiceImpl implements PublicHomeService {

    private static final long HOME_FOCUS_ITEM_ID = 757L;
    private static final String REASON_LABEL = "当前焦点 · 真实物品";

    private final PublicItemService publicItemService;

    @Override
    @Cacheable(cacheNames = "stats:overview", key = "'home-focus-item'", unless = "#result == null")
    public PublicHomeFocusItemDTO getFocusItem() {
        PublicItemDetailDTO item = publicItemService.getPublicItemById(HOME_FOCUS_ITEM_ID);
        if (item == null || item.getId() == null) {
            return null;
        }

        return PublicHomeFocusItemDTO.builder()
            .id(item.getId())
            .name(item.getName())
            .nameZh(item.getNameZh())
            .internalName(item.getInternalName())
            .href("/items/" + item.getId())
            .image(item.getImage())
            .categoryName(item.getCategoryName())
            .gamePeriod(item.getGamePeriod())
            .rarity(item.getRarity())
            .damage(item.getDamage())
            .knockback(item.getKnockback())
            .useTime(item.getUseTime())
            .sell(item.getSell())
            .reasonLabel(REASON_LABEL)
            .build();
    }
}
```

## Task 3: Backend Controller

- [ ] **Step 1: Create controller**

Create `back/src/main/java/com/terraria/skills/controller/PublicHomeController.java`:

```java
package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.PublicHomeFocusItemDTO;
import com.terraria.skills.service.PublicHomeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/public/home")
@RequiredArgsConstructor
@Tag(name = "Public Home", description = "Public homepage data APIs")
public class PublicHomeController {

    private final PublicHomeService publicHomeService;

    @GetMapping("/focus-item")
    @Operation(summary = "Get curated real item for homepage focus")
    public ApiResponse<PublicHomeFocusItemDTO> focusItem() {
        return ApiResponse.success(publicHomeService.getFocusItem());
    }
}
```

- [ ] **Step 2: Verify backend compile**

Run:

```bash
mvn -f back/pom.xml -DskipTests compile
```

Expected: `BUILD SUCCESS`.

## Task 4: Frontend Data Mapping

- [ ] **Step 1: Add frontend type and fallback**

Modify `front-nuxt/composables/useHomeData.ts`:

```ts
export type HomeFocusItem = {
  id?: number | string | null
  name?: string | null
  nameZh?: string | null
  internalName?: string | null
  href?: string | null
  image?: string | null
  categoryName?: string | null
  gamePeriod?: string | null
  rarity?: string | null
  damage?: number | null
  knockback?: number | null
  useTime?: number | null
  sell?: number | null
  reasonLabel?: string | null
}

const fallbackFocusItem: HomeFocusItem = {
  id: 757,
  name: 'Terra Blade',
  nameZh: '泰拉刃',
  internalName: 'TerraBlade',
  href: '/items/757',
  categoryName: '武器',
  gamePeriod: '困难模式后',
  rarity: '浅红色',
  damage: 85,
  useTime: 18,
  reasonLabel: '当前焦点 · 真实物品',
}
```

- [ ] **Step 2: Add fetch helper**

Add:

```ts
const fetchHomeFocusItem = async (): Promise<HomeFocusItem> => {
  try {
    const response = await usePublicApiFetch<HomeFocusItem>('/public/home/focus-item')
    return unwrapApiResponse(response) ?? fallbackFocusItem
  } catch {
    return fallbackFocusItem
  }
}
```

- [ ] **Step 3: Fetch focus item in `useHomeData()`**

Inside `useHomeData()` add:

```ts
const { data: homeFocusItem } = await useAsyncData(
  'home-public-focus-item',
  fetchHomeFocusItem,
  {
    default: () => fallbackFocusItem,
  },
)
```

- [ ] **Step 4: Build compact focus fields**

Add computed helpers:

```ts
const focusDisplayName = computed(() => homeFocusItem.value?.nameZh || homeFocusItem.value?.name || '泰拉刃')
const focusHref = computed(() => homeFocusItem.value?.href || `/items/${homeFocusItem.value?.id || 757}`)
const focusMeta = computed(() => [
  homeFocusItem.value?.categoryName,
  homeFocusItem.value?.gamePeriod,
  homeFocusItem.value?.rarity,
].filter(Boolean).join(' / '))
const focusStatLine = computed(() => [
  homeFocusItem.value?.damage ? `伤害 ${homeFocusItem.value.damage}` : '',
  homeFocusItem.value?.useTime ? `使用时间 ${homeFocusItem.value.useTime}` : '',
].filter(Boolean).join(' · '))
```

- [ ] **Step 5: Replace atlas focus object**

Change the atlas focus object to:

```ts
focus: {
  label: homeFocusItem.value?.reasonLabel || '当前焦点 · 真实物品',
  title: focusDisplayName.value,
  href: focusHref.value,
  image: homeFocusItem.value?.image || '',
  meta: focusMeta.value,
  statLine: focusStatLine.value,
},
```

## Task 5: Frontend Rendering

- [ ] **Step 1: Extend `HomeHero.vue` type**

Modify `AtlasOverview.focus`:

```ts
focus: {
  label: string
  title: string
  href: string
  image?: string
  meta?: string
  statLine?: string
}
```

- [ ] **Step 2: Render image and compact metadata**

Replace the current focus block content with:

```vue
<div class="index-focus">
  <span class="index-focus-icon" aria-hidden="true">
    <img v-if="atlas.focus.image" :src="atlas.focus.image" :alt="atlas.focus.title" />
    <span v-else class="sprite-icon icon-items"></span>
  </span>
  <div>
    <span>{{ atlas.focus.label }}</span>
    <b>{{ atlas.focus.title }}</b>
    <em v-if="atlas.focus.meta">{{ atlas.focus.meta }}</em>
    <small v-if="atlas.focus.statLine">{{ atlas.focus.statLine }}</small>
  </div>
  <a class="index-focus-action" :href="atlas.focus.href">详情</a>
</div>
```

- [ ] **Step 3: Keep atlas table unchanged**

Do not change the `atlas.rows` loop.

## Task 6: Styling

- [ ] **Step 1: Adjust existing atlas CSS only**

Modify `front-nuxt/assets/css/hifi-preview.css` only if needed for the new image/meta/small elements. Keep the existing right-column footprint.

Required styling intent:

```css
.index-focus-icon img {
  max-width: 34px;
  max-height: 34px;
  object-fit: contain;
  image-rendering: pixelated;
}

.index-focus em,
.index-focus small {
  display: block;
  color: var(--text-muted);
  font-style: normal;
  line-height: 1.35;
}
```

## Task 7: Validation

- [ ] **Step 1: Contract green**

Run:

```bash
pnpm --dir front-nuxt exec node scripts/check-home-j1-index.mjs
```

Expected: passes.

- [ ] **Step 2: Backend compile**

Run:

```bash
mvn -f back/pom.xml -DskipTests compile
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 3: API smoke**

With local backend running:

```bash
curl -sS http://localhost:18088/api/public/home/focus-item
```

Expected: JSON `success: true`, `data.id: 757`, `data.href: "/items/757"`, and `data.nameZh` or `data.name`.

- [ ] **Step 4: Frontend checks**

Run:

```bash
pnpm --dir front-nuxt run check
```

Expected: exits `0`.

- [ ] **Step 5: Diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only scoped implementation files are modified.

## Commit Scope

Implementation commit should include only:

- backend DTO/service/controller files for public home focus item
- `front-nuxt/composables/useHomeData.ts`
- `front-nuxt/components/home/HomeHero.vue`
- minimal CSS if required
- `front-nuxt/scripts/check-home-j1-index.mjs`

Do not include `.superpowers/brainstorm` preview files.
