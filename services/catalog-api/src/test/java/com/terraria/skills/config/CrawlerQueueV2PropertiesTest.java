package com.terraria.skills.config;

import com.terraria.skills.service.impl.crawlerv2.RedisCrawlerQueueV2Repository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CrawlerQueueV2PropertiesTest {

    @TempDir
    Path repositoryRoot;

    @Test
    void defaultsToTheFixedProductionNamespaceAndRepositoryRoot() {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();

        assertEquals(RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX, properties.resolveRedisNamespace());
        assertEquals(repositoryRoot.toAbsolutePath().normalize(), properties.resolveFixtureRoot(repositoryRoot));
    }

    @Test
    void acceptsOnlyTheDedicatedTestNamespaceAndFixtureArtifactRoot() {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        properties.setFixtureNamespacePrefix("terrapedia:crawler:wiki-monitor:v2:test:task-13:");
        properties.setFixtureRoot("reports/crawler-monitor/v2/fixtures/task-13");

        assertEquals("terrapedia:crawler:wiki-monitor:v2:test:task-13:", properties.resolveRedisNamespace());
        assertEquals(
            repositoryRoot.resolve("reports/crawler-monitor/v2/fixtures/task-13").toAbsolutePath().normalize(),
            properties.resolveFixtureRoot(repositoryRoot)
        );
    }

    @Test
    void rejectsProductionAndTraversalFixtureOverrides() {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        properties.setFixtureNamespacePrefix(RedisCrawlerQueueV2Repository.PRODUCTION_PREFIX + "unsafe:");

        assertThrows(IllegalStateException.class, properties::resolveRedisNamespace);

        properties.setFixtureNamespacePrefix("terrapedia:crawler:wiki-monitor:v2:test:task-13:");
        properties.setFixtureRoot("data/generated");
        assertThrows(IllegalStateException.class, () -> properties.resolveFixtureRoot(repositoryRoot));
    }
}
