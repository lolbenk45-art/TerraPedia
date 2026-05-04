package com.terraria.skills.service.impl;

import com.terraria.skills.dto.ItemAggregateDTO;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.dto.RecipeDTO;
import com.terraria.skills.mapper.ItemCategoryRelMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.ItemImageService;
import com.terraria.skills.service.ItemService;
import com.terraria.skills.service.ItemSourceService;
import com.terraria.skills.service.RecipeService;
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

class PublicItemAggregateServiceCachingTest {

    private final AggregateState aggregateState = new AggregateState();
    private AnnotationConfigApplicationContext context;
    private CacheManager cacheManager;
    private PublicItemAggregateService aggregateService;
    private ItemService itemService;

    @BeforeEach
    void setUp() {
        aggregateState.reset();
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
        context.registerBean(ItemMapper.class, () -> itemMapperProxy(aggregateState));
        context.registerBean(ItemCategoryRelMapper.class, this::itemCategoryRelMapperProxy);
        context.registerBean(CategoryManagementService.class, () -> categoryManagementServiceProxy(aggregateState));
        context.registerBean(ItemImageService.class, () -> itemImageServiceProxy(aggregateState));
        context.registerBean(ItemSourceService.class, () -> itemSourceServiceProxy(aggregateState));
        context.registerBean(RecipeService.class, () -> recipeServiceProxy(aggregateState));
        context.registerBean(ItemServiceImpl.class, () -> new ItemServiceImpl(
            context.getBean(ItemMapper.class),
            context.getBean(ItemCategoryRelMapper.class),
            context.getBean(CategoryManagementService.class)
        ));
        context.registerBean(PublicItemAggregateService.class, () -> new PublicItemAggregateService(
            context.getBean(ItemService.class),
            context.getBean(ItemImageService.class),
            context.getBean(ItemSourceService.class),
            context.getBean(RecipeService.class)
        ));
        context.refresh();
        cacheManager = context.getBean(CacheManager.class);
        cacheManager.getCache("item:aggregate").clear();
        aggregateService = context.getBean(PublicItemAggregateService.class);
        itemService = context.getBean(ItemService.class);
    }

    @AfterEach
    void tearDown() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    void shouldCacheRepeatedAggregateReadsAndEvictAfterItemDelete() {
        ItemAggregateDTO first = aggregateService.getItemAggregate(1L, "images,sources,recipes");
        ItemAggregateDTO second = aggregateService.getItemAggregate(1L, "recipes,images,sources");

        assertEquals(1L, first.getItem().getId());
        assertEquals(1, first.getImages().size());
        assertEquals(1, first.getSources().size());
        assertEquals(1, first.getRecipes().size());
        assertEquals(1, aggregateState.itemDetailCount.get());
        assertEquals(1, aggregateState.imageCount.get());
        assertEquals(1, aggregateState.sourceCount.get());
        assertEquals(1, aggregateState.recipeCount.get());

        itemService.deleteItem(1L);
        ItemAggregateDTO third = aggregateService.getItemAggregate(1L, "images,sources,recipes");

        assertEquals(1L, second.getItem().getId());
        assertEquals(1L, third.getItem().getId());
        assertEquals(2, aggregateState.itemDetailCount.get());
        assertEquals(2, aggregateState.imageCount.get());
        assertEquals(2, aggregateState.sourceCount.get());
        assertEquals(2, aggregateState.recipeCount.get());
    }

    @Configuration
    @EnableCaching(proxyTargetClass = true)
    static class CachingConfig {
    }

    private ItemMapper itemMapperProxy(AggregateState state) {
        return (ItemMapper) Proxy.newProxyInstance(
            ItemMapper.class.getClassLoader(),
            new Class<?>[]{ItemMapper.class},
            (proxy, method, args) -> switch (method.getName()) {
                case "selectItemDetailById" -> {
                    state.itemDetailCount.incrementAndGet();
                    yield state.itemDetail();
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

    private CategoryManagementService categoryManagementServiceProxy(AggregateState state) {
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

    private ItemImageService itemImageServiceProxy(AggregateState state) {
        return (ItemImageService) Proxy.newProxyInstance(
            ItemImageService.class.getClassLoader(),
            new Class<?>[]{ItemImageService.class},
            (proxy, method, args) -> {
                state.imageCount.incrementAndGet();
                return List.of(state.image());
            }
        );
    }

    private ItemSourceService itemSourceServiceProxy(AggregateState state) {
        return (ItemSourceService) Proxy.newProxyInstance(
            ItemSourceService.class.getClassLoader(),
            new Class<?>[]{ItemSourceService.class},
            (proxy, method, args) -> {
                state.sourceCount.incrementAndGet();
                return List.of(state.source());
            }
        );
    }

    private RecipeService recipeServiceProxy(AggregateState state) {
        return (RecipeService) Proxy.newProxyInstance(
            RecipeService.class.getClassLoader(),
            new Class<?>[]{RecipeService.class},
            (proxy, method, args) -> switch (method.getName()) {
                case "getRecipesByResultItemId" -> {
                    state.recipeCount.incrementAndGet();
                    yield List.of(state.recipe());
                }
                case "replaceRecipesForResultItemId" -> List.of();
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
        return null;
    }

    private static class AggregateState {
        private final AtomicInteger itemDetailCount = new AtomicInteger();
        private final AtomicInteger imageCount = new AtomicInteger();
        private final AtomicInteger sourceCount = new AtomicInteger();
        private final AtomicInteger recipeCount = new AtomicInteger();
        private final Map<Long, String> categoryPathMap = Map.of(5L, "Weapons / Magic");

        void reset() {
            itemDetailCount.set(0);
            imageCount.set(0);
            sourceCount.set(0);
            recipeCount.set(0);
        }

        ItemDTO itemDetail() {
            ItemDTO item = new ItemDTO();
            item.setId(1L);
            item.setName("Magic Missile");
            item.setCategoryId(5L);
            return item;
        }

        ItemImageDTO image() {
            ItemImageDTO dto = new ItemImageDTO();
            dto.setId(11L);
            dto.setItemId(1L);
            dto.setCachedUrl("https://example.invalid/magic-missile.png");
            return dto;
        }

        ItemSourceDTO source() {
            ItemSourceDTO dto = new ItemSourceDTO();
            dto.setId(21L);
            dto.setItemId(1L);
            dto.setSourceType("drop");
            dto.setSourceRefName("Demon Eye");
            return dto;
        }

        RecipeDTO recipe() {
            RecipeDTO dto = new RecipeDTO();
            dto.setId(31L);
            dto.setResultItemId(1L);
            dto.setResultQuantity(1);
            return dto;
        }
    }
}
