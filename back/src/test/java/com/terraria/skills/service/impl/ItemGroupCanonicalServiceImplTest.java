package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemGroupDTO;
import com.terraria.skills.dto.ItemGroupMemberDTO;
import com.terraria.skills.mapper.ItemGroupCanonicalMapper;
import com.terraria.skills.service.ItemGroupCanonicalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemGroupCanonicalServiceImplTest {

    @Mock
    private ItemGroupCanonicalMapper mapper;

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        lenient().when(mapper.selectProjectionState()).thenReturn(Map.of(
            "canonicalSnapshotHash", "a".repeat(64),
            "publicationStatus", "PUBLISHED",
            "groupCount", 1,
            "memberCount", 1,
            "aliasCount", 1
        ));
        lenient().when(mapper.selectProjectionCounts()).thenReturn(Map.of(
            "groupCount", 1,
            "memberCount", 1,
            "aliasCount", 1
        ));
    }

    @Test
    void readsEachConsumerThroughItsExactSourceLayerAllowlist() {
        List<String> allowedLayers = List.of("recipe_reference", "central_override");
        when(mapper.selectGroups(allowedLayers)).thenReturn(List.of(Map.of(
            "recordKey", "group-record",
            "canonicalKey", "any-wood",
            "canonicalName", "Any Wood",
            "name", "Any Wood",
            "nameZh", "任意木材",
            "normalizedDomainsJson", "[\"recipe\"]",
            "sourceLayer", "recipe_reference",
            "sourcePriority", 100,
            "sourceContentHash", "b".repeat(64),
            "status", "ACTIVE"
        )));
        when(mapper.selectMembers(allowedLayers)).thenReturn(List.of(Map.of(
            "groupRecordKey", "group-record",
            "itemId", 9L,
            "internalName", "Wood",
            "name", "Wood",
            "nameZh", "木材",
            "resolutionState", "RESOLVED"
        )));
        when(mapper.selectAliases(allowedLayers)).thenReturn(List.of(Map.of(
            "groupRecordKey", "group-record",
            "aliasText", "Wood Group",
            "normalizedAlias", "wood group",
            "aliasKind", "explicit"
        )));
        ItemGroupCanonicalService service = new ItemGroupCanonicalServiceImpl(
            mapper,
            objectMapper,
            command -> command.group(),
            true
        );

        List<ItemGroupDTO> groups = service.listGroups(ItemGroupCanonicalService.Consumer.ADMIN_RECIPE_GROUPS);

        assertEquals(1, groups.size());
        assertEquals("Any Wood", groups.get(0).getCanonicalName());
        assertEquals(List.of("recipe"), groups.get(0).getDomains());
        assertEquals(List.of("Wood Group"), groups.get(0).getAliases());
        assertEquals(9L, groups.get(0).getMembers().get(0).getItemId());
        assertEquals("canonical:recipe_reference", groups.get(0).getSourceKind());
        assertEquals("canonical:item_groups", groups.get(0).getSourceFile());
        verify(mapper).selectGroups(allowedLayers);
        verify(mapper).selectMembers(allowedLayers);
        verify(mapper).selectAliases(allowedLayers);
    }

    @Test
    void failsClosedWhenPublishedStateCountsDoNotMatchRows() {
        when(mapper.selectProjectionCounts()).thenReturn(Map.of(
            "groupCount", 0,
            "memberCount", 0,
            "aliasCount", 0
        ));
        ItemGroupCanonicalService service = new ItemGroupCanonicalServiceImpl(
            mapper,
            objectMapper,
            command -> command.group(),
            true
        );

        IllegalStateException error = assertThrows(IllegalStateException.class, () -> {
            service.listGroups(ItemGroupCanonicalService.Consumer.RECIPE_EXPANSION);
        });

        assertTrue(error.getMessage().contains("projection state count mismatch"));
    }

    @Test
    void crossServerTopologyKeepsReadsAvailableAndDisablesSynchronousWrites() {
        when(mapper.selectGroups(List.of("recipe_reference"))).thenReturn(List.of());
        when(mapper.selectMembers(List.of("recipe_reference"))).thenReturn(List.of());
        when(mapper.selectAliases(List.of("recipe_reference"))).thenReturn(List.of());
        when(mapper.selectProjectionState()).thenReturn(Map.of(
            "canonicalSnapshotHash", "a".repeat(64),
            "publicationStatus", "PUBLISHED",
            "groupCount", 0,
            "memberCount", 0,
            "aliasCount", 0
        ));
        when(mapper.selectProjectionCounts()).thenReturn(Map.of(
            "groupCount", 0,
            "memberCount", 0,
            "aliasCount", 0
        ));
        ItemGroupCanonicalService service = new ItemGroupCanonicalServiceImpl(
            mapper,
            objectMapper,
            command -> command.group(),
            false
        );

        assertTrue(service.listGroups(ItemGroupCanonicalService.Consumer.RECIPE_EXPANSION).isEmpty());
        assertFalse(service.getWriteAvailability().enabled());
        assertTrue(service.getWriteAvailability().reason().contains("same-server"));
        assertThrows(IllegalStateException.class, () -> service.createCentralOverride(new ItemGroupDTO(), "alice"));
    }

    @Test
    void adminMutationDelegatesOneAtomicCommandWithAppendOnlyAuditIdentity() {
        AtomicReference<ItemGroupCanonicalServiceImpl.AdminMutationCommand> captured = new AtomicReference<>();
        ItemGroupCanonicalServiceImpl.AdminMutationStore store = command -> {
            captured.set(command);
            return command.group();
        };
        ItemGroupCanonicalService service = new ItemGroupCanonicalServiceImpl(mapper, objectMapper, store, true);
        ItemGroupDTO request = new ItemGroupDTO();
        request.setCanonicalName("Any Pylon");
        request.setDisplayNameEn("Any Pylon");
        request.setDomains(List.of("shimmer"));
        ItemGroupMemberDTO member = new ItemGroupMemberDTO();
        member.setItemId(4876L);
        member.setInternalName("TeleportationPylonPurity");
        request.setMembers(List.of(member));

        ItemGroupDTO result = service.createCentralOverride(request, "alice");

        assertEquals("Any Pylon", result.getCanonicalName());
        assertEquals("CREATE", captured.get().action());
        assertEquals("any-pylon", captured.get().canonicalKey());
        assertEquals("central_override", captured.get().sourceLayer());
        assertEquals("alice", captured.get().actor());
        assertEquals(64, captured.get().auditRecordKey().length());
        assertTrue(service.getWriteAvailability().enabled());
    }

    @Test
    void adminMutationRejectsBoundedPayloadCapsBeforeEnteringTheStore() {
        ItemGroupCanonicalService service = new ItemGroupCanonicalServiceImpl(
            mapper,
            objectMapper,
            command -> command.group(),
            true
        );
        ItemGroupMemberDTO member = new ItemGroupMemberDTO();
        member.setItemId(9L);
        member.setInternalName("Wood");

        ItemGroupDTO tooManyMembers = groupRequest();
        tooManyMembers.setMembers(Collections.nCopies(161, member));
        assertThrows(IllegalArgumentException.class, () -> {
            service.createCentralOverride(tooManyMembers, "alice");
        });

        ItemGroupDTO tooManyAliases = groupRequest();
        tooManyAliases.setAliases(Collections.nCopies(33, "wood"));
        assertThrows(IllegalArgumentException.class, () -> {
            service.createCentralOverride(tooManyAliases, "alice");
        });

        ItemGroupDTO oversized = groupRequest();
        oversized.setDisplayNameZh("x".repeat(1_048_577));
        assertThrows(IllegalArgumentException.class, () -> {
            service.createCentralOverride(oversized, "alice");
        });
    }

    @Test
    void canonicalRecordKeysMatchNodeProjectionContract() {
        String maint = ItemGroupCanonicalServiceImpl.maintGroupRecordKey("any-pylon");
        String relation = ItemGroupCanonicalServiceImpl.relationGroupRecordKey(maint);
        String local = ItemGroupCanonicalServiceImpl.localGroupRecordKey(relation);

        assertEquals("939bcc909e629247ac93c016ccd9ddb4b611deab18b06ddc409e034cd9295d4f", maint);
        assertEquals("2041a130f5d569036adfccd6b999bf058f0b1bec7a9b1832f4b0ab6359c5a5df", relation);
        assertEquals("ed82517c4d9b3697b8c1c9de3cfbda3666361eb31f866ecfe3e96442248d857e", local);
    }

    @Test
    void transactionalMutationStorePublishesStateAndAuditInsideOneTransaction() {
        List<String> events = new ArrayList<>();
        ItemGroupCanonicalServiceImpl.TransactionRunner transactionRunner = callback -> {
            events.add("begin");
            ItemGroupDTO result = callback.get();
            events.add("commit");
            return result;
        };
        ItemGroupCanonicalServiceImpl.AdminMutationGateway gateway = new ItemGroupCanonicalServiceImpl.AdminMutationGateway() {
            @Override
            public void lockProjectionState() {
                events.add("lock");
            }

            @Override
            public void validateMutation(ItemGroupCanonicalServiceImpl.AdminMutationCommand command) {
                events.add("validate");
            }

            @Override
            public void applyMutation(ItemGroupCanonicalServiceImpl.AdminMutationCommand command) {
                events.add("mutate:" + command.action());
            }

            @Override
            public ItemGroupCanonicalServiceImpl.SnapshotStats readSnapshotStats() {
                events.add("snapshot");
                return new ItemGroupCanonicalServiceImpl.SnapshotStats("c".repeat(64), 1, 1, 1);
            }

            @Override
            public void publishState(
                ItemGroupCanonicalServiceImpl.AdminMutationCommand command,
                ItemGroupCanonicalServiceImpl.SnapshotStats snapshot
            ) {
                events.add("publish:" + snapshot.snapshotHash());
            }

            @Override
            public void appendAudit(
                ItemGroupCanonicalServiceImpl.AdminMutationCommand command,
                ItemGroupCanonicalServiceImpl.SnapshotStats snapshot
            ) {
                events.add("audit:" + snapshot.snapshotHash());
            }
        };
        ItemGroupCanonicalServiceImpl.AdminMutationStore store =
            new ItemGroupCanonicalServiceImpl.TransactionalAdminMutationStore(transactionRunner, gateway);
        ItemGroupDTO group = new ItemGroupDTO();
        group.setCanonicalName("Any Pylon");
        ItemGroupCanonicalServiceImpl.AdminMutationCommand command =
            new ItemGroupCanonicalServiceImpl.AdminMutationCommand(
                "CREATE",
                "any-pylon",
                "central_override",
                group,
                null,
                "any-pylon",
                "d".repeat(64),
                "admin"
            );

        assertEquals(group, store.commit(command));
        assertEquals(List.of(
            "begin",
            "lock",
            "validate",
            "mutate:CREATE",
            "snapshot",
            "publish:" + "c".repeat(64),
            "audit:" + "c".repeat(64),
            "commit"
        ), events);
    }

    @Test
    void topologyComparisonUsesJdbcServerIdentityAndFailsClosedOnMalformedUrls() {
        assertTrue(ItemGroupCanonicalServiceImpl.hasSameServerTopology(
            "jdbc:mysql://localhost:3306/local",
            "jdbc:mysql://localhost:3306/maint",
            "jdbc:mysql://localhost:3306/relation"
        ));
        assertFalse(ItemGroupCanonicalServiceImpl.hasSameServerTopology(
            "jdbc:mysql://localhost:3306/local",
            "jdbc:mysql://db.example:3306/maint",
            "jdbc:mysql://localhost:3306/relation"
        ));
        assertFalse(ItemGroupCanonicalServiceImpl.hasSameServerTopology("not-jdbc", "not-jdbc", "not-jdbc"));
    }

    @Test
    void jdbcGatewayWritesMaintRelationLocalStateAndAppendOnlyAuditTables() {
        List<String> sql = new ArrayList<>();
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class, invocation -> {
            if ("update".equals(invocation.getMethod().getName())) {
                sql.add(invocation.getArgument(0));
                return 1;
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
        });
        when(jdbcTemplate.queryForObject(
            org.mockito.ArgumentMatchers.contains("SELECT id FROM item_groups"),
            org.mockito.ArgumentMatchers.eq(Long.class),
            org.mockito.ArgumentMatchers.<Object[]>any()
        )).thenReturn(17L);

        ItemGroupDTO group = new ItemGroupDTO();
        group.setCanonicalName("Any Pylon");
        group.setDisplayNameEn("Any Pylon");
        group.setDisplayNameZh("任何晶塔");
        group.setDomains(List.of("shimmer"));
        group.setAliases(List.of("Any Teleportation Pylon"));
        ItemGroupMemberDTO member = new ItemGroupMemberDTO();
        member.setItemId(4876L);
        member.setInternalName("TeleportationPylonPurity");
        member.setName("Forest Pylon");
        member.setNameZh("森林晶塔");
        group.setMembers(List.of(member));
        ItemGroupCanonicalServiceImpl.AdminMutationCommand command =
            new ItemGroupCanonicalServiceImpl.AdminMutationCommand(
                "CREATE",
                "any-pylon",
                "central_override",
                group,
                null,
                "any-pylon",
                "d".repeat(64),
                "admin"
            );
        ItemGroupCanonicalServiceImpl.JdbcAdminMutationGateway gateway =
            new ItemGroupCanonicalServiceImpl.JdbcAdminMutationGateway(
                jdbcTemplate,
                objectMapper,
                "test_maint",
                "test_relation"
            );

        gateway.applyMutation(command);
        ItemGroupCanonicalServiceImpl.SnapshotStats snapshot =
            new ItemGroupCanonicalServiceImpl.SnapshotStats("c".repeat(64), 1, 1, 1);
        gateway.publishState(command, snapshot);
        gateway.appendAudit(command, snapshot);

        String statements = String.join("\n", sql);
        assertTrue(statements.contains("`test_maint`.`maint_item_groups`"));
        assertTrue(statements.contains("`test_relation`.`relation_item_groups`"));
        assertTrue(statements.contains("INSERT INTO item_groups"));
        assertTrue(statements.contains("UPDATE item_group_projection_state"));
        assertTrue(statements.contains("INSERT INTO item_group_admin_audit"));
        assertFalse(statements.contains("recipe-material-reference.json"));
        assertFalse(statements.contains("item-group-overrides.json"));
    }

    @Test
    void jdbcGatewayRejectsAliasCollisionWhileHoldingTheProjectionFence() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(
            org.mockito.ArgumentMatchers.contains("FROM item_groups"),
            org.mockito.ArgumentMatchers.<Object[]>any()
        )).thenReturn(List.of(Map.of(
            "canonical_key", "any-wood",
            "canonical_name", "Any Wood",
            "name", "Any Wood",
            "name_zh", "任意木材"
        )));
        ItemGroupCanonicalServiceImpl.JdbcAdminMutationGateway gateway =
            new ItemGroupCanonicalServiceImpl.JdbcAdminMutationGateway(
                jdbcTemplate,
                objectMapper,
                "test_maint",
                "test_relation"
            );
        ItemGroupDTO group = groupRequest();
        group.setCanonicalName("Any Timber");
        group.setDisplayNameEn("Any Timber");
        group.setAliases(List.of("Any Wood"));
        ItemGroupCanonicalServiceImpl.AdminMutationCommand command =
            new ItemGroupCanonicalServiceImpl.AdminMutationCommand(
                "CREATE",
                "any-timber",
                "central_override",
                group,
                null,
                "any-timber",
                "d".repeat(64),
                "alice"
            );

        assertThrows(IllegalArgumentException.class, () -> gateway.validateMutation(command));
    }

    @Test
    void jdbcGatewaySnapshotHashMatchesTheNodeLocalProjectionContract() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForList(org.mockito.ArgumentMatchers.contains("FROM item_groups WHERE")))
            .thenReturn(List.of(Map.ofEntries(
                Map.entry("record_key", "0c2120dac9c607d04892703ac76428dd3eee83d5c48a4bf74fdd97da46071420"),
                Map.entry("canonical_key", "any-wood"),
                Map.entry("canonical_name", "Any Wood"),
                Map.entry("name", "Any Wood"),
                Map.entry("name_zh", "any wood"),
                Map.entry("normalized_domains_json", "[]"),
                Map.entry("source_layer", "recipe_reference"),
                Map.entry("source_priority", 100),
                Map.entry("relation_record_key", "a7820373f800c9a6619045e8226c62b9c38e3c17f9a6d05841995a87b9457963"),
                Map.entry("source_content_hash", "a".repeat(64)),
                Map.entry("canonical_version", 1),
                Map.entry("status", "ACTIVE")
            )));
        Map<String, Object> memberRow = new LinkedHashMap<>();
        memberRow.put("record_key", "c5913990b12f70e6ccdadb896a7f2ab21fb2fd0cc8b252a8b24b56672141e394");
        memberRow.put("group_record_key", "0c2120dac9c607d04892703ac76428dd3eee83d5c48a4bf74fdd97da46071420");
        memberRow.put("item_id", 9);
        memberRow.put("source_item_id", null);
        memberRow.put("member_key", "Wood");
        memberRow.put("internal_name", "Wood");
        memberRow.put("name", "Wood");
        memberRow.put("name_zh", "wood");
        memberRow.put("sort_order", 0);
        memberRow.put("resolution_state", "RESOLVED");
        when(jdbcTemplate.queryForList(org.mockito.ArgumentMatchers.contains("FROM item_group_members m")))
            .thenReturn(List.of(memberRow));
        Map<String, Object> aliasRow = new LinkedHashMap<>();
        aliasRow.put("record_key", "635e35167fc323dee6d1cf3ff303e4f7cd98dd73a390186cde24121524b4e311");
        aliasRow.put("group_record_key", "0c2120dac9c607d04892703ac76428dd3eee83d5c48a4bf74fdd97da46071420");
        aliasRow.put("alias_text", "Any Wood");
        aliasRow.put("normalized_alias", "any wood");
        aliasRow.put("alias_kind", "canonical_name");
        aliasRow.put("alias_language", null);
        aliasRow.put("sort_order", 0);
        when(jdbcTemplate.queryForList(org.mockito.ArgumentMatchers.contains("FROM item_group_aliases a")))
            .thenReturn(List.of(aliasRow));
        ItemGroupCanonicalServiceImpl.JdbcAdminMutationGateway gateway =
            new ItemGroupCanonicalServiceImpl.JdbcAdminMutationGateway(
                jdbcTemplate,
                objectMapper,
                "test_maint",
                "test_relation"
            );

        ItemGroupCanonicalServiceImpl.SnapshotStats snapshot = gateway.readSnapshotStats();

        assertEquals("4cc494d4d844badd548f79e8a33d54c87595155374cdb13f905c1c9fbc0f8d1d", snapshot.snapshotHash());
        assertEquals(1, snapshot.groupCount());
        assertEquals(1, snapshot.memberCount());
        assertEquals(1, snapshot.aliasCount());
    }

    private ItemGroupDTO groupRequest() {
        ItemGroupDTO group = new ItemGroupDTO();
        group.setCanonicalName("Any Wood");
        group.setDisplayNameEn("Any Wood");
        group.setDomains(List.of("recipe"));
        group.setAliases(List.of());
        ItemGroupMemberDTO member = new ItemGroupMemberDTO();
        member.setItemId(9L);
        member.setInternalName("Wood");
        group.setMembers(List.of(member));
        return group;
    }
}
