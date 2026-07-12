package com.terraria.skills.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@Data
@ConfigurationProperties(prefix = "terraria.crawler.queue-v2")
public class CrawlerQueueV2Properties {

    private Duration queuedDeadline = Duration.ofHours(2);
    private Duration startingDeadline = Duration.ofMinutes(2);
    private Duration runningHeartbeatDeadline = Duration.ofSeconds(90);
    private Duration pauseRequestDeadline = Duration.ofSeconds(30);
    private Duration pausedDeadline = Duration.ofHours(24);
    private Duration cancelRequestDeadline = Duration.ofSeconds(30);
    private Duration retryWindow = Duration.ofMinutes(30);
    private Duration stalledDeadline = Duration.ofMinutes(2);
    private Duration leaseTtl = Duration.ofSeconds(90);
    private Duration leaseRenewInterval = Duration.ofSeconds(30);
    private Duration reconcileInterval = Duration.ofSeconds(5);
    private Duration reconcilerStaleAfter = Duration.ofSeconds(15);
    private Duration gracefulTerminationWait = Duration.ofSeconds(15);
    private Duration forcedTerminationWait = Duration.ofSeconds(5);
    private Duration unconfirmedProcessIsolation = Duration.ofMinutes(2);
    private Duration terminalRetentionAge = Duration.ofDays(7);
    private int terminalRetentionCount = 100;
    private Duration sseHeartbeatInterval = Duration.ofSeconds(10);
    private Duration sseSessionTimeout = Duration.ofMinutes(5);
    private int sseMaxSubscribers = 32;
    private boolean cutoverAllowed;
    private boolean fixtureEnabled;
}
