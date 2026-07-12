package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

public class RedisCrawlerQueueV2Repository implements CrawlerQueueV2Repository {

    public static final String PRODUCTION_PREFIX = "terrapedia:crawler:wiki-monitor:v2:";

    private static final long MAX_DEDUPE_TTL_MILLIS = Duration.ofDays(30).toMillis();
    private static final int QUARANTINE_REGISTRY_READ_LIMIT = 256;
    private static final DefaultRedisScript<String> CREATE_QUEUE_SCRIPT = createQueueScript();
    private static final DefaultRedisScript<String> CLAIM_ATTEMPT_SCRIPT = script("claim-attempt.lua");
    private static final DefaultRedisScript<String> MUTATE_ATTEMPT_SCRIPT = script("mutate-attempt.lua");
    private static final DefaultRedisScript<String> RENEW_LEASES_SCRIPT = script("renew-leases.lua");
    private static final DefaultRedisScript<String> CREATE_RETRY_SCRIPT = script("create-retry.lua");
    private static final DefaultRedisScript<String> APPEND_EVENT_SCRIPT = script("append-event.lua");
    private static final DefaultRedisScript<String> WRITE_HEALTH_SCRIPT = script("write-health.lua");
    private static final DefaultRedisScript<String> WRITE_QUARANTINE_SCRIPT = script("write-quarantine.lua");
    private static final DefaultRedisScript<String> INITIALIZE_RESET_EPOCH_SCRIPT = script("initialize-reset-epoch.lua");

    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final Clock clock;
    private final String prefix;

    private static DefaultRedisScript<String> createQueueScript() {
        return script("create-queue.lua");
    }

