package com.terraria.skills.controller;

final class AdminItemImageSql {

    private AdminItemImageSql() {
    }

    static String preferredItemImageExpression(String itemAlias) {
        return """
            (
              SELECT CASE
                    WHEN ii.cached_url IS NOT NULL
                      AND TRIM(ii.cached_url) <> ''
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%(demo)%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%28demo%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%(placed)%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT LIKE '%%28placed%%'
                      AND LOWER(TRIM(ii.cached_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
                      AND (
                        ii.original_url IS NULL
                        OR TRIM(ii.original_url) = ''
                        OR (
                          LOWER(TRIM(ii.original_url)) NOT LIKE '%%(demo)%%'
                          AND LOWER(TRIM(ii.original_url)) NOT LIKE '%%28demo%%'
                          AND LOWER(TRIM(ii.original_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
                          AND LOWER(TRIM(ii.original_url)) NOT LIKE '%%(placed)%%'
                          AND LOWER(TRIM(ii.original_url)) NOT LIKE '%%28placed%%'
                          AND LOWER(TRIM(ii.original_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
                        )
                      )
                      THEN TRIM(ii.cached_url)
                  END
              FROM item_images ii
              WHERE ii.item_id = %1$s.id
                AND ii.deleted = 0
                AND ii.status = 1
                AND ii.cached_url IS NOT NULL
                AND TRIM(ii.cached_url) <> ''
                AND (
                  LOWER(REPLACE(REPLACE(COALESCE(ii.source_file_title, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.internal_name, ''), '_', ''), ' ', '')), '%%')
                  OR LOWER(REPLACE(REPLACE(COALESCE(ii.source_file_title, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.name, ''), '_', ''), ' ', '')), '%%')
                  OR LOWER(REPLACE(REPLACE(COALESCE(ii.original_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.internal_name, ''), '_', ''), ' ', '')), '%%')
                  OR LOWER(REPLACE(REPLACE(COALESCE(ii.original_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.name, ''), '_', ''), ' ', '')), '%%')
                  OR LOWER(REPLACE(REPLACE(COALESCE(ii.cached_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.internal_name, ''), '_', ''), ' ', '')), '%%')
                  OR LOWER(REPLACE(REPLACE(COALESCE(ii.cached_url, ''), '_', ''), ' ', '')) LIKE CONCAT('%%', LOWER(REPLACE(REPLACE(COALESCE(%1$s.name, ''), '_', ''), ' ', '')), '%%')
                )
              ORDER BY
                CASE WHEN ii.is_primary = 1 THEN 0 ELSE 1 END,
                ii.sort_order ASC,
                ii.id ASC
              LIMIT 1
            )
            """.formatted(itemAlias).trim();
    }
}
