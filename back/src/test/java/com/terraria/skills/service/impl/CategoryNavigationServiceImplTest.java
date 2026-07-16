package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.dto.CategoryNavigationChildAggregateDTO;
import com.terraria.skills.dto.CategoryNavigationParentScopeMembershipDTO;
import com.terraria.skills.dto.CategoryNavigationScopeMembershipDTO;
import com.terraria.skills.dto.CategoryItemCountDTO;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.service.CategoryManagementService;
import com.terraria.skills.service.CategoryNavigationUnavailableException;
import com.terraria.skills.service.ManagedImageUrlPolicy;
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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;

@ExtendWith(MockitoExtension.class)
class CategoryNavigationServiceImplTest {

    @Mock
    private CategoryManagementService categoryManagementService;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private ManagedImageUrlPolicy managedImageUrlPolicy;

    @InjectMocks
    private CategoryNavigationServiceImpl service;

    @Test
    void shouldResolveOrderedNavigationScopesChildrenAndCounts() {
        Map<Long, CategoryDTO> categories = configuredCategories();
        CategoryDTO melee = category(11L, 1L, "WEAPON_MELEE", "近战武器", 1);
        CategoryDTO meleeOther = category(12L, 11L, "WEAPON_MELEE_OTHER", "其他近战", 1);
        CategoryDTO armorOther = category(21L, 2L, "ARMOR_OTHER", "其他盔甲", 1);
        categories.put(melee.getId(), melee);
        categories.put(meleeOther.getId(), meleeOther);
        categories.put(armorOther.getId(), armorOther);

        when(categoryManagementService.getCategoryMap()).thenReturn(categories);
        when(categoryManagementService.getAllDescendants(1L)).thenReturn(List.of(melee, meleeOther));
        when(categoryManagementService.getAllDescendants(2L)).thenReturn(List.of(armorOther));
        when(categoryManagementService.getAllDescendants(11L)).thenReturn(List.of(meleeOther));
        when(categoryManagementService.getAllDescendants(21L)).thenReturn(List.of());
        when(itemMapper.selectCategoryNavigationParentCounts(List.of(
            new CategoryNavigationParentScopeMembershipDTO(1L, 1L),
            new CategoryNavigationParentScopeMembershipDTO(1L, 11L),
            new CategoryNavigationParentScopeMembershipDTO(1L, 12L),
            new CategoryNavigationParentScopeMembershipDTO(2L, 2L),
            new CategoryNavigationParentScopeMembershipDTO(2L, 21L),
            new CategoryNavigationParentScopeMembershipDTO(3L, 3L),
            new CategoryNavigationParentScopeMembershipDTO(4L, 4L),
            new CategoryNavigationParentScopeMembershipDTO(5L, 5L),
            new CategoryNavigationParentScopeMembershipDTO(6L, 6L)
        ))).thenReturn(List.of(
            count(1L, 37L),
            count(2L, 0L),
            count(3L, 0L),
            count(4L, 0L),
            count(5L, 0L),
            count(6L, 0L)
        ));
        when(managedImageUrlPolicy.trustedManagedImageReadUrlPrefixes())
            .thenReturn(List.of(
                "http://localhost:9000/terrapedia-images/items/",
                "http://localhost:9000/terrapedia-images/npcs/"
            ));
        when(managedImageUrlPolicy.normalizeManagedImagePathForDomain(
            "/terrapedia-images/items/weapon-melee.png",
            "items"
        )).thenReturn(Optional.of("/terrapedia-images/items/weapon-melee.png"));
        when(itemMapper.selectCategoryNavigationChildAggregates(
            List.of(
                new CategoryNavigationScopeMembershipDTO(11L, 11L),
                new CategoryNavigationScopeMembershipDTO(11L, 12L),
                new CategoryNavigationScopeMembershipDTO(21L, 21L)
            ),
            List.of("http://localhost:9000/terrapedia-images/items/")
        )).thenReturn(List.of(
            aggregate(11L, 36L, "/terrapedia-images/items/weapon-melee.png"),
            aggregate(21L, 0L, null)
        ));

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
        assertEquals(List.of(1L, 11L, 12L), weapon.getCategoryIds());
        assertEquals(37L, weapon.getItemCount());
        assertEquals(List.of("WEAPON_MELEE"), weapon.getChildren().stream()
            .map(CategoryNavigationChildVO::getCode).toList());
        CategoryNavigationChildVO meleeChild = weapon.getChildren().get(0);
        assertEquals(List.of(11L, 12L), meleeChild.getCategoryIds());
        assertEquals("/items?category=WEAPON_MELEE", meleeChild.getItemPath());
        assertEquals(36L, meleeChild.getItemCount());
        assertEquals("/terrapedia-images/items/weapon-melee.png", meleeChild.getImage());
        CategoryNavigationChildVO armorChild = result.get(1).getChildren().get(0);
        assertEquals(List.of(21L), armorChild.getCategoryIds());
        assertEquals(0L, armorChild.getItemCount());
        assertEquals(null, armorChild.getImage());
        verify(itemMapper).selectCategoryNavigationChildAggregates(
            List.of(
                new CategoryNavigationScopeMembershipDTO(11L, 11L),
                new CategoryNavigationScopeMembershipDTO(11L, 12L),
                new CategoryNavigationScopeMembershipDTO(21L, 21L)
            ),
            List.of("http://localhost:9000/terrapedia-images/items/")
        );
        verify(itemMapper).selectCategoryNavigationParentCounts(List.of(
            new CategoryNavigationParentScopeMembershipDTO(1L, 1L),
            new CategoryNavigationParentScopeMembershipDTO(1L, 11L),
            new CategoryNavigationParentScopeMembershipDTO(1L, 12L),
            new CategoryNavigationParentScopeMembershipDTO(2L, 2L),
            new CategoryNavigationParentScopeMembershipDTO(2L, 21L),
            new CategoryNavigationParentScopeMembershipDTO(3L, 3L),
            new CategoryNavigationParentScopeMembershipDTO(4L, 4L),
            new CategoryNavigationParentScopeMembershipDTO(5L, 5L),
            new CategoryNavigationParentScopeMembershipDTO(6L, 6L)
        ));
        verify(itemMapper, never()).countItemsWithSearch(anyString(), any(), anyList(), any(), any());
        verify(itemMapper, never()).countItemsWithSearch("", null, List.of(11L, 12L), null, null);
    }

