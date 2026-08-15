package com.terraria.skills.config;

import com.terraria.skills.service.CategoryManagementService;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CategorySnapshotWarmupTest {

    @Test
    void shouldInitializeCategorySnapshotDuringSingletonStartup() {
        CategoryManagementService categoryManagementService = mock(CategoryManagementService.class);
        when(categoryManagementService.getCategoryMap()).thenReturn(Map.of());

        new CategorySnapshotWarmup(categoryManagementService).afterSingletonsInstantiated();

        verify(categoryManagementService).getCategoryMap();
    }

    @Test
    void shouldFailStartupWhenCategorySnapshotCannotInitialize() {
        CategoryManagementService categoryManagementService = mock(CategoryManagementService.class);
        IllegalStateException failure = new IllegalStateException("category database unavailable");
        when(categoryManagementService.getCategoryMap()).thenThrow(failure);

        IllegalStateException thrown = assertThrows(
            IllegalStateException.class,
            () -> new CategorySnapshotWarmup(categoryManagementService).afterSingletonsInstantiated()
        );

        assertSame(failure, thrown);
    }
}
