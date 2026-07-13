package com.terraria.skills.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptArtifactStore;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptProcessLauncher;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptStateMachine;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptSupervisor;
import com.terraria.skills.service.impl.crawlerv2.CrawlerLegacyHistoryAdapter;
import com.terraria.skills.service.impl.crawlerv2.CrawlerLegacySnapshotReader;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueEngineRouter;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2ApplicationService;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2CutoverService;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Reconciler;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2RecoveryService;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Repository;
import com.terraria.skills.service.impl.crawlerv2.ProcessBuilderCrawlerAttemptLauncher;
import com.terraria.skills.service.impl.crawlerv2.RedisCrawlerQueueV2Repository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.UUID;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CrawlerQueueV2Properties.class)
public class CrawlerQueueV2Configuration {

    @Bean
    public Clock crawlerQueueV2Clock() {
        return Clock.systemUTC();
    }

    @Bean
    public CrawlerQueueV2Repository crawlerQueueV2Repository(
        ObjectMapper objectMapper,
        StringRedisTemplate redisTemplate,
        Clock crawlerQueueV2Clock,
        CrawlerQueueV2Properties properties
    ) {
        return new RedisCrawlerQueueV2Repository(
            objectMapper,
            redisTemplate,
            crawlerQueueV2Clock,
            properties.resolveRedisNamespace()
        );
    }

    @Bean
    public CrawlerQueueEngineRouter crawlerQueueEngineRouter(
        ObjectMapper objectMapper,
        CrawlerQueueV2Repository repository,
        Clock crawlerQueueV2Clock,
        CrawlerQueueV2Properties properties,
        @Value("${terrapedia.crawler.queue-v2.repo-root:}") String configuredRepoRoot
    ) {
        return new CrawlerQueueEngineRouter(
            objectMapper,
            repository,
            resolveFixtureRoot(configuredRepoRoot, properties),
            crawlerQueueV2Clock
        );
    }

    @Bean
    public CrawlerAttemptStateMachine crawlerAttemptStateMachine(CrawlerQueueV2Properties properties) {
        return new CrawlerAttemptStateMachine(properties);
    }

    @Bean
    public CrawlerAttemptArtifactStore crawlerAttemptArtifactStore(
        ObjectMapper objectMapper,
        CrawlerQueueV2Properties properties,
        Clock crawlerQueueV2Clock,
        @Value("${terrapedia.crawler.queue-v2.repo-root:}") String configuredRepoRoot
    ) {
        return new CrawlerAttemptArtifactStore(
            objectMapper,
            resolveFixtureRoot(configuredRepoRoot, properties),
            crawlerQueueV2Clock,
            properties
        );
    }

    @Bean
    public CrawlerLegacyHistoryAdapter crawlerLegacyHistoryAdapter(
        ObjectMapper objectMapper,
        CrawlerQueueEngineRouter router,
        CrawlerQueueV2Properties properties,
        @Value("${terrapedia.crawler.queue-v2.repo-root:}") String configuredRepoRoot
    ) {
        return new CrawlerLegacyHistoryAdapter(
            objectMapper,
            resolveFixtureRoot(configuredRepoRoot, properties),
            router
        );
    }

    @Bean
    public CrawlerAttemptProcessLauncher crawlerAttemptProcessLauncher() {
        return new ProcessBuilderCrawlerAttemptLauncher();
    }

    @Bean
    public CrawlerAttemptSupervisor crawlerAttemptSupervisor(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptArtifactStore artifactStore,
        CrawlerMonitorActionRegistry actionRegistry,
        CrawlerAttemptProcessLauncher launcher,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Clock crawlerQueueV2Clock,
        CrawlerQueueEngineRouter router,
        @Value("${terrapedia.crawler.queue-v2.repo-root:}") String configuredRepoRoot
    ) {
        return new CrawlerAttemptSupervisor(
            repository,
            artifactStore,
            actionRegistry,
            launcher,
            stateMachine,
            properties,
            resolveRepoRoot(configuredRepoRoot),
            resolveFixtureRoot(configuredRepoRoot, properties),
            crawlerQueueV2Clock,
            router
        );
    }