    @Test
    void shouldFailClosedWhenAChildAggregateIsMissing() {
        Map<Long, CategoryDTO> categories = configuredCategories();
        CategoryDTO key = category(41L, 4L, "MATERIAL_KEY", "钥匙", 1);
        categories.put(key.getId(), key);

        when(categoryManagementService.getCategoryMap()).thenReturn(categories);
        when(itemMapper.selectCategoryNavigationParentCounts(List.of(
            new CategoryNavigationParentScopeMembershipDTO(1L, 1L),
            new CategoryNavigationParentScopeMembershipDTO(2L, 2L),
            new CategoryNavigationParentScopeMembershipDTO(3L, 3L),
            new CategoryNavigationParentScopeMembershipDTO(4L, 4L),
            new CategoryNavigationParentScopeMembershipDTO(5L, 5L),
            new CategoryNavigationParentScopeMembershipDTO(6L, 6L)
        ))).thenReturn(List.of(
            count(1L, 0L),
            count(2L, 0L),
            count(3L, 0L),
            count(4L, 0L),
            count(5L, 0L),
            count(6L, 0L)
        ));
        when(itemMapper.selectCategoryNavigationChildAggregates(
            List.of(new CategoryNavigationScopeMembershipDTO(41L, 41L)),
            List.of()
        )).thenReturn(List.of());

        CategoryNavigationUnavailableException exception = assertThrows(
            CategoryNavigationUnavailableException.class,
            service::getNavigation
        );

        assertTrue(exception.getMessage().contains("MATERIAL_KEY"));
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

    private CategoryNavigationChildAggregateDTO aggregate(Long childId, long itemCount, String image) {
        CategoryNavigationChildAggregateDTO aggregate = new CategoryNavigationChildAggregateDTO();
        aggregate.setChildId(childId);
        aggregate.setItemCount(itemCount);
        aggregate.setImage(image);
        return aggregate;
    }

    private CategoryItemCountDTO count(Long categoryId, long itemCount) {
        return new CategoryItemCountDTO(categoryId, itemCount);
    }
}
