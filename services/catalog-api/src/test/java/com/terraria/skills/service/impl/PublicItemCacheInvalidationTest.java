package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.ItemRarityDTO;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.ItemRarity;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.ItemRarityMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.ItemRarityService;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;

import java.lang.reflect.Proxy;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNull;

class PublicItemCacheInvalidationTest {

    private static final List<String> PUBLIC_ITEM_CACHE_NAMES = List.of(
        "item:public:list",
        "item:public:detail",
        "item:public:suggestions"
    );

    @Test
    void categoryWritesShouldEvictPublicItemCaches() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.register(CachingConfig.class);
            context.registerBean(CacheManager.class, PublicItemCacheInvalidationTest::cacheManager);
            context.registerBean(CategoryMapper.class, PublicItemCacheInvalidationTest::categoryMapperProxy);
            context.registerBean(CategoryManagementServiceImpl.class, () -> new CategoryManagementServiceImpl(
                context.getBean(CategoryMapper.class)
            ));
            context.refresh();

            CacheManager cacheManager = context.getBean(CacheManager.class);
            seedPublicItemCaches(cacheManager);

            CategoryDTO update = new CategoryDTO();
            update.setName("Updated weapons");
            update.setCode("WEAPON");

            context.getBean(CategoryManagementService.class).updateCategory(10L, update);

            assertPublicItemCachesCleared(cacheManager);
        }
    }

    @Test
    void rarityWritesShouldEvictPublicItemCaches() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.register(CachingConfig.class);
            context.registerBean(CacheManager.class, PublicItemCacheInvalidationTest::cacheManager);
            context.registerBean(ItemRarityMapper.class, PublicItemCacheInvalidationTest::itemRarityMapperProxy);
            context.registerBean(ItemMapper.class, PublicItemCacheInvalidationTest::itemMapperProxy);
            context.registerBean(ItemRarityServiceImpl.class, () -> new ItemRarityServiceImpl(
                context.getBean(ItemRarityMapper.class),
                context.getBean(ItemMapper.class)
            ));
            context.refresh();

            CacheManager cacheManager = context.getBean(CacheManager.class);
            seedPublicItemCaches(cacheManager);

            ItemRarityDTO update = new ItemRarityDTO();
            update.setCode("white");
            update.setDisplayNameZh("Common");
            update.setDisplayNameEn("Common");

            context.getBean(ItemRarityService.class).update(0L, update);

            assertPublicItemCachesCleared(cacheManager);
        }
    }

    @Configuration
    @EnableCaching
    static class CachingConfig {
    }

    private static CacheManager cacheManager() {
        return new ConcurrentMapCacheManager(
            "item:public:list",
            "item:public:detail",
            "item:public:suggestions",
            "item:list",
            "item:aggregate",
            "stats:overview"
        );
    }

    private static void seedPublicItemCaches(CacheManager cacheManager) {
        PUBLIC_ITEM_CACHE_NAMES.forEach(cacheName -> cacheManager.getCache(cacheName).put("stale", "value"));
    }

    private static void assertPublicItemCachesCleared(CacheManager cacheManager) {
        PUBLIC_ITEM_CACHE_NAMES.forEach(cacheName -> assertNull(cacheManager.getCache(cacheName).get("stale")));
    }

    private static CategoryMapper categoryMapperProxy() {
        return (CategoryMapper) Proxy.newProxyInstance(
            CategoryMapper.class.getClassLoader(),
            new Class<?>[]{CategoryMapper.class},
            (proxy, method, args) -> switch (method.getName()) {
                case "selectById" -> category();
                case "updateById" -> 1;
                case "selectAllCategories", "selectList" -> List.of();
                default -> defaultValue(method.getReturnType());
            }
        );
    }

    private static ItemRarityMapper itemRarityMapperProxy() {
        return (ItemRarityMapper) Proxy.newProxyInstance(
            ItemRarityMapper.class.getClassLoader(),
            new Class<?>[]{ItemRarityMapper.class},
            (proxy, method, args) -> switch (method.getName()) {
                case "selectById" -> itemRarity();
                case "selectOne" -> null;
                case "updateById" -> 1;
                default -> defaultValue(method.getReturnType());
            }
        );
    }

    private static ItemMapper itemMapperProxy() {
        return (ItemMapper) Proxy.newProxyInstance(
            ItemMapper.class.getClassLoader(),
            new Class<?>[]{ItemMapper.class},
            (proxy, method, args) -> switch (method.getName()) {
                case "selectCount" -> 0L;
                default -> defaultValue(method.getReturnType());
            }
        );
    }

    private static Category category() {
        Category category = new Category();
        category.setId(10L);
        category.setParentId(0L);
        category.setName("Weapons");
        category.setCode("WEAPON");
        category.setSort(1);
        category.setStatus(1);
        return category;
    }

    private static ItemRarity itemRarity() {
        ItemRarity rarity = new ItemRarity();
        rarity.setId(0L);
        rarity.setCode("white");
        rarity.setDisplayNameZh("Common");
        rarity.setDisplayNameEn("Common");
        rarity.setDeleted(0);
        rarity.setStatus(1);
        return rarity;
    }

    private static Object defaultValue(Class<?> returnType) {
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
}
