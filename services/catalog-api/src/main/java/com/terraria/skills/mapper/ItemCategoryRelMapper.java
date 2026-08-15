package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.entity.ItemCategoryRel;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ItemCategoryRelMapper extends BaseMapper<ItemCategoryRel> {

    @Select("""
        SELECT id, item_id, category_id, is_primary, relation_type, sort_order,
               source_provider, source_page, status, deleted, created_at, updated_at
        FROM item_category_rel
        WHERE item_id = #{itemId}
        ORDER BY deleted ASC, id ASC
        """)
    List<ItemCategoryRel> selectByItemIdIncludingDeleted(@Param("itemId") Long itemId);

    @Update("""
        UPDATE item_category_rel
        SET is_primary = #{relation.isPrimary},
            relation_type = #{relation.relationType},
            sort_order = #{relation.sortOrder},
            source_provider = #{relation.sourceProvider},
            source_page = #{relation.sourcePage},
            status = #{relation.status},
            deleted = 0,
            updated_at = NOW()
        WHERE id = #{relation.id}
        """)
    int restoreOrUpdateForSync(@Param("relation") ItemCategoryRel relation);

    @Delete("""
        DELETE FROM item_category_rel
        WHERE item_id = #{itemId}
          AND category_id = #{categoryId}
          AND deleted = 1
          AND id <> #{activeRelationId}
        """)
    int deleteDeletedDuplicatesForCategory(
        @Param("itemId") Long itemId,
        @Param("categoryId") Long categoryId,
        @Param("activeRelationId") Long activeRelationId
    );

    @Update("""
        UPDATE item_category_rel
        SET deleted = 1,
            updated_at = NOW()
        WHERE id = #{id}
          AND deleted = 0
        """)
    int markDeletedById(@Param("id") Long id);
}
