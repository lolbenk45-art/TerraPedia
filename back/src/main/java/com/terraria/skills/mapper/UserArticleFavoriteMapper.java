package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.terraria.skills.dto.UserFavoriteDTO;
import com.terraria.skills.entity.UserArticleFavorite;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserArticleFavoriteMapper extends BaseMapper<UserArticleFavorite> {

    UserArticleFavorite selectByUserAndArticleIncludeDeleted(@Param("userId") Long userId, @Param("articleId") Long articleId);

    int reactivate(@Param("id") Long id);

    int softDelete(@Param("userId") Long userId, @Param("articleId") Long articleId);

    List<Long> selectFavoritedArticleIds(@Param("userId") Long userId, @Param("articleIds") List<Long> articleIds);

    long countActiveByUser(@Param("userId") Long userId);

    List<UserFavoriteDTO> selectActiveFavoritesPage(@Param("userId") Long userId, @Param("limit") long limit, @Param("offset") long offset);
}
