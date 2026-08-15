package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminArticleCommentMapperSqlTest {

    private String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }

    @Test
    void adminArticleCommentSortSqlShouldUseAllowlistedChoices() throws Exception {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ArticleCommentMapper.xml"));
        String listSql = selectSql(mapperXml, "selectAdminArticleCommentsPage");

        assertTrue(listSql.contains("<when test=\"sortBy == 'replyCount'\">ac.reply_count</when>"));
        assertTrue(listSql.contains("<when test=\"sortBy == 'likeCount'\">ac.like_count</when>"));
        assertTrue(listSql.contains("<when test=\"sortBy == 'id'\">ac.id</when>"));
        assertTrue(listSql.contains("<otherwise>ac.created_at</otherwise>"));
        assertTrue(listSql.contains("<when test=\"sortOrder == 'asc'\">ASC</when>"));
        assertTrue(listSql.contains("<otherwise>DESC</otherwise>"));
        assertFalse(listSql.contains("${sortBy}"));
        assertFalse(listSql.contains("${sortOrder}"));
    }
}
