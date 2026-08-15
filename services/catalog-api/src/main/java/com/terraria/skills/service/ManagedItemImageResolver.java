package com.terraria.skills.service;

import com.terraria.skills.entity.Item;

import java.util.Collection;
import java.util.Map;

public interface ManagedItemImageResolver {

    Map<Long, String> resolveManagedImages(Collection<Item> items);

    String resolveManagedImage(Item item, Map<Long, String> managedImagesByItemId);
}
