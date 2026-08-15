package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.dto.CrawlerQueueV2CutoverRequestDTO;
import com.terraria.skills.dto.CrawlerQueueV2CutoverResultDTO;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import org.springframework.http.HttpStatus;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.function.Supplier;

/** Explicit-only cutover entrypoint. Runtime wiring is added with the service API. */
public final class CrawlerQueueV2CutoverService {
    public static final String CUTOVER_CONFIRMATION = "CUTOVER_CRAWLER_QUEUE_V2";
    public static final String ROLLBACK_CONFIRMATION = "ROLLBACK_CRAWLER_QUEUE_V2";
    public static final String RESET_CONFIRMATION = "RESET_CRAWLER_QUEUE_V2_EPOCH";

    private final CrawlerQueueV2Properties properties;
    private final CrawlerQueueV2Repository repository;
    private final CrawlerLegacySnapshotReader snapshotReader;
    private final CrawlerAttemptProcessLauncher launcher;
    private final CrawlerQueueV2RecoveryService recoveryService;
    private final CrawlerQueueEngineRouter router;
    private final Clock clock;
    private final Supplier<String> epochSupplier;
    private final Object operationLock = new Object();

    public CrawlerQueueV2CutoverService(CrawlerQueueV2Properties properties, CrawlerQueueV2Repository repository,
                                        CrawlerLegacySnapshotReader snapshotReader, CrawlerAttemptProcessLauncher launcher,
                                        CrawlerQueueV2RecoveryService recoveryService, CrawlerQueueEngineRouter router,
                                        Clock clock, Supplier<String> epochSupplier) {
        this.properties = Objects.requireNonNull(properties); this.repository = Objects.requireNonNull(repository);
        this.snapshotReader = Objects.requireNonNull(snapshotReader); this.launcher = Objects.requireNonNull(launcher);
        this.recoveryService = Objects.requireNonNull(recoveryService); this.router = Objects.requireNonNull(router);
        this.clock = Objects.requireNonNull(clock); this.epochSupplier = Objects.requireNonNull(epochSupplier);
    }

    public CrawlerQueueV2CutoverResultDTO cutover(CrawlerQueueV2CutoverRequestDTO request, String operator) {
        requireCutoverEnabled();
        requireCutoverConfirmation(request);
        String requestedBy = requireOperator(operator);
        synchronized (operationLock) {
            CrawlerQueueEngineRouter.CutoverState existing = router.readDurableState();
            String epoch = usableExistingEpoch(existing, request.getCutoverId());
            if (blank(epoch)) {
                epoch = requireEpoch();
            }
            router.writeState(maintenanceState(request.getCutoverId(), epoch, existing));
            CrawlerQueueV2Repository.BeginCutoverResult begun = repository.beginCutover(
                new CrawlerQueueV2Repository.BeginCutoverCommand(
                    request.getCutoverId(),
                    clock.instant(),
                    requestedBy,
                    Duration.ofMinutes(5)
                )
            );
            if (begun == null || !Objects.equals(request.getCutoverId(), begun.cutoverId())) {
                throw stateStoreReset("begin cutover 返回的 cutoverId 不一致");
            }
            if (begun.alreadyCompleted()) {
                return restoreCompletedCutover(request.getCutoverId(), existing);
            }

            CrawlerLegacySnapshotReader.LegacySnapshot snapshot = snapshotReader.snapshot(
                request.getCutoverId(), request.getGitSha(), clock.instant()
            );
            if (snapshot == null || !Objects.equals(request.getCutoverId(), snapshot.cutoverId())) {
                throw stateStoreReset("legacy snapshot 与 cutoverId 不一致");
            }
            if (!snapshot.sourceErrors().isEmpty()) {
                throw stateStoreReset("legacy snapshot source evidence 不完整，禁止激活 V2");
            }
            if (!recordedProcessesStopped(snapshot)) {
                snapshotReader.recordAborted(snapshot, CrawlerQueueV2ReasonCode.LEGACY_PROCESS_UNCONFIRMED);
                throw new CrawlerQueueV2Exception(
                    HttpStatus.CONFLICT,
                    CrawlerQueueV2ReasonCode.LEGACY_PROCESS_UNCONFIRMED
                );
            }

            CrawlerQueueV2Repository.CompleteCutoverResult completed = repository.completeCutover(
                new CrawlerQueueV2Repository.CompleteCutoverCommand(
                    request.getCutoverId(),
                    epoch,
                    snapshot.manifestPath(),
                    snapshot.manifestSha256(),
                    clock.instant(),
                    requestedBy,
                    new CrawlerQueueV2Event(
                        "cutover.completed",
                        epoch,
                        null,
                        null,
                        null,
                        null,
                        null,
                        CrawlerQueueV2ReasonCode.LEGACY_CUTOVER,
                        clock.instant()
                    )
                )
            );
            if (completed == null || !Objects.equals(request.getCutoverId(), completed.cutoverId())
                || !Objects.equals(epoch, completed.stateStoreEpoch())) {
                throw stateStoreReset("complete cutover 返回的 epoch 或 cutoverId 不一致");
            }
            router.writeState(new CrawlerQueueEngineRouter.CutoverState(
                2,
                CrawlerQueueEngineMode.V2,
                request.getCutoverId(),
                epoch,
                clock.instant(),
                null,
                null
            ));
            return result(
                request.getCutoverId(),
                null,
                CrawlerQueueEngineMode.V2,
                epoch,
                snapshot.manifestPath(),
                snapshot.queueItems().size(),
                snapshot.nonTerminalItems().size(),
                snapshot.recordedProcesses().size(),
                false,
                router.rollbackPermitted(),
                null,
                completed.streamCursor()
            );
        }
    }

