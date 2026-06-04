package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class UserReadingHistoryMapperTest {

    @Test
    void allHistoryQueryMustUseSafeUnionProjectionAndCurrentUserFilter() throws IOException {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/UserReadingHistoryMapper.xml"));
        String query = selectSql(mapperXml, "selectActiveHistoryPageAll");

        assertTrue(query.contains("UNION ALL"), "all history query must combine item and article projections with UNION ALL");
        assertTrue(query.contains("urh.user_id = #{userId}"), "history query must filter by current user id");
        assertTrue(query.contains("a.status = 'PUBLISHED'"), "history query must filter unpublished articles");
        assertTrue(query.contains("NULLIF(TRIM(a.slug), '') IS NOT NULL"), "history query must exclude blank article slugs");
        assertTrue(query.contains("i.deleted = 0"), "history query must filter deleted items");
        assertTrue(query.contains("(i.status IS NULL OR i.status = 1)"), "history query must filter inactive items");
        assertTrue(query.contains("ORDER BY lastViewedAt DESC, id DESC"), "history query must use stable newest-first ordering");
    }

    @Test
    void targetSpecificQueriesMustUseCurrentUserAndTargetTypeFilters() throws IOException {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/UserReadingHistoryMapper.xml"));

        assertTrue(selectSql(mapperXml, "selectActiveHistoryPage").contains("urh.user_id = #{userId}"), "typed list must filter current user");
        assertTrue(selectSql(mapperXml, "selectActiveHistoryPage").contains("urh.target_type = #{targetType}"), "typed list must filter target type");
        assertTrue(selectSql(mapperXml, "countActiveByUserAndType").contains("urh.user_id = #{userId}"), "typed count must filter current user");
        assertTrue(selectSql(mapperXml, "countActiveByUserAndType").contains("urh.target_type = #{targetType}"), "typed count must filter target type");
    }

    private String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }
}
