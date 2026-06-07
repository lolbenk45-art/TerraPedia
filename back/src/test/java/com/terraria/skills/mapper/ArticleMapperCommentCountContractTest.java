package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ArticleMapperCommentCountContractTest {

    @Test
    void adminArticleQueriesCountAllRootCommentsForModeration() throws IOException {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ArticleMapper.xml"));

        assertAdminRootCommentCount(selectSql(mapperXml, "selectAdminArticlesPage"));
        assertAdminRootCommentCount(selectSql(mapperXml, "selectAdminArticleById"));
    }

    @Test
    void publicArticleQueriesCountOnlyVisibleRootComments() throws IOException {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ArticleMapper.xml"));

        assertPublicVisibleRootCommentCount(selectSql(mapperXml, "selectPublishedArticlesPage"));
        assertPublicVisibleRootCommentCount(selectSql(mapperXml, "selectUserArticlesPage"));
        assertPublicVisibleRootCommentCount(selectSql(mapperXml, "selectPublishedArticlesByAuthor"));
        assertPublicVisibleRootCommentCount(selectSql(mapperXml, "selectUserArticleById"));
        assertPublicVisibleRootCommentCount(selectSql(mapperXml, "selectPublishedArticleById"));
        assertPublicVisibleRootCommentCount(selectSql(mapperXml, "selectPublishedArticleBySlug"));
    }

    private static void assertAdminRootCommentCount(String query) {
        String block = commentCountBlock(query);
        assertTrue(block.contains("ac.article_id = a.id"), "admin count must stay scoped to the selected article");
        assertTrue(block.contains("ac.parent_id IS NULL"), "admin count must stay scoped to root comments");
        assertFalse(block.contains("ac.deleted = 0"), "admin moderation count must include hidden/deleted comments");
        assertFalse(block.contains("ac.status = 'PUBLISHED'"), "admin moderation count must include non-public comments");
    }

    private static void assertPublicVisibleRootCommentCount(String query) {
        String block = commentCountBlock(query);
        assertTrue(block.contains("ac.article_id = a.id"), "public count must stay scoped to the selected article");
        assertTrue(block.contains("ac.parent_id IS NULL"), "public count must stay scoped to root comments");
        assertTrue(block.contains("ac.deleted = 0"), "public count must exclude deleted comments");
        assertTrue(block.contains("ac.status = 'PUBLISHED'"), "public count must exclude hidden comments");
    }

    private static String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        assertTrue(startIndex >= 0, selectId + " query must exist");
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }

    private static String commentCountBlock(String query) {
        int startIndex = query.indexOf("FROM article_comments ac");
        assertTrue(startIndex >= 0, "query must include article_comments count");
        int endIndex = query.indexOf(") AS commentCount", startIndex);
        assertTrue(endIndex > startIndex, "query must project commentCount");
        return query.substring(startIndex, endIndex);
    }
}
