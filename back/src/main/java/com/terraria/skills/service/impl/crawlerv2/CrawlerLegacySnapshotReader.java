package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.connection.DataType;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Read-only, bounded V1 evidence capture for an explicit V2 cutover. */
public class CrawlerLegacySnapshotReader {

    public static final String PRODUCTION_V1_PREFIX = "terrapedia:crawler:wiki-monitor:dispatch-queue:";
    private static final int SCAN_LIMIT = 10_000;
    private static final Path MIRROR = Path.of("reports", "crawler-monitor", "wiki-monitor-dispatch-queue.latest.json");
    private static final Path LATEST = Path.of("reports", "crawler-monitor", "wiki-monitor-dispatch.latest.json");
    private static final Path LOCK = Path.of("reports", "crawler-monitor", "wiki-monitor-dispatch.lock.json");

    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final Path repoRoot;
    private final Clock clock;
    private final String legacyPrefix;

    public CrawlerLegacySnapshotReader(ObjectMapper objectMapper, StringRedisTemplate redisTemplate, Path repoRoot, Clock clock) {
        this(objectMapper, redisTemplate, repoRoot, clock, PRODUCTION_V1_PREFIX);
    }

    public CrawlerLegacySnapshotReader(
        ObjectMapper objectMapper,
        StringRedisTemplate redisTemplate,
        Path repoRoot,
        Clock clock,
        String legacyPrefix
    ) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper").copy().findAndRegisterModules();
        this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate");
        this.repoRoot = Objects.requireNonNull(repoRoot, "repoRoot").toAbsolutePath().normalize();
        this.clock = Objects.requireNonNull(clock, "clock");
        this.legacyPrefix = requireLegacyPrefix(legacyPrefix);
    }

    public LegacySnapshot snapshot(String cutoverId, String gitSha, Instant capturedAt) {
        requireText(cutoverId, "cutoverId");
        requireText(gitSha, "gitSha");
        Path destination = manifestPath(cutoverId);
        if (Files.exists(destination)) {
            return readExistingSnapshot(destination, cutoverId, gitSha);
        }
        Instant captured = capturedAt == null ? clock.instant() : capturedAt;
        List<String> errors = new ArrayList<>();
        byte[] mirror = readRequired(MIRROR, errors);
        byte[] latest = readRequired(LATEST, errors);
        byte[] lock = readRequired(LOCK, errors);
        List<LegacyQueueItem> queueItems = mergeLegacyEvidence(mirror, latest, lock, errors);
        List<LegacyQueueItem> nonTerminal = queueItems.stream().filter(item -> !terminal(item.status())).toList();
        List<RecordedProcess> processes = nonTerminal.stream()
            .filter(item -> item.pid() != null && item.pid() > 0L && item.processStartedAt() != null)
            .map(item -> new RecordedProcess(item.queueId(), item.dispatchId(), item.domain(), item.actionId(), item.pid(), item.processStartedAt()))
            .toList();
        List<V1KeySummary> keys = scan(errors);
        String manifestPath = displayManifestPath(cutoverId);
        LegacySnapshot unsigned = new LegacySnapshot(
            cutoverId,
            captured,
            gitSha,
            manifestPath,
            "",
            sha256(mirror),
            sha256(latest),
            sha256(lock),
            keys,
            queueItems,
            nonTerminal,
            processes,
            errors
        );
        if (!writeIfAbsent(destination, serialize(unsigned))) {
            return readExistingSnapshot(destination, cutoverId, gitSha);
        }
        return withFinalChecksum(unsigned, destination);
    }

    /** Writes a separate immutable abort decision without changing source evidence. */
    public void recordAborted(LegacySnapshot snapshot, CrawlerQueueV2ReasonCode reasonCode) {
        Objects.requireNonNull(snapshot, "snapshot");
        if (reasonCode != CrawlerQueueV2ReasonCode.LEGACY_PROCESS_UNCONFIRMED) {
            throw new IllegalArgumentException("仅允许记录 LEGACY_PROCESS_UNCONFIRMED cutover abort");
        }
        Path directory = manifestPath(snapshot.cutoverId()).getParent();
        Path destination = directory.resolve("cutover-aborted.json").normalize();
        if (!destination.startsWith(repoRoot)) {
            throw new IllegalArgumentException("cutover abort path escaped repository root");
        }
        CutoverAbort abort = new CutoverAbort(
            snapshot.cutoverId(),
            snapshot.manifestPath(),
            snapshot.manifestSha256(),
            "aborted",
            reasonCode,
            clock.instant()
        );
        if (Files.exists(destination)) {
            CutoverAbort existing = readAbort(destination);
            if (!Objects.equals(abort.cutoverId(), existing.cutoverId()) || existing.reasonCode() != reasonCode) {
                throw new IllegalStateException("cutover abort manifest 与既有 immutable 记录冲突");
            }
            return;
        }
        writeIfAbsent(destination, serialize(abort));
    }

    private LegacySnapshot readExistingSnapshot(Path destination, String cutoverId, String gitSha) {
        try {
            LegacySnapshot existing = objectMapper.readValue(Files.readAllBytes(destination), LegacySnapshot.class);
            if (!Objects.equals(cutoverId, existing.cutoverId()) || !Objects.equals(gitSha, existing.gitSha())) {
                throw new IllegalStateException("cutoverId 或 Git SHA 与既有 immutable snapshot 不一致");
            }
            return withFinalChecksum(existing, destination);
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取 immutable legacy snapshot", exception);
        }
    }

    private CutoverAbort readAbort(Path destination) {
        try {
            return objectMapper.readValue(Files.readAllBytes(destination), CutoverAbort.class);
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取 immutable cutover abort manifest", exception);
        }
    }

    private LegacySnapshot withFinalChecksum(LegacySnapshot snapshot, Path destination) {
        return new LegacySnapshot(
            snapshot.cutoverId(), snapshot.capturedAt(), snapshot.gitSha(), snapshot.manifestPath(),
            sha256(readFinal(destination)), snapshot.mirrorSha256(), snapshot.latestDispatchSha256(), snapshot.lockSha256(),
            snapshot.v1KeySummaries(), snapshot.queueItems(), snapshot.nonTerminalItems(), snapshot.recordedProcesses(),
            snapshot.sourceErrors()
        );
    }

    private List<V1KeySummary> scan(List<String> errors) {
        List<V1KeySummary> summaries = new ArrayList<>();
        Cursor<String> cursor = null;
        try {
            cursor = redisTemplate.scan(ScanOptions.scanOptions().match(legacyPrefix + "*").count(256).build());
            if (cursor == null) {
                errors.add("legacy Redis scan returned null cursor");
                return List.of();
            }
            while (cursor.hasNext()) {
                if (summaries.size() >= SCAN_LIMIT) {
                    errors.add("legacy Redis scan reached safety limit " + SCAN_LIMIT);
                    break;
                }
                String key = cursor.next();
                DataType type = redisTemplate.type(key);
                Long ttl = redisTemplate.getExpire(key, java.util.concurrent.TimeUnit.MILLISECONDS);
                String value = type == DataType.STRING ? redisTemplate.opsForValue().get(key) : null;
                byte[] bytes = value == null ? new byte[0] : value.getBytes(StandardCharsets.UTF_8);
                summaries.add(new V1KeySummary(key, type == null ? "none" : type.code(), ttl, bytes.length, sha256(bytes)));
            }
        } catch (RuntimeException exception) {
            errors.add("legacy Redis scan unavailable: " + exception.getClass().getSimpleName());
        } finally {
            if (cursor != null) cursor.close();
        }
        return List.copyOf(summaries);
    }

    private List<LegacyQueueItem> mergeLegacyEvidence(byte[] mirror, byte[] latest, byte[] lock, List<String> errors) {
        List<LegacyQueueItem> items = parseMirror(mirror, errors);
        LegacyQueueItem latestItem = parseSingle(latest, "latest dispatch", false, errors);
        LegacyQueueItem lockItem = parseSingle(lock, "dispatch lock", true, errors);
        List<LegacyQueueItem> merged = new ArrayList<>(items);
        mergeSingleEvidence(merged, latestItem, "latest dispatch", errors);
        mergeSingleEvidence(merged, lockItem, "dispatch lock", errors);
        for (LegacyQueueItem item : merged) {
            if ((item.pid() == null) != (item.processStartedAt() == null)) {
                errors.add("legacy process evidence is incomplete for queueId=" + item.queueId());
            }
        }
        return List.copyOf(merged);
    }

    private List<LegacyQueueItem> parseMirror(byte[] source, List<String> errors) {
        if (source.length == 0) return List.of();
        try {
            JsonNode items = objectMapper.readTree(source).path("items");
            List<LegacyQueueItem> result = new ArrayList<>();
            if (items.isArray()) {
                for (JsonNode item : items) result.add(itemOf(item, false));
            } else if (items.isObject()) {
                items.fields().forEachRemaining(entry -> result.add(itemOf(entry.getValue(), false, entry.getKey())));
            } else {
                errors.add("legacy mirror has no items array/object");
            }
            return result.stream().filter(item -> !blank(item.queueId()) || !blank(item.dispatchId())).toList();
        } catch (IOException exception) {
            errors.add("legacy mirror unreadable: " + exception.getClass().getSimpleName());
            return List.of();
        }
    }

    private LegacyQueueItem parseSingle(byte[] source, String name, boolean lockSource, List<String> errors) {
        if (source.length == 0) return null;
        try {
            JsonNode node = objectMapper.readTree(source);
            if (node == null || !node.isObject() || node.isEmpty()) return null;
            return itemOf(node, lockSource);
        } catch (IOException exception) {
            errors.add("legacy " + name + " unreadable: " + exception.getClass().getSimpleName());
            return null;
        }
    }

    private void mergeSingleEvidence(
        List<LegacyQueueItem> items,
        LegacyQueueItem evidence,
        String source,
        List<String> errors
    ) {
        if (evidence == null) return;
        List<Integer> matches = new ArrayList<>();
        for (int index = 0; index < items.size(); index++) {
            if (sameIdentity(items.get(index), evidence)) matches.add(index);
        }
        if (matches.size() > 1) {
            errors.add("legacy " + source + " matches multiple mirror queue rows");
            return;
        }
        if (matches.isEmpty()) {
            if (hasProcessEvidence(evidence)) {
                errors.add("legacy " + source + " has unpaired process evidence");
            }
            return;
        }
        int index = matches.get(0);
        items.set(index, merge(items.get(index), evidence, source, errors));
    }

    private LegacyQueueItem merge(LegacyQueueItem base, LegacyQueueItem extra, String source, List<String> errors) {
        if (conflicts(base.queueId(), extra.queueId()) || conflicts(base.dispatchId(), extra.dispatchId())
            || conflicts(base.domain(), extra.domain()) || conflicts(base.actionId(), extra.actionId())
            || conflicts(base.pid(), extra.pid()) || conflicts(base.processStartedAt(), extra.processStartedAt())) {
            errors.add("legacy " + source + " identity conflicts with mirror evidence");
        }
        return new LegacyQueueItem(
            choose(base.queueId(), extra.queueId()), choose(base.dispatchId(), extra.dispatchId()),
            choose(base.domain(), extra.domain()), choose(base.actionId(), extra.actionId()), choose(base.status(), extra.status()),
            choose(base.requestedAt(), extra.requestedAt()), choose(base.startedAt(), extra.startedAt()), choose(base.completedAt(), extra.completedAt()),
            choose(base.pid(), extra.pid()), choose(base.processStartedAt(), extra.processStartedAt()),
            choose(base.progressPath(), extra.progressPath()), choose(base.logPath(), extra.logPath()),
            base.logAvailability(), base.logSizeBytes(), base.logLastWriteAt(), base.logRetentionExpiresAt(), base.logReasonCode(),
            choose(base.message(), extra.message())
        );
    }

    private LegacyQueueItem itemOf(JsonNode node, boolean lockSource) { return itemOf(node, lockSource, null); }

    private LegacyQueueItem itemOf(JsonNode node, boolean lockSource, String queueIdFallback) {
        Instant processStartedAt = instant(node, "processStartedAt");
        if (processStartedAt == null && lockSource) processStartedAt = instant(node, "startedAt");
        return new LegacyQueueItem(
            text(node, "queueId", queueIdFallback), text(node, "dispatchId", null), text(node, "domain", null),
            text(node, "actionId", null), text(node, "status", lockSource ? null : "unknown"), instant(node, "requestedAt"),
            instant(node, "startedAt"), instant(node, "completedAt"), longValue(node, "pid"), processStartedAt,
            text(node, "progressPath", null), text(node, "logPath", null), null, null, null, null, null,
            text(node, "message", null)
        );
    }

    private byte[] readRequired(Path relative, List<String> errors) {
        Path source = repoRoot.resolve(relative).normalize();
        if (!source.startsWith(repoRoot) || !Files.isRegularFile(source)) {
            errors.add("legacy source missing: " + relative);
            return new byte[0];
        }
        try {
            return Files.readAllBytes(source);
        } catch (IOException exception) {
            errors.add("legacy source unreadable: " + relative + " (" + exception.getClass().getSimpleName() + ")");
            return new byte[0];
        }
    }

    private Path manifestPath(String cutoverId) {
        Path path = repoRoot.resolve("reports/crawler-monitor/v2/cutovers").resolve(cutoverId).resolve("cutover-manifest.json").normalize();
        if (!path.startsWith(repoRoot)) throw new IllegalArgumentException("cutover manifest path escaped repository root");
        return path;
    }

    private String displayManifestPath(String cutoverId) {
        return "reports/crawler-monitor/v2/cutovers/" + cutoverId + "/cutover-manifest.json";
    }

    private byte[] readFinal(Path path) {
        try { return Files.readAllBytes(path); }
        catch (IOException exception) { throw new IllegalStateException(exception); }
    }

    private byte[] serialize(Object value) {
        try { return objectMapper.writeValueAsBytes(value); }
        catch (IOException exception) { throw new IllegalStateException(exception); }
    }

    private boolean writeIfAbsent(Path destination, byte[] content) {
        try {
            Files.createDirectories(destination.getParent());
            Path temporary = Files.createTempFile(destination.getParent(), ".cutover-", ".tmp");
            try {
                Files.write(temporary, content);
                try {
                    Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException ignored) {
                    Files.move(temporary, destination);
                }
                return true;
            } catch (FileAlreadyExistsException exists) {
                return false;
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("unable to persist immutable cutover evidence", exception);
        }
    }

    private static boolean sameIdentity(LegacyQueueItem left, LegacyQueueItem right) {
        return (!blank(left.dispatchId()) && Objects.equals(left.dispatchId(), right.dispatchId()))
            || (!blank(left.queueId()) && Objects.equals(left.queueId(), right.queueId()));
    }

    private static boolean hasProcessEvidence(LegacyQueueItem item) {
        return item.pid() != null || item.processStartedAt() != null;
    }

    private static boolean conflicts(Object left, Object right) {
        return left != null && right != null && !Objects.equals(left, right);
    }

    private static <T> T choose(T first, T second) { return first != null ? first : second; }

    private static String text(JsonNode node, String field, String fallback) {
        return node.path(field).isTextual() && !node.path(field).asText().isBlank() ? node.path(field).asText() : fallback;
    }

    private static Long longValue(JsonNode node, String field) { return node.path(field).canConvertToLong() ? node.path(field).asLong() : null; }

    private static Instant instant(JsonNode node, String field) {
        try { String value = text(node, field, null); return value == null ? null : Instant.parse(value); }
        catch (RuntimeException ignored) { return null; }
    }

    private static boolean terminal(String status) {
        return "completed".equalsIgnoreCase(status) || "failed".equalsIgnoreCase(status)
            || "cancelled".equalsIgnoreCase(status) || "interrupted".equalsIgnoreCase(status);
    }

    private static String requireLegacyPrefix(String value) {
        if (value == null || value.isBlank() || !value.endsWith(":")) {
            throw new IllegalArgumentException("legacy Redis prefix 必须非空且以冒号结尾");
        }
        return value;
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }

    private static void requireText(String value, String field) { if (blank(value)) throw new IllegalArgumentException(field + "不能为空"); }

    private static String sha256(byte[] bytes) {
        try { return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes == null ? new byte[0] : bytes)); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    public record V1KeySummary(String key, String type, Long ttlMs, long valueSize, String valueSha256) {}
    public record LegacyQueueItem(String queueId, String dispatchId, String domain, String actionId, String status, Instant requestedAt, Instant startedAt, Instant completedAt, Long pid, Instant processStartedAt, String progressPath, String logPath, CrawlerAttemptLogAvailability logAvailability, Long logSizeBytes, Instant logLastWriteAt, Instant logRetentionExpiresAt, CrawlerQueueV2ReasonCode logReasonCode, String message) {}
    public record RecordedProcess(String queueId, String dispatchId, String domain, String actionId, long pid, Instant processStartedAt) {}
    public record LegacySnapshot(String cutoverId, Instant capturedAt, String gitSha, String manifestPath, @JsonIgnore String manifestSha256, String mirrorSha256, String latestDispatchSha256, String lockSha256, List<V1KeySummary> v1KeySummaries, List<LegacyQueueItem> queueItems, List<LegacyQueueItem> nonTerminalItems, List<RecordedProcess> recordedProcesses, List<String> sourceErrors) {
        public LegacySnapshot { v1KeySummaries = List.copyOf(v1KeySummaries); queueItems = List.copyOf(queueItems); nonTerminalItems = List.copyOf(nonTerminalItems); recordedProcesses = List.copyOf(recordedProcesses); sourceErrors = List.copyOf(sourceErrors); }
    }
    public record CutoverAbort(String cutoverId, String manifestPath, String manifestSha256, String status, CrawlerQueueV2ReasonCode reasonCode, Instant recordedAt) {}
}
