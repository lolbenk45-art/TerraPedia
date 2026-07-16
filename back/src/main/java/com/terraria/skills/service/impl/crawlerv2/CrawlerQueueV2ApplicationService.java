package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.dto.CrawlerAttemptLogDetailDTO;
import com.terraria.skills.dto.CrawlerQueueV2OverviewDTO;
import com.terraria.skills.service.impl.CrawlerMonitorActionDefinition;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * V2 command orchestration and its read-only overview projection. Queue state
 * always comes from the V2 repository; V1 data is appended only as immutable
 * history by {@link CrawlerLegacyHistoryAdapter}.
 */
public class CrawlerQueueV2ApplicationService {

    private static final int HISTORY_LIMIT = 100;
    private static final Duration HISTORY_AGE = Duration.ofDays(7);
    private static final Duration DEDUPE_TTL = Duration.ofHours(2);

    private final CrawlerQueueEngineRouter router;
    private final CrawlerQueueV2Repository repository;
    private final CrawlerAttemptStateMachine stateMachine;
    private final CrawlerAttemptSupervisor supervisor;
    private final CrawlerQueueV2Reconciler reconciler;
    private final CrawlerAttemptArtifactStore artifactStore;
    private final CrawlerMonitorActionRegistry actionRegistry;
    private final CrawlerLegacyHistoryAdapter legacyHistory;
    private final CrawlerQueueV2Properties properties;
    private final Clock clock;
    private final CrawlerQueueV2EventBridge eventBridge;
    private volatile OverviewSnapshot lastSuccessfulSnapshot;

    public CrawlerQueueV2ApplicationService(
        CrawlerQueueEngineRouter router,
        CrawlerQueueV2Repository repository,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerAttemptSupervisor supervisor,
        CrawlerQueueV2Reconciler reconciler,
        CrawlerAttemptArtifactStore artifactStore,
        CrawlerMonitorActionRegistry actionRegistry,
        CrawlerLegacyHistoryAdapter legacyHistory,
        CrawlerQueueV2Properties properties,
        Clock clock
    ) {
        this.router = Objects.requireNonNull(router, "router");
        this.repository = Objects.requireNonNull(repository, "repository");
        this.stateMachine = Objects.requireNonNull(stateMachine, "stateMachine");
        this.supervisor = Objects.requireNonNull(supervisor, "supervisor");
        this.reconciler = Objects.requireNonNull(reconciler, "reconciler");
        this.artifactStore = Objects.requireNonNull(artifactStore, "artifactStore");
        this.actionRegistry = Objects.requireNonNull(actionRegistry, "actionRegistry");
        this.legacyHistory = Objects.requireNonNull(legacyHistory, "legacyHistory");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.eventBridge = new CrawlerQueueV2EventBridge(repository, properties, clock);
    }

    public SseEmitter subscribeEvents(String after) {
        return eventBridge.subscribe(after, () -> new SseEmitter(sseSessionTimeoutMillis()));
    }

    public void pollEvents() {
        eventBridge.pollAndBroadcast();
    }

    public void sendEventHeartbeat() {
        eventBridge.sendHeartbeat();
    }

    public DispatchResult enqueue(EnqueueCommand command) {
        requireEnqueue(command);
        return router.withMutationPermit(permit -> enqueueUnderPermit(command, permit));
    }

    private DispatchResult enqueueUnderPermit(
        EnqueueCommand command,
        CrawlerQueueEngineRouter.MutationPermit permit
    ) {
        CrawlerQueueEngineRouter.CutoverState initialDurable = permit.durableState();
        CrawlerQueueEngineRouter.CutoverState durable = initialDurable;
        boolean hadUnconfirmedReservation = durable != null
            && durable.mutationReservationAt() != null
            && durable.firstLiveMutationAt() == null;
        if (durable != null && durable.mutationReservationAt() != null && durable.firstLiveMutationAt() == null) {
            durable = router.reconcileFirstMutationReservation();
        }
        permit.requireMode(CrawlerQueueEngineMode.V2);
        CrawlerQueueV2Repository.EngineState engine = requireMatchingEngine(durable);
        CrawlerMonitorActionDefinition action = requireExactAction(command.domain(), command.actionId());
        String lane = requireLane(command.lane());
        String resumeMode = effectiveResumeMode(action, command.resumeMode());
        Instant now = clock.instant();
        String queueId = "queue-" + UUID.randomUUID();
        String attemptId = "attempt-" + UUID.randomUUID();
        String dedupeKey = lane + ":" + action.actionId() + ":" + resumeMode;
        CrawlerQueueV2Artifacts artifacts = deterministicArtifacts(now, attemptId, action);
        CrawlerQueueV2Attempt attempt = new CrawlerQueueV2Attempt(
            2,
            engine.stateStoreEpoch(),
            queueId,
            attemptId,
            null,
            1L,
            CrawlerQueueV2Status.QUEUED,
            lane,
            action.domain(),
            action.coveredDomains(),
            action.actionId(),
            null,
            now,
            now,
            now,
            null,
            null,
            now,
            stateMachine.deadlineFor(CrawlerQueueV2Status.QUEUED, now, now, now),
            null,
            null,
            0L,
            "queued",
            0L,
            null,
            "queued",
            null,
            artifacts
        );
        CrawlerQueueV2Queue queue = new CrawlerQueueV2Queue(
            2,
            engine.stateStoreEpoch(),
            queueId,
            lane,
            action.domain(),
            action.coveredDomains(),
            action.actionId(),
            dedupeKey,
            now,
            command.requestedBy(),
            attemptId,
            List.of(attemptId),
            command.legacyQueueId()
        );
        CrawlerQueueV2Event event = new CrawlerQueueV2Event(
            "queue.created",
            engine.stateStoreEpoch(),
            queueId,
            attemptId,
            null,
            1L,
            CrawlerQueueV2Status.QUEUED,
            null,
            now
        );
        boolean reservationNeeded = durable != null
            && durable.mutationReservationAt() == null
            && durable.firstLiveMutationAt() == null;
        boolean confirmationMayBeUncertain = reservationNeeded || (hadUnconfirmedReservation
            && (durable == null || durable.firstLiveMutationAt() == null));
        if (reservationNeeded) {
            router.reserveFirstLiveMutation(now);
        }

        CrawlerQueueV2Repository.EnqueueResult enqueue;
        try {
            enqueue = repository.createQueue(new CrawlerQueueV2Repository.CreateQueueCommand(
                engine.stateStoreEpoch(),
                queue,
                attempt,
                now.toEpochMilli(),
                DEDUPE_TTL,
                event
            ));
            if (enqueue == null || enqueue.firstLiveMutationAt() == null) {
                throw new IllegalStateException("V2 enqueue 缺少 Redis 首次 mutation 证据");
            }
            confirmOrValidateFirstMutation(durable, enqueue.firstLiveMutationAt());
        } catch (RuntimeException exception) {
            if (confirmationMayBeUncertain) {
                markUncertainSafely();
                throw mutationUncertain(exception);
            }
            throw exception;
        }

        if (enqueue.code() == CrawlerQueueV2Repository.EnqueueCode.DEDUPED) {
            return new DispatchResult(
                false,
                true,
                null,
                enqueue.queueId(),
                enqueue.attemptId(),
                null,
                enqueue.stateVersion(),
                CrawlerQueueV2Status.QUEUED,
                enqueue.reasonCode() == null ? CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT : enqueue.reasonCode(),
                message(enqueue.reasonCode() == null ? CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT : enqueue.reasonCode()),
                suggestedAction(enqueue.reasonCode() == null ? CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT : enqueue.reasonCode()),
                List.of()
            );
        }

        try {
            artifactStore.prepare(
                engine.stateStoreEpoch(),
                queueId,
                attemptId,
                action.domain(),
                action.actionId(),
                now,
                artifacts
            );
            artifactStore.writeOperationPlan(attemptId, planSnapshot(action, now));
        } catch (RuntimeException exception) {
            throw new CrawlerQueueV2Exception(
                HttpStatus.SERVICE_UNAVAILABLE,
                CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE,
                "V2 queue 已创建但 immutable attempt manifest 无法建立",
                exception
            );
        }
        reconciler.reconcileNow();
        return new DispatchResult(
            true,
            true,
            null,
            enqueue.queueId(),
            enqueue.attemptId(),
            null,
            enqueue.stateVersion(),
            CrawlerQueueV2Status.QUEUED,
            null,
            null,
            null,
            stateMachine.allowedActions(CrawlerQueueV2Status.QUEUED)
        );
    }

