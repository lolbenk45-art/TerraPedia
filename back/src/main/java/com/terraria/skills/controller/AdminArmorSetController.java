package com.terraria.skills.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/admin/armor-sets")
@RequiredArgsConstructor
@Tag(name = "AdminArmorSets", description = "Admin armor set management")
@SecurityRequirement(name = "bearerAuth")
public class AdminArmorSetController {

    private static final String RELATION_DATABASE_NAME = "terria_v1_relation";
    private static final String PROJECTION_ARMOR_SETS_TABLE = "projection_armor_sets";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    @GetMapping
    @Operation(summary = "Get armor sets")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getArmorSets(
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String search
    ) {
        String projectionTable = resolveProjectionArmorSetsTable();
        if (projectionTable != null) {
            return getProjectionArmorSets(projectionTable, page, limit, size, search);
        }

        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        int offset = (safePage - 1) * safeLimit;

        List<Object> countArgs = new ArrayList<>();
        String where = buildArmorSearchWhere(search, countArgs);
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM armor_sets" + where, Long.class, countArgs.toArray());

        List<Object> queryArgs = new ArrayList<>(countArgs);
        queryArgs.add(offset);
        queryArgs.add(safeLimit);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, source_key, text_key, benefit_expression, primary_part, set_count, unique_item_count,
                   sets_json, unique_item_ids_json, male_images, female_images, special_images, status, created_at, updated_at
            FROM armor_sets
            """ + where + """
            ORDER BY id ASC
            LIMIT ?, ?
            """,
            queryArgs.toArray()
        );

        Map<String, ArmorSetImageGroup> snapshotImages = loadArmorSetImageSnapshot();
        List<Map<String, Object>> payload = rows.stream().map(row -> normalizeArmorSetRow(row, snapshotImages)).toList();
        Pagination pagination = new Pagination(total == null ? 0 : total, safePage, safeLimit);
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(payload);
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get armor set detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getArmorSetById(@PathVariable Long id) {
        String projectionTable = resolveProjectionArmorSetsTable();
        if (projectionTable != null) {
            return getProjectionArmorSetById(projectionTable, id);
        }

        return getLegacyArmorSetById(id);
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> getLegacyArmorSetById(Long id) {
        Map<String, Object> payload = findLegacyArmorSetPayload(id);
        if (payload == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "ArmorSet not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(payload));
    }

    private Map<String, Object> findLegacyArmorSetPayload(Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, source_key, text_key, benefit_expression, primary_part, set_count, unique_item_count,
                   sets_json, unique_item_ids_json, male_images, female_images, special_images, status, created_at, updated_at
            FROM armor_sets WHERE id = ? LIMIT 1
            """,
            id
        );
        if (rows.isEmpty()) {
            return null;
        }
        return normalizeArmorSetRow(rows.get(0), loadArmorSetImageSnapshot());
    }

    private String resolveProjectionArmorSetsTable() {
        if (tableExistsInCurrentDatabase(PROJECTION_ARMOR_SETS_TABLE)) {
            return PROJECTION_ARMOR_SETS_TABLE;
        }
        if (tableExists(RELATION_DATABASE_NAME, PROJECTION_ARMOR_SETS_TABLE)) {
            return "`" + RELATION_DATABASE_NAME + "`.`" + PROJECTION_ARMOR_SETS_TABLE + "`";
        }
        return null;
    }

    private boolean tableExistsInCurrentDatabase(String tableName) {
        try {
            Long count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = ?
                """,
                Long.class,
                tableName
            );
            return count != null && count > 0;
        } catch (Exception exception) {
            log.debug("{} is not available in current database", tableName, exception);
            return false;
        }
    }

    private boolean tableExists(String schemaName, String tableName) {
        try {
            Long count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = ? AND table_name = ?
                """,
                Long.class,
                schemaName,
                tableName
            );
            return count != null && count > 0;
        } catch (Exception exception) {
            log.debug("{}.{} is not available", schemaName, tableName, exception);
            return false;
        }
    }

    private ResponseEntity<ApiResponse<List<Map<String, Object>>>> getProjectionArmorSets(
        String projectionTable,
        Integer page,
        Integer limit,
        Integer size,
        String search
    ) {
        int safePage = PaginationParams.resolvePage(page);
        int safeLimit = PaginationParams.resolveLimit(limit, size, 20, 100);
        int offset = (safePage - 1) * safeLimit;

        List<Object> countArgs = new ArrayList<>();
        String where = buildArmorSearchWhere(search, countArgs);
        Long total = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM " + projectionTable + where,
            Long.class,
            countArgs.toArray()
        );

        List<Object> queryArgs = new ArrayList<>(countArgs);
        queryArgs.add(offset);
        queryArgs.add(safeLimit);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, relation_record_key, text_key, name, name_zh, name_en, source_key,
                   benefit_expression, benefit_zh, benefit_en, primary_part, set_count, unique_item_count,
                   sets_json, unique_item_ids_json, current_item_ids_json, related_items_json,
                   male_images, female_images, special_images, mapping_status, status, created_at, updated_at
            FROM """ + projectionTable + """
            """ + where + """
            ORDER BY id ASC
            LIMIT ?, ?
            """,
            queryArgs.toArray()
        );

        List<Map<String, Object>> payload = rows.stream().map(this::normalizeProjectionArmorSetRow).toList();
        Pagination pagination = new Pagination(total == null ? 0 : total, safePage, safeLimit);
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(payload);
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> getProjectionArmorSetById(String projectionTable, Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, relation_record_key, text_key, name, name_zh, name_en, source_key,
                   benefit_expression, benefit_zh, benefit_en, primary_part, set_count, unique_item_count,
                   sets_json, unique_item_ids_json, current_item_ids_json, related_items_json,
                   male_images, female_images, special_images, mapping_status, status, created_at, updated_at
            FROM """ + projectionTable + """
            WHERE id = ? LIMIT 1
            """,
            id
        );
        if (rows.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "ArmorSet not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(normalizeProjectionArmorSetRow(rows.get(0))));
    }

    @PostMapping
    @Operation(summary = "Create armor set")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createArmorSet(@RequestBody Map<String, Object> request) {
        String sourceKey = firstNonBlank(trimToNull(request.get("sourceKey")), trimToNull(request.get("internalCode")));
        if (sourceKey == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.error(400, "sourceKey is required"));
        }

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                """
                INSERT INTO armor_sets (
                  source_key, text_key, benefit_expression, primary_part, set_count, unique_item_count,
                  sets_json, unique_item_ids_json, male_images, female_images, special_images, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                """,
                Statement.RETURN_GENERATED_KEYS
            );
            statement.setString(1, sourceKey);
            statement.setString(2, firstNonBlank(trimToNull(request.get("textKey")), trimToNull(request.get("name")), sourceKey));
            statement.setString(3, trimToNull(firstNonNull(request, "benefitExpression", "setBonusDesc", "set_bonus_desc")));
            statement.setString(4, trimToNull(firstNonNull(request, "primaryPart", "primary_part")));
            statement.setInt(5, toInt(request.get("setCount"), 0));
            statement.setInt(6, toInt(request.get("uniqueItemCount"), 0));
            statement.setString(7, normalizeJsonField(firstNonNull(request, "setsJson", "sets_json")));
            statement.setString(8, normalizeJsonField(firstNonNull(request, "uniqueItemIdsJson", "unique_item_ids_json")));
            statement.setString(9, trimToNull(firstNonNull(request, "maleImages", "male_images")));
            statement.setString(10, trimToNull(firstNonNull(request, "femaleImages", "female_images")));
            statement.setString(11, trimToNull(firstNonNull(request, "specialImages", "special_images")));
            statement.setInt(12, toInt(request.get("status"), 1));
            return statement;
        }, keyHolder);

        Long id = keyHolder.getKey() == null ? null : keyHolder.getKey().longValue();
        syncArmorSetItems(id, request);
        return getLegacyArmorSetById(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update armor set")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateArmorSet(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, source_key, text_key, benefit_expression, primary_part, set_count, unique_item_count,
                   sets_json, unique_item_ids_json, male_images, female_images, special_images, status, created_at, updated_at
            FROM armor_sets WHERE id = ? LIMIT 1
            """,
            id
        );
        if (rows.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "ArmorSet not found"));
        }

        Map<String, Object> existing = rows.get(0);
        jdbcTemplate.update(
            """
            UPDATE armor_sets
            SET source_key = ?, text_key = ?, benefit_expression = ?, primary_part = ?, set_count = ?, unique_item_count = ?,
                sets_json = ?, unique_item_ids_json = ?, male_images = ?, female_images = ?, special_images = ?, status = ?, updated_at = NOW()
            WHERE id = ?
            """,
            request.containsKey("sourceKey") || request.containsKey("internalCode")
                ? firstNonBlank(trimToNull(request.get("sourceKey")), trimToNull(request.get("internalCode")), trimToNull(existing.get("source_key")))
                : existing.get("source_key"),
            request.containsKey("textKey") || request.containsKey("name")
                ? firstNonBlank(trimToNull(request.get("textKey")), trimToNull(request.get("name")), trimToNull(existing.get("text_key")))
                : existing.get("text_key"),
            request.containsKey("benefitExpression") || request.containsKey("setBonusDesc") || request.containsKey("set_bonus_desc")
                ? trimToNull(firstNonNull(request, "benefitExpression", "setBonusDesc", "set_bonus_desc"))
                : existing.get("benefit_expression"),
            request.containsKey("primaryPart") || request.containsKey("primary_part")
                ? trimToNull(firstNonNull(request, "primaryPart", "primary_part"))
                : existing.get("primary_part"),
            request.containsKey("setCount") ? toInt(request.get("setCount"), 0) : toInt(existing.get("set_count"), 0),
            request.containsKey("uniqueItemCount") ? toInt(request.get("uniqueItemCount"), 0) : toInt(existing.get("unique_item_count"), 0),
            request.containsKey("setsJson") || request.containsKey("sets_json")
                ? normalizeJsonField(firstNonNull(request, "setsJson", "sets_json"))
                : existing.get("sets_json"),
            request.containsKey("uniqueItemIdsJson") || request.containsKey("unique_item_ids_json")
                ? normalizeJsonField(firstNonNull(request, "uniqueItemIdsJson", "unique_item_ids_json"))
                : existing.get("unique_item_ids_json"),
            request.containsKey("maleImages") || request.containsKey("male_images")
                ? trimToNull(firstNonNull(request, "maleImages", "male_images"))
                : existing.get("male_images"),
            request.containsKey("femaleImages") || request.containsKey("female_images")
                ? trimToNull(firstNonNull(request, "femaleImages", "female_images"))
                : existing.get("female_images"),
            request.containsKey("specialImages") || request.containsKey("special_images")
                ? trimToNull(firstNonNull(request, "specialImages", "special_images"))
                : existing.get("special_images"),
            request.containsKey("status") ? toInt(request.get("status"), 1) : toInt(existing.get("status"), 1),
            id
        );

        syncArmorSetItems(id, request);
        Map<String, Object> payload = findLegacyArmorSetPayload(id);
        if (payload == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "ArmorSet not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(payload, "ArmorSet updated"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete armor set")
    public ResponseEntity<ApiResponse<Void>> deleteArmorSet(@PathVariable Long id) {
        jdbcTemplate.update("DELETE FROM armor_set_items WHERE armor_set_id = ?", id);
        int affected = jdbcTemplate.update("DELETE FROM armor_sets WHERE id = ?", id);
        if (affected <= 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "ArmorSet not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(null, "ArmorSet deleted"));
    }

    private String buildArmorSearchWhere(String search, List<Object> args) {
        String keyword = trimToNull(search);
        if (keyword == null) return "";
        String pattern = "%" + keyword + "%";
        args.add(pattern);
        args.add(pattern);
        args.add(pattern);
        args.add(pattern);
        args.add(pattern);
        return " WHERE (source_key LIKE ? OR text_key LIKE ? OR benefit_expression LIKE ? OR source_key LIKE ? OR text_key LIKE ?)";
    }

    private Map<String, Object> normalizeProjectionArmorSetRow(Map<String, Object> row) {
        Map<String, Object> payload = new LinkedHashMap<>();
        String textKey = trimToNull(row.get("text_key"));
        String nameZh = firstNonBlank(trimToNull(row.get("name_zh")), trimToNull(row.get("name")), textKey);
        String nameEn = firstNonBlank(trimToNull(row.get("name_en")), trimToNull(row.get("name")), textKey);
        String benefitExpression = trimToNull(row.get("benefit_expression"));
        String maleImages = trimToNull(row.get("male_images"));
        String femaleImages = trimToNull(row.get("female_images"));
        String specialImages = trimToNull(row.get("special_images"));
        String previewImage = firstNonBlank(maleImages, femaleImages, specialImages);
        List<Map<String, Object>> equipmentItems = normalizeArmorEquipmentItems(parseJson(row.get("related_items_json")));
        String mappingStatus = firstNonBlank(trimToNull(row.get("mapping_status")), "mapped");

        payload.put("id", toLong(row.get("id")));
        payload.put("name", firstNonBlank(nameZh, nameEn, textKey));
        payload.put("nameZh", nameZh);
        payload.put("nameEn", nameEn);
        payload.put("internalCode", firstNonBlank(trimToNull(row.get("source_key")), textKey));
        payload.put("textKey", textKey);
        payload.put("textZh", nameZh);
        payload.put("textEn", nameEn);
        payload.put("sourceKey", firstNonBlank(trimToNull(row.get("source_key")), textKey));
        payload.put("benefitExpression", benefitExpression);
        payload.put("benefitZh", firstNonBlank(trimToNull(row.get("benefit_zh")), benefitExpression));
        payload.put("benefitEn", firstNonBlank(trimToNull(row.get("benefit_en")), benefitExpression));
        payload.put("primaryPart", row.get("primary_part"));
        payload.put("setCount", toInt(row.get("set_count"), 0));
        payload.put("uniqueItemCount", toInt(row.get("unique_item_count"), 0));
        payload.put("setsJson", firstNonBlank(trimToNull(row.get("sets_json")), "[]"));
        payload.put("uniqueItemIdsJson", firstNonBlank(trimToNull(row.get("unique_item_ids_json")), "[]"));
        payload.put("currentItemIdsJson", firstNonBlank(trimToNull(row.get("current_item_ids_json")), "[]"));
        payload.put("definitionTextKey", textKey);
        payload.put("definitionBenefitExpression", benefitExpression);
        payload.put("definitionPrimaryPart", row.get("primary_part"));
        payload.put("definitionSetCount", toInt(row.get("set_count"), 0));
        payload.put("definitionSetsJson", firstNonBlank(trimToNull(row.get("sets_json")), "[]"));
        payload.put("definitionUniqueItemIdsJson", firstNonBlank(trimToNull(row.get("unique_item_ids_json")), "[]"));
        payload.put("definitionMappingStatus", mappingStatus);
        payload.put("status", toInt(row.get("status"), 1));
        payload.put("categoryId", null);
        payload.put("armorHeadId", null);
        payload.put("armorBodyId", null);
        payload.put("armorLegsId", null);
        payload.put("image", previewImage);
        payload.put("imageUrl", previewImage);
        payload.put("maleImages", maleImages);
        payload.put("femaleImages", femaleImages);
        payload.put("specialImages", specialImages);
        payload.put("relatedItems", equipmentItems);
        payload.put("equipmentItems", equipmentItems);
        payload.put("setVariants", buildArmorSetVariants(textKey, parseJson(row.get("sets_json")), equipmentItems));
        payload.put("effectRows", buildArmorEffectRows(benefitZh(payload), benefitEn(payload), benefitExpression, row.get("primary_part"), mappingStatus));
        payload.put("createdAt", row.get("created_at"));
        payload.put("updatedAt", row.get("updated_at"));
        return payload;
    }

    private Map<String, Object> normalizeArmorSetRow(Map<String, Object> row, Map<String, ArmorSetImageGroup> snapshotImages) {
        Map<String, Object> payload = new LinkedHashMap<>();
        Long armorSetId = toLong(row.get("id"));
        List<Long> persistedItemIds = loadArmorSetItemIds(armorSetId);
        List<Long> uniqueItemIds = extractLongList(parseJson(row.get("unique_item_ids_json")));
        List<Long> parts = !persistedItemIds.isEmpty()
            ? persistedItemIds
            : (uniqueItemIds.isEmpty() ? extractLongList(parseJson(row.get("sets_json"))) : uniqueItemIds);
        Set<Long> uniqueParts = new LinkedHashSet<>(uniqueItemIds.isEmpty() ? parts : uniqueItemIds);
        Map<String, Object> definition = matchArmorDefinition(armorSetId, parts);
        List<Long> currentItemIds = extractLongList(definition.get("currentItemIds"));
        if (currentItemIds.isEmpty()) {
            currentItemIds = parts.stream().filter(value -> value != null && value > 0).toList();
        }
        String sourceKey = trimToNull(row.get("source_key"));
        String textKey = firstNonBlank(trimToNull(row.get("text_key")), trimToNull(definition.get("textKey")), sourceKey);
        String nameZh = firstNonBlank(
            trimToNull(definition.get("nameZh")),
            trimToNull(definition.get("textZh")),
            trimToNull(definition.get("name")),
            textKey
        );
        String nameEn = firstNonBlank(
            trimToNull(definition.get("nameEn")),
            trimToNull(definition.get("textEn")),
            textKey
        );
        String benefitExpression = firstNonBlank(
            trimToNull(definition.get("benefitExpression")),
            trimToNull(row.get("benefit_expression"))
        );
        String benefitZh = firstNonBlank(
            trimToNull(definition.get("benefitZh")),
            benefitExpression
        );
        String benefitEn = firstNonBlank(
            trimToNull(definition.get("benefitEn")),
            benefitExpression
        );
        ArmorSetImageGroup snapshotImageGroup = snapshotImages.get(textKey);
        String snapshotMaleImages = snapshotImageGroup == null ? null : snapshotImageGroup.maleCsv();
        String snapshotFemaleImages = snapshotImageGroup == null ? null : snapshotImageGroup.femaleCsv();
        String snapshotSpecialImages = snapshotImageGroup == null ? null : snapshotImageGroup.specialCsv();
        String snapshotPreviewImage = firstNonBlank(snapshotMaleImages, snapshotFemaleImages, snapshotSpecialImages);
        List<Map<String, Object>> relatedItems = loadRelatedItems(definition, currentItemIds);
        List<Map<String, Object>> equipmentItems = normalizeArmorEquipmentItems(relatedItems);
        String relatedPreviewImage = relatedItems.stream()
            .map(item -> trimToNull(item.get("image")))
            .filter(value -> value != null && !value.isBlank())
            .findFirst()
            .orElse(null);
        String previewImage = firstNonBlank(snapshotPreviewImage, relatedPreviewImage);

        payload.put("id", toLong(row.get("id")));
        payload.put("name", nameZh);
        payload.put("nameZh", nameZh);
        payload.put("nameEn", nameEn);
        payload.put("internalCode", sourceKey);
        payload.put("textKey", definition.getOrDefault("textKey", textKey));
        payload.put("textZh", firstNonBlank(trimToNull(definition.get("textZh")), nameZh));
        payload.put("textEn", firstNonBlank(trimToNull(definition.get("textEn")), textKey));
        payload.put("sourceKey", sourceKey);
        payload.put("benefitExpression", benefitExpression);
        payload.put("benefitZh", benefitZh);
        payload.put("benefitEn", benefitEn);
        payload.put("primaryPart", definition.getOrDefault("primaryPart", row.get("primary_part")));
        payload.put("setCount", definition.getOrDefault("currentSetCount", definition.getOrDefault("setCount", toInt(row.get("set_count"), currentItemIds.isEmpty() ? 0 : 1))));
        payload.put("uniqueItemCount", definition.getOrDefault("currentUniqueItemCount", definition.getOrDefault("uniqueItemCount", currentItemIds.isEmpty() ? uniqueParts.size() : currentItemIds.size())));
        payload.put("setsJson", definition.getOrDefault("setsJson", firstNonBlank(trimToNull(row.get("sets_json")), "[]")));
        payload.put("uniqueItemIdsJson", definition.getOrDefault("uniqueItemIdsJson", firstNonBlank(trimToNull(row.get("unique_item_ids_json")), "[]")));
        payload.put("currentItemIdsJson", toJson(currentItemIds));
        payload.put("definitionTextKey", definition.get("textKey"));
        payload.put("definitionBenefitExpression", definition.get("benefitExpression"));
        payload.put("definitionPrimaryPart", definition.get("primaryPart"));
        payload.put("definitionSetCount", definition.get("setCount"));
        payload.put("definitionSetsJson", definition.get("setsJson"));
        payload.put("definitionUniqueItemIdsJson", definition.get("uniqueItemIdsJson"));
        payload.put("definitionMappingStatus", definition.getOrDefault("mappingStatus", "placeholder"));
        payload.put("status", toInt(row.get("status"), 1));
        payload.put("categoryId", null);
        payload.put("armorHeadId", null);
        payload.put("armorBodyId", null);
        payload.put("armorLegsId", null);
        payload.put("image", previewImage);
        payload.put("imageUrl", previewImage);
        payload.put("maleImages", firstNonBlank(trimToNull(row.get("male_images")), trimToNull(definition.get("maleImages")), snapshotMaleImages, previewImage));
        payload.put("femaleImages", firstNonBlank(trimToNull(row.get("female_images")), trimToNull(definition.get("femaleImages")), snapshotFemaleImages));
        payload.put("specialImages", firstNonBlank(trimToNull(row.get("special_images")), trimToNull(definition.get("specialImages")), snapshotSpecialImages));
        payload.put("relatedItems", equipmentItems);
        payload.put("equipmentItems", equipmentItems);
        payload.put("setVariants", buildArmorSetVariants(String.valueOf(payload.getOrDefault("textKey", textKey)), parseJson(payload.get("setsJson")), equipmentItems));
        payload.put(
            "effectRows",
            buildArmorEffectRows(
                trimToNull(payload.get("benefitZh")),
                trimToNull(payload.get("benefitEn")),
                benefitExpression,
                payload.get("primaryPart"),
                payload.get("definitionMappingStatus")
            )
        );
        payload.put("createdAt", row.get("created_at"));
        payload.put("updatedAt", row.get("updated_at"));
        return payload;
    }

    private String benefitZh(Map<String, Object> payload) {
        return trimToNull(payload.get("benefitZh"));
    }

    private String benefitEn(Map<String, Object> payload) {
        return trimToNull(payload.get("benefitEn"));
    }

    private List<Map<String, Object>> normalizeArmorEquipmentItems(Object rawItems) {
        if (!(rawItems instanceof List<?> items)) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object rawItem : items) {
            if (!(rawItem instanceof Map<?, ?> item)) {
                continue;
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            Long id = toLong(firstMapValue(item, "id", "itemId", "item_id"));
            Long sourceId = toLong(firstMapValue(item, "sourceId", "source_id", "itemSourceId", "item_source_id"));
            payload.put("id", id);
            payload.put("itemId", id);
            payload.put("sourceId", sourceId);
            payload.put("internalName", firstNonBlank(trimToNull(firstMapValue(item, "internalName", "internal_name", "itemInternalName", "item_internal_name"))));
            payload.put("name", firstNonBlank(trimToNull(firstMapValue(item, "name", "itemName", "item_name"))));
            payload.put("nameZh", firstNonBlank(trimToNull(firstMapValue(item, "nameZh", "name_zh", "itemNameZh", "item_name_zh"))));
            payload.put("image", firstNonBlank(trimToNull(firstMapValue(item, "image", "imageUrl", "image_url", "itemImage", "item_image"))));
            payload.put("partRole", firstNonBlank(trimToNull(firstMapValue(item, "partRole", "part_role"))));
            payload.put("slotType", firstNonBlank(trimToNull(firstMapValue(item, "slotType", "slot_type"))));
            payload.put("equipmentSlotId", toNullableInt(firstMapValue(item, "equipmentSlotId", "equipment_slot_id")));
            payload.put("setVariantIndex", toInt(firstMapValue(item, "setVariantIndex", "set_variant_index"), 0));
            payload.put("partIndex", toInt(firstMapValue(item, "partIndex", "part_index"), result.size()));
            result.add(payload);
        }
        return result;
    }

    private List<Map<String, Object>> buildArmorSetVariants(String textKey, Object rawSets, List<Map<String, Object>> equipmentItems) {
        List<List<Long>> sets = extractSetVariants(rawSets);
        if (sets.isEmpty() && !equipmentItems.isEmpty()) {
            List<Long> fallbackIds = equipmentItems.stream()
                .map(item -> firstNonNullLong(item.get("sourceId"), item.get("id")))
                .filter(value -> value != null && value > 0)
                .toList();
            if (!fallbackIds.isEmpty()) {
                sets = List.of(fallbackIds);
            }
        }

        List<Map<String, Object>> variants = new ArrayList<>();
        for (int index = 0; index < sets.size(); index += 1) {
            List<Long> itemSourceIds = sets.get(index);
            int variantIndex = index;
            List<Map<String, Object>> items = equipmentItems.stream()
                .filter(item -> toInt(item.get("setVariantIndex"), 0) == variantIndex)
                .filter(item -> {
                    Long sourceId = firstNonNullLong(item.get("sourceId"), item.get("id"));
                    return sourceId == null || itemSourceIds.isEmpty() || itemSourceIds.contains(sourceId);
                })
                .toList();
            if (items.isEmpty() && index == 0 && !equipmentItems.isEmpty()) {
                items = equipmentItems;
            }

            Map<String, Object> variant = new LinkedHashMap<>();
            variant.put("variantIndex", index);
            variant.put("setId", firstNonBlank(textKey, "ArmorSet") + "#" + index);
            variant.put("itemSourceIds", itemSourceIds);
            variant.put("items", items);
            variants.add(variant);
        }
        return variants;
    }

    private List<List<Long>> extractSetVariants(Object rawSets) {
        if (!(rawSets instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        if (list.stream().noneMatch(List.class::isInstance)) {
            List<Long> single = list.stream()
                .map(this::toLong)
                .filter(value -> value != null && value > 0)
                .toList();
            return single.isEmpty() ? List.of() : List.of(single);
        }
        List<List<Long>> variants = new ArrayList<>();
        for (Object rawVariant : list) {
            if (!(rawVariant instanceof List<?> variant)) {
                continue;
            }
            List<Long> ids = variant.stream()
                .map(this::toLong)
                .filter(value -> value != null && value > 0)
                .toList();
            if (!ids.isEmpty()) {
                variants.add(ids);
            }
        }
        return variants;
    }

    private List<Map<String, Object>> buildArmorEffectRows(
        String benefitZh,
        String benefitEn,
        String benefitExpression,
        Object primaryPart,
        Object mappingStatus
    ) {
        List<Map<String, Object>> rows = new ArrayList<>();
        addEffectRow(rows, "中文效果", benefitZh);
        addEffectRow(rows, "英文效果", benefitEn);
        addEffectRow(rows, "Benefit Expression", benefitExpression);
        addEffectRow(rows, "Primary Part", trimToNull(primaryPart));
        addEffectRow(rows, "Mapping Status", trimToNull(mappingStatus));
        return rows;
    }

    private void addEffectRow(List<Map<String, Object>> rows, String label, String value) {
        String text = trimToNull(value);
        if (text == null) {
            return;
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("label", label);
        row.put("value", text);
        rows.add(row);
    }

    private Object firstMapValue(Map<?, ?> map, String... keys) {
        for (String key : keys) {
            if (map.containsKey(key) && map.get(key) != null) {
                return map.get(key);
            }
        }
        return null;
    }

    private Long firstNonNullLong(Object... values) {
        for (Object value : values) {
            Long current = toLong(value);
            if (current != null) {
                return current;
            }
        }
        return null;
    }

    private Map<String, ArmorSetImageGroup> loadArmorSetImageSnapshot() {
        Path path = resolveDataFile(Path.of("terraPedia", "raw", "wiki", "armor_set_images.parsed.latest.json"));
        if (path == null) {
            return Map.of();
        }

        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object imagesRaw = root.get("armorSetImages");
            if (!(imagesRaw instanceof List<?> images)) {
                return Map.of();
            }

            Map<String, ArmorSetImageGroup> result = new LinkedHashMap<>();
            for (Object imageRaw : images) {
                if (!(imageRaw instanceof Map<?, ?> image)) {
                    continue;
                }
                String textKey = trimToNull(image.get("textKey"));
                String role = trimToNull(image.get("imageRole"));
                String url = firstNonBlank(trimToNull(image.get("cachedUrl")), trimToNull(image.get("originalUrl")));
                if (textKey == null || role == null || url == null) {
                    continue;
                }

                ArmorSetImageGroup group = result.computeIfAbsent(textKey, ignored -> new ArmorSetImageGroup());
                group.add(role, url);
            }
            return result;
        } catch (Exception exception) {
            log.warn("Failed to load armor set image snapshot", exception);
            return Map.of();
        }
    }

    private Map<String, Object> matchArmorDefinition(Long armorSetId, List<Long> parts) {
        Path generatedMappingPath = resolveDataFile(Path.of("generated", "armor-set-definition-map.json"));
        if (generatedMappingPath != null) {
            try {
                Map<String, Object> root = objectMapper.readValue(generatedMappingPath.toFile(), new TypeReference<>() {});
                Object recordsRaw = root.get("records");
                if (recordsRaw instanceof Map<?, ?> records) {
                    if (armorSetId != null && records.containsKey(String.valueOf(armorSetId))) {
                        Object directRaw = records.get(String.valueOf(armorSetId));
                        if (directRaw instanceof Map<?, ?> directRecord) {
                            Map<String, Object> directPayload = toArmorDefinitionPayload(directRecord);
                            if (!directPayload.isEmpty()) {
                                return directPayload;
                            }
                        }
                    }
                    List<Long> normalizedParts = parts.stream()
                        .filter(value -> value != null && value > 0)
                        .sorted(Comparator.naturalOrder())
                        .toList();
                    for (Object raw : records.values()) {
                        if (!(raw instanceof Map<?, ?> record)) continue;
                        List<Long> normalizedRecord = extractLongList(record.get("itemIds")).stream()
                            .filter(value -> value != null && value > 0)
                            .sorted(Comparator.naturalOrder())
                            .toList();
                        if (!normalizedParts.equals(normalizedRecord)) continue;
                        Map<String, Object> payload = toArmorDefinitionPayload(record);
                        if (!payload.isEmpty()) {
                            return payload;
                        }
                    }
                }
            } catch (Exception exception) {
                log.warn("Failed to load generated armor set mapping", exception);
            }
        }

        List<Long> normalizedParts = parts.stream().filter(value -> value != null && value > 0).toList();
        if (normalizedParts.isEmpty()) return Map.of();

        Path path = resolveDataFile(Path.of("standardized", "armor_sets.standardized.json"));
        Path itemsPath = resolveDataFile(Path.of("standardized", "items.standardized.json"));
        if (path == null || itemsPath == null) return Map.of();

        try {
            Map<Long, Long> sourceItemIdByDbItemId = loadSourceItemIdByDbItemId(itemsPath, normalizedParts);
            List<Long> normalizedSourceIds = normalizedParts.stream()
                .map(sourceItemIdByDbItemId::get)
                .filter(value -> value != null && value > 0)
                .sorted(Comparator.naturalOrder())
                .toList();
            if (normalizedSourceIds.isEmpty()) {
                return Map.of();
            }

            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof List<?> records)) return Map.of();
            for (Object entry : records) {
                if (!(entry instanceof Map<?, ?> record)) continue;
                Object setsRaw = record.get("sets");
                if (!(setsRaw instanceof List<?> sets)) continue;
                for (Object setEntry : sets) {
                    if (!(setEntry instanceof List<?> setValues)) continue;
                    List<Long> normalizedSet = setValues.stream()
                        .map(this::toLong)
                        .filter(value -> value != null && value > 0)
                        .sorted(Comparator.naturalOrder())
                        .toList();
                    if (normalizedSet.equals(normalizedSourceIds)) {
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("name", record.get("textKey"));
                        payload.put("nameZh", record.get("textZh"));
                        payload.put("nameEn", record.get("textEn"));
                        payload.put("textKey", record.get("textKey"));
                        payload.put("benefitExpression", record.get("benefitExpression"));
                        payload.put("benefitZh", record.get("benefitZh"));
                        payload.put("benefitEn", record.get("benefitEn"));
                        payload.put("primaryPart", record.get("primaryPart"));
                        payload.put("setCount", toInt(record.get("setCount"), normalizedSet.isEmpty() ? 0 : 1));
                        payload.put("uniqueItemCount", record.get("uniqueItemIds") instanceof List<?> uniqueList ? uniqueList.size() : normalizedSet.size());
                        payload.put("currentSetCount", normalizedSet.isEmpty() ? 0 : 1);
                        payload.put("currentUniqueItemCount", normalizedParts.size());
                        payload.put("currentItemIds", normalizedParts);
                        payload.put("setsJson", toJson(record.get("sets")));
                        payload.put("uniqueItemIdsJson", toJson(record.get("uniqueItemIds")));
                        payload.put("uniqueItemIds", extractLongList(record.get("uniqueItemIds")));
                        payload.put("mappingStatus", "mapped");
                        return payload;
                    }
                }
            }
        } catch (Exception exception) {
            log.warn("Failed to load armor set definitions", exception);
        }
        return Map.of();
    }

    private Map<String, Object> toArmorDefinitionPayload(Map<?, ?> record) {
        Object definitionRaw = record.get("definition");
        if (!(definitionRaw instanceof Map<?, ?> definitionMap)) {
            return Map.of();
        }
        List<Long> currentItemIds = extractLongList(record.get("itemIds"));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", record.get("name"));
        payload.put("nameZh", record.get("name"));
        payload.put("nameEn", record.get("name"));
        payload.put("internalCode", record.get("internalCode"));
        payload.put("textKey", definitionMap.get("textKey"));
        payload.put("textZh", definitionMap.get("textZh"));
        payload.put("textEn", definitionMap.get("textEn"));
        payload.put("benefitExpression", definitionMap.get("benefitExpression"));
        payload.put("benefitZh", definitionMap.get("benefitZh"));
        payload.put("benefitEn", definitionMap.get("benefitEn"));
        payload.put("primaryPart", definitionMap.get("primaryPart"));
        payload.put("setCount", toInt(definitionMap.get("setCount"), 0));
        payload.put("uniqueItemCount", extractLongList(definitionMap.get("uniqueItemIds")).size());
        payload.put("currentSetCount", currentItemIds.isEmpty() ? 0 : 1);
        payload.put("currentUniqueItemCount", currentItemIds.size());
        payload.put("currentItemIds", currentItemIds);
        payload.put("setsJson", null);
        payload.put("uniqueItemIdsJson", toJson(definitionMap.get("uniqueItemIds")));
        payload.put("uniqueItemIds", extractLongList(definitionMap.get("uniqueItemIds")));
        payload.put("mappingStatus", record.get("status"));
        return payload;
    }

    private Map<Long, Long> loadSourceItemIdByDbItemId(Path itemsPath, List<Long> dbItemIds) throws Exception {
        String placeholders = String.join(",", dbItemIds.stream().map(id -> "?").toList());
        List<Map<String, Object>> dbItems = jdbcTemplate.queryForList(
            "SELECT id, internal_name FROM items WHERE id IN (" + placeholders + ")",
            dbItemIds.toArray()
        );

        Map<String, Object> root = objectMapper.readValue(itemsPath.toFile(), new TypeReference<>() {});
        Object recordsRaw = root.get("records");
        if (!(recordsRaw instanceof List<?> records)) {
            return Map.of();
        }

        Map<String, Long> sourceIdByInternalName = new LinkedHashMap<>();
        for (Object entry : records) {
            if (!(entry instanceof Map<?, ?> record)) continue;
            String internalName = trimToNull(record.get("internalName"));
            Long sourceId = toLong(record.get("id"));
            if (internalName != null && sourceId != null) {
                sourceIdByInternalName.putIfAbsent(internalName, sourceId);
            }
        }

        Map<Long, Long> result = new LinkedHashMap<>();
        for (Map<String, Object> item : dbItems) {
            Long dbId = toLong(item.get("id"));
            String internalName = trimToNull(item.get("internal_name"));
            Long sourceId = internalName == null ? null : sourceIdByInternalName.get(internalName);
            if (dbId != null && sourceId != null) {
                result.put(dbId, sourceId);
            }
        }
        return result;
    }

    private List<Long> loadArmorSetItemIds(Long armorSetId) {
        if (armorSetId == null) {
            return List.of();
        }
        return jdbcTemplate.queryForList(
            """
            SELECT item_id
            FROM armor_set_items
            WHERE armor_set_id = ? AND item_id IS NOT NULL
            ORDER BY set_variant_index ASC, part_index ASC, id ASC
            """,
            Long.class,
            armorSetId
        );
    }

    private void syncArmorSetItems(Long armorSetId, Map<String, Object> request) {
        if (armorSetId == null || request == null) {
            return;
        }
        List<Long> itemIds = extractArmorSetItemIds(request);
        jdbcTemplate.update("DELETE FROM armor_set_items WHERE armor_set_id = ?", armorSetId);
        for (int index = 0; index < itemIds.size(); index += 1) {
            Long itemId = itemIds.get(index);
            if (itemId == null || itemId <= 0) {
                continue;
            }
            Map<String, Object> item = jdbcTemplate.queryForList(
                "SELECT internal_name, name FROM items WHERE id = ? LIMIT 1",
                itemId
            ).stream().findFirst().orElse(Map.of());
            jdbcTemplate.update(
                """
                INSERT INTO armor_set_items
                  (armor_set_id, set_variant_index, part_index, item_id, item_internal_name, item_name)
                VALUES (?, 0, ?, ?, ?, ?)
                """,
                armorSetId,
                index,
                itemId,
                trimToNull(item.get("internal_name")),
                trimToNull(item.get("name"))
            );
        }
    }

    private List<Long> extractArmorSetItemIds(Map<String, Object> request) {
        List<Long> itemIds = extractLongList(firstNonNull(request, "currentItemIdsJson", "currentItemIds"));
        if (!itemIds.isEmpty()) {
            return itemIds.stream().filter(id -> id != null && id > 0).distinct().toList();
        }
        itemIds = extractLongList(firstNonNull(request, "uniqueItemIdsJson", "unique_item_ids_json"));
        return itemIds.stream().filter(id -> id != null && id > 0).distinct().toList();
    }

    private List<Map<String, Object>> loadRelatedItems(Map<String, Object> definition, List<Long> parts) {
        List<Long> itemIds = extractLongList(definition.get("uniqueItemIds"));
        if (itemIds.isEmpty()) {
            itemIds = parts.stream().filter(value -> value != null && value > 0).toList();
        }
        if (itemIds.isEmpty()) return List.of();

        List<Map<String, Object>> rows = loadItemsByIds(itemIds);
        if (rows.isEmpty() || rows.size() < Math.min(itemIds.size(), 3)) {
            List<Long> partIds = parts.stream().filter(value -> value != null && value > 0).toList();
            if (!partIds.isEmpty()) {
                rows = loadItemsByIds(partIds);
            }
        }
        return rows.stream().map(row -> {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", toLong(row.get("id")));
            payload.put("name", row.get("name"));
            payload.put("nameZh", row.get("name_zh"));
            payload.put("internalName", row.get("internal_name"));
            payload.put("image", row.get("image"));
            return payload;
        }).toList();
    }

    private List<Map<String, Object>> loadItemsByIds(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return List.of();
        }
        String placeholders = String.join(",", itemIds.stream().map(id -> "?").toList());
        return jdbcTemplate.queryForList(
            "SELECT id, name, name_zh, internal_name, image FROM items WHERE id IN (" + placeholders + ") ORDER BY id ASC",
            itemIds.toArray()
        );
    }

    private Object firstNonNull(Map<String, Object> request, String... keys) {
        for (String key : keys) {
            if (request.containsKey(key) && request.get(key) != null) return request.get(key);
        }
        return null;
    }

    private String trimToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private int toInt(Object value, int fallback) {
        if (value == null) return fallback;
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private Integer toNullableInt(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            return "[]";
        }
    }

    private String normalizeJsonField(Object value) {
        String text = trimToNull(value);
        if (text == null) {
            return "[]";
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            return objectMapper.writeValueAsString(parsed);
        } catch (Exception exception) {
            return text;
        }
    }

    private Object parseJson(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            return List.of();
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            return parsed == null ? List.of() : parsed;
        } catch (Exception exception) {
            return List.of();
        }
    }

    private List<Long> extractLongList(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        List<Long> out = new ArrayList<>();
        for (Object entry : list) {
            if (entry instanceof List<?> nested) {
                out.addAll(extractLongList(nested));
                continue;
            }
            Long current = toLong(entry);
            if (current != null && current > 0) out.add(current);
        }
        return out;
    }

    private Path resolveDataFile(Path relativePath) {
        List<Path> candidates = List.of(
            Path.of(System.getProperty("user.dir")).resolve("data").resolve(relativePath).normalize(),
            Path.of(System.getProperty("user.dir")).resolve("..").resolve("data").resolve(relativePath).normalize(),
            Path.of("data").resolve(relativePath).normalize()
        );
        for (Path candidate : candidates) {
            if (Files.exists(candidate)) return candidate;
        }
        return null;
    }

    private static final class ArmorSetImageGroup {

        private final List<String> male = new ArrayList<>();
        private final List<String> female = new ArrayList<>();
        private final List<String> special = new ArrayList<>();

        private void add(String role, String url) {
            if (role == null || url == null || url.isBlank()) {
                return;
            }
            String normalizedRole = role.trim().toLowerCase();
            if ("male".equals(normalizedRole)) {
                male.add(url);
            } else if ("female".equals(normalizedRole)) {
                female.add(url);
            } else if ("special".equals(normalizedRole)) {
                special.add(url);
            }
        }

        private String maleCsv() {
            return toCsv(male);
        }

        private String femaleCsv() {
            return toCsv(female);
        }

        private String specialCsv() {
            return toCsv(special);
        }

        private String toCsv(List<String> values) {
            return values.isEmpty() ? null : String.join(",", values);
        }
    }
}
