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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemImportServiceImplTest {

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private TransactionTemplate transactionTemplate;

    private TestableItemImportServiceImpl itemImportService() {
        lenientTransactionTemplate();
        return new TestableItemImportServiceImpl(itemMapper, categoryMapper, transactionTemplate);
    }

    private void lenientTransactionTemplate() {
        lenient().when(transactionTemplate.execute(any())).thenAnswer(invocation -> invocation.getArgument(0, org.springframework.transaction.support.TransactionCallback.class).doInTransaction(null));
        lenient().doAnswer(invocation -> {
            invocation.getArgument(0, java.util.function.Consumer.class).accept(null);
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
    }

    @Test
    void shouldDeclareSpringInjectionConstructorWhenTestConstructorAlsoExists() throws Exception {
        Constructor<ItemImportServiceImpl> constructor = ItemImportServiceImpl.class.getConstructor(
            ItemMapper.class,
            CategoryMapper.class,
            PlatformTransactionManager.class
        );

        assertEquals(true, constructor.isAnnotationPresent(Autowired.class));
    }

    @Test
    void importItemsReturnsStructuredErrorForNullRequest() {
        var result = itemImportService().importItems(null);

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

        TestableItemImportServiceImpl service = itemImportService();
        service.importItems(request);

        verify(itemMapper, never()).insert(any(Item.class));
        assertEquals(10L, service.savedItems().get(0).getCategoryId());
    }

    @Test
    void importItemsMapsStandardizedDrillNameToDrillOnlyCategory() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(item("Cobalt Drill", "CobaltDrill", "PICKAXE")));

        TestableItemImportServiceImpl service = itemImportService();
        service.importItems(request);

        verify(itemMapper, never()).insert(any(Item.class));
        assertEquals(11L, service.savedItems().get(0).getCategoryId());
    }

    @Test
    void importItemsMapsLocalizedDraxNameToPickaxeOnlyCategory() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(item("Drax", "Drax", "PICKAXE", "斧钻")));

        TestableItemImportServiceImpl service = itemImportService();
        service.importItems(request);

        verify(itemMapper, never()).insert(any(Item.class));
        assertEquals(10L, service.savedItems().get(0).getCategoryId());
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

        TestableItemImportServiceImpl service = itemImportService();
        service.importItems(request);

        verify(itemMapper, never()).insert(any(Item.class));
        assertEquals(List.of(12L, 13L), service.savedItems().stream().map(Item::getCategoryId).toList());
    }

    @Test
    void importItemsReportsMissingCategoryWhenLegacyToolCodeHasNoIdentity() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(item("   ", null, "PICKAXE")));

        var result = itemImportService().importItems(request);

        assertEquals(1, result.getErrors().size());
        verifyNoInteractions(itemMapper);
    }

    @Test
    void importItemsDryRunReturnsPreviewRowsWithoutWritingItems() {
        Category pickaxe = category(10L, "TOOL_PICKAXE");
        Category drill = category(11L, "TOOL_DRILL");
        Item existing = new Item();
        existing.setId(99L);
        existing.setInternalName("ExistingDrill");

        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(pickaxe, drill));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null, null, existing);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(
            item("Iron Pickaxe", "IronPickaxe", "PICKAXE"),
            item("Existing Drill", "ExistingDrill", "PICKAXE"),
            item("Broken", "Broken", "UNKNOWN_CATEGORY")
        ));

        TestableItemImportServiceImpl service = itemImportService();
        var result = service.importItems(request, true);

        assertEquals(3, result.getTotal());
        assertEquals(1, result.getCreated());
        assertEquals(1, result.getUpdated());
        assertEquals(1, result.getSkipped());
        assertEquals("Iron Pickaxe", result.getToBeCreated().get(0).getName());
        assertEquals("new_item", result.getToBeCreated().get(0).getReason());
        assertEquals("ExistingDrill", result.getToBeUpdated().get(0).getInternalName());
        assertEquals("existing_item", result.getToBeUpdated().get(0).getReason());
        assertEquals("Broken", result.getToBeSkipped().get(0).getInternalName());
        assertEquals("categoryCode not found: UNKNOWN_CATEGORY", result.getToBeSkipped().get(0).getReason());
        verify(itemMapper, never()).insert(any(Item.class));
        verify(itemMapper, never()).updateById(any(Item.class));
        assertEquals(0, service.savedItems().size());
    }

    @Test
    void importItemsBatchesCreatedItemsInChunksOf500() {
        Category material = category(20L, "MATERIAL");
        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(material));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        List<NormalizedItemImportDTO> items = new ArrayList<>();
        for (int index = 0; index < 501; index++) {
            items.add(item("Material " + index, "Material" + index, "MATERIAL"));
        }
        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(items);

        TestableItemImportServiceImpl service = itemImportService();

        var result = service.importItems(request);

        assertEquals(501, result.getCreated());
        verify(itemMapper, never()).insert(any(Item.class));
        assertEquals(2, service.savedBatches.size());
        assertEquals(500, service.savedBatches.get(0).size());
        assertEquals(1, service.savedBatches.get(1).size());
        verify(transactionTemplate, times(2)).executeWithoutResult(any());
    }

    @Test
    void importItemsTreatsDuplicatePendingCreatesLikeExistingRows() {
        Category material = category(20L, "MATERIAL");
        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(material));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setOverwriteExisting(false);
        request.setItems(List.of(
            item("First Material", "SharedMaterial", "MATERIAL"),
            item("Duplicate Material", "SharedMaterial", "MATERIAL")
        ));

        TestableItemImportServiceImpl service = itemImportService();
        var result = service.importItems(request);

        assertEquals(1, result.getCreated());
        assertEquals(1, result.getSkipped());
        assertEquals(1, service.savedItems().size());
        assertEquals("First Material", service.savedItems().get(0).getName());
    }

    @Test
    void importItemsUpdatesDuplicatePendingCreatesWithoutExtraDatabaseUpdate() {
        Category material = category(20L, "MATERIAL");
        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(material));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        NormalizedItemImportDTO first = item("First Material", "SharedMaterial", "MATERIAL");
        NormalizedItemImportDTO duplicate = item("Duplicate Material", "SharedMaterial", "MATERIAL");
        duplicate.setDescription("updated while pending");
        ItemImportRequestDTO request = new ItemImportRequestDTO();
        request.setItems(List.of(first, duplicate));

        TestableItemImportServiceImpl service = itemImportService();
        var result = service.importItems(request);

        assertEquals(1, result.getCreated());
        assertEquals(1, result.getUpdated());
        assertEquals(0, result.getSkipped());
        assertEquals(1, service.savedItems().size());
        assertEquals("Duplicate Material", service.savedItems().get(0).getName());
        assertEquals("updated while pending", service.savedItems().get(0).getDescription());
        verify(itemMapper, never()).updateById(any(Item.class));
    }

    private static class TestableItemImportServiceImpl extends ItemImportServiceImpl {

        private final List<List<Item>> savedBatches = new ArrayList<>();

        TestableItemImportServiceImpl(
            ItemMapper itemMapper,
            CategoryMapper categoryMapper,
            TransactionTemplate transactionTemplate
        ) {
            super(itemMapper, categoryMapper, transactionTemplate);
        }

        @Override
        boolean saveCreatedItemsBatch(List<Item> items, int batchSize) {
            savedBatches.add(new ArrayList<>(items));
            return true;
        }

        private List<Item> savedItems() {
            return savedBatches.stream()
                .flatMap(List::stream)
                .toList();
        }
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
