package com.terraria.skills.controller;

final class AdminItemImageSql {

    private AdminItemImageSql() {
    }

    static String preferredItemImageExpression(String itemAlias) {
        return """
            COALESCE(
              CASE
                WHEN %1$s.image IS NOT NULL
                  AND TRIM(%1$s.image) <> ''
                  AND %1$s.image LIKE '%%terraria.wiki.gg%%'
                  AND COALESCE(%1$s.source_provider, '') IN ('wiki_gg', 'terraria.wiki.gg', 'wiki_gg_zh_reference', 'wiki_zh')
                  AND %1$s.source_page IS NOT NULL
                  AND TRIM(%1$s.source_page) <> ''
                  AND %1$s.image NOT LIKE '%%/terrapedia-images/%%'
                  AND LOWER(TRIM(%1$s.image)) NOT LIKE '%%(demo)%%'
                  AND LOWER(TRIM(%1$s.image)) NOT LIKE '%%28demo%%'
                  AND LOWER(TRIM(%1$s.image)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
                  AND LOWER(TRIM(%1$s.image)) NOT LIKE '%%(placed)%%'
                  AND LOWER(TRIM(%1$s.image)) NOT LIKE '%%28placed%%'
                  AND LOWER(TRIM(%1$s.image)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
                  THEN TRIM(%1$s.image)
              END,
              (
                SELECT COALESCE(
                  CASE
                    WHEN ii.original_url IS NOT NULL
                      AND TRIM(ii.original_url) <> ''
                      AND ii.original_url NOT LIKE '%%/terrapedia-images/%%'
                      AND LOWER(TRIM(ii.original_url)) NOT LIKE '%%(demo)%%'
                      AND LOWER(TRIM(ii.original_url)) NOT LIKE '%%28demo%%'
                      AND LOWER(TRIM(ii.original_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
                      AND LOWER(TRIM(ii.original_url)) NOT LIKE '%%(placed)%%'
                      AND LOWER(TRIM(ii.original_url)) NOT LIKE '%%28placed%%'
                      AND LOWER(TRIM(ii.original_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
                      THEN TRIM(ii.original_url)
                  END,
                  CASE
                    WHEN ii.cached_url IS NOT NULL
                      AND TRIM(ii.cached_url) <> ''
                      AND ii.cached_url NOT LIKE '%%/terrapedia-images/%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%(demo)%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%28demo%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%(placed)%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%28placed%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
                      THEN TRIM(ii.cached_url)
                  END
                )
                FROM item_images ii
                WHERE ii.item_id = %1$s.id
                  AND ii.deleted = 0
                  AND ii.status = 1
                  AND COALESCE(ii.provider, '') IN ('wiki_gg', 'terraria.wiki.gg')
                  AND ii.source_page IS NOT NULL
                  AND TRIM(ii.source_page) <> ''
                  AND (
                    ii.original_url LIKE '%%terraria.wiki.gg%%'
                    OR ii.cached_url LIKE '%%terraria.wiki.gg%%'
                  )
                  AND (
                    LOWER(REPLACE(REPLACE(COALESCE(ii.source_file_title, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.internal_name, ''), '_', ''), ' ', '')), '%%')
                    OR LOWER(REPLACE(REPLACE(COALESCE(ii.source_file_title, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.name, ''), '_', ''), ' ', '')), '%%')
                    OR LOWER(REPLACE(REPLACE(COALESCE(ii.original_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.internal_name, ''), '_', ''), ' ', '')), '%%')
                    OR LOWER(REPLACE(REPLACE(COALESCE(ii.original_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.name, ''), '_', ''), ' ', '')), '%%')
                    OR LOWER(REPLACE(REPLACE(COALESCE(ii.cached_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.internal_name, ''), '_', ''), ' ', '')), '%%')
                    OR LOWER(REPLACE(REPLACE(COALESCE(ii.cached_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.name, ''), '_', ''), ' ', '')), '%%')
                  )
                ORDER BY
                  CASE WHEN ii.source_revision_timestamp IS NOT NULL THEN 0 ELSE 1 END,
                  CASE WHEN ii.original_url IS NOT NULL AND TRIM(ii.original_url) <> '' THEN 0 ELSE 1 END,
                  CASE WHEN ii.is_primary = 1 THEN 0 ELSE 1 END,
                  ii.sort_order ASC,
                  ii.id ASC
                LIMIT 1
              )
            )
            """.formatted(itemAlias).trim();
    }
}
