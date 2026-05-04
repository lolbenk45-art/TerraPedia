package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.RecipeGroupMemberDTO;
import com.terraria.skills.dto.RecipeTreeNodeDTO;
import com.terraria.skills.dto.RecipeTreeResponseDTO;
import com.terraria.skills.dto.RecipeTreeStationDTO;
import com.terraria.skills.dto.RecipeTreeVariantDTO;
import com.terraria.skills.service.RecipeTreeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/public/items")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Public Item Recipes", description = "Public lightweight item recipe APIs")
public class PublicItemRecipeController {

    private final RecipeTreeService recipeTreeService;
    private static final String MANAGED_IMAGE_SEGMENT = "/terrapedia-images/";

    @GetMapping("/{id}/recipe-tree")
    @Operation(summary = "Get public grouped recipe tree for item detail")
    public ResponseEntity<ApiResponse<RecipeTreeResponseDTO>> getItemRecipeTree(
        @PathVariable("id") Long itemId,
        @RequestParam(defaultValue = "3") int maxDepth
    ) {
        RecipeTreeResponseDTO response = recipeTreeService.getRecipeTreeByItemId(itemId, maxDepth);
        RecipeTreeResponseDTO publicResponse = copyTree(response);
        int strippedCount = keepOnlyManagedImages(publicResponse);
        if (strippedCount > 0) {
            log.warn("public item recipe tree stripped non-managed image(s) itemId={} strippedCount={}", itemId, strippedCount);
        }
        return ResponseEntity.ok(ApiResponse.success(publicResponse));
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
            target.setTreeMeta(new com.terraria.skills.dto.RecipeTreeMetaDTO());
            BeanUtils.copyProperties(source.getTreeMeta(), target.getTreeMeta());
        }
        List<RecipeTreeVariantDTO> variants = new ArrayList<>();
        for (RecipeTreeVariantDTO variant : source.getVariants()) {
            variants.add(copyVariant(variant));
        }
        target.setVariants(variants);
        return target;
    }

    private RecipeTreeVariantDTO copyVariant(RecipeTreeVariantDTO source) {
        RecipeTreeVariantDTO target = new RecipeTreeVariantDTO();
        BeanUtils.copyProperties(source, target, "roots");
        List<RecipeTreeNodeDTO> roots = new ArrayList<>();
        for (RecipeTreeNodeDTO root : source.getRoots()) {
            roots.add(copyNode(root));
        }
        target.setRoots(roots);
        return target;
    }

    private RecipeTreeNodeDTO copyNode(RecipeTreeNodeDTO source) {
        RecipeTreeNodeDTO target = new RecipeTreeNodeDTO();
        BeanUtils.copyProperties(source, target, "groupMembers", "stations", "children");

        List<RecipeGroupMemberDTO> groupMembers = new ArrayList<>();
        for (RecipeGroupMemberDTO member : source.getGroupMembers()) {
            RecipeGroupMemberDTO copied = new RecipeGroupMemberDTO();
            BeanUtils.copyProperties(member, copied);
            groupMembers.add(copied);
        }
        target.setGroupMembers(groupMembers);

        List<RecipeTreeStationDTO> stations = new ArrayList<>();
        for (RecipeTreeStationDTO station : source.getStations()) {
            RecipeTreeStationDTO copied = new RecipeTreeStationDTO();
            BeanUtils.copyProperties(station, copied);
            stations.add(copied);
        }
        target.setStations(stations);

        List<RecipeTreeNodeDTO> children = new ArrayList<>();
        for (RecipeTreeNodeDTO child : source.getChildren()) {
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
        for (RecipeTreeVariantDTO variant : response.getVariants()) {
            for (RecipeTreeNodeDTO root : variant.getRoots()) {
                stripped += keepOnlyManagedImages(root);
            }
        }
        return stripped;
    }

    private int keepOnlyManagedImages(RecipeTreeNodeDTO node) {
        if (node == null) {
            return 0;
        }
        int stripped = 0;
        String managedItemImage = managedImageUrl(node.getItemImage());
        if (node.getItemImage() != null && managedItemImage == null) {
            stripped += 1;
        }
        node.setItemImage(managedItemImage);
        for (RecipeGroupMemberDTO member : node.getGroupMembers()) {
            String managedMemberImage = managedImageUrl(member.getImage());
            if (member.getImage() != null && managedMemberImage == null) {
                stripped += 1;
            }
            member.setImage(managedMemberImage);
        }
        for (RecipeTreeStationDTO station : node.getStations()) {
            String managedStationImage = managedImageUrl(station.getStationImage());
            if (station.getStationImage() != null && managedStationImage == null) {
                stripped += 1;
            }
            station.setStationImage(managedStationImage);
        }
        for (RecipeTreeNodeDTO child : node.getChildren()) {
            stripped += keepOnlyManagedImages(child);
        }
        return stripped;
    }

    private String managedImageUrl(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        String lower = trimmed.toLowerCase();
        return (lower.startsWith("http://") || lower.startsWith("https://")) && lower.contains(MANAGED_IMAGE_SEGMENT)
            ? trimmed
            : null;
    }
}
