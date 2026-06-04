package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class UserSavedRouteMapperTest {

    @Test
    void routeListQueryMustFilterCurrentUserAndActiveItems() throws IOException {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/UserSavedRouteMapper.xml"));
        String query = selectSql(mapperXml, "selectActiveRoutesPage");

        assertTrue(query.contains("usr.user_id = #{userId}"), "route list must filter current user");
        assertTrue(query.contains("usr.deleted = 0"), "route list must hide deleted routes");
        assertTrue(query.contains("usr.target_type = 'CRAFTING_ITEM'"), "first route type must be crafting item");
        assertTrue(query.contains("i.deleted = 0"), "route list must filter deleted items");
        assertTrue(query.contains("(i.status IS NULL OR i.status = 1)"), "route list must filter inactive items");
        assertTrue(query.contains("ORDER BY usr.updated_at DESC, usr.id DESC"), "route list must use stable newest-first ordering");
    }

    private String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }
}
