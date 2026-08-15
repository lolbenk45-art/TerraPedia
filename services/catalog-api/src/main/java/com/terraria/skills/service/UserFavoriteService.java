package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserFavoriteDTO;
import com.terraria.skills.dto.UserFavoriteStatusDTO;

import java.util.List;
import java.util.Map;

public interface UserFavoriteService {

    Page<UserFavoriteDTO> getFavorites(Long userId, String type, int page, int limit);

    Map<Long, UserFavoriteStatusDTO> getItemStatuses(Long userId, List<Long> itemIds);

    Map<Long, UserFavoriteStatusDTO> getArticleStatuses(Long userId, List<Long> articleIds);

    UserFavoriteStatusDTO favoriteItem(Long userId, Long itemId, String ipAddress);

    UserFavoriteStatusDTO unfavoriteItem(Long userId, Long itemId, String ipAddress);

    UserFavoriteStatusDTO favoriteArticle(Long userId, Long articleId, String ipAddress);

    UserFavoriteStatusDTO unfavoriteArticle(Long userId, Long articleId, String ipAddress);
}
