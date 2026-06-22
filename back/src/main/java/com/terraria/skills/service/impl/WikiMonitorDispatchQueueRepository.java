package com.terraria.skills.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import java.util.stream.Collectors;

class WikiMonitorDispatchQueueRepository {

    static final String KEY_PREFIX = "terrapedia:crawler:wiki-monitor:dispatch-queue:";
    private static final String IDS_KEY = KEY_PREFIX + "ids";
    private static final String DRAIN_LOCK_KEY = KEY_PREFIX + "drain-lock";
    private static final Path MIRROR_PATH = Path.of("reports", "crawler-monitor", "wiki-monitor-dispatch-queue.latest.json");
    private static final Duration CLAIM_LEASE = Duration.ofMinutes(5);
    private static final Duration DEDUPE_TTL = Duration.ofHours(24);
    private static final Duration STANDARD_COOLDOWN = Duration.ofMinutes(30);
    private static final Duration DRAIN_LOCK_WAIT = Duration.ofSeconds(5);
    private static final int TERMINAL_RETAIN_COUNT = 100;
    private static final Duration TERMINAL_RETAIN_AGE = Duration.ofDays(7);
    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "failed", "timed_out", "cancelled");
    private static final TypeReference<MirrorPayload> MIRROR_TYPE = new TypeReference<>() {};

    private static final RedisScript<String> ENQUEUE_SCRIPT = new DefaultRedisScript<>("""
        local dedupe = redis.call('GET', KEYS[2])
        if dedupe then
          return 'existing:' .. dedupe
        end
        redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])
        redis.call('SET', KEYS[3], ARGV[2])
        redis.call('RPUSH', KEYS[1], ARGV[1])
        return 'created'
        """, String.class);

    private static final RedisScript<String> CLAIM_SCRIPT = new DefaultRedisScript<>("""
        local payload = redis.call('GET', KEYS[1])
        if not payload then
          return 'missing'
        end
        local status = string.match(payload, '"status"%s*:%s*"([^"]+)"')
        if status ~= 'queued' and status ~= 'blocked_cooldown' then
          return status or 'unknown'
        end
        redis.call('SET', KEYS[1], ARGV[1])
        return 'claimed'
        """, String.class);

    private static final RedisScript<Long> RELEASE_DRAIN_LOCK_SCRIPT = new DefaultRedisScript<>("""
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end
        return 0
        """, Long.class);

    private final ObjectMapper objectMapper;
    private final Path repoRoot;
    private final StringRedisTemplate redisTemplate;
    private final Clock clock;
    private final ReentrantLock mutationLock = new ReentrantLock();
    private final ReentrantLock drainLock = new ReentrantLock();

    WikiMonitorDispatchQueueRepository(ObjectMapper objectMapper, Path repoRoot, StringRedisTemplate redisTemplate) {
        this(objectMapper, repoRoot, redisTemplate, Clock.systemUTC());
    }

    WikiMonitorDispatchQueueRepository(ObjectMapper objectMapper, Path repoRoot, StringRedisTemplate redisTemplate, Clock clock) {
        this.objectMapper = objectMapper == null ? new ObjectMapper().findAndRegisterModules() : objectMapper.copy().findAndRegisterModules();
        this.objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        this.repoRoot = repoRoot == null ? Path.of("").toAbsolutePath().normalize() : repoRoot.toAbsolutePath().normalize();
        this.redisTemplate = redisTemplate;
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    EnqueueResult enqueue(WikiMonitorQueueItem item, Instant cooldownUntil) {
        Objects.requireNonNull(item, "item");
        ensureItemDefaults(item, cooldownUntil);
        if (redisTemplate != null) {
            return enqueueRedis(item);
        }
        return withMutation(() -> {
            MirrorPayload mirror = readMirror();
            Optional<WikiMonitorQueueItem> duplicate = lookupDedupeInMirror(mirror, item.getLane(), item.getActionId());
            if (duplicate.isPresent()) {
                return new EnqueueResult(false, duplicate.get());
            }
            mirror.items.add(item);
            mirror.dedupe.put(dedupeKey(item.getLane(), item.getActionId()), new DedupeEntry(item.getQueueId(), Instant.now(clock).plus(DEDUPE_TTL)));
            writeMirror(mirror);
            return new EnqueueResult(true, item);
        });
    }

    List<WikiMonitorQueueItem> listItems() {
        if (redisTemplate != null) {
            if (redisTemplate.opsForList() == null) {
                return List.of();
            }
            List<String> ids = redisTemplate.opsForList().range(IDS_KEY, 0, -1);
            if (ids == null || ids.isEmpty()) {
                return List.of();
            }
            List<WikiMonitorQueueItem> items = new ArrayList<>();
            for (String id : ids) {
                findItem(id).ifPresent(items::add);
            }
            return items;
        }
        return withMutation(() -> new ArrayList<>(readMirror().items));
    }

    Optional<WikiMonitorQueueItem> findItem(String queueId) {
        if (queueId == null || queueId.isBlank()) {
            return Optional.empty();
        }
        if (redisTemplate != null) {
            return readRedisItem(queueId);
        }
        return withMutation(() -> readMirror().items.stream()
            .filter(item -> queueId.equals(item.getQueueId()))
            .findFirst());
    }

    Optional<WikiMonitorQueueItem> findByDispatchId(String dispatchId) {
        if (dispatchId == null || dispatchId.isBlank()) {
            return Optional.empty();
        }
        if (redisTemplate != null) {
            String queueId = redisTemplate.opsForValue().get(dispatchKey(dispatchId));
            return findItem(queueId);
        }
        return withMutation(() -> {
            MirrorPayload mirror = readMirror();
            String queueId = mirror.dispatches.get(dispatchId);
            if (queueId != null) {
                return mirror.items.stream().filter(item -> queueId.equals(item.getQueueId())).findFirst();
            }
            return mirror.items.stream()
                .filter(item -> !item.isTerminal())
                .filter(item -> dispatchId.equals(item.getDispatchId()))
                .findFirst();
        });
    }

    ClaimResult claimForStart(String queueId, String owner) {
        if (redisTemplate != null) {
            Optional<WikiMonitorQueueItem> current = findItem(queueId);
            if (current.isEmpty()) {
                String status = redisTemplate.execute(CLAIM_SCRIPT, List.of(itemKey(queueId)), "");
                return new ClaimResult(false, status == null ? "missing" : status, Optional.empty());
            }
            WikiMonitorQueueItem claimed = current.get();
            String status = claimItem(claimed, owner);
            if (!"claimed".equals(status)) {
                return new ClaimResult(false, status, Optional.of(claimed));
            }
            String result = redisTemplate.execute(CLAIM_SCRIPT, List.of(itemKey(queueId)), writeItem(claimed));
            return new ClaimResult("claimed".equals(result), result == null ? "conflict" : result, "claimed".equals(result) ? Optional.of(claimed) : Optional.empty());
        }
        return withMutation(() -> {
            MirrorPayload mirror = readMirror();
            Optional<WikiMonitorQueueItem> existing = mirror.items.stream()
                .filter(item -> queueId.equals(item.getQueueId()))
                .findFirst();
            if (existing.isEmpty()) {
                return new ClaimResult(false, "missing", Optional.empty());
            }
            String status = claimItem(existing.get(), owner);
            if (!"claimed".equals(status)) {
                return new ClaimResult(false, status, existing);
            }
            writeMirror(mirror);
            return new ClaimResult(true, "claimed", existing);
        });
    }

    TransitionResult releaseStartingClaimToQueued(String queueId, String message) {
        return mutateItem(queueId, item -> {
            if (!"starting".equals(item.getStatus())) {
                return new TransitionResult(false, item.getStatus(), item);
            }
            clearClaim(item);
            item.setStatus("queued");
            item.setMessage(message);
            return new TransitionResult(true, "queued", item);
        });
    }

    TransitionResult markExpiredStartingFailed(String queueId, String message) {
        return mutateItem(queueId, item -> {
            if (!"starting".equals(item.getStatus())) {
                return new TransitionResult(false, item.getStatus(), item);
            }
            clearClaim(item);
            item.setStatus("failed");
            item.setCompletedAt(Instant.now(clock));
            item.setMessage(message);
            if (redisTemplate != null) {
                redisTemplate.delete(dedupeKey(item.getLane(), item.getActionId()));
            }
            return new TransitionResult(true, "failed", item);
        }, mirror -> {
            WikiMonitorQueueItem item = findMirrorItem(mirror, queueId);
            if (item != null) {
                mirror.dedupe.remove(dedupeKey(item.getLane(), item.getActionId()));
            }
        });
    }

    TransitionResult markRunning(
        String queueId,
        String dispatchId,
        long pid,
        Instant processStartedAt,
        Instant startedAt,
        QueuePaths paths
    ) {
        return mutateItem(queueId, item -> {
            item.setStatus("running");
            item.setDispatchId(dispatchId);
            item.setPid(pid);
            item.setProcessStartedAt(processStartedAt);
            item.setStartedAt(startedAt == null ? Instant.now(clock) : startedAt);
            if (paths != null) {
                item.setProgressPath(paths.progressPath());
                item.setReportPath(paths.reportPath());
                item.setLockPath(paths.lockPath());
                item.setOutputPath(paths.outputPath());
                item.setLogPath(paths.logPath());
            }
            item.setBlockedByDispatchId(null);
            item.setBlockedByDomain(null);
            item.setBlockedByActionId(null);
            item.setBlockedSince(null);
            item.setCooldownUntil(null);
            clearClaim(item);
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(dispatchKey(dispatchId), queueId);
            }
            return new TransitionResult(true, "running", item);
        }, mirror -> mirror.dispatches.put(dispatchId, queueId));
    }

    TransitionResult markTerminal(String queueId, String status, Instant completedAt, String message) {
        TransitionResult result = mutateItem(queueId, item -> {
            if (!TERMINAL_STATUSES.contains(status)) {
                return new TransitionResult(false, item.getStatus(), item);
            }
            if (item.isTerminal()) {
                return new TransitionResult(false, item.getStatus(), item);
            }
            String dispatchId = item.getDispatchId();
            item.setStatus(status);
            item.setCompletedAt(completedAt == null ? Instant.now(clock) : completedAt);
            item.setMessage(message);
            clearClaim(item);
            if (redisTemplate != null) {
                if (dispatchId != null) {
                    redisTemplate.delete(dispatchKey(dispatchId));
                }
                redisTemplate.delete(dedupeKey(item.getLane(), item.getActionId()));
            }
            return new TransitionResult(true, status, item);
        }, mirror -> {
            WikiMonitorQueueItem item = findMirrorItem(mirror, queueId);
            if (item != null) {
                if (item.getDispatchId() != null) {
                    mirror.dispatches.remove(item.getDispatchId());
                }
                mirror.dedupe.remove(dedupeKey(item.getLane(), item.getActionId()));
                if ("completed".equals(status) && "standard".equals(item.getLane())) {
                    mirror.cooldowns.put(
                        cooldownKey(item.getLane(), item.getActionId()),
                        new CooldownEntry(item.getLane(), item.getActionId(), item.getDispatchId(), item.getCompletedAt(), item.getCompletedAt().plus(STANDARD_COOLDOWN))
                    );
                }
            }
        });
        if (result.changed() && redisTemplate != null && "completed".equals(status) && result.item() != null && "standard".equals(result.item().getLane())) {
            recordCooldown(
                result.item().getLane(),
                result.item().getActionId(),
                result.item().getDispatchId(),
                result.item().getCompletedAt(),
                result.item().getCompletedAt().plus(STANDARD_COOLDOWN)
            );
        }
        return result;
    }

    CancelResult cancelQueued(String queueId, String message) {
        TransitionResult result = mutateItem(queueId, item -> {
            if (!"queued".equals(item.getStatus()) && !"blocked_cooldown".equals(item.getStatus())) {
                return new TransitionResult(false, item.getStatus(), item);
            }
            item.setStatus("cancelled");
            item.setCompletedAt(Instant.now(clock));
            item.setMessage(message);
            clearClaim(item);
            if (redisTemplate != null) {
                redisTemplate.delete(dedupeKey(item.getLane(), item.getActionId()));
            }
            return new TransitionResult(true, "cancelled", item);
        }, mirror -> {
            WikiMonitorQueueItem item = findMirrorItem(mirror, queueId);
            if (item != null) {
                mirror.dedupe.remove(dedupeKey(item.getLane(), item.getActionId()));
            }
        });
        return new CancelResult(result.changed(), result.status(), result.item());
    }

    Optional<WikiMonitorQueueItem> dedupeLookup(String lane, String actionId) {
        if (redisTemplate != null) {
            String queueId = redisTemplate.opsForValue().get(dedupeKey(lane, actionId));
            Optional<WikiMonitorQueueItem> item = findItem(queueId);
            if (item.isPresent() && item.get().isDedupeActive()) {
                return item;
            }
            if (queueId != null) {
                redisTemplate.delete(dedupeKey(lane, actionId));
            }
            return Optional.empty();
        }
        return withMutation(() -> lookupDedupeInMirror(readMirror(), lane, actionId));
    }

    void clearDedupe(String lane, String actionId) {
        if (lane == null || actionId == null) {
            return;
        }
        if (redisTemplate != null) {
            redisTemplate.delete(dedupeKey(lane, actionId));
            return;
        }
        withMutation(() -> {
            MirrorPayload mirror = readMirror();
            mirror.dedupe.remove(dedupeKey(lane, actionId));
            writeMirror(mirror);
            return null;
        });
    }

    Optional<Instant> cooldownUntilFor(String lane, String actionId) {
        if (redisTemplate != null) {
            String json = redisTemplate.opsForValue().get(cooldownKey(lane, actionId));
            return readCooldownUntil(json);
        }
        return withMutation(() -> Optional.ofNullable(readMirror().cooldowns.get(cooldownKey(lane, actionId)))
            .map(CooldownEntry::cooldownUntil));
    }

    void recordCooldown(String lane, String actionId, String completedDispatchId, Instant completedAt, Instant cooldownUntil) {
        CooldownEntry entry = new CooldownEntry(lane, actionId, completedDispatchId, completedAt, cooldownUntil);
        if (redisTemplate != null) {
            redisTemplate.opsForValue().set(cooldownKey(lane, actionId), writeValue(entry));
            return;
        }
        withMutation(() -> {
            MirrorPayload mirror = readMirror();
            mirror.cooldowns.put(cooldownKey(lane, actionId), entry);
            writeMirror(mirror);
            return null;
        });
    }

    void pruneTerminalItems(Instant now) {
        Instant cutoff = (now == null ? Instant.now(clock) : now).minus(TERMINAL_RETAIN_AGE);
        if (redisTemplate != null) {
            List<WikiMonitorQueueItem> allItems = listItems();
            Set<String> keep = terminalItemsToKeep(allItems, cutoff);
            for (WikiMonitorQueueItem item : allItems) {
                if (item.isTerminal() && !keep.contains(item.getQueueId())) {
                    redisTemplate.delete(itemKey(item.getQueueId()));
                    if (item.getDispatchId() != null) {
                        redisTemplate.delete(dispatchKey(item.getDispatchId()));
                    }
                    redisTemplate.opsForList().remove(IDS_KEY, 0, item.getQueueId());
                }
            }
            mirrorSnapshot();
            return;
        }
        withMutation(() -> {
            MirrorPayload mirror = readMirror();
            Set<String> keep = terminalItemsToKeep(mirror.items, cutoff);
            mirror.items.removeIf(item -> item.isTerminal() && !keep.contains(item.getQueueId()));
            writeMirror(mirror);
            return null;
        });
    }

    QueueSnapshot mirrorSnapshot() {
        if (redisTemplate == null) {
            return withMutation(() -> {
                MirrorPayload mirror = readMirror();
                writeMirror(mirror);
                return snapshotFrom(mirror.items, mirror.cooldowns);
            });
        }
        List<WikiMonitorQueueItem> items = listItems();
        Map<String, CooldownEntry> cooldowns = Map.of();
        QueueSnapshot snapshot = new QueueSnapshot(
            Instant.now(clock),
            items,
            items.stream().filter(item -> "running".equals(item.getStatus())).count(),
            items.stream().filter(item -> "queued".equals(item.getStatus())).count(),
            items.stream().filter(item -> "blocked_cooldown".equals(item.getStatus())).count(),
            items.stream().filter(item -> "completed".equals(item.getStatus())).count(),
            items.stream().filter(item -> "failed".equals(item.getStatus()) || "timed_out".equals(item.getStatus())).count(),
            cooldowns
        );
        writeSnapshot(snapshot);
        return snapshot;
    }

    Optional<QueuePosition> positionFor(String queueId) {
        List<WikiMonitorQueueItem> waiting = listItems().stream()
            .filter(WikiMonitorQueueItem::isWaiting)
            .toList();
        int global = 0;
        int lane = 0;
        String targetLane = null;
        for (WikiMonitorQueueItem item : waiting) {
            global++;
            if (queueId.equals(item.getQueueId())) {
                targetLane = item.getLane();
                break;
            }
        }
        if (targetLane == null) {
            return Optional.empty();
        }
        for (WikiMonitorQueueItem item : waiting) {
            if (targetLane.equals(item.getLane())) {
                lane++;
            }
            if (queueId.equals(item.getQueueId())) {
                return Optional.of(new QueuePosition(global, lane));
            }
        }
        return Optional.empty();
    }

    boolean withDrainLock(String reason, String lane, Runnable body) {
        return withDrainLock(reason, lane, false, body);
    }

    boolean withDrainLock(String reason, String lane, boolean waitIfBusy, Runnable body) {
        if (redisTemplate != null) {
            String owner = drainOwner(reason, lane);
            if (!acquireRedisDrainLock(owner, waitIfBusy)) {
                return false;
            }
            try {
                body.run();
                return true;
            } finally {
                redisTemplate.execute(RELEASE_DRAIN_LOCK_SCRIPT, List.of(DRAIN_LOCK_KEY), owner);
            }
        }
        if (!acquireLocalDrainLock(waitIfBusy)) {
            return false;
        }
        try {
            body.run();
            return true;
        } finally {
            drainLock.unlock();
        }
    }

    private boolean acquireRedisDrainLock(String owner, boolean waitIfBusy) {
        long deadline = System.nanoTime() + DRAIN_LOCK_WAIT.toNanos();
        do {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(DRAIN_LOCK_KEY, owner, 30, TimeUnit.SECONDS);
            if (Boolean.TRUE.equals(acquired)) {
                return true;
            }
            if (!waitIfBusy) {
                return false;
            }
            try {
                TimeUnit.MILLISECONDS.sleep(50);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        } while (System.nanoTime() < deadline);
        return false;
    }

    private boolean acquireLocalDrainLock(boolean waitIfBusy) {
        if (!waitIfBusy) {
            return drainLock.tryLock();
        }
        drainLock.lock();
        return true;
    }

    String generateQueueId() {
        return "wiki-monitor-queue-" + Instant.now(clock).toEpochMilli() + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private EnqueueResult enqueueRedis(WikiMonitorQueueItem item) {
        String itemJson = writeItem(item);
        String dedupeKey = dedupeKey(item.getLane(), item.getActionId());
        for (int attempt = 0; attempt < 2; attempt++) {
            String result;
            try {
                result = redisTemplate.execute(
                    ENQUEUE_SCRIPT,
                    List.of(IDS_KEY, dedupeKey, itemKey(item.getQueueId())),
                    item.getQueueId(),
                    itemJson,
                    String.valueOf(DEDUPE_TTL.toSeconds())
                );
            } catch (RuntimeException e) {
                redisTemplate.delete(dedupeKey);
                throw e;
            }
            if (result != null && result.startsWith("existing:")) {
                String existingQueueId = result.substring("existing:".length());
                Optional<WikiMonitorQueueItem> existing = findItem(existingQueueId);
                if (existing.isPresent() && existing.get().isDedupeActive()) {
                    return new EnqueueResult(false, existing.get());
                }
                redisTemplate.delete(dedupeKey);
                continue;
            }
            if ("created".equals(result)) {
                mirrorSnapshot();
                return new EnqueueResult(true, item);
            }
            redisTemplate.delete(dedupeKey);
            throw new IllegalStateException("Redis enqueue failed: " + result);
        }
        throw new IllegalStateException("Redis enqueue failed after stale dedupe cleanup");
    }

    private TransitionResult mutateItem(String queueId, ItemMutation mutation) {
        return mutateItem(queueId, mutation, null);
    }

    private TransitionResult mutateItem(String queueId, ItemMutation mutation, MirrorMutation mirrorMutation) {
        if (redisTemplate != null) {
            Optional<WikiMonitorQueueItem> existing = findItem(queueId);
            if (existing.isEmpty()) {
                return new TransitionResult(false, "missing", null);
            }
            TransitionResult result = mutation.apply(existing.get());
            if (result.changed()) {
                redisTemplate.opsForValue().set(itemKey(queueId), writeItem(existing.get()));
                mirrorSnapshot();
            }
            return result;
        }
        return withMutation(() -> {
            MirrorPayload mirror = readMirror();
            WikiMonitorQueueItem item = mirror.items.stream()
                .filter(candidate -> queueId.equals(candidate.getQueueId()))
                .findFirst()
                .orElse(null);
            if (item == null) {
                return new TransitionResult(false, "missing", null);
            }
            TransitionResult result = mutation.apply(item);
            if (result.changed() && mirrorMutation != null) {
                mirrorMutation.apply(mirror);
            }
            writeMirror(mirror);
            return result;
        });
    }

    private String claimItem(WikiMonitorQueueItem item, String owner) {
        if (!"queued".equals(item.getStatus()) && !"blocked_cooldown".equals(item.getStatus())) {
            return item.getStatus();
        }
        if ("blocked_cooldown".equals(item.getStatus())
            && item.getCooldownUntil() != null
            && item.getCooldownUntil().isAfter(Instant.now(clock))) {
            return "blocked_cooldown";
        }
        Instant now = Instant.now(clock);
        item.setStatus("starting");
        item.setClaimOwner(owner);
        item.setClaimedAt(now);
        item.setClaimExpiresAt(now.plus(CLAIM_LEASE));
        return "claimed";
    }

    private Optional<WikiMonitorQueueItem> lookupDedupeInMirror(MirrorPayload mirror, String lane, String actionId) {
        String key = dedupeKey(lane, actionId);
        DedupeEntry entry = mirror.dedupe.get(key);
        if (entry == null) {
            return Optional.empty();
        }
        if (entry.expiresAt() != null && entry.expiresAt().isBefore(Instant.now(clock))) {
            mirror.dedupe.remove(key);
            writeMirror(mirror);
            return Optional.empty();
        }
        Optional<WikiMonitorQueueItem> item = mirror.items.stream()
            .filter(candidate -> entry.queueId().equals(candidate.getQueueId()))
            .findFirst();
        if (item.isPresent() && item.get().isDedupeActive()) {
            return item;
        }
        mirror.dedupe.remove(key);
        writeMirror(mirror);
        return Optional.empty();
    }

    private WikiMonitorQueueItem findMirrorItem(MirrorPayload mirror, String queueId) {
        return mirror.items.stream()
            .filter(candidate -> queueId.equals(candidate.getQueueId()))
            .findFirst()
            .orElse(null);
    }

    private void ensureItemDefaults(WikiMonitorQueueItem item, Instant cooldownUntil) {
        if (item.getQueueId() == null || item.getQueueId().isBlank()) {
            item.setQueueId(generateQueueId());
        }
        if (item.getRequestedAt() == null) {
            item.setRequestedAt(Instant.now(clock));
        }
        if (item.getRequestedBy() == null) {
            item.setRequestedBy("admin");
        }
        if (cooldownUntil != null && cooldownUntil.isAfter(Instant.now(clock))) {
            item.setStatus("blocked_cooldown");
            item.setCooldownUntil(cooldownUntil);
        } else if (item.getStatus() == null) {
            item.setStatus("queued");
        }
    }

    private MirrorPayload readMirror() {
        Path mirrorPath = mirrorPath();
        if (!Files.isRegularFile(mirrorPath)) {
            return new MirrorPayload();
        }
        try {
            MirrorPayload payload = objectMapper.readValue(mirrorPath.toFile(), MIRROR_TYPE);
            return payload == null ? new MirrorPayload() : payload.normalize();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read wiki monitor queue mirror " + mirrorPath, e);
        }
    }

    private void writeMirror(MirrorPayload mirror) {
        mirror.generatedAt = Instant.now(clock);
        writeSnapshot(snapshotFrom(mirror.items, mirror.cooldowns), mirror);
    }

    private void writeSnapshot(QueueSnapshot snapshot) {
        writeSnapshot(snapshot, null);
    }

    private void writeSnapshot(QueueSnapshot snapshot, MirrorPayload mirrorPayload) {
        Path mirrorPath = mirrorPath();
        try {
            Files.createDirectories(mirrorPath.getParent());
            Object payload = mirrorPayload == null ? snapshot : mirrorPayload.withCounts();
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(mirrorPath.toFile(), payload);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write wiki monitor queue mirror " + mirrorPath, e);
        }
    }

    private QueueSnapshot snapshotFrom(List<WikiMonitorQueueItem> items, Map<String, CooldownEntry> cooldowns) {
        List<WikiMonitorQueueItem> safeItems = items == null ? List.of() : items;
        Map<String, CooldownEntry> safeCooldowns = cooldowns == null ? Map.of() : cooldowns;
        return new QueueSnapshot(
            Instant.now(clock),
            safeItems,
            safeItems.stream().filter(item -> "running".equals(item.getStatus())).count(),
            safeItems.stream().filter(item -> "queued".equals(item.getStatus())).count(),
            safeItems.stream().filter(item -> "blocked_cooldown".equals(item.getStatus())).count(),
            safeItems.stream().filter(item -> "completed".equals(item.getStatus())).count(),
            safeItems.stream().filter(item -> "failed".equals(item.getStatus()) || "timed_out".equals(item.getStatus())).count(),
            safeCooldowns
        );
    }

    private Set<String> terminalItemsToKeep(List<WikiMonitorQueueItem> items, Instant cutoff) {
        List<WikiMonitorQueueItem> terminals = items.stream()
            .filter(WikiMonitorQueueItem::isTerminal)
            .sorted(Comparator.comparing(WikiMonitorQueueItem::getCompletedAt, Comparator.nullsFirst(Comparator.naturalOrder())).reversed())
            .toList();
        Set<String> keep = terminals.stream()
            .limit(TERMINAL_RETAIN_COUNT)
            .map(WikiMonitorQueueItem::getQueueId)
            .collect(Collectors.toSet());
        terminals.stream()
            .filter(item -> item.getCompletedAt() != null && !item.getCompletedAt().isBefore(cutoff))
            .map(WikiMonitorQueueItem::getQueueId)
            .forEach(keep::add);
        return keep;
    }

    private Path mirrorPath() {
        return repoRoot.resolve(MIRROR_PATH).normalize();
    }

    private Optional<WikiMonitorQueueItem> readRedisItem(String queueId) {
        if (queueId == null || queueId.isBlank()) {
            return Optional.empty();
        }
        String json = redisTemplate.opsForValue().get(itemKey(queueId));
        if (json == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(json, WikiMonitorQueueItem.class));
        } catch (IOException e) {
            throw new IllegalStateException("Failed to parse queue item " + queueId, e);
        }
    }

    private Optional<Instant> readCooldownUntil(String json) {
        if (json == null || json.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            JsonNode value = node.get("cooldownUntil");
            return value == null || value.isNull() ? Optional.empty() : Optional.of(Instant.parse(value.asText()));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private String writeItem(WikiMonitorQueueItem item) {
        return writeValue(item);
    }

    private String writeValue(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to serialize queue value", e);
        }
    }

    private <T> T withMutation(Supplier<T> supplier) {
        mutationLock.lock();
        try {
            return supplier.get();
        } finally {
            mutationLock.unlock();
        }
    }

    private void clearClaim(WikiMonitorQueueItem item) {
        item.setClaimOwner(null);
        item.setClaimedAt(null);
        item.setClaimExpiresAt(null);
    }

    private String drainOwner(String reason, String lane) {
        return "reason=" + nullToDash(reason)
            + ";lane=" + nullToDash(lane)
            + ";host=" + hostName()
            + ";process=" + ManagementFactory.getRuntimeMXBean().getName()
            + ";at=" + Instant.now(clock);
    }

    private String hostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            return "unknown-host";
        }
    }

    private String nullToDash(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }

    private String itemKey(String queueId) {
        return KEY_PREFIX + "item:" + queueId;
    }

    private String dedupeKey(String lane, String actionId) {
        return KEY_PREFIX + "dedupe:" + lane + ":" + actionId;
    }

    private String dispatchKey(String dispatchId) {
        return KEY_PREFIX + "dispatch:" + dispatchId;
    }

    private String cooldownKey(String lane, String actionId) {
        return KEY_PREFIX + "cooldown:" + lane + ":" + actionId;
    }

    record EnqueueResult(boolean created, WikiMonitorQueueItem item) {}

    record ClaimResult(boolean claimed, String status, Optional<WikiMonitorQueueItem> item) {}

    record TransitionResult(boolean changed, String status, WikiMonitorQueueItem item) {}

    record CancelResult(boolean cancelled, String status, WikiMonitorQueueItem item) {}

    record QueuePosition(int position, int lanePosition) {}

    record QueuePaths(String progressPath, String reportPath, String lockPath, String outputPath, String logPath) {}

    record CooldownEntry(String lane, String actionId, String completedDispatchId, Instant completedAt, Instant cooldownUntil) {}

    record DedupeEntry(String queueId, Instant expiresAt) {}

    record QueueSnapshot(
        Instant generatedAt,
        List<WikiMonitorQueueItem> items,
        long runningCount,
        long queuedCount,
        long blockedCooldownCount,
        long completedCount,
        long failedCount,
        Map<String, CooldownEntry> cooldowns
    ) {}

    @FunctionalInterface
    private interface ItemMutation {
        TransitionResult apply(WikiMonitorQueueItem item);
    }

    @FunctionalInterface
    private interface MirrorMutation {
        void apply(MirrorPayload mirror);
    }

    static class MirrorPayload {
        public Instant generatedAt;
        public List<WikiMonitorQueueItem> items = new ArrayList<>();
        public long runningCount;
        public long queuedCount;
        public long blockedCooldownCount;
        public long completedCount;
        public long failedCount;
        public Map<String, CooldownEntry> cooldowns = new LinkedHashMap<>();
        public Map<String, DedupeEntry> dedupe = new LinkedHashMap<>();
        public Map<String, String> dispatches = new LinkedHashMap<>();

        MirrorPayload normalize() {
            if (items == null) {
                items = new ArrayList<>();
            }
            if (cooldowns == null) {
                cooldowns = new LinkedHashMap<>();
            }
            if (dedupe == null) {
                dedupe = new LinkedHashMap<>();
            }
            if (dispatches == null) {
                dispatches = new LinkedHashMap<>();
            }
            return this;
        }

        MirrorPayload withCounts() {
            normalize();
            runningCount = items.stream().filter(item -> "running".equals(item.getStatus())).count();
            queuedCount = items.stream().filter(item -> "queued".equals(item.getStatus())).count();
            blockedCooldownCount = items.stream().filter(item -> "blocked_cooldown".equals(item.getStatus())).count();
            completedCount = items.stream().filter(item -> "completed".equals(item.getStatus())).count();
            failedCount = items.stream().filter(item -> "failed".equals(item.getStatus()) || "timed_out".equals(item.getStatus())).count();
            return this;
        }
    }
}
