package com.terraria.skills.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.dto.ItemSourceDTO;
import com.terraria.skills.dto.PublicItemArmorAttributeDTO;
import com.terraria.skills.dto.PublicItemBuffEffectDTO;
import com.terraria.skills.dto.PublicItemEquipmentEffectDTO;
import com.terraria.skills.service.ItemImageService;
import com.terraria.skills.service.ItemSourceService;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import com.terraria.skills.service.PublicItemService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PublicItemRelationControllerTest {

    private static final ManagedImageUrlPolicy MANAGED_IMAGE_URL_POLICY = new ManagedImageUrlPolicy() {
        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.startsWith("http://localhost:9000/terrapedia-images/");
        }

        @Override
        public List<String> trustedManagedImageUrlPrefixes() {
            return List.of("http://localhost:9000/terrapedia-images/");
        }
    };

    @Mock
    private ItemImageService itemImageService;

    @Mock
    private ItemSourceService itemSourceService;

    @Mock
    private PublicItemService publicItemService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
            .standaloneSetup(new PublicItemRelationController(itemImageService, itemSourceService, publicItemService, MANAGED_IMAGE_URL_POLICY))
            .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper()))
            .build();
    }

    @Test
    void shouldReturnOnlyManagedPublicImages() throws Exception {
        ItemImageDTO managed = new ItemImageDTO();
        managed.setId(1L);
        managed.setItemId(77L);
        managed.setRole("icon");
        managed.setProvider("wiki");
        managed.setSourceFileTitle("Night Edge.png");
        managed.setSourcePage("https://terraria.wiki.gg/wiki/Night_Edge");
        managed.setOriginalUrl("https://terraria.wiki.gg/images/Night_Edge.png");
        managed.setCachedUrl("http://localhost:9000/terrapedia-images/items/night-edge.png");
        managed.setImageUrl("http://localhost:9000/terrapedia-images/items/night-edge.png");
        managed.setIsPrimary(true);

        ItemImageDTO wikiOnly = new ItemImageDTO();
        wikiOnly.setId(2L);
        wikiOnly.setItemId(77L);
        wikiOnly.setImageUrl("https://terraria.wiki.gg/images/Leak.png");

        ItemImageDTO fakeManagedPath = new ItemImageDTO();
        fakeManagedPath.setId(3L);
        fakeManagedPath.setItemId(77L);
        fakeManagedPath.setImageUrl("https://example.com/terrapedia-images/items/fake.png");
        fakeManagedPath.setCachedUrl("https://example.com/terrapedia-images/items/fake.png");

        when(itemImageService.getImagesByItemId(77L)).thenReturn(List.of(managed, wikiOnly, fakeManagedPath));

        mockMvc.perform(get("/public/items/77/images"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].id").value(1))
            .andExpect(jsonPath("$.data[0].imageUrl").value("http://localhost:9000/terrapedia-images/items/night-edge.png"))
            .andExpect(jsonPath("$.data[0].provider").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceFileTitle").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[0].originalUrl").doesNotExist())
            .andExpect(jsonPath("$.data[0].cachedUrl").doesNotExist());

        verify(itemImageService).getImagesByItemId(77L);
    }

    @Test
    void shouldReturnPublicSourcesWithoutProvenanceFields() throws Exception {
        ItemSourceDTO source = new ItemSourceDTO();
        source.setId(3L);
        source.setItemId(88L);
        source.setSourceType("drop");
        source.setSourceRefName("Guide");
        source.setConditions("night only https://terraria.wiki.gg/wiki/Night");
        source.setNotes("see https://static.wikia.nocookie.net/terraria_gamepedia/images/Guide.png");
        source.setSourceProvider("terraria.wiki.gg");
        source.setSourcePage("https://terraria.wiki.gg/wiki/Guide");

        when(itemSourceService.getSourcesByItemId(88L)).thenReturn(List.of(source));

        mockMvc.perform(get("/public/items/88/sources"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].id").value(3))
            .andExpect(jsonPath("$.data[0].sourceType").value("drop"))
            .andExpect(jsonPath("$.data[0].sourceRefName").value("Guide"))
            .andExpect(jsonPath("$.data[0].conditions").doesNotExist())
            .andExpect(jsonPath("$.data[0].notes").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceProvider").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceRevisionTimestamp").doesNotExist());

        verify(itemSourceService).getSourcesByItemId(88L);
    }

    @Test
    void shouldReturnMagicMirrorPublicSourcesWithSourceRefTypes() throws Exception {
        ItemSourceDTO goldChest = new ItemSourceDTO();
        goldChest.setId(50L);
        goldChest.setItemId(50L);
        goldChest.setSourceType("container");
        goldChest.setSourceRefType("container");
        goldChest.setSourceRefName("Gold Chest");
        goldChest.setQuantityText("1");
        goldChest.setChanceText("1/6 (16.67%)");
        goldChest.setSourceProvider("terraria.wiki.gg");
        goldChest.setSourcePage("https://terraria.wiki.gg/wiki/Magic_Mirrors");

        ItemSourceDTO mimic = new ItemSourceDTO();
        mimic.setId(51L);
        mimic.setItemId(50L);
        mimic.setSourceType("drop");
        mimic.setSourceRefType("npc");
        mimic.setSourceRefName("Mimic");
        mimic.setNpcImageUrl("http://localhost:9000/terrapedia-images/npcs/mimic.png");

        ItemSourceDTO worldgen = new ItemSourceDTO();
        worldgen.setId(52L);
        worldgen.setItemId(50L);
        worldgen.setSourceType("worldgen");
        worldgen.setSourceRefType("world");
        worldgen.setSourceRefName("Magic Mirrors worldgen");

        when(itemSourceService.getSourcesByItemId(50L)).thenReturn(List.of(goldChest, mimic, worldgen));

        mockMvc.perform(get("/public/items/50/sources"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(3))
            .andExpect(jsonPath("$.data[0].sourceRefType").value("container"))
            .andExpect(jsonPath("$.data[0].sourceRefName").value("Gold Chest"))
            .andExpect(jsonPath("$.data[0].sourceProvider").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[1].sourceRefType").value("npc"))
            .andExpect(jsonPath("$.data[1].npcImageUrl").value("http://localhost:9000/terrapedia-images/npcs/mimic.png"))
            .andExpect(jsonPath("$.data[2].sourceRefType").value("world"))
            .andExpect(jsonPath("$.data[2].sourceRefName").value("Magic Mirrors worldgen"));

        verify(itemSourceService).getSourcesByItemId(50L);
    }

    @Test
    void shouldReturnProjectedNpcAndBiomeEvidenceFields() throws Exception {
        ItemSourceDTO npcProjection = new ItemSourceDTO();
        npcProjection.setId(700L);
        npcProjection.setItemId(1586L);
        npcProjection.setEvidenceKind("npc_relation");
        npcProjection.setSourceFactKey("npc_loot:700");
        npcProjection.setLootEntryId(700L);
        npcProjection.setDropSourceKind("npc_drop");
        npcProjection.setSourceType("drop");
        npcProjection.setSourceRefType("npc");
        npcProjection.setSourceRefId(42L);
        npcProjection.setSourceRefName("Cenx");
        npcProjection.setNpcDetailPath("/npcs/42");

        ItemSourceDTO biomeProjection = new ItemSourceDTO();
        biomeProjection.setId(800L);
        biomeProjection.setItemId(1827L);
        biomeProjection.setEvidenceKind("biome_resource");
        biomeProjection.setSourceFactKey("biome_resource:800");
        biomeProjection.setSourceType("worldgen");
        biomeProjection.setSourceRefType("world");
        biomeProjection.setSourceRefName("Halloween biome drop");
        biomeProjection.setBiomeId(9L);
        biomeProjection.setBiomeCode("halloween");
        biomeProjection.setBiomeNameZh("万圣节");
        biomeProjection.setBiomeDetailPath("/biomes/9");

        when(itemSourceService.getSourcesByItemId(1586L)).thenReturn(List.of(npcProjection, biomeProjection));

        mockMvc.perform(get("/public/items/1586/sources"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].evidenceKind").value("npc_relation"))
            .andExpect(jsonPath("$.data[0].sourceFactKey").value("npc_loot:700"))
            .andExpect(jsonPath("$.data[0].lootEntryId").value(700))
            .andExpect(jsonPath("$.data[0].dropSourceKind").value("npc_drop"))
            .andExpect(jsonPath("$.data[0].npcDetailPath").value("/npcs/42"))
            .andExpect(jsonPath("$.data[1].evidenceKind").value("biome_resource"))
            .andExpect(jsonPath("$.data[1].sourceFactKey").value("biome_resource:800"))
            .andExpect(jsonPath("$.data[1].biomeDetailPath").value("/biomes/9"))
            .andExpect(jsonPath("$.data[1].biomeNameZh").value("万圣节"));

        verify(itemSourceService).getSourcesByItemId(1586L);
    }

    @Test
    void shouldReturnOnlyManagedPublicSourceImages() throws Exception {
        ItemSourceDTO managedNpcSource = new ItemSourceDTO();
        managedNpcSource.setId(4L);
        managedNpcSource.setItemId(88L);
        managedNpcSource.setSourceType("shop");
        managedNpcSource.setSourceRefType("npc");
        managedNpcSource.setSourceRefName("Merchant");
        managedNpcSource.setImageUrl("http://localhost:9000/terrapedia-images/npcs/merchant.png");
        managedNpcSource.setSourceRefImageUrl("http://localhost:9000/terrapedia-images/npcs/merchant.png");
        managedNpcSource.setNpcImageUrl("http://localhost:9000/terrapedia-images/npcs/merchant.png");

        ItemSourceDTO managedItemSource = new ItemSourceDTO();
        managedItemSource.setId(5L);
        managedItemSource.setItemId(88L);
        managedItemSource.setSourceType("craft");
        managedItemSource.setSourceRefType("item");
        managedItemSource.setSourceRefName("Wood");
        managedItemSource.setImageUrl("http://localhost:9000/terrapedia-images/items/wood.png");
        managedItemSource.setSourceRefImageUrl("http://localhost:9000/terrapedia-images/items/wood.png");
        managedItemSource.setItemImageUrl("http://localhost:9000/terrapedia-images/items/wood.png");

        ItemSourceDTO wikiSource = new ItemSourceDTO();
        wikiSource.setId(6L);
        wikiSource.setItemId(88L);
        wikiSource.setSourceType("drop");
        wikiSource.setSourceRefType("npc");
        wikiSource.setSourceRefName("Zombie");
        wikiSource.setImageUrl("https://terraria.wiki.gg/images/Zombie.png");
        wikiSource.setSourceRefImageUrl("https://terraria.wiki.gg/images/Zombie.png");
        wikiSource.setNpcImageUrl("https://terraria.wiki.gg/images/Zombie.png");

        when(itemSourceService.getSourcesByItemId(88L)).thenReturn(List.of(managedNpcSource, managedItemSource, wikiSource));

        mockMvc.perform(get("/public/items/88/sources"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(3))
            .andExpect(jsonPath("$.data[0].imageUrl").value("http://localhost:9000/terrapedia-images/npcs/merchant.png"))
            .andExpect(jsonPath("$.data[0].sourceRefImageUrl").value("http://localhost:9000/terrapedia-images/npcs/merchant.png"))
            .andExpect(jsonPath("$.data[0].npcImageUrl").value("http://localhost:9000/terrapedia-images/npcs/merchant.png"))
            .andExpect(jsonPath("$.data[0].itemImageUrl").doesNotExist())
            .andExpect(jsonPath("$.data[1].imageUrl").value("http://localhost:9000/terrapedia-images/items/wood.png"))
            .andExpect(jsonPath("$.data[1].sourceRefImageUrl").value("http://localhost:9000/terrapedia-images/items/wood.png"))
            .andExpect(jsonPath("$.data[1].itemImageUrl").value("http://localhost:9000/terrapedia-images/items/wood.png"))
            .andExpect(jsonPath("$.data[1].npcImageUrl").doesNotExist())
            .andExpect(jsonPath("$.data[2].imageUrl").doesNotExist())
            .andExpect(jsonPath("$.data[2].sourceRefImageUrl").doesNotExist())
            .andExpect(jsonPath("$.data[2].npcImageUrl").doesNotExist())
            .andExpect(jsonPath("$.data[2].itemImageUrl").doesNotExist());

        verify(itemSourceService).getSourcesByItemId(88L);
    }

    @Test
    void shouldReturnPublicItemBuffEffects() throws Exception {
        PublicItemBuffEffectDTO effect = new PublicItemBuffEffectDTO();
        effect.setId(301L);
        effect.setBuffId(20L);
        effect.setBuffSourceId(20);
        effect.setBuffInternalName("Poisoned");
        effect.setBuffNameZh("中毒");
        effect.setRelationType("buff_source_item");
        effect.setDurationTicks(300);

        when(publicItemService.getPublicItemBuffEffects(77L)).thenReturn(List.of(effect));

        mockMvc.perform(get("/public/items/77/buff-effects"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].buffId").value(20))
            .andExpect(jsonPath("$.data[0].buffSourceId").value(20))
            .andExpect(jsonPath("$.data[0].buffInternalName").value("Poisoned"))
            .andExpect(jsonPath("$.data[0].buffNameZh").value("中毒"))
            .andExpect(jsonPath("$.data[0].relationType").value("buff_source_item"))
            .andExpect(jsonPath("$.data[0].durationTicks").value(300))
            .andExpect(jsonPath("$.data[0].chanceText").doesNotExist())
            .andExpect(jsonPath("$.data[0].conditions").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceProvider").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourcePage").doesNotExist())
            .andExpect(jsonPath("$.data[0].sourceRevisionTimestamp").doesNotExist());

        verify(publicItemService).getPublicItemBuffEffects(77L);
    }

    @Test
    void shouldReturnPublicItemArmorAttributes() throws Exception {
        PublicItemArmorAttributeDTO row = new PublicItemArmorAttributeDTO();
        row.setId(1L);
        row.setItemId(559L);
        row.setItemInternalName("HallowedMask");
        row.setItemNameZh("神圣面具");
        row.setItemPageTitle("神圣面具");
        row.setSlotGroup("head");
        row.setDefenseValue(24);
        row.setRawCellsJson("{\"meleeDamage\":\"10%\"}");

        when(publicItemService.getPublicItemArmorAttributes(559L)).thenReturn(List.of(row));

        mockMvc.perform(get("/public/items/559/armor-attributes"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].itemId").value(559))
            .andExpect(jsonPath("$.data[0].itemInternalName").value("HallowedMask"))
            .andExpect(jsonPath("$.data[0].itemNameZh").value("神圣面具"))
            .andExpect(jsonPath("$.data[0].slotGroup").value("head"))
            .andExpect(jsonPath("$.data[0].defenseValue").value(24))
            .andExpect(jsonPath("$.data[0].rawCellsJson").value("{\"meleeDamage\":\"10%\"}"));

        verify(publicItemService).getPublicItemArmorAttributes(559L);
    }

    @Test
    void shouldReturnPublicItemEquipmentEffects() throws Exception {
        PublicItemEquipmentEffectDTO effect = new PublicItemEquipmentEffectDTO();
        effect.setId(1L);
        effect.setItemId(559L);
        effect.setItemInternalName("HallowedMask");
        effect.setOwnerKind("item");
        effect.setStatKey("damage_bonus");
        effect.setClassScope("melee");
        effect.setSlotType("headSlot");
        effect.setUnit("percent");

        when(publicItemService.getPublicItemEquipmentEffects(559L)).thenReturn(List.of(effect));

        mockMvc.perform(get("/public/items/559/equipment-effects"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].itemId").value(559))
            .andExpect(jsonPath("$.data[0].itemInternalName").value("HallowedMask"))
            .andExpect(jsonPath("$.data[0].ownerKind").value("item"))
            .andExpect(jsonPath("$.data[0].statKey").value("damage_bonus"))
            .andExpect(jsonPath("$.data[0].classScope").value("melee"))
            .andExpect(jsonPath("$.data[0].slotType").value("headSlot"))
            .andExpect(jsonPath("$.data[0].unit").value("percent"));

        verify(publicItemService).getPublicItemEquipmentEffects(559L);
    }
}
