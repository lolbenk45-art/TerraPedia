package com.terraria.skills.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.UserReadingHistoryDTO;
import com.terraria.skills.entity.Article;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.UserReadingHistory;
import com.terraria.skills.mapper.ArticleMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.terraria.skills.mapper.UserReadingHistoryMapper;
import com.terraria.skills.service.impl.UserReadingHistoryServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserReadingHistoryServiceImplTest {

    private UserReadingHistoryMapper userReadingHistoryMapper;
    private ItemMapper itemMapper;
    private ArticleMapper articleMapper;
    private SecurityAuditService securityAuditService;
    private UserReadingHistoryServiceImpl service;

    @BeforeEach
    void setUp() {
        userReadingHistoryMapper = mock(UserReadingHistoryMapper.class);
        itemMapper = mock(ItemMapper.class);
        articleMapper = mock(ArticleMapper.class);
        securityAuditService = mock(SecurityAuditService.class);
        service = new UserReadingHistoryServiceImpl(userReadingHistoryMapper, itemMapper, articleMapper, securityAuditService);
    }

    @Test
    void shouldInsertArticleHistoryWhenNoExistingRowExists() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        when(userReadingHistoryMapper.selectByUserAndTargetIncludeDeleted(42L, "ARTICLE", 77L)).thenReturn(null);
        when(userReadingHistoryMapper.selectActiveHistoryPage(42L, "ARTICLE", 1, 0)).thenReturn(List.of(UserReadingHistoryDTO.builder()
            .targetType("ARTICLE")
            .targetId(77L)
            .url("/articles/guide")
            .build()));

        service.record(42L, "ARTICLE", 77L, "127.0.0.1");

        ArgumentCaptor<UserReadingHistory> captor = ArgumentCaptor.forClass(UserReadingHistory.class);
        verify(userReadingHistoryMapper).insert(captor.capture());
        assertEquals(42L, captor.getValue().getUserId());
        assertEquals("ARTICLE", captor.getValue().getTargetType());
        assertEquals(77L, captor.getValue().getTargetId());
        verify(securityAuditService).log(eq("USER_READING_HISTORY_RECORDED"), eq("USER"), eq(42L), eq(null), eq("127.0.0.1"), eq("targetType=ARTICLE,targetId=77"));
    }

    @Test
    void shouldReactivateAndIncrementExistingItemHistory() {
        Item item = activeItem();
        when(itemMapper.selectById(88L)).thenReturn(item);
        UserReadingHistory existing = new UserReadingHistory();
        existing.setId(9L);
        existing.setDeleted(1);
        when(userReadingHistoryMapper.selectByUserAndTargetIncludeDeleted(42L, "ITEM", 88L)).thenReturn(existing);
        when(userReadingHistoryMapper.selectActiveHistoryPage(42L, "ITEM", 1, 0)).thenReturn(List.of(UserReadingHistoryDTO.builder()
            .targetType("ITEM")
            .targetId(88L)
            .url("/items/88")
            .viewCount(3)
            .build()));

        service.record(42L, "ITEM", 88L, "127.0.0.1");

        verify(userReadingHistoryMapper).reactivateAndIncrement(9L);
        verify(userReadingHistoryMapper, never()).insert(any(UserReadingHistory.class));
    }

    @Test
    void shouldRecoverDuplicateInsertRaceByIncrementingExistingRow() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(publishedArticle());
        UserReadingHistory existing = new UserReadingHistory();
        existing.setId(11L);
        existing.setDeleted(0);
        when(userReadingHistoryMapper.selectByUserAndTargetIncludeDeleted(42L, "ARTICLE", 77L))
            .thenReturn(null)
            .thenReturn(existing);
        when(userReadingHistoryMapper.insert(any(UserReadingHistory.class))).thenThrow(new DuplicateKeyException("duplicate"));
        when(userReadingHistoryMapper.selectActiveHistoryPage(42L, "ARTICLE", 1, 0)).thenReturn(List.of(UserReadingHistoryDTO.builder()
            .targetType("ARTICLE")
            .targetId(77L)
            .url("/articles/guide")
            .build()));

        service.record(42L, "ARTICLE", 77L, "127.0.0.1");

        verify(userReadingHistoryMapper).incrementExisting(11L);
    }

    @Test
    void shouldPageAllHistoryForCurrentUserOnly() {
        when(userReadingHistoryMapper.countActiveByUser(42L)).thenReturn(2L);
        when(userReadingHistoryMapper.selectActiveHistoryPageAll(42L, 20, 0)).thenReturn(List.of(
            UserReadingHistoryDTO.builder().targetType("ITEM").targetId(88L).lastViewedAt(LocalDateTime.now()).build(),
            UserReadingHistoryDTO.builder().targetType("ARTICLE").targetId(77L).lastViewedAt(LocalDateTime.now().minusMinutes(1)).build()
        ));

        Page<UserReadingHistoryDTO> page = service.getHistory(42L, "all", 1, 20);

        assertEquals(2L, page.getTotal());
        assertEquals(2, page.getRecords().size());
        verify(userReadingHistoryMapper).selectActiveHistoryPageAll(42L, 20, 0);
    }

    @Test
    void shouldSoftDeleteOnlyCurrentUserHistory() {
        service.remove(42L, "ARTICLE", 77L, "127.0.0.1");

        verify(userReadingHistoryMapper).softDelete(42L, "ARTICLE", 77L);
        verify(securityAuditService).log(eq("USER_READING_HISTORY_REMOVED"), eq("USER"), eq(42L), eq(null), eq("127.0.0.1"), eq("targetType=ARTICLE,targetId=77"));
    }

    @Test
    void shouldRejectInvalidTargetTypeAndId() {
        assertThrows(IllegalArgumentException.class, () -> service.record(42L, "NPC", 77L, "127.0.0.1"));
        assertThrows(IllegalArgumentException.class, () -> service.record(42L, "ARTICLE", 0L, "127.0.0.1"));
    }

    @Test
    void shouldNotInsertUnavailableTargets() {
        when(articleMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> service.record(42L, "ARTICLE", 77L, "127.0.0.1"));
        verify(userReadingHistoryMapper, never()).insert(any(UserReadingHistory.class));

        Item deleted = activeItem();
        deleted.setDeleted(1);
        when(itemMapper.selectById(88L)).thenReturn(deleted);
        assertThrows(IllegalArgumentException.class, () -> service.record(42L, "ITEM", 88L, "127.0.0.1"));
        verify(userReadingHistoryMapper, never()).insert(any(UserReadingHistory.class));
    }

    private Article publishedArticle() {
        Article article = new Article();
        article.setId(77L);
        article.setStatus("PUBLISHED");
        article.setDeleted(0);
        article.setSlug("guide");
        return article;
    }

    private Item activeItem() {
        Item item = new Item();
        item.setId(88L);
        item.setStatus(1);
        item.setDeleted(0);
        return item;
    }
}
