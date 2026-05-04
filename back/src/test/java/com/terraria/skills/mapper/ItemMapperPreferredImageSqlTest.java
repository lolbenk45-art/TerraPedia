package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ItemMapperPreferredImageSqlTest {

    private String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }

    private String sqlFragment(String mapperXml, String sqlId) {
        String startTag = "<sql id=\"" + sqlId + "\">";
        int startIndex = mapperXml.indexOf(startTag);
        return mapperXml.substring(startIndex, mapperXml.indexOf("</sql>", startIndex));
    }

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

        String listSql = selectSql(mapperXml, "selectItemsWithSearch");
        String detailSql = selectSql(mapperXml, "selectItemDetailById");

        assertFalse(listSql.contains("source_npcs_json"), "paged item list must not read raw source_npcs_json LONGTEXT");
        assertTrue(detailSql.contains("source_npcs_json"), "item detail may read raw source_npcs_json for sanitized sourceNpcs");
    }

    @Test
    void pagedItemListShouldUseLightweightProjection() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String listSql = selectSql(mapperXml, "selectItemsWithSearch");

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
        String listSql = selectSql(mapperXml, "selectItemsWithSearch");

        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE '%28demo%29%'"), "paged list item_images.cached_url demo URLs must be ignored");
        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&amp;#/-]|$)'"), "paged list item_images.cached_url demo filter must be token-aware");
        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE '%28placed%29%'"), "paged list item_images.cached_url placed URLs must be ignored");
        assertTrue(listSql.contains("LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&amp;#/-]|$)'"), "paged list item_images.cached_url placed filter must be token-aware");
    }

    @Test
    void pagedItemListShouldPageItemsBeforeJoiningImages() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String listSql = selectSql(mapperXml, "selectItemsWithSearch");

        assertTrue(listSql.contains("FROM (\n            SELECT"), "paged item list must page items in a derived table before joins");
        assertTrue(listSql.contains("LIMIT #{limit}"), "inner item page must apply the requested limit");
        assertTrue(listSql.contains("OFFSET #{offset}"), "inner item page must apply the requested offset");
        assertTrue(listSql.indexOf("LIMIT #{limit}") < listSql.indexOf("LEFT JOIN item_images"), "item_images must be joined after item paging");
    }

    @Test
    void publicItemListShouldUseStrictDisplayProjection() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String publicListSql = selectSql(mapperXml, "selectPublicItemsWithSearch");
        String managedImageExpr = sqlFragment(mapperXml, "ManagedItemImageExpr");

        assertFalse(publicListSql.contains("source_npcs_json"), "public item list must not read source_npcs_json");
        assertFalse(publicListSql.contains(" i.description"), "public item list must not read description");
        assertFalse(publicListSql.contains(" i.description_zh"), "public item list must not read description_zh");
        assertFalse(publicListSql.contains(" i.tooltip"), "public item list must not read tooltip");
        assertFalse(publicListSql.contains(" i.tooltip_zh"), "public item list must not read tooltip_zh");
        assertFalse(publicListSql.contains(" i.damage"), "public item list must not read damage");
        assertFalse(publicListSql.contains(" i.defense"), "public item list must not read defense");
        assertFalse(publicListSql.contains(" i.created_at"), "public item list must not read created_at");
        assertFalse(publicListSql.contains(" i.updated_at"), "public item list must not read updated_at");
        assertTrue(publicListSql.contains("<include refid=\"ManagedItemImageExpr\"/>"), "public item list must reuse the managed-image projection fragment");
        assertTrue(managedImageExpr.contains("NULLIF(TRIM(i.image), '') IS NOT NULL"), "public item list must guard empty image values");
        assertTrue(managedImageExpr.contains("LOWER(TRIM(i.image)) LIKE '%/terrapedia-images/%'"), "public item list must only expose managed MinIO images");
        assertFalse(managedImageExpr.contains("item_images"), "public managed-image projection must not evaluate item_images");
        assertFalse(managedImageExpr.contains("original_url"), "public managed-image projection must not expose wiki original_url");
        assertFalse(publicListSql.contains("i.image AS image"), "public item list must not expose raw image without a managed-image guard");
        assertFalse(publicListSql.contains("ii_primary.cached_url AS image"), "public item list must not evaluate item_images for display image");
        assertFalse(publicListSql.contains("ii_primary.original_url"), "public item list must not expose wiki original_url");
    }

    @Test
    void publicItemListShouldPageItemsBeforeJoiningImages() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String publicListSql = selectSql(mapperXml, "selectPublicItemsWithSearch");

        assertTrue(publicListSql.contains("FROM (\n            SELECT"), "public item list must page items in a derived table before joins");
        assertTrue(publicListSql.contains("LIMIT #{limit}"), "inner public item page must apply the requested limit");
        assertTrue(publicListSql.contains("OFFSET #{offset}"), "inner public item page must apply the requested offset");
        assertFalse(publicListSql.contains("LEFT JOIN item_images"), "public item list must not join item_images at all");
    }

    @Test
    void publicItemSuggestionsShouldUseStrictDisplayProjection() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String publicSuggestionsSql = selectSql(mapperXml, "selectPublicItemSuggestions");
        String managedImageExpr = sqlFragment(mapperXml, "ManagedItemImageExpr");

        assertFalse(publicSuggestionsSql.contains("source_npcs_json"), "public item suggestions must not read source_npcs_json");
        assertFalse(publicSuggestionsSql.contains(" i.description"), "public item suggestions must not read description");
        assertFalse(publicSuggestionsSql.contains(" i.tooltip"), "public item suggestions must not read tooltip");
        assertFalse(publicSuggestionsSql.contains(" i.created_at"), "public item suggestions must not read created_at");
        assertFalse(publicSuggestionsSql.contains(" i.updated_at"), "public item suggestions must not read updated_at");
        assertTrue(publicSuggestionsSql.contains("<include refid=\"ManagedItemImageExpr\"/>"), "public item suggestions must reuse the managed-image projection fragment");
        assertTrue(managedImageExpr.contains("LOWER(TRIM(i.image)) LIKE '%/terrapedia-images/%'"), "public item suggestions must only expose managed MinIO images");
        assertFalse(publicSuggestionsSql.contains("PreferredItemImageExpr"), "public item suggestions must not run preferred image fallback");
        assertFalse(publicSuggestionsSql.contains("item_images"), "public item suggestions must not join or scan item_images");
        assertFalse(publicSuggestionsSql.contains("original_url"), "public item suggestions must not expose wiki original_url");
    }

    @Test
    void publicItemDetailShouldUseStrictShellProjection() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String publicDetailSql = selectSql(mapperXml, "selectPublicItemDetailById");
        String managedImageExpr = sqlFragment(mapperXml, "ManagedItemImageExpr");

        assertFalse(publicDetailSql.contains("source_npcs_json"), "public item detail shell must not read source_npcs_json");
        assertFalse(publicDetailSql.contains("relatedCategoryIdsRaw"), "public item detail shell must not read category relation aggregate strings");
        assertFalse(publicDetailSql.contains(" i.created_at"), "public item detail shell must not read created_at");
        assertFalse(publicDetailSql.contains(" i.updated_at"), "public item detail shell must not read updated_at");
        assertTrue(publicDetailSql.contains("<include refid=\"ManagedItemImageExpr\"/>"), "public item detail shell must reuse the managed-image projection fragment");
        assertTrue(managedImageExpr.contains("LOWER(TRIM(i.image)) LIKE '%/terrapedia-images/%'"), "public item detail shell must only expose managed MinIO images");
        assertFalse(publicDetailSql.contains("PreferredItemImageExpr"), "public item detail shell must not run preferred image fallback");
        assertFalse(publicDetailSql.contains("item_images"), "public item detail shell must not join or scan item_images");
        assertFalse(publicDetailSql.contains("original_url"), "public item detail shell must not expose wiki original_url");
    }

    @Test
    void defaultRuntimeConfigShouldNotUseStdoutSqlLogging() throws Exception {
        String applicationYaml = Files.readString(Path.of("src/main/resources/application.yml"));

        assertFalse(applicationYaml.contains("org.apache.ibatis.logging.stdout.StdOutImpl"), "default config must not use MyBatis StdOutImpl");
        assertFalse(applicationYaml.contains("com.terraria.skills.mapper: DEBUG"), "default mapper logging must not be DEBUG");
    }
}
