package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.terraria.skills.dto.ItemImportRequestDTO;
import com.terraria.skills.dto.NormalizedItemImportDTO;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.ItemMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemImportServiceImplTest {

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @InjectMocks
    private ItemImportServiceImpl itemImportService;

    @Test
    void importItemsReturnsStructuredErrorForNullRequest() {
        var result = itemImportService.importItems(null);

        assertEquals(1, result.getErrors().size());
        assertEquals("No request provided", result.getErrors().get(0));
        verifyNoInteractions(categoryMapper, itemMapper);
    }

    @Test
    void importItemsMapsStandardizedPickaxeToPickaxeOnlyCategory() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(item("Iron Pickaxe", "IronPickaxe", "PICKAXE")));

        itemImportService.importItems(request);

        ArgumentCaptor<Item> captor = ArgumentCaptor.forClass(Item.class);
        verify(itemMapper).insert(captor.capture());
        assertEquals(10L, captor.getValue().getCategoryId());
    }

    @Test
    void importItemsMapsStandardizedDrillNameToDrillOnlyCategory() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(item("Cobalt Drill", "CobaltDrill", "PICKAXE")));

        itemImportService.importItems(request);

        ArgumentCaptor<Item> captor = ArgumentCaptor.forClass(Item.class);
        verify(itemMapper).insert(captor.capture());
        assertEquals(11L, captor.getValue().getCategoryId());
    }

    @Test
    void importItemsMapsLocalizedDraxNameToPickaxeOnlyCategory() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(item("Drax", "Drax", "PICKAXE", "斧钻")));

        itemImportService.importItems(request);

        ArgumentCaptor<Item> captor = ArgumentCaptor.forClass(Item.class);
        verify(itemMapper).insert(captor.capture());
        assertEquals(10L, captor.getValue().getCategoryId());
    }

    @Test
    void importItemsSeparatesStandardizedAxeAndChainsawNames() {
        Category axe = category(12L, "TOOL_AXE");
        Category chainsaw = category(13L, "TOOL_CHAINSAW");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(axe, chainsaw));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(
            item("Iron Axe", "IronAxe", "AXE"),
            item("Cobalt Chainsaw", "CobaltChainsaw", "AXE")
        ));

        itemImportService.importItems(request);

        ArgumentCaptor<Item> captor = ArgumentCaptor.forClass(Item.class);
        verify(itemMapper, org.mockito.Mockito.times(2)).insert(captor.capture());
        assertEquals(List.of(12L, 13L), captor.getAllValues().stream().map(Item::getCategoryId).toList());
    }

    @Test
    void importItemsReportsMissingCategoryWhenLegacyToolCodeHasNoIdentity() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(item("   ", null, "PICKAXE")));

        var result = itemImportService.importItems(request);

        assertEquals(1, result.getErrors().size());
        verifyNoInteractions(itemMapper);
    }

    private static Category category(Long id, String code) {
        Category category = new Category();
        category.setId(id);
        category.setCode(code);
        category.setDeleted(0);
        return category;
    }

    private static NormalizedItemImportDTO item(String name, String internalName, String categoryCode) {
        return item(name, internalName, categoryCode, null);
    }

    private static NormalizedItemImportDTO item(String name, String internalName, String categoryCode, String nameZh) {
        NormalizedItemImportDTO item = new NormalizedItemImportDTO();
        item.setName(name);
        item.setInternalName(internalName);
        item.setCategoryCode(categoryCode);
        item.setNameZh(nameZh);
        return item;
    }
}
