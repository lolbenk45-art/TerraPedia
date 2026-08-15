package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.mapper.ItemCategoryRelMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.ItemService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;

import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ItemSuggestionsCachingTest {

    private final ItemMapperState itemMapperState = new ItemMapperState();
    private final CategoryState categoryState = new CategoryState();
    private AnnotationConfigApplicationContext context;
    private CacheManager cacheManager;
    private ItemService itemService;

    @BeforeEach
    void setUp() {
        itemMapperState.reset();
        context = new AnnotationConfigApplicationContext();
        context.register(CachingConfig.class);
        context.registerBean(CacheManager.class, () -> new ConcurrentMapCacheManager(
            "item:list",
            "item:public:list",
            "item:public:detail",
            "item:public:suggestions",
            "item:detail",
            "item:suggestions",
            "item:aggregate",
            "stats:overview"
        ));
        context.registerBean(ItemMapper.class, () -> itemMapperProxy(itemMapperState));
        context.registerBean(ItemCategoryRelMapper.class, this::itemCategoryRelMapperProxy);
        context.registerBean(CategoryManagementService.class, () -> categoryManagementServiceProxy(categoryState));
        context.registerBean(ItemServiceImpl.class, () -> new ItemServiceImpl(
            context.getBean(ItemMapper.class),
            context.getBean(ItemCategoryRelMapper.class),
            context.getBean(CategoryManagementService.class)
        ));
        context.refresh();
        cacheManager = context.getBean(CacheManager.class);
        cacheManager.getCache("item:suggestions").clear();
        itemService = context.getBean(ItemService.class);
    }

    @AfterEach
    void tearDown() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    void shouldCacheNormalizedSuggestionQueriesAndEvictAfterDelete() {
        List<ItemDTO> first = itemService.searchSuggestions("  Magic Missile  ", 20);
        List<ItemDTO> second = itemService.searchSuggestions("Magic Missile", 10);

        assertEquals(1, first.size());
        assertEquals(List.of("Weapons / Magic"), first.get(0).getCategoryPaths());
        assertEquals(List.of("Weapons / Magic"), second.get(0).getCategoryPaths());
        assertEquals(1, itemMapperState.selectItemSuggestionsCount());

        itemService.deleteItem(42L);
        List<ItemDTO> third = itemService.searchSuggestions("Magic Missile", 10);

        assertEquals(2, itemMapperState.selectItemSuggestionsCount());
        assertEquals(List.of("Weapons / Magic"), third.get(0).getCategoryPaths());
    }

    @Configuration
    @EnableCaching
    static class CachingConfig {
    }

    private ItemMapper itemMapperProxy(ItemMapperState state) {
        return (ItemMapper) Proxy.newProxyInstance(
            ItemMapper.class.getClassLoader(),
            new Class<?>[]{ItemMapper.class},
            (proxy, method, args) -> switch (method.getName()) {
                case "selectItemSuggestions" -> {
                    state.selectItemSuggestionsCount.incrementAndGet();
                    yield state.suggestions();
                }
                case "deleteById" -> 1;
                default -> defaultValue(method.getReturnType());
            }
        );
    }

    private ItemCategoryRelMapper itemCategoryRelMapperProxy() {
        return (ItemCategoryRelMapper) Proxy.newProxyInstance(
            ItemCategoryRelMapper.class.getClassLoader(),
            new Class<?>[]{ItemCategoryRelMapper.class},
            (proxy, method, args) -> defaultValue(method.getReturnType())
        );
    }

    private CategoryManagementService categoryManagementServiceProxy(CategoryState state) {
        return (CategoryManagementService) Proxy.newProxyInstance(
            CategoryManagementService.class.getClassLoader(),
            new Class<?>[]{CategoryManagementService.class},
            (proxy, method, args) -> switch (method.getName()) {
                case "getCategoryPathMap" -> state.categoryPathMap;
                case "getAllDescendants" -> List.of();
                case "getCategoryMap" -> Map.of();
                default -> defaultValue(method.getReturnType());
            }
        );
    }

    private Object defaultValue(Class<?> returnType) {
        if (returnType == Void.TYPE) {
            return null;
        }
        if (returnType == Boolean.TYPE) {
            return false;
        }
        if (returnType == Integer.TYPE) {
            return 0;
        }
        if (returnType == Long.TYPE) {
            return 0L;
        }
        if (returnType == Double.TYPE) {
            return 0D;
        }
        if (returnType == Float.TYPE) {
            return 0F;
        }
        if (returnType == Short.TYPE) {
            return (short) 0;
        }
        if (returnType == Byte.TYPE) {
            return (byte) 0;
        }
        if (returnType == Character.TYPE) {
            return (char) 0;
        }
        return null;
    }

    private static class ItemMapperState {
        private final AtomicInteger selectItemSuggestionsCount = new AtomicInteger();

        void reset() {
            selectItemSuggestionsCount.set(0);
        }

        int selectItemSuggestionsCount() {
            return selectItemSuggestionsCount.get();
        }

        List<ItemDTO> suggestions() {
            ItemDTO item = new ItemDTO();
            item.setId(42L);
            item.setName("Magic Missile");
            item.setCategoryId(7L);
            return List.of(item);
        }
    }

    private static class CategoryState {
        private final Map<Long, String> categoryPathMap = Map.of(7L, "Weapons / Magic");
    }
}
