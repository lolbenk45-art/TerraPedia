package com.terraria.skills.service;

import com.terraria.skills.dto.ItemGroupDTO;

import java.util.List;
import java.util.Optional;

public interface ItemGroupCanonicalService {

    enum Consumer {
        ADMIN_ITEM_GROUPS,
        ADMIN_RECIPE_GROUPS,
        RECIPE_TREE,
        RECIPE_EXPANSION
    }

    record WriteAvailability(boolean enabled, String reason) {
    }

    List<ItemGroupDTO> listGroups(Consumer consumer);

    Optional<ItemGroupDTO> findGroup(Consumer consumer, String canonicalName);

    WriteAvailability getWriteAvailability();

    ItemGroupDTO createCentralOverride(ItemGroupDTO request, String actor);

    ItemGroupDTO updateCentralOverride(String canonicalName, ItemGroupDTO request, String actor);

    void deleteCentralOverride(String canonicalName, String actor);

    void invalidateCaches();
}
