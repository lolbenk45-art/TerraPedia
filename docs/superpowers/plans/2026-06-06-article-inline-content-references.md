# Article Inline Content References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public content-reference API and a user-article inline reference insertion flow for item and NPC data.

**Architecture:** Backend exposes one future-ready reference contract under `/public/content-references`, backed by existing `PublicItemService` and `PublicNpcService`. Frontend stores only safe inline reference spans in article HTML, then the public article page batch-resolves those references and enhances them into clickable inline chips. This plan implements only display mode `inline`; block cards remain a future display mode using the same reference contract.

**Tech Stack:** Spring Boot + MockMvc + Mockito, Nuxt 3 + Vue 3 Composition API, existing `usePublicApiFetch`, contenteditable editor DOM helpers, existing front runtime check scripts.

---

## Design Lock

Selected option: **B. 行内标签**.

The saved article content should contain a compact, sanitized marker:

```html
<span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="泰拉刃">泰拉刃</span>
```

The marker is the article source of truth. It must not copy backend item/NPC payloads into the article body. The reader page resolves references by `type + id`, preserves the author's label text, and opens a compact detail panel on click.

## Multi-Agent Audit Repairs

These repairs supersede any older snippet in this document where there is a conflict.

Backend repairs:

- Resolve responses must preserve the requested key. If the request is `{ "type": "npc", "id": "455" }` and `PublicNpcService.getNpcById(455)` returns a representative DTO with `id=454`, the returned reference row must still use `type="npc"` and `id="455"` so the article marker key `npc:455` resolves. If canonical identity is useful later, add a separate `canonicalId` field; do not replace the requested `id`.
- Search requires a nonblank `q`. Blank search must return an empty list without calling item/NPC services.
- Controller tests must use `anyInt()` for primitive `int` matchers.
- Resolve must tolerate `null` body, `null refs`, `null` list entries, unsupported types, malformed ids, duplicate refs, negative limits, and oversized lists. It must cap resolve work at 100 unique refs per request.
- First version accepts the N+1 resolve tradeoff because article inline references are capped and deduped. Bulk mapper methods are deferred until measured need.
- Add one runtime route smoke command in final validation using the local stack or curl; standalone MockMvc remains the focused backend unit route test.

Frontend and security repairs:

- Inline chips must not keep the caret inside the reference span after insertion. Insert a trailing text node/space and place the caret after the chip.
- The reader enhancement must run only on the client after the `v-html` body exists. Use `onMounted`, `nextTick`, and a watch on `sanitizedArticleHtml`/article id that calls a client-only resolver after DOM render.
- Reference marker validation is atomic. A span keeps `class="tp-content-ref"` only when the full tuple is valid: exactly allowed reference class, `data-tp-ref-type` in `item|npc`, `data-tp-ref-id` matching `/^\d{1,12}$/`, `data-tp-ref-label` length 1..80, and no unexpected `data-tp-*`. Otherwise strip the reference class and all `data-tp-ref-*` so it renders as plain text.
- Frontend must not trust `detailPath` from the API. Normalize detail links from `type + id` as `/items/{id}` or `/npcs/{id}`.
- Reference search must clear timers on unmount and use a request sequence token so stale responses cannot overwrite newer results.
- The article content reference check must exercise real project code paths: helper-generated marker, editor sanitizer preservation/stripping, article sanitizer preservation/stripping, reference resolution normalizer, and click/keyboard enhancement logic. A standalone HTML file that manually sets `role`/`tabindex` is not enough.
- Negative checks must include missing type, invalid type, bad id, empty/overlong label, extra classes, `onclick`, `style=url(...)`, nested `<img onerror>`, and unexpected `data-tp-*`.

Plan execution rule:

- If a task finds a conflict between old task snippets and this repair section, follow this repair section, patch the task implementation accordingly, and record the deviation in the task commit message body or final task summary.

First version supports:

- `item`
- `npc`

Reserved for later without changing article markup:

- `boss`
- `biome`
- `buff`
- `projectile`
- `armor_set`

## Scope

In scope:

- Public API search endpoint for item/NPC references.
- Public API batch resolve endpoint for article rendering.
- Editor toolbar reference button, search popover, type tabs, and inline insert behavior.
- Sanitizer support for `class`, `data-tp-ref-type`, `data-tp-ref-id`, and `data-tp-ref-label` on safe span references.
- Public article page enhancement: batch resolve, clickable chip styling, detail popover, missing-reference fallback.
- Focused backend and frontend checks.

Out of scope:

- Block card insertion.
- Persisting a separate normalized article-reference table.
- Admin-only reference management.
- Data backfills.
- Changing existing item/NPC detail pages.

## Current Entrypoints

- Backend public item list/detail/suggestions:
  - `back/src/main/java/com/terraria/skills/controller/PublicItemController.java`
  - `back/src/main/java/com/terraria/skills/service/PublicItemService.java`
- Backend public NPC list/aggregate:
  - `back/src/main/java/com/terraria/skills/controller/NpcController.java`
  - `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`
  - `back/src/main/java/com/terraria/skills/service/PublicNpcService.java`
- Frontend public API helper:
  - `front-nuxt/composables/usePublicApi.ts`
- Frontend article editor:
  - `front-nuxt/components/user/UserArticleRichEditor.vue`
  - `front-nuxt/lib/userArticleEditorDom.mjs`
- Frontend public article reader:
  - `front-nuxt/pages/articles/[slug].vue`
- Existing checks to extend:
  - `front-nuxt/scripts/check-user-article-editor-dom.mjs`
  - `front-nuxt/scripts/check-user-article-editor-runtime.mjs`
  - `front-nuxt/package.json`

## File Structure

Create:

- `back/src/main/java/com/terraria/skills/controller/PublicContentReferenceController.java`  
  Owns `/public/content-references` routes only.
- `back/src/main/java/com/terraria/skills/dto/PublicContentReferenceDTO.java`  
  Unified public reference row returned by both search and resolve.
- `back/src/main/java/com/terraria/skills/dto/PublicContentReferenceResolveRequestDTO.java`  
  Batch resolve request wrapper.
- `back/src/main/java/com/terraria/skills/dto/PublicContentReferenceResolveItemDTO.java`  
  One requested reference.
- `back/src/main/java/com/terraria/skills/service/PublicContentReferenceService.java`  
  Search and resolve interface.
- `back/src/main/java/com/terraria/skills/service/impl/PublicContentReferenceServiceImpl.java`  
  Maps existing item/NPC public services into the unified contract.
- `back/src/test/java/com/terraria/skills/controller/PublicContentReferenceControllerTest.java`  
  Route-level contract tests.
- `back/src/test/java/com/terraria/skills/service/impl/PublicContentReferenceServiceImplTest.java`  
  Mapping, ordering, and missing-reference tests.
