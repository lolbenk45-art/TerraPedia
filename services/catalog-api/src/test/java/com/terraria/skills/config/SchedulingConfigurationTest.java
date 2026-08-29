package com.terraria.skills.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SchedulingConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(SchedulingConfiguration.class);

    @Test
    void disablesScheduledAnnotationProcessingWhenSchedulingIsExplicitlyDisabled() {
        contextRunner
            .withPropertyValues("spring.task.scheduling.enabled=false")
            .run(context -> assertTrue(
                context.getBeansOfType(ScheduledAnnotationBeanPostProcessor.class).isEmpty()
            ));
    }

    @Test
    void enablesScheduledAnnotationProcessingByDefault() {
        contextRunner.run(context -> assertFalse(
            context.getBeansOfType(ScheduledAnnotationBeanPostProcessor.class).isEmpty()
        ));
    }
}
