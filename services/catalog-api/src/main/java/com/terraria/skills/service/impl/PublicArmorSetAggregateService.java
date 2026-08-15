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

    private Map<Long, List<PublicItemEquipmentEffectDTO>> loadPieceEffects(
        Long armorSetId,
        List<Long> itemIds
    ) {
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
