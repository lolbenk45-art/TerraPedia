package com.terraria.skills.config;

import com.terraria.skills.service.impl.crawlerv2.RedisCrawlerQueueV2Repository;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.time.Duration;

@Data
@ConfigurationProperties(prefix = "terraria.crawler.queue-v2")
public class CrawlerQueueV2Properties {

    private static final String TEST_NAMESPACE_PREFIX =
        RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX + "test:";
    private static final Path FIXTURE_ARTIFACT_ROOT = Path.of(
        "reports", "crawler-monitor", "v2", "fixtures"
    );

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
    private String fixtureNamespacePrefix;
    private String fixtureLegacyNamespacePrefix;
    private String fixtureRoot;

    /**
     * Returns the only Redis namespace a fixture-enabled runtime may use.
     * Empty configuration deliberately retains the fixed production prefix so
     * ordinary production startup remains unchanged.
     */
    public String resolveRedisNamespace() {
        if (blank(fixtureNamespacePrefix)) {
            return RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX;
        }
        String normalized = fixtureNamespacePrefix.trim();
        if (!normalized.startsWith(TEST_NAMESPACE_PREFIX) || !normalized.endsWith(":")) {
            throw new IllegalStateException(
                "fixture Redis namespace 必须位于 terrapedia:crawler:wiki-monitor:v2:test: 下并以冒号结尾"
            );
        }
        return normalized;
    }

    /**
     * A fixture root can be an isolated external directory, or the one
     * explicitly reserved fixture subtree inside the repository. No other
     * repository path is accepted.
     */
    public Path resolveFixtureRoot(Path repositoryRoot) {
        Path root = repositoryRoot.toAbsolutePath().normalize();
        if (blank(fixtureRoot)) {
            return root;
        }
        Path configured = Path.of(fixtureRoot.trim());
        Path resolved = (configured.isAbsolute() ? configured : root.resolve(configured))
            .toAbsolutePath()
            .normalize();
        Path allowedInsideRepository = root.resolve(FIXTURE_ARTIFACT_ROOT).normalize();
        if (resolved.startsWith(root) && !resolved.startsWith(allowedInsideRepository)) {
            throw new IllegalStateException(
                "fixture root 必须位于仓库外或 reports/crawler-monitor/v2/fixtures/ 下"
            );
        }
        return resolved;
    }

    public String resolveFixtureLegacyNamespace() {
        if (blank(fixtureLegacyNamespacePrefix)) {
            return "";
        }
        String normalized = fixtureLegacyNamespacePrefix.trim();
        if (!normalized.contains(":test:") || !normalized.endsWith(":")) {
            throw new IllegalStateException("fixture legacy namespace 必须包含 :test: 并以冒号结尾");
        }
        return normalized;
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
