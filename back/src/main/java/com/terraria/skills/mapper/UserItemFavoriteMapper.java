package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.dto.UserFavoriteDTO;
import com.terraria.skills.entity.UserItemFavorite;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserItemFavoriteMapper extends BaseMapper<UserItemFavorite> {

    UserItemFavorite selectByUserAndItemIncludeDeleted(@Param("userId") Long userId, @Param("itemId") Long itemId);

    int reactivate(@Param("id") Long id);

    int softDelete(@Param("userId") Long userId, @Param("itemId") Long itemId);

    List<Long> selectFavoritedItemIds(@Param("userId") Long userId, @Param("itemIds") List<Long> itemIds);

    long countActiveByUser(@Param("userId") Long userId);

    List<UserFavoriteDTO> selectActiveFavoritesPage(@Param("userId") Long userId, @Param("limit") long limit, @Param("offset") long offset);
}
