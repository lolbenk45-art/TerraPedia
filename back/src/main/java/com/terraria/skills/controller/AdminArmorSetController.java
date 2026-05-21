package com.terraria.skills.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.common.Pagination;
import com.terraria.skills.common.PaginationParams;
import com.terraria.skills.service.ManagedImageUrlPolicy;
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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@RestController
@RequestMapping("/admin/armor-sets")
@RequiredArgsConstructor
@Tag(name = "AdminArmorSets", description = "Admin armor set management")
@SecurityRequirement(name = "bearerAuth")
public class AdminArmorSetController {

    private static final String RELATION_DATABASE_NAME = "terria_v1_relation";
    private static final String PROJECTION_ARMOR_SETS_TABLE = "projection_armor_sets";
    private static final String PROJECTION_ITEMS_TABLE = "projection_items";
    private static final Map<String, String> ARMOR_SET_IMAGE_ALIASES = Map.of(
        "ArmorSetBonus.HallowedSummoner", "ArmorSetBonus.Hallowed"
    );
    private static final Pattern ARMOR_EFFECT_ADD_PATTERN = Pattern.compile("player\\.([A-Za-z0-9_]+) \\+= ([0-9.]+)f?");
    private static final Pattern ARMOR_EFFECT_SUBTRACT_PATTERN = Pattern.compile("player\\.([A-Za-z0-9_]+) -= ([0-9.]+)f?");
    private static final Pattern ARMOR_EFFECT_FLAG_PATTERN = Pattern.compile("player\\.([A-Za-z0-9_]+) = true");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ManagedImageUrlPolicy managedImageUrlPolicy;
    private Map<String, List<String>> armorBenefitStatementCache;
    private Map<String, WikiArmorSetSourceRecord> wikiArmorSetSourceCache;

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