    public DispatchResult control(ControlCommand command) {
        requireControl(command);
        return router.withMutationPermit(permit -> controlUnderPermit(command, permit));
    }

    public CrawlerAttemptLogDetailDTO getAttemptLog(String attemptId, long offset, int maxBytes) {
        if (blank(attemptId)) {
            throw new IllegalArgumentException("V2 attemptId 不可为空");
        }
        long safeOffset = Math.max(0L, offset);
        int safeMaxBytes = Math.max(1, Math.min(262_144, maxBytes));
        CrawlerAttemptLogMetadata metadata;
        try {
            metadata = artifactStore.logMetadata(attemptId, clock.instant());
        } catch (SecurityException exception) {
            throw forbiddenLog(exception);
        } catch (IllegalStateException exception) {
            CrawlerAttemptLogAvailability availability = unavailableLogAvailability(exception);
            if (availability == null) {
                throw artifactReadFailure(exception);
            }
            return unavailableLog(
                attemptId,
                safeOffset,
                availability,
                availability == CrawlerAttemptLogAvailability.EXPIRED
                    ? CrawlerQueueV2ReasonCode.LOG_EXPIRED
                    : CrawlerQueueV2ReasonCode.LOG_MISSING
            );
        }
        if (metadata.availability() == CrawlerAttemptLogAvailability.FORBIDDEN) {
            throw forbiddenLog(null);
        }
        CrawlerAttemptLogDetailDTO detail = logDetail(metadata, safeOffset);
        if (!metadata.previewable()) {
            return detail;
        }
        try {
            CrawlerAttemptArtifactStore.LogChunk chunk = artifactStore.readLog(
                attemptId,
                safeOffset,
                safeMaxBytes,
                clock.instant()
            );
            detail.setOffset(chunk.offset());
            detail.setNextOffset(chunk.nextOffset());
            detail.setContent(chunk.content());
            detail.setTruncated(chunk.truncated());
            return detail;
        } catch (SecurityException exception) {
            throw forbiddenLog(exception);
        } catch (IllegalStateException exception) {
            CrawlerAttemptLogAvailability availability = unavailableLogAvailability(exception);
            if (availability == null) {
                throw artifactReadFailure(exception);
            }
            return unavailableLog(
                attemptId,
                safeOffset,
                availability,
                availability == CrawlerAttemptLogAvailability.EXPIRED
                    ? CrawlerQueueV2ReasonCode.LOG_EXPIRED
                    : CrawlerQueueV2ReasonCode.LOG_MISSING
            );
        }
    }

    private DispatchResult controlUnderPermit(
        ControlCommand command,
        CrawlerQueueEngineRouter.MutationPermit permit
    ) {
        CrawlerQueueEngineRouter.CutoverState durable = requireConfirmedV2Mutation(permit);
        CrawlerQueueV2Attempt current = repository.findAttempt(command.attemptId())
            .orElseThrow(() -> stateStoreConflict("V2 attempt 不存在或已经被清理"));
        requireCurrentEpoch(current, durable.stateStoreEpoch());
        if (!Objects.equals(command.queueId(), current.queueId())) {
            throw stateStoreConflict("queueId 与 attemptId 不匹配");
        }
        if (command.expectedStateVersion() != current.stateVersion()) {
            throw staleStateVersion();
        }
        List<String> allowedActions = stateMachine.allowedActions(current.status());
        if (!allowedActions.contains(command.controlAction())) {
            throw stateStoreConflict("当前 V2 状态不允许控制动作：" + command.controlAction());
        }
        if ("retry".equals(command.controlAction())) {
            requireLatestTerminalAttempt(current, durable.stateStoreEpoch());
        }
        return switch (command.controlAction()) {
            case "cancel" -> cancel(current);
            case "pause" -> fromAttempt(supervisor.pause(current));
            case "resume" -> fromAttempt(supervisor.resume(current));
            case "retry" -> retry(current, command.operator());
            case "cleanup" -> {
                cleanupUnderPermit(new CleanupCommand(current.attemptId(), current.stateVersion(), command.operator()), permit);
                yield fromAttempt(current);
            }
            default -> throw stateStoreConflict("不支持 V2 控制动作：" + command.controlAction());
        };
    }

