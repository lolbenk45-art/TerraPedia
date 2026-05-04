package com.terraria.skills.service.impl;

import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ManagedItemImageResolverImplTest {

    private static final String TRUSTED_PREFIX = "https://cdn.example.com/terrapedia-images/items/";
    private static final String TRUSTED_ICON = TRUSTED_PREFIX + "night-edge.png";
    private static final String TRUSTED_PRIMARY = TRUSTED_PREFIX + "night-edge-primary.png";
    private static final String TRUSTED_FALLBACK = TRUSTED_PREFIX + "night-edge-fallback.png";
    private static final String TRUSTED_MAP = TRUSTED_PREFIX + "night-edge-map.png";
    private static final String TRUSTED_DEMO = TRUSTED_PREFIX + "night-edge-demo.png";
    private static final String TRUSTED_PLACED = TRUSTED_PREFIX + "night-edge-placed.png";
    private static final String WIKI_ICON = "https://terraria.wiki.gg/images/Night_Edge.png";
    private static final String WRONG_MINIO_ICON = "http://localhost:9000/terrapedia-images/items/night-edge.png";

    @Mock
    private ItemImageMapper itemImageMapper;

    @Mock
    private ManagedImageUrlPolicy managedImageUrlPolicy;

    @InjectMocks
    private ManagedItemImageResolverImpl resolver;

    @Test
    void shouldPreferTrustedManagedCachedUrlFromItemImages() {
        Item item = item(7L, TRUSTED_FALLBACK);
        when(itemImageMapper.selectList(any())).thenReturn(List.of(
            image(11L, 7L, WIKI_ICON, true, 0),
            image(12L, 7L, WRONG_MINIO_ICON, true, 1),
            image(13L, 7L, TRUSTED_ICON, false, 2),
            image(14L, 7L, TRUSTED_PRIMARY, true, 9)
        ));
        trustManagedPrefix();

        Map<Long, String> resolved = resolver.resolveManagedImages(List.of(item));

        assertEquals(Map.of(7L, TRUSTED_PRIMARY), resolved);
    }

    @Test
    void shouldIgnoreWikiWrongMinioAndDemoPlacedCachedUrlVariants() {
        Item item = item(7L, TRUSTED_FALLBACK);
        when(itemImageMapper.selectList(any())).thenReturn(List.of(
            image(11L, 7L, WIKI_ICON, true, 0),
            image(12L, 7L, WRONG_MINIO_ICON, true, 1),
            image(13L, 7L, TRUSTED_DEMO, true, 2),
            image(14L, 7L, TRUSTED_PLACED, true, 3)
        ));
        trustManagedPrefix();

        Map<Long, String> resolved = resolver.resolveManagedImages(List.of(item));

        assertEquals(Map.of(7L, TRUSTED_FALLBACK), resolved);
    }

    @Test
    void shouldFallbackToTrustedItemImageWhenNoUsableCachedUrlExists() {
        Item item = item(7L, "  " + TRUSTED_FALLBACK + "  ");
        when(itemImageMapper.selectList(any())).thenReturn(List.of(
            image(11L, 7L, WIKI_ICON, true, 0),
            image(12L, 7L, null, true, 1)
        ));
        trustManagedPrefix();

        Map<Long, String> resolved = resolver.resolveManagedImages(List.of(item));

        assertEquals(Map.of(7L, TRUSTED_FALLBACK), resolved);
    }

    @Test
    void shouldResolveManagedImageFromMapBeforeItemFallback() {
        Item item = item(7L, TRUSTED_FALLBACK);
        trustManagedPrefix();

        String resolved = resolver.resolveManagedImage(item, Map.of(7L, "  " + TRUSTED_MAP + "  "));

        assertEquals(TRUSTED_MAP, resolved);
    }

    @Test
    void shouldResolveManagedImageFromTrustedItemFallbackWhenMapValueIsUnusable() {
        Item item = item(7L, "  " + TRUSTED_FALLBACK + "  ");
        trustManagedPrefix();

        String resolved = resolver.resolveManagedImage(item, Map.of(7L, WIKI_ICON));

        assertEquals(TRUSTED_FALLBACK, resolved);
    }

    @Test
    void shouldReturnNullFromResolveManagedImageWhenMapAndItemImageAreUnusable() {
        Item item = item(7L, WIKI_ICON);

        String resolved = resolver.resolveManagedImage(item, Map.of(7L, WRONG_MINIO_ICON));

        assertNull(resolved);
    }

    @Test
    void shouldReturnEmptyMapAndSkipMapperWhenItemsHaveNoIds() {
        Map<Long, String> resolved = resolver.resolveManagedImages(List.of(new Item()));

        assertEquals(Map.of(), resolved);
        verify(itemImageMapper, never()).selectList(any());
    }

    private void trustManagedPrefix() {
        when(managedImageUrlPolicy.isManagedImageUrl(any()))
            .thenAnswer(invocation -> {
                String value = invocation.getArgument(0);
                return value != null && value.startsWith(TRUSTED_PREFIX);
            });
    }

    private static Item item(Long id, String image) {
        Item item = new Item();
        item.setId(id);
        item.setImage(image);
        return item;
    }

    private static ItemImage image(Long id, Long itemId, String cachedUrl, Boolean isPrimary, Integer sortOrder) {
        ItemImage image = new ItemImage();
        image.setId(id);
        image.setItemId(itemId);
        image.setCachedUrl(cachedUrl);
        image.setIsPrimary(isPrimary);
        image.setSortOrder(sortOrder);
        return image;
    }
}