    public CrawlerQueueV2CutoverResultDTO rollback(String cutoverId, String confirmation, String operator) {
        requireCutoverEnabled();
        requireRollbackConfirmation(cutoverId, confirmation);
        String requestedBy = requireOperator(operator);
        synchronized (operationLock) {
            CrawlerQueueEngineRouter.CutoverState durable = router.readDurableState();
            CrawlerQueueV2Repository.EngineState engine = repository.readEngineState();
            if (!rollbackAllowed(durable, engine, cutoverId)) {
                throw new CrawlerQueueV2Exception(HttpStatus.CONFLICT, CrawlerQueueV2ReasonCode.CUTOVER_ROLLBACK_FORBIDDEN);
            }
            String epoch = durable.stateStoreEpoch();
            router.writeState(maintenanceState(cutoverId, epoch, durable));
            CrawlerQueueV2Repository.RollbackCutoverResult rollback = repository.rollbackCutover(
                new CrawlerQueueV2Repository.RollbackCutoverCommand(cutoverId, clock.instant(), requestedBy)
            );
            if (rollback == null || !rollback.rolledBack() || !Objects.equals(cutoverId, rollback.cutoverId())) {
                throw stateStoreReset("rollback cutover 未返回确认结果");
            }
            router.completeRollback(cutoverId);
            return result(cutoverId, null, CrawlerQueueEngineMode.V1, null, null, 0, 0, 0,
                false, true, null, null);
        }
    }

    public CrawlerQueueV2CutoverResultDTO recoverStateStoreReset(
        CrawlerQueueV2CutoverRequestDTO request,
        String operator
    ) {
        requireCutoverEnabled();
        requireResetConfirmation(request);
        String requestedBy = requireOperator(operator);
        synchronized (operationLock) {
            CrawlerQueueEngineRouter.CutoverState durable = router.readDurableState();
            if (durable == null || durable.mode() == CrawlerQueueEngineMode.V1 || blank(durable.cutoverId())
                || !Objects.equals(durable.cutoverId(), request.getCutoverId())) {
                throw stateStoreReset("缺少可恢复的 durable V2 cutover marker");
            }
            router.writeState(maintenanceState(durable.cutoverId(), durable.stateStoreEpoch(), durable));
            CrawlerQueueV2Repository.EngineState observed = repository.readEngineState();
            if (healthySameStateStore(durable, observed)) {
                router.writeState(new CrawlerQueueEngineRouter.CutoverState(
                    2,
                    CrawlerQueueEngineMode.V2,
                    durable.cutoverId(),
                    durable.stateStoreEpoch(),
                    clock.instant(),
                    durable.mutationReservationAt(),
                    durable.firstLiveMutationAt()
                ));
                throw stateStoreReset("当前 V2 epoch 健康，无需 reset");
            }
            String observedEpoch = observed == null ? null : observed.stateStoreEpoch();
            CrawlerQueueV2RecoveryService.ResetPreparation preparation = recoveryService.prepareStateStoreReset(observedEpoch);
            if (preparation == null) {
                throw stateStoreReset("state store reset 准备结果为空");
            }
            String newEpoch = requireEpoch();
            Instant irreversibleAt = durable.firstLiveMutationAt() != null
                ? durable.firstLiveMutationAt()
                : durable.mutationReservationAt();
            CrawlerQueueV2Repository.InitializeResetEpochResult reset = repository.initializeResetEpoch(
                new CrawlerQueueV2Repository.InitializeResetEpochCommand(
                    request.getResetId(),
                    durable.cutoverId(),
                    observedEpoch,
                    newEpoch,
                    irreversibleAt,
                    clock.instant(),
                    requestedBy,
                    new CrawlerQueueV2Event(
                        "state-store.reset",
                        newEpoch,
                        null,
                        null,
                        null,
                        null,
                        null,
                        CrawlerQueueV2ReasonCode.STATE_STORE_RESET,
                        clock.instant()
                    )
                )
            );
            if (reset == null || !Objects.equals(request.getResetId(), reset.resetId())
                || blank(reset.stateStoreEpoch())) {
                throw stateStoreReset("state store reset 返回的 resetId 或 epoch 不一致");
            }
            String completedEpoch = reset.stateStoreEpoch();
            for (CrawlerQueueV2RecoveryService.ResetIsolation isolation : preparation.isolations()) {
                repository.writeQuarantine(new CrawlerQueueV2Repository.QuarantineCommand(
                    completedEpoch,
                    isolation.domain(),
                    isolation.queueId(),
                    isolation.attemptId(),
                    isolation.fenceToken(),
                    isolation.expiresAt(),
                    CrawlerQueueV2ReasonCode.ORPHAN_PROCESS_UNCONFIRMED
                ));
            }
            router.completeStateStoreReset(completedEpoch, reset.firstLiveMutationAt());
            CrawlerQueueEngineRouter.CutoverState completed = router.readDurableState();
            return result(
                durable.cutoverId(),
                reset.resetId(),
                completed.mode(),
                completedEpoch,
                null,
                0,
                0,
                0,
                true,
                completed.mutationReservationAt() == null && completed.firstLiveMutationAt() == null,
                completed.firstLiveMutationAt(),
                reset.streamCursor()
            );
        }
    }

