package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ItemMapperPreferredImageSqlTest {

    @Test
    void preferredItemImageSqlShouldPreferWikiUrlsAndIgnoreMinioCacheOverrides() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String preferredImageExpr = mapperXml.substring(
            mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"),
            mapperXml.indexOf("</sql>", mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"))
        );

        assertTrue(preferredImageExpr.contains("ii.original_url"), "item_images.original_url must be considered before cached_url");
        assertTrue(preferredImageExpr.contains("NOT LIKE '%/terrapedia-images/%'"), "MinIO cache URLs must be excluded from preferred item images");
        assertFalse(preferredImageExpr.contains("THEN TRIM(i.image)\r\n            ELSE COALESCE"), "MinIO items.image must not short-circuit wiki lookup");
        assertFalse(preferredImageExpr.contains("LOCATE('/terrapedia-images/', ii.cached_url) > 0 THEN 0"), "MinIO cached URLs must not sort first");
    }

    @Test
    void preferredItemImageSqlShouldRejectDemoAndPlacedWikiImages() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String preferredImageExpr = mapperXml.substring(
            mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"),
            mapperXml.indexOf("</sql>", mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"))
        );

        assertTrue(preferredImageExpr.contains("LOWER(TRIM(i.image)) NOT LIKE '%28demo%29%'"), "items.image demo URLs must be ignored");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(ii.original_url)) NOT LIKE '%28demo%29%'"), "item_images.original_url demo URLs must be ignored");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE '%28demo%29%'"), "item_images.cached_url demo URLs must be ignored");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(i.image)) NOT LIKE '%28placed%29%'"), "items.image placed URLs must be ignored");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(ii.original_url)) NOT LIKE '%28placed%29%'"), "item_images.original_url placed URLs must be ignored");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE '%28placed%29%'"), "item_images.cached_url placed URLs must be ignored");
    }

    @Test
    void preferredItemImageSqlShouldTreatDemoAndPlacedUnderscoresAsLiterals() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String preferredImageExpr = mapperXml.substring(
            mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"),
            mapperXml.indexOf("</sql>", mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"))
        );

        assertFalse(preferredImageExpr.contains("LIKE '%_demo%'"), "SQL LIKE underscore wildcard must not reject Demon_* item images");
        assertFalse(preferredImageExpr.contains("LIKE '%!_demo%'"), "Broad _demo token matching must not reject Living_Demon_* item images");
        assertFalse(preferredImageExpr.contains("LIKE '%_placed%'"), "SQL LIKE underscore wildcard must not reject valid names containing placed");
        assertFalse(preferredImageExpr.contains("LIKE '%!_placed%'"), "Broad _placed token matching must be replaced by token-aware matching");
        assertFalse(preferredImageExpr.contains("LIKE '%/placed_%'"), "SQL LIKE underscore wildcard must not reject unrelated placed-like paths");
        assertTrue(preferredImageExpr.contains("NOT REGEXP '(^|[/_[:space:]-])demo([._?&amp;#/-]|$)'"), "demo filter must be token-aware");
        assertTrue(preferredImageExpr.contains("NOT REGEXP '(^|[/_[:space:]-])placed([._?&amp;#/-]|$)'"), "placed filter must be token-aware");
    }
}
