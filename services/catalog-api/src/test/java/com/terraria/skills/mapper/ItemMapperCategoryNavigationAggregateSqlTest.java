package com.terraria.skills.mapper;

import com.terraria.skills.dto.CategoryNavigationScopeMembershipDTO;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ItemMapperCategoryNavigationAggregateSqlTest {

    @Test
    void shouldCountEveryParentScopeInOneRelationAwareQuery() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String countSql = selectSql(mapperXml, "selectCategoryNavigationParentCounts");

        assertTrue(countSql.contains("<foreach collection=\"parentScopeMemberships\""));
        assertTrue(countSql.contains("parentScopeMembership.parentId"));
        assertTrue(countSql.contains("parentScopeMembership.categoryId"));
        assertTrue(countSql.contains("i.category_id = scope_membership.category_id"));
        assertTrue(countSql.contains("JOIN item_category_rel icr"));
        assertTrue(countSql.contains("icr.category_id = scope_membership.category_id"));
        assertTrue(countSql.contains("icr.deleted = 0"));
        assertTrue(countSql.contains("icr.status = 1"));
        assertTrue(countSql.contains("COUNT(DISTINCT parent_items.item_id)"));
        assertTrue(countSql.contains("FROM scope_parents"));
        assertTrue(countSql.contains("LEFT JOIN parent_counts"));
    }

    @Test
    void shouldAggregateEveryChildScopeInOneRelationAwareQuery() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String aggregateSql = selectSql(mapperXml, "selectCategoryNavigationChildAggregates");

        assertTrue(aggregateSql.contains("<foreach collection=\"scopeMemberships\""));
        assertTrue(aggregateSql.contains("scopeMembership.childId"));
        assertTrue(aggregateSql.contains("scopeMembership.categoryId"));
        assertTrue(aggregateSql.contains("i.category_id = scope_membership.category_id"));
        assertTrue(aggregateSql.contains("JOIN item_category_rel icr"));
        assertTrue(aggregateSql.contains("icr.category_id = scope_membership.category_id"));
        assertTrue(aggregateSql.contains("icr.deleted = 0"));
        assertTrue(aggregateSql.contains("icr.status = 1"));
        assertTrue(aggregateSql.contains("COUNT(DISTINCT scoped_items.item_id)"));
        assertFalse(aggregateSql.contains("WHERE scope_membership.child_id ="),
            "all child scopes must be aggregated together instead of queried one by one");
    }

    @Test
    void shouldChooseTheFirstUsableManagedImageWithoutDroppingEmptyChildren() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
        String aggregateSql = selectSql(mapperXml, "selectCategoryNavigationChildAggregates");

        assertTrue(aggregateSql.contains("FROM scope_children"));
        assertTrue(aggregateSql.contains("LEFT JOIN child_counts"),
            "scope child rows must survive when a child contains no counted items");
        assertTrue(aggregateSql.contains("LEFT JOIN ranked_representative_images"),
            "scope child rows must survive when a child contains no usable image");
        assertTrue(aggregateSql.contains("managedImagePrefixes"));
        assertTrue(aggregateSql.contains("NOT REGEXP_LIKE("));
        assertTrue(aggregateSql.contains("TRIM(ii.cached_url),"));
        assertTrue(aggregateSql.contains("(demo|placed)"));
        assertTrue(aggregateSql.contains("'i'"));
        assertFalse(aggregateSql.contains("LOWER(TRIM(ii.cached_url)) NOT LIKE"),
            "managed image exclusions must not repeatedly normalize the same URL");
        assertTrue(aggregateSql.contains("ROW_NUMBER() OVER"));
        assertTrue(aggregateSql.contains("scoped_items.item_id ASC"));
        assertTrue(aggregateSql.contains("scoped_items.child_id,\n                TRIM(ii.cached_url) AS usable_image"),
            "ranked image columns must stay qualified and use cached item images");
        assertFalse(aggregateSql.contains("TRIM(i.image) AS usable_image"),
            "navigation must reuse the public list cached item_images projection instead of scanning legacy items.image");
        assertFalse(aggregateSql.contains("preferred_item_images AS"),
            "one child-level window can select the first item and preferred image without a second materialization");
        assertFalse(aggregateSql.contains("LEFT JOIN scoped_items\n          ON scoped_items.child_id = scope_children.child_id"),
            "the final projection must not expand and regroup scoped items after counts are complete");
    }

    @Test
    void shouldRenderMembershipAndManagedPrefixParametersThroughMyBatis() throws Exception {
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("scopeMemberships", List.of(
            new CategoryNavigationScopeMembershipDTO(11L, 11L),
            new CategoryNavigationScopeMembershipDTO(11L, 12L),
            new CategoryNavigationScopeMembershipDTO(21L, 21L)
        ));
        parameters.put("managedImagePrefixes", List.of(
            "http://localhost:9000/terrapedia-images/items/"
        ));

        BoundSql boundSql = mappedStatement().getBoundSql(parameters);
        String sql = boundSql.getSql();

        assertTrue(sql.contains("UNION ALL"));
        assertTrue(sql.contains("LEFT(LOWER(TRIM(ii.cached_url)), CHAR_LENGTH(?)) = LOWER(?)"));
        assertTrue(sql.contains("ROW_NUMBER() OVER"));
        assertFalse(sql.contains("<foreach"));
        assertFalse(sql.contains("#{scopeMembership"));
    }

    private String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        assertTrue(startIndex >= 0, "missing mapper statement " + selectId);
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }

    private org.apache.ibatis.mapping.MappedStatement mappedStatement() throws Exception {
        Configuration configuration = new Configuration();
        try (InputStream inputStream = Files.newInputStream(Path.of("src/main/resources/mapper/ItemMapper.xml"))) {
            XMLMapperBuilder mapperBuilder = new XMLMapperBuilder(
                inputStream,
                configuration,
                "mapper/ItemMapper.xml",
                configuration.getSqlFragments()
            );
            mapperBuilder.parse();
        }
        return configuration.getMappedStatement(
            "com.terraria.skills.mapper.ItemMapper.selectCategoryNavigationChildAggregates"
        );
    }
}