    private static DefaultRedisScript<String> script(String fileName) {
        DefaultRedisScript<String> script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource("redis/crawler-queue-v2/" + fileName));
        script.setResultType(String.class);
        return script;
    }

    public RedisCrawlerQueueV2Repository(
        ObjectMapper objectMapper,
        StringRedisTemplate redisTemplate,
        Clock clock,
        String prefix
    ) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper").copy().findAndRegisterModules();
        this.objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        this.redisTemplate = redisTemplate;
        this.clock = clock == null ? Clock.systemUTC() : clock;
        if (prefix == null || !prefix.startsWith(PRODUCTION_PREFIX) || !prefix.endsWith(":")) {
            throw new IllegalArgumentException("V2 Redis prefix 必须位于固定生产命名空间下并以冒号结尾");
        }
        this.prefix = prefix;
    }

    @Override
    public EngineState readEngineState() {
        List<String> keys = List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("meta:active-cutover-id"),
            key("meta:first-live-mutation-at")
        );
        List<String> values = redis(
            "读取 V2 engine state",
            () -> redisTemplate.opsForValue().multiGet(keys)
        );
        if (values == null || values.size() != keys.size()) {
            throw stateStoreReset("V2 engine state 快照不完整");
        }
        CrawlerQueueEngineMode mode;
        try {
            mode = CrawlerQueueEngineMode.fromValue(values.get(0));
        } catch (IllegalArgumentException exception) {
            throw stateStoreReset("V2 engine mode 无法识别", exception);
        }
        return new EngineState(mode, values.get(1), values.get(2), values.get(3));
    }

    @Override
    public String requireEpoch() {
        String epoch = redis("读取 V2 epoch", () -> redisTemplate.opsForValue().get(key("meta:epoch")));
        if (epoch == null || epoch.isBlank()) {
            throw stateStoreReset("V2 stateStoreEpoch 缺失");
        }
        return epoch;
    }

    @Override
    public EnqueueResult createQueue(CreateQueueCommand command) {
        Objects.requireNonNull(command, "command");
        CrawlerQueueV2Queue queue = Objects.requireNonNull(command.queue(), "queue");
        CrawlerQueueV2Attempt attempt = Objects.requireNonNull(command.attempt(), "attempt");
        Objects.requireNonNull(command.event(), "event");
        Objects.requireNonNull(command.dedupeTtl(), "dedupeTtl");
        long dedupeTtlMillis = validateCreateCommand(command);

        List<String> keys = List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("queue:" + queue.queueId()),
            key("attempt:" + attempt.attemptId()),
            key("lane:" + attempt.lane() + ":ready"),
            key("dedupe:" + queue.dedupeKey()),
            key("index:attempts:live"),
            key("index:queues"),
            key("meta:first-live-mutation-at"),
            key("events")
        );
        Object[] arguments = {
            command.expectedEpoch(),
            writeJson(queue),
            writeJson(attempt),
            Long.toString(command.readyScore()),
            Long.toString(dedupeTtlMillis),
            queue.queueId(),
            attempt.attemptId(),
            Instant.now(clock).toString(),
            writeJson(command.event()),
            key("attempt:")
        };

        String rawResult = redis(
            "创建 V2 queue",
            () -> redisTemplate.execute(CREATE_QUEUE_SCRIPT, keys, arguments)
        );
        if (rawResult == null || rawResult.isBlank()) {
            throw stateStoreReset("V2 create-queue 未返回结果");
        }
        return parseEnqueueResult(rawResult);
    }

    @Override
    public ClaimResult claim(ClaimCommand command) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(command.event(), "event");
        List<String> domains = validateClaimCommand(command);
        long leaseTtlMillis = durationMillis(command.leaseTtl(), "claim lease TTL");
        List<String> keys = new ArrayList<>(List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("events"),
            key("meta:fence-sequence"),
            key("attempt:" + command.attemptId()),
            key("lane:" + command.lane() + ":ready"),
            key("dedupe:" + command.dedupeKey())
        ));
        domains.forEach(domain -> keys.add(key("domain:" + domain + ":lease")));
        domains.forEach(domain -> keys.add(key("domain:" + domain + ":quarantine")));
        Object[] arguments = {
            command.expectedEpoch(),
            command.queueId(),
            command.attemptId(),
            Long.toString(command.expectedStateVersion()),
            command.enteredAt().toString(),
            command.deadlineAt().toString(),
            Long.toString(leaseTtlMillis),
            writeJson(command.event()),
            Integer.toString(domains.size()),
            command.lane(),
            command.dedupeKey(),
            writeJson(domains),
            Long.toString(command.enteredAt().toEpochMilli())
        };
        String rawResult = redis(
            "claim V2 attempt",
            () -> redisTemplate.execute(CLAIM_ATTEMPT_SCRIPT, keys, arguments)
        );
        return parseClaimResult(requireScriptResult("claim-attempt", rawResult));
    }

    @Override
    public MutationResult mutate(MutationCommand command) {
        Objects.requireNonNull(command, "command");
        List<String> domains = validateMutationCommand(command);
        long retainedTtlMillis = command.retainedOwnershipTtl() == null
            ? 0L
            : durationMillis(command.retainedOwnershipTtl(), "retained ownership TTL");
        List<String> keys = new ArrayList<>(List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("attempt:" + command.attemptId()),
            key("events"),
            key("index:attempts:live"),
            key("index:attempts:terminal"),
            key("lane:" + command.lane() + ":ready"),
            key("dedupe:" + command.dedupeKey())
        ));
        domains.forEach(domain -> keys.add(key("domain:" + domain + ":lease")));
        Object[] arguments = {
            command.expectedEpoch(),
            command.queueId(),
            command.attemptId(),
            command.lane(),
            command.dedupeKey(),
            nullable(command.expectedFenceToken()),
            Long.toString(command.expectedStateVersion()),
            command.targetStatus().value(),
            command.reasonCode() == null ? "" : command.reasonCode().name(),
            command.enteredAt().toString(),
            nullable(command.deadlineAt()),
            nullable(command.lastHeartbeatAt()),
            nullable(command.progressSequence()),
            nullable(command.phase()),
            nullable(command.current()),
            nullable(command.total()),
            nullable(command.workerMessage()),
            nullable(command.pid()),
            nullable(command.processStartedAt()),
            command.releaseOwnership() ? "1" : "0",
            Long.toString(retainedTtlMillis),
            command.eventType(),
            Instant.now(clock).toString(),
            Integer.toString(domains.size()),
            writeJson(domains),
            Long.toString(command.enteredAt().toEpochMilli())
        };
        String rawResult = redis(
            "mutate V2 attempt",
            () -> redisTemplate.execute(MUTATE_ATTEMPT_SCRIPT, keys, arguments)
        );
        return parseMutationResult("mutate-attempt", requireScriptResult("mutate-attempt", rawResult));
    }

    @Override
    public boolean renewLeases(RenewLeaseCommand command) {
        Objects.requireNonNull(command, "command");
        List<String> domains = validateRenewCommand(command);
        long ttlMillis = durationMillis(command.leaseTtl(), "lease renewal TTL");
        List<String> keys = new ArrayList<>(List.of(key("meta:engine"), key("meta:epoch")));
        domains.forEach(domain -> keys.add(key("domain:" + domain + ":lease")));
        Object[] arguments = {
            command.expectedEpoch(),
            command.queueId(),
            command.attemptId(),
            Long.toString(command.fenceToken()),
            Long.toString(ttlMillis),
            Integer.toString(domains.size())
        };
        String rawResult = redis(
            "renew V2 leases",
            () -> redisTemplate.execute(RENEW_LEASES_SCRIPT, keys, arguments)
        );
        JsonNode result = parseScriptResult("renew-leases", requireScriptResult("renew-leases", rawResult));
        String code = text(result, "code");
        if ("RENEWED".equals(code)) {
            return true;
        }
        if ("LEASE_RENEW_FAILED".equals(code)) {
            return false;
        }
        throwForMutationCode("renew-leases", code);
        return false;
    }

    @Override
    public MutationResult createRetry(CreateRetryCommand command) {
        Objects.requireNonNull(command, "command");
        Objects.requireNonNull(command.updatedQueue(), "updatedQueue");
        Objects.requireNonNull(command.attempt(), "attempt");
        Objects.requireNonNull(command.event(), "event");
        long ttlMillis = validateRetryCommand(command);
        CrawlerQueueV2Queue queue = command.updatedQueue();
        CrawlerQueueV2Attempt attempt = command.attempt();
        List<String> keys = List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("queue:" + queue.queueId()),
            key("attempt:" + attempt.retryOfAttemptId()),
            key("attempt:" + attempt.attemptId()),
            key("lane:" + attempt.lane() + ":ready"),
            key("dedupe:" + queue.dedupeKey()),
            key("index:attempts:live"),
            key("index:queues"),
            key("meta:first-live-mutation-at"),
            key("events")
        );
        Object[] arguments = {
            command.expectedEpoch(),
            writeJson(queue),
            writeJson(attempt),
            Long.toString(command.expectedPriorStateVersion()),
            Long.toString(command.readyScore()),
            Long.toString(ttlMillis),
            writeJson(command.event()),
            Instant.now(clock).toString(),
            attempt.retryOfAttemptId()
        };
        String rawResult = redis(
            "create V2 retry",
            () -> redisTemplate.execute(CREATE_RETRY_SCRIPT, keys, arguments)
        );
        return parseMutationResult("create-retry", requireScriptResult("create-retry", rawResult));
    }

    @Override
    public Optional<CrawlerQueueV2Queue> findQueue(String queueId) {
        return readRecord("queue", queueId, CrawlerQueueV2Queue.class);
    }

    @Override
    public Optional<CrawlerQueueV2Attempt> findAttempt(String attemptId) {
        return readRecord("attempt", attemptId, CrawlerQueueV2Attempt.class);
    }

    @Override
    public List<CrawlerQueueV2Attempt> findLiveAttempts() {
        Set<String> attemptIds = redis(
            "读取 V2 live attempt index",
            () -> redisTemplate.opsForSet().members(key("index:attempts:live"))
        );
        return readAttempts(attemptIds == null ? List.of() : attemptIds.stream().sorted().toList());
    }

    @Override
    public List<CrawlerQueueV2Attempt> findReadyAttempts(int limit) {
        if (limit < 1) {
            throw new IllegalArgumentException("ready attempt 查询 limit 必须为正数");
        }
        double nowScore = (double) clock.instant().toEpochMilli();
        Set<ZSetOperations.TypedTuple<String>> standard = redis(
            "读取 V2 standard ready attempts",
            () -> redisTemplate.opsForZSet().rangeByScoreWithScores(
                key("lane:standard:ready"),
                Double.NEGATIVE_INFINITY,
                nowScore,
                0L,
                limit
            )
        );
        Set<ZSetOperations.TypedTuple<String>> exclusive = redis(
            "读取 V2 exclusive ready attempts",
            () -> redisTemplate.opsForZSet().rangeByScoreWithScores(
                key("lane:exclusive:ready"),
                Double.NEGATIVE_INFINITY,
                nowScore,
                0L,
                limit
            )
        );
        List<ReadyCandidate> candidates = new ArrayList<>();
        addReadyAttemptIds(candidates, standard, "standard");
        addReadyAttemptIds(candidates, exclusive, "exclusive");
        List<String> ordered = candidates.stream()
            .sorted((left, right) -> {
                int score = Double.compare(left.score(), right.score());
                return score != 0 ? score : left.attemptId().compareTo(right.attemptId());
            })
            .map(ReadyCandidate::attemptId)
            .distinct()
            .limit(limit)
            .toList();
        List<CrawlerQueueV2Attempt> attempts = readAttempts(ordered);
        for (CrawlerQueueV2Attempt attempt : attempts) {
            if ((attempt.status() != CrawlerQueueV2Status.QUEUED
                && attempt.status() != CrawlerQueueV2Status.RETRY_WAIT)
                || ("standard".equals(attempt.lane()) == false && "exclusive".equals(attempt.lane()) == false)) {
                throw stateStoreReset("V2 ready index 指向不可 claim attempt：" + attempt.attemptId());
            }
        }
        return attempts;
    }

    @Override
    public List<CrawlerQueueV2Attempt> findTerminalAttempts(int limit, Instant sinceInclusive) {
        if (limit < 1 || sinceInclusive == null) {
            throw new IllegalArgumentException("terminal attempt 查询参数无效");
        }
        Set<String> attemptIds = redis(
            "读取 V2 terminal attempt index",
            () -> redisTemplate.opsForZSet().reverseRangeByScore(
                key("index:attempts:terminal"),
                sinceInclusive.toEpochMilli(),
                Double.POSITIVE_INFINITY,
                0,
                limit
            )
        );
        return readAttempts(attemptIds == null ? List.of() : List.copyOf(attemptIds));
    }

    @Override
    public List<EventEnvelope> readEvents(String after, int count, Duration blockFor) {
        if (after == null || after.isBlank() || count < 1 || blockFor == null || blockFor.isNegative()) {
            throw new IllegalArgumentException("V2 event read 参数无效");
        }
        StreamReadOptions readOptions = StreamReadOptions.empty().count(count);
        if (!blockFor.isZero()) {
            readOptions = readOptions.block(blockFor);
        }
        StreamReadOptions finalReadOptions = readOptions;
        List<MapRecord<String, Object, Object>> records = redis(
            "读取 V2 events",
            () -> redisTemplate.opsForStream().read(
                finalReadOptions,
                StreamOffset.create(key("events"), ReadOffset.from(after))
            )
        );
        if (records == null || records.isEmpty()) {
            return List.of();
        }
        List<EventEnvelope> result = new ArrayList<>(records.size());
        for (MapRecord<String, Object, Object> record : records) {
            Object payload = record.getValue().get("payload");
            if (!(payload instanceof String rawPayload) || rawPayload.isBlank()) {
                throw stateStoreReset("V2 event 缺少 payload");
            }
            try {
                result.add(new EventEnvelope(
                    record.getId().getValue(),
                    objectMapper.readValue(rawPayload, CrawlerQueueV2Event.class)
                ));
            } catch (JsonProcessingException exception) {
                throw stateStoreReset("V2 event payload 无法解析", exception);
            }
        }
        return List.copyOf(result);
    }

    @Override
    public void appendEvent(CrawlerQueueV2Event event) {
        Objects.requireNonNull(event, "event");
        boolean staleProgressEvidence = "attempt.progress-rejected".equals(event.type())
            && event.reasonCode() == CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN;
        boolean watcherFailureEvidence = "attempt.watcher-failed".equals(event.type())
            && event.reasonCode() == CrawlerQueueV2ReasonCode.RECONCILER_STALE;
        if (isBlank(event.type())
            || isBlank(event.stateStoreEpoch())
            || isBlank(event.queueId())
            || isBlank(event.attemptId())
            || event.generatedAt() == null
            || (!staleProgressEvidence && !watcherFailureEvidence)) {
            throw invalidMutation("V2 append-event 身份或原因无效");
        }
        List<String> keys = List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("attempt:" + event.attemptId()),
            key("events")
        );
        Object[] arguments = {
            event.stateStoreEpoch(),
            event.queueId(),
            event.attemptId(),
            event.type(),
            event.reasonCode().name(),
            event.generatedAt().toString()
        };
        String rawResult = redis(
            "append V2 event",
            () -> redisTemplate.execute(APPEND_EVENT_SCRIPT, keys, arguments)
        );
        JsonNode result = parseScriptResult("append-event", requireScriptResult("append-event", rawResult));
        if (!"APPENDED".equals(text(result, "code"))) {
            throwForMutationCode("append-event", text(result, "code"));
        }
    }

    @Override
    public void writeReconcilerHealth(ReconcilerHealth health, CrawlerQueueV2Event event) {
        Objects.requireNonNull(health, "health");
        Objects.requireNonNull(event, "event");
        if (health.lastReconciledAt() == null
            || health.scannedCount() < 0L
            || health.convergedCount() < 0L
            || health.failureCount() < 0L
            || health.overdueAttemptCount() < 0L
            || health.oldestOverdueDurationMs() < 0L
            || isBlank(event.stateStoreEpoch())
            || event.generatedAt() == null
            || event.queueId() != null
            || event.attemptId() != null
            || event.fenceToken() != null
            || event.stateVersion() != null
            || event.status() != null
            || !"queue.health-changed".equals(event.type())) {
            throw invalidMutation("V2 reconciler health payload 无效");
        }
        List<String> keys = List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("health:reconciler"),
            key("events")
        );
        Object[] arguments = {
            event.stateStoreEpoch(),
            writeJson(health),
            writeJson(event)
        };
        String rawResult = redis(
            "write V2 reconciler health",
            () -> redisTemplate.execute(WRITE_HEALTH_SCRIPT, keys, arguments)
        );
        JsonNode result = parseScriptResult("write-health", requireScriptResult("write-health", rawResult));
        if (!"WRITTEN".equals(text(result, "code"))) {
            throwForMutationCode("write-health", text(result, "code"));
        }
    }

    @Override
    public Optional<ReconcilerHealth> readReconcilerHealth() {
        String raw = redis(
            "读取 V2 reconciler health",
            () -> redisTemplate.opsForValue().get(key("health:reconciler"))
        );
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            ReconcilerHealth health = objectMapper.readValue(raw, ReconcilerHealth.class);
            if (health.lastReconciledAt() == null
                || health.scannedCount() < 0L
                || health.convergedCount() < 0L
                || health.failureCount() < 0L
                || health.overdueAttemptCount() < 0L
                || health.oldestOverdueDurationMs() < 0L) {
                throw stateStoreReset("V2 reconciler health 内容无效");
            }
            return Optional.of(health);
        } catch (CrawlerQueueV2Exception exception) {
            throw exception;
        } catch (JsonProcessingException exception) {
            throw stateStoreReset("V2 reconciler health 无法解析", exception);
        }
    }

    @Override
    public InitializeResetEpochResult initializeResetEpoch(InitializeResetEpochCommand command) {
        Objects.requireNonNull(command, "command");
        validateInitializeResetEpoch(command);
        List<String> keys = List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("meta:active-cutover-id"),
            key("meta:first-live-mutation-at"),
            key("meta:fence-sequence"),
            key("index:attempts:live"),
            key("index:attempts:terminal"),
            key("index:queues"),
            key("lane:standard:ready"),
            key("lane:exclusive:ready"),
            key("events"),
            key("state-store-reset:" + command.resetId())
        );
        Object[] arguments = {
            command.activeCutoverId(),
            command.resetId(),
            command.observedEpoch() == null ? "" : command.observedEpoch(),
            command.newEpoch(),
            command.irreversibleAt() == null ? "" : command.irreversibleAt().toString(),
            command.resetAt().toString(),
            command.operator(),
            writeJson(command.event())
        };
        String rawResult = redis(
            "初始化 V2 reset epoch",
            () -> redisTemplate.execute(INITIALIZE_RESET_EPOCH_SCRIPT, keys, arguments)
        );
        return parseInitializeResetEpoch(command, requireScriptResult("initialize-reset-epoch", rawResult));
    }

    @Override
    public void writeQuarantine(QuarantineCommand command) {
        Objects.requireNonNull(command, "command");
        validateQuarantineCommand(command);
        Instant now = clock.instant();
        long ttlMillis = durationMillis(Duration.between(now, command.expiresAt()), "quarantine TTL");
        long expiresAtMillis;
        try {
            expiresAtMillis = command.expiresAt().toEpochMilli();
        } catch (ArithmeticException exception) {
            throw invalidMutation("V2 quarantine 到期时间超出毫秒范围");
        }
        DomainQuarantine quarantine = new DomainQuarantine(
            command.expectedEpoch(),
            command.domain(),
            command.queueId(),
            command.attemptId(),
            command.fenceToken(),
            command.expiresAt(),
            command.reasonCode()
        );
        List<String> keys = List.of(
            key("meta:engine"),
            key("meta:epoch"),
            key("domain:" + command.domain() + ":quarantine"),
            key("index:quarantines")
        );
        Object[] arguments = {
            command.expectedEpoch(),
            command.domain(),
            writeJson(quarantine),
            Long.toString(expiresAtMillis),
            Long.toString(ttlMillis)
        };
        String rawResult = redis(
            "写入 V2 domain quarantine",
            () -> redisTemplate.execute(WRITE_QUARANTINE_SCRIPT, keys, arguments)
        );
        JsonNode result = parseScriptResult("write-quarantine", requireScriptResult("write-quarantine", rawResult));
        if (!"WRITTEN".equals(text(result, "code"))) {
            throwForMutationCode("write-quarantine", text(result, "code"));
        }
    }

    @Override
    public List<DomainQuarantine> findQuarantines() {
        EngineState engine = readEngineState();
        if (engine.mode() != CrawlerQueueEngineMode.V2
            || engine.stateStoreEpoch() == null
            || engine.stateStoreEpoch().isBlank()) {
            return List.of();
        }
        Instant now = clock.instant();
        double nowScore = (double) now.toEpochMilli();
        String registryKey = key("index:quarantines");
        List<String> orderedDomains = orderedQuarantineDomains(redis(
            "读取当前 V2 quarantine registry members",
            () -> redisTemplate.opsForZSet().rangeByScore(
                registryKey,
                Math.nextUp(nowScore),
                Double.POSITIVE_INFINITY,
                0L,
                QUARANTINE_REGISTRY_READ_LIMIT
            )
        ));
        if (orderedDomains.isEmpty()) {
            return List.of();
        }
        List<String> rawValues = redis(
            "读取 V2 domain quarantines",
            () -> redisTemplate.opsForValue().multiGet(
                orderedDomains.stream().map(domain -> key("domain:" + domain + ":quarantine")).toList()
            )
        );
        if (rawValues == null || rawValues.size() != orderedDomains.size()) {
            throw stateStoreReset("V2 quarantine 读取结果不完整");
        }
        List<DomainQuarantine> quarantines = new ArrayList<>();
        for (int index = 0; index < rawValues.size(); index++) {
            String raw = rawValues.get(index);
            if (raw == null || raw.isBlank()) {
                continue;
            }
            try {
                DomainQuarantine quarantine = objectMapper.readValue(raw, DomainQuarantine.class);
                if (!Objects.equals(orderedDomains.get(index), quarantine.domain())) {
                    throw stateStoreReset("V2 domain quarantine 身份不一致：" + orderedDomains.get(index));
                }
                if (Objects.equals(engine.stateStoreEpoch(), quarantine.stateStoreEpoch())
                    && quarantine.expiresAt() != null
                    && quarantine.expiresAt().isAfter(now)) {
                    quarantines.add(quarantine);
                }
            } catch (CrawlerQueueV2Exception exception) {
                throw exception;
            } catch (JsonProcessingException exception) {
                throw stateStoreReset("V2 domain quarantine 无法解析：" + orderedDomains.get(index), exception);
            }
        }
        return quarantines.stream().sorted((left, right) -> left.domain().compareTo(right.domain())).toList();
    }

    private List<String> orderedQuarantineDomains(Set<String> domains) {
        if (domains == null || domains.isEmpty()) {
            return List.of();
        }
        if (domains.stream().anyMatch(this::isBlank)) {
            throw stateStoreReset("V2 quarantine registry 包含无效 domain");
        }
        return domains.stream().sorted().toList();
    }

    private void addReadyAttemptIds(
        List<ReadyCandidate> candidates,
        Set<ZSetOperations.TypedTuple<String>> tuples,
        String lane
    ) {
        if (tuples == null) {
            return;
        }
        for (ZSetOperations.TypedTuple<String> tuple : tuples) {
            if (tuple == null
                || isBlank(tuple.getValue())
                || tuple.getScore() == null
                || !Double.isFinite(tuple.getScore())) {
                throw stateStoreReset("V2 " + lane + " ready index 包含无效成员");
            }
            candidates.add(new ReadyCandidate(tuple.getValue(), tuple.getScore()));
        }
    }

    private void validateInitializeResetEpoch(InitializeResetEpochCommand command) {
        CrawlerQueueV2Event event = Objects.requireNonNull(command.event(), "event");
        if (isBlank(command.resetId())
            || isBlank(command.activeCutoverId())
            || isBlank(command.newEpoch())
            || command.resetAt() == null
            || isBlank(command.operator())
            || isBlank(event.type())
            || !"state-store.reset".equals(event.type())
            || !Objects.equals(command.newEpoch(), event.stateStoreEpoch())
            || event.queueId() != null
            || event.attemptId() != null
            || event.fenceToken() != null
            || event.stateVersion() != null
            || event.status() != null
            || event.reasonCode() != CrawlerQueueV2ReasonCode.STATE_STORE_RESET
            || event.generatedAt() == null) {
            throw invalidMutation("V2 initialize reset epoch 参数无效");
        }
        if (command.observedEpoch() != null && command.observedEpoch().isBlank()) {
            throw invalidMutation("V2 observed epoch 不能是空白文本");
        }
    }

    private InitializeResetEpochResult parseInitializeResetEpoch(
        InitializeResetEpochCommand command,
        String rawResult
    ) {
        JsonNode result = parseScriptResult("initialize-reset-epoch", rawResult);
        String code = text(result, "code");
        if (!"RESET".equals(code) && !"ALREADY_RESET".equals(code)) {
            if ("OBSERVED_EPOCH_MISMATCH".equals(code)
                || "CUTOVER_ID_MISMATCH".equals(code)
                || "CUTOVER_MISMATCH".equals(code)
                || "FIRST_MUTATION_MISMATCH".equals(code)
                || "ENGINE_IS_V1".equals(code)
                || "ENGINE_NOT_V2".equals(code)) {
                throw conflict(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, "initialize-reset-epoch", code);
            }
            throw stateStoreReset("V2 initialize-reset-epoch 返回未知结果：" + code);
        }
        try {
            String firstLiveMutationAt = text(result, "firstLiveMutationAt");
            String resetId = requiredText(result, "resetId");
            String stateStoreEpoch = requiredText(result, "stateStoreEpoch");
            Instant parsedFirstLiveMutationAt = firstLiveMutationAt == null || firstLiveMutationAt.isBlank()
                ? null
                : Instant.parse(firstLiveMutationAt);
            if (!Objects.equals(command.resetId(), resetId)) {
                throw stateStoreReset("V2 initialize-reset-epoch 返回的 resetId 与命令不一致");
            }
            if (!Objects.equals(command.newEpoch(), stateStoreEpoch)) {
                throw stateStoreReset("V2 initialize-reset-epoch 返回的 stateStoreEpoch 与命令不一致");
            }
            if (!Objects.equals(command.irreversibleAt(), parsedFirstLiveMutationAt)) {
                throw stateStoreReset("V2 initialize-reset-epoch 返回的 firstLiveMutationAt 与命令不一致");
            }
            return new InitializeResetEpochResult(
                resetId,
                stateStoreEpoch,
                requiredText(result, "streamCursor"),
                parsedFirstLiveMutationAt,
                "ALREADY_RESET".equals(code)
            );
        } catch (CrawlerQueueV2Exception exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw stateStoreReset("V2 initialize-reset-epoch 返回缺少 reset 证据", exception);
        }
    }

    private void validateQuarantineCommand(QuarantineCommand command) {
        if (isBlank(command.expectedEpoch())
            || isBlank(command.domain())
            || isBlank(command.queueId())
            || isBlank(command.attemptId())
            || command.fenceToken() == null
            || command.fenceToken() < 1L
            || command.expiresAt() == null
            || command.reasonCode() == null) {
            throw invalidMutation("V2 quarantine 参数无效");
        }
    }

    private List<String> validateClaimCommand(ClaimCommand command) {
        List<String> domains = sortedDomains(command.coveredDomains());
        CrawlerQueueV2Event event = command.event();
        if (isBlank(command.expectedEpoch())
            || isBlank(command.queueId())
            || isBlank(command.attemptId())
            || isBlank(command.lane())
            || isBlank(command.dedupeKey())
            || command.expectedStateVersion() < 1L
            || command.enteredAt() == null
            || command.deadlineAt() == null
            || !command.deadlineAt().isAfter(command.enteredAt())
            || event.generatedAt() == null
            || !Objects.equals(command.expectedEpoch(), event.stateStoreEpoch())
            || !Objects.equals(command.queueId(), event.queueId())
            || !Objects.equals(command.attemptId(), event.attemptId())
            || event.fenceToken() != null
            || !Objects.equals(event.stateVersion(), command.expectedStateVersion() + 1L)
            || event.status() != CrawlerQueueV2Status.STARTING
            || !"attempt.transitioned".equals(event.type())) {
            throw invalidMutation("V2 claim 身份、版本或事件无效");
        }
        return domains;
    }

    private List<String> validateMutationCommand(MutationCommand command) {
        List<String> domains = sortedDomains(command.coveredDomains());
        boolean processStartedMutation = "attempt.process-started".equals(command.eventType());
        boolean hasPid = command.pid() != null;
        boolean hasProcessStartedAt = command.processStartedAt() != null;
        boolean retainedUnconfirmedTermination = command.targetStatus() == CrawlerQueueV2Status.FAILED
            && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
            && !command.releaseOwnership()
            && command.retainedOwnershipTtl() != null;
        if (isBlank(command.expectedEpoch())
            || isBlank(command.queueId())
            || isBlank(command.attemptId())
            || isBlank(command.lane())
            || isBlank(command.dedupeKey())
            || command.expectedStateVersion() < 1L
            || command.targetStatus() == null
            || command.enteredAt() == null
            || isBlank(command.eventType())
            || (command.targetStatus() == CrawlerQueueV2Status.RUNNING
                && command.lastHeartbeatAt() == null)
            || (command.targetStatus().terminal() && command.deadlineAt() != null)
            || (!command.targetStatus().terminal() && command.deadlineAt() == null)
            || (command.targetStatus().terminal()
                && !command.releaseOwnership()
                && !retainedUnconfirmedTermination)
            || (!command.targetStatus().terminal() && command.releaseOwnership())
            || (command.expectedFenceToken() != null && command.expectedFenceToken() < 1L)
            || (command.progressSequence() != null && command.progressSequence() < 0L)
            || (command.current() != null && command.current() < 0L)
            || (command.total() != null && command.total() < 0L)
            || (command.current() != null && command.total() != null
                && command.current() > command.total())
            || (command.pid() != null && command.pid() < 1L)
            || (processStartedMutation
                && (command.targetStatus() != CrawlerQueueV2Status.STARTING
                    || !hasPid
                    || !hasProcessStartedAt))
            || (!processStartedMutation && (hasPid || hasProcessStartedAt))
            || (command.releaseOwnership() && command.retainedOwnershipTtl() != null)
            || (!retainedUnconfirmedTermination
                && !command.releaseOwnership()
                && command.retainedOwnershipTtl() != null)) {
            throw invalidMutation("V2 attempt mutation 身份或状态无效");
        }
        if (retainedUnconfirmedTermination) {
            durationMillis(command.retainedOwnershipTtl(), "retained ownership TTL");
        }
        return domains;
    }

    private List<String> validateRenewCommand(RenewLeaseCommand command) {
        List<String> domains = sortedDomains(command.coveredDomains());
        if (isBlank(command.expectedEpoch())
            || isBlank(command.queueId())
            || isBlank(command.attemptId())
            || command.fenceToken() < 1L) {
            throw invalidMutation("V2 lease renewal 身份无效");
        }
        return domains;
    }

    private long validateRetryCommand(CreateRetryCommand command) {
        CrawlerQueueV2Queue queue = command.updatedQueue();
        CrawlerQueueV2Attempt attempt = command.attempt();
        CrawlerQueueV2Event event = command.event();
        long ttlMillis = durationMillis(command.dedupeTtl(), "retry dedupe TTL");
        if (ttlMillis > MAX_DEDUPE_TTL_MILLIS
            || isBlank(command.expectedEpoch())
            || command.expectedPriorStateVersion() < 1L
            || queue.contractVersion() != 2
            || attempt.contractVersion() != 2
            || !Objects.equals(command.expectedEpoch(), queue.stateStoreEpoch())
            || !Objects.equals(command.expectedEpoch(), attempt.stateStoreEpoch())
            || !Objects.equals(command.expectedEpoch(), event.stateStoreEpoch())
            || isBlank(queue.queueId())
            || isBlank(attempt.attemptId())
            || isBlank(attempt.retryOfAttemptId())
            || !Objects.equals(queue.queueId(), attempt.queueId())
            || !Objects.equals(queue.queueId(), event.queueId())
            || !Objects.equals(queue.currentAttemptId(), attempt.attemptId())
            || !Objects.equals(attempt.attemptId(), event.attemptId())
            || !queue.attemptIds().contains(attempt.retryOfAttemptId())
            || !queue.attemptIds().get(queue.attemptIds().size() - 1).equals(attempt.attemptId())
            || attempt.stateVersion() != 1L
            || !Objects.equals(event.stateVersion(), 1L)
            || (attempt.status() != CrawlerQueueV2Status.QUEUED
                && attempt.status() != CrawlerQueueV2Status.RETRY_WAIT)
            || event.status() != attempt.status()
            || !"attempt.created".equals(event.type())
            || event.generatedAt() == null
            || attempt.fenceToken() != null
            || event.fenceToken() != null
            || attempt.deadlineAt() == null
            || isBlank(queue.lane())
            || isBlank(queue.dedupeKey())
            || !Objects.equals(queue.lane(), attempt.lane())
            || !Objects.equals(queue.coveredDomains(), attempt.coveredDomains())) {
            throw invalidMutation("V2 retry payload 身份或状态无效");
        }
        sortedDomains(queue.coveredDomains());
        return ttlMillis;
    }

    private List<String> sortedDomains(List<String> coveredDomains) {
        if (coveredDomains == null || coveredDomains.isEmpty() || coveredDomains.stream().anyMatch(this::isBlank)) {
            throw invalidMutation("V2 coveredDomains 不能为空");
        }
        Set<String> unique = new HashSet<>(coveredDomains);
        if (unique.size() != coveredDomains.size()) {
            throw invalidMutation("V2 coveredDomains 不能重复");
        }
        return unique.stream().sorted().toList();
    }

    private long durationMillis(Duration duration, String field) {
        if (duration == null) {
            throw invalidMutation("V2 " + field + " 缺失");
        }
        long millis;
        try {
            millis = duration.toMillis();
        } catch (ArithmeticException exception) {
            throw invalidMutation("V2 " + field + " 超出毫秒范围");
        }
        if (millis < 1L || millis > MAX_DEDUPE_TTL_MILLIS) {
            throw invalidMutation("V2 " + field + " 无效");
        }
        return millis;
    }

    private ClaimResult parseClaimResult(String rawResult) {
        JsonNode result = parseScriptResult("claim-attempt", rawResult);
        String code = text(result, "code");
        if ("CLAIMED".equals(code)) {
            return new ClaimResult(
                ClaimCode.CLAIMED,
                requiredText(result, "attemptId"),
                requiredPositiveLong(result, "fenceToken"),
                requiredPositiveLong(result, "stateVersion"),
                null,
                null
            );
        }
        if ("OWNERSHIP_CONFLICT".equals(code) || "QUARANTINED".equals(code)) {
            return new ClaimResult(
                "QUARANTINED".equals(code) ? ClaimCode.QUARANTINED : ClaimCode.OWNERSHIP_CONFLICT,
                null,
                null,
                0L,
                requiredText(result, "ownerAttemptId"),
                "QUARANTINED".equals(code)
                    ? CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED
                    : CrawlerQueueV2ReasonCode.OWNERSHIP_CONFLICT
            );
        }
        if ("NOT_YET_ELIGIBLE".equals(code)) {
            return new ClaimResult(ClaimCode.NOT_YET_ELIGIBLE, null, null, 0L, null, null);
        }
        throwForMutationCode("claim-attempt", code);
        throw stateStoreReset("V2 claim-attempt 未返回结果");
    }

    private MutationResult parseMutationResult(String operation, String rawResult) {
        JsonNode result = parseScriptResult(operation, rawResult);
        String code = text(result, "code");
        if ("MUTATED".equals(code) || "RETRY_CREATED".equals(code)) {
            JsonNode attemptNode = result.path("attempt");
            if (!attemptNode.isObject()) {
                throw stateStoreReset("V2 " + operation + " 返回缺少 attempt");
            }
            try {
                return new MutationResult(
                    objectMapper.treeToValue(attemptNode, CrawlerQueueV2Attempt.class),
                    requiredText(result, "streamId")
                );
            } catch (JsonProcessingException exception) {
                throw stateStoreReset("V2 " + operation + " attempt 无法解析", exception);
            }
        }
        throwForMutationCode(operation, code);
        throw stateStoreReset("V2 " + operation + " 未返回结果");
    }

    private JsonNode parseScriptResult(String operation, String rawResult) {
        try {
            JsonNode result = objectMapper.readTree(rawResult);
            if (!result.isObject()) {
                throw stateStoreReset("V2 " + operation + " 返回不是对象");
            }
            return result;
        } catch (JsonProcessingException exception) {
            throw stateStoreReset("V2 " + operation + " 返回无法解析", exception);
        }
    }

    private String requireScriptResult(String operation, String rawResult) {
        if (rawResult == null || rawResult.isBlank()) {
            throw stateStoreReset("V2 " + operation + " 未返回结果");
        }
        return rawResult;
    }

    private void throwForMutationCode(String operation, String code) {
        if ("STATE_STORE_INCONSISTENT".equals(code)) {
            throw stateStoreReset("V2 " + operation + " 状态存储内容不一致");
        }
        if ("STALE_STATE_VERSION".equals(code)) {
            throw conflict(CrawlerQueueV2ReasonCode.STALE_STATE_VERSION, operation, code);
        }
        if ("STALE_FENCE_TOKEN".equals(code)
            || "STALE_PROGRESS_SEQUENCE".equals(code)
            || "STALE_ATTEMPT".equals(code)
            || "LEASE_RENEW_FAILED".equals(code)) {
            throw conflict(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, operation, code);
        }
        if ("OWNERSHIP_CONFLICT".equals(code)) {
            throw conflict(CrawlerQueueV2ReasonCode.OWNERSHIP_CONFLICT, operation, code);
        }
        if ("ENGINE_NOT_V2".equals(code)
            || "STALE_EPOCH".equals(code)
            || "INVALID_STATUS".equals(code)
            || "INVALID_COMMAND".equals(code)
            || "IDENTITY_EXISTS".equals(code)) {
            throw conflict(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, operation, code);
        }
        throw stateStoreReset("V2 " + operation + " 返回未知结果：" + code);
    }

    private CrawlerQueueV2Exception conflict(
        CrawlerQueueV2ReasonCode reasonCode,
        String operation,
        String code
    ) {
        return new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            reasonCode,
            "V2 " + operation + " 被拒绝：" + code,
            null
        );
    }

    private List<CrawlerQueueV2Attempt> readAttempts(List<String> attemptIds) {
        if (attemptIds.isEmpty()) {
            return List.of();
        }
        List<String> keys = attemptIds.stream().map(id -> key("attempt:" + id)).toList();
        List<String> rawAttempts = redis(
            "批量读取 V2 attempts",
            () -> redisTemplate.opsForValue().multiGet(keys)
        );
        if (rawAttempts == null || rawAttempts.size() != keys.size()) {
            throw stateStoreReset("V2 attempt index 与记录不一致");
        }
        List<CrawlerQueueV2Attempt> attempts = new ArrayList<>(rawAttempts.size());
        for (int index = 0; index < rawAttempts.size(); index++) {
            String raw = rawAttempts.get(index);
            if (raw == null || raw.isBlank()) {
                throw stateStoreReset("V2 attempt index 指向缺失记录：" + attemptIds.get(index));
            }
            try {
                CrawlerQueueV2Attempt attempt = objectMapper.readValue(raw, CrawlerQueueV2Attempt.class);
                if (!Objects.equals(attemptIds.get(index), attempt.attemptId())) {
                    throw stateStoreReset("V2 attempt index 身份不一致：" + attemptIds.get(index));
                }
                attempts.add(attempt);
            } catch (JsonProcessingException exception) {
                throw stateStoreReset("V2 attempt 无法解析：" + attemptIds.get(index), exception);
            }
        }
        return List.copyOf(attempts);
    }

    private String nullable(Object value) {
        return value == null ? "" : value.toString();
    }

    private EnqueueResult parseEnqueueResult(String rawResult) {
        JsonNode result;
        try {
            result = objectMapper.readTree(rawResult);
        } catch (JsonProcessingException exception) {
            throw stateStoreReset("V2 create-queue 返回无法解析", exception);
        }
        String code = text(result, "code");
        if ("CREATED".equals(code)) {
            return enqueueResult(EnqueueCode.CREATED, result, null);
        }
        if ("DEDUPED".equals(code)) {
            return enqueueResult(EnqueueCode.DEDUPED, result, CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT);
        }
        if ("STATE_STORE_INCONSISTENT".equals(code)) {
            throw stateStoreReset("V2 状态存储内容不一致");
        }
        if ("ENGINE_NOT_V2".equals(code)
            || "STALE_EPOCH".equals(code)
            || "IDENTITY_EXISTS".equals(code)
            || "INVALID_COMMAND".equals(code)) {
            throw new CrawlerQueueV2Exception(
                HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
                "V2 create-queue 被拒绝：" + code,
                null
            );
        }
        throw stateStoreReset("V2 create-queue 返回未知结果：" + code);
    }

    private EnqueueResult enqueueResult(
        EnqueueCode code,
        JsonNode result,
        CrawlerQueueV2ReasonCode reasonCode
    ) {
        try {
            return new EnqueueResult(
                code,
                requiredText(result, "queueId"),
                requiredText(result, "attemptId"),
                requiredPositiveLong(result, "stateVersion"),
                reasonCode,
                Instant.parse(requiredText(result, "firstLiveMutationAt"))
            );
        } catch (CrawlerQueueV2Exception exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw stateStoreReset("V2 create-queue 返回缺少权威身份", exception);
        }
    }

    private long validateCreateCommand(CreateQueueCommand command) {
        CrawlerQueueV2Queue queue = command.queue();
        CrawlerQueueV2Attempt attempt = command.attempt();
        CrawlerQueueV2Event event = command.event();
        String expectedEpoch = command.expectedEpoch();
        long dedupeTtlMillis;
        try {
            dedupeTtlMillis = command.dedupeTtl().toMillis();
        } catch (ArithmeticException exception) {
            throw invalidMutation("V2 enqueue dedupe TTL 超出毫秒范围");
        }
        if (isBlank(expectedEpoch) || dedupeTtlMillis < 1L || dedupeTtlMillis > MAX_DEDUPE_TTL_MILLIS) {
            throw invalidMutation("V2 enqueue epoch 或 dedupe TTL 无效");
        }
        if (queue.contractVersion() != 2 || attempt.contractVersion() != 2) {
            throw invalidMutation("V2 enqueue contractVersion 必须为 2");
        }
        if (!Objects.equals(expectedEpoch, queue.stateStoreEpoch())
            || !Objects.equals(expectedEpoch, attempt.stateStoreEpoch())
            || !Objects.equals(expectedEpoch, event.stateStoreEpoch())) {
            throw invalidMutation("V2 enqueue stateStoreEpoch 不一致");
        }
        if (isBlank(queue.queueId())
            || isBlank(attempt.attemptId())
            || !Objects.equals(queue.queueId(), attempt.queueId())
            || !Objects.equals(queue.queueId(), event.queueId())
            || !Objects.equals(queue.currentAttemptId(), attempt.attemptId())
            || !Objects.equals(attempt.attemptId(), event.attemptId())
            || !queue.attemptIds().equals(List.of(attempt.attemptId()))) {
            throw invalidMutation("V2 enqueue queue/attempt 身份不一致");
        }
        if (attempt.stateVersion() != 1L
            || !Objects.equals(event.stateVersion(), 1L)
            || attempt.status() != CrawlerQueueV2Status.QUEUED
            || event.status() != CrawlerQueueV2Status.QUEUED
            || !"queue.created".equals(event.type())) {
            throw invalidMutation("V2 enqueue 初始状态或事件版本无效");
        }
        if (attempt.fenceToken() != null
            || event.fenceToken() != null
            || isBlank(queue.lane())
            || isBlank(queue.domain())
            || isBlank(queue.actionId())
            || isBlank(queue.dedupeKey())
            || queue.coveredDomains().isEmpty()
            || queue.coveredDomains().stream().anyMatch(this::isBlank)
            || attempt.deadlineAt() == null
            || !Objects.equals(queue.lane(), attempt.lane())
            || !Objects.equals(queue.domain(), attempt.domain())
            || !Objects.equals(queue.actionId(), attempt.actionId())
            || !Objects.equals(queue.coveredDomains(), attempt.coveredDomains())) {
            throw invalidMutation("V2 enqueue payload 不是同一个未 claim 的任务");
        }
        return dedupeTtlMillis;
    }

    private <T> Optional<T> readRecord(String type, String id, Class<T> valueType) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String raw = redis(
            "读取 V2 " + type,
            () -> redisTemplate.opsForValue().get(key(type + ":" + id))
        );
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(raw, valueType));
        } catch (JsonProcessingException exception) {
            throw stateStoreReset("V2 " + type + " 记录无法解析：" + id, exception);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw stateStoreReset("V2 mutation payload 无法序列化", exception);
        }
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode fieldNode = node.path(field);
        if (!fieldNode.isTextual()) {
            throw new IllegalArgumentException("字段不是文本：" + field);
        }
        String value = fieldNode.textValue();
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("缺少字段：" + field);
        }
        return value;
    }

    private long requiredPositiveLong(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 1L) {
            throw stateStoreReset("V2 create-queue 返回无效 " + field);
        }
        return value.longValue();
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText();
    }

    private String key(String suffix) {
        return prefix + suffix;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private <T> T redis(String operation, Supplier<T> call) {
        if (redisTemplate == null) {
            throw new CrawlerQueueV2Exception(
                HttpStatus.SERVICE_UNAVAILABLE,
                CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
                "V2 Redis 不可用：" + operation,
                null
            );
        }
        try {
            return call.get();
        } catch (CrawlerQueueV2Exception exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new CrawlerQueueV2Exception(
                HttpStatus.SERVICE_UNAVAILABLE,
                CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
                "V2 Redis 操作失败：" + operation,
                exception
            );
        }
    }

    private CrawlerQueueV2Exception stateStoreReset(String message) {
        return stateStoreReset(message, null);
    }

    private CrawlerQueueV2Exception stateStoreReset(String message, Throwable cause) {
        return new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
            message,
            cause
        );
    }

    private CrawlerQueueV2Exception invalidMutation(String message) {
        return new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
            message,
            null
        );
    }

    private record ReadyCandidate(String attemptId, double score) {}
}