        return getLegacyArmorSets(page, limit, size, search);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get armor set detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getArmorSetById(@PathVariable Long id) {
        String projectionTable = resolveProjectionArmorSetsTable();
        if (projectionTable != null) {
            ResponseEntity<ApiResponse<Map<String, Object>>> projectionResponse = getProjectionArmorSetById(projectionTable, id);
            if (projectionResponse.getStatusCode().is2xxSuccessful()) {
                return projectionResponse;
            }
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

    private ResponseEntity<ApiResponse<List<Map<String, Object>>>> getLegacyArmorSets(
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
        if (tableExistsInCurrentDatabase(PROJECTION_ARMOR_SETS_TABLE) && tableHasRows(PROJECTION_ARMOR_SETS_TABLE)) {
            return PROJECTION_ARMOR_SETS_TABLE;
        }
        String relationTable = "`" + RELATION_DATABASE_NAME + "`.`" + PROJECTION_ARMOR_SETS_TABLE + "`";
        if (tableExists(RELATION_DATABASE_NAME, PROJECTION_ARMOR_SETS_TABLE) && tableHasRows(relationTable)) {
            return relationTable;
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

    private boolean tableHasRows(String tableExpression) {
        try {
            Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + tableExpression,
                Long.class
            );
            return count != null && count > 0;
        } catch (Exception exception) {
            log.debug("{} has no readable rows", tableExpression, exception);
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
        String where = buildProjectionArmorSearchWhere(search, countArgs);
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
            SELECT id, relation_record_key, text_key, entity_type, composition_kind, name, name_zh, name_en, source_key,
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

        Map<String, ArmorSetImageGroup> snapshotImages = loadArmorSetImageSnapshot();
        List<Map<String, Object>> payload = rows.stream().map(row -> normalizeProjectionArmorSetRow(row, snapshotImages)).toList();
        Pagination pagination = new Pagination(total == null ? 0 : total, safePage, safeLimit);
        ApiResponse<List<Map<String, Object>>> response = ApiResponse.success(payload);
        response.setPagination(pagination);
        return ResponseEntity.ok(response);
    }

    private ResponseEntity<ApiResponse<Map<String, Object>>> getProjectionArmorSetById(String projectionTable, Long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT id, relation_record_key, text_key, entity_type, composition_kind, name, name_zh, name_en, source_key,
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
        return ResponseEntity.ok(ApiResponse.success(normalizeProjectionArmorSetRow(rows.get(0), loadArmorSetImageSnapshot())));
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
        return " WHERE (source_key LIKE ? OR text_key LIKE ? OR benefit_expression LIKE ?)";
    }

    private String buildProjectionArmorSearchWhere(String search, List<Object> args) {
        String keyword = trimToNull(search);
        if (keyword == null) return "";
        String pattern = "%" + keyword + "%";
        for (int index = 0; index < 8; index += 1) {
            args.add(pattern);
        }
        return """
            WHERE (
              source_key LIKE ? OR text_key LIKE ? OR name LIKE ? OR name_zh LIKE ? OR name_en LIKE ?
              OR benefit_expression LIKE ? OR benefit_zh LIKE ? OR benefit_en LIKE ?
            )
            """;
    }

    private Map<String, Object> normalizeProjectionArmorSetRow(Map<String, Object> row, Map<String, ArmorSetImageGroup> snapshotImages) {
        Map<String, Object> payload = new LinkedHashMap<>();
        String textKey = trimToNull(row.get("text_key"));
        String nameZh = firstNonBlank(trimToNull(row.get("name_zh")), trimToNull(row.get("name")), textKey);
        String nameEn = firstNonBlank(trimToNull(row.get("name_en")), trimToNull(row.get("name")), textKey);
        String benefitExpression = trimToNull(row.get("benefit_expression"));
        WikiArmorSetSourceRecord sourceRecord = findWikiArmorSetSourceRecord(
            trimToNull(row.get("source_key")),
            nameZh,
            nameEn,
            textKey
        );
        String benefitZh = firstReadableBenefitText(
            trimToNull(row.get("benefit_zh")),
            sourceRecord == null ? null : sourceRecord.effectText(),
            benefitExpression
        );
        String benefitEn = firstReadableBenefitText(trimToNull(row.get("benefit_en")), null, benefitExpression);
        ArmorSetImageGroup snapshotImageGroup = findArmorSetImageGroup(textKey, snapshotImages);
        String snapshotMaleImages = snapshotImageGroup == null ? null : snapshotImageGroup.maleCsv();
        String snapshotFemaleImages = snapshotImageGroup == null ? null : snapshotImageGroup.femaleCsv();
        String snapshotSpecialImages = snapshotImageGroup == null ? null : snapshotImageGroup.specialCsv();
        String maleImages = firstManagedImageCsv(trimToNull(row.get("male_images")), snapshotMaleImages);
        String femaleImages = firstManagedImageCsv(trimToNull(row.get("female_images")), snapshotFemaleImages);
        String specialImages = firstManagedImageCsv(trimToNull(row.get("special_images")), snapshotSpecialImages);
        Object rawSets = parseJson(row.get("sets_json"));
        List<Map<String, Object>> equipmentItems = attachArmorEquipmentManagementRefs(
            enrichProjectionEquipmentItems(normalizeArmorEquipmentItems(parseJson(row.get("related_items_json")))),
            rawSets
        );
        int wearManagedImageCount = countCsvEntries(maleImages) + countCsvEntries(femaleImages) + countCsvEntries(specialImages);
        List<String> fallbackImages = wearManagedImageCount > 0 ? List.of() : collectManagedEquipmentImages(equipmentItems);
        String relatedPreviewImage = fallbackImages.stream().findFirst().orElse(null);
        String previewImage = firstNonBlank(maleImages, femaleImages, specialImages, relatedPreviewImage);
        String mappingStatus = firstNonBlank(trimToNull(row.get("mapping_status")), "mapped");
        String entityType = firstNonBlank(trimToNull(row.get("entity_type")), "armor_set");
        String compositionKind = firstNonBlank(trimToNull(row.get("composition_kind")), inferArmorSetCompositionKind(row));
        int managedImageCount = wearManagedImageCount + fallbackImages.size();
        int sourceImageCount = sourceRecord == null ? 0 : sourceRecord.sourceImageCount();
        List<String> dataQualityWarnings = buildArmorDataQualityWarnings(
            false,
            benefitExpression,
            benefitZh,
            managedImageCount,
            sourceImageCount
        );
        if (wearManagedImageCount <= 0 && !fallbackImages.isEmpty()) {
            dataQualityWarnings.add("managed armor set wear images are missing; using item fallback images");
        }

        payload.put("id", toLong(row.get("id")));
        payload.put("dataSourceMode", "projection");
        payload.put("entityType", entityType);
        payload.put("compositionKind", compositionKind);
        payload.put("name", firstNonBlank(nameZh, nameEn, textKey));
        payload.put("nameZh", nameZh);
        payload.put("nameEn", nameEn);
        payload.put("internalCode", firstNonBlank(trimToNull(row.get("source_key")), textKey));
        payload.put("textKey", textKey);
        payload.put("textZh", nameZh);
        payload.put("textEn", nameEn);
        payload.put("sourceKey", firstNonBlank(trimToNull(row.get("source_key")), textKey));
        payload.put("benefitExpression", benefitExpression);
        payload.put("benefitZh", firstNonBlank(benefitZh, benefitExpression));
        payload.put("benefitEn", firstNonBlank(benefitEn, benefitExpression));
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
        payload.put("fallbackImages", fallbackImages);
        payload.put("relatedItems", equipmentItems);
        payload.put("equipmentItems", equipmentItems);
        payload.put("setVariants", buildArmorSetVariants(textKey, rawSets, equipmentItems));
        payload.put("replacementGroups", buildArmorReplacementGroups(equipmentItems));
        payload.put("imagePipelineStatus", imagePipelineStatus(managedImageCount, sourceImageCount));
        payload.put("sourceImageCount", sourceImageCount);
        payload.put("managedImageCount", managedImageCount);
        payload.put("dataQualityWarnings", dataQualityWarnings);
        payload.put("effectRows", buildArmorEffectRows(benefitZh(payload), benefitEn(payload), benefitExpression, row.get("primary_part"), mappingStatus));
        payload.put("createdAt", row.get("created_at"));
        payload.put("updatedAt", row.get("updated_at"));
        return payload;
    }

    private String inferArmorSetCompositionKind(Map<String, Object> row) {
        int uniqueItemCount = toInt(row.get("unique_item_count"), 0);
        if (uniqueItemCount == 1) {
            return "single_piece_set";
        }
        return "traditional_set";
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
        WikiArmorSetSourceRecord sourceRecord = findWikiArmorSetSourceRecord(sourceKey, nameZh, nameEn, textKey);
        String benefitZh = firstNonBlank(
            firstReadableBenefitText(
                trimToNull(definition.get("benefitZh")),
                sourceRecord == null ? null : sourceRecord.effectText(),
                benefitExpression
            ),
            benefitExpression
        );
        String benefitEn = firstNonBlank(
            firstReadableBenefitText(trimToNull(definition.get("benefitEn")), null, benefitExpression),
            benefitExpression
        );
        ArmorSetImageGroup snapshotImageGroup = snapshotImages.get(textKey);
        String snapshotMaleImages = snapshotImageGroup == null ? null : snapshotImageGroup.maleCsv();
        String snapshotFemaleImages = snapshotImageGroup == null ? null : snapshotImageGroup.femaleCsv();
        String snapshotSpecialImages = snapshotImageGroup == null ? null : snapshotImageGroup.specialCsv();
        String snapshotPreviewImage = firstManagedImageCsv(snapshotMaleImages, snapshotFemaleImages, snapshotSpecialImages);
        List<Map<String, Object>> relatedItems = loadRelatedItems(definition, currentItemIds);
        Object rawSets = parseJson(firstNonBlank(trimToNull(definition.get("setsJson")), trimToNull(row.get("sets_json"))));
        List<Map<String, Object>> equipmentItems = attachArmorEquipmentManagementRefs(
            normalizeArmorEquipmentItems(relatedItems),
            rawSets
        );
        String relatedPreviewImage = relatedItems.stream()
            .map(item -> trimToNull(item.get("image")))
            .filter(this::isManagedImageUrl)
            .filter(value -> value != null && !value.isBlank())
            .findFirst()
            .orElse(null);
        String previewImage = firstNonBlank(snapshotPreviewImage, relatedPreviewImage);
        String maleImages = firstManagedImageCsv(trimToNull(row.get("male_images")), trimToNull(definition.get("maleImages")), snapshotMaleImages, previewImage);
        String femaleImages = firstManagedImageCsv(trimToNull(row.get("female_images")), trimToNull(definition.get("femaleImages")), snapshotFemaleImages);
        String specialImages = firstManagedImageCsv(trimToNull(row.get("special_images")), trimToNull(definition.get("specialImages")), snapshotSpecialImages);
        int managedImageCount = countCsvEntries(maleImages) + countCsvEntries(femaleImages) + countCsvEntries(specialImages);
        int sourceImageCount = sourceRecord == null ? 0 : sourceRecord.sourceImageCount();

        payload.put("id", toLong(row.get("id")));
        payload.put("dataSourceMode", "legacy");
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
        payload.put("maleImages", maleImages);
        payload.put("femaleImages", femaleImages);
        payload.put("specialImages", specialImages);
        payload.put("relatedItems", equipmentItems);
        payload.put("equipmentItems", equipmentItems);
        payload.put("setVariants", buildArmorSetVariants(String.valueOf(payload.getOrDefault("textKey", textKey)), rawSets, equipmentItems));
        payload.put("replacementGroups", buildArmorReplacementGroups(equipmentItems));
        payload.put("imagePipelineStatus", imagePipelineStatus(managedImageCount, sourceImageCount));
        payload.put("sourceImageCount", sourceImageCount);
        payload.put("managedImageCount", managedImageCount);
        payload.put("dataQualityWarnings", buildArmorDataQualityWarnings(
            true,
            benefitExpression,
            trimToNull(payload.get("benefitZh")),
            managedImageCount,
            sourceImageCount
        ));
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

    private String firstReadableBenefitText(String preferred, String sourceEffectText, String benefitExpression) {
        String preferredText = trimToNull(preferred);
        if (!isBenefitExpressionValue(preferredText, benefitExpression)) {
            return preferredText;
        }
        String sourceText = trimToNull(sourceEffectText);
        return sourceText == null ? preferredText : sourceText;
    }

    private String imagePipelineStatus(int managedImageCount, int sourceImageCount) {
        if (managedImageCount > 0) {
            return "managed_images_available";
        }
        if (sourceImageCount > 0) {
            return "source_images_unmanaged";
        }
        return "managed_images_missing";
    }

    private List<String> buildArmorDataQualityWarnings(
        boolean legacyMode,
        String benefitExpression,
        String benefitZh,
        int managedImageCount,
        int sourceImageCount
    ) {
        List<String> warnings = new ArrayList<>();
        if (legacyMode) {
            warnings.add("relation projection is unavailable; using legacy armor_sets fallback");
        }
        if (managedImageCount <= 0 && sourceImageCount > 0) {
            warnings.add("source armor set images exist but managed armor set images are missing");
        } else if (managedImageCount <= 0) {
            warnings.add("managed armor set images are missing");
        }
        if (isBenefitExpressionValue(benefitZh, benefitExpression)) {
            warnings.add("readable armor set effect text is missing");
        }
        return warnings;
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
            Long id = toLong(firstMapValue(item, "id"));
            Long itemId = toLong(firstMapValue(item, "itemId", "item_id", "itemSourceId", "item_source_id"));
            Long sourceId = toLong(firstMapValue(item, "sourceId", "source_id", "itemSourceId", "item_source_id"));
            payload.put("id", id);
            payload.put("itemId", firstNonNullLong(itemId, id));
            payload.put("sourceId", sourceId);
            payload.put("internalName", firstNonBlank(trimToNull(firstMapValue(item, "internalName", "internal_name", "itemInternalName", "item_internal_name"))));
            payload.put("name", firstNonBlank(trimToNull(firstMapValue(item, "name", "itemName", "item_name"))));
            payload.put("nameZh", firstNonBlank(trimToNull(firstMapValue(item, "nameZh", "name_zh", "itemNameZh", "item_name_zh"))));
            payload.put("image", firstManagedImage(trimToNull(firstMapValue(item, "image", "imageUrl", "image_url", "itemImage", "item_image"))));
            payload.put("partRole", firstNonBlank(trimToNull(firstMapValue(item, "partRole", "part_role"))));
            payload.put("slotType", firstNonBlank(trimToNull(firstMapValue(item, "slotType", "slot_type"))));
            payload.put("equipmentSlotId", toNullableInt(firstMapValue(item, "equipmentSlotId", "equipment_slot_id")));
            payload.put("setVariantIndex", toInt(firstMapValue(item, "setVariantIndex", "set_variant_index"), 0));
            payload.put("partIndex", toInt(firstMapValue(item, "partIndex", "part_index"), result.size()));
            result.add(payload);
        }
        return result;
    }

    private List<Map<String, Object>> enrichProjectionEquipmentItems(List<Map<String, Object>> equipmentItems) {
        if (equipmentItems == null || equipmentItems.isEmpty()) {
            return List.of();
        }
        List<Long> projectionItemIds = equipmentItems.stream()
            .map(item -> firstNonNullLong(item.get("sourceId"), item.get("id")))
            .filter(value -> value != null && value > 0)
            .distinct()
            .toList();
        List<Long> localItemIds = equipmentItems.stream()
            .flatMap(item -> armorEquipmentLookupIds(item).stream())
            .filter(value -> value != null && value > 0)
            .distinct()
            .toList();
        if (projectionItemIds.isEmpty() && localItemIds.isEmpty()) {
            return equipmentItems;
        }

        String projectionItemsTable = resolveProjectionItemsTable();
        Map<Long, Map<String, Object>> itemById = new LinkedHashMap<>();
        if (projectionItemsTable != null && !projectionItemIds.isEmpty()) {
            String placeholders = String.join(",", projectionItemIds.stream().map(id -> "?").toList());
            try {
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, name, name_zh, internal_name, image FROM " + projectionItemsTable + " WHERE id IN (" + placeholders + ")",
                    projectionItemIds.toArray()
                );
                for (Map<String, Object> row : rows) {
                    Long id = toLong(row.get("id"));
                    if (id != null) {
                        itemById.put(id, row);
                    }
                }
            } catch (Exception exception) {
                log.debug("Failed to enrich projection armor equipment items from projection_items", exception);
            }
        }

        Map<Long, String> managedItemImagesById = loadManagedItemImagesById(localItemIds);
        if (itemById.isEmpty() && managedItemImagesById.isEmpty()) {
            return equipmentItems;
        }

        List<Map<String, Object>> enriched = new ArrayList<>();
        for (Map<String, Object> item : equipmentItems) {
            Map<String, Object> copy = new LinkedHashMap<>(item);
            Long sourceId = firstNonNullLong(copy.get("sourceId"), copy.get("id"));
            Map<String, Object> projectionItem = sourceId == null ? null : itemById.get(sourceId);
            if (projectionItem != null) {
                Long projectionId = toLong(projectionItem.get("id"));
                copy.put("id", firstNonNullLong(copy.get("id"), projectionId));
                copy.put("itemId", firstNonNullLong(copy.get("itemId"), projectionId));
                copy.put("sourceId", firstNonNullLong(copy.get("sourceId"), projectionId));
                copy.put("name", firstNonBlank(trimToNull(copy.get("name")), trimToNull(projectionItem.get("name"))));
                copy.put("nameZh", firstNonBlank(trimToNull(copy.get("nameZh")), trimToNull(projectionItem.get("name_zh"))));
                copy.put("internalName", firstNonBlank(trimToNull(copy.get("internalName")), trimToNull(projectionItem.get("internal_name"))));
            }
            String managedItemImage = firstManagedImageForLookupIds(managedItemImagesById, armorEquipmentLookupIds(copy));
            copy.put(
                "image",
                firstManagedImage(
                    projectionItem == null ? null : trimToNull(projectionItem.get("image")),
                    trimToNull(copy.get("image")),
                    managedItemImage
                )
            );
            enriched.add(copy);
        }
        return enriched;
    }

    private List<Map<String, Object>> attachArmorEquipmentManagementRefs(List<Map<String, Object>> equipmentItems, Object rawSets) {
        if (equipmentItems == null || equipmentItems.isEmpty()) {
            return List.of();
        }

        List<List<Long>> setVariants = extractSetVariants(rawSets);
        Map<Long, List<Integer>> membershipIndexesByItemId = new LinkedHashMap<>();
        for (int index = 0; index < setVariants.size(); index += 1) {
            for (Long itemId : setVariants.get(index)) {
                if (itemId != null && itemId > 0) {
                    membershipIndexesByItemId.computeIfAbsent(itemId, ignored -> new ArrayList<>()).add(index);
                }
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> item : equipmentItems) {
            Map<String, Object> copy = new LinkedHashMap<>(item);
            Long detailItemId = armorEquipmentDetailItemId(copy);
            List<Integer> membershipVariantIndexes = membershipVariantIndexes(copy, membershipIndexesByItemId);
            if (membershipVariantIndexes.isEmpty() && setVariants.isEmpty()) {
                membershipVariantIndexes = List.of(toInt(copy.get("setVariantIndex"), 0));
            }

            Map<String, Object> itemDetailRef = new LinkedHashMap<>();
            itemDetailRef.put("itemId", detailItemId);
            itemDetailRef.put("internalName", trimToNull(copy.get("internalName")));
            itemDetailRef.put("canOpenItemDetail", detailItemId != null && detailItemId > 0);
            itemDetailRef.put("membershipVariantIndexes", membershipVariantIndexes);
            copy.put("itemDetailRef", itemDetailRef);
            result.add(copy);
        }
        return result;
    }

    private Long armorEquipmentDetailItemId(Map<String, Object> item) {
        for (Object value : new Object[] { item.get("itemId"), item.get("id") }) {
            Long itemId = toLong(value);
            if (itemId != null && itemId > 0) {
                return itemId;
            }
        }
        return null;
    }

    private List<Integer> membershipVariantIndexes(
        Map<String, Object> item,
        Map<Long, List<Integer>> membershipIndexesByItemId
    ) {
        if (membershipIndexesByItemId == null || membershipIndexesByItemId.isEmpty()) {
            return List.of();
        }
        Set<Integer> indexes = new LinkedHashSet<>();
        for (Long lookupId : armorEquipmentLookupIds(item)) {
            List<Integer> itemIndexes = membershipIndexesByItemId.get(lookupId);
            if (itemIndexes != null) {
                indexes.addAll(itemIndexes);
            }
        }
        return new ArrayList<>(indexes);
    }

    private List<Long> armorEquipmentLookupIds(Map<String, Object> item) {
        if (item == null || item.isEmpty()) {
            return List.of();
        }
        List<Long> ids = new ArrayList<>();
        for (Object value : new Object[] { item.get("itemId"), item.get("id"), item.get("sourceId") }) {
            Long id = toLong(value);
            if (id != null && id > 0 && !ids.contains(id)) {
                ids.add(id);
            }
        }
        return ids;
    }

    private String firstManagedImageForLookupIds(Map<Long, String> managedItemImagesById, List<Long> itemIds) {
        if (managedItemImagesById == null || managedItemImagesById.isEmpty() || itemIds == null || itemIds.isEmpty()) {
            return null;
        }
        for (Long itemId : itemIds) {
            String image = managedItemImagesById.get(itemId);
            if (isManagedImageUrl(image)) {
                return image;
            }
        }
        return null;
    }

    private Map<Long, String> loadManagedItemImagesById(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", itemIds.stream().map(id -> "?").toList());
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT item_id, cached_url
                FROM item_images
                WHERE deleted = 0
                  AND status = 1
                  AND cached_url IS NOT NULL
                  AND TRIM(cached_url) <> ''
                  AND LOWER(TRIM(cached_url)) NOT LIKE '%(demo)%'
                  AND LOWER(TRIM(cached_url)) NOT LIKE '%28demo%29%'
                  AND LOWER(TRIM(cached_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
                  AND LOWER(TRIM(cached_url)) NOT LIKE '%(placed)%'
                  AND LOWER(TRIM(cached_url)) NOT LIKE '%28placed%29%'
                  AND LOWER(TRIM(cached_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
                  AND (
                    original_url IS NULL
                    OR TRIM(original_url) = ''
                    OR (
                      LOWER(TRIM(original_url)) NOT LIKE '%(demo)%'
                      AND LOWER(TRIM(original_url)) NOT LIKE '%28demo%29%'
                      AND LOWER(TRIM(original_url)) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
                      AND LOWER(TRIM(original_url)) NOT LIKE '%(placed)%'
                      AND LOWER(TRIM(original_url)) NOT LIKE '%28placed%29%'
                      AND LOWER(TRIM(original_url)) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
                    )
                  )
                  AND item_id IN (""" + placeholders + """
                  )
                ORDER BY item_id ASC, is_primary DESC, sort_order ASC, id ASC
                """,
                itemIds.toArray()
            );
            Map<Long, String> result = new LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                Long itemId = toLong(row.get("item_id"));
                String imageUrl = trimToNull(row.get("cached_url"));
                if (itemId != null && !result.containsKey(itemId) && isManagedImageUrl(imageUrl)) {
                    result.put(itemId, imageUrl);
                }
            }
            return result;
        } catch (Exception exception) {
            log.debug("Failed to load managed item image fallbacks for projection armor equipment items", exception);
            return Map.of();
        }
    }

    private List<String> collectManagedEquipmentImages(List<Map<String, Object>> equipmentItems) {
        if (equipmentItems == null || equipmentItems.isEmpty()) {
            return List.of();
        }
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, Object> item : equipmentItems) {
            String image = firstManagedImage(trimToNull(item.get("image")), trimToNull(item.get("imageUrl")));
            if (image != null) {
                seen.add(image);
            }
        }
        return new ArrayList<>(seen);
    }

    private String resolveProjectionItemsTable() {
        if (tableExistsInCurrentDatabase(PROJECTION_ITEMS_TABLE)) {
            return PROJECTION_ITEMS_TABLE;
        }
        if (tableExists(RELATION_DATABASE_NAME, PROJECTION_ITEMS_TABLE)) {
            return "`" + RELATION_DATABASE_NAME + "`.`" + PROJECTION_ITEMS_TABLE + "`";
        }
        return null;
    }

    private List<Map<String, Object>> buildArmorReplacementGroups(List<Map<String, Object>> equipmentItems) {
        if (equipmentItems == null || equipmentItems.isEmpty()) {
            return List.of();
        }

        Map<String, Map<Long, Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> item : equipmentItems) {
            String partRole = normalizeArmorPartRole(trimToNull(item.get("partRole")));
            Long sourceId = firstNonNullLong(item.get("sourceId"), item.get("id"));
            if (sourceId == null || sourceId <= 0) {
                continue;
            }
            grouped.computeIfAbsent(partRole, ignored -> new LinkedHashMap<>()).putIfAbsent(sourceId, item);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, Map<Long, Map<String, Object>>> entry : grouped.entrySet()) {
            if (entry.getValue().size() <= 1) {
                continue;
            }
            Map<String, Object> group = new LinkedHashMap<>();
            List<Map<String, Object>> items = new ArrayList<>(entry.getValue().values());
            group.put("partRole", entry.getKey());
            group.put("label", armorPartRoleLabel(entry.getKey()));
            group.put("sourceIds", new ArrayList<>(entry.getValue().keySet()));
            group.put("items", items);
            result.add(group);
        }
        return result;
    }

    private String normalizeArmorPartRole(String partRole) {
        if (partRole == null) {
            return "other";
        }
        String normalized = partRole.trim().toLowerCase();
        if ("leg".equals(normalized)) {
            return "legs";
        }
        if ("head".equals(normalized) || "body".equals(normalized) || "legs".equals(normalized)) {
            return normalized;
        }
        return "other";
    }

    private String armorPartRoleLabel(String partRole) {
        return switch (partRole) {
            case "head" -> "\u5934\u90e8\u53ef\u66ff\u6362";
            case "body" -> "\u8eab\u4f53\u53ef\u66ff\u6362";
            case "legs" -> "\u817f\u90e8\u53ef\u66ff\u6362";
            default -> "\u5176\u4ed6\u53ef\u66ff\u6362";
        };
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
        String benefitExpressionKey = trimToNull(benefitExpression);
        List<String> statements = benefitExpressionKey == null
            ? List.of()
            : loadArmorBenefitStatements().getOrDefault(benefitExpressionKey, List.of());
        int effectIndex = 1;
        for (String statement : statements) {
            addEffectRow(rows, "\u6e38\u620f\u6548\u679c " + effectIndex, humanizeArmorBenefitStatement(statement));
            effectIndex += 1;
        }
        if (!isBenefitExpressionValue(benefitZh, benefitExpressionKey)) {
            addEffectRow(rows, "\u4e2d\u6587\u6548\u679c", benefitZh);
        }
        if (!isBenefitExpressionValue(benefitEn, benefitExpressionKey)) {
            addEffectRow(rows, "\u82f1\u6587\u6548\u679c", benefitEn);
        }
        addEffectRow(rows, "Benefit Expression", benefitExpressionKey);
        addEffectRow(rows, "Primary Part", trimToNull(primaryPart));
        addEffectRow(rows, "Mapping Status", trimToNull(mappingStatus));
        return rows;
    }

    private WikiArmorSetSourceRecord findWikiArmorSetSourceRecord(String sourceKey, String nameZh, String nameEn, String textKey) {
        Map<String, WikiArmorSetSourceRecord> records = loadWikiArmorSetSourceRecords();
        if (records.isEmpty()) {
            return null;
        }
        for (String key : new String[] { sourceKey, nameZh, nameEn, textKey }) {
            WikiArmorSetSourceRecord record = records.get(normalizeLookupKey(key));
            if (record != null) {
                return record;
            }
        }
        return null;
    }

    private Map<String, WikiArmorSetSourceRecord> loadWikiArmorSetSourceRecords() {
        if (wikiArmorSetSourceCache != null) {
            return wikiArmorSetSourceCache;
        }
        Path path = resolveLatestWikiArmorSetsFile();
        if (path == null) {
            wikiArmorSetSourceCache = Map.of();
            return wikiArmorSetSourceCache;
        }
        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            Object recordsRaw = root.get("records");
            if (!(recordsRaw instanceof List<?> records)) {
                wikiArmorSetSourceCache = Map.of();
                return wikiArmorSetSourceCache;
            }
            Map<String, WikiArmorSetSourceRecord> byName = new LinkedHashMap<>();
            for (Object rawRecord : records) {
                if (!(rawRecord instanceof Map<?, ?> record)) {
                    continue;
                }
                WikiArmorSetSourceRecord sourceRecord = toWikiArmorSetSourceRecord(record);
                if (sourceRecord == null) {
                    continue;
                }
                putWikiArmorSetSourceRecord(byName, sourceRecord.nameZh(), sourceRecord);
                putWikiArmorSetSourceRecord(byName, sourceRecord.nameEn(), sourceRecord);
                putWikiArmorSetSourceRecord(byName, sourceRecord.pageTitle(), sourceRecord);
            }
            wikiArmorSetSourceCache = byName.isEmpty() ? Map.of() : Collections.unmodifiableMap(byName);
            return wikiArmorSetSourceCache;
        } catch (Exception exception) {
            log.debug("Failed to load wiki armor set source records", exception);
            wikiArmorSetSourceCache = Map.of();
            return wikiArmorSetSourceCache;
        }
    }

    private WikiArmorSetSourceRecord toWikiArmorSetSourceRecord(Map<?, ?> record) {
        String nameZh = trimToNull(record.get("nameZh"));
        String nameEn = trimToNull(record.get("nameEn"));
        String pageTitle = trimToNull(record.get("pageTitle"));
        String effectText = trimToNull(record.get("effectText"));
        int sourceImageCount = 0;
        Object imagesRaw = record.get("images");
        if (imagesRaw instanceof List<?> images) {
            for (Object rawImage : images) {
                if (rawImage instanceof Map<?, ?> image && trimToNull(image.get("url")) != null) {
                    sourceImageCount += 1;
                }
            }
        }
        if (firstNonBlank(nameZh, nameEn, pageTitle) == null && effectText == null && sourceImageCount == 0) {
            return null;
        }
        return new WikiArmorSetSourceRecord(nameZh, nameEn, pageTitle, effectText, sourceImageCount);
    }

    private void putWikiArmorSetSourceRecord(
        Map<String, WikiArmorSetSourceRecord> target,
        String key,
        WikiArmorSetSourceRecord record
    ) {
        String normalized = normalizeLookupKey(key);
        if (normalized != null) {
            target.putIfAbsent(normalized, record);
        }
    }

    private Path resolveLatestWikiArmorSetsFile() {
        Path latest = resolveDataFile(Path.of("generated", "wiki-armor-sets.latest.json"));
        if (latest != null) {
            return latest;
        }
        List<Path> generatedDirs = List.of(
            Path.of(System.getProperty("user.dir")).resolve("data").resolve("generated").normalize(),
            Path.of(System.getProperty("user.dir")).resolve("..").resolve("data").resolve("generated").normalize(),
            Path.of("data").resolve("generated").normalize()
        );
        for (Path generatedDir : generatedDirs) {
            if (!Files.isDirectory(generatedDir)) {
                continue;
            }
            try (var stream = Files.list(generatedDir)) {
                return stream
                    .filter(path -> path.getFileName().toString().matches("wiki-armor-sets\\.\\d{4}-\\d{2}-\\d{2}T.+\\.json"))
                    .max(Comparator.comparing(path -> path.getFileName().toString()))
                    .orElse(null);
            } catch (Exception exception) {
                log.debug("Failed to scan wiki armor set source directory {}", generatedDir, exception);
            }
        }
        return null;
    }

    private String normalizeLookupKey(String value) {
        String text = trimToNull(value);
        if (text == null) {
            return null;
        }
        return text.toLowerCase().replaceAll("\\s+", "");
    }

    private boolean isBenefitExpressionValue(String value, String benefitExpression) {
        String text = trimToNull(value);
        if (text == null) {
            return true;
        }
        return text.equals(benefitExpression) || text.startsWith("ArmorSetBonuses.Benefits.");
    }

    private Map<String, List<String>> loadArmorBenefitStatements() {
        if (armorBenefitStatementCache != null) {
            return armorBenefitStatementCache;
        }
        Path path = resolveDataFile(Path.of("generated", "wiki-armorsetbonuses.latest.json"));
        if (path == null) {
            armorBenefitStatementCache = Map.of();
            return armorBenefitStatementCache;
        }

        try {
            Map<String, Object> root = objectMapper.readValue(path.toFile(), new TypeReference<>() {});
            String content = trimToNull(root.get("content"));
            armorBenefitStatementCache = content == null ? Map.of() : parseArmorBenefitStatements(content);
            return armorBenefitStatementCache;
        } catch (Exception exception) {
            log.debug("Failed to load armor set benefit source", exception);
            armorBenefitStatementCache = Map.of();
            return armorBenefitStatementCache;
        }
    }

    private Map<String, List<String>> parseArmorBenefitStatements(String content) {
        Map<String, List<String>> result = new LinkedHashMap<>();
        String marker = "ArmorSetBonuses.Benefits.";
        int cursor = 0;
        while (cursor >= 0 && cursor < content.length()) {
            int markerIndex = content.indexOf(marker, cursor);
            if (markerIndex < 0) {
                break;
            }
            int functionNameStart = markerIndex + marker.length();
            int functionNameEnd = content.indexOf(" = function", functionNameStart);
            if (functionNameEnd < 0) {
                cursor = functionNameStart;
                continue;
            }

            String functionName = content.substring(functionNameStart, functionNameEnd).trim();
            int nextMarker = content.indexOf(marker, functionNameEnd + 1);
            int blockStart = content.indexOf("--[[", functionNameEnd);
            int blockEnd = blockStart < 0 ? -1 : content.indexOf("]]", blockStart);
            if (blockStart > 0 && blockEnd > blockStart && (nextMarker < 0 || blockStart < nextMarker)) {
                String block = content.substring(blockStart + 4, blockEnd);
                List<String> statements = new ArrayList<>();
                for (String rawLine : block.split("\\R")) {
                    String line = rawLine.trim();
                    if (line.isBlank() || "{".equals(line) || "}".equals(line) || line.startsWith("//")) {
                        continue;
                    }
                    statements.add(line.endsWith(";") ? line.substring(0, line.length() - 1) : line);
                }
                if (!statements.isEmpty()) {
                    result.put("ArmorSetBonuses.Benefits." + functionName, statements);
                }
            }
            cursor = nextMarker < 0 ? content.length() : nextMarker;
        }
        return result;
    }

    private String humanizeArmorBenefitStatement(String statement) {
        String text = trimToNull(statement);
        if (text == null) {
            return null;
        }
        if ("player.maxMinions++".equals(text)) {
            return "\u4ec6\u4ece\u4e0a\u9650 +1";
        }
        Matcher addMatcher = ARMOR_EFFECT_ADD_PATTERN.matcher(text);
        if (addMatcher.matches()) {
            return formatArmorEffectDelta(addMatcher.group(1), addMatcher.group(2), true);
        }
        Matcher subtractMatcher = ARMOR_EFFECT_SUBTRACT_PATTERN.matcher(text);
        if (subtractMatcher.matches()) {
            return formatArmorEffectDelta(subtractMatcher.group(1), subtractMatcher.group(2), false);
        }
        Matcher flagMatcher = ARMOR_EFFECT_FLAG_PATTERN.matcher(text);
        if (flagMatcher.matches()) {
            return formatArmorEffectFlag(flagMatcher.group(1));
        }
        if (text.startsWith("player.ApplySetBonus_")) {
            return "\u542f\u7528 " + text.replace("player.", "");
        }
        if (text.startsWith("player.AddBuff(")) {
            return "\u8ffd\u52a0 Buff " + text.replace("player.", "");
        }
        return text;
    }

    private String formatArmorEffectDelta(String field, String rawNumber, boolean positive) {
        String label = armorEffectFieldLabel(field);
        String sign = positive ? "+" : "-";
        if (isArmorEffectPercentField(field)) {
            return label + " " + sign + formatPercent(rawNumber);
        }
        return label + " " + sign + trimTrailingZero(rawNumber);
    }

    private String armorEffectFieldLabel(String field) {
        return switch (field) {
            case "maxMinions" -> "\u4ec6\u4ece\u4e0a\u9650";
            case "maxTurrets" -> "\u54e8\u5175\u4e0a\u9650";
            case "minionDamage" -> "\u53ec\u5524\u4f24\u5bb3";
            case "meleeDamage" -> "\u8fd1\u6218\u4f24\u5bb3";
            case "rangedDamage" -> "\u8fdc\u7a0b\u4f24\u5bb3";
            case "magicDamage" -> "\u9b54\u6cd5\u4f24\u5bb3";
            case "meleeCrit" -> "\u8fd1\u6218\u66b4\u51fb";
            case "rangedCrit" -> "\u8fdc\u7a0b\u66b4\u51fb";
            case "magicCrit" -> "\u9b54\u6cd5\u66b4\u51fb";
            case "manaCost" -> "\u9b54\u529b\u6d88\u8017";
            case "meleeSpeed" -> "\u8fd1\u6218\u901f\u5ea6";
            case "moveSpeed" -> "\u79fb\u52a8\u901f\u5ea6";
            case "whipRangeMultiplier" -> "\u97ad\u8303\u56f4";
            case "whipUseTimeMultiplier" -> "\u97ad\u4f7f\u7528\u95f4\u9694";
            case "pickSpeed" -> "\u6316\u6398\u95f4\u9694";
            case "statManaMax2" -> "\u6700\u5927\u9b54\u529b";
            case "endurance" -> "\u4f24\u5bb3\u51cf\u514d";
            default -> field;
        };
    }

    private boolean isArmorEffectPercentField(String field) {
        return Set.of(
            "minionDamage",
            "meleeDamage",
            "rangedDamage",
            "magicDamage",
            "manaCost",
            "meleeSpeed",
            "moveSpeed",
            "whipRangeMultiplier",
            "whipUseTimeMultiplier",
            "pickSpeed",
            "endurance"
        ).contains(field);
    }

    private String formatArmorEffectFlag(String flag) {
        return switch (flag) {
            case "onHitDodge" -> "\u542f\u7528\u795e\u5723\u95ea\u907f (Holy Protection)";
            case "ammoCost80" -> "80% \u51e0\u7387\u4e0d\u6d88\u8017\u5f39\u836f";
            case "ammoCost75" -> "75% \u51e0\u7387\u4e0d\u6d88\u8017\u5f39\u836f";
            case "spaceGun" -> "\u7a7a\u95f4\u67aa\u9b54\u529b\u6d88\u8017\u5f52\u96f6";
            case "fireWalk" -> "\u53ef\u5728\u706b\u5757\u4e0a\u884c\u8d70";
            case "frostBurn" -> "\u8fd1\u6218/\u8fdc\u7a0b\u653b\u51fb\u9644\u5e26\u971c\u51bb\u706b\u7130";
            default -> "\u542f\u7528 " + flag;
        };
    }

    private String formatPercent(String rawNumber) {
        try {
            double value = Double.parseDouble(rawNumber) * 100;
            return trimTrailingZero(String.valueOf(value)) + "%";
        } catch (NumberFormatException exception) {
            return rawNumber + "%";
        }
    }

    private String trimTrailingZero(String rawNumber) {
        if (rawNumber == null) {
            return "";
        }
        String text = rawNumber.endsWith("f") ? rawNumber.substring(0, rawNumber.length() - 1) : rawNumber;
        if (text.endsWith(".0")) {
            return text.substring(0, text.length() - 2);
        }
        return text;
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

    private ArmorSetImageGroup findArmorSetImageGroup(String textKey, Map<String, ArmorSetImageGroup> snapshotImages) {
        if (textKey == null || snapshotImages == null || snapshotImages.isEmpty()) {
            return null;
        }
        ArmorSetImageGroup direct = snapshotImages.get(textKey);
        if (direct != null) {
            return direct;
        }
        String alias = ARMOR_SET_IMAGE_ALIASES.get(textKey);
        return alias == null ? null : snapshotImages.get(alias);
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
                String url = firstManagedImage(trimToNull(image.get("cachedUrl")));
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
            payload.put("image", firstManagedImage(trimToNull(row.get("image"))));
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

    private String firstManagedImage(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String normalized = trimToNull(value);
            if (isManagedImageUrl(normalized)) {
                return normalized;
            }
        }
        return null;
    }

    private String firstManagedImageCsv(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String normalized = managedImageCsv(value);
            if (normalized != null) {
                return normalized;
            }
        }
        return null;
    }

    private String managedImageCsv(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        List<String> managedUrls = new ArrayList<>();
        for (String entry : normalized.split("\\s*,\\s*")) {
            String imageUrl = trimToNull(entry);
            if (isManagedImageUrl(imageUrl)) {
                managedUrls.add(imageUrl);
            }
        }
        return managedUrls.isEmpty() ? null : String.join(",", managedUrls);
    }

    private int countCsvEntries(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return 0;
        }
        int count = 0;
        for (String entry : normalized.split("\\s*,\\s*")) {
            if (trimToNull(entry) != null) {
                count += 1;
            }
        }
        return count;
    }

    private boolean isManagedImageUrl(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return false;
        }
        return managedImageUrlPolicy.isManagedImageUrl(normalized);
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
            } else if ("special".equals(normalizedRole) || "demo".equals(normalizedRole) || "other".equals(normalizedRole)) {
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

    private record WikiArmorSetSourceRecord(
        String nameZh,
        String nameEn,
        String pageTitle,
        String effectText,
        int sourceImageCount
    ) {
    }
}
