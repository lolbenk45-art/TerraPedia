package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.ItemImportRequestDTO;
import com.terraria.skills.entity.Category;
import com.terraria.skills.entity.Item;
import com.terraria.skills.mapper.CategoryMapper;
import com.terraria.skills.mapper.ItemMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemImportRegressionTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private CategoryMapper categoryMapper;

    @Mock
    private TransactionTemplate transactionTemplate;

    @Test
    void fixedFixtureProducesStableImportRowCounts() throws Exception {
        lenient().doAnswer(invocation -> {
            invocation.getArgument(0, java.util.function.Consumer.class).accept(null);
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
        when(categoryMapper.selectList(any(Wrapper.class))).thenReturn(List.of(
            category(10L, "TOOL_PICKAXE"),
            category(11L, "TOOL_DRILL")
        ));
        when(itemMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        TestableItemImportServiceImpl itemImportService = new TestableItemImportServiceImpl(
            itemMapper,
            categoryMapper,
            transactionTemplate
        );

        var result = itemImportService.importItems(loadFixture());

        assertEquals("phase0-regression-fixture", result.getSource());
        assertEquals(4, result.getTotal());
        assertEquals(3, result.getCreated());
        assertEquals(0, result.getUpdated());
        assertEquals(1, result.getSkipped());
        assertEquals(1, result.getErrors().size());

        verify(itemMapper, never()).insert(any(Item.class));
        verify(itemMapper, never()).updateById(any(Item.class));

        List<Item> itemTable = itemImportService.savedItems();
        assertEquals(3, itemTable.size(), "stable item row count after fixed fixture import");
        assertEquals(List.of("IronPickaxe", "CobaltDrill", "Drax"),
            itemTable.stream().map(Item::getInternalName).toList());
        assertEquals(List.of(10L, 11L, 10L),
            itemTable.stream().map(Item::getCategoryId).toList());
        assertEquals(List.of(1L, 2L, 3L),
            itemTable.stream().map(Item::getRarityId).toList());
        assertEquals(List.of(1, 1, 1),
            itemTable.stream().map(Item::getStatus).toList());
    }

    private static ItemImportRequestDTO loadFixture() throws IOException {
        try (var input = ItemImportRegressionTest.class.getResourceAsStream(
            "/fixtures/item-import-regression/items.json"
        )) {
            assertNotNull(input, "Missing item import regression fixture");
            return OBJECT_MAPPER.readValue(input, ItemImportRequestDTO.class);
        }
    }

    private static Category category(Long id, String code) {
        Category category = new Category();
        category.setId(id);
        category.setCode(code);
        category.setDeleted(0);
        return category;
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
}