- `front-nuxt/composables/usePublicContentReferences.ts`  
  Search/resolve functions and normalizers for editor and article reader.
- `front-nuxt/scripts/check-article-content-references.mjs`  
  Browser/runtime contract for sanitizer + rendered inline reference behavior.

Modify:

- `front-nuxt/types/public-api.ts`  
  Add public reference types.
- `front-nuxt/lib/userArticleEditorDom.mjs`  
  Add safe reference span builder/parser helpers.
- `front-nuxt/components/user/UserArticleRichEditor.vue`  
  Add toolbar entry, popover search, and insertion logic.
- `front-nuxt/pages/articles/[slug].vue`  
  Allow reference attributes in sanitizer and enhance rendered spans.
- `front-nuxt/package.json`  
  Add reference check to `pnpm run check`.

## API Contract

Search:

```http
GET /public/content-references?types=item,npc&q=泰拉&limit=20
```

Resolve:

```http
POST /public/content-references/resolve
Content-Type: application/json

{
  "refs": [
    { "type": "item", "id": 77 },
    { "type": "npc", "id": 1 }
  ]
}
```

Unified response row:

```json
{
  "type": "item",
  "id": "77",
  "label": "泰拉刃",
  "name": "Terra Blade",
  "internalName": "TerraBlade",
  "imageUrl": "http://localhost:9000/terrapedia-images/items/terra-blade.png",
  "categoryName": "Weapons",
  "summary": "物品 · Weapons · Yellow",
  "detailPath": "/items/77",
  "available": true
}
```

Missing resolve row:

```json
{
  "type": "npc",
  "id": "999999",
  "label": "npc #999999",
  "detailPath": "/npcs",
  "available": false
}
```

## Task 1: Backend DTOs And Service Contract

**Files:**

- Create: `back/src/main/java/com/terraria/skills/dto/PublicContentReferenceDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/PublicContentReferenceResolveRequestDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/PublicContentReferenceResolveItemDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/PublicContentReferenceService.java`

- [ ] **Step 1: Add unified response DTO**

```java
package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicContentReferenceDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String type;
    private String id;
    private String label;
    private String name;
    private String internalName;
    private String imageUrl;
    private String categoryName;
    private String summary;
    private String detailPath;
    private Boolean available;
}
```

- [ ] **Step 2: Add resolve request item DTO**

```java
package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class PublicContentReferenceResolveItemDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String type;
    private String id;
}
```

- [ ] **Step 3: Add resolve request wrapper**

```java
package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class PublicContentReferenceResolveRequestDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private List<PublicContentReferenceResolveItemDTO> refs = new ArrayList<>();
}
```

- [ ] **Step 4: Add service interface**

```java
package com.terraria.skills.service;

import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveItemDTO;

import java.util.List;
import java.util.Set;

public interface PublicContentReferenceService {

    List<PublicContentReferenceDTO> search(Set<String> types, String query, int limit);

    List<PublicContentReferenceDTO> resolve(List<PublicContentReferenceResolveItemDTO> refs);
}
```

- [ ] **Step 5: Commit task 1**

```bash
git add back/src/main/java/com/terraria/skills/dto/PublicContentReferenceDTO.java \
  back/src/main/java/com/terraria/skills/dto/PublicContentReferenceResolveItemDTO.java \
  back/src/main/java/com/terraria/skills/dto/PublicContentReferenceResolveRequestDTO.java \
  back/src/main/java/com/terraria/skills/service/PublicContentReferenceService.java
git commit -m "feat(api): define public content reference contract"
```

