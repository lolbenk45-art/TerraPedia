package com.terraria.skills.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptArtifactStore;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptProcessLauncher;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptStateMachine;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptSupervisor;
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
        Clock crawlerQueueV2Clock
    ) {
        return new RedisCrawlerQueueV2Repository(
            objectMapper,
            redisTemplate,
            crawlerQueueV2Clock,
            RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX
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
            resolveRepoRoot(configuredRepoRoot),
            crawlerQueueV2Clock,
            properties
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
            crawlerQueueV2Clock
        );
    }

    @Bean
    public CrawlerQueueV2Reconciler crawlerQueueV2Reconciler(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptSupervisor supervisor,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Clock crawlerQueueV2Clock
    ) {
        return new CrawlerQueueV2Reconciler(repository, supervisor, stateMachine, properties, crawlerQueueV2Clock);
    }

    @Bean
    public CrawlerQueueV2RecoveryService crawlerQueueV2RecoveryService(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptArtifactStore artifactStore,
        CrawlerAttemptSupervisor supervisor,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Clock crawlerQueueV2Clock
    ) {
        return new CrawlerQueueV2RecoveryService(
            repository,
            artifactStore,
            supervisor,
            stateMachine,
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
}
