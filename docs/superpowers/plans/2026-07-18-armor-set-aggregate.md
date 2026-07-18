# Armor Set Piece Aggregate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing public armor-set detail endpoint with optional piece effects and shallow recipe trees, then consume them without per-piece frontend requests while retaining the legacy fallback.

**Architecture:** A shared `PublicRecipeTreeFacade` owns the public recipe-tree copy and managed-image boundary. `PublicArmorSetAggregateService` decorates the unchanged base armor detail with nullable aggregate maps only when recognized include modules are requested. The Nuxt page detects aggregate fields by own-property presence inside its existing client-only async boundaries and otherwise executes the current per-piece fetchers.

**Tech Stack:** Java 17, Spring Boot MVC, Lombok, Jackson, JUnit 5, Mockito, Nuxt 3, Vue 3, TypeScript, Node contract tests, pnpm.

---

## File Map

## Source and Execution Chain

```text
projection_armor_sets
  -> PublicArmorSetService base detail
  -> PublicArmorSetAggregateService
     -> PublicItemService equipment effects
     -> RecipeTreeService cache -> PublicRecipeTreeFacade safety copy
  -> PublicArmorSetController response
  -> usePublicArmorSetDetail raw payload
  -> armor detail aggregate-or-fallback handlers
  -> ArmorBuildMatrix / ArmorRecipeTable
```

Execution is serialized by default because Tasks 2–5 share controller and
page contracts. If the user selects subagent-driven execution, use one fresh
implementer per task in sequence; only the coordinator edits the plan,
`docs/devlog/current.md`, or the active entry. No task writes data or controls
service lifecycle in parallel.

If implementation discovers a real signature, serializer, or runtime mismatch,
record the gap in the active devlog, patch this plan with the smallest concrete
repair, re-run the affected plan-audit gates, and continue. Stop only when the
gap makes the approved contract unsafe or impossible.

### Backend public recipe boundary

- Create `back/src/main/java/com/terraria/skills/service/PublicRecipeTreeFacade.java`: fetch, deep-copy, sanitize, and log public recipe-tree responses.
- Create `back/src/test/java/com/terraria/skills/service/PublicRecipeTreeFacadeTest.java`: prove delegation, recursive sanitization, and cached-source immutability.
- Modify `back/src/main/java/com/terraria/skills/controller/PublicItemRecipeController.java`: delegate recipe-tree publication to the facade.
- Modify `back/src/test/java/com/terraria/skills/controller/PublicItemRecipeControllerTest.java`: mock the facade while preserving response assertions.

### Backend armor aggregation

- Create `back/src/main/java/com/terraria/skills/dto/PublicArmorSetDetailDTO.java`: optional detail-only maps.
- Create `back/src/main/java/com/terraria/skills/service/impl/PublicArmorSetAggregateService.java`: include parsing, item-ID deduplication, module orchestration, and per-piece degradation.
- Create `back/src/test/java/com/terraria/skills/service/impl/PublicArmorSetAggregateServiceTest.java`: service contract and failure isolation.
- Modify `back/src/main/java/com/terraria/skills/controller/PublicArmorSetController.java`: accept `include` and use the aggregate service for detail reads.
- Modify `back/src/test/java/com/terraria/skills/controller/PublicArmorSetControllerTest.java`: JSON compatibility and include routing.

### Frontend consumption

- Modify `front-nuxt/types/public-api.ts`: describe optional aggregate maps.
- Modify `front-nuxt/composables/usePublicArmorSetDetail.ts`: request both modules in the base detail request.
- Modify `front-nuxt/pages/armor-sets/[id].vue`: normalize aggregate maps inside existing `server: false` handlers and preserve legacy fetchers.
- Create `front-nuxt/utils/armorSetAggregate.mjs`: execute an aggregate callback when a field is present and otherwise execute the legacy callback.
- Create `front-nuxt/scripts/check-armor-aggregate-contract.mjs`: lock include, field-presence, normalization, and fallback ownership.
- Modify `front-nuxt/package.json`: add the new contract to `pnpm run check`.

### Traceability

- Modify `docs/devlog/entries/2026-07-18-armor-set-aggregate.md`: record implementation, validation, review, and residual risk.
- Modify `docs/devlog/current.md`: keep the active handoff current and close it only after all gates pass.

## Task 1: Establish the isolated baseline

**Files:**

- Read: `docs/devlog/current.md`
- Read: `docs/devlog/entries/2026-07-18-armor-set-aggregate.md`
- Read: `docs/superpowers/specs/2026-07-18-armor-set-aggregate-design.md`

- [ ] **Step 1: Verify branch and worktree scope**

Run:

```bash
git status --short --branch -uall
git branch -vv --list feat/front-p1-wp10-armor-aggregate refactor/front-p1-tail main
```

Expected: current branch is `feat/front-p1-wp10-armor-aggregate`, the worktree is clean, and its first parent is the approved design commit on top of `cbca943`.

- [ ] **Step 2: Install frontend dependencies in this worktree**

Run:

```bash
cd front-nuxt
pnpm install
```

Expected: exit 0 and a worktree-local `node_modules` is available through pnpm links. Do not edit the lockfile unless pnpm reports that the committed lockfile and manifest disagree; stop if it does.

- [ ] **Step 3: Run the backend baseline tests**

Run:

```bash
cd back
mvn -Dtest=PublicArmorSetControllerTest,PublicItemRecipeControllerTest test
```

Expected: both existing controller test classes pass before production changes. If they fail, stop and report the baseline rather than editing around it.

- [ ] **Step 4: Run the frontend baseline gate**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected: exit 0, consistent with the `cbca943` handoff. Record warnings separately from failures.

## Task 2: Extract the shared public recipe-tree facade

**Files:**

- Create: `back/src/test/java/com/terraria/skills/service/PublicRecipeTreeFacadeTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/PublicRecipeTreeFacade.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicItemRecipeController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicItemRecipeControllerTest.java`

- [ ] **Step 1: Write the failing facade tests**

Create `PublicRecipeTreeFacadeTest.java` with this complete test class:

