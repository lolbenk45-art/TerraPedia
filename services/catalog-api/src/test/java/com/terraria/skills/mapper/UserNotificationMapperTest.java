package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class UserNotificationMapperTest {

    @Test
    void notificationQueriesMustFilterCurrentUserAndReadState() throws IOException {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/UserNotificationMapper.xml"));

        assertTrue(selectSql(mapperXml, "selectActiveNotificationsPage").contains("un.user_id = #{userId}"), "notifications must filter current user");
        assertTrue(selectSql(mapperXml, "selectActiveNotificationsPage").contains("un.deleted = 0"), "notifications must hide deleted rows");
        assertTrue(selectSql(mapperXml, "selectActiveNotificationsPage").contains("un.is_read = 0"), "unread filter must be supported");
        assertTrue(selectSql(mapperXml, "countActiveNotifications").contains("un.user_id = #{userId}"), "count must filter current user");
        assertTrue(selectSql(mapperXml, "countUnreadByUser").contains("un.is_read = 0"), "unread count must filter unread rows");
    }

    private String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }
}