    public OverviewSnapshot overview() {
        CrawlerQueueEngineMode mode;
        try {
            mode = router.mode();
        } catch (CrawlerQueueV2Exception exception) {
            return unavailableSnapshot(exception.reasonCode());
        }
        if (mode != CrawlerQueueEngineMode.V2) {
            return maintenanceSnapshot();
        }
        Instant generatedAt = clock.instant();
        try {
            CrawlerQueueV2Repository.EngineState engine = repository.readEngineState();
            if (engine == null || engine.mode() != CrawlerQueueEngineMode.V2 || blank(engine.stateStoreEpoch())) {
                throw stateStoreConflict("V2 overview 缺少可读 epoch");
            }
            List<CrawlerQueueV2Attempt> live = safeList(repository.findLiveAttempts());
            List<CrawlerQueueV2Attempt> terminal = safeList(
                repository.findTerminalAttempts(HISTORY_LIMIT, generatedAt.minus(HISTORY_AGE))
            );
            Optional<CrawlerQueueV2Repository.ReconcilerHealth> health = repository.readReconcilerHealth();
            String cursor = repository.latestStreamCursor();
            repository.findQuarantines(); // read-only integrity boundary; never changes the overview authority.
            List<CrawlerQueueV2OverviewDTO.AttemptDTO> liveRows = live.stream()
                .filter(attempt -> Objects.equals(engine.stateStoreEpoch(), attempt.stateStoreEpoch()))
                .map(this::attemptRow)
                .toList();
            List<CrawlerQueueV2OverviewDTO.DomainStateDTO> domainRows = domainRows(liveRows, true);
            List<CrawlerQueueV2OverviewDTO.AttemptDTO> history = historyRows(engine.stateStoreEpoch(), live, terminal);
            CrawlerQueueV2OverviewDTO.HealthDTO queueHealth = health(
                "healthy",
                generatedAt,
                health.orElse(null),
                null
            );
            CrawlerQueueV2OverviewDTO.HealthDTO reconcilerHealth = health(
                health.isPresent() && health.orElseThrow().reasonCode() == null ? "healthy" : "attention",
                generatedAt,
                health.orElse(null),
                health.map(CrawlerQueueV2Repository.ReconcilerHealth::reasonCode).orElse(null)
            );
            OverviewSnapshot snapshot = new OverviewSnapshot(
                2,
                engine.stateStoreEpoch(),
                generatedAt,
                cursor == null ? "0-0" : cursor,
                queueHealth,
                reconcilerHealth,
                liveRows,
                domainRows,
                history,
                safeList(legacyHistory.read())
            );
            lastSuccessfulSnapshot = snapshot;
            return snapshot;
        } catch (RuntimeException exception) {
            CrawlerQueueV2ReasonCode reason = exception instanceof CrawlerQueueV2Exception typed
                ? typed.reasonCode()
                : CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE;
            return unavailableSnapshot(reason);
        }
    }

    public CrawlerAttemptArtifactStore.CleanupResult cleanup(CleanupCommand command) {
        requireCleanup(command);
        return router.withMutationPermit(permit -> cleanupUnderPermit(command, permit));
    }

    private CrawlerAttemptArtifactStore.CleanupResult cleanupUnderPermit(
        CleanupCommand command,
        CrawlerQueueEngineRouter.MutationPermit permit
    ) {
        CrawlerQueueEngineRouter.CutoverState durable = requireConfirmedV2Mutation(permit);
        CrawlerQueueV2Attempt current = repository.findAttempt(command.attemptId())
            .orElseThrow(() -> stateStoreConflict("V2 attempt 不存在或已经被清理"));
        requireCurrentEpoch(current, durable.stateStoreEpoch());
        if (current.stateVersion() != command.expectedStateVersion()) {
            throw staleStateVersion();
        }
        if (!current.status().terminal()) {
            throw stateStoreConflict("只有终态 V2 attempt 可以清理证据");
        }
        CrawlerAttemptArtifactStore.CleanupResult result = artifactStore.cleanupArtifacts(
            current.attemptId(),
            current.status(),
            command.operator(),
            clock.instant()
        );
        repository.appendEvent(new CrawlerQueueV2Event(
            "artifact.cleaned",
            current.stateStoreEpoch(),
            current.queueId(),
            current.attemptId(),
            current.fenceToken(),
            current.stateVersion(),
            current.status(),
            CrawlerQueueV2ReasonCode.LOG_EXPIRED,
            clock.instant()
        ));
        return result;
    }

    private DispatchResult cancel(CrawlerQueueV2Attempt current) {
        if (current.status() == CrawlerQueueV2Status.QUEUED || current.status() == CrawlerQueueV2Status.RETRY_WAIT) {
            return fromAttempt(mutate(current, CrawlerQueueV2Status.CANCELLED, null, true));
        }
        CrawlerQueueV2Attempt requested = mutate(
            current,
            CrawlerQueueV2Status.CANCEL_REQUESTED,
            null,
            false
        );
        CrawlerQueueV2Attempt result = supervisor.cancel(requested);
        return fromAttempt(result == null ? requested : result);
    }

    private DispatchResult retry(CrawlerQueueV2Attempt prior, String operator) {
        CrawlerQueueV2Repository.EngineState engine = requireMatchingEngine(router.readDurableState());
        CrawlerQueueV2Queue existingQueue = repository.findQueue(prior.queueId())
            .orElseThrow(() -> stateStoreConflict("V2 retry 缺少 queue 记录"));
        Instant now = clock.instant();
        String nextAttemptId = "attempt-" + UUID.randomUUID();
        CrawlerMonitorActionDefinition action = requireExactAction(prior.domain(), prior.actionId());
        CrawlerQueueV2Artifacts artifacts = deterministicArtifacts(now, nextAttemptId, action);
        CrawlerQueueV2Status retryStatus = CrawlerQueueV2Status.RETRY_WAIT;
        CrawlerQueueV2Attempt next = new CrawlerQueueV2Attempt(
            2,
            engine.stateStoreEpoch(),
            prior.queueId(),
            nextAttemptId,
            null,
            1L,
            retryStatus,
            prior.lane(),
            prior.domain(),
            prior.coveredDomains(),
            prior.actionId(),
            prior.attemptId(),
            now,
            now,
            now,
            null,
            null,
            now,
            stateMachine.deadlineFor(retryStatus, now, now, now),
            null,
            null,
            0L,
            "retry_wait",
            0L,
            null,
            "retry queued",
            null,
            artifacts
        );
        List<String> ids = new ArrayList<>(existingQueue.attemptIds());
        ids.add(nextAttemptId);
        CrawlerQueueV2Queue updatedQueue = new CrawlerQueueV2Queue(
            existingQueue.contractVersion(),
            existingQueue.stateStoreEpoch(),
            existingQueue.queueId(),
            existingQueue.lane(),
            existingQueue.domain(),
            existingQueue.coveredDomains(),
            existingQueue.actionId(),
            existingQueue.dedupeKey(),
            existingQueue.requestedAt(),
            blank(operator) ? existingQueue.requestedBy() : operator,
            nextAttemptId,
            ids,
            existingQueue.legacyQueueId()
        );
        CrawlerQueueV2Repository.MutationResult result = repository.createRetry(
            new CrawlerQueueV2Repository.CreateRetryCommand(
                engine.stateStoreEpoch(),
                updatedQueue,
                next,
                prior.stateVersion(),
                now.toEpochMilli(),
                DEDUPE_TTL,
                new CrawlerQueueV2Event(
                    "attempt.created",
                    engine.stateStoreEpoch(),
                    prior.queueId(),
                    nextAttemptId,
                    null,
                    1L,
                    retryStatus,
                    null,
                    now
                )
            )
        );
        artifactStore.prepare(
            engine.stateStoreEpoch(),
            prior.queueId(),
            nextAttemptId,
            prior.domain(),
            prior.actionId(),
            now,
            artifacts
        );
        artifactStore.writeOperationPlan(nextAttemptId, planSnapshot(action, now));
        reconciler.reconcileNow();
        return fromAttempt(result == null || result.attempt() == null ? next : result.attempt());
    }

