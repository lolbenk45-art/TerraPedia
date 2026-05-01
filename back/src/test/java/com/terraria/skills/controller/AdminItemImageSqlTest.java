package com.terraria.skills.controller;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminItemImageSqlTest {

    @Test
    void shouldRequireTraceableWikiMetadataForDirectItemImages() {
        String sql = AdminItemImageSql.preferredItemImageExpression("i");

        assertTrue(sql.contains("i.image LIKE '%terraria.wiki.gg%'"));
        assertTrue(sql.contains("COALESCE(i.source_provider, '') IN ('wiki_gg', 'terraria.wiki.gg', 'wiki_gg_zh_reference', 'wiki_zh')"));
        assertTrue(sql.contains("i.source_page IS NOT NULL"));
        assertTrue(sql.contains("TRIM(i.source_page) <> ''"));
    }

    @Test
    void shouldRequireTraceableWikiMetadataForItemImageFallbackRows() {
        String sql = AdminItemImageSql.preferredItemImageExpression("i");

        assertTrue(sql.contains("COALESCE(ii.provider, '') IN ('wiki_gg', 'terraria.wiki.gg')"));
        assertTrue(sql.contains("ii.source_page IS NOT NULL"));
        assertTrue(sql.contains("TRIM(ii.source_page) <> ''"));
        assertTrue(sql.contains("ii.original_url LIKE '%terraria.wiki.gg%'"));
        assertTrue(sql.contains("ii.cached_url LIKE '%terraria.wiki.gg%'"));
        assertTrue(sql.contains("CASE WHEN ii.source_revision_timestamp IS NOT NULL THEN 0 ELSE 1 END"));
    }
}
