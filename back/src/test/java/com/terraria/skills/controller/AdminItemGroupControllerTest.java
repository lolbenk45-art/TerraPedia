package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemGroupDTO;
import com.terraria.skills.dto.ItemGroupMemberDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.RecipeTreeService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminItemGroupControllerTest {

    @TempDir
    Path tempDir;

    private String originalUserDir;
    private Path repoRoot;
    private ItemMapper itemMapper;
    private ItemImageMapper itemImageMapper;
    private RecipeTreeService recipeTreeService;
    private AdminItemGroupController controller;

    @BeforeEach
    void setUp() throws Exception {
        originalUserDir = System.getProperty("user.dir");
        repoRoot = tempDir.resolve("repo");
        Files.createDirectories(repoRoot.resolve("back"));
        Files.createDirectories(repoRoot.resolve("data/generated"));
        System.setProperty("user.dir", repoRoot.resolve("back").toString());

        itemMapper = mock(ItemMapper.class);
        itemImageMapper = mock(ItemImageMapper.class);
        recipeTreeService = mock(RecipeTreeService.class);
        controller = new AdminItemGroupController(new ObjectMapper(), itemMapper, itemImageMapper, recipeTreeService);
        when(itemImageMapper.selectList(any())).thenReturn(List.of());
    }

    @AfterEach
    void restoreUserDir() {
        if (originalUserDir == null) {
            System.clearProperty("user.dir");
        } else {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    @Test
    void getItemGroupsWrapsRecipeReferenceWithSourceMetadata() throws Exception {
        Files.writeString(repoRoot.resolve("data/generated/recipe-material-reference.json"), """
            {
              "generatedAt": "2026-04-21T21:30:20.219Z",
              "sourceType": "wiki_gg_live_english_recipes",
              "sourceUrls": [
                "https://terraria.wiki.gg/wiki/Recipes",
                "https://terraria.wiki.gg/wiki/Alternative_crafting_ingredients"
              ],
              "groups": [
                {
                  "canonicalName": "Any Wood",
                  "displayNameEn": "Any Wood",
                  "displayNameZh": "任意木材",
                  "members": [
                    { "internalName": "Wood", "name": "Wood", "nameZh": "木材" }
                  ]
                }
              ]
            }
            """);
        when(itemMapper.selectList(any())).thenReturn(List.of(item(9L, "Wood", "Wood", "木材")));

        ApiResponse<List<ItemGroupDTO>> body = controller.getItemGroups(null, null).getBody();

        assertNotNull(body);
        assertEquals(1, body.getData().size());
        ItemGroupDTO group = body.getData().get(0);
        assertEquals("Any Wood", group.getCanonicalName());
        assertEquals(List.of("recipe"), group.getDomains());
        assertEquals("generated_recipe_reference", group.getSourceKind());
        assertEquals("wiki_gg", group.getSourceProvider());
        assertEquals("wiki_gg_live_english_recipes", group.getSourceLabel());
        assertEquals("2026-04-21T21:30:20.219Z", group.getSourceUpdatedAt());
        assertTrue(group.getSourceUrls().contains("https://terraria.wiki.gg/wiki/Alternative_crafting_ingredients"));
        assertEquals("data/generated/recipe-material-reference.json", group.getSourceFile());
        assertFalse(group.isManualOnly());
        assertEquals(1, group.getMembers().size());
        assertEquals(9L, group.getMembers().get(0).getItemId());
    }

    @Test
    void getItemGroupsReportsUnresolvedMembersWithoutSynthesizingItems() throws Exception {
        Files.writeString(repoRoot.resolve("data/generated/item-group-overrides.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Pylon",
                  "displayNameEn": "Any Pylon",
                  "displayNameZh": "任意晶塔",
                  "domains": [ "npc_shop" ],
                  "sourceProvider": "wiki_gg",
                  "sourcePage": "https://terraria.wiki.gg/wiki/Pylons",
                  "members": [
                    { "internalName": "MissingPylon", "name": "Missing Pylon", "nameZh": "缺失晶塔" }
                  ]
                }
              ]
            }
            """);
        when(itemMapper.selectList(any())).thenReturn(List.of());

        ApiResponse<List<ItemGroupDTO>> body = controller.getItemGroups(null, null).getBody();

        assertNotNull(body);
        ItemGroupMemberDTO member = body.getData().get(0).getMembers().get(0);
        assertEquals("MissingPylon", member.getInternalName());
        assertEquals("Missing Pylon", member.getName());
        assertEquals("缺失晶塔", member.getNameZh());
        assertEquals(null, member.getItemId());
        assertEquals(Boolean.FALSE, member.getResolved());
        assertEquals("unresolved", member.getResolutionStatus());
        assertEquals("No active item matched internalName or name", member.getResolutionReason());
    }

    @Test
    void getItemGroupsResolvesMembersByItemIdWhenNamesAreMissing() throws Exception {
        Files.writeString(repoRoot.resolve("data/generated/item-group-overrides.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Pylon",
                  "displayNameEn": "Any Pylon",
                  "displayNameZh": "任意晶塔",
                  "domains": [ "npc_shop" ],
                  "sourceProvider": "wiki_gg",
                  "sourcePage": "https://terraria.wiki.gg/wiki/Pylons",
                  "members": [
                    { "itemId": 4875, "nameZh": "森林晶塔" }
                  ]
                }
              ]
            }
            """);
        when(itemMapper.selectList(any())).thenReturn(List.of(item(4875L, "TeleportationPylonPurity", "Forest Pylon", "森林晶塔")));

        ApiResponse<List<ItemGroupDTO>> body = controller.getItemGroups(null, null).getBody();

        assertNotNull(body);
        ItemGroupMemberDTO member = body.getData().get(0).getMembers().get(0);
        assertEquals(4875L, member.getItemId());
        assertEquals("TeleportationPylonPurity", member.getInternalName());
        assertEquals("Forest Pylon", member.getName());
        assertEquals("森林晶塔", member.getNameZh());
        assertEquals(Boolean.TRUE, member.getResolved());
        assertEquals("resolved", member.getResolutionStatus());
        assertEquals(null, member.getResolutionReason());
    }

    @Test
    void getItemGroupsUsesItemImageTableWhenResolvedItemImageIsMissing() throws Exception {
        Files.writeString(repoRoot.resolve("data/generated/item-group-overrides.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Pylon",
                  "displayNameEn": "Any Pylon",
                  "displayNameZh": "任意晶塔",
                  "domains": [ "shimmer" ],
                  "sourceProvider": "wiki_gg",
                  "sourcePage": "https://terraria.wiki.gg/wiki/Pylons",
                  "members": [
                    { "itemId": 4875, "internalName": "TeleportationPylonJungle", "name": "Jungle Pylon", "nameZh": "丛林晶塔" }
                  ]
                }
              ]
            }
            """);
        when(itemMapper.selectList(any())).thenReturn(List.of(item(4875L, "TeleportationPylonJungle", "Jungle Pylon", "丛林晶塔")));
        when(itemImageMapper.selectList(any())).thenReturn(List.of(itemImage(4875L, "https://terraria.wiki.gg/images/Jungle_Pylon.png")));

        ApiResponse<List<ItemGroupDTO>> body = controller.getItemGroups(null, null).getBody();

        assertNotNull(body);
        ItemGroupMemberDTO member = body.getData().get(0).getMembers().get(0);
        assertEquals("https://terraria.wiki.gg/images/Jungle_Pylon.png", member.getImage());
        assertEquals(Boolean.TRUE, member.getResolved());
    }

    @Test
    void createItemGroupWritesCentralOverrideWithTraceableSource() throws Exception {
        ItemGroupDTO request = new ItemGroupDTO();
        request.setCanonicalName("Any Pylon");
        request.setDisplayNameEn("Any Pylon");
        request.setDisplayNameZh("任意晶塔");
        request.setDomains(List.of("npc_shop", "shimmer"));
        request.setAliases(List.of("任何晶塔"));
        request.setSourceKind("manual_wiki_source");
        request.setSourceProvider("wiki_gg");
        request.setSourcePage("https://terraria.wiki.gg/wiki/Pylons");
        request.setSourceUrls(List.of("https://terraria.wiki.gg/wiki/Pylons"));
        request.setSourceLabel("Pylon group validated from wiki.gg");
        request.setMembers(List.of(member("TeleportationPylonPurity", "Forest Pylon", "森林晶塔")));
        when(itemMapper.selectList(any())).thenReturn(List.of(item(4875L, "TeleportationPylonPurity", "Forest Pylon", "森林晶塔")));

        ApiResponse<ItemGroupDTO> body = controller.createItemGroup(request).getBody();

        assertNotNull(body);
        assertEquals("Any Pylon", body.getData().getCanonicalName());
        assertEquals(List.of("npc_shop", "shimmer"), body.getData().getDomains());
        assertEquals("data/generated/item-group-overrides.json", body.getData().getSourceFile());
        assertTrue(body.getData().isManualOnly());
        Path output = repoRoot.resolve("data/generated/item-group-overrides.json");
        assertTrue(Files.exists(output));
        String json = Files.readString(output);
        assertTrue(json.contains("\"canonicalName\" : \"Any Pylon\""));
        assertTrue(json.contains("\"sourcePage\" : \"https://terraria.wiki.gg/wiki/Pylons\""));
        assertTrue(json.contains("\"domains\" : [ \"npc_shop\", \"shimmer\" ]"));
        assertFalse(json.contains("resolutionStatus"));
        assertFalse(json.contains("resolutionReason"));
        assertFalse(json.contains("\"resolved\""));
        verify(recipeTreeService).invalidateCaches();
    }

    @Test
    void createItemGroupDoesNotOverwriteMalformedCentralOverrideFile() throws Exception {
        Path output = repoRoot.resolve("data/generated/item-group-overrides.json");
        Files.writeString(output, "{ malformed json");

        ItemGroupDTO request = new ItemGroupDTO();
        request.setCanonicalName("Any Pylon");
        request.setDisplayNameEn("Any Pylon");
        request.setDomains(List.of("npc_shop"));
        request.setSourceProvider("wiki_gg");
        request.setSourcePage("https://terraria.wiki.gg/wiki/Pylons");
        request.setMembers(List.of(member("TeleportationPylonPurity", "Forest Pylon", "妫灄鏅跺")));

        ApiResponse<ItemGroupDTO> body = controller.createItemGroup(request).getBody();

        assertNotNull(body);
        assertEquals(400, body.getStatusCode());
        assertTrue(Files.readString(output).contains("malformed json"));
    }

    @Test
    void updateItemGroupRejectsCentralRecipeOverrideForRecipeReferenceGroup() throws Exception {
        Files.writeString(repoRoot.resolve("data/generated/recipe-material-reference.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Wood",
                  "displayNameEn": "Any Wood",
                  "members": [
                    { "internalName": "Wood", "name": "Wood" }
                  ]
                }
              ]
            }
            """);

        ItemGroupDTO request = new ItemGroupDTO();
        request.setDisplayNameEn("Any Wood");
        request.setDomains(List.of("recipe"));
        request.setSourceProvider("wiki_gg");
        request.setSourcePage("https://terraria.wiki.gg/wiki/Recipes");
        request.setMembers(List.of(member("StoneBlock", "Stone Block", "Stone Block")));

        ApiResponse<ItemGroupDTO> body = controller.updateItemGroup("Any Wood", request).getBody();

        assertNotNull(body);
        assertEquals(400, body.getStatusCode());
        assertTrue(body.getMessage().contains("recipe group"));
        assertFalse(Files.exists(repoRoot.resolve("data/generated/item-group-overrides.json")));
    }

    @Test
    void createItemGroupRejectsRecipeDomainAliasCollisionWithRecipeReferenceGroup() throws Exception {
        Files.writeString(repoRoot.resolve("data/generated/recipe-material-reference.json"), """
            {
              "groups": [
                {
                  "canonicalName": "Any Wood",
                  "displayNameEn": "Any Wood",
                  "members": [
                    { "internalName": "Wood", "name": "Wood" }
                  ]
                }
              ]
            }
            """);

        ItemGroupDTO request = new ItemGroupDTO();
        request.setCanonicalName("Any Timber");
        request.setDisplayNameEn("Any Timber");
        request.setAliases(List.of("Any Wood"));
        request.setDomains(List.of("recipe"));
        request.setSourceProvider("wiki_gg");
        request.setSourcePage("https://terraria.wiki.gg/wiki/Recipes");
        request.setMembers(List.of(member("StoneBlock", "Stone Block", "Stone Block")));

        ApiResponse<ItemGroupDTO> body = controller.createItemGroup(request).getBody();

        assertNotNull(body);
        assertEquals(400, body.getStatusCode());
        assertTrue(body.getMessage().contains("recipe group"));
        assertFalse(Files.exists(repoRoot.resolve("data/generated/item-group-overrides.json")));
    }

    private ItemGroupMemberDTO member(String internalName, String name, String nameZh) {
        ItemGroupMemberDTO member = new ItemGroupMemberDTO();
        member.setInternalName(internalName);
        member.setName(name);
        member.setNameZh(nameZh);
        return member;
    }

    private Item item(Long id, String internalName, String name, String nameZh) {
        Item item = new Item();
        item.setId(id);
        item.setInternalName(internalName);
        item.setName(name);
        item.setNameZh(nameZh);
        item.setDeleted(0);
        item.setStatus(1);
        return item;
    }

    private ItemImage itemImage(Long itemId, String originalUrl) {
        ItemImage image = new ItemImage();
        image.setItemId(itemId);
        image.setRole("icon");
        image.setProvider("wiki_gg");
        image.setSourceFileTitle("Jungle Pylon.png");
        image.setSourcePage("Jungle Pylon");
        image.setOriginalUrl(originalUrl);
        image.setCachedUrl(originalUrl);
        image.setIsPrimary(true);
        image.setSortOrder(0);
        image.setStatus(1);
        image.setDeleted(0);
        return image;
    }
}
