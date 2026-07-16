package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.CategoryNavigationUnavailableException;
import com.terraria.skills.vo.CategoryNavigationChildVO;
import com.terraria.skills.vo.CategoryNavigationVO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CategoryNavigationServiceImplTest {

    @Mock
    private CategoryManagementService categoryManagementService;

    @Mock
    private ItemMapper itemMapper;

    @InjectMocks
    private CategoryNavigationServiceImpl service;

    @Test
    void shouldResolveOrderedNavigationScopesChildrenAndCounts() {
        Map<Long, CategoryDTO> categories = configuredCategories();
        CategoryDTO melee = category(11L, 1L, "WEAPON_MELEE", "近战武器", 1);
        categories.put(melee.getId(), melee);

        when(categoryManagementService.getCategoryMap()).thenReturn(categories);
        when(categoryManagementService.getAllDescendants(1L)).thenReturn(List.of(melee));
        when(itemMapper.countItemsWithSearch("", null, List.of(1L, 11L), null, null)).thenReturn(37L);

        List<CategoryNavigationVO> result = service.getNavigation();

        assertEquals(List.of("weapons", "armor", "potions", "materials", "furniture", "tools"),
            result.stream().map(CategoryNavigationVO::getSlug).toList());
        assertEquals(List.of("weapon", "armor", "potion", "material", "furniture", "tool"),
            result.stream().map(CategoryNavigationVO::getFilterKey).toList());
        CategoryNavigationVO weapon = result.get(0);
        assertEquals("武器", weapon.getName());
        assertEquals("/categories/weapons", weapon.getCategoryPath());
        assertEquals("/items?filter=weapon", weapon.getItemPath());
        assertEquals(List.of("WEAPON"), weapon.getCategoryCodes());
        assertEquals(List.of(1L, 11L), weapon.getCategoryIds());
        assertEquals(37L, weapon.getItemCount());
        assertEquals(List.of("WEAPON_MELEE"), weapon.getChildren().stream()
            .map(CategoryNavigationChildVO::getCode).toList());
        verify(itemMapper).countItemsWithSearch("", null, List.of(1L, 11L), null, null);
    }

    @Test
    void shouldFailWithoutPartialCountsWhenConfiguredCodeIsMissing() {
        Map<Long, CategoryDTO> categories = configuredCategories();
        categories.remove(6L);
        when(categoryManagementService.getCategoryMap()).thenReturn(categories);

        CategoryNavigationUnavailableException exception = assertThrows(
            CategoryNavigationUnavailableException.class,
            service::getNavigation
        );

        assertTrue(exception.getMessage().contains("TOOL"));
        verifyNoInteractions(itemMapper);
    }

    private Map<Long, CategoryDTO> configuredCategories() {
        Map<Long, CategoryDTO> categories = new LinkedHashMap<>();
        categories.put(1L, category(1L, 0L, "weapon", "武器", 1));
        categories.put(2L, category(2L, 0L, "ARMOR", "防具", 2));
        categories.put(3L, category(3L, 0L, "CONSUMABLE_POTION", "药水", 3));
        categories.put(4L, category(4L, 0L, "MATERIAL", "材料", 4));
        categories.put(5L, category(5L, 0L, "FURNITURE", "家具", 5));
        categories.put(6L, category(6L, 0L, "TOOL", "工具", 6));
        return categories;
    }

    private CategoryDTO category(Long id, Long parentId, String code, String name, Integer sort) {
        CategoryDTO category = new CategoryDTO();
        category.setId(id);
        category.setParentId(parentId);
        category.setCode(code);
        category.setName(name);
        category.setSort(sort);
        return category;
    }
}
