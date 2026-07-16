package com.terraria.skills.config;

import com.terraria.skills.service.CategoryManagementService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CategorySnapshotWarmup implements SmartInitializingSingleton {

    private final CategoryManagementService categoryManagementService;

    @Override
    public void afterSingletonsInstantiated() {
        categoryManagementService.getCategoryMap();
    }
}
