package com.terraria.skills.controller;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminItemImageSqlTest {

    @Test
    void shouldUseCachedItemImagesWithoutLegacyDisplayFallback() {
        String sql = AdminItemImageSql.preferredItemImageExpression("i");

        int cachedUrlDisplayIndex = sql.indexOf("THEN TRIM(ii.cached_url)");
        int legacyImageIndex = sql.indexOf("THEN TRIM(i.image)");

        assertTrue(cachedUrlDisplayIndex >= 0, "item_images.cached_url must be available as the preferred display URL");
        assertFalse(legacyImageIndex >= 0, "items.image must not be used as a display fallback");
        assertTrue(sql.contains("ii.cached_url IS NOT NULL"));
        assertTrue(sql.contains("TRIM(ii.cached_url) <> ''"));
    }

    @Test
    void shouldNotReturnOriginalWikiUrlsAsDisplayImages() {
        String sql = AdminItemImageSql.preferredItemImageExpression("i");

        assertTrue(sql.contains("ii.cached_url"));
        assertFalse(sql.contains("THEN TRIM(ii.original_url)"));
        assertFalse(sql.contains("ii.original_url LIKE '%terraria.wiki.gg%'"));
        assertFalse(sql.contains("ii.cached_url LIKE '%terraria.wiki.gg%'"));
        assertFalse(sql.contains("ii.cached_url LIKE '%/terrapedia-images/%'"));
        assertFalse(sql.contains("ii.cached_url NOT LIKE '%/terrapedia-images/%'"));
        assertFalse(sql.contains("COALESCE(ii.provider, '') IN ('wiki_gg', 'terraria.wiki.gg')"));
    }
}
