package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicUserArticleDTO;
import com.terraria.skills.dto.PublicUserProfileDTO;
import com.terraria.skills.entity.User;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.UserMapper;
import com.terraria.skills.service.PublicUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PublicUserServiceImpl implements PublicUserService {

    private final UserMapper userMapper;
    private final ArticleMapper articleMapper;
    private final UserAvatarUrlResolver userAvatarUrlResolver;

    @Override
    public PublicUserProfileDTO getPublicProfile(Long userId, int page, int limit) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }

        User user = userMapper.selectPublicUserById(userId);
        if (user == null) {
            throw new IllegalArgumentException("User not found");
        }

        Page<PublicUserArticleDTO> articlePage = new Page<>(
            Math.max(1, page),
            Math.max(1, Math.min(limit, 20))
        );
        Page<PublicUserArticleDTO> publishedArticles = articleMapper.selectPublishedArticlesByAuthor(articlePage, userId);
        publishedArticles.getRecords().forEach(this::normalizePublishedArticle);

        return PublicUserProfileDTO.builder()
            .id(user.getId())
            .displayName(user.getDisplayName())
            .avatarUrl(userAvatarUrlResolver.resolveProfileAvatarUrl(user.getAvatarUrl(), user.getAvatarObjectKey()))
            .joinedAt(user.getCreatedAt())
            .publishedArticleCount(publishedArticles.getTotal())
            .publishedArticles(publishedArticles.getRecords())
            .build();
    }

    private void normalizePublishedArticle(PublicUserArticleDTO article) {
        if (article == null) {
            return;
        }
        article.setAuthorAvatarUrl(userAvatarUrlResolver.resolveProfileAvatarUrl(
            article.getAuthorAvatarUrl(),
            article.getAuthorAvatarObjectKey()
        ));
        if (article.getViewCount() == null) {
            article.setViewCount(0L);
        }
        if (article.getFavoriteCount() == null) {
            article.setFavoriteCount(0L);
        }
    }
}
