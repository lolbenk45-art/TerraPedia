package com.terraria.skills.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptArtifactStore;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptProcessLauncher;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptStateMachine;
import com.terraria.skills.service.impl.crawlerv2.CrawlerAttemptSupervisor;
import com.terraria.skills.service.impl.crawlerv2.CrawlerLegacySnapshotReader;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueEngineRouter;
import com.terraria.skills.service.impl.crawlerv2.CrawlerQueueV2Repository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.time.Clock;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

class CrawlerQueueV2ConfigurationTest {

    @TempDir
    Path repositoryRoot;

    @Test
    void usesTheProductionLegacyPrefixWhenFixtureActionIsEnabledWithoutFixtureNamespaceOverrides() throws Exception {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        properties.setFixtureEnabled(true);

        CrawlerLegacySnapshotReader reader = assertDoesNotThrow(() ->
            new CrawlerQueueV2Configuration().crawlerLegacySnapshotReader(
                new ObjectMapper(),
                mock(StringRedisTemplate.class),
                Clock.systemUTC(),
                properties,
                repositoryRoot.toString()
            )
        );

        Field prefix = CrawlerLegacySnapshotReader.class.getDeclaredField("legacyPrefix");
        prefix.setAccessible(true);
        assertEquals(CrawlerLegacySnapshotReader.PRODUCTION_V1_PREFIX, prefix.get(reader));
    }

    @Test
    void discoversTheRepositoryRootWhenBackendRunsFromTheServiceDirectory() throws Exception {
        Path projectRoot = Path.of("..", "..").toAbsolutePath().normalize();
        Path serviceWorkingDirectory = projectRoot.resolve("services/catalog-api");
        String previousUserDir = System.getProperty("user.dir");
        String previousRepoRoot = System.getProperty("terrapedia.repo-root");
        try {
            System.clearProperty("terrapedia.repo-root");
            System.setProperty("user.dir", serviceWorkingDirectory.toString());
            Method resolver = CrawlerQueueV2Configuration.class.getDeclaredMethod("resolveRepoRoot", String.class);
            resolver.setAccessible(true);

            assertEquals(projectRoot, resolver.invoke(new CrawlerQueueV2Configuration(), ""));
        } finally {
            if (previousUserDir == null) System.clearProperty("user.dir");
            else System.setProperty("user.dir", previousUserDir);
            if (previousRepoRoot == null) System.clearProperty("terrapedia.repo-root");
            else System.setProperty("terrapedia.repo-root", previousRepoRoot);
        }
    }

    @Test
    void keepsAttemptStateDurableWhilePassingTheConfiguredCommandRootToTheSupervisor() throws Exception {
        Path commandRoot = repositoryRoot.resolveSibling("scheduler-command-root");
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();

        CrawlerAttemptSupervisor supervisor = new CrawlerQueueV2Configuration().crawlerAttemptSupervisor(
            mock(CrawlerQueueV2Repository.class),
            mock(CrawlerAttemptArtifactStore.class),
            CrawlerMonitorActionRegistry.defaults(),
            mock(CrawlerAttemptProcessLauncher.class),
            new CrawlerAttemptStateMachine(properties),
            properties,
            Clock.systemUTC(),
            mock(CrawlerQueueEngineRouter.class),
            repositoryRoot.toString(),
            commandRoot.toString()
        );

        Field worktreeRoot = CrawlerAttemptSupervisor.class.getDeclaredField("worktreeRoot");
        worktreeRoot.setAccessible(true);
        Field artifactRoot = CrawlerAttemptSupervisor.class.getDeclaredField("artifactRoot");
        artifactRoot.setAccessible(true);
        Field supervisorCommandRoot = CrawlerAttemptSupervisor.class.getDeclaredField("commandRoot");
        supervisorCommandRoot.setAccessible(true);

        assertEquals(repositoryRoot.toAbsolutePath().normalize(), worktreeRoot.get(supervisor));
        assertEquals(repositoryRoot.toAbsolutePath().normalize(), artifactRoot.get(supervisor));
        assertEquals(commandRoot.toAbsolutePath().normalize(), supervisorCommandRoot.get(supervisor));
    }
}