    @Bean
    public CrawlerQueueV2Reconciler crawlerQueueV2Reconciler(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptSupervisor supervisor,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Clock crawlerQueueV2Clock,
        CrawlerQueueEngineRouter router
    ) {
        return new CrawlerQueueV2Reconciler(repository, supervisor, stateMachine, properties, crawlerQueueV2Clock, router);
    }

    @Bean
    public CrawlerQueueV2RecoveryService crawlerQueueV2RecoveryService(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptArtifactStore artifactStore,
        CrawlerAttemptSupervisor supervisor,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Clock crawlerQueueV2Clock,
        CrawlerQueueEngineRouter router
    ) {
        return new CrawlerQueueV2RecoveryService(
            repository,
            artifactStore,
            supervisor,
            stateMachine,
            properties,
            crawlerQueueV2Clock,
            router
        );
    }

    @Bean
    public CrawlerLegacySnapshotReader crawlerLegacySnapshotReader(
        ObjectMapper objectMapper,
        StringRedisTemplate redisTemplate,
        Clock crawlerQueueV2Clock,
        CrawlerQueueV2Properties properties,
        @Value("${terrapedia.crawler.queue-v2.repo-root:}") String configuredRepoRoot
    ) {
        return new CrawlerLegacySnapshotReader(
            objectMapper,
            redisTemplate,
            resolveFixtureRoot(configuredRepoRoot, properties),
            crawlerQueueV2Clock
        );
    }

    @Bean
    public CrawlerQueueV2CutoverService crawlerQueueV2CutoverService(
        CrawlerQueueV2Properties properties,
        CrawlerQueueV2Repository repository,
        CrawlerLegacySnapshotReader snapshotReader,
        CrawlerAttemptProcessLauncher launcher,
        CrawlerQueueV2RecoveryService recoveryService,
        CrawlerQueueEngineRouter router,
        Clock crawlerQueueV2Clock
    ) {
        return new CrawlerQueueV2CutoverService(
            properties,
            repository,
            snapshotReader,
            launcher,
            recoveryService,
            router,
            crawlerQueueV2Clock,
            () -> "epoch-" + UUID.randomUUID()
        );
    }

    @Bean
    public CrawlerQueueV2ApplicationService crawlerQueueV2ApplicationService(
        CrawlerQueueEngineRouter router,
        CrawlerQueueV2Repository repository,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerAttemptSupervisor supervisor,
        CrawlerQueueV2Reconciler reconciler,
        CrawlerAttemptArtifactStore artifactStore,
        CrawlerMonitorActionRegistry actionRegistry,
        CrawlerLegacyHistoryAdapter legacyHistory,
        CrawlerQueueV2Properties properties,
        Clock crawlerQueueV2Clock
    ) {
        return new CrawlerQueueV2ApplicationService(
            router,
            repository,
            stateMachine,
            supervisor,
            reconciler,
            artifactStore,
            actionRegistry,
            legacyHistory,
            properties,
            crawlerQueueV2Clock
        );
    }

    private Path resolveRepoRoot(String configuredRepoRoot) {
        if (configuredRepoRoot != null && !configuredRepoRoot.isBlank()) {
            return Path.of(configuredRepoRoot).toAbsolutePath().normalize();
        }
        Path workingDirectory = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        if (Files.isDirectory(workingDirectory.resolve("back"))) {
            return workingDirectory;
        }
        if (Files.isDirectory(workingDirectory.resolve("src").resolve("main"))) {
            Path parent = workingDirectory.getParent();
            if (parent != null) {
                return parent;
            }
        }
        return workingDirectory;
    }

    private Path resolveFixtureRoot(String configuredRepoRoot, CrawlerQueueV2Properties properties) {
        Path repositoryRoot = resolveRepoRoot(configuredRepoRoot);
        properties.resolveFixtureLegacyNamespace();
        return properties.resolveFixtureRoot(repositoryRoot);
    }
}
