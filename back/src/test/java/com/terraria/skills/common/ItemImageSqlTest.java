package com.terraria.skills.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ItemImageSqlTest {

    @Test
    void shouldUseManagedCachedItemImagesWithoutLegacyDisplayFallback() {
        String sql = ItemImageSql.preferredItemImageExpression("i");

        assertTrue(sql.contains("item_images ii"));
        assertTrue(sql.contains("THEN TRIM(ii.cached_url)"));
        assertTrue(sql.contains("ii.cached_url IS NOT NULL"));
        assertFalse(sql.contains("THEN TRIM(i.image)"));
        assertFalse(sql.contains("i.image AS itemImage"));
    }

    @Test
    void shouldRejectDemoAndPlacedImagesAtSharedSqlBoundary() {
        String sql = ItemImageSql.preferredItemImageExpression("i");

        assertTrue(sql.contains("demo"));
        assertTrue(sql.contains("placed"));
        assertTrue(sql.contains("ii.original_url"));
        assertTrue(sql.contains("ii.source_file_title"));
    }
}
