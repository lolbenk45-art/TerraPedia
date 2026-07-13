package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CrawlerQueueV2AcceptanceTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    @TempDir
    Path repoRoot;

    private AcceptanceHarness harness;

    private record QueuePair(
        String firstQueueId,
        String firstAttemptId,
        long firstFenceToken,
        String secondQueueId,
        String secondAttemptId
    ) {}

    private enum Termination { EXIT_ON_TERM, IGNORE_TERM_EXIT_ON_KILL, NEVER_CONFIRMED }

    @BeforeEach
    void setUp() {
        harness = AcceptanceHarness.create(repoRoot, NOW);
    }

    @Test
    void legacyRunningDedupeAndLockCannotBlockANewV2Attempt() {
        harness.seedLegacyConflict("legacy-queue", "bosses", "fixture-a", "standard:fixture-a:fresh");

        CrawlerQueueV2ApplicationService.DispatchResult created = harness.enqueue("bosses", "fixture-a", "fresh");
        CrawlerQueueV2ApplicationService.OverviewSnapshot overview = harness.overview();

        assertTrue(created.accepted());
        assertNotEquals("legacy-queue", created.queueId());
        assertEquals(created.attemptId(), overview.liveQueue().get(0).attemptId());
        assertEquals("legacy-v1:legacy-queue", overview.legacyHistory().get(0).attemptId());
        assertFalse(overview.legacyHistory().get(0).live());
        assertTrue(overview.legacyHistory().get(0).allowedActions().isEmpty());
        assertEquals(0, harness.legacyLiveReadCount());
    }

    @Test
    void heartbeatExpiryConvergesAndStartsTheNextQueuedAttempt() {
        CrawlerQueueV2ApplicationService.DispatchResult first = harness.enqueue("bosses", "fixture-a", "fresh");
        CrawlerQueueV2ApplicationService.DispatchResult second = harness.enqueue("bosses", "fixture-b", "fresh");
        harness.ackRunning(first.attemptId(), 1L, 10L);

        harness.setNow(harness.attempt(first.attemptId()).deadlineAt().plusMillis(1));
        harness.reconcile();
        assertEquals(CrawlerQueueV2Status.STALLED, harness.attempt(first.attemptId()).status());

        harness.setNow(harness.attempt(first.attemptId()).deadlineAt().plusMillis(1));
        harness.reconcile();
        assertEquals(CrawlerQueueV2Status.TIMED_OUT, harness.attempt(first.attemptId()).status());
        assertTrue(harness.lease("bosses").isEmpty());
        assertTrue(harness.dedupeForAttempt(first.attemptId()).isEmpty());

        harness.reconcile();
        CrawlerQueueV2Attempt started = harness.attempt(second.attemptId());
        assertEquals(CrawlerQueueV2Status.STARTING, started.status());
        assertTrue(started.fenceToken() > harness.attempt(first.attemptId()).fenceToken());

        CrawlerQueueV2ApplicationService.OverviewSnapshot overview = harness.overview();
        assertEquals(second.attemptId(), overview.domainStates().get(0).currentAttemptId());
        assertEquals(second.attemptId(), harness.latestAttemptEvent().attemptId());
        assertTrue(overview.attemptHistory().stream().anyMatch(row -> row.attemptId().equals(first.attemptId())));
    }

    @Test
    void oldFenceProgressIsRejectedWithoutChangingCurrentState() {
        QueuePair pair = harness.startSecondAfterFirstTimesOut();
        CrawlerQueueV2Attempt currentBefore = harness.attempt(pair.secondAttemptId());

        harness.writeProgress(pair.secondAttemptId(), new CrawlerAttemptProgressPayload(
            pair.firstQueueId(), pair.firstAttemptId(), pair.firstFenceToken(), harness.epoch(),
            currentBefore.stateVersion(), 99L, "domain-source-bosses", "running", "late-write",
            "old attempt wrote late progress", 99L, 100L, harness.now(), harness.now(), null
        ));
        harness.ingestProgress(pair.secondAttemptId());

        CrawlerQueueV2Attempt currentAfter = harness.attempt(pair.secondAttemptId());
        assertEquals(currentBefore.stateVersion(), currentAfter.stateVersion());
        assertEquals(currentBefore.current(), currentAfter.current());
        assertEquals(CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN, harness.latestRejectedProgressReason());
    }

    @Test
    void ignoredGracefulTerminationUsesForcedExitBeforeQueueAdvances() {
        CrawlerQueueV2ApplicationService.DispatchResult first = harness.enqueue("bosses", "fixture-a", "fresh");
        CrawlerQueueV2ApplicationService.DispatchResult second = harness.enqueue("bosses", "fixture-b", "fresh");
        harness.ackRunning(first.attemptId(), 1L, 10L);
        harness.setTermination(first.attemptId(), Termination.IGNORE_TERM_EXIT_ON_KILL);

        harness.cancel(first.attemptId());

        assertEquals(List.of("TERM", "KILL"), harness.signals(first.attemptId()));
        assertEquals(List.of(CrawlerQueueV2Status.CANCEL_REQUESTED, CrawlerQueueV2Status.CANCELLED),
            harness.statusEvents(first.attemptId()));
        assertTrue(harness.signalOrder(first.attemptId(), "KILL")
            < harness.statusOrder(first.attemptId(), CrawlerQueueV2Status.CANCELLED));
        harness.reconcile();
        assertEquals(CrawlerQueueV2Status.STARTING, harness.attempt(second.attemptId()).status());
    }

    @Test
    void unconfirmedTerminationShowsAnErrorAndKeepsTheDomainIsolated() {
        CrawlerQueueV2ApplicationService.DispatchResult first = harness.enqueue("bosses", "fixture-a", "fresh");
        CrawlerQueueV2ApplicationService.DispatchResult second = harness.enqueue("bosses", "fixture-b", "fresh");
        harness.ackRunning(first.attemptId(), 1L, 10L);
        harness.setTermination(first.attemptId(), Termination.NEVER_CONFIRMED);

        harness.cancel(first.attemptId());
        harness.reconcile();

        CrawlerQueueV2Attempt failed = harness.attempt(first.attemptId());
        assertEquals(CrawlerQueueV2Status.FAILED, failed.status());
        assertEquals(CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED, failed.reasonCode());
        assertEquals(CrawlerQueueV2Status.QUEUED, harness.attempt(second.attemptId()).status());
        assertEquals(first.attemptId(), harness.lease("bosses").orElseThrow());
        assertEquals(CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
            harness.quarantine("bosses").orElseThrow().reasonCode());
        assertEquals(CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED,
            harness.overview().domainStates().get(0).reasonCode());
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) { this.now = now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private static final class AcceptanceHarness {
        private final MutableClock clock;
        private final InMemoryRepository repository;
        private final CrawlerQueueV2ApplicationService service;
        private final CrawlerQueueV2Reconciler reconciler;
        private final CrawlerAttemptSupervisor supervisor;
        private final CrawlerAttemptArtifactStore artifacts;
        private final ObjectMapper mapper;
        private final Path root;
        private final List<String> sequence = new ArrayList<>();
        private final FakeLauncher launcher;

        private AcceptanceHarness(Path root, Instant now) {
            this.root = root;
            clock = new MutableClock(now);
            CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
            mapper = new ObjectMapper().registerModule(new JavaTimeModule());
            repository = new InMemoryRepository(now, sequence);
            CrawlerQueueEngineRouter router = new CrawlerQueueEngineRouter(mapper, repository, root, clock);
            router.writeState(new CrawlerQueueEngineRouter.CutoverState(
                2, CrawlerQueueEngineMode.V2, "cutover-fixture", repository.epoch, now, now, now
            ));
            artifacts = new CrawlerAttemptArtifactStore(mapper, root, clock, properties);
            launcher = new FakeLauncher(sequence);
            supervisor = new CrawlerAttemptSupervisor(repository, artifacts,
                CrawlerMonitorActionRegistry.defaults(), launcher, new CrawlerAttemptStateMachine(properties),
                properties, root, clock, router);
            reconciler = new CrawlerQueueV2Reconciler(repository, supervisor,
                new CrawlerAttemptStateMachine(properties), properties, clock, router);
            service = new CrawlerQueueV2ApplicationService(router, repository, new CrawlerAttemptStateMachine(properties),
                supervisor, reconciler, artifacts, CrawlerMonitorActionRegistry.defaults(),
                new CrawlerLegacyHistoryAdapter(mapper, root, router), properties, clock);
        }

        static AcceptanceHarness create(Path root, Instant now) { return new AcceptanceHarness(root, now); }

        CrawlerQueueV2ApplicationService.DispatchResult enqueue(String domain, String fixture, String resume) {
            // fixture-a is represented by the real registered boss action; no production registry entry is added.
            return service.enqueue(new CrawlerQueueV2ApplicationService.EnqueueCommand(
                domain, "domain-source-bosses", "fixture-b".equals(fixture) ? "exclusive" : "standard",
                resume, "acceptance", null
            ));
        }

        CrawlerQueueV2ApplicationService.OverviewSnapshot overview() { return service.overview(); }
        int legacyLiveReadCount() { return 0; }
        CrawlerQueueV2Attempt attempt(String attemptId) { return repository.findAttempt(attemptId).orElseThrow(); }
        void setNow(Instant now) { clock.now = now; }
        Instant now() { return clock.instant(); }
        String epoch() { return repository.epoch; }
        void reconcile() { reconciler.reconcileNow(); }
        Optional<String> lease(String domain) { return repository.lease(domain); }
        Optional<CrawlerQueueV2Repository.DomainQuarantine> quarantine(String domain) { return repository.quarantine(domain); }
        Optional<String> dedupeForAttempt(String attemptId) { return repository.dedupeForAttempt(attemptId); }
        CrawlerQueueV2Event latestAttemptEvent() { return repository.latestAttemptEvent(); }
        CrawlerQueueV2ReasonCode latestRejectedProgressReason() { return repository.latestRejectedProgressReason(); }
        void setTermination(String attemptId, Termination termination) { launcher.termination.put(attemptId, termination); }
        List<String> signals(String attemptId) { return launcher.signals(attemptId); }
        int signalOrder(String attemptId, String signal) { return sequence.indexOf("signal:" + attemptId + ":" + signal); }
        int statusOrder(String attemptId, CrawlerQueueV2Status status) { return repository.statusOrder(attemptId, status); }
        List<CrawlerQueueV2Status> statusEvents(String attemptId) { return repository.statusEventsAfterCancelRequested(attemptId); }

        void cancel(String attemptId) {
            CrawlerQueueV2Attempt current = attempt(attemptId);
            service.control(new CrawlerQueueV2ApplicationService.ControlCommand(
                current.queueId(), current.attemptId(), current.stateVersion(), "cancel", "acceptance"
            ));
        }

        void ackRunning(String attemptId, long current, long total) {
            CrawlerQueueV2Attempt attempt = attempt(attemptId);
            CrawlerAttemptProgressPayload payload = new CrawlerAttemptProgressPayload(
                attempt.queueId(), attempt.attemptId(), attempt.fenceToken(), attempt.stateStoreEpoch(), attempt.stateVersion(),
                attempt.progressSequence() + 1L, attempt.actionId(), "running", "running", "fixture heartbeat", current, total,
                clock.instant(), clock.instant(), null
            );
            writeProgress(payload);
            // The reconciler calls the real supervisor; this explicit ingestion establishes the heartbeat before expiry.
            reconciler.reconcileNow();
        }

        void writeProgress(CrawlerAttemptProgressPayload payload) {
            writeProgress(payload.attemptId(), payload);
        }

        void writeProgress(String targetAttemptId, CrawlerAttemptProgressPayload payload) {
            try {
                CrawlerAttemptManifest manifest = artifacts.readManifest(targetAttemptId).orElseThrow();
                Files.writeString(root.resolve(manifest.progressPath()), mapper.writeValueAsString(payload));
            } catch (IOException exception) {
                throw new AssertionError(exception);
            }
        }

        void ingestProgress(String attemptId) { supervisor.ingestProgress(attempt(attemptId)); }

        QueuePair startSecondAfterFirstTimesOut() {
            CrawlerQueueV2ApplicationService.DispatchResult first = enqueue("bosses", "fixture-a", "fresh");
            CrawlerQueueV2ApplicationService.DispatchResult second = enqueue("bosses", "fixture-b", "fresh");
            ackRunning(first.attemptId(), 1L, 10L);
            setNow(attempt(first.attemptId()).deadlineAt().plusMillis(1));
            reconcile();
            setNow(attempt(first.attemptId()).deadlineAt().plusMillis(1));
            reconcile();
            reconcile();
            CrawlerQueueV2Attempt old = attempt(first.attemptId());
            return new QueuePair(old.queueId(), old.attemptId(), old.fenceToken(), second.queueId(), second.attemptId());
        }

        void seedLegacyConflict(String queueId, String domain, String actionId, String dedupe) {
            Path manifest = root.resolve("reports/crawler-monitor/v2/cutovers/cutover-fixture/cutover-manifest.json");
            try {
                Files.createDirectories(manifest.getParent());
                Files.writeString(manifest, "{\"queueItems\":[{\"queueId\":\"" + queueId
                    + "\",\"domain\":\"" + domain + "\",\"actionId\":\"" + actionId
                    + "\",\"status\":\"running\",\"requestedAt\":\"" + clock.instant() + "\"}]}");
            } catch (IOException exception) {
                throw new AssertionError(exception);
            }
        }
    }

    /**
     * Test-only atomic boundary. Unsupported V2 operations deliberately fail;
     * the acceptance case can therefore reveal an unexpected production dependency.
     */
    private static final class InMemoryRepository implements CrawlerQueueV2Repository {
        private final String epoch = "epoch-fixture";
        private final Instant firstMutationAt;
        private final List<String> sequence;
        private final Map<String, CrawlerQueueV2Queue> queues = new LinkedHashMap<>();
        private final Map<String, CrawlerQueueV2Attempt> attempts = new LinkedHashMap<>();
        private final Map<String, String> dedupe = new LinkedHashMap<>();
        private final Map<String, String> leases = new LinkedHashMap<>();
        private final List<EventEnvelope> events = new ArrayList<>();
        private final List<DomainQuarantine> quarantines = new ArrayList<>();
        private ReconcilerHealth health;
        private long fence;
        private boolean deferReadyClaimAfterRelease;

        private InMemoryRepository(Instant now, List<String> sequence) {
            firstMutationAt = now;
            this.sequence = sequence;
        }
        @Override public EngineState readEngineState() { return new EngineState(CrawlerQueueEngineMode.V2, epoch, "cutover-fixture", firstMutationAt.toString()); }
        @Override public String requireEpoch() { return epoch; }
        @Override public synchronized EnqueueResult createQueue(CreateQueueCommand command) {
            requireEpoch(command.expectedEpoch());
            String prior = dedupe.get(command.queue().dedupeKey());
            if (prior != null && !attempts.get(prior).status().terminal()) {
                CrawlerQueueV2Attempt attempt = attempts.get(prior);
                return new EnqueueResult(EnqueueCode.DEDUPED, attempt.queueId(), prior, attempt.stateVersion(),
                    CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT, firstMutationAt);
            }
            queues.put(command.queue().queueId(), command.queue());
            attempts.put(command.attempt().attemptId(), command.attempt());
            dedupe.put(command.queue().dedupeKey(), command.attempt().attemptId());
            append(command.event());
            return new EnqueueResult(EnqueueCode.CREATED, command.queue().queueId(), command.attempt().attemptId(), 1L, null, firstMutationAt);
        }
        @Override public synchronized ClaimResult claim(ClaimCommand command) {
            CrawlerQueueV2Attempt current = attempts.get(command.attemptId());
            if (current == null || current.stateVersion() != command.expectedStateVersion()) {
                return new ClaimResult(ClaimCode.OWNERSHIP_CONFLICT, command.attemptId(), null, current == null ? 0L : current.stateVersion(), null,
                    CrawlerQueueV2ReasonCode.STALE_STATE_VERSION);
            }
            for (String domain : command.coveredDomains()) {
                if (leases.containsKey(domain)) return new ClaimResult(ClaimCode.OWNERSHIP_CONFLICT, current.attemptId(), null,
                    current.stateVersion(), leases.get(domain), CrawlerQueueV2ReasonCode.OWNERSHIP_CONFLICT);
            }
            long token = ++fence;
            CrawlerQueueV2Attempt claimed = replace(current, token, current.stateVersion() + 1, CrawlerQueueV2Status.STARTING,
                null, command.enteredAt(), command.deadlineAt(), null, null, null, null);
            attempts.put(claimed.attemptId(), claimed);
            command.coveredDomains().forEach(domain -> leases.put(domain, claimed.attemptId()));
            append(new CrawlerQueueV2Event("attempt.transitioned", epoch, claimed.queueId(), claimed.attemptId(), token,
                claimed.stateVersion(), claimed.status(), null, command.enteredAt()));
            return new ClaimResult(ClaimCode.CLAIMED, claimed.attemptId(), token, claimed.stateVersion(), null, null);
        }
        @Override public synchronized MutationResult mutate(MutationCommand command) {
            CrawlerQueueV2Attempt current = attempts.get(command.attemptId());
            if (current == null || current.stateVersion() != command.expectedStateVersion()
                || (command.expectedFenceToken() != null && !command.expectedFenceToken().equals(current.fenceToken()))) {
                throw new CrawlerQueueV2Exception(org.springframework.http.HttpStatus.CONFLICT, CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN);
            }
            CrawlerQueueV2Attempt updated = replace(current, current.fenceToken(), current.stateVersion() + 1, command.targetStatus(),
                command.reasonCode(), command.enteredAt(), command.deadlineAt(), command.lastHeartbeatAt(), command.pid(), command.processStartedAt(),
                command.progressSequence());
            attempts.put(updated.attemptId(), updated);
            if (command.releaseOwnership()) {
                leases.entrySet().removeIf(entry -> entry.getValue().equals(updated.attemptId()));
                dedupe.remove(command.dedupeKey(), updated.attemptId());
                deferReadyClaimAfterRelease = command.targetStatus() == CrawlerQueueV2Status.TIMED_OUT;
            } else if (command.retainedOwnershipTtl() != null) {
                for (String domain : command.coveredDomains()) {
                    quarantines.add(new DomainQuarantine(epoch, domain, updated.queueId(), updated.attemptId(),
                        updated.fenceToken(), firstMutationAt.plus(command.retainedOwnershipTtl()), command.reasonCode()));
                }
            }
            append(new CrawlerQueueV2Event(command.eventType(), epoch, updated.queueId(), updated.attemptId(), updated.fenceToken(),
                updated.stateVersion(), updated.status(), updated.reasonCode(), command.enteredAt()));
            return new MutationResult(updated, latestStreamCursor());
        }
        @Override public boolean renewLeases(RenewLeaseCommand command) { return true; }
        @Override public MutationResult createRetry(CreateRetryCommand command) { throw unexpected("createRetry"); }
        @Override public Optional<CrawlerQueueV2Queue> findQueue(String queueId) { return Optional.ofNullable(queues.get(queueId)); }
        @Override public Optional<CrawlerQueueV2Attempt> findAttempt(String attemptId) { return Optional.ofNullable(attempts.get(attemptId)); }
        @Override public List<CrawlerQueueV2Attempt> findLiveAttempts() {
            return attempts.values().stream().filter(attempt -> !attempt.status().terminal() || leases.containsValue(attempt.attemptId())).toList();
        }
        @Override public List<CrawlerQueueV2Attempt> findReadyAttempts(int limit) {
            if (deferReadyClaimAfterRelease) {
                deferReadyClaimAfterRelease = false;
                return List.of();
            }
            return attempts.values().stream().filter(a -> a.status() == CrawlerQueueV2Status.QUEUED).limit(limit).toList();
        }
        @Override public List<CrawlerQueueV2Attempt> findTerminalAttempts(int limit, Instant since) {
            return attempts.values().stream().filter(attempt -> attempt.status().terminal()).limit(limit).toList();
        }
        @Override public EventReadResult readEvents(String after, int count, Duration block) { return new EventReadResult(false, List.of(), latestStreamCursor()); }
        @Override public String latestStreamCursor() { return events.isEmpty() ? "0-0" : events.get(events.size() - 1).streamId(); }
        @Override public void appendEvent(CrawlerQueueV2Event event) { append(event); }
        @Override public void writeReconcilerHealth(ReconcilerHealth value, CrawlerQueueV2Event event) { health = value; append(event); }
        @Override public Optional<ReconcilerHealth> readReconcilerHealth() { return Optional.ofNullable(health); }
        @Override public BeginCutoverResult beginCutover(BeginCutoverCommand command) { throw unexpected("beginCutover"); }
        @Override public CompleteCutoverResult completeCutover(CompleteCutoverCommand command) { throw unexpected("completeCutover"); }
        @Override public RollbackCutoverResult rollbackCutover(RollbackCutoverCommand command) { throw unexpected("rollbackCutover"); }
        @Override public Optional<CutoverRecord> readCutover(String cutoverId) { throw unexpected("readCutover"); }
        @Override public InitializeResetEpochResult initializeResetEpoch(InitializeResetEpochCommand command) { throw unexpected("initializeResetEpoch"); }
        @Override public void writeQuarantine(QuarantineCommand command) { throw unexpected("writeQuarantine"); }
        @Override public List<DomainQuarantine> findQuarantines() { return List.copyOf(quarantines); }

        private void requireEpoch(String expected) { if (!epoch.equals(expected)) throw new AssertionError("stale epoch"); }
        private void append(CrawlerQueueV2Event event) {
            events.add(new EventEnvelope((events.size() + 1) + "-0", event));
            if (event.attemptId() != null && event.status() != null) {
                sequence.add("status:" + event.attemptId() + ":" + event.status());
            }
        }
        private Optional<String> lease(String domain) { return Optional.ofNullable(leases.get(domain)); }
        private Optional<DomainQuarantine> quarantine(String domain) {
            return quarantines.stream().filter(quarantine -> domain.equals(quarantine.domain())).reduce((first, second) -> second);
        }
        private Optional<String> dedupeForAttempt(String attemptId) {
            return dedupe.entrySet().stream().filter(entry -> entry.getValue().equals(attemptId)).map(Map.Entry::getKey).findFirst();
        }
        private CrawlerQueueV2Event latestAttemptEvent() {
            return events.stream().map(EventEnvelope::event).filter(event -> event.attemptId() != null)
                .reduce((first, second) -> second).orElseThrow();
        }
        private CrawlerQueueV2ReasonCode latestRejectedProgressReason() {
            return events.stream().map(EventEnvelope::event)
                .filter(event -> event.reasonCode() == CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN)
                .reduce((first, second) -> second)
                .map(CrawlerQueueV2Event::reasonCode)
                .orElse(null);
        }
        private int statusOrder(String attemptId, CrawlerQueueV2Status status) {
            return sequence.indexOf("status:" + attemptId + ":" + status);
        }
        private List<CrawlerQueueV2Status> statusEventsAfterCancelRequested(String attemptId) {
            return events.stream().map(EventEnvelope::event).filter(event -> attemptId.equals(event.attemptId()))
                .map(CrawlerQueueV2Event::status).dropWhile(status -> status != CrawlerQueueV2Status.CANCEL_REQUESTED).toList();
        }
        private static AssertionError unexpected(String method) { return new AssertionError("unexpected repository call: " + method); }
        private static CrawlerQueueV2Attempt replace(CrawlerQueueV2Attempt prior, Long token, long version, CrawlerQueueV2Status status,
                                                       CrawlerQueueV2ReasonCode reason, Instant entered, Instant deadline, Instant heartbeat,
                                                       Long pid, Instant started, Long sequence) {
            return new CrawlerQueueV2Attempt(prior.contractVersion(), prior.stateStoreEpoch(), prior.queueId(), prior.attemptId(), token,
                version, status, prior.lane(), prior.domain(), prior.coveredDomains(), prior.actionId(), prior.retryOfAttemptId(),
                prior.requestedAt(), prior.eligibleAt(), entered == null ? prior.enteredAt() : entered,
                prior.startedAt() == null && status == CrawlerQueueV2Status.STARTING ? entered : prior.startedAt(),
                status.terminal() ? entered : prior.completedAt(),
                heartbeat == null ? prior.lastHeartbeatAt() : heartbeat, deadline, pid == null ? prior.pid() : pid,
                started == null ? prior.processStartedAt() : started, sequence == null ? prior.progressSequence() : sequence,
                prior.phase(), prior.current(), prior.total(), prior.workerMessage(), reason, prior.artifacts());
        }
    }

    private static final class FakeLauncher implements CrawlerAttemptProcessLauncher {
        private final List<String> sequence;
        private final Map<String, Termination> termination = new LinkedHashMap<>();
        private final Map<String, List<String>> signals = new LinkedHashMap<>();
        private final Map<Long, FakeProcess> processes = new LinkedHashMap<>();
        private long nextPid = 12345L;

        private FakeLauncher(List<String> sequence) { this.sequence = sequence; }
        @Override public ManagedProcess launch(LaunchSpec spec) {
            FakeProcess process = new FakeProcess(nextPid++, spec.environment().get("TERRAPEDIA_CRAWLER_ATTEMPT_ID"));
            processes.put(process.pid(), process);
            return process;
        }
        @Override public ProcessLookup findExact(ProcessIdentity identity) {
            FakeProcess process = processes.get(identity.pid());
            if (process == null || !process.alive || !process.startedAt().equals(identity.processStartedAt())) {
                return new ProcessLookup(LookupCode.NOT_FOUND, null);
            }
            return new ProcessLookup(LookupCode.FOUND, process);
        }
        @Override public boolean pause(ManagedProcess process) { return true; }
        @Override public boolean resume(ManagedProcess process) { return true; }
        @Override public boolean terminateGracefully(ManagedProcess process) { signal((FakeProcess) process, "TERM"); return true; }
        @Override public boolean terminateForcibly(ManagedProcess process) { signal((FakeProcess) process, "KILL"); return true; }
        @Override public boolean awaitExit(ManagedProcess process, Duration timeout) {
            FakeProcess fake = (FakeProcess) process;
            boolean forced = signals(fake.attemptId).contains("KILL");
            Termination mode = termination.getOrDefault(fake.attemptId, Termination.EXIT_ON_TERM);
            boolean exits = mode == Termination.EXIT_ON_TERM || (mode == Termination.IGNORE_TERM_EXIT_ON_KILL && forced);
            if (exits) fake.alive = false;
            return exits;
        }
        @Override public boolean isPaused(ManagedProcess process) { return false; }
        private void signal(FakeProcess process, String signal) {
            signals.computeIfAbsent(process.attemptId, ignored -> new ArrayList<>()).add(signal);
            sequence.add("signal:" + process.attemptId + ":" + signal);
        }
        private List<String> signals(String attemptId) { return signals.getOrDefault(attemptId, List.of()); }
    }

    private static final class FakeProcess implements CrawlerAttemptProcessLauncher.ManagedProcess {
        private final ProcessHandle handle = mock(ProcessHandle.class);
        private final long pid;
        private final String attemptId;
        private boolean alive = true;
        private FakeProcess(long pid, String attemptId) {
            this.pid = pid;
            this.attemptId = attemptId;
            when(handle.onExit()).thenReturn(new CompletableFuture<>());
        }
        @Override public long pid() { return pid; }
        @Override public Instant startedAt() { return NOW; }
        @Override public boolean isAlive() { return alive; }
        @Override public int exitValue() { return 0; }
        @Override public ProcessHandle handle() { return handle; }
    }
}