## Task 2: Backend Service Implementation

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/impl/PublicContentReferenceServiceImplTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/PublicContentReferenceServiceImpl.java`

- [ ] **Step 1: Write service tests**

```java
package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.common.PageQuery;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveItemDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.service.PublicItemService;
import com.terraria.skills.service.PublicNpcService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicContentReferenceServiceImplTest {

    @Mock
    private PublicItemService publicItemService;

    @Mock
    private PublicNpcService publicNpcService;

    @Test
    void searchShouldMergeItemAndNpcResultsIntoUnifiedContract() {
        PublicItemSuggestionDTO item = new PublicItemSuggestionDTO();
        item.setId(77L);
        item.setName("Terra Blade");
        item.setNameZh("泰拉刃");
        item.setInternalName("TerraBlade");
        item.setImage("http://localhost:9000/items/terra-blade.png");
        item.setCategoryName("Weapons");
        item.setRarity("Yellow");

        NpcListItemDTO npc = new NpcListItemDTO();
        npc.setId(1L);
        npc.setName("Guide");
        npc.setNameZh("向导");
        npc.setInternalName("Guide");
        npc.setImageUrl("http://localhost:9000/npcs/guide.png");
        npc.setCategoryName("Town NPC");
        npc.setIsTownNpc(true);

        Page<NpcListItemDTO> npcPage = new Page<>(1, 10);
        npcPage.setRecords(List.of(npc));
        npcPage.setTotal(1);

        when(publicItemService.searchSuggestions("泰", 10)).thenReturn(List.of(item));
        when(publicNpcService.getNpcs(any(PublicNpcQuery.class))).thenReturn(npcPage);

        PublicContentReferenceServiceImpl service = new PublicContentReferenceServiceImpl(publicItemService, publicNpcService);
        List<PublicContentReferenceDTO> results = service.search(Set.of("item", "npc"), " 泰 ", 20);

        assertEquals(2, results.size());
        assertEquals("item", results.get(0).getType());
        assertEquals("77", results.get(0).getId());
        assertEquals("泰拉刃", results.get(0).getLabel());
        assertEquals("/items/77", results.get(0).getDetailPath());
        assertEquals(Boolean.TRUE, results.get(0).getAvailable());
        assertEquals("npc", results.get(1).getType());
        assertEquals("1", results.get(1).getId());
        assertEquals("向导", results.get(1).getLabel());
        assertEquals("/npcs/1", results.get(1).getDetailPath());

        ArgumentCaptor<PublicNpcQuery> npcQuery = ArgumentCaptor.forClass(PublicNpcQuery.class);
        verify(publicNpcService).getNpcs(npcQuery.capture());
        assertEquals("泰", npcQuery.getValue().getSearch());
        assertEquals(10, npcQuery.getValue().getLimit());
    }

    @Test
    void resolveShouldPreserveOrderAndMarkMissingReferencesUnavailable() {
        PublicItemDetailDTO item = new PublicItemDetailDTO();
        item.setId(77L);
        item.setName("Terra Blade");
        item.setNameZh("泰拉刃");
        item.setInternalName("TerraBlade");
        item.setImage("http://localhost:9000/items/terra-blade.png");
        item.setCategoryName("Weapons");
        item.setRarity("Yellow");

        NpcDetailDTO npc = new NpcDetailDTO();
        npc.setId(1L);
        npc.setName("Guide");
        npc.setNameZh("向导");
        npc.setInternalName("Guide");
        npc.setImageUrl("http://localhost:9000/npcs/guide.png");
        npc.setCategoryName("Town NPC");
        npc.setIsTownNpc(true);

        when(publicItemService.getPublicItemById(77L)).thenReturn(item);
        when(publicNpcService.getNpcById(1L)).thenReturn(npc);
        when(publicNpcService.getNpcById(999L)).thenReturn(null);

        PublicContentReferenceServiceImpl service = new PublicContentReferenceServiceImpl(publicItemService, publicNpcService);
        List<PublicContentReferenceDTO> results = service.resolve(List.of(
            ref("npc", "1"),
            ref("item", "77"),
            ref("npc", "999")
        ));

        assertEquals("npc", results.get(0).getType());
        assertEquals("1", results.get(0).getId());
        assertTrue(results.get(0).getAvailable());
        assertEquals("item", results.get(1).getType());
        assertEquals("77", results.get(1).getId());
        assertTrue(results.get(1).getAvailable());
        assertEquals("npc", results.get(2).getType());
        assertEquals("999", results.get(2).getId());
        assertFalse(results.get(2).getAvailable());
        assertEquals("npc #999", results.get(2).getLabel());
    }

    private static PublicContentReferenceResolveItemDTO ref(String type, String id) {
        PublicContentReferenceResolveItemDTO ref = new PublicContentReferenceResolveItemDTO();
        ref.setType(type);
        ref.setId(id);
        return ref;
    }
}
```

- [ ] **Step 2: Run failing service tests**

```bash
cd back
mvn -Dtest=PublicContentReferenceServiceImplTest test
```

Expected: compile failure because `PublicContentReferenceServiceImpl` does not exist.

- [ ] **Step 3: Implement service**

```java
package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveItemDTO;
import com.terraria.skills.dto.PublicItemDetailDTO;
import com.terraria.skills.dto.PublicItemSuggestionDTO;
import com.terraria.skills.dto.PublicNpcQuery;
import com.terraria.skills.service.PublicContentReferenceService;
import com.terraria.skills.service.PublicItemService;
import com.terraria.skills.service.PublicNpcService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PublicContentReferenceServiceImpl implements PublicContentReferenceService {

    private static final Set<String> SUPPORTED_TYPES = Set.of("item", "npc");
    private static final int MAX_SEARCH_LIMIT = 50;
    private static final int MAX_RESOLVE_LIMIT = 100;

    private final PublicItemService publicItemService;
    private final PublicNpcService publicNpcService;

    @Override
    public List<PublicContentReferenceDTO> search(Set<String> types, String query, int limit) {
        Set<String> resolvedTypes = normalizeTypes(types);
        String keyword = normalizeText(query);
        int resolvedLimit = clamp(limit, 1, MAX_SEARCH_LIMIT);
        int perTypeLimit = Math.max(1, resolvedLimit / Math.max(1, resolvedTypes.size()));
        List<PublicContentReferenceDTO> results = new ArrayList<>();

        if (resolvedTypes.contains("item")) {
            for (PublicItemSuggestionDTO item : publicItemService.searchSuggestions(keyword, perTypeLimit)) {
                results.add(fromItemSuggestion(item));
            }
        }

        if (resolvedTypes.contains("npc")) {
            PublicNpcQuery npcQuery = new PublicNpcQuery();
            npcQuery.setPage(1);
            npcQuery.setLimit(perTypeLimit);
            npcQuery.setSearch(keyword);
            Page<NpcListItemDTO> npcPage = publicNpcService.getNpcs(npcQuery);
            for (NpcListItemDTO npc : npcPage.getRecords()) {
                results.add(fromNpc(npc));
            }
        }

        return results.size() > resolvedLimit ? results.subList(0, resolvedLimit) : results;
    }

    @Override
    public List<PublicContentReferenceDTO> resolve(List<PublicContentReferenceResolveItemDTO> refs) {
        List<PublicContentReferenceDTO> results = new ArrayList<>();
        if (refs == null) return results;

        for (PublicContentReferenceResolveItemDTO ref : refs.stream().limit(MAX_RESOLVE_LIMIT).toList()) {
            String type = normalizeType(ref.getType());
            Long id = parseId(ref.getId());
            if (id == null || !SUPPORTED_TYPES.contains(type)) {
                results.add(missing(type.isEmpty() ? "unknown" : type, normalizeText(ref.getId())));
                continue;
            }
            if ("item".equals(type)) {
                PublicItemDetailDTO item = publicItemService.getPublicItemById(id);
                results.add(item == null ? missing(type, String.valueOf(id)) : fromItemDetail(item));
                continue;
            }
            NpcDetailDTO npc = publicNpcService.getNpcById(id);
            results.add(npc == null ? missing(type, String.valueOf(id)) : fromNpc(npc));
        }

        return results;
    }

    private Set<String> normalizeTypes(Set<String> types) {
        if (types == null || types.isEmpty()) return SUPPORTED_TYPES;
        Set<String> normalized = new LinkedHashSet<>();
        for (String type : types) {
            String next = normalizeType(type);
            if (SUPPORTED_TYPES.contains(next)) normalized.add(next);
        }
        return normalized.isEmpty() ? SUPPORTED_TYPES : normalized;
    }

    private PublicContentReferenceDTO fromItemSuggestion(PublicItemSuggestionDTO item) {
        PublicContentReferenceDTO dto = base("item", item.getId(), item.getNameZh(), item.getName(), item.getInternalName());
        dto.setImageUrl(item.getImage());
        dto.setCategoryName(item.getCategoryName());
        dto.setSummary(joinSummary("物品", item.getCategoryName(), item.getRarity()));
        dto.setDetailPath("/items/" + item.getId());
        dto.setAvailable(true);
        return dto;
    }

    private PublicContentReferenceDTO fromItemDetail(PublicItemDetailDTO item) {
        PublicContentReferenceDTO dto = base("item", item.getId(), item.getNameZh(), item.getName(), item.getInternalName());
        dto.setImageUrl(item.getImage());
        dto.setCategoryName(item.getCategoryName());
        dto.setSummary(joinSummary("物品", item.getCategoryName(), item.getRarity()));
        dto.setDetailPath("/items/" + item.getId());
        dto.setAvailable(true);
        return dto;
    }

    private PublicContentReferenceDTO fromNpc(NpcListItemDTO npc) {
        PublicContentReferenceDTO dto = base("npc", npc.getId(), npc.getNameZh(), npc.getName(), npc.getInternalName());
        dto.setImageUrl(npc.getImageUrl());
        dto.setCategoryName(npc.getCategoryName());
        dto.setSummary(joinSummary(npc.getIsTownNpc() == Boolean.TRUE ? "城镇 NPC" : "NPC", npc.getCategoryName(), npc.getIsBoss() == Boolean.TRUE ? "Boss" : ""));
        dto.setDetailPath("/npcs/" + npc.getId());
        dto.setAvailable(true);
        return dto;
    }

    private PublicContentReferenceDTO base(String type, Long id, String label, String name, String internalName) {
        PublicContentReferenceDTO dto = new PublicContentReferenceDTO();
        dto.setType(type);
        dto.setId(String.valueOf(id));
        dto.setLabel(firstText(label, name, internalName, type + " #" + id));
        dto.setName(normalizeText(name));
        dto.setInternalName(normalizeText(internalName));
        return dto;
    }

    private PublicContentReferenceDTO missing(String type, String id) {
        PublicContentReferenceDTO dto = new PublicContentReferenceDTO();
        dto.setType(type);
        dto.setId(id);
        dto.setLabel(type + " #" + id);
        dto.setDetailPath("/" + ("npc".equals(type) ? "npcs" : "items"));
        dto.setAvailable(false);
        return dto;
    }

    private String joinSummary(String first, String second, String third) {
        return String.join(" · ", List.of(first, second, third).stream().map(this::normalizeText).filter(value -> !value.isEmpty()).toList());
    }

    private String firstText(String... values) {
        for (String value : values) {
            String normalized = normalizeText(value);
            if (!normalized.isEmpty()) return normalized;
        }
        return "";
    }

    private String normalizeType(String value) {
        return normalizeText(value).toLowerCase(Locale.ROOT);
    }

    private String normalizeText(Object value) {
        return String.valueOf(value == null ? "" : value).trim();
    }

    private Long parseId(String value) {
        try {
            return Long.parseLong(normalizeText(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
```

- [ ] **Step 4: Run service tests**

```bash
cd back
mvn -Dtest=PublicContentReferenceServiceImplTest test
```

Expected: tests pass.

- [ ] **Step 5: Commit task 2**

```bash
git add back/src/test/java/com/terraria/skills/service/impl/PublicContentReferenceServiceImplTest.java \
  back/src/main/java/com/terraria/skills/service/impl/PublicContentReferenceServiceImpl.java
git commit -m "feat(api): map item and npc content references"
```

## Task 3: Backend Controller

**Files:**

- Create: `back/src/test/java/com/terraria/skills/controller/PublicContentReferenceControllerTest.java`
- Create: `back/src/main/java/com/terraria/skills/controller/PublicContentReferenceController.java`

- [ ] **Step 1: Write controller tests**

```java
package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.service.PublicContentReferenceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicContentReferenceControllerTest {

    @Mock
    private PublicContentReferenceService publicContentReferenceService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new PublicContentReferenceController(publicContentReferenceService))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldSearchContentReferencesWithTypesAndQuery() throws Exception {
        PublicContentReferenceDTO item = row("item", "77", "泰拉刃", "/items/77", true);
        PublicContentReferenceDTO npc = row("npc", "1", "向导", "/npcs/1", true);
        when(publicContentReferenceService.search(any(), any(), any(Integer.class))).thenReturn(List.of(item, npc));

        mockMvc.perform(get("/public/content-references")
                .param("types", "item,npc")
                .param("q", " 泰 ")
                .param("limit", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].type").value("item"))
            .andExpect(jsonPath("$.data[0].id").value("77"))
            .andExpect(jsonPath("$.data[0].label").value("泰拉刃"))
            .andExpect(jsonPath("$.data[0].detailPath").value("/items/77"))
            .andExpect(jsonPath("$.data[0].available").value(true))
            .andExpect(jsonPath("$.data[1].type").value("npc"))
            .andExpect(jsonPath("$.data[1].id").value("1"));

        ArgumentCaptor<Set<String>> typeCaptor = ArgumentCaptor.forClass(Set.class);
        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Integer> limitCaptor = ArgumentCaptor.forClass(Integer.class);
        verify(publicContentReferenceService).search(typeCaptor.capture(), queryCaptor.capture(), limitCaptor.capture());
        assertEquals(Set.of("item", "npc"), typeCaptor.getValue());
        assertEquals("泰", queryCaptor.getValue());
        assertEquals(20, limitCaptor.getValue());
    }

    @Test
    void shouldResolveReferencesFromRequestBody() throws Exception {
        when(publicContentReferenceService.resolve(any())).thenReturn(List.of(
            row("npc", "1", "向导", "/npcs/1", true),
            row("item", "77", "泰拉刃", "/items/77", true)
        ));

        mockMvc.perform(post("/public/content-references/resolve")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "refs": [
                        { "type": "npc", "id": "1" },
                        { "type": "item", "id": "77" }
                      ]
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].type").value("npc"))
            .andExpect(jsonPath("$.data[0].id").value("1"))
            .andExpect(jsonPath("$.data[1].type").value("item"))
            .andExpect(jsonPath("$.data[1].id").value("77"));
    }

    private static PublicContentReferenceDTO row(String type, String id, String label, String detailPath, boolean available) {
        PublicContentReferenceDTO dto = new PublicContentReferenceDTO();
        dto.setType(type);
        dto.setId(id);
        dto.setLabel(label);
        dto.setDetailPath(detailPath);
        dto.setAvailable(available);
        return dto;
    }
}
```

- [ ] **Step 2: Run failing controller tests**

```bash
cd back
mvn -Dtest=PublicContentReferenceControllerTest test
```

Expected: compile failure because `PublicContentReferenceController` does not exist.

- [ ] **Step 3: Implement controller**

```java
package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveRequestDTO;
import com.terraria.skills.service.PublicContentReferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/public/content-references")
@RequiredArgsConstructor
@Tag(name = "Public Content References", description = "Unified public references for article embeds and external callers")
public class PublicContentReferenceController {

    private final PublicContentReferenceService publicContentReferenceService;

    @GetMapping
    @Operation(summary = "Search item and NPC references")
    public ResponseEntity<ApiResponse<List<PublicContentReferenceDTO>>> searchReferences(
        @RequestParam(required = false) String types,
        @RequestParam(required = false, name = "q") String query,
        @RequestParam(defaultValue = "20") int limit
    ) {
        List<PublicContentReferenceDTO> results = publicContentReferenceService.search(parseTypes(types), normalizeText(query), limit);
        return ResponseEntity.ok(ApiResponse.success(results));
    }

    @PostMapping("/resolve")
    @Operation(summary = "Resolve article content references")
    public ResponseEntity<ApiResponse<List<PublicContentReferenceDTO>>> resolveReferences(
        @RequestBody(required = false) PublicContentReferenceResolveRequestDTO request
    ) {
        List<PublicContentReferenceDTO> results = publicContentReferenceService.resolve(request == null ? List.of() : request.getRefs());
        return ResponseEntity.ok(ApiResponse.success(results));
    }

    private Set<String> parseTypes(String types) {
        if (types == null || types.isBlank()) return Set.of();
        Set<String> parsed = new LinkedHashSet<>();
        Arrays.stream(types.split(","))
            .map(this::normalizeText)
            .filter(value -> !value.isEmpty())
            .forEach(parsed::add);
        return parsed;
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }
}
```

- [ ] **Step 4: Run backend reference tests**

```bash
cd back
mvn -Dtest=PublicContentReferenceControllerTest,PublicContentReferenceServiceImplTest test
```

Expected: tests pass.

- [ ] **Step 5: Commit task 3**

```bash
git add back/src/test/java/com/terraria/skills/controller/PublicContentReferenceControllerTest.java \
  back/src/main/java/com/terraria/skills/controller/PublicContentReferenceController.java
git commit -m "feat(api): expose public content reference endpoints"
```

## Task 4: Frontend Types And API Composable

**Files:**

- Modify: `front-nuxt/types/public-api.ts`
- Create: `front-nuxt/composables/usePublicContentReferences.ts`

- [ ] **Step 1: Add frontend public reference types**

Append near the existing public item/NPC types:

```ts
export type PublicContentReferenceType = 'item' | 'npc' | 'boss' | 'biome' | 'buff' | 'projectile' | 'armor_set'

export type PublicContentReference = {
  type?: PublicContentReferenceType | string | null
  id?: string | number | null
  label?: string | null
  name?: string | null
  internalName?: string | null
  imageUrl?: string | null
  image_url?: string | null
  categoryName?: string | null
  category_name?: string | null
  summary?: string | null
  detailPath?: string | null
  detail_path?: string | null
  available?: boolean | null
}

export type ContentReferenceSearchQuery = {
  q?: string
  types?: Array<'item' | 'npc'> | string
  limit?: number
}

export type ContentReferenceResolveInput = {
  type: 'item' | 'npc'
  id: string | number
}

export type NormalizedContentReference = {
  key: string
  type: 'item' | 'npc'
  id: string
  label: string
  name: string
  internalName: string
  imageUrl: string
  categoryName: string
  summary: string
  detailPath: string
  available: boolean
}
```

- [ ] **Step 2: Add composable**

```ts
import type {
  ContentReferenceResolveInput,
  ContentReferenceSearchQuery,
  NormalizedContentReference,
  PublicContentReference,
} from '~/types/public-api'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'

const normalizeText = (value: unknown) => String(value ?? '').trim()

const normalizeType = (value: unknown): 'item' | 'npc' | '' => {
  const type = normalizeText(value).toLowerCase()
  return type === 'item' || type === 'npc' ? type : ''
}

export const contentReferenceKey = (type: unknown, id: unknown) => {
  const normalizedType = normalizeType(type)
  const normalizedId = normalizeText(id)
  return normalizedType && normalizedId ? `${normalizedType}:${normalizedId}` : ''
}

export const normalizeContentReference = (raw: PublicContentReference): NormalizedContentReference | null => {
  const type = normalizeType(raw.type)
  const id = normalizeText(raw.id)
  if (!type || !id) return null
  const label = normalizeText(raw.label) || `${type} #${id}`
  const detailPath = normalizeText(raw.detailPath ?? raw.detail_path) || (type === 'item' ? `/items/${id}` : `/npcs/${id}`)

  return {
    key: `${type}:${id}`,
    type,
    id,
    label,
    name: normalizeText(raw.name),
    internalName: normalizeText(raw.internalName),
    imageUrl: resolvePreviewImageUrl(normalizeText(raw.imageUrl ?? raw.image_url)),
    categoryName: normalizeText(raw.categoryName ?? raw.category_name),
    summary: normalizeText(raw.summary),
    detailPath,
    available: raw.available !== false,
  }
}

export const searchPublicContentReferences = async (
  query: ContentReferenceSearchQuery = {},
): Promise<NormalizedContentReference[]> => {
  const q = normalizeText(query.q)
  if (!q) return []
  const types = Array.isArray(query.types) ? query.types.join(',') : normalizeText(query.types) || 'item,npc'
  const response = await usePublicApiFetch<PublicContentReference[]>('/public/content-references', {
    query: {
      q,
      types,
      limit: query.limit ?? 20,
    },
  })
  return (unwrapApiResponse(response) || [])
    .map(normalizeContentReference)
    .filter((item): item is NormalizedContentReference => Boolean(item))
}

export const resolvePublicContentReferences = async (
  refs: ContentReferenceResolveInput[],
): Promise<Record<string, NormalizedContentReference>> => {
  const deduped = Array.from(new Map(
    refs
      .map(ref => ({ type: normalizeType(ref.type), id: normalizeText(ref.id) }))
      .filter(ref => ref.type && ref.id)
      .map(ref => [`${ref.type}:${ref.id}`, ref]),
  ).values())

  if (!deduped.length) return {}

  const response = await usePublicApiFetch<PublicContentReference[]>('/public/content-references/resolve', {
    method: 'POST',
    body: { refs: deduped },
  })

  const resolved: Record<string, NormalizedContentReference> = {}
  for (const item of unwrapApiResponse(response) || []) {
    const normalized = normalizeContentReference(item)
    if (normalized) resolved[normalized.key] = normalized
  }
  return resolved
}
```

- [ ] **Step 3: Run frontend typecheck for the new composable**

```bash
cd front-nuxt
pnpm exec vue-tsc --noEmit
```

Expected: typecheck passes after imports resolve.

- [ ] **Step 4: Commit task 4**

```bash
git add front-nuxt/types/public-api.ts front-nuxt/composables/usePublicContentReferences.ts
git commit -m "feat(front): add content reference API client"
```

## Task 5: Editor DOM Helper And Sanitizer Contract

**Files:**

- Modify: `front-nuxt/lib/userArticleEditorDom.mjs`
- Modify: `front-nuxt/scripts/check-user-article-editor-dom.mjs`

- [ ] **Step 1: Add failing DOM helper checks**

Add imports:

```js
  buildUserArticleReferenceHtml,
  isSafeUserArticleReferenceElement,
```

Add assertions before the final `console.log`:

```js
const referenceHtml = buildUserArticleReferenceHtml({
  type: 'item',
  id: 77,
  label: '泰拉刃',
})
assertIncludes(referenceHtml, 'class="tp-content-ref"', 'reference span must include stable class')
assertIncludes(referenceHtml, 'data-tp-ref-type="item"', 'reference span must include type')
assertIncludes(referenceHtml, 'data-tp-ref-id="77"', 'reference span must include id')
assertIncludes(referenceHtml, 'data-tp-ref-label="泰拉刃"', 'reference span must include label')
assertIncludes(referenceHtml, '>泰拉刃</span>', 'reference span text must be the label')

assert.equal(isSafeUserArticleReferenceElement({ type: 'npc', id: '1', label: '向导' }), true)
assert.equal(isSafeUserArticleReferenceElement({ type: 'boss', id: '1', label: '克苏鲁之眼' }), false)
assert.equal(isSafeUserArticleReferenceElement({ type: 'item', id: 'bad id', label: '坏引用' }), false)
```

- [ ] **Step 2: Run failing DOM helper check**

```bash
cd front-nuxt
node scripts/check-user-article-editor-dom.mjs
```

Expected: import failure for missing helper exports.

- [ ] **Step 3: Implement helper exports**

```js
export const isSafeUserArticleReferenceElement = ({ type, id, label }) => {
  const nextType = String(type || '').trim().toLowerCase()
  const nextId = String(id || '').trim()
  const nextLabel = String(label || '').trim()
  return ['item', 'npc'].includes(nextType) && /^\d{1,12}$/.test(nextId) && nextLabel.length > 0 && nextLabel.length <= 80
}

export const buildUserArticleReferenceHtml = ({ type, id, label }) => {
  const nextType = String(type || '').trim().toLowerCase()
  const nextId = String(id || '').trim()
  const nextLabel = String(label || '').trim()
  if (!isSafeUserArticleReferenceElement({ type: nextType, id: nextId, label: nextLabel }) || !globalThis.document) return ''
  const span = globalThis.document.createElement('span')
  span.className = 'tp-content-ref'
  span.setAttribute('data-tp-ref-type', nextType)
  span.setAttribute('data-tp-ref-id', nextId)
  span.setAttribute('data-tp-ref-label', nextLabel)
  span.textContent = nextLabel
  return span.outerHTML
}
```

- [ ] **Step 4: Run DOM helper check**

```bash
cd front-nuxt
node scripts/check-user-article-editor-dom.mjs
```

Expected: `user article editor DOM checks passed`.

- [ ] **Step 5: Commit task 5**

```bash
git add front-nuxt/lib/userArticleEditorDom.mjs front-nuxt/scripts/check-user-article-editor-dom.mjs
git commit -m "feat(article): add safe inline reference markup helper"
```

## Task 6: Editor Inline Reference Insertion

**Files:**

- Modify: `front-nuxt/components/user/UserArticleRichEditor.vue`
- Modify: `front-nuxt/scripts/check-user-article-editor-runtime.mjs`

- [ ] **Step 1: Extend runtime check for reference markup preservation**

Inside `check-user-article-editor-runtime.mjs`, import helper source as it already does, then add this assertion block before the script writes `success`:

```js
const referenceHtml = buildUserArticleReferenceHtml({ type: 'item', id: 77, label: '泰拉刃' });
assert(referenceHtml.includes('data-tp-ref-type="item"'), 'reference helper did not build item type');
editor.innerHTML = '<p>使用 ' + referenceHtml + ' 过渡。</p>';
const ref = editor.querySelector('.tp-content-ref');
assert(ref?.getAttribute('data-tp-ref-id') === '77', 'editor reference span did not keep id');
assert(ref?.textContent === '泰拉刃', 'editor reference span did not keep label text');
```

- [ ] **Step 2: Run runtime check**

```bash
cd front-nuxt
node scripts/check-user-article-editor-runtime.mjs
```

Expected: passes after Task 5; this locks the helper behavior before component edits.

- [ ] **Step 3: Add editor state and imports**

In `UserArticleRichEditor.vue`, add `buildUserArticleReferenceHtml` to the existing import from `~/lib/userArticleEditorDom.mjs`.

Add state:

```ts
const referenceMenuOpen = ref(false)
const referenceSearchText = ref('')
const referenceSearchType = ref<'item' | 'npc' | 'all'>('all')
const referenceSearchLoading = ref(false)
const referenceSearchError = ref('')
const referenceSearchResults = ref<NormalizedContentReference[]>([])
let referenceSearchTimer: ReturnType<typeof setTimeout> | null = null
```

Add functions:

```ts
const openReferenceMenu = () => {
  if (props.disabled) return
  saveSelection()
  referenceMenuOpen.value = true
  colorMenuOpen.value = false
  linkMenuOpen.value = false
}

const closeReferenceMenu = () => {
  referenceMenuOpen.value = false
  referenceSearchError.value = ''
}

const runReferenceSearch = async () => {
  const q = referenceSearchText.value.trim()
  if (!q) {
    referenceSearchResults.value = []
    return
  }
  referenceSearchLoading.value = true
  referenceSearchError.value = ''
  try {
    referenceSearchResults.value = await searchPublicContentReferences({
      q,
      types: referenceSearchType.value === 'all' ? 'item,npc' : referenceSearchType.value,
      limit: 20,
    })
  } catch {
    referenceSearchError.value = '引用搜索失败，请稍后重试。'
  } finally {
    referenceSearchLoading.value = false
  }
}

const scheduleReferenceSearch = () => {
  if (referenceSearchTimer) clearTimeout(referenceSearchTimer)
  referenceSearchTimer = setTimeout(() => {
    void runReferenceSearch()
  }, 180)
}

watch([referenceSearchText, referenceSearchType], scheduleReferenceSearch)

const insertContentReference = (reference: NormalizedContentReference) => {
  if (props.disabled) return
  const editor = editorRef.value
  if (!editor) return
  editor.focus()
  restoreSelection()
  const range = ensureEditorRange()
  if (!range || !isEditorRange(range)) return
  const html = buildUserArticleReferenceHtml({
    type: reference.type,
    id: reference.id,
    label: reference.label,
  })
  if (!html) {
    emit('error', '引用插入失败。')
    return
  }
  const template = document.createElement('template')
  template.innerHTML = html
  const node = template.content.firstElementChild
  if (!node) return
  range.deleteContents()
  range.insertNode(node)
  setCaretAtEnd(node)
  closeReferenceMenu()
  emitEditorValue()
}
```

- [ ] **Step 4: Add toolbar button and popover**

Add a toolbar button near the link/image controls:

```vue
<div class="user-rich-editor__reference-menu">
  <button
    type="button"
    class="user-rich-editor__reference-trigger"
    title="插入资料引用"
    aria-label="插入资料引用"
    :aria-expanded="referenceMenuOpen"
    :disabled="disabled"
    @click="openReferenceMenu"
  >引用</button>
  <div v-if="referenceMenuOpen" class="user-rich-editor__reference-popover" role="dialog" aria-label="资料引用">
    <div class="user-rich-editor__reference-tabs" role="tablist">
      <button type="button" :class="{ active: referenceSearchType === 'all' }" @click="referenceSearchType = 'all'">全部</button>
      <button type="button" :class="{ active: referenceSearchType === 'item' }" @click="referenceSearchType = 'item'">物品</button>
      <button type="button" :class="{ active: referenceSearchType === 'npc' }" @click="referenceSearchType = 'npc'">NPC</button>
    </div>
    <input
      v-model="referenceSearchText"
      type="search"
      placeholder="搜索物品或 NPC"
      :disabled="disabled"
      @keydown.enter.prevent="runReferenceSearch"
    >
    <div class="user-rich-editor__reference-results">
      <button
        v-for="reference in referenceSearchResults"
        :key="reference.key"
        type="button"
        class="user-rich-editor__reference-result"
        @click="insertContentReference(reference)"
      >
        <span class="user-rich-editor__reference-thumb">{{ reference.label.slice(0, 1) }}</span>
        <span>
          <strong>{{ reference.label }}</strong>
          <small>{{ reference.summary || reference.categoryName || reference.type }}</small>
        </span>
      </button>
      <p v-if="referenceSearchLoading">搜索中...</p>
      <p v-else-if="referenceSearchError">{{ referenceSearchError }}</p>
      <p v-else-if="referenceSearchText && !referenceSearchResults.length">没有找到可引用数据。</p>
    </div>
    <button type="button" :disabled="disabled" @click="closeReferenceMenu">关闭</button>
  </div>
</div>
```

- [ ] **Step 5: Allow safe reference attributes in editor sanitizer**

In `allowedEditorAttributes`, change span:

```ts
span: new Set(['style', 'class', 'data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label']),
```

In `sanitizeEditorElement`, add before generic attribute validation removes values:

```ts
if (tagName === 'span' && attrName === 'class') {
  const safeClasses = attrValue.split(/\s+/).filter(value => value === 'tp-content-ref')
  if (safeClasses.length) element.setAttribute('class', safeClasses.join(' '))
  else element.removeAttribute(attribute.name)
  continue
}
if (tagName === 'span' && attrName.startsWith('data-tp-ref-')) {
  if (attrName === 'data-tp-ref-type' && !['item', 'npc'].includes(attrValue.trim().toLowerCase())) element.removeAttribute(attribute.name)
  if (attrName === 'data-tp-ref-id' && !/^\d{1,12}$/.test(attrValue.trim())) element.removeAttribute(attribute.name)
  if (attrName === 'data-tp-ref-label' && (!attrValue.trim() || attrValue.trim().length > 80)) element.removeAttribute(attribute.name)
  continue
}
```

- [ ] **Step 6: Run editor checks**

```bash
cd front-nuxt
node scripts/check-user-article-editor-dom.mjs
node scripts/check-user-article-editor-runtime.mjs
pnpm exec vue-tsc --noEmit
```

Expected: checks pass.

- [ ] **Step 7: Commit task 6**

```bash
git add front-nuxt/components/user/UserArticleRichEditor.vue \
  front-nuxt/scripts/check-user-article-editor-runtime.mjs
git commit -m "feat(article): insert inline item and npc references"
```

## Task 7: Public Article Reader Enhancement

**Files:**

- Modify: `front-nuxt/pages/articles/[slug].vue`
- Create: `front-nuxt/scripts/check-article-content-references.mjs`
- Modify: `front-nuxt/package.json`

- [ ] **Step 1: Create failing article reference runtime check**

```js
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  process.env.CHROMIUM_BIN,
  '/snap/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean)
const chromium = candidates.find(path => existsSync(path))

if (!chromium) {
  throw new Error('Chromium is required for article content reference checks.')
}

const tempRoot = join(root, 'tmp')
mkdirSync(tempRoot, { recursive: true })
const tempDir = mkdtempSync(join(tempRoot, 'article-ref-'))
const htmlPath = join(tempDir, 'article-ref.html')

writeFileSync(htmlPath, `<!doctype html>
<html>
  <body>
    <article id="article">
      <p>推荐 <span class="tp-content-ref" data-tp-ref-type="item" data-tp-ref-id="77" data-tp-ref-label="泰拉刃">泰拉刃</span>。</p>
    </article>
    <script>
      const ref = document.querySelector('.tp-content-ref');
      if (!ref) throw new Error('reference span missing');
      if (ref.getAttribute('data-tp-ref-type') !== 'item') throw new Error('reference type stripped');
      if (ref.getAttribute('data-tp-ref-id') !== '77') throw new Error('reference id stripped');
      ref.setAttribute('role', 'button');
      ref.setAttribute('tabindex', '0');
      ref.setAttribute('aria-label', '查看 泰拉刃');
      ref.click();
      document.body.dataset.result = ref.getAttribute('aria-label');
    </script>
  </body>
</html>`)

try {
  const output = execFileSync(chromium, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--dump-dom',
    htmlPath,
  ], { encoding: 'utf8' })
  if (!output.includes('data-result="查看 泰拉刃"')) {
    throw new Error(`article reference check failed\n${output}`)
  }
  console.log('article content reference checks passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
```

- [ ] **Step 2: Run check before page edits**

```bash
cd front-nuxt
node scripts/check-article-content-references.mjs
```

Expected: check passes as a standalone browser baseline; page-specific behavior is locked by the next typecheck/runtime checks.

- [ ] **Step 3: Allow reference attributes in article sanitizer**

In `sanitizeArticleAttributes`, allow span reference attributes:

```ts
span: ['style', 'class', 'data-tp-ref-type', 'data-tp-ref-id', 'data-tp-ref-label'],
```

Inside the attribute loop, add validation:

```ts
if (tagName === 'span' && name === 'class') {
  const safeClasses = rawValue.split(/\s+/).filter(value => value === 'tp-content-ref')
  if (!safeClasses.length) continue
  attributes.push(`class="${safeClasses.join(' ')}"`)
  continue
}
if (tagName === 'span' && name.startsWith('data-tp-ref-')) {
  const trimmed = rawValue.trim()
  if (name === 'data-tp-ref-type' && !['item', 'npc'].includes(trimmed.toLowerCase())) continue
  if (name === 'data-tp-ref-id' && !/^\d{1,12}$/.test(trimmed)) continue
  if (name === 'data-tp-ref-label' && (!trimmed || trimmed.length > 80)) continue
  attributes.push(`${name}="${escapeArticleHtml(trimmed)}"`)
  continue
}
```

- [ ] **Step 4: Add client-side reference enhancement state**

In `pages/articles/[slug].vue`, add:

```ts
const articleContentRef = ref<HTMLElement | null>(null)
const articleReferences = ref<Record<string, NormalizedContentReference>>({})
const activeArticleReference = ref<NormalizedContentReference | null>(null)
const articleReferenceError = ref('')

const collectArticleReferenceInputs = () => {
  const root = articleContentRef.value
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>('.tp-content-ref'))
    .map(node => ({
      type: node.dataset.tpRefType === 'npc' ? 'npc' as const : 'item' as const,
      id: node.dataset.tpRefId || '',
    }))
    .filter(ref => ref.id)
}

const enhanceArticleReferenceNodes = () => {
  const root = articleContentRef.value
  if (!root) return
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('.tp-content-ref'))) {
    const key = contentReferenceKey(node.dataset.tpRefType, node.dataset.tpRefId)
    const reference = key ? articleReferences.value[key] : null
    node.setAttribute('role', 'button')
    node.setAttribute('tabindex', '0')
    node.setAttribute('aria-label', reference ? `查看 ${reference.label}` : `查看 ${node.dataset.tpRefLabel || node.textContent || '引用'}`)
    if (reference?.available === false) node.dataset.tpRefMissing = 'true'
  }
}

const resolveArticleReferences = async () => {
  const refs = collectArticleReferenceInputs()
  if (!refs.length) {
    articleReferences.value = {}
    return
  }
  articleReferenceError.value = ''
  try {
    articleReferences.value = await resolvePublicContentReferences(refs)
    await nextTick()
    enhanceArticleReferenceNodes()
  } catch {
    articleReferenceError.value = '文章引用加载失败。'
  }
}

watch(sanitizedArticleHtml, async () => {
  await nextTick()
  await resolveArticleReferences()
}, { immediate: true })

const openArticleReference = (event: MouseEvent | KeyboardEvent) => {
  const target = event.target instanceof Element ? event.target.closest('.tp-content-ref') as HTMLElement | null : null
  if (!target) return
  if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  const key = contentReferenceKey(target.dataset.tpRefType, target.dataset.tpRefId)
  activeArticleReference.value = key ? articleReferences.value[key] || null : null
}
```

- [ ] **Step 5: Attach ref and event delegation in template**

Replace the article body container:

```vue
<div
  ref="articleContentRef"
  class="article-content-text"
  @click="openArticleReference"
  @keydown="openArticleReference"
  v-html="sanitizedArticleHtml"
></div>
```

Add popover near the article content:

```vue
<div v-if="activeArticleReference" class="article-reference-popover" role="dialog" aria-label="资料引用">
  <img v-if="activeArticleReference.imageUrl" :src="activeArticleReference.imageUrl" :alt="activeArticleReference.label">
  <div>
    <strong>{{ activeArticleReference.label }}</strong>
    <p>{{ activeArticleReference.summary || activeArticleReference.categoryName }}</p>
    <NuxtLink :to="activeArticleReference.detailPath">打开详情</NuxtLink>
  </div>
  <button type="button" @click="activeArticleReference = null">关闭</button>
</div>
<p v-if="articleReferenceError" class="article-reference-error">{{ articleReferenceError }}</p>
```

- [ ] **Step 6: Add styles**

Add scoped styles:

```css
.article-content-text :deep(.tp-content-ref) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 52%, var(--index-line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-gold) 14%, var(--panel));
  color: var(--accent-gold);
  line-height: 1.35;
  cursor: pointer;
  vertical-align: baseline;
}

.article-content-text :deep(.tp-content-ref[data-tp-ref-missing="true"]) {
  border-style: dashed;
  color: var(--muted);
}

.article-reference-popover {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 26%, var(--index-line));
  border-radius: 8px;
  background: var(--index-surface);
}

