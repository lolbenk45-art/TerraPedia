package com.terraria.skills.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.ArticleDTO;
import com.terraria.skills.entity.Article;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ArticleMapper extends BaseMapper<Article> {

    Page<ArticleDTO> selectAdminArticlesPage(
        Page<ArticleDTO> page,
        @Param("keyword") String keyword,
        @Param("status") String status
    );

    Page<ArticleDTO> selectPublishedArticlesPage(
        Page<ArticleDTO> page,
        @Param("keyword") String keyword
    );

    Page<ArticleDTO> selectUserArticlesPage(
        Page<ArticleDTO> page,
        @Param("authorId") Long authorId,
        @Param("keyword") String keyword
    );

    ArticleDTO selectAdminArticleById(@Param("id") Long id);

    ArticleDTO selectUserArticleById(
        @Param("id") Long id,
        @Param("authorId") Long authorId
    );

    ArticleDTO selectPublishedArticleById(@Param("id") Long id);

    ArticleDTO selectPublishedArticleBySlug(@Param("slug") String slug);
}
