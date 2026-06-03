package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemCategoryRel;
import com.terraria.skills.mapper.ItemCategoryRelMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemServiceRelationSyncTest {

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private ItemCategoryRelMapper itemCategoryRelMapper;

    @Mock
    private CategoryManagementService categoryManagementService;

    @Test
    void updateItemShouldNotSoftDeleteCategoryRelationsBeforeReactivatingSameCategory() {
        Item existing = new Item();
        existing.setId(6L);
        existing.setName("Existing item");
        existing.setInternalName("EXISTING_ITEM");
        existing.setCategoryId(27L);
        existing.setStatus(1);

        ItemDTO request = new ItemDTO();
        request.setName("Existing item");
        request.setInternalName("EXISTING_ITEM");
        request.setCategoryId(27L);
        request.setStatus(0);

        ItemDTO response = new ItemDTO();
        response.setId(6L);
        response.setName("Existing item");
        response.setCategoryId(27L);
        response.setStatus(0);

        CategoryDTO category = new CategoryDTO();
        category.setId(27L);
        category.setName("Weapons");

        when(itemMapper.selectById(6L)).thenReturn(existing);
        when(itemMapper.updateById(existing)).thenReturn(1);
        when(itemMapper.selectItemDetailById(6L)).thenReturn(response);
        when(categoryManagementService.getCategoryMap()).thenReturn(Map.of(27L, category));
        when(categoryManagementService.getCategoryPathMap()).thenReturn(Map.of());
        lenient().doThrow(new DuplicateKeyException("Duplicate entry '6-27-1'"))
            .when(itemCategoryRelMapper)
            .delete(any(Wrapper.class));

        ItemServiceImpl service = new ItemServiceImpl(itemMapper, itemCategoryRelMapper, categoryManagementService);

        assertDoesNotThrow(() -> service.updateItem(6L, request));
        verify(itemMapper).updateById(existing);
    }

    @Test
    void updateItemShouldUpdateExistingActiveRelationsWithoutReinsertingThem() {
        Item existing = existingItem();
        ItemDTO request = itemRequest(27L, 1);
        ItemCategoryRel active = relation(100L, 6L, 27L, 0);

        when(itemMapper.selectById(6L)).thenReturn(existing);
        when(itemMapper.updateById(existing)).thenReturn(1);
        when(itemMapper.selectItemDetailById(6L)).thenReturn(itemResponse(27L, 1));
        when(categoryManagementService.getCategoryMap()).thenReturn(Map.of(27L, category(27L)));
        when(categoryManagementService.getCategoryPathMap()).thenReturn(Map.of());
        when(itemCategoryRelMapper.selectByItemIdIncludingDeleted(6L)).thenReturn(List.of(active));

        ItemServiceImpl service = new ItemServiceImpl(itemMapper, itemCategoryRelMapper, categoryManagementService);

        service.updateItem(6L, request);

        verify(itemCategoryRelMapper).restoreOrUpdateForSync(active);
        verify(itemCategoryRelMapper, never()).insert(any(ItemCategoryRel.class));
        verify(itemCategoryRelMapper, never()).markDeletedById(any());
    }

    @Test
    void updateItemShouldRemoveDeletedDuplicateBeforeSoftDeletingObsoleteRelation() {
        Item existing = existingItem();
        ItemDTO request = itemRequest(28L, 1);
        ItemCategoryRel obsoleteActive = relation(100L, 6L, 27L, 0);

        when(itemMapper.selectById(6L)).thenReturn(existing);
        when(itemMapper.updateById(existing)).thenReturn(1);
        when(itemMapper.selectItemDetailById(6L)).thenReturn(itemResponse(28L, 1));
        when(categoryManagementService.getCategoryMap()).thenReturn(Map.of(28L, category(28L)));
        when(categoryManagementService.getCategoryPathMap()).thenReturn(Map.of());
        when(itemCategoryRelMapper.selectByItemIdIncludingDeleted(6L)).thenReturn(List.of(obsoleteActive));

        ItemServiceImpl service = new ItemServiceImpl(itemMapper, itemCategoryRelMapper, categoryManagementService);

        service.updateItem(6L, request);

        verify(itemCategoryRelMapper).insert(any(ItemCategoryRel.class));
        verify(itemCategoryRelMapper).deleteDeletedDuplicatesForCategory(6L, 27L, 100L);
        verify(itemCategoryRelMapper).markDeletedById(100L);
    }

    private Item existingItem() {
        Item item = new Item();
        item.setId(6L);
        item.setName("Existing item");
        item.setInternalName("EXISTING_ITEM");
        item.setCategoryId(27L);
        item.setStatus(1);
        return item;
    }

    private ItemDTO itemRequest(Long categoryId, Integer status) {
        ItemDTO request = new ItemDTO();
        request.setName("Existing item");
        request.setInternalName("EXISTING_ITEM");
        request.setCategoryId(categoryId);
        request.setStatus(status);
        return request;
    }

    private ItemDTO itemResponse(Long categoryId, Integer status) {
        ItemDTO response = new ItemDTO();
        response.setId(6L);
        response.setName("Existing item");
        response.setCategoryId(categoryId);
        response.setStatus(status);
        return response;
    }

    private CategoryDTO category(Long id) {
        CategoryDTO category = new CategoryDTO();
        category.setId(id);
        category.setName("Category " + id);
        return category;
    }

    private ItemCategoryRel relation(Long id, Long itemId, Long categoryId, Integer deleted) {
        ItemCategoryRel relation = new ItemCategoryRel();
        relation.setId(id);
        relation.setItemId(itemId);
        relation.setCategoryId(categoryId);
        relation.setDeleted(deleted);
        return relation;
    }
}
