package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ArticleMapperPublishedSortContractTest {

    @Test
    void publishedArticleListRanksByEngagementBeforeRecency() throws IOException {
        String query = selectSql(
            Files.readString(Path.of("src/main/resources/mapper/ArticleMapper.xml")),
            "selectPublishedArticlesPage"
        );

        assertTrue(query.contains("ORDER BY viewCount DESC, favoriteCount DESC, a.published_at DESC, a.id DESC"));
    }

    private static String selectSql(String mapperXml, String selectId) {
        String startTag = "<select id=\"" + selectId + "\"";
        int startIndex = mapperXml.indexOf(startTag);
        assertTrue(startIndex >= 0, selectId + " query must exist");
        return mapperXml.substring(startIndex, mapperXml.indexOf("</select>", startIndex));
    }
}
