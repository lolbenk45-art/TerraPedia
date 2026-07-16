package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

/**
 * The durable authority for selecting the queue engine. Redis can confirm this
 * state, but it can never erase a durable cutover or make the runtime fall
 * back to V1 after a V2 reservation.
 */
public class CrawlerQueueEngineRouter {

    private static final Path CUTOVER_STATE = Path.of("reports", "crawler-monitor", "v2", "cutover-state.json");
    private static final Path CUTOVER_LOCK = Path.of("reports", "crawler-monitor", "v2", "cutover-state.lock");
    private static final ConcurrentHashMap<Path, ReentrantLock> PROCESS_LOCKS = new ConcurrentHashMap<>();
    private static final ThreadLocal<Map<Path, Integer>> HELD_LOCKS = ThreadLocal.withInitial(HashMap::new);

    private final ObjectMapper objectMapper;
    private final CrawlerQueueV2Repository repository;
    private final Path repoRoot;
    private final Path statePath;
    private final Path lockPath;
    private final Clock clock;
    private final boolean v1Only;
    private volatile CrawlerQueueEngineMode lastKnownMode;
    private volatile CrawlerQueueV2ReasonCode lastReasonCode;

    public CrawlerQueueEngineRouter(
        ObjectMapper objectMapper,
        CrawlerQueueV2Repository repository,
        Path repoRoot,
        Clock clock
    ) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper").copy().findAndRegisterModules();
        this.repository = Objects.requireNonNull(repository, "repository");
        this.repoRoot = Objects.requireNonNull(repoRoot, "repoRoot").toAbsolutePath().normalize();
        this.statePath = this.repoRoot.resolve(CUTOVER_STATE).normalize();
        this.lockPath = this.repoRoot.resolve(CUTOVER_LOCK).normalize();
        this.clock = Objects.requireNonNull(clock, "clock");
        this.v1Only = false;
        this.lastKnownMode = CrawlerQueueEngineMode.V1;
    }

    private CrawlerQueueEngineRouter() {
        this.objectMapper = null;
        this.repository = null;
        this.repoRoot = null;
        this.statePath = null;
        this.lockPath = null;
        this.clock = Clock.systemUTC();
        this.v1Only = true;
        this.lastKnownMode = CrawlerQueueEngineMode.V1;
    }

    /**
     * Compatibility constructors use this no-I/O V1 router. It cannot be used
     * by a Spring runtime that has the V2 state-store dependencies available.
     */
    public static CrawlerQueueEngineRouter v1Only() {
        return new CrawlerQueueEngineRouter();
    }

    public CrawlerQueueEngineMode mode() {
        if (v1Only) {
            return remember(CrawlerQueueEngineMode.V1, null);
        }
        return locked(state -> modeFor(state));
    }

    public CrawlerQueueEngineMode lastKnownMode() {
        return lastKnownMode;
    }

    public CrawlerQueueV2ReasonCode lastReasonCode() {
        return lastReasonCode;
    }

    /**
     * Holds the durable cross-process fence from routing admission through the
     * caller's final irreversible effect. Router state transitions invoked by
     * the callback reuse the same file lock rather than attempting a nested
     * OS lock.
     */
    public <T> T withMutationPermit(Function<MutationPermit, T> operation) {
        Objects.requireNonNull(operation, "operation");
        if (v1Only) {
            return operation.apply(new HeldMutationPermit());
        }
        return locked(current -> operation.apply(new HeldMutationPermit()));
    }

    public boolean allowsLegacyMutations() {
        return mode() == CrawlerQueueEngineMode.V1;
    }

    /**
     * V1 rollback is legal only before the first durable reservation or Redis
     * first-mutation evidence exists.
     */
    public boolean rollbackPermitted() {
        if (v1Only) {
            return true;
        }
        return locked(state -> {
            if (state != null && (state.mutationReservationAt() != null || state.firstLiveMutationAt() != null)) {
                return false;
            }
            try {
                CrawlerQueueV2Repository.EngineState redis = repository.readEngineState();
                return redis == null || isBlank(redis.firstLiveMutationAt());
            } catch (RuntimeException exception) {
                return false;
            }
        });
    }

    public CutoverState readDurableState() {
        if (v1Only) {
            return null;
        }
        return locked(current -> current);
    }

    public void writeState(CutoverState state) {
        if (v1Only) {
            throw new IllegalStateException("V1-only router cannot persist a cutover marker");
        }
        Objects.requireNonNull(state, "state");
        locked(current -> {
            CutoverState normalized = normalize(state);
            validateReplacement(current, normalized);
            writeStateAtomically(normalized);
            remember(normalized.mode(), reasonForDurableState(normalized));
            return null;
        });
    }

    public CutoverState reserveFirstLiveMutation(Instant reservedAt) {
        if (reservedAt == null) {
            throw new IllegalArgumentException("首次 V2 mutation reservation 时间不能为空");
        }
        return locked(current -> {
            requireDurableV2(current);
            if (current.firstLiveMutationAt() != null || current.mutationReservationAt() != null) {
                throw new IllegalStateException("首次 V2 mutation 已经预留或确认");
            }
            CutoverState reserved = new CutoverState(
                current.contractVersion(),
                CrawlerQueueEngineMode.V2,
                current.cutoverId(),
                current.stateStoreEpoch(),
                clock.instant(),
                reservedAt,
                null
            );
            writeStateAtomically(reserved);
            remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
            return reserved;
        });
    }

    public CutoverState confirmFirstLiveMutation(Instant committedAt) {
        if (committedAt == null) {
            throw new IllegalArgumentException("Redis 首次 mutation 时间不能为空");
        }
        return locked(current -> {
            requireDurableV2OrMaintenance(current);
            if (current.mutationReservationAt() == null) {
                throw new IllegalStateException("没有 durable reservation，不能确认首次 V2 mutation");
            }
            if (current.firstLiveMutationAt() != null && !current.firstLiveMutationAt().equals(committedAt)) {
                throw new IllegalStateException("首次 V2 mutation 时间与既有 durable marker 冲突");
            }
            verifyMatchingRedisEvidence(current, committedAt);
            CutoverState confirmed = new CutoverState(
                current.contractVersion(),
                CrawlerQueueEngineMode.V2,
                current.cutoverId(),
                current.stateStoreEpoch(),
                clock.instant(),
                current.mutationReservationAt(),
                committedAt
            );
            writeStateAtomically(confirmed);
            remember(CrawlerQueueEngineMode.V2, null);
            return confirmed;
        });
    }

    public CutoverState markMutationUncertain() {
        return locked(current -> {
            requireDurableV2OrMaintenance(current);
            if (current.mutationReservationAt() == null || current.firstLiveMutationAt() != null) {
                throw new IllegalStateException("只有未确认的首次 mutation reservation 可以进入不确定维护状态");
            }
            CutoverState maintenance = new CutoverState(
                current.contractVersion(),
                CrawlerQueueEngineMode.MAINTENANCE,
                current.cutoverId(),
                current.stateStoreEpoch(),
                clock.instant(),
                current.mutationReservationAt(),
                null
            );
            writeStateAtomically(maintenance);
            remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
            return maintenance;
        });
    }

    /**
     * The only recovery path for a reservation re-reads both durable and Redis
     * authority under the file lock. It never clears a reservation.
     */
    public CutoverState reconcileFirstMutationReservation() {
        if (v1Only) {
            return null;
        }
        return locked(current -> {
            if (current == null || current.mutationReservationAt() == null || current.firstLiveMutationAt() != null) {
                return current;
            }
            CrawlerQueueV2Repository.EngineState redis;
            try {
                redis = repository.readEngineState();
            } catch (RuntimeException exception) {
                remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE);
                throw unavailable(exception);
            }
            Instant redisFirst = redisFirstMutation(redis);
            if (sameV2Identity(current, redis) && redisFirst != null) {
                CutoverState confirmed = new CutoverState(
                    current.contractVersion(),
                    CrawlerQueueEngineMode.V2,
                    current.cutoverId(),
                    current.stateStoreEpoch(),
                    clock.instant(),
                    current.mutationReservationAt(),
                    redisFirst
                );
                writeStateAtomically(confirmed);
                remember(CrawlerQueueEngineMode.V2, null);
                return confirmed;
            }
            CrawlerQueueV2ReasonCode reason = sameV2Identity(current, redis)
                ? CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN
                : CrawlerQueueV2ReasonCode.STATE_STORE_RESET;
            CutoverState maintenance = new CutoverState(
                current.contractVersion(),
                CrawlerQueueEngineMode.MAINTENANCE,
                current.cutoverId(),
                current.stateStoreEpoch(),
                clock.instant(),
                current.mutationReservationAt(),
                null
            );
            writeStateAtomically(maintenance);
            remember(CrawlerQueueEngineMode.MAINTENANCE, reason);
            return maintenance;
        });
    }

    public CutoverState completeStateStoreReset(String newEpoch, Instant redisFirstLiveMutationAt) {
        if (isBlank(newEpoch)) {
            throw new IllegalArgumentException("新 V2 epoch 不能为空");
        }
        return locked(current -> {
            requireDurableV2OrMaintenance(current);
            if (current.mutationReservationAt() != null && current.firstLiveMutationAt() == null) {
                throw new IllegalStateException("首次 V2 mutation 结果未确认，禁止 reset 完成");
            }
            if (current.mutationReservationAt() != null || current.firstLiveMutationAt() != null) {
                if (current.firstLiveMutationAt() == null
                    || !current.firstLiveMutationAt().equals(redisFirstLiveMutationAt)) {
                    throw new IllegalStateException("reset Redis 首次 mutation 证据与 durable marker 不匹配");
                }
            } else if (redisFirstLiveMutationAt != null) {
                throw new IllegalStateException("reset 不能凭 Redis 证据制造首次 V2 mutation 确认");
            }
            CutoverState completed = new CutoverState(
                current.contractVersion(),
                CrawlerQueueEngineMode.V2,
                current.cutoverId(),
                newEpoch,
                clock.instant(),
                current.mutationReservationAt(),
                current.firstLiveMutationAt()
            );
            writeStateAtomically(completed);
            remember(CrawlerQueueEngineMode.V2, null);
            return completed;
        });
    }

    /**
     * The sole durable V2-to-V1 transition. The caller has already completed
     * the matching atomic Redis rollback; this method only permits it before
     * a reservation or a first live mutation can make legacy scheduling unsafe.
     */
    public CutoverState completeRollback(String cutoverId) {
        if (isBlank(cutoverId)) {
            throw new IllegalArgumentException("cutoverId 不能为空");
        }
        return locked(current -> {
            if (current == null || current.mode() == CrawlerQueueEngineMode.V1) {
                return new CutoverState(2, CrawlerQueueEngineMode.V1, null, null, clock.instant(), null, null);
            }
            if (!Objects.equals(cutoverId, current.cutoverId())
                || current.mutationReservationAt() != null
                || current.firstLiveMutationAt() != null) {
                throw new CrawlerQueueV2Exception(
                    HttpStatus.CONFLICT,
                    CrawlerQueueV2ReasonCode.CUTOVER_ROLLBACK_FORBIDDEN
                );
            }
            CutoverState rolledBack = new CutoverState(
                2,
                CrawlerQueueEngineMode.V1,
                null,
                null,
                clock.instant(),
                null,
                null
            );
            writeStateAtomically(rolledBack);
            remember(CrawlerQueueEngineMode.V1, null);
            return rolledBack;
        });
    }

    /**
     * Task 12 writes this immutable file once. The adapter deliberately cannot
     * derive a live V1 location from the current V1 queue repository.
     */
    public Optional<Path> activeCutoverManifestPath() {
        CutoverState state = readDurableState();
        if (state == null || isBlank(state.cutoverId())) {
            return Optional.empty();
        }
        Path path = repoRoot.resolve("reports/crawler-monitor/v2/cutovers")
            .resolve(state.cutoverId())
            .resolve("cutover-manifest.json")
            .normalize();
        return path.startsWith(repoRoot) ? Optional.of(path) : Optional.empty();
    }

    private CrawlerQueueEngineMode modeFor(CutoverState durable) {
        CrawlerQueueV2Repository.EngineState redis;
        try {
            redis = repository.readEngineState();
        } catch (RuntimeException exception) {
            if (durable != null && durable.mode() != CrawlerQueueEngineMode.V1) {
                remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE);
                throw unavailable(exception);
            }
            return remember(CrawlerQueueEngineMode.V1, null);
        }
        if (durable == null || durable.mode() == CrawlerQueueEngineMode.V1) {
            if (redis == null || redis.mode() == CrawlerQueueEngineMode.V1) {
                return remember(CrawlerQueueEngineMode.V1, null);
            }
            return remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_RESET);
        }
        if (durable.mode() == CrawlerQueueEngineMode.MAINTENANCE) {
            return remember(CrawlerQueueEngineMode.MAINTENANCE, reasonForMaintenance(durable, redis));
        }
        if (!sameV2Identity(durable, redis)) {
            return remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_RESET);
        }
        Instant redisFirst = redisFirstMutation(redis);
        if (durable.mutationReservationAt() != null && durable.firstLiveMutationAt() == null) {
            return remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
        }
        if (durable.firstLiveMutationAt() != null) {
            if (!durable.firstLiveMutationAt().equals(redisFirst)) {
                return remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_RESET);
            }
            return remember(CrawlerQueueEngineMode.V2, null);
        }
        if (redisFirst != null) {
            return remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN);
        }
        return remember(CrawlerQueueEngineMode.V2, null);
    }

    private CrawlerQueueV2ReasonCode reasonForMaintenance(
        CutoverState state,
        CrawlerQueueV2Repository.EngineState redis
    ) {
        if (state.mutationReservationAt() != null && state.firstLiveMutationAt() == null) {
            return CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN;
        }
        if (!sameV2Identity(state, redis)) {
            return CrawlerQueueV2ReasonCode.STATE_STORE_RESET;
        }
        if (state.firstLiveMutationAt() != null && !state.firstLiveMutationAt().equals(redisFirstMutation(redis))) {
            return CrawlerQueueV2ReasonCode.STATE_STORE_RESET;
        }
        return CrawlerQueueV2ReasonCode.STATE_STORE_RESET;
    }

    private CrawlerQueueV2ReasonCode reasonForDurableState(CutoverState state) {
        if (state == null || state.mode() == CrawlerQueueEngineMode.V1) {
            return null;
        }
        if (state.mutationReservationAt() != null && state.firstLiveMutationAt() == null) {
            return CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN;
        }
        return state.mode() == CrawlerQueueEngineMode.MAINTENANCE
            ? CrawlerQueueV2ReasonCode.STATE_STORE_RESET
            : null;
    }

    private void verifyMatchingRedisEvidence(CutoverState durable, Instant committedAt) {
        CrawlerQueueV2Repository.EngineState redis;
        try {
            redis = repository.readEngineState();
        } catch (RuntimeException exception) {
            remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE);
            throw unavailable(exception);
        }
        if (!sameV2Identity(durable, redis) || !committedAt.equals(redisFirstMutation(redis))) {
            remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_RESET);
            throw new CrawlerQueueV2Exception(
                HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
                "Redis 首次 mutation 证据与 durable cutover identity 不一致",
                null
            );
        }
    }

    private boolean sameV2Identity(CutoverState durable, CrawlerQueueV2Repository.EngineState redis) {
        return durable != null
            && redis != null
            && redis.mode() == CrawlerQueueEngineMode.V2
            && !isBlank(durable.stateStoreEpoch())
            && !isBlank(durable.cutoverId())
            && Objects.equals(durable.stateStoreEpoch(), redis.stateStoreEpoch())
            && Objects.equals(durable.cutoverId(), redis.activeCutoverId());
    }

    private Instant redisFirstMutation(CrawlerQueueV2Repository.EngineState state) {
        if (state == null || isBlank(state.firstLiveMutationAt())) {
            return null;
        }
        try {
            return Instant.parse(state.firstLiveMutationAt());
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private void requireDurableV2(CutoverState state) {
        if (state == null || state.mode() != CrawlerQueueEngineMode.V2) {
            throw new IllegalStateException("durable router 不是可写 V2 状态");
        }
    }

    private void requireDurableV2OrMaintenance(CutoverState state) {
        if (state == null || (state.mode() != CrawlerQueueEngineMode.V2 && state.mode() != CrawlerQueueEngineMode.MAINTENANCE)) {
            throw new IllegalStateException("durable router 尚未进入 V2 cutover");
        }
    }

    private CutoverState normalize(CutoverState state) {
        if (state.contractVersion() != 2 || state.mode() == null) {
            throw new IllegalArgumentException("无效 V2 cutover marker");
        }
        if (state.mode() != CrawlerQueueEngineMode.V1
            && (isBlank(state.cutoverId()) || isBlank(state.stateStoreEpoch()))) {
            throw new IllegalArgumentException("V2 cutover marker 缺少 cutoverId 或 epoch");
        }
        if (state.firstLiveMutationAt() != null && state.mutationReservationAt() == null) {
            throw new IllegalArgumentException("首次 V2 mutation 确认必须保留 reservation");
        }
        return new CutoverState(
            state.contractVersion(),
            state.mode(),
            state.cutoverId(),
            state.stateStoreEpoch(),
            state.updatedAt() == null ? clock.instant() : state.updatedAt(),
            state.mutationReservationAt(),
            state.firstLiveMutationAt()
        );
    }

    private void validateReplacement(CutoverState current, CutoverState next) {
        if (current == null) {
            return;
        }
        if (current.mode() != CrawlerQueueEngineMode.V1) {
            if (!Objects.equals(current.cutoverId(), next.cutoverId())
                || !Objects.equals(current.stateStoreEpoch(), next.stateStoreEpoch())) {
                throw new IllegalStateException("cutoverId 或 epoch 不允许被陈旧写入覆盖");
            }
            if (current.mutationReservationAt() != null
                && !Objects.equals(current.mutationReservationAt(), next.mutationReservationAt())) {
                throw new IllegalStateException("首次 mutation reservation 不可覆盖或清除");
            }
            if (current.firstLiveMutationAt() != null
                && !Objects.equals(current.firstLiveMutationAt(), next.firstLiveMutationAt())) {
                throw new IllegalStateException("首次 mutation confirmation 不可覆盖");
            }
            if (next.mode() == CrawlerQueueEngineMode.V1) {
                throw new IllegalStateException("已进入 V2 cutover 的 durable marker 不能直接写回 V1");
            }
        }
    }

    private CutoverState readState() {
        if (!Files.exists(statePath)) {
            return null;
        }
        try {
            CutoverState state = objectMapper.readValue(Files.readAllBytes(statePath), CutoverState.class);
            return normalize(state);
        } catch (IOException | RuntimeException exception) {
            remember(CrawlerQueueEngineMode.MAINTENANCE, CrawlerQueueV2ReasonCode.STATE_STORE_RESET);
            throw new CrawlerQueueV2Exception(
                HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
                "durable cutover marker 无法读取或不符合契约",
                exception
            );
        }
    }

    private void writeStateAtomically(CutoverState state) {
        try {
            Files.createDirectories(statePath.getParent());
            Path temp = Files.createTempFile(statePath.getParent(), "cutover-state-", ".tmp");
            try {
                byte[] bytes = objectMapper.writeValueAsBytes(state);
                try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                    channel.write(ByteBuffer.wrap(bytes));
                    channel.force(true);
                }
                try {
                    Files.move(temp, statePath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (AtomicMoveNotSupportedException unsupported) {
                    Files.move(temp, statePath, StandardCopyOption.REPLACE_EXISTING);
                }
                forceDirectory(statePath.getParent());
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("无法原子写入 durable cutover marker", exception);
        }
    }

    private void forceDirectory(Path directory) {
        try (FileChannel channel = FileChannel.open(directory, StandardOpenOption.READ)) {
            channel.force(true);
        } catch (UnsupportedOperationException | IOException ignored) {
            // Directory fsync is not available on every local filesystem.
        }
    }

    private CrawlerQueueV2Exception unavailable(RuntimeException cause) {
        return new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE.messageZh(),
            cause
        );
    }

    private CrawlerQueueEngineMode remember(CrawlerQueueEngineMode mode, CrawlerQueueV2ReasonCode reason) {
        lastKnownMode = mode;
        lastReasonCode = reason;
        return mode;
    }

    private <T> T locked(StateOperation<T> operation) {
        if (v1Only) {
            return operation.apply(null);
        }
        if (lockAlreadyHeld()) {
            return operation.apply(readState());
        }
        ReentrantLock processLock = PROCESS_LOCKS.computeIfAbsent(lockPath, ignored -> new ReentrantLock(true));
        processLock.lock();
        try {
            Files.createDirectories(lockPath.getParent());
            try (FileChannel channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                retainHeldLock();
                try {
                    return operation.apply(readState());
                } finally {
                    releaseHeldLock();
                }
            }
        } catch (IOException exception) {
            throw new IllegalStateException("无法锁定 durable cutover marker", exception);
        } finally {
            processLock.unlock();
        }
    }

    private boolean lockAlreadyHeld() {
        return HELD_LOCKS.get().getOrDefault(lockPath, 0) > 0;
    }

    private void retainHeldLock() {
        Map<Path, Integer> held = HELD_LOCKS.get();
        held.put(lockPath, held.getOrDefault(lockPath, 0) + 1);
    }

    private void releaseHeldLock() {
        Map<Path, Integer> held = HELD_LOCKS.get();
        int count = held.getOrDefault(lockPath, 0);
        if (count <= 1) {
            held.remove(lockPath);
        } else {
            held.put(lockPath, count - 1);
        }
        if (held.isEmpty()) {
            HELD_LOCKS.remove();
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    @FunctionalInterface
    private interface StateOperation<T> {
        T apply(CutoverState current);
    }

    public interface MutationPermit {
        CrawlerQueueEngineMode mode();

        CutoverState durableState();

        void requireMode(CrawlerQueueEngineMode expectedMode);
    }

    private final class HeldMutationPermit implements MutationPermit {

        @Override
        public CrawlerQueueEngineMode mode() {
            return CrawlerQueueEngineRouter.this.mode();
        }

        @Override
        public CutoverState durableState() {
            return CrawlerQueueEngineRouter.this.readDurableState();
        }

        @Override
        public void requireMode(CrawlerQueueEngineMode expectedMode) {
            Objects.requireNonNull(expectedMode, "expectedMode");
            CrawlerQueueEngineMode actual = mode();
            if (actual == expectedMode) {
                return;
            }
            CrawlerQueueV2ReasonCode reason = lastReasonCode();
            throw new CrawlerQueueV2Exception(
                HttpStatus.CONFLICT,
                reason == null ? CrawlerQueueV2ReasonCode.STATE_STORE_RESET : reason,
                "durable mutation permit 未允许队列引擎：" + actual.value(),
                null
            );
        }
    }

    public record CutoverState(
        int contractVersion,
        CrawlerQueueEngineMode mode,
        String cutoverId,
        String stateStoreEpoch,
        Instant updatedAt,
        Instant mutationReservationAt,
        Instant firstLiveMutationAt
    ) {
    }
}
