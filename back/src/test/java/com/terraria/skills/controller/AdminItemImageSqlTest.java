package com.terraria.skills.controller;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminItemImageSqlTest {

    @Test
    void shouldUseMinioCachedItemImagesBeforeLegacyItemImageFallback() {
        String sql = AdminItemImageSql.preferredItemImageExpression("i");

        int cachedUrlDisplayIndex = sql.indexOf("THEN TRIM(ii.cached_url)");
        int legacyImageIndex = sql.indexOf("THEN TRIM(i.image)");

        assertTrue(cachedUrlDisplayIndex >= 0, "item_images.cached_url must be available as the preferred display URL");
        assertTrue(legacyImageIndex >= 0, "items.image must remain available as legacy fallback");
        assertTrue(cachedUrlDisplayIndex < legacyImageIndex, "MinIO cached item_images rows must be considered before items.image fallback");
        assertTrue(sql.contains("LOCATE('/terrapedia-images/', ii.cached_url) > 0 THEN 0"), "MinIO cached rows must sort first");
    }

    @Test
    void shouldKeepWikiRowsAsFallbackWithoutFilteringOutMinioCache() {
        String sql = AdminItemImageSql.preferredItemImageExpression("i");

        assertTrue(sql.contains("ii.original_url LIKE '%terraria.wiki.gg%'"));
        assertTrue(sql.contains("ii.cached_url LIKE '%terraria.wiki.gg%'"));
        assertTrue(sql.contains("ii.cached_url LIKE '%/terrapedia-images/%'"));
        assertFalse(sql.contains("ii.cached_url NOT LIKE '%/terrapedia-images/%'"));
        assertFalse(sql.contains("COALESCE(ii.provider, '') IN ('wiki_gg', 'terraria.wiki.gg')"));
    }
}
