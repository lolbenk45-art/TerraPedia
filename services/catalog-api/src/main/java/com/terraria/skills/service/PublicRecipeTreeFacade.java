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
        BeanUtils.copyProperties(source, target, "groupMemberNames", "groupMembers", "stations", "children");
        target.setGroupMemberNames(new ArrayList<>(safe(source.getGroupMemberNames())));
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
