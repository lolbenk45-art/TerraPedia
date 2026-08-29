package com.terraria.skills.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Keeps every @Scheduled task behind the standard Spring scheduling switch.
 * This is deliberately separate from the application so read-only runtime
 * probes can disable scheduling without disabling the API beans themselves.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
    prefix = "spring.task.scheduling",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true
)
public class SchedulingConfiguration {
}
