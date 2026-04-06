package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemAggregateDTO;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.service.ItemImageService;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.ItemSourceService;
import com.terraria.skills.service.RecipeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/public/items")
@RequiredArgsConstructor
@Tag(name = "Public Item Aggregate", description = "Public aggregate item detail APIs")
public class PublicItemAggregateController {

    private static final String MODULE_IMAGES = "images";
    private static final String MODULE_SOURCES = "sources";
    private static final String MODULE_RECIPES = "recipes";

    private final ItemService itemService;
    private final ItemImageService itemImageService;
    private final ItemSourceService itemSourceService;
    private final RecipeService recipeService;

    @GetMapping("/{id}/aggregate")
    @Operation(summary = "Get aggregated public item detail")
    public ResponseEntity<ApiResponse<ItemAggregateDTO>> getItemAggregate(
        @PathVariable Long id,
        @RequestParam(defaultValue = "images,sources,recipes") String include
    ) {
        var item = itemService.getItemById(id);
        if (item == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Item not found"));
        }

        Set<String> requestedModules = parseRequestedModules(include);
        ItemAggregateDTO response = new ItemAggregateDTO();
        response.setItem(item);

        if (requestedModules.contains(MODULE_IMAGES)) {
            List<ItemImageDTO> images = itemImageService.getImagesByItemId(id);
            response.setImages(images);
            response.getModuleStatus().put(MODULE_IMAGES, images.isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_IMAGES, "skipped");
        }

        if (requestedModules.contains(MODULE_SOURCES)) {
            List<ItemSourceDTO> sources = itemSourceService.getSourcesByItemId(id);
            response.setSources(sources);
            response.getModuleStatus().put(MODULE_SOURCES, sources.isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_SOURCES, "skipped");
        }

        if (requestedModules.contains(MODULE_RECIPES)) {
            List<RecipeDTO> recipes = recipeService.getRecipesByResultItemId(id);
            response.setRecipes(recipes);
            response.getModuleStatus().put(MODULE_RECIPES, recipes.isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_RECIPES, "skipped");
        }

        response.setAggregatedAt(LocalDateTime.now());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private Set<String> parseRequestedModules(String include) {
        if (include == null || include.isBlank()) {
            return Set.of(MODULE_IMAGES, MODULE_SOURCES, MODULE_RECIPES);
        }

        Set<String> modules = new LinkedHashSet<>();
        Arrays.stream(include.split(","))
            .map(value -> value == null ? "" : value.trim().toLowerCase(Locale.ROOT))
            .forEach(value -> {
                if ("all".equals(value) || MODULE_IMAGES.equals(value) || MODULE_SOURCES.equals(value) || MODULE_RECIPES.equals(value)) {
                    if ("all".equals(value)) {
                        modules.add(MODULE_IMAGES);
                        modules.add(MODULE_SOURCES);
                        modules.add(MODULE_RECIPES);
                    } else {
                        modules.add(value);
                    }
                }
            });

        if (modules.isEmpty()) {
            modules.add(MODULE_IMAGES);
            modules.add(MODULE_SOURCES);
            modules.add(MODULE_RECIPES);
        }
        return modules;
    }
}
