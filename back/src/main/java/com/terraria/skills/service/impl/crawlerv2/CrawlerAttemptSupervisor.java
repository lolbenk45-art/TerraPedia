package com.terraria.skills.service.impl.crawlerv2;

import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.service.impl.CrawlerMonitorActionDefinition;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

public class CrawlerAttemptSupervisor {

    private final CrawlerQueueV2Repository repository;
    private final CrawlerAttemptArtifactStore artifactStore;
    private final CrawlerMonitorActionRegistry actionRegistry;
    private final CrawlerAttemptProcessLauncher launcher;
    private final CrawlerAttemptStateMachine stateMachine;
    private final CrawlerQueueV2Properties properties;
    private final Path repoRoot;
    private final Clock clock;
    private final CrawlerQueueEngineRouter router;
    private final Map<String, CrawlerAttemptProcessLauncher.ManagedProcess> processes =
        new ConcurrentHashMap<>();
    private final Map<String, LockEntry> attemptLocks = new ConcurrentHashMap<>();

    public CrawlerAttemptSupervisor(
        CrawlerQueueV2Repository repository,
        CrawlerAttemptArtifactStore artifactStore,
        CrawlerMonitorActionRegistry actionRegistry,
        CrawlerAttemptProcessLauncher launcher,
        CrawlerAttemptStateMachine stateMachine,
        CrawlerQueueV2Properties properties,
        Path repoRoot,
        Clock clock,
        CrawlerQueueEngineRouter router
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.artifactStore = Objects.requireNonNull(artifactStore, "artifactStore");
        this.actionRegistry = Objects.requireNonNull(actionRegistry, "actionRegistry");
        this.launcher = Objects.requireNonNull(launcher, "launcher");
        this.stateMachine = Objects.requireNonNull(stateMachine, "stateMachine");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.repoRoot = Objects.requireNonNull(repoRoot, "repoRoot").toAbsolutePath().normalize();
        this.clock = Objects.requireNonNull(clock, "clock");
        this.router = Objects.requireNonNull(router, "router");
    }

    public CrawlerQueueV2Attempt start(CrawlerQueueV2Attempt attempt) {
        requireAttempt(attempt);
        return withAttemptLock(attempt.attemptId(), () -> startSerialized(attempt));
    }

