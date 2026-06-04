package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserReadingHistoryDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.UserReadingHistory;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.UserReadingHistoryMapper;
import com.terraria.skills.service.SecurityAuditService;
import com.terraria.skills.service.UserReadingHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserReadingHistoryServiceImpl implements UserReadingHistoryService {

    private static final String TYPE_ALL = "all";
    private static final String TYPE_ITEMS = "items";
    private static final String TYPE_ARTICLES = "articles";
    private static final String TARGET_ITEM = "ITEM";
    private static final String TARGET_ARTICLE = "ARTICLE";

    private final UserReadingHistoryMapper userReadingHistoryMapper;
    private final ItemMapper itemMapper;
    private final ArticleMapper articleMapper;
    private final SecurityAuditService securityAuditService;

    @Override
    @Transactional
    public UserReadingHistoryDTO record(Long userId, String targetType, Long targetId, String ipAddress) {
        requireUserId(userId);
        String normalizedTargetType = normalizeTargetType(targetType);
        requireTargetId(targetId);
        requireVisibleTarget(normalizedTargetType, targetId);

        UserReadingHistory existing = userReadingHistoryMapper.selectByUserAndTargetIncludeDeleted(userId, normalizedTargetType, targetId);
        if (existing == null) {
            UserReadingHistory history = new UserReadingHistory();
            history.setUserId(userId);
            history.setTargetType(normalizedTargetType);
            history.setTargetId(targetId);
            history.setViewCount(1);
            history.setDeleted(0);
            try {
                userReadingHistoryMapper.insert(history);
            } catch (DuplicateKeyException ignored) {
                incrementAfterDuplicate(userId, normalizedTargetType, targetId);
            }
        } else if (Integer.valueOf(1).equals(existing.getDeleted())) {
            userReadingHistoryMapper.reactivateAndIncrement(existing.getId());
        } else {
            userReadingHistoryMapper.incrementExisting(existing.getId());
        }

        securityAuditService.log("USER_READING_HISTORY_RECORDED", "USER", userId, null, ipAddress, auditDetails(normalizedTargetType, targetId));
        return firstHistoryRow(userId, normalizedTargetType, targetId);
    }

    @Override
    public Page<UserReadingHistoryDTO> getHistory(Long userId, String type, int page, int limit) {
        requireUserId(userId);
        String normalizedType = normalizeListType(type);
        long offset = (long) Math.max(page - 1, 0) * limit;
        long total;
        List<UserReadingHistoryDTO> records;
        if (TYPE_ALL.equals(normalizedType)) {
            total = userReadingHistoryMapper.countActiveByUser(userId);
            records = userReadingHistoryMapper.selectActiveHistoryPageAll(userId, limit, offset);
        } else {
            String targetType = TYPE_ITEMS.equals(normalizedType) ? TARGET_ITEM : TARGET_ARTICLE;
            total = userReadingHistoryMapper.countActiveByUserAndType(userId, targetType);
            records = userReadingHistoryMapper.selectActiveHistoryPage(userId, targetType, limit, offset);
        }

        Page<UserReadingHistoryDTO> result = new Page<>(page, limit);
        result.setTotal(total);
        result.setRecords(records);
        return result;
    }

    @Override
    @Transactional
    public UserReadingHistoryDTO remove(Long userId, String targetType, Long targetId, String ipAddress) {
        requireUserId(userId);
        String normalizedTargetType = normalizeTargetType(targetType);
        requireTargetId(targetId);
        userReadingHistoryMapper.softDelete(userId, normalizedTargetType, targetId);
        securityAuditService.log("USER_READING_HISTORY_REMOVED", "USER", userId, null, ipAddress, auditDetails(normalizedTargetType, targetId));
        return UserReadingHistoryDTO.builder()
            .targetType(normalizedTargetType)
            .targetId(targetId)
            .url(TARGET_ITEM.equals(normalizedTargetType) ? "/items/" + targetId : null)
            .build();
    }

    private void incrementAfterDuplicate(Long userId, String targetType, Long targetId) {
        UserReadingHistory existing = userReadingHistoryMapper.selectByUserAndTargetIncludeDeleted(userId, targetType, targetId);
        if (existing == null) {
            throw new DuplicateKeyException("Reading history duplicate row was not recoverable");
        }
        if (Integer.valueOf(1).equals(existing.getDeleted())) {
            userReadingHistoryMapper.reactivateAndIncrement(existing.getId());
        } else {
            userReadingHistoryMapper.incrementExisting(existing.getId());
        }
    }

    private UserReadingHistoryDTO firstHistoryRow(Long userId, String targetType, Long targetId) {
        List<UserReadingHistoryDTO> records = userReadingHistoryMapper.selectActiveHistoryPage(userId, targetType, 1, 0);
        if (records != null) {
            for (UserReadingHistoryDTO record : records) {
                if (record.getTargetId() != null && record.getTargetId().equals(targetId)) {
                    return record;
                }
            }
            if (!records.isEmpty()) {
                return records.get(0);
            }
        }
        return UserReadingHistoryDTO.builder()
            .targetType(targetType)
            .targetId(targetId)
            .url(TARGET_ITEM.equals(targetType) ? "/items/" + targetId : null)
            .build();
    }

    private void requireVisibleTarget(String targetType, Long targetId) {
        if (TARGET_ARTICLE.equals(targetType)) {
            Article article = articleMapper.selectOne(new LambdaQueryWrapper<Article>()
                .eq(Article::getId, targetId)
                .eq(Article::getDeleted, 0)
                .eq(Article::getStatus, "PUBLISHED")
                .last("LIMIT 1"));
            if (article == null) {
                throw new IllegalArgumentException("Published article not found");
            }
            return;
        }

        Item item = itemMapper.selectById(targetId);
        if (item == null || Integer.valueOf(1).equals(item.getDeleted())) {
            throw new IllegalArgumentException("Item not found");
        }
        if (item.getStatus() != null && !Integer.valueOf(1).equals(item.getStatus())) {
            throw new IllegalArgumentException("Item is not available");
        }
    }

    private void requireUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("Invalid user id");
        }
    }

    private void requireTargetId(Long targetId) {
        if (targetId == null || targetId <= 0) {
            throw new IllegalArgumentException("Target id is required");
        }
    }

    private String normalizeTargetType(String targetType) {
        String normalized = String.valueOf(targetType).trim().toUpperCase();
        if (!TARGET_ITEM.equals(normalized) && !TARGET_ARTICLE.equals(normalized)) {
            throw new IllegalArgumentException("Unsupported history type");
        }
        return normalized;
    }

    private String normalizeListType(String type) {
        if (type == null || type.isBlank()) {
            return TYPE_ALL;
        }
        String normalized = type.trim().toLowerCase();
        if (TARGET_ITEM.equalsIgnoreCase(type)) return TYPE_ITEMS;
        if (TARGET_ARTICLE.equalsIgnoreCase(type)) return TYPE_ARTICLES;
        if (!TYPE_ALL.equals(normalized) && !TYPE_ITEMS.equals(normalized) && !TYPE_ARTICLES.equals(normalized)) {
            throw new IllegalArgumentException("Unsupported history type");
        }
        return normalized;
    }

    private String auditDetails(String targetType, Long targetId) {
        return "targetType=" + targetType + ",targetId=" + targetId;
    }
}