```java
package com.terraria.skills.service;

import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.dto.RecipeTreeItemDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicRecipeTreeFacadeTest {

    private static final ManagedImageUrlPolicy POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("/terrapedia-images/items/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("/terrapedia-images/items/");
        }
    };

    @Mock
    private RecipeTreeService recipeTreeService;

    @Test
    void shouldCopyAndRecursivelyStripNonManagedImagesWithoutMutatingSource() {
        RecipeTreeItemDTO item = new RecipeTreeItemDTO();
        item.setId(1327L);
        item.setImage("https://terraria.wiki.gg/Solar_Helmet.png");

        RecipeGroupMemberDTO member = new RecipeGroupMemberDTO();
        member.setImage("https://terraria.wiki.gg/Fragment.png");
        RecipeTreeStationDTO station = new RecipeTreeStationDTO();
        station.setStationImage("https://static.wikia.nocookie.net/Ancient-Manipulator.png");

        RecipeTreeNodeDTO child = new RecipeTreeNodeDTO();
        child.setItemId(3458L);
        child.setItemImage("/terrapedia-images/items/solar-fragment.png");
        RecipeTreeNodeDTO root = new RecipeTreeNodeDTO();
        root.setItemId(1327L);
        root.setItemImage("https://terraria.wiki.gg/Solar_Helmet.png");
        root.setGroupMembers(List.of(member));
        root.setStations(List.of(station));
        root.setChildren(List.of(child));

        RecipeTreeVariantDTO variant = new RecipeTreeVariantDTO();
        variant.setRoots(List.of(root));
        RecipeTreeResponseDTO source = new RecipeTreeResponseDTO();
        source.setItem(item);
        source.setVariants(List.of(variant));
        when(recipeTreeService.getRecipeTreeByItemId(1327L, 1)).thenReturn(source);

        PublicRecipeTreeFacade facade = new PublicRecipeTreeFacade(recipeTreeService, POLICY);
        RecipeTreeResponseDTO result = facade.getPublicRecipeTree(1327L, 1);

        assertNull(result.getItem().getImage());
        assertNull(result.getVariants().get(0).getRoots().get(0).getItemImage());
        assertNull(result.getVariants().get(0).getRoots().get(0).getGroupMembers().get(0).getImage());
        assertNull(result.getVariants().get(0).getRoots().get(0).getStations().get(0).getStationImage());
        assertEquals("/terrapedia-images/items/solar-fragment.png",
            result.getVariants().get(0).getRoots().get(0).getChildren().get(0).getItemImage());
        assertEquals("https://terraria.wiki.gg/Solar_Helmet.png", source.getItem().getImage());
        assertEquals("https://terraria.wiki.gg/Solar_Helmet.png", root.getItemImage());
        assertEquals("https://terraria.wiki.gg/Fragment.png", member.getImage());
        assertEquals("https://static.wikia.nocookie.net/Ancient-Manipulator.png", station.getStationImage());
        verify(recipeTreeService).getRecipeTreeByItemId(1327L, 1);
    }

    @Test
    void shouldReturnNullWhenInternalTreeIsNull() {
        when(recipeTreeService.getRecipeTreeByItemId(99L, 1)).thenReturn(null);

        PublicRecipeTreeFacade facade = new PublicRecipeTreeFacade(recipeTreeService, POLICY);

        assertNull(facade.getPublicRecipeTree(99L, 1));
        verify(recipeTreeService).getRecipeTreeByItemId(99L, 1);
    }
}
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
cd back
mvn -Dtest=PublicRecipeTreeFacadeTest test
```

Expected: compilation fails because `PublicRecipeTreeFacade` does not exist.

- [ ] **Step 3: Implement the facade**

Create `PublicRecipeTreeFacade.java`:

