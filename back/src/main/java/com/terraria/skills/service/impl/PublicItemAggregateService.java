package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemAggregateDTO;
import com.terraria.skills.service.ItemImageService;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.ItemSourceService;
import com.terraria.skills.service.RecipeService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PublicItemAggregateService {

    private static final String MODULE_IMAGES = "images";
    private static final String MODULE_SOURCES = "sources";
    private static final String MODULE_RECIPES = "recipes";
    private static final List<String> MODULE_ORDER = List.of(
        MODULE_IMAGES,
        MODULE_SOURCES,
        MODULE_RECIPES
    );

    private final ItemService itemService;
    private final ItemImageService itemImageService;
    private final ItemSourceService itemSourceService;
    private final RecipeService recipeService;

    @Cacheable(cacheNames = "item:aggregate", key = "#root.target.buildCacheKey(#id, #include)", unless = "#result == null")
    public ItemAggregateDTO getItemAggregate(Long id, String include) {
        var item = itemService.getItemById(id);
        if (item == null) {
            return null;
        }

        Set<String> requestedModules = parseRequestedModules(include);
        ItemAggregateDTO response = new ItemAggregateDTO();
        response.setItem(item);

        if (requestedModules.contains(MODULE_IMAGES)) {
            response.setImages(itemImageService.getImagesByItemId(id));
            response.getModuleStatus().put(MODULE_IMAGES, response.getImages().isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_IMAGES, "skipped");
        }

        if (requestedModules.contains(MODULE_SOURCES)) {
            response.setSources(itemSourceService.getSourcesByItemId(id));
            response.getModuleStatus().put(MODULE_SOURCES, response.getSources().isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_SOURCES, "skipped");
        }

        if (requestedModules.contains(MODULE_RECIPES)) {
            response.setRecipes(recipeService.getRecipesByResultItemId(id));
            response.getModuleStatus().put(MODULE_RECIPES, response.getRecipes().isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_RECIPES, "skipped");
        }

        response.setAggregatedAt(LocalDateTime.now());
        return response;
    }

    public String buildCacheKey(Long id, String include) {
        return id + "|" + String.join(",", parseRequestedModules(include));
    }

    private Set<String> parseRequestedModules(String include) {
        if (include == null || include.isBlank()) {
            return new LinkedHashSet<>(MODULE_ORDER);
        }

        Set<String> requested = new LinkedHashSet<>();
        Arrays.stream(include.split(","))
            .map(value -> value == null ? "" : value.trim().toLowerCase(Locale.ROOT))
            .forEach(value -> {
                if ("all".equals(value) || MODULE_IMAGES.equals(value) || MODULE_SOURCES.equals(value) || MODULE_RECIPES.equals(value)) {
                    if ("all".equals(value)) {
                        requested.addAll(MODULE_ORDER);
                    } else {
                        requested.add(value);
                    }
                }
            });

        if (requested.isEmpty()) {
            requested.addAll(MODULE_ORDER);
        }

        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String module : MODULE_ORDER) {
            if (requested.contains(module)) {
                normalized.add(module);
            }
        }
        return normalized;
    }
}
