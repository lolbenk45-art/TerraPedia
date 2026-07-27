package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemGroupDTO;
import com.terraria.skills.dto.ItemGroupMemberDTO;
import com.terraria.skills.mapper.ItemGroupCanonicalMapper;
import com.terraria.skills.service.ItemGroupCanonicalService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ItemGroupCanonicalServiceImpl implements ItemGroupCanonicalService {

    private static final int MAX_ADMIN_PAYLOAD_BYTES = 1_048_576;
    private static final int MAX_ADMIN_MEMBERS = 160;
    private static final int MAX_ADMIN_ALIASES = 32;

    private static final Pattern MYSQL_SERVER_PATTERN = Pattern.compile(
        "^jdbc:mysql://([^/:?#]+):(\\d{1,5})/[^?]+(?:\\?.*)?$",
        Pattern.CASE_INSENSITIVE
    );

    private static final Map<Consumer, List<String>> ALLOWED_LAYERS = Map.of(
        Consumer.ADMIN_ITEM_GROUPS, List.of("recipe_reference", "source_group", "central_override"),
        Consumer.ADMIN_RECIPE_GROUPS, List.of("recipe_reference", "central_override"),
        Consumer.RECIPE_TREE, List.of("recipe_reference", "source_group", "central_override"),
        Consumer.RECIPE_EXPANSION, List.of("recipe_reference")
    );

    private final ItemGroupCanonicalMapper mapper;
    private final ObjectMapper objectMapper;
    private final AdminMutationStore mutationStore;
    private final boolean sameServerWriteEnabled;

    @Autowired
    public ItemGroupCanonicalServiceImpl(
        ItemGroupCanonicalMapper mapper,
        ObjectMapper objectMapper,
        JdbcTemplate jdbcTemplate,
        PlatformTransactionManager transactionManager,
        @Value("${spring.datasource.url}") String localJdbcUrl,
        @Value("${terraria.item-groups.maint-jdbc-url:${spring.datasource.url}}") String maintJdbcUrl,
        @Value("${terraria.item-groups.relation-jdbc-url:${spring.datasource.url}}") String relationJdbcUrl,
        @Value("${terraria.crawler.cross-db.maint-database:terria_v1_maint}") String maintDatabase,
        @Value("${terraria.crawler.cross-db.relation-database:terria_v1_relation}") String relationDatabase
    ) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.sameServerWriteEnabled = hasSameServerTopology(localJdbcUrl, maintJdbcUrl, relationJdbcUrl);
        if (sameServerWriteEnabled) {
            TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
            this.mutationStore = new TransactionalAdminMutationStore(
                callback -> transactionTemplate.execute(status -> callback.get()),
                new JdbcAdminMutationGateway(jdbcTemplate, objectMapper, maintDatabase, relationDatabase)
            );
        } else {
            this.mutationStore = command -> {
                throw new IllegalStateException("canonical item group writes require same-server database topology");
            };
        }
    }

    public ItemGroupCanonicalServiceImpl(ItemGroupCanonicalMapper mapper, ObjectMapper objectMapper) {
        this(
            mapper,
            objectMapper,
            command -> {
                throw new IllegalStateException("canonical item group write store is not configured");
            },
            false
        );
    }

    ItemGroupCanonicalServiceImpl(
        ItemGroupCanonicalMapper mapper,
        ObjectMapper objectMapper,
        AdminMutationStore mutationStore,
        boolean sameServerWriteEnabled
    ) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.mutationStore = mutationStore;
        this.sameServerWriteEnabled = sameServerWriteEnabled;
    }

    @Override
    public List<ItemGroupDTO> listGroups(Consumer consumer) {
        List<String> allowedLayers = Optional.ofNullable(ALLOWED_LAYERS.get(consumer))
            .orElseThrow(() -> new IllegalArgumentException("unknown canonical item group consumer"));
        verifyPublishedProjection();
        List<Map<String, Object>> groupRows = safeRows(mapper.selectGroups(allowedLayers));
        List<Map<String, Object>> memberRows = safeRows(mapper.selectMembers(allowedLayers));
        List<Map<String, Object>> aliasRows = safeRows(mapper.selectAliases(allowedLayers));
        Map<String, Map<String, Object>> winners = new LinkedHashMap<>();
        for (Map<String, Object> row : groupRows) {
            String canonicalKey = text(row.get("canonicalKey"));
            Map<String, Object> current = winners.get(canonicalKey);
            if (current == null || number(row.get("sourcePriority")) > number(current.get("sourcePriority"))) {
                winners.put(canonicalKey, row);
            }
        }
        Map<String, List<Map<String, Object>>> membersByGroup = rowsByGroup(memberRows);
        Map<String, List<Map<String, Object>>> aliasesByGroup = rowsByGroup(aliasRows);
        return winners.values().stream()
            .map(row -> toDto(row, membersByGroup, aliasesByGroup))
            .sorted(Comparator.comparing(group -> normalizeKey(group.getCanonicalName())))
            .toList();
    }

    @Override
    public Optional<ItemGroupDTO> findGroup(Consumer consumer, String canonicalName) {
        String key = normalizeKey(canonicalName);
        return listGroups(consumer).stream()
            .filter(group -> normalizeKey(group.getCanonicalName()).equals(key))
            .findFirst();
    }

    @Override
    public WriteAvailability getWriteAvailability() {
        return sameServerWriteEnabled
            ? new WriteAvailability(true, null)
            : new WriteAvailability(false, "canonical item group writes require same-server database topology");
    }

    @Override
    public ItemGroupDTO createCentralOverride(ItemGroupDTO request, String actor) {
        return commit("CREATE", null, request, actor);
    }

    @Override
    public ItemGroupDTO updateCentralOverride(String canonicalName, ItemGroupDTO request, String actor) {
        return commit("UPDATE", canonicalName, request, actor);
    }

    @Override
    public void deleteCentralOverride(String canonicalName, String actor) {
        commit("DELETE", canonicalName, null, actor);
    }

    @Override
    public void invalidateCaches() {
        // Reads are keyed by the published snapshot state and are intentionally uncached here.
    }

    private ItemGroupDTO commit(String action, String existingCanonicalName, ItemGroupDTO request, String actor) {
        if (!sameServerWriteEnabled) throw new IllegalStateException(getWriteAvailability().reason());
        ItemGroupDTO normalized = request == null ? null : normalizeMutationGroup(request, existingCanonicalName);
        String canonicalName = normalized == null ? text(existingCanonicalName) : normalized.getCanonicalName();
        if (canonicalName.isBlank()) throw new IllegalArgumentException("canonicalName is required");
        String normalizedActor = text(actor);
        if (normalizedActor.isBlank()) throw new IllegalArgumentException("authenticated admin actor is required");
        validateAdminMutation(normalized);
        String canonicalKey = canonicalKey(canonicalName);
        AdminMutationCommand command = new AdminMutationCommand(
            action,
            canonicalKey,
            "central_override",
            normalized,
            text(existingCanonicalName).isBlank() ? null : canonicalKey(existingCanonicalName),
            normalized == null ? null : canonicalKey,
            sha256(action + ":" + canonicalKey + ":" + UUID.randomUUID()),
            normalizedActor
        );
        return mutationStore.commit(command);
    }

    private void validateAdminMutation(ItemGroupDTO group) {
        if (group == null) return;
        List<ItemGroupMemberDTO> members = group.getMembers() == null ? List.of() : group.getMembers();
        List<String> aliases = group.getAliases() == null ? List.of() : group.getAliases();
        if (members.size() > MAX_ADMIN_MEMBERS) {
            throw new IllegalArgumentException("canonical item group exceeds 160 member cap");
        }
        if (aliases.size() > MAX_ADMIN_ALIASES) {
            throw new IllegalArgumentException("canonical item group exceeds 32 alias cap");
        }
        if (members.isEmpty()) {
            throw new IllegalArgumentException("canonical item group requires at least one resolved member");
        }
        for (ItemGroupMemberDTO member : members) {
            if (member == null || member.getItemId() == null) {
                throw new IllegalArgumentException("canonical item group member itemId is required");
            }
        }
        try {
            if (objectMapper.writeValueAsBytes(group).length > MAX_ADMIN_PAYLOAD_BYTES) {
                throw new IllegalArgumentException("canonical item group exceeds 1 MiB payload cap");
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("canonical item group payload is not serializable", exception);
        }
    }

    private ItemGroupDTO normalizeMutationGroup(ItemGroupDTO request, String existingCanonicalName) {
        ItemGroupDTO result = new ItemGroupDTO();
        String canonicalName = text(existingCanonicalName).isBlank()
            ? text(request.getCanonicalName())
            : text(existingCanonicalName);
        if (canonicalName.isBlank()) throw new IllegalArgumentException("canonicalName is required");
        result.setCanonicalName(canonicalName);
        result.setDisplayNameEn(firstNonBlank(request.getDisplayNameEn(), canonicalName));
        result.setDisplayNameZh(blankToNull(request.getDisplayNameZh()));
        result.setAliases(request.getAliases() == null ? List.of() : List.copyOf(request.getAliases()));
        result.setDomains(request.getDomains() == null ? List.of() : List.copyOf(request.getDomains()));
        result.setMembers(request.getMembers() == null ? List.of() : List.copyOf(request.getMembers()));
        result.setSourceKind("canonical:central_override");
        result.setSourceProvider("admin");
        result.setSourceFile("canonical:item_groups");
        result.setManualOnly(true);
        return result;
    }

    private void verifyPublishedProjection() {
        Map<String, Object> state = mapper.selectProjectionState();
        if (state == null || !"PUBLISHED".equals(text(state.get("publicationStatus")))) {
            throw new IllegalStateException("canonical item group projection is not published");
        }
        if (!text(state.get("canonicalSnapshotHash")).matches("[a-f0-9]{64}")) {
            throw new IllegalStateException("canonical item group projection hash is invalid");
        }
        Map<String, Object> counts = mapper.selectProjectionCounts();
        if (counts == null
            || number(state.get("groupCount")) != number(counts.get("groupCount"))
            || number(state.get("memberCount")) != number(counts.get("memberCount"))
            || number(state.get("aliasCount")) != number(counts.get("aliasCount"))) {
            throw new IllegalStateException("canonical item group projection state count mismatch");
        }
    }

    private ItemGroupDTO toDto(
        Map<String, Object> row,
        Map<String, List<Map<String, Object>>> membersByGroup,
        Map<String, List<Map<String, Object>>> aliasesByGroup
    ) {
        String recordKey = text(row.get("recordKey"));
        String sourceLayer = text(row.get("sourceLayer"));
        ItemGroupDTO dto = new ItemGroupDTO();
        dto.setCanonicalName(text(row.get("canonicalName")));
        dto.setDisplayNameEn(firstNonBlank(text(row.get("name")), dto.getCanonicalName()));
        dto.setDisplayNameZh(blankToNull(text(row.get("nameZh"))));
        dto.setDomains(readStringList(row.get("normalizedDomainsJson")));
        dto.setAliases(safeRows(aliasesByGroup.get(recordKey)).stream()
            .filter(alias -> "explicit".equals(text(alias.get("aliasKind"))))
            .map(alias -> text(alias.get("aliasText")))
            .filter(value -> !value.isBlank())
            .toList());
        dto.setMembers(safeRows(membersByGroup.get(recordKey)).stream().map(this::toMemberDto).toList());
        dto.setSourceKind("canonical:" + sourceLayer);
        dto.setSourceProvider("canonical_database");
        dto.setSourceLabel(text(row.get("sourceContentHash")));
        dto.setSourceFile("canonical:item_groups");
        dto.setManualOnly("central_override".equals(sourceLayer));
        return dto;
    }

    private ItemGroupMemberDTO toMemberDto(Map<String, Object> row) {
        ItemGroupMemberDTO dto = new ItemGroupMemberDTO();
        dto.setItemId(longOrNull(row.get("itemId")));
        dto.setInternalName(blankToNull(text(row.get("internalName"))));
        dto.setName(blankToNull(text(row.get("name"))));
        dto.setNameZh(blankToNull(text(row.get("nameZh"))));
        String state = text(row.get("resolutionState"));
        dto.setResolved("RESOLVED".equals(state));
        dto.setResolutionStatus(state.toLowerCase(Locale.ROOT));
        dto.setResolutionReason("RESOLVED".equals(state) ? null : "canonical relation member is not resolved");
        return dto;
    }

    private List<String> readStringList(Object raw) {
        if (raw == null) return List.of();
        if (raw instanceof List<?> values) return values.stream().map(String::valueOf).toList();
        try {
            return objectMapper.readValue(String.valueOf(raw), new TypeReference<>() {
            });
        } catch (Exception exception) {
            throw new IllegalStateException("canonical item group domains are invalid", exception);
        }
    }

    private Map<String, List<Map<String, Object>>> rowsByGroup(List<Map<String, Object>> rows) {
        Map<String, List<Map<String, Object>>> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            result.computeIfAbsent(text(row.get("groupRecordKey")), ignored -> new ArrayList<>()).add(row);
        }
        return result;
    }

    private List<Map<String, Object>> safeRows(List<Map<String, Object>> rows) {
        return rows == null ? List.of() : rows;
    }

    private long number(Object value) {
        return value instanceof Number number ? number.longValue() : Long.parseLong(String.valueOf(value));
    }

    private Long longOrNull(Object value) {
        if (value == null) return null;
        return number(value);
    }

    private String canonicalKey(String value) {
        return normalizeKey(value).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }

    private String normalizeKey(String value) {
        return text(value).replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private String text(Object value) {
        return String.valueOf(value == null ? "" : value).trim();
    }

    private String blankToNull(String value) {
        String normalized = text(value);
        return normalized.isBlank() ? null : normalized;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            String normalized = blankToNull(value);
            if (normalized != null) return normalized;
        }
        return null;
    }

    private String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    static boolean hasSameServerTopology(String localUrl, String maintUrl, String relationUrl) {
        String local = serverIdentity(localUrl);
        String maint = serverIdentity(maintUrl);
        String relation = serverIdentity(relationUrl);
        return local != null && local.equals(maint) && local.equals(relation);
    }

    private static String serverIdentity(String value) {
        Matcher matcher = MYSQL_SERVER_PATTERN.matcher(String.valueOf(value == null ? "" : value).trim());
        if (!matcher.matches()) return null;
        return matcher.group(1).toLowerCase(Locale.ROOT) + ":" + matcher.group(2);
    }

    @FunctionalInterface
    interface AdminMutationStore {
        ItemGroupDTO commit(AdminMutationCommand command);
    }

    @FunctionalInterface
    interface TransactionRunner {
        ItemGroupDTO execute(Supplier<ItemGroupDTO> callback);
    }

    interface AdminMutationGateway {
        void lockProjectionState();

        void validateMutation(AdminMutationCommand command);

        void applyMutation(AdminMutationCommand command);

        SnapshotStats readSnapshotStats();

        void publishState(AdminMutationCommand command, SnapshotStats snapshot);

        void appendAudit(AdminMutationCommand command, SnapshotStats snapshot);
    }

    static final class TransactionalAdminMutationStore implements AdminMutationStore {

        private final TransactionRunner transactionRunner;
        private final AdminMutationGateway gateway;

        TransactionalAdminMutationStore(TransactionRunner transactionRunner, AdminMutationGateway gateway) {
            this.transactionRunner = transactionRunner;
            this.gateway = gateway;
        }

        @Override
        public ItemGroupDTO commit(AdminMutationCommand command) {
            return transactionRunner.execute(() -> {
                gateway.lockProjectionState();
                gateway.validateMutation(command);
                gateway.applyMutation(command);
                SnapshotStats snapshot = gateway.readSnapshotStats();
                gateway.publishState(command, snapshot);
                gateway.appendAudit(command, snapshot);
                return command.group();
            });
        }
    }

    static final class JdbcAdminMutationGateway implements AdminMutationGateway {

        private static final Pattern DATABASE_IDENTIFIER = Pattern.compile("[A-Za-z0-9_]{1,64}");

        private final JdbcTemplate jdbcTemplate;
        private final ObjectMapper objectMapper;
        private final String maintDatabase;
        private final String relationDatabase;

        JdbcAdminMutationGateway(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            String maintDatabase,
            String relationDatabase
        ) {
            this.jdbcTemplate = jdbcTemplate;
            this.objectMapper = objectMapper;
            this.maintDatabase = requireDatabaseIdentifier(maintDatabase, "maint");
            this.relationDatabase = requireDatabaseIdentifier(relationDatabase, "relation");
        }

        @Override
        public void lockProjectionState() {
            jdbcTemplate.queryForMap("""
                SELECT canonical_snapshot_hash, canonical_version
                FROM item_group_projection_state
                WHERE singleton_key = 1
                FOR UPDATE
                """);
        }

        @Override
        public void validateMutation(AdminMutationCommand command) {
            if ("DELETE".equals(command.action())) {
                Long count = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM item_groups
                    WHERE canonical_key = ? AND source_layer = 'central_override' AND deleted = 0
                    """, Long.class, command.canonicalKey());
                if (count == null || count != 1L) {
                    throw new IllegalArgumentException("canonical central override does not exist");
                }
                return;
            }
            Map<String, String> requestedIdentities = new LinkedHashMap<>();
            addIdentity(requestedIdentities, command.group().getCanonicalName(), "canonicalName");
            addIdentity(requestedIdentities, command.group().getDisplayNameEn(), "displayNameEn");
            addIdentity(requestedIdentities, command.group().getDisplayNameZh(), "displayNameZh");
            for (String alias : command.group().getAliases() == null ? List.<String>of() : command.group().getAliases()) {
                String normalized = normalizeIdentity(alias);
                if (!normalized.isBlank() && requestedIdentities.containsKey(normalized)) {
                    throw new IllegalArgumentException("canonical item group contains duplicate identity " + normalized);
                }
                addIdentity(requestedIdentities, alias, "alias");
            }

            List<Map<String, Object>> existingGroups = jdbcTemplate.queryForList("""
                SELECT canonical_key, canonical_name, name, name_zh
                FROM item_groups
                WHERE deleted = 0 AND canonical_key <> ?
                """, command.canonicalKey());
            for (Map<String, Object> row : existingGroups) {
                rejectCollision(requestedIdentities, row.get("canonical_name"), row.get("canonical_key"));
                rejectCollision(requestedIdentities, row.get("name"), row.get("canonical_key"));
                rejectCollision(requestedIdentities, row.get("name_zh"), row.get("canonical_key"));
            }
            List<Map<String, Object>> existingAliases = jdbcTemplate.queryForList("""
                SELECT canonical_key, alias_text
                FROM item_group_aliases
                WHERE canonical_key <> ?
                """, command.canonicalKey());
            for (Map<String, Object> row : existingAliases) {
                rejectCollision(requestedIdentities, row.get("alias_text"), row.get("canonical_key"));
            }
        }

        private void addIdentity(Map<String, String> identities, String value, String kind) {
            String normalized = normalizeIdentity(value);
            if (normalized.isBlank()) return;
            identities.putIfAbsent(normalized, kind);
        }

        private void rejectCollision(Map<String, String> identities, Object existingValue, Object ownerKey) {
            String normalized = normalizeIdentity(existingValue);
            if (identities.containsKey(normalized)) {
                throw new IllegalArgumentException(
                    "canonical item group identity collision: " + normalized + " is owned by " + ownerKey
                );
            }
        }

        private String normalizeIdentity(Object value) {
            return String.valueOf(value == null ? "" : value).trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        }

        @Override
        public void applyMutation(AdminMutationCommand command) {
            deleteCentralOverride(command.canonicalKey());
            if (!"DELETE".equals(command.action())) {
                insertCentralOverride(command);
            }
        }

        private void deleteCentralOverride(String canonicalKey) {
            String maint = quoted(maintDatabase);
            String relation = quoted(relationDatabase);
            String maintRecordKey = maintGroupRecordKey(canonicalKey);
            String relationRecordKey = relationGroupRecordKey(maintRecordKey);
            jdbcTemplate.update("""
                DELETE m FROM item_group_members m
                JOIN item_groups g ON g.id = m.group_id
                WHERE g.canonical_key = ? AND g.source_layer = 'central_override'
                """, canonicalKey);
            jdbcTemplate.update("DELETE FROM item_group_aliases WHERE canonical_key = ? AND source_layer = 'central_override'", canonicalKey);
            jdbcTemplate.update("DELETE FROM item_groups WHERE canonical_key = ? AND source_layer = 'central_override'", canonicalKey);
            jdbcTemplate.update("DELETE FROM " + relation + ".`relation_item_group_members` WHERE group_record_key = ?", relationRecordKey);
            jdbcTemplate.update("DELETE FROM " + relation + ".`relation_item_group_aliases` WHERE group_record_key = ?", relationRecordKey);
            jdbcTemplate.update("DELETE FROM " + relation + ".`relation_item_groups` WHERE canonical_key = ? AND source_layer = 'central_override'", canonicalKey);
            jdbcTemplate.update("DELETE FROM " + maint + ".`maint_item_group_members` WHERE group_record_key = ?", maintRecordKey);
            jdbcTemplate.update("DELETE FROM " + maint + ".`maint_item_group_aliases` WHERE group_record_key = ?", maintRecordKey);
            jdbcTemplate.update("DELETE FROM " + maint + ".`maint_item_groups` WHERE canonical_key = ? AND source_layer = 'central_override'", canonicalKey);
        }

        private void insertCentralOverride(AdminMutationCommand command) {
            ItemGroupDTO group = command.group();
            validateResolvedMembers(group);
            String maint = quoted(maintDatabase);
            String relation = quoted(relationDatabase);
            String maintGroupKey = maintGroupRecordKey(command.canonicalKey());
            String relationGroupKey = relationGroupRecordKey(maintGroupKey);
            String localGroupKey = localGroupRecordKey(relationGroupKey);
            String domainsJson = json(group.getDomains() == null ? List.of() : group.getDomains());
            int memberCount = group.getMembers().size();

            jdbcTemplate.update("""
                INSERT INTO %s.`maint_item_groups`
                  (record_key, canonical_key, canonical_name, display_name, display_name_zh,
                   normalized_domains_json, source_layer, source_priority, source_provider, source_key,
                   provenance_mode, admin_audit_record_key, status, source_metadata_json,
                   canonical_version, deleted)
                VALUES (?, ?, ?, ?, ?, ?, 'central_override', 400, 'admin', 'admin.central_override',
                        'admin_authored', ?, 'ACTIVE', '{}', 1, 0)
                """.formatted(maint),
                maintGroupKey,
                command.canonicalKey(),
                group.getCanonicalName(),
                group.getDisplayNameEn(),
                group.getDisplayNameZh(),
                domainsJson,
                command.auditRecordKey()
            );
            jdbcTemplate.update("""
                INSERT INTO %s.`relation_item_groups`
                  (record_key, canonical_key, canonical_name, display_name, display_name_zh,
                   normalized_domains_json, source_layer, source_priority, source_maint_record_key,
                   resolved_member_count, unresolved_member_count, ambiguous_member_count,
                   rejected_member_count, status, canonical_version, source_metadata_json, deleted)
                VALUES (?, ?, ?, ?, ?, ?, 'central_override', 400, ?, ?, 0, 0, 0, 'ACTIVE', 1, '{}', 0)
                """.formatted(relation),
                relationGroupKey,
                command.canonicalKey(),
                group.getCanonicalName(),
                group.getDisplayNameEn(),
                group.getDisplayNameZh(),
                domainsJson,
                maintGroupKey,
                memberCount
            );
            jdbcTemplate.update("""
                INSERT INTO item_groups
                  (record_key, canonical_key, canonical_name, name, name_zh, normalized_domains_json,
                   source_layer, source_priority, relation_record_key, source_content_hash,
                   canonical_version, materialized_at, status, deleted)
                VALUES (?, ?, ?, ?, ?, ?, 'central_override', 400, ?, ?, 1, NOW(), 'ACTIVE', 0)
                """,
                localGroupKey,
                command.canonicalKey(),
                group.getCanonicalName(),
                group.getDisplayNameEn(),
                group.getDisplayNameZh(),
                domainsJson,
                relationGroupKey,
                command.auditRecordKey()
            );
            Long localGroupId = jdbcTemplate.queryForObject(
                "SELECT id FROM item_groups WHERE canonical_key = ? AND source_layer = 'central_override'",
                Long.class,
                command.canonicalKey()
            );
            if (localGroupId == null) throw new IllegalStateException("canonical item group local row was not created");

            for (int index = 0; index < group.getMembers().size(); index += 1) {
                insertMember(command, group.getMembers().get(index), index, maintGroupKey, relationGroupKey, localGroupId);
            }
            List<AliasValue> aliases = aliases(group);
            for (int index = 0; index < aliases.size(); index += 1) {
                insertAlias(command, aliases.get(index), index, maintGroupKey, relationGroupKey);
            }
        }

        private void insertMember(
            AdminMutationCommand command,
            ItemGroupMemberDTO member,
            int sortOrder,
            String maintGroupKey,
            String relationGroupKey,
            Long localGroupId
        ) {
            String maint = quoted(maintDatabase);
            String relation = quoted(relationDatabase);
            String memberKey = firstNonBlank(member.getInternalName(), String.valueOf(member.getItemId()));
            String maintMemberKey = canonicalObjectHash(
                "type", "maint_item_group_member",
                "groupRecordKey", maintGroupKey,
                "memberKey", memberKey
            );
            String relationMemberKey = canonicalObjectHash(
                "type", "relation_item_group_member",
                "sourceMaintRecordKey", maintMemberKey
            );
            jdbcTemplate.update("""
                INSERT INTO %s.`maint_item_group_members`
                  (record_key, group_record_key, source_item_id, internal_name, name, name_zh,
                   member_key, sort_order, source_metadata_json, deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 0)
                """.formatted(maint),
                maintMemberKey,
                maintGroupKey,
                member.getItemId(),
                member.getInternalName(),
                member.getName(),
                member.getNameZh(),
                memberKey,
                sortOrder
            );
            jdbcTemplate.update("""
                INSERT INTO %s.`relation_item_group_members`
                  (record_key, group_record_key, member_key, item_id, source_item_id, internal_name,
                   name, name_zh, sort_order, resolution_state, resolution_reason,
                   source_metadata_json, deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESOLVED', 'admin supplied canonical item id', '{}', 0)
                """.formatted(relation),
                relationMemberKey,
                relationGroupKey,
                memberKey,
                member.getItemId(),
                member.getItemId(),
                member.getInternalName(),
                member.getName(),
                member.getNameZh(),
                sortOrder
            );
            jdbcTemplate.update("""
                INSERT INTO item_group_members
                  (record_key, group_id, item_id, source_item_id, member_key, internal_name,
                   name, name_zh, sort_order, resolution_state)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESOLVED')
                """,
                relationMemberKey,
                localGroupId,
                member.getItemId(),
                member.getItemId(),
                memberKey,
                member.getInternalName(),
                member.getName(),
                member.getNameZh(),
                sortOrder
            );
        }

        private void insertAlias(
            AdminMutationCommand command,
            AliasValue alias,
            int sortOrder,
            String maintGroupKey,
            String relationGroupKey
        ) {
            String maint = quoted(maintDatabase);
            String relation = quoted(relationDatabase);
            String maintAliasKey = canonicalObjectHash(
                "type", "maint_item_group_alias",
                "groupRecordKey", maintGroupKey,
                "normalizedAlias", alias.normalized()
            );
            String relationAliasKey = canonicalObjectHash(
                "type", "relation_item_group_alias",
                "sourceMaintRecordKey", maintAliasKey
            );
            jdbcTemplate.update("""
                INSERT INTO %s.`maint_item_group_aliases`
                  (record_key, group_record_key, alias_text, normalized_alias, alias_kind, sort_order, deleted)
                VALUES (?, ?, ?, ?, ?, ?, 0)
                """.formatted(maint),
                maintAliasKey,
                maintGroupKey,
                alias.text(),
                alias.normalized(),
                alias.kind(),
                sortOrder
            );
            jdbcTemplate.update("""
                INSERT INTO %s.`relation_item_group_aliases`
                  (record_key, group_record_key, alias_text, normalized_alias, alias_kind, sort_order, deleted)
                VALUES (?, ?, ?, ?, ?, ?, 0)
                """.formatted(relation),
                relationAliasKey,
                relationGroupKey,
                alias.text(),
                alias.normalized(),
                alias.kind(),
                sortOrder
            );
            jdbcTemplate.update("""
                INSERT INTO item_group_aliases
                  (record_key, canonical_key, source_layer, alias_text, normalized_alias, alias_kind, sort_order)
                VALUES (?, ?, 'central_override', ?, ?, ?, ?)
                """,
                relationAliasKey,
                command.canonicalKey(),
                alias.text(),
                alias.normalized(),
                alias.kind(),
                sortOrder
            );
        }

        @Override
        public SnapshotStats readSnapshotStats() {
            List<Map<String, Object>> groups = jdbcTemplate.queryForList("""
                SELECT record_key, canonical_key, canonical_name, name, name_zh, normalized_domains_json,
                       source_layer, source_priority, relation_record_key, source_content_hash,
                       canonical_version, status
                FROM item_groups WHERE deleted = 0 ORDER BY record_key
                """).stream().map(this::groupSnapshotRow).toList();
            List<Map<String, Object>> members = jdbcTemplate.queryForList("""
                SELECT m.record_key, g.record_key AS group_record_key, m.item_id, m.source_item_id,
                       m.member_key, m.internal_name, m.name, m.name_zh, m.sort_order, m.resolution_state
                FROM item_group_members m
                JOIN item_groups g ON g.id = m.group_id
                ORDER BY m.record_key
                """).stream().map(this::memberSnapshotRow).toList();
            List<Map<String, Object>> aliases = jdbcTemplate.queryForList("""
                SELECT a.record_key, g.record_key AS group_record_key, a.alias_text, a.normalized_alias,
                       a.alias_kind, a.alias_language, a.sort_order
                FROM item_group_aliases a
                JOIN item_groups g ON g.canonical_key = a.canonical_key
                  AND g.source_layer = a.source_layer
                ORDER BY a.record_key
                """).stream().map(this::aliasSnapshotRow).toList();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("schemaVersion", 1);
            payload.put("groups", groups);
            payload.put("members", members);
            payload.put("aliases", aliases);
            return new SnapshotStats(
                hash(json(payload)),
                groups.size(),
                members.size(),
                aliases.size()
            );
        }

        private Map<String, Object> groupSnapshotRow(Map<String, Object> row) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("recordKey", row.get("record_key"));
            result.put("canonicalKey", row.get("canonical_key"));
            result.put("canonicalName", row.get("canonical_name"));
            result.put("name", row.get("name"));
            result.put("nameZh", row.get("name_zh"));
            result.put("normalizedDomainsJson", row.get("normalized_domains_json"));
            result.put("sourceLayer", row.get("source_layer"));
            result.put("sourcePriority", longValue(row.get("source_priority")));
            result.put("relationRecordKey", row.get("relation_record_key"));
            result.put("sourceContentHash", row.get("source_content_hash"));
            result.put("canonicalVersion", longValue(row.get("canonical_version")));
            result.put("status", row.get("status"));
            result.put("deleted", 0);
            return result;
        }

        private Map<String, Object> memberSnapshotRow(Map<String, Object> row) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("recordKey", row.get("record_key"));
            result.put("groupRecordKey", row.get("group_record_key"));
            result.put("itemId", longValue(row.get("item_id")));
            result.put("sourceItemId", longValue(row.get("source_item_id")));
            result.put("memberKey", row.get("member_key"));
            result.put("internalName", row.get("internal_name"));
            result.put("name", row.get("name"));
            result.put("nameZh", row.get("name_zh"));
            result.put("sortOrder", longValue(row.get("sort_order")));
            result.put("resolutionState", row.get("resolution_state"));
            return result;
        }

        private Map<String, Object> aliasSnapshotRow(Map<String, Object> row) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("recordKey", row.get("record_key"));
            result.put("groupRecordKey", row.get("group_record_key"));
            result.put("aliasText", row.get("alias_text"));
            result.put("normalizedAlias", row.get("normalized_alias"));
            result.put("aliasKind", row.get("alias_kind"));
            result.put("aliasLanguage", row.get("alias_language"));
            result.put("sortOrder", longValue(row.get("sort_order")));
            return result;
        }

        private Long longValue(Object value) {
            return value == null ? null : ((Number) value).longValue();
        }

        @Override
        public void publishState(AdminMutationCommand command, SnapshotStats snapshot) {
            int updated = jdbcTemplate.update("""
                UPDATE item_group_projection_state
                SET canonical_snapshot_hash = ?,
                    canonical_version = canonical_version + 1,
                    relation_run_key = ?,
                    group_count = ?,
                    member_count = ?,
                    alias_count = ?,
                    publication_status = 'PUBLISHED',
                    published_at = NOW()
                WHERE singleton_key = 1
                """,
                snapshot.snapshotHash(),
                command.auditRecordKey(),
                snapshot.groupCount(),
                snapshot.memberCount(),
                snapshot.aliasCount()
            );
            if (updated != 1) throw new IllegalStateException("canonical item group projection state was not published");
        }

        @Override
        public void appendAudit(AdminMutationCommand command, SnapshotStats snapshot) {
            jdbcTemplate.update("""
                INSERT INTO item_group_admin_audit
                  (record_key, actor, action, canonical_key, before_logical_key,
                   after_logical_key, canonical_snapshot_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                command.auditRecordKey(),
                command.actor(),
                command.action(),
                command.canonicalKey(),
                command.beforeLogicalKey(),
                command.afterLogicalKey(),
                snapshot.snapshotHash()
            );
        }

        private List<AliasValue> aliases(ItemGroupDTO group) {
            Map<String, AliasValue> aliases = new LinkedHashMap<>();
            addAlias(aliases, group.getCanonicalName(), "canonical_name");
            addAlias(aliases, group.getDisplayNameEn(), "display_name_en");
            addAlias(aliases, group.getDisplayNameZh(), "display_name_zh");
            for (String alias : group.getAliases() == null ? List.<String>of() : group.getAliases()) {
                addAlias(aliases, alias, "explicit");
            }
            return new ArrayList<>(aliases.values());
        }

        private void addAlias(Map<String, AliasValue> aliases, String value, String kind) {
            String aliasText = String.valueOf(value == null ? "" : value).trim();
            if (aliasText.isBlank()) return;
            String normalized = aliasText.replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
            aliases.putIfAbsent(normalized, new AliasValue(aliasText, normalized, kind));
        }

        private void validateResolvedMembers(ItemGroupDTO group) {
            if (group == null || group.getMembers() == null || group.getMembers().isEmpty()) {
                throw new IllegalArgumentException("canonical item group requires at least one resolved member");
            }
            for (ItemGroupMemberDTO member : group.getMembers()) {
                if (member == null || member.getItemId() == null) {
                    throw new IllegalArgumentException("canonical item group member itemId is required");
                }
            }
        }

        private String json(Object value) {
            try {
                return objectMapper.writeValueAsString(value);
            } catch (Exception exception) {
                throw new IllegalStateException("canonical item group JSON serialization failed", exception);
            }
        }

        private String canonicalObjectHash(String... keyValues) {
            Map<String, String> value = new LinkedHashMap<>();
            for (int index = 0; index < keyValues.length; index += 2) {
                value.put(keyValues[index], keyValues[index + 1]);
            }
            return hash(json(value));
        }

        private String hash(String value) {
            try {
                byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
                return java.util.HexFormat.of().formatHex(bytes);
            } catch (NoSuchAlgorithmException exception) {
                throw new IllegalStateException("SHA-256 is unavailable", exception);
            }
        }

        private String firstNonBlank(String... values) {
            for (String value : values) {
                String normalized = String.valueOf(value == null ? "" : value).trim();
                if (!normalized.isBlank() && !"null".equals(normalized)) return normalized;
            }
            return null;
        }

        private static String requireDatabaseIdentifier(String value, String role) {
            String normalized = String.valueOf(value == null ? "" : value).trim();
            if (!DATABASE_IDENTIFIER.matcher(normalized).matches()) {
                throw new IllegalArgumentException("invalid canonical item group " + role + " database identifier");
            }
            return normalized;
        }

        private String quoted(String database) {
            return "`" + database + "`";
        }

        private record AliasValue(String text, String normalized, String kind) {
        }
    }

    record SnapshotStats(String snapshotHash, int groupCount, int memberCount, int aliasCount) {
    }

    record AdminMutationCommand(
        String action,
        String canonicalKey,
        String sourceLayer,
        ItemGroupDTO group,
        String beforeLogicalKey,
        String afterLogicalKey,
        String auditRecordKey,
        String actor
    ) {
    }

    static String maintGroupRecordKey(String canonicalKey) {
        return sha256Static("{\"type\":\"maint_item_group\",\"canonicalKey\":\"" + canonicalKey
            + "\",\"sourceLayer\":\"central_override\",\"sourceKey\":\"admin.central_override\"}");
    }

    static String relationGroupRecordKey(String maintRecordKey) {
        return sha256Static("{\"type\":\"relation_item_group\",\"sourceMaintRecordKey\":\""
            + maintRecordKey + "\"}");
    }

    static String localGroupRecordKey(String relationRecordKey) {
        return sha256Static("{\"type\":\"local_item_group\",\"relationRecordKey\":\""
            + relationRecordKey + "\"}");
    }

    private static String sha256Static(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