```java
package com.terraria.skills.service;

import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.dto.RecipeTreeMetaDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class PublicRecipeTreeFacade {

    private final RecipeTreeService recipeTreeService;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;

    public RecipeTreeResponseDTO getPublicRecipeTree(Long itemId, int maxDepth) {
        RecipeTreeResponseDTO response = copyTree(recipeTreeService.getRecipeTreeByItemId(itemId, maxDepth));
        int strippedCount = keepOnlyManagedImages(response);
        if (strippedCount > 0) {
            log.warn("public item recipe tree stripped non-managed image(s) itemId={} strippedCount={}", itemId, strippedCount);
        }
        return response;
    }

    private RecipeTreeResponseDTO copyTree(RecipeTreeResponseDTO source) {
        if (source == null) {
            return null;
        }
        RecipeTreeResponseDTO target = new RecipeTreeResponseDTO();
        if (source.getItem() != null) {
            target.setItem(new com.terraria.skills.dto.RecipeTreeItemDTO());
            BeanUtils.copyProperties(source.getItem(), target.getItem());
        }
        if (source.getTreeMeta() != null) {
            RecipeTreeMetaDTO meta = new RecipeTreeMetaDTO();
            BeanUtils.copyProperties(source.getTreeMeta(), meta);
            target.setTreeMeta(meta);
        }
        List<RecipeTreeVariantDTO> variants = new ArrayList<>();
        for (RecipeTreeVariantDTO variant : safe(source.getVariants())) {
            variants.add(copyVariant(variant));
        }
        target.setVariants(variants);
        return target;
    }

    private RecipeTreeVariantDTO copyVariant(RecipeTreeVariantDTO source) {
        RecipeTreeVariantDTO target = new RecipeTreeVariantDTO();
        BeanUtils.copyProperties(source, target, "roots");
        List<RecipeTreeNodeDTO> roots = new ArrayList<>();
        for (RecipeTreeNodeDTO root : safe(source.getRoots())) {
            roots.add(copyNode(root));
        }
        target.setRoots(roots);
        return target;
    }

    private RecipeTreeNodeDTO copyNode(RecipeTreeNodeDTO source) {
        RecipeTreeNodeDTO target = new RecipeTreeNodeDTO();
        BeanUtils.copyProperties(source, target, "groupMembers", "stations", "children");
        List<RecipeGroupMemberDTO> groupMembers = new ArrayList<>();
        for (RecipeGroupMemberDTO member : safe(source.getGroupMembers())) {
            RecipeGroupMemberDTO copied = new RecipeGroupMemberDTO();
            BeanUtils.copyProperties(member, copied);
            groupMembers.add(copied);
        }
        target.setGroupMembers(groupMembers);
        List<RecipeTreeStationDTO> stations = new ArrayList<>();
        for (RecipeTreeStationDTO station : safe(source.getStations())) {
            RecipeTreeStationDTO copied = new RecipeTreeStationDTO();
            BeanUtils.copyProperties(station, copied);
            stations.add(copied);
        }
        target.setStations(stations);
        List<RecipeTreeNodeDTO> children = new ArrayList<>();
        for (RecipeTreeNodeDTO child : safe(source.getChildren())) {
            children.add(copyNode(child));
        }
        target.setChildren(children);
        return target;
    }

    private int keepOnlyManagedImages(RecipeTreeResponseDTO response) {
        if (response == null) {
            return 0;
        }
        int stripped = 0;
        if (response.getItem() != null) {
            String managedImage = managedImageUrl(response.getItem().getImage());
            if (response.getItem().getImage() != null && managedImage == null) {
                stripped += 1;
            }
            response.getItem().setImage(managedImage);
        }
        for (RecipeTreeVariantDTO variant : safe(response.getVariants())) {
            for (RecipeTreeNodeDTO root : safe(variant.getRoots())) {
                stripped += keepOnlyManagedImages(root);
            }
        }
        return stripped;
    }

    private int keepOnlyManagedImages(RecipeTreeNodeDTO node) {
        int stripped = 0;
        String managedItemImage = managedImageUrl(node.getItemImage());
        if (node.getItemImage() != null && managedItemImage == null) {
            stripped += 1;
        }
        node.setItemImage(managedItemImage);
        for (RecipeGroupMemberDTO member : safe(node.getGroupMembers())) {
            String managedImage = managedImageUrl(member.getImage());
            if (member.getImage() != null && managedImage == null) {
                stripped += 1;
            }
            member.setImage(managedImage);
        }
        for (RecipeTreeStationDTO station : safe(node.getStations())) {
            String managedImage = managedImageUrl(station.getStationImage());
            if (station.getStationImage() != null && managedImage == null) {
                stripped += 1;
            }
            station.setStationImage(managedImage);
        }
        for (RecipeTreeNodeDTO child : safe(node.getChildren())) {
            stripped += keepOnlyManagedImages(child);
        }
        return stripped;
    }

    private String managedImageUrl(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return managedImageUrlPolicy.normalizeManagedImagePath(value.trim()).orElse(null);
    }

    private static <T> List<T> safe(List<T> values) {
        return values == null ? List.of() : values;
    }
}
```

- [ ] **Step 4: Rewire the item recipe controller**

In `PublicItemRecipeController.java`, replace the `RecipeTreeService` and
`ManagedImageUrlPolicy` fields with:

```java
private final PublicRecipeTreeFacade publicRecipeTreeFacade;
private final RecipeService recipeService;
```

Replace the recipe-tree method body with:

```java
RecipeTreeResponseDTO response = publicRecipeTreeFacade.getPublicRecipeTree(itemId, maxDepth);
return ResponseEntity.ok(ApiResponse.success(response));
```

Remove the controller-local copy/sanitize methods and their now-unused imports.

In `PublicItemRecipeControllerTest.java`, replace the `RecipeTreeService` mock
and policy fixture with:

```java
import com.terraria.skills.service.PublicRecipeTreeFacade;

@Mock
private PublicRecipeTreeFacade publicRecipeTreeFacade;
```

Construct the controller with:

```java
new PublicItemRecipeController(publicRecipeTreeFacade, recipeService)
```

Stub and verify:

```java
item.setImage(null);
root.setItemImage(null);
groupMember.setImage(null);
treeStation.setStationImage(null);
fakeManagedPathChild.setItemImage(null);
when(publicRecipeTreeFacade.getPublicRecipeTree(1L, 4)).thenReturn(response);
verify(publicRecipeTreeFacade).getPublicRecipeTree(1L, 4);
```

Keep the existing JSON assertions against the already-public fixture. Remove
the controller test's source-immutability assertions; the facade test now owns
that behavior and asserts the unsanitized source is unchanged.

- [ ] **Step 5: Run the focused GREEN tests**

Run:

```bash
cd back
mvn -Dtest=PublicRecipeTreeFacadeTest,PublicItemRecipeControllerTest test
```

Expected: both classes pass with zero failures and errors.

- [ ] **Step 6: Commit the shared boundary**

Run:

```bash
git add back/src/main/java/com/terraria/skills/service/PublicRecipeTreeFacade.java back/src/main/java/com/terraria/skills/controller/PublicItemRecipeController.java back/src/test/java/com/terraria/skills/service/PublicRecipeTreeFacadeTest.java back/src/test/java/com/terraria/skills/controller/PublicItemRecipeControllerTest.java
git diff --cached --check
git diff --cached --stat
git commit -m "refactor(api): share public recipe tree boundary"
```

Expected: one focused backend refactor commit.

## Task 3: Build the armor aggregation service

**Files:**

- Create: `back/src/main/java/com/terraria/skills/dto/PublicArmorSetDetailDTO.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/PublicArmorSetAggregateServiceTest.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/PublicArmorSetAggregateService.java`

- [ ] **Step 1: Write the failing aggregate-service tests**

Create `PublicArmorSetAggregateServiceTest.java` with tests covering the exact
service contract:

