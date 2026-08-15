package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.dto.ClassificationAuditOverviewDTO;
import com.terraria.skills.dto.ClassificationAuditSectionDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/operations/classification-audit")
@RequiredArgsConstructor
@Tag(name = "AdminClassificationAudit", description = "Read-only classification taxonomy audit")
@SecurityRequirement(name = "bearerAuth")
public class AdminClassificationAuditController {

    private final JdbcTemplate jdbcTemplate;

    @GetMapping
    @Operation(summary = "Get read-only classification audit")
    public ResponseEntity<ApiResponse<ClassificationAuditOverviewDTO>> getClassificationAudit(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        long offset = (long) (safePage - 1) * safeLimit;

        ClassificationAuditOverviewDTO overview = new ClassificationAuditOverviewDTO();
        overview.setUncategorizedItems(section(
            "uncategorizedItems",
            "未分类物品",
            "SELECT COUNT(*) FROM items i WHERE i.deleted = 0 AND i.category_id IS NULL",
            """
            SELECT i.id, i.name, i.name_zh AS nameZh, i.internal_name AS internalName, i.category_id AS categoryId
            FROM items i
            WHERE i.deleted = 0 AND i.category_id IS NULL
            ORDER BY i.id ASC
            LIMIT ? OFFSET ?
            """,
            safePage,
            safeLimit,
            offset
        ));
        overview.setUncategorizedNpcs(section(
            "uncategorizedNpcs",
            "未分类 NPC",
            "SELECT COUNT(*) FROM npcs n WHERE n.deleted = 0 AND n.category_id IS NULL",
            """
            SELECT n.id, n.game_id AS gameId, n.name, n.name_zh AS nameZh, n.internal_name AS internalName, n.category_id AS categoryId
            FROM npcs n
            WHERE n.deleted = 0 AND n.category_id IS NULL
            ORDER BY n.id ASC
            LIMIT ? OFFSET ?
            """,
            safePage,
            safeLimit,
            offset
        ));
        overview.setUnknownDropSourceKinds(section(
            "unknownDropSourceKinds",
            "未知掉落来源类型",
            """
            SELECT COUNT(*)
            FROM npc_loot_entries nle
            WHERE nle.deleted = 0
              AND (nle.drop_source_kind IS NULL OR nle.drop_source_kind NOT IN ('npc_drop', 'direct_boss', 'treasure_bag'))
            """,
            """
            SELECT nle.id, nle.npc_id AS npcId, nle.item_id AS itemId, nle.drop_source_kind AS dropSourceKind
            FROM npc_loot_entries nle
            WHERE nle.deleted = 0
              AND (nle.drop_source_kind IS NULL OR nle.drop_source_kind NOT IN ('npc_drop', 'direct_boss', 'treasure_bag'))
            ORDER BY nle.id ASC
            LIMIT ? OFFSET ?
            """,
            safePage,
            safeLimit,
            offset
        ));
        overview.setMissingReferences(section(
            "missingReferences",
            "缺失引用",
            """
            SELECT COUNT(*)
            FROM (
              SELECT i.id
              FROM items i
              LEFT JOIN category c ON c.id = i.category_id AND c.deleted = 0
              WHERE i.deleted = 0 AND i.category_id IS NOT NULL AND c.id IS NULL
              UNION ALL
              SELECT n.id
              FROM npcs n
              LEFT JOIN category c ON c.id = n.category_id AND c.deleted = 0
              WHERE n.deleted = 0 AND n.category_id IS NOT NULL AND c.id IS NULL
              UNION ALL
              SELECT nle.id
              FROM npc_loot_entries nle
              LEFT JOIN npcs n ON n.id = nle.npc_id AND n.deleted = 0
              LEFT JOIN items i ON i.id = nle.item_id AND i.deleted = 0
              WHERE nle.deleted = 0 AND (n.id IS NULL OR i.id IS NULL)
            ) missing_refs
            """,
            """
            SELECT 'itemCategory' AS referenceType, i.id AS ownerId, i.category_id AS referenceId
            FROM items i
            LEFT JOIN category c ON c.id = i.category_id AND c.deleted = 0
            WHERE i.deleted = 0 AND i.category_id IS NOT NULL AND c.id IS NULL
            UNION ALL
            SELECT 'npcCategory' AS referenceType, n.id AS ownerId, n.category_id AS referenceId
            FROM npcs n
            LEFT JOIN category c ON c.id = n.category_id AND c.deleted = 0
            WHERE n.deleted = 0 AND n.category_id IS NOT NULL AND c.id IS NULL
            UNION ALL
            SELECT 'npcLoot' AS referenceType, nle.id AS ownerId, COALESCE(nle.npc_id, nle.item_id) AS referenceId
            FROM npc_loot_entries nle
            LEFT JOIN npcs n ON n.id = nle.npc_id AND n.deleted = 0
            LEFT JOIN items i ON i.id = nle.item_id AND i.deleted = 0
            WHERE nle.deleted = 0 AND (n.id IS NULL OR i.id IS NULL)
            ORDER BY ownerId ASC
            LIMIT ? OFFSET ?
            """,
            safePage,
            safeLimit,
            offset
        ));
        overview.setItemCategoryConflicts(section(
            "itemCategoryConflicts",
            "物品主分类与关系冲突",
            """
            SELECT COUNT(*)
            FROM items i
            JOIN item_category_rel icr ON icr.item_id = i.id AND icr.deleted = 0 AND icr.status = 1 AND icr.is_primary = 1
            WHERE i.deleted = 0
              AND i.category_id IS NOT NULL
              AND icr.category_id <> i.category_id
            """,
            """
            SELECT i.id AS itemId, i.category_id AS categoryId, icr.category_id AS relationCategoryId
            FROM items i
            JOIN item_category_rel icr ON icr.item_id = i.id AND icr.deleted = 0 AND icr.status = 1 AND icr.is_primary = 1
            WHERE i.deleted = 0
              AND i.category_id IS NOT NULL
              AND icr.category_id <> i.category_id
            ORDER BY i.id ASC, icr.id ASC
            LIMIT ? OFFSET ?
            """,
            safePage,
            safeLimit,
            offset
        ));

        return ResponseEntity.ok(ApiResponse.success(overview));
    }

    private ClassificationAuditSectionDTO section(
        String key,
        String label,
        String countSql,
        String rowsSql,
        int page,
        int limit,
        long offset
    ) {
        ClassificationAuditSectionDTO section = new ClassificationAuditSectionDTO();
        long count = jdbcTemplate.queryForObject(countSql, Long.class);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(rowsSql, limit, offset);
        section.setKey(key);
        section.setLabel(label);
        section.setCount(count);
        section.setPagination(new Pagination(count, page, limit));
        section.setRows(rows == null ? List.of() : rows);
        return section;
    }
}