    public static void requireCutoverConfirmation(CrawlerQueueV2CutoverRequestDTO request) {
        if (request == null || !CUTOVER_CONFIRMATION.equals(request.getConfirmation())
            || blank(request.getCutoverId()) || blank(request.getGitSha())) {
            throw new CrawlerQueueV2Exception(HttpStatus.FORBIDDEN, CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED,
                "必须提供明确的 V2 切换确认、cutoverId 和 Git SHA", null);
        }
    }

    private CrawlerQueueV2CutoverResultDTO restoreCompletedCutover(
        String cutoverId,
        CrawlerQueueEngineRouter.CutoverState durable
    ) {
        CrawlerQueueV2Repository.CutoverRecord record = repository.readCutover(cutoverId)
            .orElseThrow(() -> stateStoreReset("completed cutover 缺少记录"));
        if (!"completed".equals(record.status()) || blank(record.stateStoreEpoch())) {
            throw stateStoreReset("completed cutover 记录不完整");
        }
        Instant reservation = durable == null ? null : durable.mutationReservationAt();
        Instant firstMutation = durable == null ? null : durable.firstLiveMutationAt();
        router.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            cutoverId,
            record.stateStoreEpoch(),
            clock.instant(),
            reservation,
            firstMutation
        ));
        return result(cutoverId, null, CrawlerQueueEngineMode.V2, record.stateStoreEpoch(), record.manifestPath(),
            0, 0, 0, false, router.rollbackPermitted(), firstMutation, null);
    }

    private boolean recordedProcessesStopped(CrawlerLegacySnapshotReader.LegacySnapshot snapshot) {
        for (CrawlerLegacySnapshotReader.RecordedProcess recorded : snapshot.recordedProcesses()) {
            if (recorded == null || recorded.pid() < 1L || recorded.processStartedAt() == null) {
                return false;
            }
            CrawlerAttemptProcessLauncher.ProcessLookup lookup = launcher.findExact(
                new CrawlerAttemptProcessLauncher.ProcessIdentity(recorded.pid(), recorded.processStartedAt())
            );
            if (lookup == null || lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.INSPECTION_UNAVAILABLE) {
                return false;
            }
            if (lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND
                || lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.START_TIME_MISMATCH) {
                continue;
            }
            CrawlerAttemptProcessLauncher.ManagedProcess process = lookup.process();
            if (process == null) {
                return false;
            }
            launcher.terminateGracefully(process);
            if (launcher.awaitExit(process, Duration.ofSeconds(15))) {
                continue;
            }
            launcher.terminateForcibly(process);
            if (!launcher.awaitExit(process, Duration.ofSeconds(5))) {
                return false;
            }
        }
        return true;
    }

    private boolean rollbackAllowed(
        CrawlerQueueEngineRouter.CutoverState durable,
        CrawlerQueueV2Repository.EngineState engine,
        String cutoverId
    ) {
        return durable != null
            && Objects.equals(cutoverId, durable.cutoverId())
            && durable.mutationReservationAt() == null
            && durable.firstLiveMutationAt() == null
            && engine != null
            && engine.mode() == CrawlerQueueEngineMode.V2
            && Objects.equals(cutoverId, engine.activeCutoverId())
            && blank(engine.firstLiveMutationAt());
    }

    private boolean healthySameStateStore(
        CrawlerQueueEngineRouter.CutoverState durable,
        CrawlerQueueV2Repository.EngineState observed
    ) {
        return observed != null
            && observed.mode() == CrawlerQueueEngineMode.V2
            && Objects.equals(durable.cutoverId(), observed.activeCutoverId())
            && Objects.equals(durable.stateStoreEpoch(), observed.stateStoreEpoch())
            && Objects.equals(
                durable.firstLiveMutationAt() == null ? null : durable.firstLiveMutationAt().toString(),
                observed.firstLiveMutationAt()
            );
    }

    private CrawlerQueueEngineRouter.CutoverState maintenanceState(
        String cutoverId,
        String epoch,
        CrawlerQueueEngineRouter.CutoverState previous
    ) {
        return new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.MAINTENANCE,
            cutoverId,
            epoch,
            clock.instant(),
            previous == null ? null : previous.mutationReservationAt(),
            previous == null ? null : previous.firstLiveMutationAt()
        );
    }

    private CrawlerQueueV2CutoverResultDTO result(
        String cutoverId,
        String resetId,
        CrawlerQueueEngineMode mode,
        String epoch,
        String manifestPath,
        int v1QueueItems,
        int v1NonTerminalItems,
        int v1RecordedProcesses,
        boolean stateStoreReset,
        boolean rollbackAllowed,
        Instant firstLiveMutationAt,
        String streamCursor
    ) {
        CrawlerQueueV2CutoverResultDTO result = new CrawlerQueueV2CutoverResultDTO();
        result.setCutoverId(cutoverId);
        result.setResetId(resetId);
        result.setEngineMode(mode.value());
        result.setStateStoreEpoch(epoch);
        result.setManifestPath(manifestPath);
        result.setV1QueueItemCount(v1QueueItems);
        result.setV1NonTerminalCount(v1NonTerminalItems);
        result.setV1RecordedProcessCount(v1RecordedProcesses);
        result.setV2LiveAttemptCount(0);
        result.setStateStoreReset(stateStoreReset);
        result.setRollbackAllowed(rollbackAllowed);
        result.setFirstLiveMutationAt(firstLiveMutationAt == null ? null : firstLiveMutationAt.toString());
        result.setStreamCursor(streamCursor);
        return result;
    }

    private void requireCutoverEnabled() {
        if (!properties.isCutoverAllowed()) {
            throw new CrawlerQueueV2Exception(HttpStatus.FORBIDDEN, CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED);
        }
    }

    private void requireRollbackConfirmation(String cutoverId, String confirmation) {
        if (blank(cutoverId) || !ROLLBACK_CONFIRMATION.equals(confirmation)) {
            throw new CrawlerQueueV2Exception(HttpStatus.FORBIDDEN, CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED,
                "必须提供明确的 V2 回滚确认和 cutoverId", null);
        }
    }

    private void requireResetConfirmation(CrawlerQueueV2CutoverRequestDTO request) {
        if (request == null || !RESET_CONFIRMATION.equals(request.getConfirmation())
            || blank(request.getCutoverId()) || blank(request.getResetId())) {
            throw new CrawlerQueueV2Exception(HttpStatus.FORBIDDEN, CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED,
                "必须提供明确的 V2 epoch reset 确认、cutoverId 和 resetId", null);
        }
    }

    private String requireEpoch() {
        String epoch = epochSupplier.get();
        if (blank(epoch)) {
            throw stateStoreReset("无法生成新的 V2 epoch");
        }
        return epoch;
    }

    private String usableExistingEpoch(CrawlerQueueEngineRouter.CutoverState state, String cutoverId) {
        if (state == null || state.mode() == CrawlerQueueEngineMode.V1) {
            return null;
        }
        if (!Objects.equals(cutoverId, state.cutoverId())) {
            throw stateStoreReset("已有 cutover 与请求 cutoverId 不一致");
        }
        return state.stateStoreEpoch();
    }

    private String requireOperator(String operator) {
        if (blank(operator)) {
            throw new CrawlerQueueV2Exception(HttpStatus.FORBIDDEN, CrawlerQueueV2ReasonCode.CUTOVER_NOT_ENABLED,
                "管理员身份缺少用户名", null);
        }
        return operator;
    }

    private CrawlerQueueV2Exception stateStoreReset(String message) {
        return new CrawlerQueueV2Exception(HttpStatus.CONFLICT, CrawlerQueueV2ReasonCode.STATE_STORE_RESET, message, null);
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
