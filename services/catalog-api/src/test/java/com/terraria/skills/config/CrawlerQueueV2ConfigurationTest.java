package com.terraria.skills.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.service.impl.crawlerv2.CrawlerLegacySnapshotReader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.lang.reflect.Field;
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
}
