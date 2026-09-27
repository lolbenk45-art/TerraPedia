package com.terraria.skills.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerMonitorOverviewDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ArmorImageCacheMonitorTest {
    @TempDir Path root;

    @Test
    void readsArmorImageEvidenceWithRedisEnabledAndWithoutQueueMutation() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        ObjectMapper mapper = new ObjectMapper();
        Path progress = root.resolve("data/generated/armor-image-cache-progress.latest.json");
        Files.createDirectories(progress.getParent());
        for (String status : new String[]{"running", "completed", "failed"}) {
            mapper.writeValue(progress.toFile(), Map.of(
                "actionId", "armor-set-images", "status", status, "phase", "verify-image-bytes",
                "current", 87, "total", 315, "lastHeartbeatAt", "2026-09-27T08:00:00Z",
                "generatedAt", "2026-09-27T08:00:00Z", "message", "Armor image bytes 87/315"));
            CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(mapper, root,
                Clock.fixed(Instant.parse("2026-09-27T08:00:00Z"), ZoneOffset.UTC), redis);
            CrawlerMonitorOverviewDTO.RegisteredTaskDTO task = service.getOverview().getRegisteredTasks().stream()
                .filter(row -> "armor-set-images".equals(row.getId())).findFirst().orElseThrow();
            assertEquals(status, task.getStatus());
            assertEquals(87, task.getCurrent());
            assertEquals(315, task.getTotal());
            assertTrue(task.isProgressReadable());
            assertFalse(task.isProgressStale());
            assertEquals("data/generated/armor-image-cache-progress.latest.json", task.getProgressSource());
        }
        verify(values, never()).set(anyString(), anyString());
    }
}