    private CrawlerQueueV2Attempt mutate(
        CrawlerQueueV2Attempt current,
        CrawlerQueueV2Status target,
        CrawlerQueueV2ReasonCode reason,
        boolean releaseOwnership
    ) {
        CrawlerQueueV2Queue queue = repository.findQueue(current.queueId())
            .orElseThrow(() -> stateStoreConflict("V2 mutation 缺少 queue 记录"));
        stateMachine.requireValidTransition(current.status(), target);
        Instant now = clock.instant();
        Instant deadline = target.terminal() ? null : stateMachine.deadlineFor(
            target,
            now,
            current.lastHeartbeatAt() == null ? now : current.lastHeartbeatAt(),
            current.eligibleAt() == null ? now : current.eligibleAt()
        );
        CrawlerQueueV2Repository.MutationResult result = repository.mutate(new CrawlerQueueV2Repository.MutationCommand(
            current.stateStoreEpoch(),
            current.queueId(),
            current.attemptId(),
            current.lane(),
            queue.dedupeKey(),
            current.coveredDomains(),
            current.fenceToken(),
            current.stateVersion(),
            target,
            reason,
            now,
            deadline,
            current.lastHeartbeatAt(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            releaseOwnership,
            null,
            "attempt.transitioned"
        ));
        if (result == null || result.attempt() == null) {
            throw stateStoreConflict("V2 mutation 未返回权威 attempt");
        }
        return result.attempt();
    }

    private List<CrawlerQueueV2OverviewDTO.AttemptDTO> historyRows(
        String currentEpoch,
        List<CrawlerQueueV2Attempt> live,
        List<CrawlerQueueV2Attempt> terminal
    ) {
        Map<String, CrawlerQueueV2OverviewDTO.AttemptDTO> rows = new LinkedHashMap<>();
        Map<String, CrawlerQueueV2Attempt> latestTerminalByDomain = latestTerminalByDomain(currentEpoch, terminal);
        for (CrawlerQueueV2Attempt attempt : terminal) {
            rows.putIfAbsent(attempt.attemptId(), attemptRow(
                attempt,
                attemptArtifacts(attempt),
                Objects.equals(currentEpoch, attempt.stateStoreEpoch()),
                isLatestForCoveredDomains(attempt, latestTerminalByDomain)
            ));
        }
        LinkedHashSet<String> indexed = new LinkedHashSet<>();
        safeList(live).stream()
            .filter(attempt -> Objects.equals(currentEpoch, attempt.stateStoreEpoch()))
            .forEach(attempt -> indexed.add(attempt.attemptId()));
        safeList(terminal).stream()
            .filter(attempt -> Objects.equals(currentEpoch, attempt.stateStoreEpoch()))
            .forEach(attempt -> indexed.add(attempt.attemptId()));
        for (CrawlerAttemptManifest manifest : safeList(artifactStore.listManifests())) {
            if (manifest == null || blank(manifest.attemptId()) || indexed.contains(manifest.attemptId())) {
                continue;
            }
            rows.putIfAbsent(manifest.attemptId(), manifestHistoryRow(currentEpoch, manifest));
        }
        return List.copyOf(rows.values());
    }

    private CrawlerQueueV2OverviewDTO.AttemptDTO manifestHistoryRow(
        String currentEpoch,
        CrawlerAttemptManifest manifest
    ) {
        CrawlerQueueV2Status stored = manifest.status();
        boolean preserveTerminal = stored != null && stored.terminal();
        CrawlerQueueV2Status status = preserveTerminal ? stored : CrawlerQueueV2Status.INTERRUPTED;
        CrawlerQueueV2ReasonCode reason = preserveTerminal ? manifest.reasonCode() : CrawlerQueueV2ReasonCode.STATE_STORE_RESET;
        return new CrawlerQueueV2OverviewDTO.AttemptDTO(
            manifest.queueId(),
            manifest.attemptId(),
            manifest.stateStoreEpoch(),
            manifest.fenceToken(),
            0L,
            status.value(),
            null,
            manifest.domain(),
            manifest.domain() == null ? List.of() : List.of(manifest.domain()),
            manifest.actionId(),
            null,
            null,
            null,
            null,
            manifest.startedAt(),
            manifest.completedAt(),
            null,
            null,
            reason,
            message(reason),
            suggestedAction(reason),
            false,
            List.of(),
            manifest.progressPath(),
            manifest.outputPath(),
            manifest.reportPath(),
            safeLogMetadata(manifest.attemptId()),
            planRow(safeOperationPlan(manifest.attemptId())),
            resultRow(safeProgress(manifest.attemptId()))
        );
    }

    private List<CrawlerQueueV2OverviewDTO.DomainStateDTO> domainRows(
        List<CrawlerQueueV2OverviewDTO.AttemptDTO> live,
        boolean startAllowed
    ) {
        Map<String, CrawlerQueueV2OverviewDTO.DomainStateDTO> domains = new LinkedHashMap<>();
        for (CrawlerQueueV2OverviewDTO.AttemptDTO attempt : live) {
            for (String domain : attempt.coveredDomains()) {
                domains.putIfAbsent(domain, new CrawlerQueueV2OverviewDTO.DomainStateDTO(
                    domain,
                    attempt.attemptId(),
                    attempt.stateVersion(),
                    attempt.status(),
                    attempt.phase(),
                    attempt.current(),
                    attempt.total(),
                    attempt.lastHeartbeatAt(),
                    attempt.deadlineAt(),
                    attempt.reasonCode(),
                    attempt.messageZh(),
                    attempt.suggestedAction(),
                    attempt.allowedActions(),
                    operationRows(domain)
                ));
            }
        }
        for (CrawlerMonitorActionDefinition action : actionRegistry.all()) {
            domains.putIfAbsent(action.domain(), idleDomainRow(action.domain(), startAllowed));
        }
        return List.copyOf(domains.values());
    }

    private CrawlerQueueV2OverviewDTO.DomainStateDTO idleDomainRow(String domain, boolean startAllowed) {
        return new CrawlerQueueV2OverviewDTO.DomainStateDTO(
            domain,
            null,
            null,
            "idle",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            startAllowed ? List.of("start") : List.of(),
            operationRows(domain)
        );
    }

    private List<CrawlerQueueV2OverviewDTO.OperationDTO> operationRows(String domain) {
        return actionRegistry.operations(domain).stream()
            .map(action -> new CrawlerQueueV2OverviewDTO.OperationDTO(
                action.operationId(),
                action.actionId(),
                action.labelZh(),
                action.category(),
                action.mode(),
                action.descriptionZh(),
                action.networkAccess(),
                action.sourceLocator(),
                action.fileWriteSummary(),
                action.databaseAccess(),
                action.estimatedRequests(),
                action.estimatedRecords(),
                action.shortTask(),
                action.pauseSupported(),
                action.resumeSupported(),
                action.resumeStatePath(),
                action.confirmationLevel(),
                action.defaultOperation()
            ))
            .toList();
    }

    private CrawlerQueueV2OverviewDTO.AttemptDTO attemptRow(CrawlerQueueV2Attempt attempt) {
        return attemptRow(attempt, attemptArtifacts(attempt));
    }

    private CrawlerQueueV2OverviewDTO.AttemptDTO attemptRow(
        CrawlerQueueV2Attempt attempt,
        AttemptArtifacts artifacts
    ) {
        return attemptRow(attempt, artifacts, true);
    }

    private CrawlerQueueV2OverviewDTO.AttemptDTO attemptRow(
        CrawlerQueueV2Attempt attempt,
        AttemptArtifacts artifacts,
        boolean actionable
    ) {
        return attemptRow(attempt, artifacts, actionable, true);
    }

    private CrawlerQueueV2OverviewDTO.AttemptDTO attemptRow(
        CrawlerQueueV2Attempt attempt,
        AttemptArtifacts artifacts,
        boolean actionable,
        boolean latestForCoveredDomains
    ) {
        CrawlerQueueV2ReasonCode reason = attempt.reasonCode();
        List<String> allowedActions = actionable ? stateMachine.allowedActions(attempt.status()) : List.of();
        if (!latestForCoveredDomains) {
            allowedActions = allowedActions.stream().filter(action -> !"retry".equals(action)).toList();
        }
        return new CrawlerQueueV2OverviewDTO.AttemptDTO(
            attempt.queueId(),
            attempt.attemptId(),
            attempt.stateStoreEpoch(),
            attempt.fenceToken(),
            attempt.stateVersion(),
            attempt.status().value(),
            attempt.lane(),
            attempt.domain(),
            attempt.coveredDomains(),
            attempt.actionId(),
            attempt.phase(),
            attempt.current(),
            attempt.total(),
            attempt.requestedAt(),
            attempt.startedAt(),
            attempt.completedAt(),
            attempt.lastHeartbeatAt(),
            attempt.deadlineAt(),
            reason,
            message(reason),
            suggestedAction(reason),
            resumeSupported(attempt.domain(), attempt.actionId()),
            allowedActions,
            artifacts.progressPath(),
            artifacts.outputPath(),
            artifacts.reportPath(),
            safeLogMetadata(attempt.attemptId()),
            artifacts.plan(),
            artifacts.result()
        );
    }

    private AttemptArtifacts attemptArtifacts(CrawlerQueueV2Attempt attempt) {
        CrawlerQueueV2Artifacts artifacts = attempt.artifacts();
        CrawlerQueueV2OverviewDTO.PlanDTO plan = planRow(safeOperationPlan(attempt.attemptId()));
        CrawlerQueueV2OverviewDTO.ResultDTO result = resultRow(safeProgress(attempt.attemptId()));
        if (artifacts == null) {
            return new AttemptArtifacts(null, null, null, plan, result);
        }
        return new AttemptArtifacts(
            artifacts.progressPath(),
            artifacts.outputPath(),
            artifacts.reportPath(),
            plan,
            result
        );
    }

    private CrawlerOperationPlanSnapshot safeOperationPlan(String attemptId) {
        try {
            return artifactStore.readOperationPlan(attemptId).orElse(null);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private CrawlerAttemptProgressPayload safeProgress(String attemptId) {
        try {
            return artifactStore.readProgress(attemptId).orElse(null);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static CrawlerQueueV2OverviewDTO.PlanDTO planRow(CrawlerOperationPlanSnapshot plan) {
        if (plan == null) {
            return null;
        }
        return new CrawlerQueueV2OverviewDTO.PlanDTO(
            plan.operationId(), plan.actionId(), plan.labelZh(), plan.mode(), plan.networkAccess(),
            plan.sourceLocator(), plan.fileWriteSummary(), plan.databaseAccess(),
            plan.estimatedRequests(), plan.estimatedRecords(), plan.pauseSupported(),
            plan.resumeSupported(), plan.resumeStatePath(), plan.confirmationLevel(), plan.capturedAt()
        );
    }

    private static CrawlerQueueV2OverviewDTO.ResultDTO resultRow(CrawlerAttemptProgressPayload progress) {
        if (progress == null) {
            return null;
        }
        boolean hasSummary = progress.plannedCount() != null
            || progress.actualCount() != null
            || progress.skippedCount() != null
            || progress.failedCount() != null
            || progress.estimatedRequests() != null
            || progress.estimatedRecords() != null
            || !blank(progress.resultKind())
            || !blank(progress.resumeOutcome());
        if (!hasSummary) {
            return null;
        }
        return new CrawlerQueueV2OverviewDTO.ResultDTO(
            progress.plannedCount(), progress.actualCount(), progress.skippedCount(),
            progress.failedCount(), progress.estimatedRequests(), progress.estimatedRecords(),
            progress.resultKind(), progress.resumeOutcome()
        );
    }

    private boolean resumeSupported(String domain, String actionId) {
        try {
            return actionRegistry.require(domain, actionId).resumeSupported();
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static CrawlerOperationPlanSnapshot planSnapshot(
        CrawlerMonitorActionDefinition action,
        Instant capturedAt
    ) {
        return new CrawlerOperationPlanSnapshot(
            action.operationId(), action.actionId(), action.labelZh(), action.mode(),
            action.networkAccess(), action.sourceLocator(), action.fileWriteSummary(),
            action.databaseAccess(), action.estimatedRequests(), action.estimatedRecords(),
            action.pauseSupported(), action.resumeSupported(), action.resumeStatePath(),
            action.confirmationLevel(), capturedAt
        );
    }

    private record AttemptArtifacts(
        String progressPath,
        String outputPath,
        String reportPath,
        CrawlerQueueV2OverviewDTO.PlanDTO plan,
        CrawlerQueueV2OverviewDTO.ResultDTO result
    ) {
        private static final AttemptArtifacts EMPTY = new AttemptArtifacts(
            null, null, null, null, null
        );
    }

    private CrawlerQueueV2OverviewDTO.HealthDTO health(
        String status,
        Instant generatedAt,
        CrawlerQueueV2Repository.ReconcilerHealth health,
        CrawlerQueueV2ReasonCode reason
    ) {
        CrawlerQueueV2ReasonCode effectiveReason = reason == null && health != null ? health.reasonCode() : reason;
        return new CrawlerQueueV2OverviewDTO.HealthDTO(
            status,
            generatedAt,
            health == null ? null : health.lastReconciledAt(),
            health == null ? 0L : health.overdueAttemptCount(),
            health == null ? 0L : health.oldestOverdueDurationMs(),
            0L,
            effectiveReason,
            message(effectiveReason),
            suggestedAction(effectiveReason)
        );
    }

    private OverviewSnapshot unavailableSnapshot(CrawlerQueueV2ReasonCode reason) {
        OverviewSnapshot cached = lastSuccessfulSnapshot;
        CrawlerQueueV2ReasonCode effective = reason == null ? CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE : reason;
        if (cached != null) {
            CrawlerQueueV2OverviewDTO.HealthDTO unavailable = health(
                "unavailable",
                cached.generatedAt(),
                null,
                effective
            );
            return new OverviewSnapshot(
                cached.queueContractVersion(),
                cached.stateStoreEpoch(),
                cached.generatedAt(),
                cached.streamCursor(),
                unavailable,
                cached.reconcilerHealth(),
                cached.liveQueue(),
                cached.domainStates(),
                cached.attemptHistory(),
                cached.legacyHistory()
            );
        }
        CrawlerQueueEngineRouter.CutoverState durable = safeDurableState();
        Instant generatedAt = durable == null || durable.updatedAt() == null ? clock.instant() : durable.updatedAt();
        return new OverviewSnapshot(
            2,
            durable == null ? null : durable.stateStoreEpoch(),
            generatedAt,
            "0-0",
            health("unavailable", generatedAt, null, effective),
            health("unavailable", generatedAt, null, effective),
            List.of(),
            List.of(),
            List.of(),
            List.of()
        );
    }

    private OverviewSnapshot maintenanceSnapshot() {
        CrawlerQueueEngineRouter.CutoverState durable = safeDurableState();
        CrawlerQueueV2ReasonCode reason = router.lastReasonCode();
        if (reason == null) {
            reason = CrawlerQueueV2ReasonCode.STATE_STORE_RESET;
        }
        OverviewSnapshot cached = lastSuccessfulSnapshot;
        Instant generatedAt = cached == null
            ? durable == null || durable.updatedAt() == null ? clock.instant() : durable.updatedAt()
            : cached.generatedAt();
        CrawlerQueueV2OverviewDTO.HealthDTO health = health("maintenance", generatedAt, null, reason);
        return new OverviewSnapshot(
            2,
            durable == null ? cached == null ? null : cached.stateStoreEpoch() : durable.stateStoreEpoch(),
            generatedAt,
            cached == null ? "0-0" : cached.streamCursor(),
            health,
            health,
            List.of(),
            domainRows(List.of(), false),
            cached == null ? List.of() : cached.attemptHistory(),
            cached == null ? List.of() : cached.legacyHistory()
        );
    }

    private CrawlerQueueEngineRouter.CutoverState safeDurableState() {
        try {
            return router.readDurableState();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private CrawlerQueueV2Repository.EngineState requireMatchingEngine(CrawlerQueueEngineRouter.CutoverState durable) {
        CrawlerQueueV2Repository.EngineState engine = repository.readEngineState();
        if (engine == null || engine.mode() != CrawlerQueueEngineMode.V2 || blank(engine.stateStoreEpoch())) {
            throw stateStoreConflict("V2 state-store 未处于可写 V2 状态");
        }
        if (durable != null && (!Objects.equals(durable.stateStoreEpoch(), engine.stateStoreEpoch())
            || !Objects.equals(durable.cutoverId(), engine.activeCutoverId()))) {
            throw stateStoreConflict("durable cutover 与 Redis V2 identity 不一致");
        }
        return engine;
    }

    private void requireCurrentEpoch(CrawlerQueueV2Attempt attempt, String currentEpoch) {
        if (!Objects.equals(currentEpoch, attempt.stateStoreEpoch())) {
            throw stateStoreConflict("旧 epoch V2 attempt 只可查看历史，不允许控制或清理");
        }
    }

    private void requireLatestTerminalAttempt(CrawlerQueueV2Attempt attempt, String currentEpoch) {
        List<CrawlerQueueV2Attempt> terminal = safeList(
            repository.findTerminalAttempts(HISTORY_LIMIT, clock.instant().minus(HISTORY_AGE))
        );
        if (!isLatestForCoveredDomains(attempt, latestTerminalByDomain(currentEpoch, terminal))) {
            throw staleStateVersion();
        }
    }

    private Map<String, CrawlerQueueV2Attempt> latestTerminalByDomain(
        String currentEpoch,
        List<CrawlerQueueV2Attempt> terminal
    ) {
        Map<String, CrawlerQueueV2Attempt> latest = new LinkedHashMap<>();
        safeList(terminal).stream()
            .filter(attempt -> attempt.status().terminal())
            .filter(attempt -> Objects.equals(currentEpoch, attempt.stateStoreEpoch()))
            .sorted(this::compareTerminalAttemptsNewestFirst)
            .forEach(attempt -> attempt.coveredDomains().forEach(domain -> latest.putIfAbsent(domain, attempt)));
        return latest;
    }

    private int compareTerminalAttemptsNewestFirst(CrawlerQueueV2Attempt left, CrawlerQueueV2Attempt right) {
        Instant leftTime = left.completedAt() != null ? left.completedAt() : left.requestedAt();
        Instant rightTime = right.completedAt() != null ? right.completedAt() : right.requestedAt();
        int timeComparison = Comparator.nullsLast(Comparator.<Instant>reverseOrder()).compare(leftTime, rightTime);
        if (timeComparison != 0) {
            return timeComparison;
        }
        int versionComparison = Long.compare(right.stateVersion(), left.stateVersion());
        return versionComparison != 0
            ? versionComparison
            : Comparator.nullsLast(Comparator.<String>reverseOrder()).compare(left.attemptId(), right.attemptId());
    }

    private boolean isLatestForCoveredDomains(
        CrawlerQueueV2Attempt attempt,
        Map<String, CrawlerQueueV2Attempt> latestTerminalByDomain
    ) {
        return !attempt.coveredDomains().isEmpty() && attempt.coveredDomains().stream().allMatch(domain ->
            Objects.equals(
                attempt.attemptId(),
                Optional.ofNullable(latestTerminalByDomain.get(domain))
                    .map(CrawlerQueueV2Attempt::attemptId)
                    .orElse(null)
            )
        );
    }

    private void confirmOrValidateFirstMutation(
        CrawlerQueueEngineRouter.CutoverState durable,
        Instant redisFirstLiveMutationAt
    ) {
        if (durable == null || durable.firstLiveMutationAt() == null) {
            router.confirmFirstLiveMutation(redisFirstLiveMutationAt);
            return;
        }
        if (!durable.firstLiveMutationAt().equals(redisFirstLiveMutationAt)) {
            throw stateStoreConflict("Redis 首次 mutation 时间与 durable marker 冲突");
        }
    }

    private void markUncertainSafely() {
        try {
            router.markMutationUncertain();
        } catch (RuntimeException ignored) {
            // The primary error remains a fail-closed uncertain first mutation.
        }
    }

    private CrawlerQueueEngineRouter.CutoverState requireConfirmedV2Mutation(
        CrawlerQueueEngineRouter.MutationPermit permit
    ) {
        CrawlerQueueEngineRouter.CutoverState durable = permit.durableState();
        if (durable != null
            && durable.mutationReservationAt() != null
            && durable.firstLiveMutationAt() == null) {
            durable = router.reconcileFirstMutationReservation();
        }
        if (durable == null
            || durable.mutationReservationAt() == null
            || durable.firstLiveMutationAt() == null) {
            throw mutationUncertain(null);
        }
        permit.requireMode(CrawlerQueueEngineMode.V2);
        return durable;
    }

    private CrawlerMonitorActionDefinition requireExactAction(String domain, String actionId) {
        if ("crawler_queue_v2_fixture".equals(domain)
            && "crawler-queue-v2-fixture".equals(actionId)) {
            if (!properties.isFixtureEnabled()) {
                throw new CrawlerQueueV2Exception(
                    HttpStatus.FORBIDDEN,
                    CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED,
                    "fixture execution is disabled in this environment",
                    null
                );
            }
            return CrawlerMonitorActionRegistry.fixture();
        }
        CrawlerMonitorActionDefinition action = actionRegistry.require(domain, actionId);
        if (!Objects.equals(domain, action.domain()) || !Objects.equals(actionId, action.actionId())) {
            throw new IllegalArgumentException("V2 enqueue 必须使用 registry 中精确的 domain/actionId");
        }
        return action;
    }

    private String requireLane(String lane) {
        if (!"standard".equals(lane) && !"exclusive".equals(lane)) {
            throw new IllegalArgumentException("V2 lane 必须是 standard 或 exclusive");
        }
        return lane;
    }

    private String effectiveResumeMode(CrawlerMonitorActionDefinition action, String requested) {
        String mode = blank(requested) ? action.defaultResumeMode() : requested;
        if (!List.of("fresh", "resume", "auto").contains(mode)) {
            throw new IllegalArgumentException("不支持 V2 resumeMode：" + mode);
        }
        if (!action.resumeSupported() && !"fresh".equals(mode)) {
            throw new IllegalArgumentException("当前 action 不支持 V2 resumeMode：" + mode);
        }
        return mode;
    }

    private CrawlerQueueV2Artifacts deterministicArtifacts(
        Instant requestedAt,
        String attemptId,
        CrawlerMonitorActionDefinition action
    ) {
        String date = DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneOffset.UTC).format(requestedAt);
        String base = "reports/crawler-monitor/v2/" + date + "/" + attemptId + "/";
        String reportPath = action.backendRefresh() ? base + "report.json" : null;
        return new CrawlerQueueV2Artifacts(base + "progress.json", base + "run.log", reportPath, null);
    }

    private DispatchResult fromAttempt(CrawlerQueueV2Attempt attempt) {
        if (attempt == null) {
            throw stateStoreConflict("V2 control 未返回权威 attempt");
        }
        CrawlerQueueV2ReasonCode reason = attempt.reasonCode();
        return new DispatchResult(
            true,
            attempt.status() == CrawlerQueueV2Status.QUEUED || attempt.status() == CrawlerQueueV2Status.RETRY_WAIT,
            null,
            attempt.queueId(),
            attempt.attemptId(),
            attempt.fenceToken(),
            attempt.stateVersion(),
            attempt.status(),
            reason,
            message(reason),
            suggestedAction(reason),
            stateMachine.allowedActions(attempt.status())
        );
    }

    private CrawlerAttemptLogMetadata safeLogMetadata(String attemptId) {
        try {
            return artifactStore.logMetadata(attemptId, clock.instant());
        } catch (RuntimeException ignored) {
            return new CrawlerAttemptLogMetadata(
                attemptId,
                null,
                CrawlerAttemptLogAvailability.MISSING,
                false,
                null,
                null,
                null,
                CrawlerQueueV2ReasonCode.LOG_MISSING
            );
        }
    }

    private static CrawlerAttemptLogDetailDTO logDetail(CrawlerAttemptLogMetadata metadata, long offset) {
        CrawlerAttemptLogDetailDTO detail = new CrawlerAttemptLogDetailDTO();
        detail.setAttemptId(metadata.attemptId());
        detail.setPath(metadata.path());
        detail.setAvailability(metadata.availability().value());
        detail.setPreviewable(metadata.previewable());
        detail.setSizeBytes(metadata.sizeBytes());
        detail.setLastWriteAt(metadata.lastWriteAt());
        detail.setRetentionExpiresAt(metadata.retentionExpiresAt());
        detail.setReasonCode(metadata.reasonCode() == null ? null : metadata.reasonCode().name());
        detail.setOffset(offset);
        detail.setNextOffset(offset);
        detail.setContent("");
        detail.setTruncated(false);
        return detail;
    }

    private static CrawlerAttemptLogDetailDTO unavailableLog(
        String attemptId,
        long offset,
        CrawlerAttemptLogAvailability availability,
        CrawlerQueueV2ReasonCode reasonCode
    ) {
        return logDetail(new CrawlerAttemptLogMetadata(
            attemptId,
            null,
            availability,
            false,
            null,
            null,
            null,
            reasonCode
        ), offset);
    }

    private static CrawlerQueueV2Exception forbiddenLog(Throwable cause) {
        return new CrawlerQueueV2Exception(
            HttpStatus.FORBIDDEN,
            CrawlerQueueV2ReasonCode.LOG_FORBIDDEN,
            CrawlerQueueV2ReasonCode.LOG_FORBIDDEN.messageZh(),
            cause
        );
    }

    private static CrawlerQueueV2Exception artifactReadFailure(Throwable cause) {
        return new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.ATTEMPT_ARTIFACT_UNAVAILABLE,
            "读取 V2 attempt 日志失败",
            cause
        );
    }

    private static CrawlerAttemptLogAvailability unavailableLogAvailability(
        IllegalStateException exception
    ) {
        String message = exception.getMessage();
        if (message == null) {
            return null;
        }
        return switch (message) {
            case "attempt 日志不可用：missing" -> CrawlerAttemptLogAvailability.MISSING;
            case "attempt 日志不可用：expired" -> CrawlerAttemptLogAvailability.EXPIRED;
            default -> null;
        };
    }

    private static <T> List<T> safeList(List<T> values) {
        return values == null ? List.of() : List.copyOf(values);
    }

    private static String message(CrawlerQueueV2ReasonCode reason) {
        return reason == null ? null : reason.messageZh();
    }

    private static String suggestedAction(CrawlerQueueV2ReasonCode reason) {
        return reason == null ? null : reason.suggestedAction();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private long sseSessionTimeoutMillis() {
        Duration configured = properties.getSseSessionTimeout();
        Duration timeout = configured == null || configured.isNegative() || configured.isZero()
            ? Duration.ofMinutes(5)
            : configured;
        return Math.max(1L, timeout.toMillis());
    }

    private static CrawlerQueueV2Exception staleStateVersion() {
        return new CrawlerQueueV2Exception(HttpStatus.CONFLICT, CrawlerQueueV2ReasonCode.STALE_STATE_VERSION);
    }

    private static CrawlerQueueV2Exception stateStoreConflict(String message) {
        return new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
            message,
            null
        );
    }

    private static CrawlerQueueV2Exception mutationUncertain(RuntimeException cause) {
        return new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN,
            CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN.messageZh(),
            cause
        );
    }

    private static void requireEnqueue(EnqueueCommand command) {
        if (command == null || blank(command.domain()) || blank(command.actionId()) || blank(command.lane()) || blank(command.requestedBy())) {
            throw new IllegalArgumentException("V2 enqueue 请求缺少必填字段");
        }
    }

    private static void requireControl(ControlCommand command) {
        if (command == null || blank(command.queueId()) || blank(command.attemptId())
            || command.expectedStateVersion() < 1L || blank(command.controlAction()) || blank(command.operator())) {
            throw new IllegalArgumentException("V2 control 请求缺少精确身份或 stateVersion");
        }
    }

    private static void requireCleanup(CleanupCommand command) {
        if (command == null || blank(command.attemptId()) || command.expectedStateVersion() < 1L || blank(command.operator())) {
            throw new IllegalArgumentException("V2 cleanup 请求缺少 attemptId/stateVersion/operator");
        }
    }

    public record DispatchResult(
        boolean accepted,
        boolean queued,
        Integer queuePosition,
        String queueId,
        String attemptId,
        Long fenceToken,
        long stateVersion,
        CrawlerQueueV2Status status,
        CrawlerQueueV2ReasonCode reasonCode,
        String messageZh,
        String suggestedAction,
        List<String> allowedActions
    ) {
        public DispatchResult {
            allowedActions = allowedActions == null ? List.of() : List.copyOf(allowedActions);
        }
    }

    public record OverviewSnapshot(
        int queueContractVersion,
        String stateStoreEpoch,
        Instant generatedAt,
        String streamCursor,
        CrawlerQueueV2OverviewDTO.HealthDTO queueHealth,
        CrawlerQueueV2OverviewDTO.HealthDTO reconcilerHealth,
        List<CrawlerQueueV2OverviewDTO.AttemptDTO> liveQueue,
        List<CrawlerQueueV2OverviewDTO.DomainStateDTO> domainStates,
        List<CrawlerQueueV2OverviewDTO.AttemptDTO> attemptHistory,
        List<CrawlerQueueV2OverviewDTO.LegacyAttemptDTO> legacyHistory
    ) {
        public OverviewSnapshot {
            liveQueue = liveQueue == null ? List.of() : List.copyOf(liveQueue);
            domainStates = domainStates == null ? List.of() : List.copyOf(domainStates);
            attemptHistory = attemptHistory == null ? List.of() : List.copyOf(attemptHistory);
            legacyHistory = legacyHistory == null ? List.of() : List.copyOf(legacyHistory);
        }
    }

    public record EnqueueCommand(
        String domain,
        String actionId,
        String lane,
        String resumeMode,
        String requestedBy,
        String legacyQueueId
    ) {
    }

    public record ControlCommand(
        String queueId,
        String attemptId,
        long expectedStateVersion,
        String controlAction,
        String operator
    ) {
    }

    public record CleanupCommand(
        String attemptId,
        long expectedStateVersion,
        String operator
    ) {
    }
}
