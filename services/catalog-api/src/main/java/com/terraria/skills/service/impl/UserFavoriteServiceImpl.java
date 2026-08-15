package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserFavoriteDTO;
import com.terraria.skills.dto.UserFavoriteStatusDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.UserArticleFavorite;
import com.terraria.skills.entity.UserItemFavorite;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.UserArticleFavoriteMapper;
import com.terraria.skills.mapper.UserItemFavoriteMapper;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserFavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserFavoriteServiceImpl implements UserFavoriteService {

    private static final String TYPE_ALL = "all";
    private static final String TYPE_ITEMS = "items";
    private static final String TYPE_ARTICLES = "articles";

    private final UserItemFavoriteMapper userItemFavoriteMapper;
    private final UserArticleFavoriteMapper userArticleFavoriteMapper;
    private final ItemMapper itemMapper;
    private final ArticleMapper articleMapper;
    private final SecurityAuditService securityAuditService;

    @Override
    public Page<UserFavoriteDTO> getFavorites(Long userId, String type, int page, int limit) {
        requireUserId(userId);
        String normalizedType = normalizeType(type);
        long offset = (long) Math.max(page - 1, 0) * limit;

        long total = 0;
        List<UserFavoriteDTO> records = new ArrayList<>();
        if (TYPE_ITEMS.equals(normalizedType) || TYPE_ALL.equals(normalizedType)) {
            total += userItemFavoriteMapper.countActiveByUser(userId);
        }
        if (TYPE_ARTICLES.equals(normalizedType) || TYPE_ALL.equals(normalizedType)) {
            total += userArticleFavoriteMapper.countActiveByUser(userId);
        }

        if (TYPE_ITEMS.equals(normalizedType)) {
            records = userItemFavoriteMapper.selectActiveFavoritesPage(userId, limit, offset);
        } else if (TYPE_ARTICLES.equals(normalizedType)) {
            records = userArticleFavoriteMapper.selectActiveFavoritesPage(userId, limit, offset);
        } else {
            records.addAll(userItemFavoriteMapper.selectActiveFavoritesPage(userId, offset + limit, 0));
            records.addAll(userArticleFavoriteMapper.selectActiveFavoritesPage(userId, offset + limit, 0));
            records = records.stream()
                .sorted(Comparator.comparing(UserFavoriteDTO::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .skip(offset)
                .limit(limit)
                .toList();
        }

        Page<UserFavoriteDTO> result = new Page<>(page, limit);
        result.setTotal(total);
        result.setRecords(records);
        return result;
    }

    @Override
    public Map<Long, UserFavoriteStatusDTO> getItemStatuses(Long userId, List<Long> itemIds) {
        requireUserId(userId);
        List<Long> ids = normalizeIds(itemIds);
        Set<Long> favoritedIds = userItemFavoriteMapper.selectFavoritedItemIds(userId, ids).stream().collect(Collectors.toSet());
        Map<Long, UserFavoriteStatusDTO> result = new LinkedHashMap<>();
        for (Long id : ids) {
            result.put(id, UserFavoriteStatusDTO.builder()
                .targetType("ITEM")
                .targetId(id)
                .favorited(favoritedIds.contains(id))
                .build());
        }
        return result;
    }

    @Override
    public Map<Long, UserFavoriteStatusDTO> getArticleStatuses(Long userId, List<Long> articleIds) {
        requireUserId(userId);
        List<Long> ids = normalizeIds(articleIds);
        Set<Long> favoritedIds = userArticleFavoriteMapper.selectFavoritedArticleIds(userId, ids).stream().collect(Collectors.toSet());
        Map<Long, UserFavoriteStatusDTO> result = new LinkedHashMap<>();
        for (Long id : ids) {
            result.put(id, UserFavoriteStatusDTO.builder()
                .targetType("ARTICLE")
                .targetId(id)
                .favorited(favoritedIds.contains(id))
                .build());
        }
        return result;
    }

    @Override
    @Transactional
    public UserFavoriteStatusDTO favoriteItem(Long userId, Long itemId, String ipAddress) {
        requireUserId(userId);
        requireVisibleItem(itemId);

        UserItemFavorite favorite = userItemFavoriteMapper.selectByUserAndItemIncludeDeleted(userId, itemId);
        if (favorite == null) {
            favorite = new UserItemFavorite();
            favorite.setUserId(userId);
            favorite.setItemId(itemId);
            favorite.setDeleted(0);
            try {
                userItemFavoriteMapper.insert(favorite);
            } catch (DuplicateKeyException ignored) {
                restoreConcurrentItemFavorite(userId, itemId);
            }
        } else if (Integer.valueOf(1).equals(favorite.getDeleted())) {
            userItemFavoriteMapper.reactivate(favorite.getId());
        }

        securityAuditService.log("USER_ITEM_FAVORITE_ADDED", "USER", userId, null, ipAddress, "itemId=" + itemId);
        return status("ITEM", itemId, true);
    }

    @Override
    @Transactional
    public UserFavoriteStatusDTO unfavoriteItem(Long userId, Long itemId, String ipAddress) {
        requireUserId(userId);
        requireTargetId(itemId, "Item id is required");
        userItemFavoriteMapper.softDelete(userId, itemId);
        securityAuditService.log("USER_ITEM_FAVORITE_REMOVED", "USER", userId, null, ipAddress, "itemId=" + itemId);
        return status("ITEM", itemId, false);
    }

    @Override
    @Transactional
    public UserFavoriteStatusDTO favoriteArticle(Long userId, Long articleId, String ipAddress) {
        requireUserId(userId);
        requirePublishedArticle(articleId);

        UserArticleFavorite favorite = userArticleFavoriteMapper.selectByUserAndArticleIncludeDeleted(userId, articleId);
        if (favorite == null) {
            favorite = new UserArticleFavorite();
            favorite.setUserId(userId);
            favorite.setArticleId(articleId);
            favorite.setDeleted(0);
            try {
                userArticleFavoriteMapper.insert(favorite);
            } catch (DuplicateKeyException ignored) {
                restoreConcurrentArticleFavorite(userId, articleId);
            }
        } else if (Integer.valueOf(1).equals(favorite.getDeleted())) {
            userArticleFavoriteMapper.reactivate(favorite.getId());
        }

        securityAuditService.log("USER_ARTICLE_FAVORITE_ADDED", "USER", userId, null, ipAddress, "articleId=" + articleId);
        return status("ARTICLE", articleId, true);
    }

    @Override
    @Transactional
    public UserFavoriteStatusDTO unfavoriteArticle(Long userId, Long articleId, String ipAddress) {
        requireUserId(userId);
        requireTargetId(articleId, "Article id is required");
        userArticleFavoriteMapper.softDelete(userId, articleId);
        securityAuditService.log("USER_ARTICLE_FAVORITE_REMOVED", "USER", userId, null, ipAddress, "articleId=" + articleId);
        return status("ARTICLE", articleId, false);
    }

    private void restoreConcurrentItemFavorite(Long userId, Long itemId) {
        UserItemFavorite existing = userItemFavoriteMapper.selectByUserAndItemIncludeDeleted(userId, itemId);
        if (existing != null && Integer.valueOf(1).equals(existing.getDeleted())) {
            userItemFavoriteMapper.reactivate(existing.getId());
        }
    }

    private void restoreConcurrentArticleFavorite(Long userId, Long articleId) {
        UserArticleFavorite existing = userArticleFavoriteMapper.selectByUserAndArticleIncludeDeleted(userId, articleId);
        if (existing != null && Integer.valueOf(1).equals(existing.getDeleted())) {
            userArticleFavoriteMapper.reactivate(existing.getId());
        }
    }

    private Item requireVisibleItem(Long itemId) {
        requireTargetId(itemId, "Item id is required");
        Item item = itemMapper.selectById(itemId);
        if (item == null || Integer.valueOf(1).equals(item.getDeleted())) {
            throw new IllegalArgumentException("Item not found");
        }
        if (item.getStatus() != null && !Integer.valueOf(1).equals(item.getStatus())) {
            throw new IllegalArgumentException("Item is not available");
        }
        return item;
    }

    private Article requirePublishedArticle(Long articleId) {
        requireTargetId(articleId, "Article id is required");
        Article article = articleMapper.selectOne(new LambdaQueryWrapper<Article>()
            .eq(Article::getId, articleId)
            .eq(Article::getDeleted, 0)
            .eq(Article::getStatus, "PUBLISHED")
            .last("LIMIT 1"));
        if (article == null) {
            throw new IllegalArgumentException("Published article not found");
        }
        return article;
    }

    private UserFavoriteStatusDTO status(String targetType, Long targetId, boolean favorited) {
        return UserFavoriteStatusDTO.builder()
            .targetType(targetType)
            .targetId(targetId)
            .favorited(favorited)
            .build();
    }

    private void requireUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }
    }

    private void requireTargetId(Long targetId, String message) {
        if (targetId == null || targetId <= 0) {
            throw new IllegalArgumentException(message);
        }
    }

    private String normalizeType(String type) {
        if (type == null || type.isBlank()) {
            return TYPE_ALL;
        }
        String normalized = type.trim().toLowerCase();
        if (!TYPE_ALL.equals(normalized) && !TYPE_ITEMS.equals(normalized) && !TYPE_ARTICLES.equals(normalized)) {
            throw new IllegalArgumentException("Unsupported favorite type");
        }
        return normalized;
    }

    private List<Long> normalizeIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return ids.stream()
            .filter(id -> id != null && id > 0)
            .distinct()
            .limit(100)
            .toList();
    }
}
