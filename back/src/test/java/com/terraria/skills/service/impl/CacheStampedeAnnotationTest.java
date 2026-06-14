package com.terraria.skills.service.impl;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Map;

import org.springframework.cache.annotation.Cacheable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CacheStampedeAnnotationTest {

    @Test
    void shouldEnableSyncCacheForHotItemReadMethods() throws Exception {
        Map<Method, String> methods = Map.of(
            PublicItemServiceImpl.class.getMethod("getPublicItems", com.terraria.skills.common.PageQuery.class), "getPublicItems",
            PublicItemServiceImpl.class.getMethod("getPublicItemById", Long.class), "getPublicItemById",
            PublicItemServiceImpl.class.getMethod("searchSuggestions", String.class, int.class), "publicSearchSuggestions",
            PublicItemAggregateService.class.getMethod("getItemAggregate", Long.class, String.class), "getItemAggregate",
            ItemServiceImpl.class.getMethod("getItems", com.terraria.skills.common.PageQuery.class), "getItems",
            ItemServiceImpl.class.getMethod("getItemById", Long.class), "getItemById",
            ItemServiceImpl.class.getMethod("searchSuggestions", String.class, int.class), "itemSearchSuggestions",
            PublicHomeServiceImpl.class.getMethod("getFocusItem"), "getFocusItem"
        );

        for (Map.Entry<Method, String> entry : methods.entrySet()) {
            Cacheable cacheable = entry.getKey().getAnnotation(Cacheable.class);
            assertTrue(cacheable.sync(), entry.getValue() + " should use sync cache mode");
            assertEquals("", cacheable.unless(), entry.getValue() + " must not combine sync with unless");
        }
    }
}