```java
package com.terraria.skills.service.impl;

import com.terraria.skills.dto.PublicArmorSetDetailDTO;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetRelatedItemDTO;
import com.terraria.skills.dto.PublicItemEquipmentEffectDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.service.PublicArmorSetService;
import com.terraria.skills.service.PublicItemService;
import com.terraria.skills.service.PublicRecipeTreeFacade;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicArmorSetAggregateServiceTest {

    @Mock private PublicArmorSetService armorSetService;
    @Mock private PublicItemService itemService;
    @Mock private PublicRecipeTreeFacade recipeTreeFacade;

    @Test
    void shouldReturnOriginalBaseDtoWhenNoKnownModuleIsRequested() {
        PublicArmorSetListDTO base = armorSet(20L, 22L);
        when(armorSetService.getPublicArmorSetById(20L)).thenReturn(base);
        PublicArmorSetAggregateService service = service();

        assertSame(base, service.getPublicArmorSetById(20L, "unknown,all"));
        verify(itemService, never()).getPublicItemEquipmentEffects(22L);
        verify(recipeTreeFacade, never()).getPublicRecipeTree(22L, 1);
    }

    @Test
    void shouldReturnNullWithoutCallingPieceServicesWhenArmorSetIsMissing() {
        when(armorSetService.getPublicArmorSetById(404L)).thenReturn(null);

        assertNull(service().getPublicArmorSetById(404L, "piece-effects,recipes"));
        verify(itemService, never()).getPublicItemEquipmentEffects(org.mockito.ArgumentMatchers.anyLong());
        verify(recipeTreeFacade, never()).getPublicRecipeTree(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void shouldDeduplicateIdsPreserveOrderAndIsolatePieceFailures() {
        PublicArmorSetListDTO base = armorSet(20L, 22L, 11L, 22L, null, -1L);
        PublicItemEquipmentEffectDTO effect = new PublicItemEquipmentEffectDTO();
        effect.setItemId(22L);
        RecipeTreeResponseDTO recipe = new RecipeTreeResponseDTO();
        when(armorSetService.getPublicArmorSetById(20L)).thenReturn(base);
        when(itemService.getPublicItemEquipmentEffects(22L)).thenReturn(List.of(effect));
        when(itemService.getPublicItemEquipmentEffects(11L)).thenThrow(new IllegalStateException("effect unavailable"));
        when(recipeTreeFacade.getPublicRecipeTree(22L, 1)).thenThrow(new IllegalArgumentException("item missing"));
        when(recipeTreeFacade.getPublicRecipeTree(11L, 1)).thenReturn(recipe);

        PublicArmorSetDetailDTO result = (PublicArmorSetDetailDTO) service()
            .getPublicArmorSetById(20L, " recipes,PIECE-EFFECTS,recipes ");

        assertEquals(List.of(22L, 11L), List.copyOf(result.getPieceEffects().keySet()));
        assertEquals(base.getName(), result.getName());
        assertEquals(List.of(effect), result.getPieceEffects().get(22L));
        assertEquals(List.of(), result.getPieceEffects().get(11L));
        assertEquals(List.of(11L), List.copyOf(result.getPieceRecipes().keySet()));
        assertSame(recipe, result.getPieceRecipes().get(11L));
        verify(itemService).getPublicItemEquipmentEffects(22L);
        verify(itemService).getPublicItemEquipmentEffects(11L);
        verify(recipeTreeFacade).getPublicRecipeTree(22L, 1);
        verify(recipeTreeFacade).getPublicRecipeTree(11L, 1);
    }

    @Test
    void shouldExposeRequestedEmptyMapAndSkipUnrequestedModule() {
        PublicArmorSetListDTO base = armorSet(20L);
        when(armorSetService.getPublicArmorSetById(20L)).thenReturn(base);

        PublicArmorSetDetailDTO result = (PublicArmorSetDetailDTO) service()
            .getPublicArmorSetById(20L, "piece-effects");

        assertTrue(result.getPieceEffects().isEmpty());
        assertNull(result.getPieceRecipes());
    }

    private PublicArmorSetAggregateService service() {
        return new PublicArmorSetAggregateService(armorSetService, itemService, recipeTreeFacade);
    }

    private PublicArmorSetListDTO armorSet(Long id, Long... itemIds) {
        PublicArmorSetListDTO dto = new PublicArmorSetListDTO();
        dto.setId(id);
        dto.setName("Solar Flare armor");
        dto.setRelatedItems(java.util.Arrays.stream(itemIds).map(itemId -> {
            PublicArmorSetRelatedItemDTO item = new PublicArmorSetRelatedItemDTO();
            item.setItemId(itemId);
            return item;
        }).toList());
        return dto;
    }
}
```

- [ ] **Step 2: Run the aggregate tests to verify RED**

Run:

```bash
cd back
mvn -Dtest=PublicArmorSetAggregateServiceTest test
```

Expected: compilation fails because the detail DTO and aggregate service do not exist.

- [ ] **Step 3: Create the detail DTO**

Create `PublicArmorSetDetailDTO.java`:

```java
package com.terraria.skills.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;
import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PublicArmorSetDetailDTO extends PublicArmorSetListDTO {

    private static final long serialVersionUID = 1L;

    private Map<Long, List<PublicItemEquipmentEffectDTO>> pieceEffects;
    private Map<Long, RecipeTreeResponseDTO> pieceRecipes;
}
```

- [ ] **Step 4: Implement the aggregate service**

Create `PublicArmorSetAggregateService.java`:

