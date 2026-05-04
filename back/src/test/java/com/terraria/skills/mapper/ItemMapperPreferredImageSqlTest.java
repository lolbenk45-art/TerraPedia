package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ItemMapperPreferredImageSqlTest {

    @Test
    void preferredItemImageSqlShouldUseOnlyManagedCachedUrlsForDisplayImages() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String preferredImageExpr = mapperXml.substring(
            mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"),
            mapperXml.indexOf("</sql>", mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"))
        );

        int cachedUrlDisplayIndex = preferredImageExpr.indexOf("THEN TRIM(ii.cached_url)");

        assertTrue(cachedUrlDisplayIndex >= 0, "item_images.cached_url must be available as the preferred display URL");
        assertFalse(preferredImageExpr.contains("THEN TRIM(ii.original_url)"), "item_images.original_url must not be exposed as a display image");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(ii.cached_url)) LIKE '%/terrapedia-images/%'"), "display images must come from managed MinIO cache URLs");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(i.image)) LIKE '%/terrapedia-images/%'"), "legacy items.image may only be exposed when already managed");
        assertFalse(preferredImageExpr.contains("TRIM(ii.cached_url) NOT LIKE '%/terrapedia-images/%'"), "MinIO cache URLs must not be excluded from item images");
        assertFalse(preferredImageExpr.contains("ii.cached_url NOT LIKE '%/terrapedia-images/%'"), "MinIO cached URLs must not be filtered out in row selection");
        assertTrue(preferredImageExpr.contains("LOCATE('/terrapedia-images/', ii.cached_url) > 0 THEN 0"), "MinIO cached URLs must sort first");
    }

    @Test
    void preferredItemImageSqlShouldRejectDemoAndPlacedWikiImages() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String preferredImageExpr = mapperXml.substring(
            mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"),
            mapperXml.indexOf("</sql>", mapperXml.indexOf("<sql id=\"PreferredItemImageExpr\">"))
        );

        assertTrue(preferredImageExpr.contains("LOWER(TRIM(i.image)) NOT LIKE '%28demo%29%'"), "items.image demo URLs must be ignored");
        assertFalse(preferredImageExpr.contains("LOWER(TRIM(ii.original_url))"), "item_images.original_url must not participate in display filtering");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE '%28demo%29%'"), "item_images.cached_url demo URLs must be ignored");
        assertTrue(preferredImageExpr.contains("LOWER(TRIM(i.image)) NOT LIKE '%28placed%29%'"), "items.image placed URLs must be ignored");
        assertFalse(preferredImageExpr.contains("LOWER(TRIM(ii.original_url))"), "item_images.original_url must not participate in display filtering");
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

    @Test
    void pagedItemListShouldUseDedicatedLightweightCountSql() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));

        assertTrue(mapperXml.contains("<select id=\"countItemsWithSearch\""), "item list must use a dedicated count query");

        String countSql = mapperXml.substring(
            mapperXml.indexOf("<select id=\"countItemsWithSearch\""),
            mapperXml.indexOf("</select>", mapperXml.indexOf("<select id=\"countItemsWithSearch\""))
        );

        assertFalse(countSql.contains("PreferredItemImageExpr"), "count query must not evaluate image fallback subqueries");
        assertFalse(countSql.contains("item_images"), "count query must not join or scan item_images");
        assertFalse(countSql.contains("ORDER BY"), "count query must not sort rows");
    }

    @Test
    void pagedItemListShouldNotSelectRawSourceNpcsJsonLongText() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));

        String listSql = mapperXml.substring(
            mapperXml.indexOf("<select id=\"selectItemsWithSearch\""),
            mapperXml.indexOf("</select>", mapperXml.indexOf("<select id=\"selectItemsWithSearch\""))
        );
        String detailSql = mapperXml.substring(
            mapperXml.indexOf("<select id=\"selectItemDetailById\""),
            mapperXml.indexOf("</select>", mapperXml.indexOf("<select id=\"selectItemDetailById\""))
        );

        assertFalse(listSql.contains("source_npcs_json"), "paged item list must not read raw source_npcs_json LONGTEXT");
        assertTrue(detailSql.contains("source_npcs_json"), "item detail may read raw source_npcs_json for sanitized sourceNpcs");
    }

    @Test
    void pagedItemListShouldUseLightweightProjection() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String listSql = mapperXml.substring(
            mapperXml.indexOf("<select id=\"selectItemsWithSearch\""),
            mapperXml.indexOf("</select>", mapperXml.indexOf("<select id=\"selectItemsWithSearch\""))
        );

        assertFalse(listSql.contains("PreferredItemImageExpr"), "paged item list must not run per-row preferred image subquery");
        assertFalse(listSql.contains(" i.description"), "paged item list must not read description");
        assertFalse(listSql.contains(" i.description_zh"), "paged item list must not read description_zh");
        assertFalse(listSql.contains(" i.tooltip"), "paged item list must not read tooltip");
        assertFalse(listSql.contains(" i.tooltip_zh"), "paged item list must not read tooltip_zh");
        assertFalse(listSql.contains(" i.buy"), "paged item list must not read buy");
        assertFalse(listSql.contains(" i.sell"), "paged item list must not read sell");
        assertFalse(listSql.contains(" i.width"), "paged item list must not read width");
        assertFalse(listSql.contains(" i.height"), "paged item list must not read height");
        assertTrue(listSql.contains("ii_primary.cached_url AS image"), "paged item list must only return managed cached display images");
        assertFalse(listSql.contains("ii_primary.original_url"), "paged item list must not expose wiki original_url as display image fallback");
        assertFalse(listSql.contains(", i.image) AS image"), "paged item list must not expose legacy wiki image fallback");
    }

    @Test
    void pagedItemListShouldRejectDemoAndPlacedManagedImages() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String listSql = mapperXml.substring(
            mapperXml.indexOf("<select id=\"selectItemsWithSearch\""),
            mapperXml.indexOf("</select>", mapperXml.indexOf("<select id=\"selectItemsWithSearch\""))
        );

        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE '%28demo%29%'"), "paged list item_images.cached_url demo URLs must be ignored");
        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&amp;#/-]|$)'"), "paged list item_images.cached_url demo filter must be token-aware");
        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE '%28placed%29%'"), "paged list item_images.cached_url placed URLs must be ignored");
        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&amp;#/-]|$)'"), "paged list item_images.cached_url placed filter must be token-aware");
    }

    @Test
    void pagedItemListShouldPageItemsBeforeJoiningImages() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String listSql = mapperXml.substring(
            mapperXml.indexOf("<select id=\"selectItemsWithSearch\""),
            mapperXml.indexOf("</select>", mapperXml.indexOf("<select id=\"selectItemsWithSearch\""))
        );

        assertTrue(listSql.contains("FROM (\n            SELECT"), "paged item list must page items in a derived table before joins");
        assertTrue(listSql.contains("LIMIT #{limit}"), "inner item page must apply the requested limit");
        assertTrue(listSql.contains("OFFSET #{offset}"), "inner item page must apply the requested offset");
        assertTrue(listSql.indexOf("LIMIT #{limit}") < listSql.indexOf("LEFT JOIN item_images"), "item_images must be joined after item paging");
    }

    @Test
    void defaultRuntimeConfigShouldNotUseStdoutSqlLogging() throws Exception {
        String applicationYaml = Files.readString(Path.of("src/main/resources/application.yml"));

        assertFalse(applicationYaml.contains("org.apache.ibatis.logging.stdout.StdOutImpl"), "default config must not use MyBatis StdOutImpl");
        assertFalse(applicationYaml.contains("com.terraria.skills.mapper: DEBUG"), "default mapper logging must not be DEBUG");
    }
}
