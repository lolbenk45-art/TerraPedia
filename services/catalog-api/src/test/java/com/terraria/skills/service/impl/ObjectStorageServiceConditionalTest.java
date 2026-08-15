package com.terraria.skills.service.impl;

import com.terraria.skills.service.ObjectStorageService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ObjectStorageServiceConditionalTest {

    @Test
    void shouldProvideDisabledObjectStorageServiceWhenMinioIsDisabled() {
        new ApplicationContextRunner()
            .withPropertyValues("terraria.storage.minio.enabled=false")
            .withUserConfiguration(
                MinioObjectStorageServiceImpl.class,
                DisabledObjectStorageService.class
            )
            .run(context -> {
                assertTrue(context.isRunning(), () -> String.valueOf(context.getStartupFailure()));
                assertInstanceOf(
                    DisabledObjectStorageService.class,
                    context.getBean(ObjectStorageService.class)
                );
            });
    }
}
