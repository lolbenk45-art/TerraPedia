package com.terraria.skills.service.impl;

import com.terraria.skills.dto.CategoryDTO;
import com.terraria.skills.entity.Category;
import com.terraria.skills.mapper.CategoryMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CategoryManagementServiceImplTest {

    @Mock
    private CategoryMapper categoryMapper;

    @InjectMocks
    private CategoryManagementServiceImpl categoryManagementService;

    @Test
    void shouldBuildItemCategoryTreeWithoutNpcRoots() {
        Category weapon = rootCategory(1L, "Weapon", "WEAPON", 10);
        Category weaponChild = childCategory(2L, 1L, "Sword", "WEAPON_MELEE_SWORD", 1);
        Category npc = rootCategory(3L, "NPC", "CATEGORY_NPC", 20);
        Category npcChild = childCategory(4L, 3L, "Friendly NPC", "NPC_FRIENDLY", 1);

        when(categoryMapper.selectAllCategories()).thenReturn(List.of(weapon, weaponChild, npc, npcChild));

        List<CategoryDTO> itemTree = categoryManagementService.buildItemCategoryTree();

        assertEquals(1, itemTree.size());
        assertEquals("WEAPON", itemTree.get(0).getCode());
        assertNotNull(itemTree.get(0).getChildren());
        assertEquals(1, itemTree.get(0).getChildren().size());
        assertEquals("WEAPON_MELEE_SWORD", itemTree.get(0).getChildren().get(0).getCode());
        assertNull(itemTree.stream().filter(category -> "CATEGORY_NPC".equals(category.getCode())).findFirst().orElse(null));
    }

    private Category rootCategory(Long id, String name, String code, int sort) {
        Category category = new Category();
        category.setId(id);
        category.setName(name);
        category.setCode(code);
        category.setParentId(0L);
        category.setSort(sort);
        return category;
    }

    private Category childCategory(Long id, Long parentId, String name, String code, int sort) {
        Category category = new Category();
        category.setId(id);
        category.setParentId(parentId);
        category.setName(name);
        category.setCode(code);
        category.setSort(sort);
        return category;
    }
}