.article-reference-popover img {
  width: 44px;
  height: 44px;
  object-fit: contain;
}

.article-reference-error {
  color: var(--danger);
}
```

- [ ] **Step 7: Add package check script**

In `front-nuxt/package.json`:

```json
"check:article-content-references": "node scripts/check-article-content-references.mjs"
```

Add it to `check` after `check:user-article-editor-runtime`.

- [ ] **Step 8: Run article and frontend checks**

```bash
cd front-nuxt
node scripts/check-article-content-references.mjs
pnpm run check:user-article-editor
pnpm run check:user-article-editor-runtime
pnpm exec vue-tsc --noEmit
```

Expected: checks pass.

- [ ] **Step 9: Commit task 7**

```bash
git add front-nuxt/pages/articles/[slug].vue \
  front-nuxt/scripts/check-article-content-references.mjs \
  front-nuxt/package.json
git commit -m "feat(article): render inline content references"
```

## Task 8: End-To-End Validation

**Files:**

- No new files.

- [ ] **Step 1: Run backend focused tests**

```bash
cd back
mvn -Dtest=PublicContentReferenceControllerTest,PublicContentReferenceServiceImplTest,PublicItemControllerTest,PublicNpcAggregateControllerTest test
```

Expected: all selected tests pass.

- [ ] **Step 2: Run frontend focused checks**

```bash
cd front-nuxt
pnpm run check:user-article-editor
pnpm run check:user-article-editor-runtime
pnpm run check:article-content-references
pnpm exec vue-tsc --noEmit
```

Expected: all selected checks pass.

- [ ] **Step 3: Optional local stack smoke**

Run only if the local stack is not being used by another task:

```bash
bash ./scripts/dev/start-local-stack.sh
```

Manual smoke:

```bash
curl 'http://localhost:8080/api/public/content-references?types=item,npc&q=%E5%90%91%E5%AF%BC&limit=5'
curl -X POST 'http://localhost:8080/api/public/content-references/resolve' \
  -H 'Content-Type: application/json' \
  -d '{"refs":[{"type":"npc","id":"1"},{"type":"item","id":"77"}]}'
```

Expected:

- Search returns `success: true` and `data` rows with `type`, `id`, `label`, `detailPath`.
- Resolve returns one row per requested reference in the same order.
- Article editor can insert an inline reference chip.
- Public article page shows the chip and opens the reference panel.

- [ ] **Step 4: Full quality gate when ready for merge**

```bash
bash ./scripts/dev/quality-gate.sh
```

Expected: gate passes, or failures are documented with first failing command and causal error.

## Self-Review Checklist

- API supports item/NPC now and leaves type contract extensible.
- Article source stores only `type + id + label`, not backend payload copies.
- Reader page resolves references in batch instead of calling once per span.
- Sanitizers preserve only the allowed reference class and data attributes.
- Missing references degrade to visible text and do not break article rendering.
- Frontend uses existing public API helper and existing article editor/runtime check style.
- Backend uses existing public item/NPC services and does not add database writes.
- Validation covers backend contract, frontend helper behavior, article reader enhancement, and typecheck.
