package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.dto.CrawlerQueueV2OverviewDTO;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Reads only the immutable cutover manifest. It deliberately has no Redis or
 * V1 queue repository dependency, so a live V1 record can never leak back into
 * V2 current state.
 */
public class CrawlerLegacyHistoryAdapter {

    private final ObjectMapper objectMapper;
    private final Path repoRoot;
    private final CrawlerQueueEngineRouter router;

    public CrawlerLegacyHistoryAdapter(
        ObjectMapper objectMapper,
        Path repoRoot,
        CrawlerQueueEngineRouter router
    ) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper").copy().findAndRegisterModules();
        this.repoRoot = Objects.requireNonNull(repoRoot, "repoRoot").toAbsolutePath().normalize();
        this.router = Objects.requireNonNull(router, "router");
    }

    public List<CrawlerQueueV2OverviewDTO.LegacyAttemptDTO> read() {
        Optional<Path> path = router.activeCutoverManifestPath();
        if (path.isEmpty()) {
            return List.of();
        }
        Path manifestPath = path.orElseThrow().toAbsolutePath().normalize();
        if (!manifestPath.startsWith(repoRoot) || !Files.isRegularFile(manifestPath)) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(Files.readAllBytes(manifestPath));
            JsonNode items = root == null ? null : root.path("queueItems");
            if (items == null || !items.isArray()) {
                return List.of();
            }
            List<CrawlerQueueV2OverviewDTO.LegacyAttemptDTO> rows = new ArrayList<>();
            for (JsonNode item : items) {
                CrawlerQueueV2OverviewDTO.LegacyAttemptDTO row = normalize(item);
                if (row != null) {
                    rows.add(row);
                }
            }
            return rows.stream()
                .sorted(Comparator.comparing(
                    CrawlerQueueV2OverviewDTO.LegacyAttemptDTO::requestedAt,
                    Comparator.nullsLast(Comparator.naturalOrder())
                ).thenComparing(CrawlerQueueV2OverviewDTO.LegacyAttemptDTO::attemptId))
                .toList();
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取 immutable V1 cutover snapshot", exception);
        }
    }

    private CrawlerQueueV2OverviewDTO.LegacyAttemptDTO normalize(JsonNode item) {
        String queueId = text(item, "queueId");
        if (blank(queueId)) {
            return null;
        }
        String originalStatus = text(item, "status");
        boolean terminal = isTerminal(originalStatus);
        CrawlerQueueV2ReasonCode reason = terminal ? null : CrawlerQueueV2ReasonCode.LEGACY_CUTOVER;
        String status = terminal ? originalStatus : CrawlerQueueV2Status.INTERRUPTED.value();
        CrawlerAttemptLogMetadata log = legacyLog(item);
        return new CrawlerQueueV2OverviewDTO.LegacyAttemptDTO(
            "legacy-v1",
            false,
            queueId,
            "legacy-v1:" + queueId,
            text(item, "domain"),
            text(item, "actionId"),
            status,
            instant(item, "requestedAt"),
            instant(item, "completedAt"),
            reason,
            reason == null ? null : reason.messageZh(),
            List.of(),
            log
        );
    }

    private CrawlerAttemptLogMetadata legacyLog(JsonNode item) {
        String queueId = text(item, "queueId");
        String path = text(item, "logPath");
        String availability = text(item, "logAvailability");
        CrawlerAttemptLogAvailability mapped = switch (availability == null ? "" : availability) {
            case "available" -> CrawlerAttemptLogAvailability.AVAILABLE;
            case "empty" -> CrawlerAttemptLogAvailability.EMPTY;
            case "expired" -> CrawlerAttemptLogAvailability.EXPIRED;
            case "forbidden" -> CrawlerAttemptLogAvailability.FORBIDDEN;
            default -> CrawlerAttemptLogAvailability.MISSING;
        };
        CrawlerQueueV2ReasonCode reason = switch (mapped) {
            case EMPTY -> CrawlerQueueV2ReasonCode.LOG_EMPTY;
            case EXPIRED -> CrawlerQueueV2ReasonCode.LOG_EXPIRED;
            case FORBIDDEN -> CrawlerQueueV2ReasonCode.LOG_FORBIDDEN;
            case MISSING -> CrawlerQueueV2ReasonCode.LOG_MISSING;
            case AVAILABLE -> null;
        };
        return new CrawlerAttemptLogMetadata(
            "legacy-v1:" + queueId,
            path,
            mapped,
            mapped == CrawlerAttemptLogAvailability.AVAILABLE,
            longValue(item, "logSizeBytes"),
            instant(item, "logLastWriteAt"),
            instant(item, "logRetentionExpiresAt"),
            reason
        );
    }

    private boolean isTerminal(String value) {
        if (blank(value)) {
            return false;
        }
        try {
            return CrawlerQueueV2Status.fromValue(value).terminal();
        } catch (IllegalArgumentException ignored) {
            return List.of("completed", "failed", "cancelled", "timed_out", "interrupted").contains(value);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    private static Long longValue(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || !value.canConvertToLong() ? null : value.longValue();
    }

    private static Instant instant(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