```java
package com.terraria.skills.service.impl;

import com.terraria.skills.dto.PublicArmorSetDetailDTO;
import com.terraria.skills.dto.PublicArmorSetListDTO;
import com.terraria.skills.dto.PublicArmorSetRelatedItemDTO;
import com.terraria.skills.dto.PublicItemEquipmentEffectDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.service.PublicArmorSetService;
import com.terraria.skills.service.PublicItemService;
import com.terraria.skills.service.PublicRecipeTreeFacade;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class PublicArmorSetAggregateService {

    private static final String MODULE_PIECE_EFFECTS = "piece-effects";
    private static final String MODULE_RECIPES = "recipes";

    private final PublicArmorSetService armorSetService;
    private final PublicItemService itemService;
    private final PublicRecipeTreeFacade recipeTreeFacade;

    public PublicArmorSetListDTO getPublicArmorSetById(Long id, String include) {
        PublicArmorSetListDTO base = armorSetService.getPublicArmorSetById(id);
        if (base == null) {
            return null;
        }
        Set<String> modules = parseModules(include);
        if (modules.isEmpty()) {
            return base;
        }

        PublicArmorSetDetailDTO detail = new PublicArmorSetDetailDTO();
        BeanUtils.copyProperties(base, detail);
        List<Long> itemIds = relatedItemIds(base);
        if (modules.contains(MODULE_PIECE_EFFECTS)) {
            detail.setPieceEffects(loadPieceEffects(base.getId(), itemIds));
        }
        if (modules.contains(MODULE_RECIPES)) {
            detail.setPieceRecipes(loadPieceRecipes(base.getId(), itemIds));
        }
        return detail;
    }

    private Set<String> parseModules(String include) {
        Set<String> modules = new LinkedHashSet<>();
        if (include == null || include.isBlank()) {
            return modules;
        }
        Arrays.stream(include.split(","))
            .map(value -> value.trim().toLowerCase(Locale.ROOT))
            .filter(value -> MODULE_PIECE_EFFECTS.equals(value) || MODULE_RECIPES.equals(value))
            .forEach(modules::add);
        return modules;
    }

    private List<Long> relatedItemIds(PublicArmorSetListDTO base) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (PublicArmorSetRelatedItemDTO item : safe(base.getRelatedItems())) {
            Long itemId = item == null ? null : item.getItemId();
            if (itemId != null && itemId > 0) {
                ids.add(itemId);
            }
        }
        return List.copyOf(ids);
    }

    private Map<Long, List<PublicItemEquipmentEffectDTO>> loadPieceEffects(Long armorSetId, List<Long> itemIds) {
        Map<Long, List<PublicItemEquipmentEffectDTO>> result = new LinkedHashMap<>();
        for (Long itemId : itemIds) {
            try {
                List<PublicItemEquipmentEffectDTO> effects = itemService.getPublicItemEquipmentEffects(itemId);
                result.put(itemId, effects == null ? List.of() : effects);
            } catch (RuntimeException exception) {
                log.warn("public armor set piece module degraded armorSetId={} itemId={} module={}",
                    armorSetId, itemId, MODULE_PIECE_EFFECTS, exception);
                result.put(itemId, List.of());
            }
        }
        return result;
    }

    private Map<Long, RecipeTreeResponseDTO> loadPieceRecipes(Long armorSetId, List<Long> itemIds) {
        Map<Long, RecipeTreeResponseDTO> result = new LinkedHashMap<>();
        for (Long itemId : itemIds) {
            try {
                RecipeTreeResponseDTO recipe = recipeTreeFacade.getPublicRecipeTree(itemId, 1);
                if (recipe != null) {
                    result.put(itemId, recipe);
                }
            } catch (RuntimeException exception) {
                log.warn("public armor set piece module degraded armorSetId={} itemId={} module={}",
                    armorSetId, itemId, MODULE_RECIPES, exception);
            }
        }
        return result;
    }

    private static <T> List<T> safe(List<T> values) {
        return values == null ? List.of() : values;
    }
}
```

- [ ] **Step 5: Run the aggregate tests to verify GREEN**

Run:

```bash
cd back
mvn -Dtest=PublicArmorSetAggregateServiceTest test
```

Expected: all aggregate-service tests pass.

- [ ] **Step 6: Commit the aggregate service**

Run:

```bash
git add back/src/main/java/com/terraria/skills/dto/PublicArmorSetDetailDTO.java back/src/main/java/com/terraria/skills/service/impl/PublicArmorSetAggregateService.java back/src/test/java/com/terraria/skills/service/impl/PublicArmorSetAggregateServiceTest.java
git diff --cached --check
git diff --cached --stat
git commit -m "feat(api): aggregate armor piece detail modules"
```

Expected: one focused service/DTO commit.

## Task 4: Expose the optional include contract

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/PublicArmorSetController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicArmorSetControllerTest.java`

- [ ] **Step 1: Add failing controller tests**

Add a `PublicArmorSetAggregateService` mock, construct the controller with both
services, and make the existing detail test stub the aggregate service:

```java
import com.terraria.skills.dto.PublicArmorSetDetailDTO;
import com.terraria.skills.dto.PublicItemEquipmentEffectDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.service.impl.PublicArmorSetAggregateService;

@Mock
private PublicArmorSetAggregateService publicArmorSetAggregateService;

PublicArmorSetController controller = new PublicArmorSetController(
    publicArmorSetService,
    publicArmorSetAggregateService
);

when(publicArmorSetAggregateService.getPublicArmorSetById(20L, null)).thenReturn(armorSet);
```

Replace the old detail-service verification with:

```java
verify(publicArmorSetAggregateService).getPublicArmorSetById(20L, null);
verify(publicArmorSetService, never()).getPublicArmorSetById(20L);
```

Add these assertions to the no-include detail request:

```java
.andExpect(jsonPath("$.data.pieceEffects").doesNotExist())
.andExpect(jsonPath("$.data.pieceRecipes").doesNotExist());
```

Add a combined-include test using this response setup:

```java
PublicArmorSetDetailDTO detail = new PublicArmorSetDetailDTO();
detail.setId(20L);
PublicItemEquipmentEffectDTO effect = new PublicItemEquipmentEffectDTO();
effect.setItemId(1327L);
RecipeTreeResponseDTO recipe = new RecipeTreeResponseDTO();
detail.setPieceEffects(java.util.Map.of(1327L, List.of(effect)));
detail.setPieceRecipes(java.util.Map.of(1327L, recipe));
when(publicArmorSetAggregateService.getPublicArmorSetById(20L, "piece-effects,recipes"))
    .thenReturn(detail);
