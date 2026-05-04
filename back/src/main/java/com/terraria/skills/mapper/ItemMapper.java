package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.CategoryItemCountDTO;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.entity.Item;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ItemMapper extends BaseMapper<Item> {

    List<ItemDTO> selectItemsWithSearch(
        @Param("search") String search,
        @Param("categoryId") Long categoryId,
        @Param("categoryIds") List<Long> categoryIds,
        @Param("rarityId") Long rarityId,
        @Param("gamePeriodId") Long gamePeriodId,
        @Param("sortBy") String sortBy,
        @Param("sortDirection") String sortDirection,
        @Param("limit") long limit,
        @Param("offset") long offset
    );

    long countItemsWithSearch(
        @Param("search") String search,
        @Param("categoryId") Long categoryId,
        @Param("categoryIds") List<Long> categoryIds,
        @Param("rarityId") Long rarityId,
        @Param("gamePeriodId") Long gamePeriodId
    );

    List<CategoryItemCountDTO> countItemsByCategoryIds(@Param("categoryIds") List<Long> categoryIds);

    long countActiveItems();

    ItemDTO selectItemDetailById(@Param("id") Long id);

    List<ItemDTO> selectItemSuggestions(@Param("keyword") String keyword, @Param("limit") int limit);
}