    private CrawlerQueueV2Attempt startSerialized(CrawlerQueueV2Attempt attempt) {
            CrawlerQueueV2Attempt current = requireCurrentSnapshot(
                attempt,
                CrawlerQueueV2Status.STARTING
            );
            if (current.pid() != null || current.processStartedAt() != null) {
                throw new IllegalStateException("STARTING attempt 已记录进程身份：" + current.attemptId());
            }
            CrawlerMonitorActionDefinition definition = actionRegistry.require(
                current.domain(),
                current.actionId()
            );
            requireExactManifest(current);
            resolveAttemptPath(current, current.artifacts().progressPath());
            Path logPath = resolveAttemptPath(current, current.artifacts().logPath());
            List<String> command = new ArrayList<>(definition.renderCommand(
                current.artifacts().reportPath(),
                current.artifacts().progressPath()
            ));
            Map<String, String> environment = launchEnvironment(current);
            CrawlerAttemptProcessLauncher.ManagedProcess process;
            try {
                process = launcher.launch(new CrawlerAttemptProcessLauncher.LaunchSpec(
                    command,
                    repoRoot,
                    environment,
                    logPath
                ));
            } catch (CrawlerAttemptProcessLauncher.LaunchFailureException exception) {
                compensatePreReturnLaunchFailure(current, exception);
                throw new IllegalStateException(
                    "启动 crawler attempt 进程失败：" + current.attemptId(),
                    exception
                );
            } catch (IOException exception) {
                throw new IllegalStateException(
                    "启动 crawler attempt 进程失败：" + current.attemptId(),
                    exception
                );
            }
            if (process.startedAt() == null || process.pid() < 1L) {
                cleanupStoppedLaunch(process, current.attemptId(), null);
                throw new IllegalStateException("crawler attempt 进程缺少精确身份：" + current.attemptId());
            }
            LaunchIdentity launchIdentity = new LaunchIdentity(
                current.stateStoreEpoch(),
                current.queueId(),
                current.attemptId(),
                current.fenceToken(),
                process.pid(),
                process.startedAt()
            );
            CrawlerQueueV2Attempt recorded;
            try {
                recorded = mutate(
                    current,
                    CrawlerQueueV2Status.STARTING,
                    null,
                    current.deadlineAt(),
                    current.lastHeartbeatAt(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    process.pid(),
                    process.startedAt(),
                    false,
                    null,
                    "attempt.process-started"
                );
            } catch (RuntimeException exception) {
                cleanupStoppedLaunch(process, current.attemptId(), exception);
                throw exception;
            }
            try {
                CrawlerAttemptProcessLauncher.ManagedProcess prior = processes.putIfAbsent(
                    current.attemptId(),
                    process
                );
                if (prior != null) {
                    throw new IllegalStateException("attemptId 已注册另一个 managed process");
                }
                writeManifest(recorded, null);
                process.handle().onExit().whenComplete((ignored, watcherFailure) ->
                    watchProcessExit(launchIdentity, process, watcherFailure)
                );
                if (!launcher.resume(process)) {
                    throw new IllegalStateException(
                        "启动已登记 crawler process 失败：" + current.attemptId()
                    );
                }
                return recorded;
            } catch (RuntimeException exception) {
                processes.remove(current.attemptId(), process);
                compensatePostCasLaunchFailure(recorded, process, exception);
                throw exception;
            }
    }

    public ProgressResult ingestProgress(CrawlerQueueV2Attempt attempt) {
        requireAttempt(attempt);
        CrawlerQueueV2Attempt current = loadCurrentAttempt(attempt.attemptId());
        Optional<CrawlerAttemptProgressPayload> progress;
        try {
            progress = artifactStore.readProgress(current.attemptId());
        } catch (CrawlerAttemptArtifactStore.InvalidProgressPayloadException exception) {
            return new ProgressResult(ProgressCode.INVALID_PAYLOAD, current);
        }
        if (progress.isEmpty()) {
            return new ProgressResult(ProgressCode.NO_PROGRESS, current);
        }
        CrawlerAttemptProgressPayload payload = progress.orElseThrow();
        if (!validPayload(payload)) {
            return new ProgressResult(ProgressCode.INVALID_PAYLOAD, current);
        }
        if (!progressIdentityMatches(current, payload)) {
            appendStaleProgressEvent(current);
            return new ProgressResult(ProgressCode.REJECTED_STALE_IDENTITY, current);
        }
        if (payload.progressSequence() <= current.progressSequence()) {
            return new ProgressResult(ProgressCode.REJECTED_SEQUENCE, current);
        }
        boolean runningHeartbeat = "running".equalsIgnoreCase(payload.status());
        if (!runningHeartbeat) {
            return new ProgressResult(ProgressCode.INVALID_PAYLOAD, current);
        }
        if (current.status() != CrawlerQueueV2Status.STARTING
            && current.status() != CrawlerQueueV2Status.RUNNING
            && current.status() != CrawlerQueueV2Status.PAUSED) {
            return new ProgressResult(ProgressCode.INVALID_PAYLOAD, current);
        }

        CrawlerQueueV2Attempt updated;
        try {
            updated = mutateProgress(current, payload);
        } catch (CrawlerQueueV2Exception exception) {
            if (exception.reasonCode() != CrawlerQueueV2ReasonCode.STALE_STATE_VERSION) {
                throw exception;
            }
            CrawlerQueueV2Attempt reloaded = loadCurrentAttempt(current.attemptId());
            if (!progressIdentityMatches(reloaded, payload)) {
                appendStaleProgressEvent(reloaded);
                return new ProgressResult(ProgressCode.REJECTED_STALE_IDENTITY, reloaded);
            }
            if (payload.progressSequence() <= reloaded.progressSequence()) {
                return new ProgressResult(ProgressCode.REJECTED_SEQUENCE, reloaded);
            }
            if (!progressStatusAcceptsHeartbeat(reloaded)) {
                return new ProgressResult(ProgressCode.INVALID_PAYLOAD, reloaded);
            }
            try {
                updated = mutateProgress(reloaded, payload);
            } catch (CrawlerQueueV2Exception retryFailure) {
                if (retryFailure.reasonCode() != CrawlerQueueV2ReasonCode.STALE_STATE_VERSION) {
                    throw retryFailure;
                }
                CrawlerQueueV2Attempt retryCurrent = loadCurrentAttempt(reloaded.attemptId());
                if (!progressIdentityMatches(retryCurrent, payload)) {
                    appendStaleProgressEvent(retryCurrent);
                    return new ProgressResult(ProgressCode.REJECTED_STALE_IDENTITY, retryCurrent);
                }
                if (payload.progressSequence() <= retryCurrent.progressSequence()) {
                    return new ProgressResult(ProgressCode.REJECTED_SEQUENCE, retryCurrent);
                }
                if (!progressStatusAcceptsHeartbeat(retryCurrent)) {
                    return new ProgressResult(ProgressCode.INVALID_PAYLOAD, retryCurrent);
                }
                return new ProgressResult(ProgressCode.RETRY_REQUIRED, retryCurrent);
            }
        }
        writeManifest(updated, null);
        return new ProgressResult(ProgressCode.ACCEPTED, updated);
    }

    private CrawlerQueueV2Attempt mutateProgress(
        CrawlerQueueV2Attempt current,
        CrawlerAttemptProgressPayload payload
    ) {
        CrawlerQueueV2Status targetStatus = canonicalProgressStatus(current, payload);
        Instant deadline = stateMachine.deadlineFor(
            targetStatus,
            clock.instant(),
            payload.lastHeartbeatAt(),
            current.eligibleAt()
        );
        String eventType = targetStatus == current.status()
            ? "attempt.heartbeat"
            : "attempt.transitioned";
        return mutate(
            current,
            targetStatus,
            null,
            deadline,
            payload.lastHeartbeatAt(),
            payload.progressSequence(),
            payload.phase(),
            payload.current(),
            payload.total(),
            payload.message(),
            null,
            null,
            false,
            null,
            eventType
        );
    }

    private boolean progressStatusAcceptsHeartbeat(CrawlerQueueV2Attempt attempt) {
        return attempt.status() == CrawlerQueueV2Status.STARTING
            || attempt.status() == CrawlerQueueV2Status.RUNNING
            || attempt.status() == CrawlerQueueV2Status.PAUSED;
    }

    public CrawlerQueueV2Attempt pause(CrawlerQueueV2Attempt attempt) {
        requireAttempt(attempt);
        return withAttemptLock(attempt.attemptId(), () -> pauseSerialized(attempt));
    }

    private CrawlerQueueV2Attempt pauseSerialized(CrawlerQueueV2Attempt attempt) {
        CrawlerQueueV2Attempt current = requireCurrentSnapshot(attempt, CrawlerQueueV2Status.RUNNING);
        stateMachine.requireValidTransition(current.status(), CrawlerQueueV2Status.PAUSE_REQUESTED);
        Instant enteredAt = clock.instant();
        CrawlerQueueV2Attempt requested = mutate(
            current,
            CrawlerQueueV2Status.PAUSE_REQUESTED,
            null,
            stateMachine.deadlineFor(
                CrawlerQueueV2Status.PAUSE_REQUESTED,
                enteredAt,
                current.lastHeartbeatAt(),
                current.eligibleAt()
            ),
            current.lastHeartbeatAt(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            false,
            null,
            "attempt.transitioned"
        );
        CrawlerQueueV2Attempt signalAuthority = requireCurrentSnapshot(
            requested,
            CrawlerQueueV2Status.PAUSE_REQUESTED
        );
        CrawlerAttemptProcessLauncher.ProcessLookup lookup = resolveExactProcess(signalAuthority);
        CrawlerQueueV2Attempt stopAuthority = requireCurrentSnapshot(
            signalAuthority,
            CrawlerQueueV2Status.PAUSE_REQUESTED
        );
        if (lookup.code() != CrawlerAttemptProcessLauncher.LookupCode.FOUND
            || !launcher.pause(lookup.process())) {
            return stopAuthority;
        }
        boolean pausedAcknowledged = launcher.isPaused(lookup.process());
        CrawlerQueueV2Attempt pauseAuthority;
        try {
            pauseAuthority = requireCurrentSnapshot(
                stopAuthority,
                CrawlerQueueV2Status.PAUSE_REQUESTED
            );
        } catch (RuntimeException staleAuthority) {
            if (pausedAcknowledged && !launcher.resume(lookup.process())) {
                IllegalStateException compensationFailure = new IllegalStateException(
                    "暂停 authority 失效后恢复 exact crawler process 失败：" + attempt.attemptId()
                );
                compensationFailure.addSuppressed(staleAuthority);
                throw compensationFailure;
            }
            throw staleAuthority;
        }
        if (!pausedAcknowledged) {
            return pauseAuthority;
        }
        Instant pausedAt = clock.instant();
        CrawlerQueueV2Attempt paused = mutate(
            pauseAuthority,
            CrawlerQueueV2Status.PAUSED,
            null,
            stateMachine.deadlineFor(
                CrawlerQueueV2Status.PAUSED,
                pausedAt,
                pauseAuthority.lastHeartbeatAt(),
                pauseAuthority.eligibleAt()
            ),
            pauseAuthority.lastHeartbeatAt(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            false,
            null,
            "attempt.transitioned"
        );
        writeManifest(paused, null);
        return paused;
    }

    public CrawlerQueueV2Attempt resume(CrawlerQueueV2Attempt attempt) {
        requireAttempt(attempt);
        return withAttemptLock(attempt.attemptId(), () -> resumeSerialized(attempt));
    }

    private CrawlerQueueV2Attempt resumeSerialized(CrawlerQueueV2Attempt attempt) {
        CrawlerQueueV2Attempt current = requireCurrentSnapshot(attempt, CrawlerQueueV2Status.PAUSED);
        CrawlerAttemptProcessLauncher.ProcessLookup lookup = resolveExactProcess(current);
        CrawlerQueueV2Attempt signalAuthority = requireCurrentSnapshot(
            current,
            CrawlerQueueV2Status.PAUSED
        );
        if (lookup.code() != CrawlerAttemptProcessLauncher.LookupCode.FOUND) {
            throw new IllegalStateException(
                "无法恢复 exact crawler process：" + current.attemptId() + "，lookup=" + lookup.code()
            );
        }
        if (!launcher.resume(lookup.process())) {
            throw new IllegalStateException("恢复 exact crawler process 失败：" + current.attemptId());
        }
        CrawlerQueueV2Attempt currentAuthority = loadCurrentAttempt(current.attemptId());
        if (!sameSnapshotIdentity(signalAuthority, currentAuthority)
            || !Objects.equals(signalAuthority.pid(), currentAuthority.pid())
            || !Objects.equals(signalAuthority.processStartedAt(), currentAuthority.processStartedAt())) {
            throw new IllegalStateException("恢复后 crawler attempt authority 已漂移：" + current.attemptId());
        }
        return currentAuthority;
    }

    public CrawlerQueueV2Attempt cancel(CrawlerQueueV2Attempt attempt) {
        requireAttempt(attempt);
        return withAttemptLock(attempt.attemptId(), () -> cancelSerialized(attempt));
    }

    private CrawlerQueueV2Attempt cancelSerialized(CrawlerQueueV2Attempt attempt) {
        CrawlerQueueV2Attempt current = requireCurrentSnapshot(
            attempt,
            CrawlerQueueV2Status.CANCEL_REQUESTED
        );
        CrawlerAttemptProcessLauncher.ProcessLookup lookup = resolveExactProcess(current);
        if (lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND
            || lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.START_TIME_MISMATCH) {
            return transitionCancelled(current);
        }
        if (lookup.code() != CrawlerAttemptProcessLauncher.LookupCode.FOUND) {
            return transitionTerminationUnconfirmed(current);
        }
        CrawlerQueueV2Attempt terminationAuthority = requireCurrentSnapshot(
            current,
            CrawlerQueueV2Status.CANCEL_REQUESTED
        );
        CrawlerAttemptProcessLauncher.ManagedProcess process = lookup.process();
        if (launcher.isPaused(process) && !launcher.resume(process)) {
            return transitionTerminationUnconfirmed(terminationAuthority);
        }
        launcher.terminateGracefully(process);
        if (launcher.awaitExit(process, properties.getGracefulTerminationWait())) {
            return transitionCancelled(terminationAuthority);
        }
        launcher.terminateForcibly(process);
        if (launcher.awaitExit(process, properties.getForcedTerminationWait())) {
            return transitionCancelled(terminationAuthority);
        }
        return transitionTerminationUnconfirmed(terminationAuthority);
    }

    int serializerEntryCount() {
        return attemptLocks.size();
    }

    int managedProcessCount() {
        return processes.size();
    }

    private <T> T withAttemptLock(String attemptId, Supplier<T> action) {
        LockEntry entry = attemptLocks.compute(attemptId, (ignored, existing) -> {
            LockEntry current = existing == null ? new LockEntry() : existing;
            current.references++;
            return current;
        });
        entry.lock.lock();
        try {
            return action.get();
        } finally {
            entry.lock.unlock();
            attemptLocks.compute(attemptId, (ignored, current) -> {
                if (current != entry) {
                    return current;
                }
                entry.references--;
                return entry.references == 0 ? null : entry;
            });
        }
    }

    public TerminationResult terminateRecorded(CrawlerAttemptManifest manifest) {
        Objects.requireNonNull(manifest, "manifest");
        Optional<CrawlerQueueV2Attempt> recorded = repository.findAttempt(manifest.attemptId());
        CrawlerAttemptProcessLauncher.ProcessIdentity identity;
        if (recorded.isPresent()) {
            CrawlerQueueV2Attempt attempt = recorded.orElseThrow();
            if (!Objects.equals(manifest.stateStoreEpoch(), attempt.stateStoreEpoch())
                || !Objects.equals(manifest.queueId(), attempt.queueId())
                || !Objects.equals(manifest.fenceToken(), attempt.fenceToken())) {
                return TerminationResult.unconfirmed();
            }
            if (attempt.pid() != null && attempt.processStartedAt() != null) {
                if (manifest.pid() != null
                    && (!Objects.equals(manifest.pid(), attempt.pid())
                        || !Objects.equals(manifest.processStartedAt(), attempt.processStartedAt()))) {
                    return TerminationResult.unconfirmed();
                }
                identity = new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    attempt.pid(),
                    attempt.processStartedAt()
                );
            } else {
                identity = manifestIdentity(manifest).orElse(null);
            }
        } else {
            identity = manifestIdentity(manifest).orElse(null);
        }
        if (identity == null) {
            return TerminationResult.unconfirmed();
        }
        CrawlerAttemptProcessLauncher.ProcessLookup lookup = launcher.findExact(identity);
        if (lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND
            || lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.START_TIME_MISMATCH) {
            return TerminationResult.confirmed();
        }
        if (lookup.code() != CrawlerAttemptProcessLauncher.LookupCode.FOUND) {
            return TerminationResult.unconfirmed();
        }
        CrawlerAttemptProcessLauncher.ManagedProcess process = lookup.process();
        launcher.terminateGracefully(process);
        if (launcher.awaitExit(process, properties.getGracefulTerminationWait())) {
            return TerminationResult.confirmed();
        }
        launcher.terminateForcibly(process);
        return launcher.awaitExit(process, properties.getForcedTerminationWait())
            ? TerminationResult.confirmed()
            : TerminationResult.unconfirmed();
    }

    private Optional<CrawlerAttemptProcessLauncher.ProcessIdentity> manifestIdentity(
        CrawlerAttemptManifest manifest
    ) {
        if (manifest.pid() == null || manifest.processStartedAt() == null) {
            return Optional.empty();
        }
        return Optional.of(new CrawlerAttemptProcessLauncher.ProcessIdentity(
            manifest.pid(),
            manifest.processStartedAt()
        ));
    }

    private CrawlerQueueV2Status canonicalProgressStatus(
        CrawlerQueueV2Attempt attempt,
        CrawlerAttemptProgressPayload payload
    ) {
        boolean runningHeartbeat = "running".equalsIgnoreCase(payload.status());
        if ((attempt.status() == CrawlerQueueV2Status.STARTING
            || attempt.status() == CrawlerQueueV2Status.PAUSED)
            && runningHeartbeat) {
            stateMachine.requireValidTransition(attempt.status(), CrawlerQueueV2Status.RUNNING);
            return CrawlerQueueV2Status.RUNNING;
        }
        if (attempt.status() == CrawlerQueueV2Status.RUNNING) {
            return CrawlerQueueV2Status.RUNNING;
        }
        return attempt.status();
    }

    private boolean validPayload(CrawlerAttemptProgressPayload payload) {
        return payload.queueId() != null
            && !payload.queueId().isBlank()
            && payload.attemptId() != null
            && !payload.attemptId().isBlank()
            && payload.fenceToken() != null
            && payload.fenceToken() > 0L
            && payload.stateStoreEpoch() != null
            && !payload.stateStoreEpoch().isBlank()
            && payload.progressSequence() != null
            && payload.progressSequence() > 0L
            && payload.status() != null
            && !payload.status().isBlank()
            && payload.generatedAt() != null
            && payload.lastHeartbeatAt() != null
            && (payload.current() == null || payload.current() >= 0L)
            && (payload.total() == null || payload.total() >= 0L)
            && (payload.current() == null || payload.total() == null || payload.current() <= payload.total());
    }

    private CrawlerQueueV2Attempt transitionCancelled(CrawlerQueueV2Attempt attempt) {
        CrawlerQueueV2Attempt cancelled = mutate(
            attempt,
            CrawlerQueueV2Status.CANCELLED,
            null,
            null,
            attempt.lastHeartbeatAt(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            true,
            null,
            "attempt.transitioned"
        );
        processes.remove(attempt.attemptId());
        writeManifest(cancelled, null);
        return cancelled;
    }

    private CrawlerQueueV2Attempt transitionTerminationUnconfirmed(CrawlerQueueV2Attempt attempt) {
        CrawlerQueueV2Attempt failed = mutate(
            attempt,
            CrawlerQueueV2Status.FAILED,
            CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
            null,
            attempt.lastHeartbeatAt(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            false,
            properties.getUnconfirmedProcessIsolation(),
            "attempt.transitioned"
        );
        writeManifest(failed, null);
        return failed;
    }

    private void watchProcessExit(
        LaunchIdentity identity,
        CrawlerAttemptProcessLauncher.ManagedProcess process,
        Throwable watcherFailure
    ) {
        try {
            router.withMutationPermit(permit -> {
                permit.requireMode(CrawlerQueueEngineMode.V2);
                try {
                    if (watcherFailure != null) {
                        throw new IllegalStateException("crawler process watcher 异常", watcherFailure);
                    }
                    withAttemptLock(identity.attemptId(), () -> {
                        handleProcessExit(identity, process);
                        return null;
                    });
                } catch (RuntimeException exception) {
                    appendWatcherFailureEvent(identity);
                }
                return null;
            });
        } catch (RuntimeException exception) {
            // A denied or failed durable admission must leave no terminal/event side effect.
        } finally {
            processes.remove(identity.attemptId(), process);
        }
    }

    private void handleProcessExit(
        LaunchIdentity identity,
        CrawlerAttemptProcessLauncher.ManagedProcess process
    ) {
        Optional<CrawlerQueueV2Attempt> latest = repository.findAttempt(identity.attemptId());
        if (latest.isEmpty()) {
            return;
        }
        CrawlerQueueV2Attempt attempt = latest.orElseThrow();
        if (!identity.matches(attempt)) {
            return;
        }
        if (attempt.status().terminal() || attempt.status() == CrawlerQueueV2Status.CANCEL_REQUESTED) {
            return;
        }
        if (!terminateFailedLaunch(process)) {
            transitionTerminationUnconfirmed(attempt);
            return;
        }
        int exitCode = process.exitValue();
        CrawlerQueueV2Status target = exitCode == 0
            ? CrawlerQueueV2Status.COMPLETED
            : CrawlerQueueV2Status.FAILED;
        if (!stateMachine.canTransition(attempt.status(), target)) {
            return;
        }
        CrawlerQueueV2Attempt terminal = mutate(
            attempt,
            target,
            exitCode == 0 ? null : CrawlerQueueV2ReasonCode.PROCESS_EXIT_NONZERO,
            null,
            attempt.lastHeartbeatAt(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            true,
            null,
            "attempt.transitioned"
        );
        writeManifest(terminal, exitCode);
    }

    private void appendWatcherFailureEvent(LaunchIdentity identity) {
        try {
            repository.findAttempt(identity.attemptId())
                .filter(identity::matches)
                .ifPresent(attempt -> repository.appendEvent(new CrawlerQueueV2Event(
                    "attempt.watcher-failed",
                    attempt.stateStoreEpoch(),
                    attempt.queueId(),
                    attempt.attemptId(),
                    attempt.fenceToken(),
                    attempt.stateVersion(),
                    attempt.status(),
                    CrawlerQueueV2ReasonCode.RECONCILER_STALE,
                    clock.instant()
                )));
        } catch (RuntimeException ignored) {
            // Bounded best-effort evidence; the reconciler remains the durable recovery path.
        }
    }

    private CrawlerAttemptProcessLauncher.ProcessLookup resolveExactProcess(CrawlerQueueV2Attempt attempt) {
        if (attempt.pid() == null || attempt.processStartedAt() == null) {
            return new CrawlerAttemptProcessLauncher.ProcessLookup(
                CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND,
                null
            );
        }
        return launcher.findExact(new CrawlerAttemptProcessLauncher.ProcessIdentity(
            attempt.pid(),
            attempt.processStartedAt()
        ));
    }

    private Map<String, String> launchEnvironment(CrawlerQueueV2Attempt attempt) {
        Map<String, String> environment = new LinkedHashMap<>();
        environment.put("WORKTREE_ROOT", repoRoot.toString());
        environment.put("TERRAPEDIA_CRAWLER_ACTION_ID", attempt.actionId());
        environment.put("TERRAPEDIA_CRAWLER_QUEUE_ID", attempt.queueId());
        environment.put("TERRAPEDIA_CRAWLER_ATTEMPT_ID", attempt.attemptId());
        environment.put("TERRAPEDIA_CRAWLER_FENCE_TOKEN", Long.toString(attempt.fenceToken()));
        environment.put("TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH", attempt.stateStoreEpoch());
        environment.put("TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION", Long.toString(attempt.stateVersion()));
        environment.put("TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE", Long.toString(attempt.progressSequence()));
        environment.put("TERRAPEDIA_CRAWLER_PROGRESS_PATH", attempt.artifacts().progressPath());
        return environment;
    }

    private CrawlerQueueV2Attempt requireCurrentSnapshot(
        CrawlerQueueV2Attempt request,
        CrawlerQueueV2Status requiredStatus
    ) {
        CrawlerQueueV2Attempt current = loadCurrentAttempt(request.attemptId());
        if (request.status() != requiredStatus
            || current.status() != requiredStatus
            || !sameSnapshotIdentity(request, current)
            || request.stateVersion() != current.stateVersion()
            || !Objects.equals(request.pid(), current.pid())
            || !Objects.equals(request.processStartedAt(), current.processStartedAt())) {
            throw new IllegalStateException("crawler attempt snapshot 已过期：" + request.attemptId());
        }
        return current;
    }

    private CrawlerQueueV2Attempt loadCurrentAttempt(String attemptId) {
        CrawlerQueueV2Repository.EngineState engine = repository.readEngineState();
        if (engine.mode() != CrawlerQueueEngineMode.V2
            || engine.stateStoreEpoch() == null
            || engine.stateStoreEpoch().isBlank()) {
            throw new IllegalStateException("V2 engine/epoch 当前不可控制");
        }
        CrawlerQueueV2Attempt current = repository.findAttempt(attemptId)
            .orElseThrow(() -> new IllegalStateException("V2 attempt 不存在：" + attemptId));
        requireAttempt(current);
        if (!Objects.equals(engine.stateStoreEpoch(), current.stateStoreEpoch())) {
            throw new IllegalStateException("V2 attempt epoch 不是当前 engine epoch");
        }
        return current;
    }

    private boolean sameSnapshotIdentity(
        CrawlerQueueV2Attempt request,
        CrawlerQueueV2Attempt current
    ) {
        return request.contractVersion() == current.contractVersion()
            && Objects.equals(request.stateStoreEpoch(), current.stateStoreEpoch())
            && Objects.equals(request.queueId(), current.queueId())
            && Objects.equals(request.attemptId(), current.attemptId())
            && Objects.equals(request.fenceToken(), current.fenceToken())
            && Objects.equals(request.lane(), current.lane())
            && Objects.equals(request.domain(), current.domain())
            && Objects.equals(request.coveredDomains(), current.coveredDomains())
            && Objects.equals(request.actionId(), current.actionId());
    }

    private boolean progressIdentityMatches(
        CrawlerQueueV2Attempt current,
        CrawlerAttemptProgressPayload payload
    ) {
        return Objects.equals(current.queueId(), payload.queueId())
            && Objects.equals(current.attemptId(), payload.attemptId())
            && Objects.equals(current.fenceToken(), payload.fenceToken())
            && Objects.equals(current.stateStoreEpoch(), payload.stateStoreEpoch());
    }

    private void appendStaleProgressEvent(CrawlerQueueV2Attempt current) {
        repository.appendEvent(new CrawlerQueueV2Event(
            "attempt.progress-rejected",
            current.stateStoreEpoch(),
            current.queueId(),
            current.attemptId(),
            current.fenceToken(),
            current.stateVersion(),
            current.status(),
            CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN,
            clock.instant()
        ));
    }

    private void cleanupStoppedLaunch(
        CrawlerAttemptProcessLauncher.ManagedProcess process,
        String attemptId,
        RuntimeException originalFailure
    ) {
        if (terminateStoppedLaunch(process)) {
            return;
        }
        IllegalStateException unconfirmed = new IllegalStateException(
            "失败 launch 的进程终止未确认：" + attemptId
        );
        if (originalFailure != null) {
            unconfirmed.addSuppressed(originalFailure);
        }
        throw unconfirmed;
    }

    private void compensatePostCasLaunchFailure(
        CrawlerQueueV2Attempt recorded,
        CrawlerAttemptProcessLauncher.ManagedProcess process,
        RuntimeException originalFailure
    ) {
        boolean exitConfirmed = terminateStoppedLaunch(process);
        CrawlerQueueV2Attempt authority = recorded;
        for (int mutationAttempt = 0; mutationAttempt < 2; mutationAttempt++) {
            if (!sameLaunchCompensationAuthority(recorded, authority)) {
                return;
            }
            try {
                CrawlerQueueV2Attempt failed = mutate(
                    authority,
                    CrawlerQueueV2Status.FAILED,
                    exitConfirmed ? null : CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
                    null,
                    authority.lastHeartbeatAt(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    exitConfirmed,
                    exitConfirmed ? null : properties.getUnconfirmedProcessIsolation(),
                    "attempt.transitioned"
                );
                writeManifest(failed, null);
                return;
            } catch (CrawlerQueueV2Exception compensationFailure) {
                if (compensationFailure.reasonCode() != CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
                    || mutationAttempt > 0) {
                    originalFailure.addSuppressed(compensationFailure);
                    return;
                }
                try {
                    authority = repository.findAttempt(recorded.attemptId()).orElse(null);
                } catch (RuntimeException reloadFailure) {
                    originalFailure.addSuppressed(reloadFailure);
                    return;
                }
                if (authority == null) {
                    return;
                }
            } catch (RuntimeException compensationFailure) {
                originalFailure.addSuppressed(compensationFailure);
                return;
            }
        }
    }

    private boolean sameLaunchCompensationAuthority(
        CrawlerQueueV2Attempt recorded,
        CrawlerQueueV2Attempt current
    ) {
        return current != null
            && !current.status().terminal()
            && current.status() != CrawlerQueueV2Status.CANCEL_REQUESTED
            && Objects.equals(recorded.stateStoreEpoch(), current.stateStoreEpoch())
            && Objects.equals(recorded.queueId(), current.queueId())
            && Objects.equals(recorded.attemptId(), current.attemptId())
            && Objects.equals(recorded.fenceToken(), current.fenceToken())
            && Objects.equals(recorded.pid(), current.pid())
            && Objects.equals(recorded.processStartedAt(), current.processStartedAt());
    }

    private void compensatePreReturnLaunchFailure(
        CrawlerQueueV2Attempt current,
        CrawlerAttemptProcessLauncher.LaunchFailureException launchFailure
    ) {
        try {
            CrawlerQueueV2Attempt authority = current;
            if (!launchFailure.cleanupConfirmed()
                && launchFailure.pid() != null
                && launchFailure.processStartedAt() != null) {
                authority = mutate(
                    current,
                    CrawlerQueueV2Status.STARTING,
                    null,
                    current.deadlineAt(),
                    current.lastHeartbeatAt(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    launchFailure.pid(),
                    launchFailure.processStartedAt(),
                    false,
                    null,
                    "attempt.process-started"
                );
                try {
                    writeManifest(authority, null);
                } catch (RuntimeException manifestFailure) {
                    launchFailure.addSuppressed(manifestFailure);
                }
            }
            CrawlerQueueV2Attempt failed = mutate(
                authority,
                CrawlerQueueV2Status.FAILED,
                launchFailure.cleanupConfirmed()
                    ? null
                    : CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
                null,
                authority.lastHeartbeatAt(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                launchFailure.cleanupConfirmed(),
                launchFailure.cleanupConfirmed()
                    ? null
                    : properties.getUnconfirmedProcessIsolation(),
                "attempt.transitioned"
            );
            try {
                writeManifest(failed, null);
            } catch (RuntimeException manifestFailure) {
                launchFailure.addSuppressed(manifestFailure);
            }
        } catch (RuntimeException compensationFailure) {
            launchFailure.addSuppressed(compensationFailure);
        }
    }

    private boolean terminateStoppedLaunch(CrawlerAttemptProcessLauncher.ManagedProcess process) {
        if (process == null || process.startedAt() == null || process.pid() < 1L) {
            return false;
        }
        CrawlerAttemptProcessLauncher.ProcessLookup lookup = launcher.findExact(
            new CrawlerAttemptProcessLauncher.ProcessIdentity(process.pid(), process.startedAt())
        );
        if (lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND
            || lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.START_TIME_MISMATCH) {
            return true;
        }
        if (lookup.code() != CrawlerAttemptProcessLauncher.LookupCode.FOUND) {
            return false;
        }
        launcher.terminateForcibly(lookup.process());
        return launcher.awaitExit(lookup.process(), properties.getForcedTerminationWait());
    }

    private boolean terminateFailedLaunch(CrawlerAttemptProcessLauncher.ManagedProcess process) {
        if (process == null || process.startedAt() == null || process.pid() < 1L) {
            return false;
        }
        CrawlerAttemptProcessLauncher.ProcessLookup lookup = launcher.findExact(
            new CrawlerAttemptProcessLauncher.ProcessIdentity(process.pid(), process.startedAt())
        );
        if (lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND
            || lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.START_TIME_MISMATCH) {
            return true;
        }
        if (lookup.code() != CrawlerAttemptProcessLauncher.LookupCode.FOUND) {
            return false;
        }
        launcher.terminateGracefully(lookup.process());
        if (launcher.awaitExit(lookup.process(), properties.getGracefulTerminationWait())) {
            return true;
        }
        launcher.terminateForcibly(lookup.process());
        return launcher.awaitExit(lookup.process(), properties.getForcedTerminationWait());
    }

    private CrawlerQueueV2Attempt mutate(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status targetStatus,
        CrawlerQueueV2ReasonCode reasonCode,
        Instant deadlineAt,
        Instant lastHeartbeatAt,
        Long progressSequence,
        String phase,
        Long current,
        Long total,
        String workerMessage,
        Long pid,
        Instant processStartedAt,
        boolean releaseOwnership,
        java.time.Duration retainedOwnershipTtl,
        String eventType
    ) {
        CrawlerQueueV2Queue queue = repository.findQueue(attempt.queueId())
            .orElseThrow(() -> new IllegalStateException("V2 queue 不存在：" + attempt.queueId()));
        return repository.mutate(new CrawlerQueueV2Repository.MutationCommand(
            attempt.stateStoreEpoch(),
            attempt.queueId(),
            attempt.attemptId(),
            attempt.lane(),
            queue.dedupeKey(),
            attempt.coveredDomains(),
            attempt.fenceToken(),
            attempt.stateVersion(),
            targetStatus,
            reasonCode,
            clock.instant(),
            deadlineAt,
            lastHeartbeatAt,
            progressSequence,
            phase,
            current,
            total,
            workerMessage,
            pid,
            processStartedAt,
            releaseOwnership,
            retainedOwnershipTtl,
            eventType
        )).attempt();
    }

    private Path resolveAttemptPath(CrawlerQueueV2Attempt attempt, String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            throw new IllegalArgumentException("attempt artifact path 不能为空");
        }
        Path resolved = repoRoot.resolve(storedPath).toAbsolutePath().normalize();
        if (!resolved.startsWith(repoRoot)
            || !resolved.toString().contains(java.io.File.separator + attempt.attemptId()
                + java.io.File.separator)) {
            throw new SecurityException("attempt artifact path 不属于当前 attempt");
        }
        return resolved;
    }

    private CrawlerAttemptManifest requireExactManifest(CrawlerQueueV2Attempt attempt) {
        CrawlerAttemptManifest manifest = artifactStore.readManifest(attempt.attemptId())
            .orElseThrow(() -> new IllegalArgumentException(
                "attempt manifest 不存在：" + attempt.attemptId()
            ));
        if (manifest.contractVersion() != 2
            || !Objects.equals(manifest.stateStoreEpoch(), attempt.stateStoreEpoch())
            || !Objects.equals(manifest.queueId(), attempt.queueId())
            || !Objects.equals(manifest.attemptId(), attempt.attemptId())
            || (manifest.fenceToken() != null
                && !Objects.equals(manifest.fenceToken(), attempt.fenceToken()))
            || !Objects.equals(manifest.domain(), attempt.domain())
            || !Objects.equals(manifest.actionId(), attempt.actionId())) {
            throw new SecurityException("attempt manifest 身份与 STARTING attempt 不一致");
        }
        CrawlerQueueV2Artifacts artifacts = attempt.artifacts();
        if (!Objects.equals(manifest.progressPath(), artifacts.progressPath())
            || !Objects.equals(manifest.logPath(), artifacts.logPath())
            || !Objects.equals(manifest.reportPath(), artifacts.reportPath())
            || !Objects.equals(manifest.outputPath(), artifacts.outputPath())) {
            throw new SecurityException("attempt artifacts 与 exact manifest 不一致");
        }
        return manifest;
    }

    private void writeManifest(CrawlerQueueV2Attempt attempt, Integer exitCode) {
        artifactStore.readManifest(attempt.attemptId()).ifPresent(existing ->
            artifactStore.writeManifest(new CrawlerAttemptManifest(
                existing.contractVersion(), existing.stateStoreEpoch(), existing.queueId(), existing.attemptId(),
                attempt.fenceToken(), existing.domain(), existing.actionId(), attempt.status(), attempt.startedAt(),
                attempt.completedAt(), attempt.reasonCode(), exitCode == null ? existing.exitCode() : exitCode,
                attempt.pid(), attempt.processStartedAt(), existing.progressPath(), existing.logPath(),
                existing.reportPath(), existing.outputPath(),
                existing.retentionExpiresAt(), existing.artifactsExpiredAt(), existing.cleanedAt(),
                existing.cleanedBy(), existing.cleanedPaths()
            ))
        );
    }

    private void requireAttempt(CrawlerQueueV2Attempt attempt) {
        Objects.requireNonNull(attempt, "attempt");
        if (attempt.contractVersion() != 2
            || attempt.fenceToken() == null
            || attempt.fenceToken() < 1L
            || attempt.stateStoreEpoch() == null
            || attempt.stateStoreEpoch().isBlank()) {
            throw new IllegalArgumentException("crawler attempt V2 身份无效");
        }
    }

    public enum ProgressCode {
        ACCEPTED,
        NO_PROGRESS,
        REJECTED_STALE_IDENTITY,
        REJECTED_SEQUENCE,
        RETRY_REQUIRED,
        INVALID_PAYLOAD
    }

    public record ProgressResult(ProgressCode code, CrawlerQueueV2Attempt attempt) {}

    public enum TerminationCode {
        CONFIRMED,
        UNCONFIRMED
    }

    public record TerminationResult(TerminationCode code) {
        public static TerminationResult confirmed() {
            return new TerminationResult(TerminationCode.CONFIRMED);
        }

        public static TerminationResult unconfirmed() {
            return new TerminationResult(TerminationCode.UNCONFIRMED);
        }

        public boolean isConfirmed() {
            return code == TerminationCode.CONFIRMED;
        }
    }

    private record LaunchIdentity(
        String stateStoreEpoch,
        String queueId,
        String attemptId,
        Long fenceToken,
        long pid,
        Instant processStartedAt
    ) {
        private boolean matches(CrawlerQueueV2Attempt attempt) {
            return Objects.equals(stateStoreEpoch, attempt.stateStoreEpoch())
                && Objects.equals(queueId, attempt.queueId())
                && Objects.equals(attemptId, attempt.attemptId())
                && Objects.equals(fenceToken, attempt.fenceToken())
                && Objects.equals(pid, attempt.pid())
                && Objects.equals(processStartedAt, attempt.processStartedAt());
        }
    }

    private static final class LockEntry {
        private final ReentrantLock lock = new ReentrantLock();
        private int references;
    }
}