```

Perform the request and assert:

```java
mockMvc.perform(get("/public/armor-sets/20")
        .param("include", "piece-effects,recipes"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.pieceEffects.1327[0].itemId").value(1327))
    .andExpect(jsonPath("$.data.pieceRecipes.1327.variants").isArray());

verify(publicArmorSetAggregateService)
    .getPublicArmorSetById(20L, "piece-effects,recipes");
```

Add a partial-module serialization test:

```java
PublicArmorSetDetailDTO effectsOnly = new PublicArmorSetDetailDTO();
effectsOnly.setId(20L);
effectsOnly.setPieceEffects(java.util.Map.of());
when(publicArmorSetAggregateService.getPublicArmorSetById(20L, "piece-effects"))
    .thenReturn(effectsOnly);

mockMvc.perform(get("/public/armor-sets/20").param("include", "piece-effects"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.pieceEffects").isMap())
    .andExpect(jsonPath("$.data.pieceRecipes").doesNotExist());
```

Add an unknown-module compatibility test:

```java
PublicArmorSetListDTO base = new PublicArmorSetListDTO();
base.setId(20L);
when(publicArmorSetAggregateService.getPublicArmorSetById(20L, "unknown"))
    .thenReturn(base);

mockMvc.perform(get("/public/armor-sets/20").param("include", "unknown"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.id").value(20))
    .andExpect(jsonPath("$.data.pieceEffects").doesNotExist())
    .andExpect(jsonPath("$.data.pieceRecipes").doesNotExist());
```

Add the missing-detail quirk test:

```java
when(publicArmorSetAggregateService.getPublicArmorSetById(404L, null)).thenReturn(null);

mockMvc.perform(get("/public/armor-sets/404"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.success").value(true))
    .andExpect(jsonPath("$.data").doesNotExist());
```

- [ ] **Step 2: Run the controller tests to verify RED**

Run:

```bash
cd back
mvn -Dtest=PublicArmorSetControllerTest test
```

Expected: compilation or verification fails because the controller does not yet accept or delegate `include`.

- [ ] **Step 3: Implement controller delegation**

Add the field:

```java
private final PublicArmorSetAggregateService publicArmorSetAggregateService;
```

Replace the detail method with:

```java
@GetMapping("/{id}")
@Operation(summary = "Get public armor set detail")
public ResponseEntity<ApiResponse<PublicArmorSetListDTO>> getPublicArmorSetDetail(
    @PathVariable Long id,
    @RequestParam(required = false) String include
) {
    PublicArmorSetListDTO armorSet = publicArmorSetAggregateService.getPublicArmorSetById(id, include);
    if (armorSet == null) {
        return ResponseEntity.ok(ApiResponse.success(null));
    }
    return ResponseEntity.ok(ApiResponse.success(armorSet));
}
```

Import `PublicArmorSetAggregateService`. Leave the list method and
`PublicArmorSetService` field unchanged.

- [ ] **Step 4: Run the complete focused backend contract**

Run:

```bash
cd back
mvn -Dtest=PublicRecipeTreeFacadeTest,PublicItemRecipeControllerTest,PublicArmorSetAggregateServiceTest,PublicArmorSetControllerTest test
```

Expected: all four classes pass with zero failures and errors.

- [ ] **Step 5: Commit the endpoint contract**

Run:

```bash
git add back/src/main/java/com/terraria/skills/controller/PublicArmorSetController.java back/src/test/java/com/terraria/skills/controller/PublicArmorSetControllerTest.java
git diff --cached --check
git diff --cached --stat
git commit -m "feat(api): expose armor set include modules"
```

Expected: one focused controller-contract commit.

## Task 5: Consume aggregate fields with legacy fallback

**Files:**

- Create: `front-nuxt/scripts/check-armor-aggregate-contract.mjs`
- Create: `front-nuxt/utils/armorSetAggregate.mjs`
- Modify: `front-nuxt/package.json`
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/usePublicArmorSetDetail.ts`
- Modify: `front-nuxt/pages/armor-sets/[id].vue`

- [ ] **Step 1: Write the failing frontend contract**

Create `check-armor-aggregate-contract.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { resolveArmorAggregateOrFallback } from '../utils/armorSetAggregate.mjs'

const typesSource = readFileSync(new URL('../types/public-api.ts', import.meta.url), 'utf8')
const detailComposableSource = readFileSync(new URL('../composables/usePublicArmorSetDetail.ts', import.meta.url), 'utf8')
const armorDetailSource = readFileSync(new URL('../pages/armor-sets/[id].vue', import.meta.url), 'utf8')

assert.match(typesSource, /pieceEffects\?: Record<string, PublicItemEquipmentEffect\[\] \| null> \| null/)
assert.match(typesSource, /pieceRecipes\?: Record<string, PublicItemRecipeTree \| null> \| null/)
assert.match(detailComposableSource, /include:\s*'piece-effects,recipes'/)
assert.match(armorDetailSource, /Object\.prototype\.hasOwnProperty\.call\(\s*armorRaw\.value \?\? \{\},\s*'pieceEffects'/)
assert.match(armorDetailSource, /Object\.prototype\.hasOwnProperty\.call\(\s*armorRaw\.value \?\? \{\},\s*'pieceRecipes'/)
assert.match(armorDetailSource, /field:\s*'pieceEffects'/)
assert.match(armorDetailSource, /field:\s*'pieceRecipes'/)
assert.ok(armorDetailSource.includes('/equipment-effects'), 'piece effects must retain the legacy endpoint fallback')
assert.ok(armorDetailSource.includes('/recipe-tree'), 'piece recipes must retain the legacy endpoint fallback')
assert.match(armorDetailSource, /armorUniqueItemKey\(item\)/, 'aggregate effects must preserve build-record keys')
assert.match(armorDetailSource, /armorBuildRecipeSummary\(item, tree\)/, 'aggregate recipes must reuse the existing display normalizer')

let aggregateCalls = 0
let fallbackCalls = 0
const aggregateResult = await resolveArmorAggregateOrFallback({
  raw: { pieceEffects: {} },
  field: 'pieceEffects',
  aggregate: () => {
    aggregateCalls += 1
    return 'aggregate'
  },
  fallback: () => {
    fallbackCalls += 1
    return 'fallback'
  },
})
assert.equal(aggregateResult, 'aggregate')
assert.equal(aggregateCalls, 1)
assert.equal(fallbackCalls, 0, 'present empty aggregate maps must suppress legacy requests')

const fallbackResult = await resolveArmorAggregateOrFallback({
  raw: {},
  field: 'pieceEffects',
  aggregate: () => 'aggregate',
  fallback: () => {
    fallbackCalls += 1
    return 'fallback'
  },
})
assert.equal(fallbackResult, 'fallback')
assert.equal(fallbackCalls, 1, 'absent aggregate maps must execute the legacy request family')

console.log('Armor aggregate contract passed.')
```

Add this script to `front-nuxt/package.json`:

```json
"check:armor-aggregate": "node scripts/check-armor-aggregate-contract.mjs"
```

Insert `pnpm run check:armor-aggregate` immediately after
`pnpm run check:armor-builds` in the main `check` chain.

- [ ] **Step 2: Run the contract to verify RED**

Run:

```bash
cd front-nuxt
pnpm run check:armor-aggregate
```

Expected: fail on the first missing aggregate type or request marker.

- [ ] **Step 3: Implement the aggregate-or-fallback decision helper**

Create `front-nuxt/utils/armorSetAggregate.mjs`:

```js
export const hasOwnArmorAggregateField = (raw, field) => Object.prototype.hasOwnProperty.call(raw ?? {}, field)

/**
 * @template T
 * @param {{
 *   raw: object | null | undefined
 *   field: string
 *   aggregate: () => T | Promise<T>
 *   fallback: () => T | Promise<T>
 * }} options
 * @returns {Promise<T>}
 */
export const resolveArmorAggregateOrFallback = async ({ raw, field, aggregate, fallback }) => {
  return hasOwnArmorAggregateField(raw, field) ? aggregate() : fallback()
}
```

- [ ] **Step 4: Extend public API types and the detail request**

Add these fields to `PublicArmorSetListItem` after `effects`:

```ts
pieceEffects?: Record<string, PublicItemEquipmentEffect[] | null> | null
pieceRecipes?: Record<string, PublicItemRecipeTree | null> | null
```

Change the request in `fetchPublicArmorSetDetail` to:

```ts
const response = await usePublicApiFetch<PublicArmorSetListItem | null>(
  `/public/armor-sets/${normalizedId}`,
  { query: { include: 'piece-effects,recipes' } },
)
```

Do not change `normalizePublicArmorSetDetail`; it must keep returning the raw
response so the page can inspect field presence.

- [ ] **Step 5: Add aggregate effects normalization**

Add this explicit import with the other script imports:

```ts
import { resolveArmorAggregateOrFallback } from '~/utils/armorSetAggregate.mjs'
```

Immediately after `armorUniqueRelatedItems`, add:

```ts
const armorHasAggregatedPieceEffects = computed(() => Object.prototype.hasOwnProperty.call(
  armorRaw.value ?? {},
  'pieceEffects',
))
const armorPieceEffectSourceMode = computed(() => armorHasAggregatedPieceEffects.value ? 'aggregate' : 'legacy')

const aggregateArmorPieceEquipmentEffects = (items: PublicArmorSetRelatedItem[]) => {
  const aggregate = armorRaw.value?.pieceEffects ?? {}
  const result: ArmorPieceEffectRecord = {}
  for (const item of items) {
    const itemId = armorItemEffectFetchKey(item)
    if (!itemId) continue
    result[armorUniqueItemKey(item)] = asEquipmentEffects(aggregate[itemId] ?? [])
  }
  return result
}
```

Change the effects async-data handler and key to:

```ts
const { data: armorPieceEquipmentEffectsByKey } = await useAsyncData(
  () => `public-armor-set-piece-effects:${armorSetId.value || 'missing'}:${armorPieceEffectSourceMode.value}:${armorPieceEffectRequestKeys.value.join(',')}`,
  () => resolveArmorAggregateOrFallback({
    raw: armorRaw.value,
    field: 'pieceEffects',
    aggregate: () => aggregateArmorPieceEquipmentEffects(armorUniqueRelatedItems.value),
    fallback: () => fetchArmorPieceEquipmentEffects(armorUniqueRelatedItems.value),
  }),
  {
    server: false,
    watch: [armorPieceEffectRequestKeys, armorPieceEffectSourceMode],
    default: (): ArmorPieceEffectRecord => ({}),
  },
)
```

- [ ] **Step 6: Add aggregate recipe normalization**

After `armorBuildRecipeSummary`, add:

```ts
const armorHasAggregatedRecipes = computed(() => Object.prototype.hasOwnProperty.call(
  armorRaw.value ?? {},
  'pieceRecipes',
))
const armorRecipeSourceMode = computed(() => armorHasAggregatedRecipes.value ? 'aggregate' : 'legacy')

const aggregateArmorSetRecipeSummaries = (items: PublicArmorSetRelatedItem[]) => {
  const aggregate = armorRaw.value?.pieceRecipes ?? {}
  return items.map((item) => {
    const itemId = armorRecipeItemId(item)
    if (!itemId) return null
    const tree = aggregate[itemId]
    return armorBuildRecipeSummary(item, tree)
  }).filter((entry): entry is ArmorSetRecipeSummary => Boolean(entry))
}
```

Change the recipe async-data handler and key to:

```ts
const { data: armorSetRecipeSummaries, pending: armorSetRecipePending } = await useAsyncData(
  () => `public-armor-set-recipes:${armorSetId.value || 'missing'}:${armorRecipeSourceMode.value}:${armorRecipeFetchKey.value}`,
  () => resolveArmorAggregateOrFallback({
    raw: armorRaw.value,
    field: 'pieceRecipes',
    aggregate: () => aggregateArmorSetRecipeSummaries(armorUniqueRecipeItems.value),
    fallback: () => fetchArmorSetRecipeSummaries(armorUniqueRecipeItems.value),
  }),
  {
    server: false,
    watch: [armorRecipeFetchKey, armorRecipeSourceMode],
    default: (): ArmorSetRecipeSummary[] => [],
  },
)
```

Keep both legacy fetch functions and both endpoint strings intact.

- [ ] **Step 7: Run focused frontend GREEN checks**

Run:

```bash
cd front-nuxt
pnpm run check:armor-aggregate
pnpm run check:armor-builds
pnpm run check:armor-stat-visuals
pnpm run check:detail-layout
pnpm exec nuxt typecheck
```

Expected: every command exits 0. The new contract proves aggregate capability
detection and legacy fallback ownership; existing contracts prove the build,
stat, and extracted presentation boundaries remain intact.

- [ ] **Step 8: Commit the frontend consumer**

Run:

```bash
git add front-nuxt/types/public-api.ts front-nuxt/composables/usePublicArmorSetDetail.ts front-nuxt/pages/armor-sets/[id].vue front-nuxt/utils/armorSetAggregate.mjs front-nuxt/scripts/check-armor-aggregate-contract.mjs front-nuxt/package.json
git diff --cached --check
git diff --cached --stat
git commit -m "fix(front): consume armor set piece aggregates"
```

Expected: one focused frontend compatibility commit.

## Task 6: Integrated verification, review, and local closeout

**Files:**

- Modify: `docs/devlog/entries/2026-07-18-armor-set-aggregate.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run the final focused backend suite from a clean test process**

Run:

```bash
cd back
mvn -Dtest=PublicRecipeTreeFacadeTest,PublicItemRecipeControllerTest,PublicArmorSetAggregateServiceTest,PublicArmorSetControllerTest test
```

Expected: zero failures and errors.

- [ ] **Step 2: Run the complete frontend gate from the beginning**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected: exit 0. Record baseline warnings without presenting them as failures.

- [ ] **Step 3: Run repository-scope checks**

Run:

```bash
git diff --check refactor/front-p1-tail...HEAD
git status --short
git log --oneline refactor/front-p1-tail..HEAD
```

Expected: no whitespace errors, no uncommitted code, and only WP-10 commits.

- [ ] **Step 4: Complete the required runtime acceptance**

Use compatible processes already serving this worktree, or obtain explicit
service-lifecycle authorization and start isolated services through the current
runbook. Set the actual URLs and choose a multi-piece armor ID from the public
list response:

```bash
export API_BASE="${API_BASE:-http://localhost:18191/api}"
export FRONT_BASE="${FRONT_BASE:-http://localhost:15177}"
export ARMOR_ID="${ARMOR_ID:-20}"
curl -fsS "$API_BASE/public/armor-sets/$ARMOR_ID?include=piece-effects,recipes" \
  | jq -e '.success == true and (.data.pieceEffects | type == "object") and (.data.pieceRecipes | type == "object")'
```

Expected: `jq` prints `true`. If ID 20 is not present or has fewer than two
unique related item IDs in the current local data, select a representative ID
from `GET $API_BASE/public/armor-sets?limit=100` and rerun with that ID.

Capture the client-navigation requests using the installed Playwright runtime:

```bash
cd front-nuxt
node --input-type=module <<'NODE'
import { chromium } from 'playwright'

const base = process.env.FRONT_BASE || 'http://localhost:15177'
const armorId = process.env.ARMOR_ID || '20'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const requests = []
const hydrationWarnings = []
page.on('request', request => {
  if (request.url().includes('/api/public/')) requests.push(request.url())
})
page.on('console', message => {
  if (/hydration/i.test(message.text())) hydrationWarnings.push(message.text())
})
await page.goto(`${base}/armor-sets`, { waitUntil: 'domcontentloaded' })
requests.length = 0
const link = page.locator(`a[href="/armor-sets/${armorId}"]`).first()
await link.click()
await page.waitForURL(`**/armor-sets/${armorId}`)
await page.waitForTimeout(2000)
const pieceRequests = requests.filter(url => /\/api\/public\/items\/\d+\/(equipment-effects|recipe-tree)/.test(url))
const armorRequests = requests.filter(url => url.includes(`/api/public/armor-sets/${armorId}`))
if (pieceRequests.length !== 0) throw new Error(`unexpected piece requests: ${pieceRequests.join(', ')}`)
if (armorRequests.length > 3) throw new Error(`armor detail requests ${armorRequests.length} > 3`)
if (hydrationWarnings.length !== 0) throw new Error(`hydration warnings: ${hydrationWarnings.join(' | ')}`)
console.log(JSON.stringify({ armorRequests: armorRequests.length, pieceRequests: 0, hydrationWarnings: 0 }))
await browser.close()
NODE
```

The Task 5 executable contract is the required field-absence simulation: it
proves a present empty map makes zero legacy-callback calls and an absent field
makes exactly one legacy-callback call. The browser smoke proves the integrated
new-backend path.
Expected:

```text
pieceEffects field: present
pieceRecipes field: present
per-piece equipment-effects requests: 0
per-piece recipe-tree requests: 0
armor-detail API requests: <= 3
hydration warnings: 0
```

If no compatible process exists and service lifecycle work is not authorized,
keep the devlog `active`, record the exact blocker, and stop before closeout.
Do not substitute source inspection for runtime evidence.

- [ ] **Step 5: Request code review and resolve every material finding**

Review the full range `refactor/front-p1-tail...HEAD` for API compatibility,
public image-policy bypasses, exception isolation, frontend field-presence
semantics, and legacy fallback preservation. Re-run the affected focused tests
after every fix. Do not close the devlog while a material finding is open.

- [ ] **Step 6: Close the devlog for a local branch handoff**

After all required gates, runtime acceptance, and review pass, update the task
entry with:

```markdown
## Status

`closed`

## Result

- Completed: optional armor piece effects/recipes aggregation, shared public
  recipe-tree safety boundary, frontend field-presence consumption, and legacy
  fallback preservation.
- Not completed: P2, push, and merge remain outside this task.

## Residual Risks

- Record the request-count, fallback, rendered-content, and hydration runtime
  evidence here.

## Follow-up

- P2 remains a separate task; no automatic merge or cleanup.

## Commits

- List the implementation commits and end with `commit SHA pending in final response`.
```

Remove the WP-10 item from `docs/devlog/current.md` Open Work and add it to
Recently Closed with `commit: pending in final response`. Preserve every
unrelated branch entry.

- [ ] **Step 7: Commit the closeout and verify the branch is clean**

Run:

```bash
git add docs/devlog/entries/2026-07-18-armor-set-aggregate.md docs/devlog/current.md
git status --short
git diff --cached --stat
git diff --cached --check
git commit -m "docs(devlog): close armor aggregate task"
git status --short --branch -uall
git branch -vv --list feat/front-p1-wp10-armor-aggregate refactor/front-p1-tail main
```

Expected: closeout commit succeeds, the worktree is clean, the task branch is
ahead of `refactor/front-p1-tail`, and neither `main` nor the base branch moved.
Do not push, merge, or remove the worktree.
