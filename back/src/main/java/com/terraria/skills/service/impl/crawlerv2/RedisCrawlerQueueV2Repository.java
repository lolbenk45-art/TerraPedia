package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Supplier;

public class RedisCrawlerQueueV2Repository implements CrawlerQueueV2Repository {

    public static final String PRODUCTION_PREFIX = "terrapedia:crawler:wiki-monitor:v2:";

    private static final long MAX_DEDUPE_TTL_MILLIS = Duration.ofDays(30).toMillis();
    private static final DefaultRedisScript<String> CREATE_QUEUE_SCRIPT = createQueueScript();

    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final Clock clock;
    private final String prefix;

    private static DefaultRedisScript<String> createQueueScript() {
        DefaultRedisScript<String> script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource("redis/crawler-queue-v2/create-queue.lua"));
        script.setResultType(String.class);
        return script;
    }

    RedisCrawlerQueueV2Repository(
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
    public Optional<CrawlerQueueV2Queue> findQueue(String queueId) {
        return readRecord("queue", queueId, CrawlerQueueV2Queue.class);
    }

    @Override
    public Optional<CrawlerQueueV2Attempt> findAttempt(String attemptId) {
        return readRecord("attempt", attemptId, CrawlerQueueV2Attempt.class);
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
}
